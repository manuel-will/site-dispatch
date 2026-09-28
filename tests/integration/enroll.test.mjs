import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startFake, CANARY_SITE_KEY, CANARY_WEBSITE_ID, REQUEST_ID, USER_CODE } from './fake-server.mjs';
import { startSite, SERVER_HOST, PLUGIN_VERSION } from './harness.mjs';

const REQUEST = '/webhook/site-dispatch-enroll-request';
const REDEEM = '/webhook/site-dispatch-enroll-redeem';
const ARGS = { sslverify: true, redirection: 0, timeout: 15, limit_response_size: 4097, reject_unsafe_urls: true };

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

beforeEach( async () => {
	await site.reset();
} );

const request = ( host = SERVER_HOST ) => site.php( `return site_dispatch_enroll_request( ${ JSON.stringify( host ) } );` );
const redeem = () => site.php( 'return site_dispatch_enroll_redeem();' );
const transient = () => site.php( `return get_transient( 'site_dispatch_enroll' );` );
const state = () => site.php( `return get_option( 'site_dispatch_state', null );` );
const good = ( changes = {} ) => ( {
	status: 200,
	body: JSON.stringify( { ok: true, site_key: CANARY_SITE_KEY, key_version: 1, website_id: CANARY_WEBSITE_ID, ...changes } ),
} );

async function refused( answer ) {
	assert.equal( await request(), true );
	fake.redeemAnswer = answer;
	assert.equal( await redeem(), 'failed' );
	assert.equal( await state(), null, 'no connection stored' );
	assert.equal( await transient(), false, 'the request is used up' );
	assert.deepEqual( await site.cron(), [] );
}

test( 'enrollment stores the connection and plans the first report', async () => {
	assert.equal( await request(), true );
	fake.approve();
	assert.equal( await redeem(), 'connected' );

	assert.deepEqual( await state(), {
		website_id: CANARY_WEBSITE_ID,
		key: CANARY_SITE_KEY,
		key_version: 1,
		server_host: SERVER_HOST,
		home_host: '127.0.0.1',
	} );
	assert.equal( await transient(), false );
	const cron = await site.cron();
	assert.equal( cron.site_dispatch_daily.length, 1 );
	assert.ok( cron.site_dispatch_daily[ 0 ] > 0 && cron.site_dispatch_daily[ 0 ] <= 60 );
	assert.notEqual( await site.php( 'return site_dispatch_get_state();' ), null, 'the stored state passes the reader' );
} );

test( 'request sends the hash and never the secret', async () => {
	assert.equal( await request(), true );
	const stored = await transient();
	const sent = fake.to( REQUEST );
	assert.equal( sent.length, 1 );
	const text = sent[ 0 ].body.toString( 'utf8' );
	const data = JSON.parse( text );

	assert.match( stored.secret, /^[0-9a-f]{64}$/ );
	assert.deepEqual( Object.keys( data ), [ 'secret_hash', 'home_host', 'plugin_version' ] );
	assert.equal( data.secret_hash, crypto.createHash( 'sha256' ).update( stored.secret, 'utf8' ).digest( 'hex' ) );
	assert.equal( data.home_host, '127.0.0.1' );
	assert.equal( data.plugin_version, PLUGIN_VERSION );
	assert.ok( ! text.includes( stored.secret ), 'secret in the request' );
	assert.ok( ! JSON.stringify( sent[ 0 ].headers ).includes( stored.secret ), 'secret in a header' );
	assert.equal( stored.request_id, REQUEST_ID );
	assert.equal( stored.user_code, USER_CODE );
	assert.equal( stored.server_host, SERVER_HOST );
} );

test( 'every enrollment creates a new secret', async () => {
	await request();
	const first = ( await transient() ).secret;
	await request();
	const second = ( await transient() ).secret;
	assert.notEqual( first, second );
} );

test( 'redeem sends the request id and the secret to the redeem path only', async () => {
	await request();
	const stored = await transient();
	await redeem();
	const sent = fake.to( REDEEM );
	assert.equal( sent.length, 1 );
	assert.deepEqual( JSON.parse( sent[ 0 ].body.toString( 'utf8' ) ), { request_id: REQUEST_ID, secret: stored.secret } );
	assert.equal( fake.requests.length, 2 );
} );

test( 'requests go out with tls check on, redirects off and 15 seconds', async () => {
	await request();
	await redeem();
	assert.deepEqual( fake.to( REQUEST )[ 0 ].args, ARGS );
	assert.deepEqual( fake.to( REDEEM )[ 0 ].args, ARGS );
} );

test( 'redeem before approval stays pending', async () => {
	await request();
	assert.equal( await redeem(), 'pending' );
	assert.equal( await redeem(), 'pending' );
	assert.notEqual( await transient(), false );
	assert.equal( await state(), null );
	fake.approve();
	assert.equal( await redeem(), 'connected' );
} );

test( 'expired request ends as failed', async () => {
	await request();
	fake.expire();
	assert.equal( await redeem(), 'failed' );
	assert.equal( await transient(), false );
	assert.equal( await state(), null );
} );

test( 'locally expired enrollment makes no call', async () => {
	await request();
	await site.php( `
		$enrollment            = get_transient( 'site_dispatch_enroll' );
		$enrollment['expires'] = time() - 1;
		set_transient( 'site_dispatch_enroll', $enrollment, 60 );
		return true;
	` );
	fake.approve();
	assert.equal( await redeem(), 'none' );
	assert.equal( fake.to( REDEEM ).length, 0 );
	assert.equal( await transient(), false );
} );

test( 'redeem without an open enrollment makes no call', async () => {
	assert.equal( await redeem(), 'none' );
	assert.equal( fake.requests.length, 0 );
} );

test( 'damaged enrollment is dropped without a call', async () => {
	await site.php( `
		set_transient( 'site_dispatch_enroll', array(
			'secret'      => str_repeat( 'ab', 32 ),
			'request_id'  => '${ REQUEST_ID }',
			'user_code'   => '${ USER_CODE }',
			'server_host' => 'server.example.test/evil',
			'expires'     => time() + 60,
		), 60 );
		return true;
	` );
	assert.equal( await redeem(), 'none' );
	assert.equal( fake.requests.length, 0 );
	assert.equal( await transient(), false );
} );

test( 'server error during redeem keeps the request', async () => {
	await request();
	fake.redeemAnswer = { status: 500, body: '{"ok":false}' };
	assert.equal( await redeem(), 'retry' );
	fake.redeemAnswer = { status: 429, body: '{"ok":false}' };
	assert.equal( await redeem(), 'retry' );
	assert.notEqual( await transient(), false );
	fake.redeemAnswer = null;
	fake.approve();
	assert.equal( await redeem(), 'connected' );
} );

test( 'redeem answer with a short key is refused', async () => {
	await refused( good( { site_key: CANARY_SITE_KEY.slice( 0, 63 ) } ) );
} );

test( 'redeem answer with an upper case key is refused', async () => {
	await refused( good( { site_key: CANARY_SITE_KEY.toUpperCase() } ) );
} );

test( 'redeem answer with key version as text is refused', async () => {
	await refused( good( { key_version: '1' } ) );
} );

test( 'redeem answer with a website id that is no uuid is refused', async () => {
	await refused( good( { website_id: '../../etc/passwd' } ) );
} );

test( 'redeem answer that is html is refused', async () => {
	await refused( { status: 200, type: 'text/html', body: '<html><body>' + CANARY_SITE_KEY + '</body></html>' } );
} );

test( 'redeem answer of 5 kb is refused', async () => {
	const answer = good();
	answer.body = answer.body + ' '.repeat( 5120 - answer.body.length );
	await refused( answer );
} );

test( 'redeem answer of exactly 4 kb is accepted', async () => {
	await request();
	const answer = good();
	answer.body = answer.body + ' '.repeat( 4096 - answer.body.length );
	fake.redeemAnswer = answer;
	assert.equal( await redeem(), 'connected' );
} );

test( 'redeem answer with a redirect is refused and not followed', async () => {
	await request();
	fake.redeemAnswer = { status: 302, body: '' };
	assert.equal( await redeem(), 'failed' );
	assert.equal( fake.requests.length, 2 );
	assert.equal( await state(), null );
} );

test( 'request answer with a wrong user code is refused', async () => {
	fake.requestAnswer = {
		status: 200,
		body: JSON.stringify( { ok: true, request_id: REQUEST_ID, user_code: '<script>' } ),
	};
	assert.equal( await request(), false );
	assert.equal( await transient(), false );
} );

test( 'request answer other than 200 is refused', async () => {
	for ( const code of [ 401, 202, 500 ] ) {
		fake.requestAnswer = {
			status: code,
			body: JSON.stringify( { ok: true, request_id: REQUEST_ID, user_code: USER_CODE } ),
		};
		assert.equal( await request(), false, 'status ' + code );
		assert.equal( await transient(), false );
	}
} );

test( 'failed request drops an older open enrollment', async () => {
	await request();
	fake.requestAnswer = { status: 401, body: '{"ok":false}' };
	assert.equal( await request(), false );
	assert.equal( await transient(), false );
} );

test( 'host that is not valid never causes a request', async () => {
	const hosts = [
		'http://x.de',
		'https://server.example.test',
		'x.de/path',
		'user@x.de',
		'1.2.3.4',
		'[::1]',
		'localhost',
		'coolify',
		'x.de:8443',
		' server.example.test',
		'xn--80ak6aa92e.com',
		'Server.Example.Test',
		'',
	];
	for ( const host of hosts ) {
		assert.equal( await request( host ), false, host );
	}
	assert.equal( fake.requests.length, 0 );
	assert.equal( await transient(), false );
} );

test( 'second enrollment replaces the connection', async () => {
	await request();
	fake.approve();
	await redeem();
	fake.keyVersion = 2;
	await request();
	fake.approve();
	assert.equal( await redeem(), 'connected' );
	assert.equal( ( await state() ).key_version, 2 );
	assert.equal( ( await site.cron() ).site_dispatch_daily.length, 1 );
} );

test( 'failed second enrollment keeps the old connection', async () => {
	await site.connect();
	await request();
	fake.expire();
	assert.equal( await redeem(), 'failed' );
	assert.equal( ( await state() ).key, CANARY_SITE_KEY );
} );

test( 'state and transient are stored without autoload', async () => {
	await request();
	const open = await site.php( `
		$all = wp_load_alloptions( true );
		return array(
			'names'  => array_values( array_filter( array_keys( $all ), static function ( $name ) {
				return false !== strpos( (string) $name, 'site_dispatch' );
			} ) ),
			'secret' => false !== strpos( serialize( $all ), get_transient( 'site_dispatch_enroll' )['secret'] ),
		);
	` );
	assert.deepEqual( open, { names: [], secret: false } );

	fake.approve();
	await redeem();
	const connected = await site.php( `
		$all = wp_load_alloptions( true );
		return array(
			'state' => array_key_exists( 'site_dispatch_state', $all ),
			'key'   => false !== strpos( serialize( $all ), '${ CANARY_SITE_KEY }' ),
		);
	` );
	assert.deepEqual( connected, { state: false, key: false } );
} );
