import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startFake, CANARY_SITE_KEY, CANARY_WEBSITE_ID } from './fake-server.mjs';
import { startSite, PLUGIN_VERSION } from './harness.mjs';

const REPORT = '/webhook/plugin-report';
const LICENSE = 'CANARY-LICENSE-DO-NOT-LEAK';
const ADMIN_MAIL = 'canary-admin@example.test';

let fake;
let site;

before( async () => {
	fake = await startFake();
	site = await startSite( {
		fake,
		defines: { DB_HOST: 'canary-db-host.invalid', DB_USER: 'canary_db_user', DB_NAME: 'canary_db_name' },
	} );
} );

after( async () => {
	await site?.stop();
	await fake?.stop();
} );

beforeEach( async () => {
	await site.reset();
} );

const send = ( hook = 'site_dispatch_daily' ) => site.php( `do_action( '${ hook }' ); return true;` );
const status = ( code ) => ( { status: code, body: '{"ok":false}' } );

async function report() {
	await site.connect();
	await send();
	const requests = fake.to( REPORT );
	assert.equal( requests.length, 1, 'exactly one report' );
	return { request: requests[ 0 ], text: requests[ 0 ].body.toString( 'utf8' ), data: JSON.parse( requests[ 0 ].body.toString( 'utf8' ) ) };
}

test( 'report reaches the server and the signature matches the key of the test vector', async () => {
	const { request } = await report();
	const expected = 'sha256=' + crypto.createHmac( 'sha256', CANARY_SITE_KEY ).update( request.body ).digest( 'hex' );
	assert.equal( request.method, 'POST' );
	assert.equal( request.headers[ 'x-mw-signature' ], expected );
	assert.equal( request.headers[ 'x-mw-site' ], CANARY_WEBSITE_ID );
	assert.equal( request.headers[ 'content-type' ], 'application/json' );
} );

test( 'report carries the contract fields and the plugin version', async () => {
	const { data } = await report();
	assert.deepEqual( Object.keys( data ), [
		'schema_version',
		'reporter_version',
		'website_id',
		'home_url',
		'generated_at',
		'core',
		'plugins_last_checked',
		'plugins',
		'themes_last_checked',
		'themes',
		'environment',
	] );
	assert.equal( data.schema_version, 1 );
	assert.equal( data.reporter_version, PLUGIN_VERSION );
	assert.equal( data.website_id, CANARY_WEBSITE_ID );
	assert.equal( data.home_url, site.url );
	assert.match( data.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/ );
	assert.ok( Math.abs( Date.parse( data.generated_at ) - Date.now() ) < 60000 );

	const canary = data.plugins.find( ( plugin ) => 'canary-plugin' === plugin.slug );
	assert.deepEqual( canary, {
		file: 'canary-plugin/canary-plugin.php',
		slug: 'canary-plugin',
		name: 'Canary Plugin',
		version: '3.2.1',
		active: false,
		wporg: false,
		update_known: false,
		update: null,
	} );
	const own = data.plugins.find( ( plugin ) => 'site-dispatch' === plugin.slug );
	assert.equal( own.active, true );
	assert.equal( own.version, PLUGIN_VERSION );
	assert.ok( data.themes.some( ( theme ) => theme.active ) );
} );

test( 'report is sent with tls check on and redirects off', async () => {
	const { request } = await report();
	assert.deepEqual( request.args, {
		sslverify: true,
		redirection: 0,
		timeout: 20,
		limit_response_size: 4097,
		reject_unsafe_urls: true,
	} );
} );

test( 'environment block contains only fields of the allowlist', async () => {
	const { data } = await report();
	const allowed = {
		wp: {
			locale: 'string',
			timezone: 'string',
			environment_type: 'string',
			https: 'boolean',
			debug: 'boolean',
			cron_disabled: 'boolean',
			object_cache: 'boolean',
			core_auto_updates: 'string',
			memory_limit: 'string',
		},
		php: {
			version: 'string',
			extensions: { imagick: 'boolean', sodium: 'boolean', intl: 'boolean', opcache: 'boolean' },
			memory_limit: 'string',
			max_execution_time: 'number',
			upload_max_filesize: 'string',
			post_max_size: 'string',
		},
		db: { type: 'string', version: 'string' },
		server: 'string',
	};
	const check = ( value, shape, where ) => {
		if ( 'string' === typeof shape ) {
			assert.equal( typeof value, shape, where );
			return;
		}
		assert.equal( typeof value, 'object', where );
		for ( const [ name, inner ] of Object.entries( value ) ) {
			assert.ok( name in shape, 'field outside of the allowlist: ' + where + '.' + name );
			check( inner, shape[ name ], where + '.' + name );
		}
	};
	check( data.environment, allowed, 'environment' );

	assert.equal( data.environment.wp.environment_type, 'production' );
	assert.match( data.environment.php.version, /^\d+\.\d+\.\d+$/ );
	assert.ok( [ 'off', 'minor', 'all' ].includes( data.environment.wp.core_auto_updates ) );
	assert.ok( [ 'mysql', 'mariadb' ].includes( data.environment.db.type ) );
	assert.deepEqual( Object.keys( data.environment.php.extensions ), [ 'imagick', 'sodium', 'intl', 'opcache' ] );
} );

test( 'site without a connection sends nothing', async () => {
	await send();
	assert.equal( fake.requests.length, 0 );
} );

test( 'site with a damaged state sends nothing', async () => {
	await site.connect( { key: CANARY_SITE_KEY.slice( 0, 63 ) } );
	await send();
	await site.connect( { key_version: '1' } );
	await send();
	await site.connect( { server_host: 'server.example.test/path' } );
	await send();
	assert.equal( fake.requests.length, 0 );
} );

test( 'changed home url stays silent', async () => {
	await site.connect();
	await site.php( `
		add_filter( 'home_url', static function () {
			return 'https://clone.example.test';
		} );
		do_action( 'site_dispatch_daily' );
		return true;
	` );
	assert.equal( fake.requests.length, 0 );
} );

test( 'home url that differs only by www still reports', async () => {
	await site.connect( { home_host: 'example.test' } );
	await site.php( `
		add_filter( 'home_url', static function () {
			return 'https://www.example.test';
		} );
		do_action( 'site_dispatch_daily' );
		return true;
	` );
	assert.equal( fake.to( REPORT ).length, 1 );
} );

test( 'license key and urls of the update data never appear in a report', async () => {
	await site.connect();
	await site.php( `
		$offer = (object) array(
			'id'           => 'canary.example.test/plugins/canary-plugin',
			'slug'         => 'canary-plugin',
			'plugin'       => 'canary-plugin/canary-plugin.php',
			'new_version'  => '3.2.4',
			'requires'     => '6.0',
			'requires_php' => '7.4',
			'tested'       => '6.8',
			'url'          => 'https://canary.example.test/info?license=${ LICENSE }',
			'package'      => 'https://canary.example.test/download.zip?key=${ LICENSE }',
			'license_key'  => '${ LICENSE }',
			'icons'        => array( '1x' => 'https://canary.example.test/icon.png' ),
			'banners'      => array( 'low' => 'https://canary.example.test/banner.png' ),
		);
		set_site_transient( 'update_plugins', (object) array(
			'last_checked' => 1767225600,
			'response'     => array( 'canary-plugin/canary-plugin.php' => $offer ),
			'no_update'    => array(),
		) );
		do_action( 'site_dispatch_daily' );
		return true;
	` );
	const requests = fake.to( REPORT );
	assert.equal( requests.length, 1 );
	const text = requests[ 0 ].body.toString( 'utf8' );
	const data = JSON.parse( text );
	const canary = data.plugins.find( ( plugin ) => 'canary-plugin' === plugin.slug );

	assert.deepEqual( canary.update, { new_version: '3.2.4', requires: '6.0', requires_php: '7.4', tested: '6.8' } );
	assert.equal( canary.update_known, true );
	assert.equal( data.plugins_last_checked, '2026-01-01T00:00:00Z' );
	assert.ok( ! text.includes( LICENSE ), 'license canary in the report' );
	assert.ok( ! text.includes( 'canary.example.test' ), 'url of the update data in the report' );
	assert.ok( ! JSON.stringify( data.plugins ).includes( 'http' ), 'a url inside plugins' );
} );

test( 'database host, database user, paths, salts and admin mail never appear in a report', async () => {
	await site.connect();
	const secrets = await site.php( `
		update_option( 'admin_email', '${ ADMIN_MAIL }' );
		$names = array( 'DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASSWORD', 'ABSPATH', 'WP_CONTENT_DIR', 'AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY', 'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT' );
		$found = array( 'admin_email' => get_option( 'admin_email' ), 'document_root' => isset( $_SERVER['DOCUMENT_ROOT'] ) ? (string) $_SERVER['DOCUMENT_ROOT'] : '' );
		foreach ( $names as $name ) {
			$found[ $name ] = defined( $name ) ? (string) constant( $name ) : '';
		}
		do_action( 'site_dispatch_daily' );
		return $found;
	` );
	const requests = fake.to( REPORT );
	assert.equal( requests.length, 1 );
	const text = requests[ 0 ].body.toString( 'utf8' );

	assert.equal( secrets.admin_email, ADMIN_MAIL );
	assert.equal( secrets.DB_HOST, 'canary-db-host.invalid', 'the canary constant is in place' );
	assert.equal( secrets.DB_USER, 'canary_db_user', 'the canary constant is in place' );
	let checked = 0;
	for ( const [ name, value ] of Object.entries( secrets ) ) {
		if ( value.length < 4 ) {
			continue;
		}
		checked++;
		assert.ok( ! text.includes( value ), name + ' in the report' );
	}
	assert.ok( checked >= 8, 'enough values were checked, got ' + checked );
	assert.ok( ! text.includes( '@' ), 'something that looks like a mail address in the report' );
} );

test( 'server error plans exactly one retry', async () => {
	await site.connect();
	fake.reportAnswer = status( 500 );
	await send();
	await send();
	const cron = await site.cron();
	assert.equal( fake.to( REPORT ).length, 2 );
	assert.equal( cron.site_dispatch_retry.length, 1 );
	assert.ok( cron.site_dispatch_retry[ 0 ] > 3500 && cron.site_dispatch_retry[ 0 ] <= 3600 );
} );

test( 'rate limit plans a retry', async () => {
	await site.connect();
	fake.reportAnswer = status( 429 );
	await send();
	assert.equal( ( await site.cron() ).site_dispatch_retry.length, 1 );
} );

test( 'rejected report plans no retry', async () => {
	await site.connect();
	fake.reportAnswer = status( 401 );
	await send();
	assert.equal( fake.to( REPORT ).length, 1 );
	assert.equal( ( await site.cron() ).site_dispatch_retry, undefined );
} );

test( 'failed retry plans no further retry', async () => {
	await site.connect();
	fake.reportAnswer = status( 500 );
	await send( 'site_dispatch_retry' );
	assert.equal( fake.to( REPORT ).length, 1 );
	assert.equal( ( await site.cron() ).site_dispatch_retry, undefined );
} );

test( 'accepted report plans no retry', async () => {
	await report();
	assert.equal( ( await site.cron() ).site_dispatch_retry, undefined );
} );

test( 'last report records time and status', async () => {
	await site.connect();
	fake.reportAnswer = status( 401 );
	await send();
	const seen = await site.php( `
		return array(
			'last'     => get_option( 'site_dispatch_last_report' ),
			'autoload' => array_key_exists( 'site_dispatch_last_report', wp_load_alloptions( true ) ),
			'now'      => time(),
		);
	` );
	assert.equal( seen.last.http_status, 401 );
	assert.ok( Math.abs( seen.last.at - seen.now ) < 30 );
	assert.equal( seen.autoload, false );
} );

test( 'connected site plans the daily report when an admin page loads', async () => {
	await site.connect();
	await site.php( `site_dispatch_schedule(); site_dispatch_schedule(); return true;` );
	const cron = await site.cron();
	assert.equal( cron.site_dispatch_daily.length, 1 );
	assert.ok( cron.site_dispatch_daily[ 0 ] > 200 && cron.site_dispatch_daily[ 0 ] <= 300 );
} );
