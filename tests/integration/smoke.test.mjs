import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFake } from './fake-server.mjs';
import { startSite, PLUGIN_VERSION } from './harness.mjs';

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

test( 'plugin activates without any output or notice', async () => {
	// startSite() fails on any output of the activation run.
	const seen = await site.php( `
		return array(
			'active'  => is_plugin_active( 'site-dispatch/site-dispatch.php' ),
			'version' => SITE_DISPATCH_VERSION,
			'header'  => get_plugin_data( SITE_DISPATCH_FILE, false, false )['Version'],
		);
	` );
	assert.deepEqual( seen, { active: true, version: PLUGIN_VERSION, header: PLUGIN_VERSION } );
} );

test( 'a fresh site is not connected and plans no report, only the update check', async () => {
	assert.equal( await site.php( 'return site_dispatch_get_state();' ), null );
	assert.deepEqual( Object.keys( await site.cron() ), [ 'site_dispatch_update_check' ] );
} );

test( 'a request to any other host never leaves the test site', async () => {
	const error = await site.php( `
		$result = wp_remote_get( 'https://example.com/' );
		return is_wp_error( $result ) ? $result->get_error_code() : 'went out';
	` );
	assert.equal( error, 'site_dispatch_test_blocked' );
	assert.equal( fake.requests.length, 0 );
} );

test( 'a request to the test host reaches the fake server', async () => {
	const code = await site.php( `
		$answer = site_dispatch_post( 'https://server.example.test/webhook/plugin-report', '{}', array(), 5 );
		return $answer['code'];
	` );
	assert.equal( code, 200 );
	assert.equal( fake.to( '/webhook/plugin-report' ).length, 1 );
} );
