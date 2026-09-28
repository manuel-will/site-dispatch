// When WordPress gets the update offered, and that nothing else in its update list is touched.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HOURS_72, TEST_BASE, makeRelease, php, startUpdateSite } from './update-kit.mjs';

const FILE = 'site-dispatch/site-dispatch.php';
const FOREIGN = 'https://downloads.wordpress.org/plugin/site-dispatch.9.9.9.zip';

let ctx;
let site;
let release;
let keys;

before( async () => {
	ctx = await startUpdateSite( { defines: { SITE_DISPATCH_TEST_WPORG: '1' } } );
	( { site, release, keys } = ctx );
} );

after( async () => {
	await ctx?.stop();
} );

beforeEach( async () => {
	await site.reset();
} );

const good = ( version = '0.1.1', signer = keys[ 0 ] ) => makeRelease( version, { builtIn: keys, signer } );
const offer = () => site.php( php.offer );

async function waiting( published = good() ) {
	release.publish( published );
	return site.php( php.check );
}

// An update list as wordpress.org would have filled it, with an entry for the own plugin.
const foreignList = `
	$list               = new stdClass();
	$list->last_checked = time();
	$list->checked      = array( 'canary-plugin/canary-plugin.php' => '3.2.1', '${ FILE }' => '0.1.0' );
	$list->response     = array(
		'canary-plugin/canary-plugin.php' => (object) array(
			'id'          => 'w.org/plugins/canary-plugin',
			'slug'        => 'canary-plugin',
			'plugin'      => 'canary-plugin/canary-plugin.php',
			'new_version' => '3.2.4',
			'package'     => 'https://downloads.wordpress.org/plugin/canary-plugin.3.2.4.zip',
			'icons'       => array( '1x' => 'https://ps.w.org/canary-plugin/assets/icon.png' ),
		),
		'${ FILE }' => (object) array(
			'id'          => 'w.org/plugins/site-dispatch',
			'slug'        => 'site-dispatch',
			'plugin'      => '${ FILE }',
			'new_version' => '9.9.9',
			'package'     => '${ FOREIGN }',
		),
	);
	$list->no_update    = array(
		'hello.php' => (object) array( 'id' => 'w.org/plugins/hello-dolly', 'slug' => 'hello-dolly', 'plugin' => 'hello.php', 'new_version' => '1.7.2' ),
	);
	$list->translations = array( array( 'type' => 'plugin', 'slug' => 'canary-plugin', 'language' => 'de_DE' ) );
`;

test( 'before 72 hours there is no offer', async () => {
	await waiting();
	assert.equal( await offer(), null );
	await site.php( php.age( HOURS_72 - 120 ) );
	assert.equal( await offer(), null );
} );

test( 'after 72 hours the offer is there', async () => {
	await waiting();
	await site.php( php.age( HOURS_72 ) );
	assert.deepEqual( await offer(), {
		id: TEST_BASE,
		slug: 'site-dispatch',
		plugin: FILE,
		new_version: '0.1.1',
		url: TEST_BASE,
		package: TEST_BASE + '/releases/download/v0.1.1/site-dispatch-0.1.1.zip',
		requires: '6.4',
		requires_php: '7.4',
	} );
} );

test( 'with the switch on the offer is there at once', async () => {
	await waiting();
	await site.php( php.early( true ) );
	assert.equal( ( await offer() ).new_version, '0.1.1' );
	await site.php( php.early( false ) );
	assert.equal( await offer(), null );
} );

test( 'a local time in the future does not open the offer', async () => {
	await waiting();
	await site.php( php.age( -HOURS_72 ) );
	assert.equal( await offer(), null );
} );

test( 'without a stored update there is no offer and the list stays as it is', async () => {
	assert.equal( await offer(), null );
	assert.equal( await site.php( `return get_site_transient( 'update_plugins' );` ), false );
} );

for ( const due of [ false, true ] ) {
	test( 'entries of other plugins stay byte for byte the same, offer ' + ( due ? 'open' : 'closed' ), async () => {
		await waiting();
		await site.php( php.early( due ) );
		const seen = await site.php( `
			${ foreignList }
			unset( $list->response['${ FILE }'] );
			set_site_transient( 'update_plugins', $list );
			wp_cache_flush();
			$raw  = get_site_option( '_site_transient_update_plugins' );
			$read = get_site_transient( 'update_plugins' );
			$own  = isset( $read->response['${ FILE }'] );
			unset( $read->response['${ FILE }'] );
			return array(
				'same'  => serialize( $raw ) === serialize( $read ),
				'own'   => $own,
				'count' => count( $read->response ),
				'keys'  => array_keys( get_object_vars( $read ) ),
			);
		` );
		assert.deepEqual( seen, { same: true, own: due, count: 1, keys: [ 'last_checked', 'checked', 'response', 'no_update', 'translations' ] } );
	} );
}

test( 'an entry for the own plugin from wordpress.org is never offered', async () => {
	const seen = await site.php( `
		${ foreignList }
		set_site_transient( 'update_plugins', $list );
		wp_cache_flush();
		$read = get_site_transient( 'update_plugins' );
		return array( isset( $read->response['${ FILE }'] ), isset( $read->response['canary-plugin/canary-plugin.php'] ) );
	` );
	assert.deepEqual( seen, [ false, true ] );
} );

test( 'an entry for the own plugin from wordpress.org is replaced by the own offer', async () => {
	await waiting();
	await site.php( php.early( true ) );
	await site.php( `
		${ foreignList }
		set_site_transient( 'update_plugins', $list );
		return true;
	` );
	const own = await offer();
	assert.equal( own.new_version, '0.1.1' );
	assert.equal( own.package, TEST_BASE + '/releases/download/v0.1.1/site-dispatch-0.1.1.zip' );
	assert.ok( ! JSON.stringify( own ).includes( 'wordpress.org' ) );
} );

// Measured here: WordPress itself does not drop such an entry. It sends the Update URI along and
// relies on wordpress.org to leave the plugin out. So the filter of the plugin is what protects.
test( 'an answer of wordpress.org about the slug is never offered, and wordpress.org is told the Update URI', async () => {
	release.wporg = JSON.stringify( {
		plugins: {
			[ FILE ]: {
				id: 'w.org/plugins/site-dispatch',
				slug: 'site-dispatch',
				plugin: FILE,
				new_version: '9.9.9',
				url: 'https://wordpress.org/plugins/site-dispatch/',
				package: FOREIGN,
			},
			'canary-plugin/canary-plugin.php': {
				id: 'w.org/plugins/canary-plugin',
				slug: 'canary-plugin',
				plugin: 'canary-plugin/canary-plugin.php',
				new_version: '3.2.4',
				url: 'https://wordpress.org/plugins/canary-plugin/',
				package: 'https://downloads.wordpress.org/plugin/canary-plugin.3.2.4.zip',
			},
		},
		translations: [],
		no_update: [],
	} );
	const stored = await site.php( `
		delete_site_transient( 'update_plugins' );
		wp_update_plugins();
		wp_cache_flush();
		$read = get_site_transient( 'update_plugins' );
		return array(
			'header' => get_plugin_data( WP_PLUGIN_DIR . '/${ FILE }' )['UpdateURI'],
			'canary' => is_object( $read ) && isset( $read->response['canary-plugin/canary-plugin.php'] ),
			'own'    => is_object( $read ) && isset( $read->response['${ FILE }'] ),
		);
	` );
	const asked = release.to( 'api.wordpress.org', '/plugins/update-check/' );
	assert.ok( asked.length >= 1, 'the fake was asked' );
	const sent = JSON.parse( new URLSearchParams( asked[ 0 ].body.toString( 'utf8' ) ).get( 'plugins' ) );
	assert.equal( sent.plugins[ FILE ].UpdateURI, 'https://github.com/manuel-will/site-dispatch' );
	assert.deepEqual( stored, { header: 'https://github.com/manuel-will/site-dispatch', canary: true, own: false } );
} );

test( 'damaged stored update gives no offer', async () => {
	const published = good();
	const other = good( '0.1.2' );
	const forged = [
		{ manifest: '***', sig: published.signature.toString( 'base64' ), version: '0.1.1' },
		{ manifest: published.manifest.toString( 'base64' ), sig: other.signature.toString( 'base64' ), version: '0.1.1' },
		{ manifest: published.manifest.toString( 'base64' ), sig: published.signature.toString( 'base64' ), version: '0.1.2' },
		{ manifest: published.manifest.toString( 'base64' ), sig: published.signature.subarray( 0, 63 ).toString( 'base64' ), version: '0.1.1' },
		{ manifest: published.manifest.toString( 'base64' ), version: '0.1.1' },
	];
	await site.php( php.early( true ) );
	for ( const update of forged ) {
		const seen = await site.php( `
			delete_option( 'site_dispatch_update' );
			$update               = json_decode( '${ JSON.stringify( update ) }', true );
			$update['first_seen'] = time() - ${ HOURS_72 * 2 };
			add_option( 'site_dispatch_update', $update, '', false );
			${ php.offer }
		` );
		assert.equal( seen, null, JSON.stringify( Object.keys( update ) ) + ' ' + update.version );
	}
} );

test( 'stored update signed by an unknown key gives no offer', async () => {
	const published = good( '0.1.1', ctx.stranger );
	await site.php( php.early( true ) );
	const seen = await site.php( `
		add_option( 'site_dispatch_update', array(
			'manifest'   => '${ published.manifest.toString( 'base64' ) }',
			'sig'        => '${ published.signature.toString( 'base64' ) }',
			'version'    => '0.1.1',
			'first_seen' => time() - ${ HOURS_72 * 2 },
		), '', false );
		${ php.offer }
	` );
	assert.equal( seen, null );
} );

test( 'stored update for the installed version gives no offer', async () => {
	const published = good( '0.1.0' );
	await site.php( php.early( true ) );
	const seen = await site.php( `
		add_option( 'site_dispatch_update', array(
			'manifest'   => '${ published.manifest.toString( 'base64' ) }',
			'sig'        => '${ published.signature.toString( 'base64' ) }',
			'version'    => '0.1.0',
			'first_seen' => time() - ${ HOURS_72 * 2 },
		), '', false );
		${ php.offer }
	` );
	assert.equal( seen, null );
} );

test( 'the automatic updater is told to install the own plugin and nothing else', async () => {
	const seen = await site.php( `
		$own   = (object) array( 'plugin' => '${ FILE }' );
		$other = (object) array( 'plugin' => 'canary-plugin/canary-plugin.php' );
		return array(
			apply_filters( 'auto_update_plugin', false, $own ),
			apply_filters( 'auto_update_plugin', null, $own ),
			apply_filters( 'auto_update_plugin', false, $other ),
			apply_filters( 'auto_update_plugin', true, $other ),
			apply_filters( 'auto_update_plugin', null, $other ),
			apply_filters( 'auto_update_plugin', false, (object) array() ),
		);
	` );
	assert.deepEqual( seen, [ true, true, false, true, null, false ] );
} );
