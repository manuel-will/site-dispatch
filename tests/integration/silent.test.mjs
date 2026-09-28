import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startFake } from './fake-server.mjs';
import { startSite, SERVER_HOST } from './harness.mjs';

const PAGE = '/wp-admin/tools.php?page=site-dispatch';
const LEGACY_VALUE = 'canary-legacy-snippet-value';

describe( 'staging site', () => {
	let fake;
	let site;
	let admin;

	before( async () => {
		fake = await startFake();
		site = await startSite( { fake, defines: { WP_ENVIRONMENT_TYPE: 'staging' } } );
		admin = await site.login( 'administrator' );
	} );

	after( async () => {
		await site?.stop();
		await fake?.stop();
	} );

	beforeEach( async () => {
		await site.reset();
	} );

	test( 'staging site stays silent', async () => {
		assert.equal( await site.php( 'return wp_get_environment_type();' ), 'staging' );
		await site.connect();
		await site.php( `
			do_action( 'site_dispatch_daily' );
			do_action( 'site_dispatch_retry' );
			site_dispatch_schedule();
			return true;
		` );
		await site.fetch( admin, '/wp-admin/index.php' );
		assert.equal( fake.requests.length, 0 );
		assert.deepEqual( await site.reportCron(), [] );
	} );

	test( 'staging site cannot connect', async () => {
		assert.equal( await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` ), false );
		const nonce = await site.nonce( admin, 'site_dispatch_connect' );
		const response = await site.fetch( admin, '/wp-admin/admin-post.php', {
			method: 'POST',
			form: { action: 'site_dispatch_connect', _wpnonce: nonce, server_host: SERVER_HOST },
		} );
		assert.ok( response.location.includes( 'site_dispatch_notice=connect_failed' ) );
		assert.equal( fake.requests.length, 0 );
	} );

	test( 'staging site shows a note instead of the connect form', async () => {
		const page = await site.fetch( admin, PAGE );
		assert.equal( page.status, 200 );
		assert.ok( page.body.includes( 'Connecting is only possible on a production site' ) );
		assert.ok( ! page.body.includes( 'name="server_host"' ) );
	} );
} );

describe( 'site with the old report snippet', () => {
	let fake;
	let site;
	let admin;

	before( async () => {
		fake = await startFake();
		site = await startSite( { fake, defines: { MW_PLUGIN_REPORT_KEY: LEGACY_VALUE } } );
		admin = await site.login( 'administrator' );
	} );

	after( async () => {
		await site?.stop();
		await fake?.stop();
	} );

	beforeEach( async () => {
		await site.reset();
	} );

	test( 'site with the snippet constant stays silent', async () => {
		assert.equal( await site.php( `return defined( 'MW_PLUGIN_REPORT_KEY' );` ), true );
		await site.connect();
		await site.php( `
			do_action( 'site_dispatch_daily' );
			site_dispatch_schedule();
			return true;
		` );
		assert.equal( fake.requests.length, 0 );
		assert.deepEqual( await site.reportCron(), [] );
	} );

	test( 'site with the snippet constant shows a notice to admins', async () => {
		const page = await site.fetch( admin, '/wp-admin/index.php' );
		assert.ok( page.body.includes( 'Site Dispatch sends no reports while the constants of the old report snippet are defined.' ) );
		assert.ok( ! page.body.includes( LEGACY_VALUE ) );

		const editor = await site.login( 'editor' );
		const other = await site.fetch( editor, '/wp-admin/index.php' );
		assert.equal( other.status, 200 );
		assert.ok( ! other.body.includes( 'Site Dispatch sends no reports' ) );
	} );

	test( 'site with the snippet constant can still connect', async () => {
		assert.equal( await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` ), true );
		fake.approve();
		assert.equal( await site.php( 'return site_dispatch_enroll_redeem();' ), 'connected' );
		await site.php( `do_action( 'site_dispatch_daily' ); return true;` );
		assert.equal( fake.to( '/webhook/plugin-report' ).length, 0 );
	} );
} );
