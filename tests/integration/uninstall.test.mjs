import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startFake, CANARY_SITE_KEY } from './fake-server.mjs';
import { startSite, SERVER_HOST, PLUGIN_FILE } from './harness.mjs';

let fake;
let site;

before( async () => {
	fake = await startFake();
	site = await startSite( { fake } );
} );

after( async () => {
	await site?.stop();
	await fake?.stop();
} );

// Everything the plugin can store, all at once.
async function fill() {
	await site.php( `
		if ( ! is_plugin_active( '${ PLUGIN_FILE }' ) ) {
			activate_plugin( '${ PLUGIN_FILE }' );
		}
		return true;
	` );
	await site.reset();
	await site.connect();
	const filled = await site.php( `
		update_option( 'site_dispatch_last_report', array( 'at' => time(), 'http_status' => 200 ), false );
		update_option( 'site_dispatch_early_updates', 1, false );
		update_option( 'site_dispatch_update', array( 'version' => '9.9.9', 'first_seen' => time() ), false );
		wp_schedule_event( time() + 600, 'daily', 'site_dispatch_daily' );
		wp_schedule_single_event( time() + 600, 'site_dispatch_retry' );
		return site_dispatch_enroll_request( '${ SERVER_HOST }' );
	` );
	assert.equal( filled, true );
	assert.equal( ( await rows() ).length, 6, 'four options, the transient and its timeout' );
	assert.deepEqual( Object.keys( await site.cron() ).sort(), [ 'site_dispatch_daily', 'site_dispatch_retry' ] );
}

const rows = () =>
	site.php( `
		global $wpdb;
		wp_cache_flush();
		return $wpdb->get_col( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE '%site_dispatch%' ORDER BY option_name" );
	` );

beforeEach( fill );

test( 'deactivation removes the cron events and the open enrollment', async () => {
	await site.php( `deactivate_plugins( '${ PLUGIN_FILE }' ); return true;` );
	assert.deepEqual( await site.cron(), [] );
	assert.equal( await site.php( `return get_transient( 'site_dispatch_enroll' );` ), false );
	assert.equal( await site.php( `return is_plugin_active( '${ PLUGIN_FILE }' );` ), false );
} );

test( 'deactivation keeps the connection', async () => {
	await site.php( `deactivate_plugins( '${ PLUGIN_FILE }' ); return true;` );
	const state = await site.php( `return get_option( 'site_dispatch_state' );` );
	assert.equal( state.key, CANARY_SITE_KEY );
	assert.deepEqual( await rows(), [
		'site_dispatch_early_updates',
		'site_dispatch_last_report',
		'site_dispatch_state',
		'site_dispatch_update',
	] );
} );

test( 'deactivated plugin sends nothing', async () => {
	await site.php( `deactivate_plugins( '${ PLUGIN_FILE }' ); return true;` );
	fake.requests = [];
	const loaded = await site.php( `
		do_action( 'site_dispatch_daily' );
		return function_exists( 'site_dispatch_send' );
	` );
	assert.equal( loaded, false );
	assert.equal( fake.requests.length, 0 );
} );

test( 'activation of a connected site plans the daily report', async () => {
	await site.php( `deactivate_plugins( '${ PLUGIN_FILE }' ); return true;` );
	await site.php( `activate_plugin( '${ PLUGIN_FILE }' ); return true;` );
	const cron = await site.cron();
	assert.equal( cron.site_dispatch_daily.length, 1 );
	assert.equal( cron.site_dispatch_retry, undefined );
} );

test( 'uninstall leaves no option, no transient and no cron event', async () => {
	await site.php( `deactivate_plugins( '${ PLUGIN_FILE }' ); return true;` );
	// Put the cron events and the transient back, uninstall has to remove them by itself.
	await site.php( `
		wp_schedule_event( time() + 600, 'daily', 'site_dispatch_daily' );
		wp_schedule_single_event( time() + 600, 'site_dispatch_retry' );
		set_transient( 'site_dispatch_enroll', array( 'secret' => 'x' ), 60 );
		return true;
	` );
	assert.equal( ( await rows() ).length, 6 );

	await site.php( `uninstall_plugin( '${ PLUGIN_FILE }' ); return true;` );
	assert.deepEqual( await rows(), [] );
	assert.deepEqual( await site.cron(), [] );
	assert.equal( await site.php( `return get_transient( 'site_dispatch_enroll' );` ), false );
} );

test( 'uninstall file does nothing when called outside of an uninstall', async () => {
	const before = await rows();
	await assert.rejects(
		site.php( `
			include WP_PLUGIN_DIR . '/site-dispatch/uninstall.php';
			return 'went on';
		` ),
		/PHP run gave no result/
	);
	assert.deepEqual( await rows(), before );
	assert.equal( Object.keys( await site.cron() ).length, 2 );
} );
