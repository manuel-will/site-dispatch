// Installing: the automatic updater and "update now" take the same checked way, and everything
// that does not pass leaves the installed version in place.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_HOST, RELEASE_HOST } from './fake-release.mjs';
import { SOURCE_ROOT } from './harness.mjs';
import { HOURS_72, INSTALLED, makeRelease, php, releaseAround, startUpdateSite, zipOf } from './update-kit.mjs';
import { testFiles } from '../../tools/build-test-zip.mjs';
import { releaseZip } from '../../tools/lib/release.mjs';

const FILE = 'site-dispatch/site-dispatch.php';
const REFUSED = 'site_dispatch_update_refused';
const ZIP_PATH = '/manuel-will/site-dispatch/releases/download/v0.1.1/site-dispatch-0.1.1.zip';

let ctx;
let site;
let release;
let fake;
let keys;
let admin;

before( async () => {
	ctx = await startUpdateSite();
	( { site, release, fake, keys } = ctx );
	admin = await site.login( 'administrator' );
} );

after( async () => {
	await ctx?.stop();
} );

beforeEach( async () => {
	await site.reset();
	await site.php( `delete_option( 'sd_test_swap' ); delete_option( 'sd_test_swap_zip' ); return true;` );
	if ( INSTALLED !== ( await site.php( php.version ) ).header ) {
		await site.reinstall();
	}
} );

const good = ( version = '0.1.1', signer = keys[ 0 ] ) => makeRelease( version, { builtIn: keys, signer } );
const version = () => site.php( php.version );
const zipRequests = () => release.requests.filter( ( request ) => request.path.endsWith( '.zip' ) );

// A release is published, seen by the daily check and open for installing.
async function ready( published = good(), { early = true } = {} ) {
	release.publish( published );
	const stored = await site.php( php.check );
	assert.equal( stored?.version, published.version, 'the release was taken by the check' );
	await site.php( php.early( early ) );
	release.requests = [];
	return published;
}

function refused( run ) {
	assert.equal( run.installed, false );
	assert.ok( run.codes.includes( REFUSED ), 'refused by the plugin, codes: ' + JSON.stringify( run.codes ) );
}

// Refused by the check right after the download, not only by the second hash before unpacking.
function refusedAtDownload( run ) {
	refused( run );
	assert.ok( ! run.messages.some( ( text ) => text.includes( 'Unpacking' ) ), 'the upgrader never got a package' );
}

async function stays() {
	assert.deepEqual( await version(), { header: INSTALLED, loaded: INSTALLED, active: true } );
}

// The plugin of the test build with one more file, so that the ZIP has exactly that size.
function releaseOfSize( size ) {
	const files = testFiles( SOURCE_ROOT, { version: '0.1.1', keys } );
	const withPad = ( length ) => releaseZip( [ ...files, { name: 'pad.bin', data: Buffer.alloc( length ) } ] );
	const zip = withPad( size - withPad( 0 ).length );
	assert.equal( zip.length, size );
	return releaseAround( '0.1.1', zip, keys[ 0 ] );
}

test( 'automatic update with the switch on installs the new version', async () => {
	await ready();
	await site.php( php.auto );
	assert.deepEqual( await version(), { header: '0.1.1', loaded: '0.1.1', active: true } );
	assert.deepEqual( zipRequests().map( ( request ) => request.host + ' ' + request.path ), [
		RELEASE_HOST + ' ' + ZIP_PATH,
		ASSET_HOST + ' /asset/site-dispatch-0.1.1.zip',
	] );
	for ( const request of zipRequests() ) {
		assert.deepEqual( request.args, {
			sslverify: true,
			redirection: 0,
			timeout: 60,
			limit_response_size: 2097153,
			reject_unsafe_urls: true,
			stream: true,
		} );
	}
} );

test( 'automatic update after 72 hours installs the new version', async () => {
	await ready( good(), { early: false } );
	await site.php( php.age( HOURS_72 ) );
	await site.php( php.auto );
	assert.deepEqual( await version(), { header: '0.1.1', loaded: '0.1.1', active: true } );
} );

test( 'automatic update before 72 hours installs nothing', async () => {
	await ready( good(), { early: false } );
	await site.php( php.age( HOURS_72 - 120 ) );
	await site.php( php.auto );
	await stays();
	assert.equal( zipRequests().length, 0 );
} );

test( 'update now in wp-admin installs through the same checks', async () => {
	await ready();
	const nonce = await site.nonce( admin, 'upgrade-plugin_' + FILE );
	const page = await site.fetch( admin, '/wp-admin/update.php?action=upgrade-plugin&plugin=' + encodeURIComponent( FILE ) + '&_wpnonce=' + nonce );
	assert.equal( page.status, 200 );
	assert.ok( page.body.includes( 'Plugin updated successfully' ), 'update page reports success' );
	// This page switches the plugin off for the upgrade and on again through a frame.
	const frame = /<iframe[^>]+src="([^"]*action=activate-plugin[^"]*)"/.exec( page.body );
	assert.ok( frame, 'frame that switches the plugin on again' );
	const target = new URL( frame[ 1 ].replaceAll( '&amp;', '&' ).replaceAll( '&#038;', '&' ), site.url + '/wp-admin/' );
	await site.fetch( admin, target.pathname + target.search );
	assert.deepEqual( await version(), { header: '0.1.1', loaded: '0.1.1', active: true } );
	assert.equal( zipRequests().length, 2 );
	assert.equal( zipRequests()[ 0 ].args.limit_response_size, 2097153 );
} );

test( 'update now before 72 hours installs nothing', async () => {
	await ready( good(), { early: false } );
	const nonce = await site.nonce( admin, 'upgrade-plugin_' + FILE );
	const page = await site.fetch( admin, '/wp-admin/update.php?action=upgrade-plugin&plugin=' + encodeURIComponent( FILE ) + '&_wpnonce=' + nonce );
	assert.ok( ! page.body.includes( 'Plugin updated successfully' ) );
	await stays();
	assert.equal( zipRequests().length, 0 );
} );

test( 'forged update list before 72 hours is refused at the install check', async () => {
	await ready( good(), { early: false } );
	const run = await site.php( `
		add_filter( 'site_transient_update_plugins', static function ( $list ) {
			if ( ! is_object( $list ) ) {
				$list = new stdClass();
			}
			$list->response['${ FILE }'] = (object) array(
				'slug'        => 'site-dispatch',
				'plugin'      => '${ FILE }',
				'new_version' => '0.1.1',
				'package'     => 'https://github.example.test${ ZIP_PATH }',
			);
			return $list;
		}, PHP_INT_MAX );
		${ php.upgrade }
	` );
	refused( run );
	await stays();
	assert.equal( zipRequests().length, 0 );
} );

test( 'foreign package address for the own plugin is ignored, the own address is used', async () => {
	await ready();
	const run = await site.php( `
		add_filter( 'site_transient_update_plugins', static function ( $list ) {
			$list->response['${ FILE }']->package     = 'https://assets.example.test/asset/evil.zip';
			$list->response['${ FILE }']->new_version = '9.9.9';
			return $list;
		}, PHP_INT_MAX );
		${ php.upgrade }
	` );
	assert.equal( run.installed, true );
	assert.equal( ( await version() ).header, '0.1.1' );
	assert.deepEqual( release.requests.map( ( request ) => request.path ), [ ZIP_PATH, '/asset/site-dispatch-0.1.1.zip' ] );
} );

test( 'install without any stored update is refused', async () => {
	const run = await site.php( `
		add_filter( 'site_transient_update_plugins', static function ( $list ) {
			if ( ! is_object( $list ) ) {
				$list = new stdClass();
			}
			$list->response['${ FILE }'] = (object) array(
				'slug'        => 'site-dispatch',
				'plugin'      => '${ FILE }',
				'new_version' => '9.9.9',
				'package'     => 'https://assets.example.test/asset/evil.zip',
			);
			return $list;
		}, PHP_INT_MAX );
		${ php.upgrade }
	` );
	refused( run );
	await stays();
	assert.equal( release.requests.length, 0 );
} );

test( 'zip replaced on the server is refused', async () => {
	await ready();
	release.zip = makeRelease( '0.1.1', { builtIn: [ ctx.stranger, ctx.stranger ], signer: ctx.stranger } ).zip;
	const run = await site.php( php.upgrade );
	refusedAtDownload( run );
	await stays();
} );

test( 'zip with one changed byte is refused', async () => {
	const published = await ready();
	const changed = Buffer.from( published.zip );
	changed[ changed.length - 100 ] ^= 1;
	release.zip = changed;
	refusedAtDownload( await site.php( php.upgrade ) );
	await stays();
} );

test( 'zip of exactly 2 mb installs, one byte more is refused', async () => {
	await ready( releaseOfSize( 2097153 ) );
	refusedAtDownload( await site.php( php.upgrade ) );
	await stays();

	await site.reset();
	await ready( releaseOfSize( 2097152 ) );
	assert.equal( ( await site.php( php.upgrade ) ).installed, true );
	assert.equal( ( await version() ).header, '0.1.1' );
} );

const main = '<?php\n/**\n * Plugin Name: Site Dispatch\n * Version: 0.1.1\n */\n';
const hostile = {
	'second top folder': [ [ 'site-dispatch/site-dispatch.php', main ], [ 'other/evil.php', '<?php\n' ] ],
	'file on top level': [ [ 'site-dispatch/site-dispatch.php', main ], [ 'evil.php', '<?php\n' ] ],
	'path up': [ [ 'site-dispatch/site-dispatch.php', main ], [ '../evil.php', '<?php\n' ] ],
	'path up inside the folder': [ [ 'site-dispatch/site-dispatch.php', main ], [ 'site-dispatch/../../evil.php', '<?php\n' ] ],
	'backslash path': [ [ 'site-dispatch/site-dispatch.php', main ], [ 'site-dispatch\\..\\..\\evil.php', '<?php\n' ] ],
	'absolute path': [ [ 'site-dispatch/site-dispatch.php', main ], [ '/tmp/evil.php', '<?php\n' ] ],
	'other folder name': [ [ 'site-dispatch-evil/site-dispatch.php', main ] ],
	'without the main file': [ [ 'site-dispatch/other.php', '<?php\n' ] ],
};

for ( const [ name, entries ] of Object.entries( hostile ) ) {
	test( 'validly signed zip is refused before unpacking: ' + name, async () => {
		await ready( releaseAround( '0.1.1', zipOf( entries ), keys[ 0 ] ) );
		const run = await site.php( php.upgrade );
		refusedAtDownload( run );
		await stays();
		const stray = await site.php( `
			return array_values( array_filter(
				array( '/wordpress/wp-content/evil.php', '/wordpress/wp-content/upgrade/evil.php', '/wordpress/evil.php', '/tmp/evil.php', WP_PLUGIN_DIR . '/evil.php', WP_PLUGIN_DIR . '/other', WP_PLUGIN_DIR . '/site-dispatch-evil' ),
				'file_exists'
			) );
		` );
		assert.deepEqual( stray, [] );
	} );
}

test( 'validly signed file that is no zip is refused', async () => {
	await ready( releaseAround( '0.1.1', Buffer.from( 'this is not a zip archive' ), keys[ 0 ] ) );
	refusedAtDownload( await site.php( php.upgrade ) );
	await stays();
} );

for ( const mode of [ 'content', 'path' ] ) {
	test( 'package swapped after the hash check is refused right before unpacking: ' + mode, async () => {
		await ready();
		const evil = zipOf( [ [ 'site-dispatch/site-dispatch.php', main.replace( '0.1.1', '6.6.6' ) ] ] );
		await site.php( `
			update_option( 'sd_test_swap', '${ mode }' );
			update_option( 'sd_test_swap_zip', '${ evil.toString( 'base64' ) }' );
			return true;
		` );
		const run = await site.php( php.upgrade );
		refused( run );
		// The first check passed and the upgrader went on to unpack. That also shows that the
		// tests above can tell the two checks apart.
		assert.ok( run.messages.some( ( text ) => text.includes( 'Unpacking' ) ), 'refused at the second check' );
		await stays();
	} );
}

test( 'the swap of the test really installs when the second hash is not there to stop it', async () => {
	// Proves that the two tests above test something: with the filter of the plugin taken away
	// the swapped package goes through.
	await ready();
	const evil = zipOf( [ [ 'site-dispatch/site-dispatch.php', main.replace( '0.1.1', '6.6.6' ) ] ] );
	const run = await site.php( `
		update_option( 'sd_test_swap', 'content' );
		update_option( 'sd_test_swap_zip', '${ evil.toString( 'base64' ) }' );
		remove_filter( 'pre_unzip_file', 'site_dispatch_pre_unzip', PHP_INT_MAX );
		${ php.upgrade }
	` );
	assert.equal( run.installed, true );
	assert.equal( ( await site.php( `
		clearstatcache();
		return get_file_data( WP_PLUGIN_DIR . '/${ FILE }', array( 'version' => 'Version' ) )['version'];
	` ) ), '6.6.6' );
} );

test( 'release deleted between offer and install is refused', async () => {
	await ready();
	release.remove();
	refused( await site.php( php.upgrade ) );
	await stays();
} );

test( 'server that does not answer at install time is refused', async () => {
	await ready();
	release.down = true;
	refused( await site.php( php.upgrade ) );
	await stays();
} );

test( 'redirect of the zip to http is not followed', async () => {
	await ready();
	release.redirectTo = ( file ) => 'http://' + ASSET_HOST + '/asset/' + file;
	refused( await site.php( php.upgrade ) );
	assert.equal( release.to( ASSET_HOST ).length, 0 );
	await stays();
} );

test( 'refused install leaves no temp file behind', async () => {
	await ready();
	release.zip = Buffer.from( 'other bytes' );
	const seen = await site.php( `
		$before = glob( get_temp_dir() . 'site-dispatch-*' );
		${ php.upgrade.replace( 'return array(', "$after = glob( get_temp_dir() . 'site-dispatch-*' ); return array( 'left' => array_values( array_diff( (array) $after, (array) $before ) )," ) }
	` );
	refused( seen );
	assert.deepEqual( seen.left, [] );
} );

test( 'update of another plugin passes all filters untouched', async () => {
	await ready();
	const seen = await site.php( `
		$extra  = array( 'plugin' => 'canary-plugin/canary-plugin.php', 'type' => 'plugin', 'action' => 'update' );
		$source = '/wordpress/wp-content/upgrade/canary/canary-plugin/';
		return array(
			apply_filters( 'upgrader_pre_download', false, 'https://downloads.wordpress.org/plugin/canary-plugin.3.2.4.zip', null, $extra ),
			apply_filters( 'upgrader_pre_download', '/tmp/given.zip', 'https://downloads.wordpress.org/plugin/canary-plugin.3.2.4.zip', null, $extra ),
			apply_filters( 'upgrader_pre_download', false, '/tmp/uploaded.zip', null, array() ),
			apply_filters( 'pre_unzip_file', null, '/tmp/other.zip', '/tmp/to', array(), 0 ),
			apply_filters( 'upgrader_source_selection', $source, '/wordpress/wp-content/upgrade/canary', null, $extra ),
			apply_filters( 'upgrader_source_selection', $source, '/wordpress/wp-content/upgrade/canary', null, array() ),
		);
	` );
	assert.deepEqual( seen, [ false, '/tmp/given.zip', false, null, '/wordpress/wp-content/upgrade/canary/canary-plugin/', '/wordpress/wp-content/upgrade/canary/canary-plugin/' ] );
	assert.equal( release.requests.length, 0 );
} );

test( 'the own package address for another target is refused', async () => {
	await ready();
	const seen = await site.php( `
		$result = apply_filters(
			'upgrader_pre_download',
			false,
			'https://github.example.test${ ZIP_PATH }',
			null,
			array( 'plugin' => 'canary-plugin/canary-plugin.php' )
		);
		return is_wp_error( $result ) ? $result->get_error_code() : $result;
	` );
	assert.equal( seen, REFUSED );
	assert.equal( release.requests.length, 0 );
} );

test( 'after the update cron and options are there and the daily report is still sent', async () => {
	const state = await site.connect();
	await ready();
	await site.php( `site_dispatch_schedule(); return true;` );
	assert.equal( ( await site.php( php.upgrade ) ).installed, true );
	assert.deepEqual( await version(), { header: '0.1.1', loaded: '0.1.1', active: true } );

	assert.deepEqual( Object.keys( await site.cron() ).sort(), [ 'site_dispatch_daily', 'site_dispatch_update_check' ] );
	const options = await site.php( `
		wp_cache_flush();
		return array(
			'state' => get_option( 'site_dispatch_state', null ),
			'early' => get_option( 'site_dispatch_early_updates', null ),
		);
	` );
	assert.deepEqual( options.state, state );
	assert.equal( Number( options.early ), 1 );

	fake.requests = [];
	await site.php( `do_action( 'site_dispatch_daily' ); return true;` );
	const reports = fake.to( '/webhook/plugin-report' );
	assert.equal( reports.length, 1 );
	assert.equal( JSON.parse( reports[ 0 ].body.toString( 'utf8' ) ).reporter_version, '0.1.1' );
} );

test( 'after the update the offer is gone and the next check clears the stored update', async () => {
	await ready();
	assert.equal( ( await site.php( php.upgrade ) ).installed, true );
	assert.equal( await site.php( php.offer ), null );
	assert.notEqual( await site.php( php.stored ), null );
	assert.equal( await site.php( php.check ), null );
} );
