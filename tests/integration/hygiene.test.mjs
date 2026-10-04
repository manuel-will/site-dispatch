// Leak inventory 7: the plugin never writes a key or an enrollment secret into debug.log.
// WP_DEBUG and WP_DEBUG_LOG are on for this site, so anything the plugin logged would land in
// the file the test reads at the end. A probe line proves that the log is live.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFake, CANARY_SITE_KEY } from './fake-server.mjs';
import { startSite, SERVER_HOST } from './harness.mjs';

const LOG = '/tmp/site-dispatch-debug.log';

let fake;
let site;

before( async () => {
	fake = await startFake();
	site = await startSite( { fake, defines: { WP_DEBUG: '1', WP_DEBUG_LOG: LOG } } );
} );

after( async () => {
	await site?.stop();
	await fake?.stop();
} );

const log = () => site.php( `return file_exists( '${ LOG }' ) ? (string) file_get_contents( '${ LOG }' ) : '';` );

test( 'debug.log carries neither the site key nor the enrollment secret after every flow ran', async () => {
	await site.php( `error_log( 'site-dispatch-hygiene-probe' ); return true;` );
	assert.ok( ( await log() ).includes( 'site-dispatch-hygiene-probe' ), 'the debug log is live' );

	// Report, accepted and refused, and the retry.
	await site.connect();
	await site.php( `do_action( 'site_dispatch_daily' ); return true;` );
	fake.reportAnswer = { status: 500, body: '{"ok":false}' };
	await site.php( `do_action( 'site_dispatch_daily' ); do_action( 'site_dispatch_retry' ); return true;` );
	fake.reportAnswer = { status: 401, body: '{"ok":false}' };
	await site.php( `do_action( 'site_dispatch_daily' ); return true;` );
	fake.reset();

	// Enrollment: pending, refused, server error, connected.
	assert.equal( await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` ), true );
	const secret = ( await site.php( `return get_transient( 'site_dispatch_enroll' );` ) ).secret;
	assert.match( secret, /^[0-9a-f]{64}$/ );
	assert.equal( await site.php( 'return site_dispatch_enroll_redeem();' ), 'pending' );
	fake.redeemAnswer = { status: 500, body: '{"ok":false}' };
	assert.equal( await site.php( 'return site_dispatch_enroll_redeem();' ), 'retry' );
	fake.redeemAnswer = { status: 200, type: 'text/html', body: '<html>' };
	assert.equal( await site.php( 'return site_dispatch_enroll_redeem();' ), 'failed' );
	fake.redeemAnswer = null;
	assert.equal( await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` ), true );
	fake.approve();
	assert.equal( await site.php( 'return site_dispatch_enroll_redeem();' ), 'connected' );

	// The admin page and the ajax answer, as an administrator.
	const admin = await site.login( 'administrator' );
	await site.fetch( admin, '/wp-admin/tools.php?page=site-dispatch' );
	await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` );
	const second = ( await site.php( `return get_transient( 'site_dispatch_enroll' );` ) ).secret;
	const nonce = await site.nonce( admin, 'site_dispatch_redeem' );
	await site.fetch( admin, '/wp-admin/admin-ajax.php', { method: 'POST', form: { action: 'site_dispatch_redeem', nonce } } );

	const text = await log();
	assert.ok( text.length > 0 );
	assert.ok( ! text.includes( CANARY_SITE_KEY ), 'site key in debug.log' );
	assert.ok( ! text.includes( secret ), 'first enrollment secret in debug.log' );
	assert.ok( ! text.includes( second ), 'second enrollment secret in debug.log' );
	assert.ok( ! /Site Dispatch|site_dispatch/.test( text.replace( 'site-dispatch-hygiene-probe', '' ) ), 'the plugin wrote something to debug.log: ' + text.slice( 0, 500 ) );
} );
