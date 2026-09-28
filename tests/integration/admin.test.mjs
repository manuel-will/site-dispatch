import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startFake, CANARY_SITE_KEY, USER_CODE } from './fake-server.mjs';
import { startSite, SERVER_HOST, PLUGIN_VERSION } from './harness.mjs';

const PAGE = '/wp-admin/tools.php?page=site-dispatch';
const POST = '/wp-admin/admin-post.php';
const AJAX = '/wp-admin/admin-ajax.php';
const ACTIONS = [
	{ name: 'connect', path: POST, action: 'site_dispatch_connect', field: '_wpnonce', extra: { server_host: SERVER_HOST } },
	{ name: 'settings', path: POST, action: 'site_dispatch_settings', field: '_wpnonce', extra: { early_updates: '1' } },
	{ name: 'redeem', path: AJAX, action: 'site_dispatch_redeem', field: 'nonce', extra: {} },
];

let fake;
let site;
let admin;

before( async () => {
	fake = await startFake();
	site = await startSite( { fake } );
	admin = await site.login( 'administrator' );
} );

after( async () => {
	await site?.stop();
	await fake?.stop();
} );

beforeEach( async () => {
	await site.reset();
} );

const stored = () =>
	site.php( `
		return array(
			'state'  => get_option( 'site_dispatch_state', null ),
			'early'  => get_option( 'site_dispatch_early_updates', null ),
			'enroll' => get_transient( 'site_dispatch_enroll' ),
		);
	` );
const untouched = { state: null, early: null, enroll: false };

async function act( jar, entry, nonce ) {
	const form = { action: entry.action, ...entry.extra };
	if ( null !== nonce ) {
		form[ entry.field ] = nonce;
	}
	return site.fetch( jar, entry.path, { method: 'POST', form } );
}

async function connectThroughForm( host = SERVER_HOST ) {
	const page = await site.fetch( admin, PAGE );
	const form = page.body.match( /<form[^>]*admin-post\.php[^>]*>[\s\S]*?site_dispatch_connect[\s\S]*?<\/form>/ );
	assert.ok( form, 'connect form on the page' );
	const nonce = form[ 0 ].match( /name="_wpnonce" value="([0-9a-f]+)"/ );
	assert.ok( nonce, 'nonce in the connect form' );
	return site.fetch( admin, POST, {
		method: 'POST',
		form: { action: 'site_dispatch_connect', _wpnonce: nonce[ 1 ], server_host: host },
	} );
}

async function forbiddenEverywhere( role ) {
	const jar = await site.login( role );
	// An open enrollment, so a redeem that slipped through would reach the server.
	await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` );
	const before = await stored();
	fake.requests = [];

	const page = await site.fetch( jar, PAGE );
	assert.equal( page.status, 403, role + ' page' );
	assert.ok( ! page.body.includes( USER_CODE ), role + ' sees the user code' );
	for ( const entry of ACTIONS ) {
		const nonce = await site.nonce( jar, entry.action );
		const response = await act( jar, entry, nonce );
		assert.equal( response.status, 403, role + ' ' + entry.name );
	}
	assert.equal( fake.requests.length, 0 );
	assert.deepEqual( await stored(), before );
}

test( 'admin sees the page under tools', async () => {
	const page = await site.fetch( admin, PAGE );
	assert.equal( page.status, 200 );
	assert.ok( page.body.includes( 'No, not connected' ) );
	assert.ok( page.body.includes( 'name="server_host"' ) );
	assert.ok( ! page.body.includes( 'site-dispatch-check' ), 'no approval block without an enrollment' );
	const tools = await site.fetch( admin, '/wp-admin/tools.php' );
	assert.ok( tools.body.includes( 'tools.php?page=site-dispatch' ), 'entry in the tools menu' );
} );

test( 'connected site shows host, version and last report', async () => {
	await site.connect();
	const when = await site.php( `
		update_option( 'site_dispatch_last_report', array( 'at' => 1767225600, 'http_status' => 200 ), false );
		return wp_date( 'Y-m-d H:i', 1767225600 );
	` );
	const page = await site.fetch( admin, PAGE );
	assert.ok( page.body.includes( '<td>Yes</td>' ) );
	assert.ok( page.body.includes( '<td>' + SERVER_HOST + '</td>' ) );
	assert.ok( page.body.includes( '<td>' + PLUGIN_VERSION + '</td>' ) );
	assert.ok( page.body.includes( when + ', status 200' ) );
	assert.ok( page.body.includes( 'Connect again' ) );
} );

// The row with a verified update is tested in update-check.test.mjs, it needs a signed release.
test( 'waiting update without manifest and signature is not shown', async () => {
	await site.php( `
		update_option( 'site_dispatch_update', array( 'version' => '9.9.9', 'first_seen' => time() ), false );
		return true;
	` );
	const page = await site.fetch( admin, PAGE );
	assert.ok( ! page.body.includes( '9.9.9' ) );
	assert.ok( page.body.includes( '<th scope="row">Waiting update</th><td>None</td>' ) );
} );

test( 'waiting update with a damaged version is not shown', async () => {
	await site.php( `
		update_option( 'site_dispatch_update', array( 'version' => '<b>9.9.9</b>', 'first_seen' => time() ), false );
		return true;
	` );
	const page = await site.fetch( admin, PAGE );
	assert.ok( ! page.body.includes( '9.9.9' ) );
} );

test( 'connect through the form shows the code and the approval link', async () => {
	const response = await connectThroughForm();
	assert.equal( response.status, 302 );
	assert.ok( response.location.endsWith( 'tools.php?page=site-dispatch' ) );
	assert.equal( fake.to( '/webhook/site-dispatch-enroll-request' ).length, 1 );

	const page = await site.fetch( admin, PAGE );
	assert.ok( page.body.includes( '<code>' + USER_CODE + '</code>' ) );
	assert.ok( page.body.includes( 'href="https://' + SERVER_HOST + '/form/site-dispatch-approve"' ) );
	assert.ok( page.body.includes( 'assets/admin.js' ), 'polling script is loaded' );
	assert.ok( page.body.includes( '"interval":"3000"' ) || page.body.includes( '"interval":3000' ) );
	assert.ok( page.body.includes( '"maxTime":"120000"' ) || page.body.includes( '"maxTime":120000' ) );
} );

test( 'redeem through ajax connects the site', async () => {
	await connectThroughForm();
	const nonce = await site.nonce( admin, 'site_dispatch_redeem' );
	const redeem = ACTIONS[ 2 ];

	const waiting = await act( admin, redeem, nonce );
	assert.equal( waiting.status, 200 );
	assert.deepEqual( JSON.parse( waiting.body ), { status: 'pending' } );

	fake.approve();
	const done = await act( admin, redeem, nonce );
	assert.deepEqual( JSON.parse( done.body ), { status: 'connected' } );
	assert.equal( ( await stored() ).state.key, CANARY_SITE_KEY );

	const page = await site.fetch( admin, PAGE );
	assert.ok( page.body.includes( '<td>Yes</td>' ) );
	assert.ok( ! page.body.includes( 'assets/admin.js' ), 'no polling once connected' );
} );

test( 'host with spaces around it is accepted', async () => {
	await connectThroughForm( '  ' + SERVER_HOST + '  ' );
	assert.equal( fake.to( '/webhook/site-dispatch-enroll-request' ).length, 1 );
	assert.equal( ( await stored() ).enroll.server_host, SERVER_HOST );
} );

test( 'invalid host shows a notice and causes no request', async () => {
	for ( const host of [ 'http://x.de', '1.2.3.4', 'localhost', 'x.de/path', 'xn--80ak6aa92e.com' ] ) {
		const response = await connectThroughForm( host );
		assert.equal( response.status, 302 );
		assert.ok( response.location.includes( 'site_dispatch_notice=bad_host' ), host );
	}
	assert.equal( fake.requests.length, 0 );
	const page = await site.fetch( admin, PAGE + '&site_dispatch_notice=bad_host' );
	assert.ok( page.body.includes( 'This is not a valid host name.' ) );
} );

test( 'host sent as a list is refused without an error', async () => {
	const nonce = await site.nonce( admin, 'site_dispatch_connect' );
	const body = new URLSearchParams();
	body.append( 'action', 'site_dispatch_connect' );
	body.append( '_wpnonce', nonce );
	body.append( 'server_host[]', SERVER_HOST );
	const response = await site.fetch( admin, POST, { method: 'POST', form: body } );
	assert.equal( response.status, 302 );
	assert.ok( response.location.includes( 'site_dispatch_notice=bad_host' ) );
	assert.equal( fake.requests.length, 0 );
} );

test( 'server that refuses the request shows a notice', async () => {
	fake.requestAnswer = { status: 401, body: '{"ok":false}' };
	const response = await connectThroughForm();
	assert.ok( response.location.includes( 'site_dispatch_notice=connect_failed' ) );
	assert.equal( ( await stored() ).enroll, false );
} );

test( 'notice code from the address is never printed', async () => {
	const page = await site.fetch( admin, PAGE + '&site_dispatch_notice=%3Cscript%3Ealert(1)%3C%2Fscript%3E' );
	assert.equal( page.status, 200 );
	assert.ok( ! page.body.includes( 'alert(1)' ) );
} );

test( 'subscriber gets 403 everywhere', async () => {
	await forbiddenEverywhere( 'subscriber' );
} );

test( 'editor gets 403 everywhere', async () => {
	await forbiddenEverywhere( 'editor' );
} );

test( 'visitor without login triggers nothing', async () => {
	await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` );
	const before = await stored();
	fake.requests = [];
	fake.approve();

	const nonces = {};
	for ( const entry of ACTIONS ) {
		nonces[ entry.action ] = await site.nonce( admin, entry.action );
	}
	const page = await site.fetch( null, PAGE );
	assert.equal( page.status, 302, 'page sends a visitor to the login' );
	for ( const entry of ACTIONS ) {
		const response = await act( null, entry, nonces[ entry.action ] );
		assert.ok( ! response.body.includes( 'connected' ), entry.name );
		assert.ok( ! response.location.includes( 'site_dispatch_notice' ), entry.name );
	}
	assert.equal( fake.requests.length, 0 );
	assert.deepEqual( await stored(), before );
} );

test( 'request without nonce is refused', async () => {
	await site.php( `return site_dispatch_enroll_request( '${ SERVER_HOST }' );` );
	const before = await stored();
	fake.requests = [];
	fake.approve();
	for ( const entry of ACTIONS ) {
		assert.equal( ( await act( admin, entry, null ) ).status, 403, entry.name + ' without nonce' );
		assert.equal( ( await act( admin, entry, '0123456789' ) ).status, 403, entry.name + ' with a made up nonce' );
	}
	assert.equal( fake.requests.length, 0 );
	assert.deepEqual( await stored(), before );
} );

test( 'request with a nonce of another action is refused', async () => {
	const settings = await site.nonce( admin, 'site_dispatch_settings' );
	const connect = await site.nonce( admin, 'site_dispatch_connect' );
	assert.equal( ( await act( admin, ACTIONS[ 0 ], settings ) ).status, 403 );
	assert.equal( ( await act( admin, ACTIONS[ 1 ], connect ) ).status, 403 );
	assert.equal( ( await act( admin, ACTIONS[ 2 ], connect ) ).status, 403 );
	assert.equal( fake.requests.length, 0 );
	assert.deepEqual( await stored(), untouched );
} );

test( 'nonce of another user is refused', async () => {
	const editor = await site.login( 'editor' );
	const foreign = await site.nonce( editor, 'site_dispatch_connect' );
	assert.equal( ( await act( admin, ACTIONS[ 0 ], foreign ) ).status, 403 );
	assert.equal( fake.requests.length, 0 );
} );

test( 'key never appears in the page', async () => {
	await site.connect();
	const pages = [
		PAGE,
		'/wp-admin/index.php',
		'/wp-admin/plugins.php',
		'/wp-admin/tools.php',
		'/wp-admin/options.php',
		'/wp-admin/options-general.php',
		'/wp-admin/site-health.php?tab=debug',
		'/',
	];
	for ( const target of pages ) {
		const page = await site.fetch( admin, target );
		assert.equal( page.status, 200, target );
		assert.ok( ! page.body.includes( CANARY_SITE_KEY ), 'key in ' + target );
	}
} );

test( 'secret of an open enrollment never appears in the page or in an ajax answer', async () => {
	await connectThroughForm();
	const secret = ( await stored() ).enroll.secret;
	assert.match( secret, /^[0-9a-f]{64}$/ );

	for ( const target of [ PAGE, '/wp-admin/options.php', '/wp-admin/index.php' ] ) {
		const page = await site.fetch( admin, target );
		assert.ok( ! page.body.includes( secret ), 'secret in ' + target );
	}
	const nonce = await site.nonce( admin, 'site_dispatch_redeem' );
	const pending = await act( admin, ACTIONS[ 2 ], nonce );
	assert.ok( ! pending.body.includes( secret ) );
	fake.approve();
	const done = await act( admin, ACTIONS[ 2 ], nonce );
	assert.ok( ! done.body.includes( secret ) );
	assert.ok( ! done.body.includes( CANARY_SITE_KEY ), 'key in the ajax answer' );
	assert.equal( done.body, '{"status":"connected"}' );
} );

test( 'key never appears in a rest answer', async () => {
	await site.connect();
	const answers = await site.php( `
		$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
		wp_set_current_user( (int) $admins[0] );
		$out = array();
		foreach ( array( '/', '/wp/v2/settings', '/wp/v2/plugins', '/wp/v2/plugins/site-dispatch/site-dispatch', '/wp/v2/users/me' ) as $route ) {
			$response      = rest_do_request( new WP_REST_Request( 'GET', $route ) );
			$out[ $route ] = array(
				'status' => $response->get_status(),
				'body'   => wp_json_encode( rest_get_server()->response_to_data( $response, false ) ),
			);
		}
		return $out;
	` );
	for ( const [ route, answer ] of Object.entries( answers ) ) {
		assert.equal( answer.status, 200, route );
		assert.ok( answer.body.length > 50, route );
		assert.ok( ! answer.body.includes( CANARY_SITE_KEY ), 'key in ' + route );
	}
} );

test( 'key is not part of the autoloaded options', async () => {
	await site.connect();
	const found = await site.php( `
		return false !== strpos( serialize( wp_load_alloptions( true ) ), '${ CANARY_SITE_KEY }' );
	` );
	assert.equal( found, false );
} );

test( 'rest route list has no route of the plugin', async () => {
	const index = await site.fetch( null, '/?rest_route=/' );
	assert.equal( index.status, 200 );
	const data = JSON.parse( index.body );
	const names = [ ...data.namespaces, ...Object.keys( data.routes ) ];
	assert.ok( names.length > 20 );
	for ( const name of names ) {
		assert.ok( ! /site[-_]dispatch/i.test( name ), name );
	}
} );

test( 'plugin registers no public action and no rewrite rule', async () => {
	const seen = await site.php( `
		global $wp_filter;
		$public = array();
		foreach ( array_keys( $wp_filter ) as $hook ) {
			if ( false !== strpos( $hook, 'nopriv' ) && false !== strpos( $hook, 'site_dispatch' ) ) {
				$public[] = $hook;
			}
		}
		return array(
			'public'  => $public,
			'private' => has_action( 'wp_ajax_site_dispatch_redeem' ),
			'rewrite' => false !== strpos( wp_json_encode( get_option( 'rewrite_rules' ) ), 'site-dispatch' ),
		);
	` );
	assert.deepEqual( seen.public, [] );
	assert.notEqual( seen.private, false, 'the private action exists, so the check above looked at a loaded plugin' );
	assert.equal( seen.rewrite, false );
} );

test( 'switch for immediate updates is stored and shown', async () => {
	const nonce = await site.nonce( admin, 'site_dispatch_settings' );
	const on = await act( admin, ACTIONS[ 1 ], nonce );
	assert.equal( on.status, 302 );
	assert.ok( on.location.includes( 'site_dispatch_notice=saved' ) );
	assert.equal( Number( ( await stored() ).early ), 1 );
	const checked = await site.fetch( admin, PAGE );
	assert.match( checked.body, /name="early_updates" value="1" checked/ );

	const off = await site.fetch( admin, POST, { method: 'POST', form: { action: 'site_dispatch_settings', _wpnonce: nonce } } );
	assert.equal( off.status, 302 );
	assert.equal( Number( ( await stored() ).early ), 0 );
	const unchecked = await site.fetch( admin, PAGE );
	assert.ok( ! /name="early_updates" value="1" checked/.test( unchecked.body ) );

	const autoload = await site.php( `return array_key_exists( 'site_dispatch_early_updates', wp_load_alloptions( true ) );` );
	assert.equal( autoload, false );
} );
