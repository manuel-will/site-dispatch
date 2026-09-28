// The daily check: what is fetched how, what is stored, what drops a waiting update.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_HOST, RELEASE_HOST } from './fake-release.mjs';
import { HOURS_72, makeRelease, php, releaseAround, startUpdateSite } from './update-kit.mjs';

let ctx;
let site;
let release;
let keys;

before( async () => {
	ctx = await startUpdateSite();
	( { site, release, keys } = ctx );
} );

after( async () => {
	await ctx?.stop();
} );

beforeEach( async () => {
	await site.reset();
} );

const good = ( version = '0.1.1', signer = keys[ 0 ] ) => makeRelease( version, { builtIn: keys, signer } );
const check = () => site.php( php.check );
const now = () => Math.floor( Date.now() / 1000 );

function flip( bytes, at = 0 ) {
	const copy = Buffer.from( bytes );
	copy[ at ] ^= 1;
	return copy;
}

async function storedAfter( published ) {
	release.publish( published );
	return check();
}

test( 'activation plans the daily check, also without a connection', async () => {
	assert.equal( await site.php( `return get_option( 'site_dispatch_state', null );` ), null );
	const cron = await site.cron();
	assert.equal( cron.site_dispatch_update_check.length, 1 );
	assert.equal( cron.site_dispatch_daily, undefined );
	assert.equal( await site.php( `return wp_get_schedule( 'site_dispatch_update_check' );` ), 'daily' );
} );

test( 'the cron hook runs the check', async () => {
	release.publish( good() );
	await site.php( `do_action( 'site_dispatch_update_check' ); return true;` );
	assert.equal( ( await site.php( php.stored ) ).version, '0.1.1' );
} );

test( 'valid release is stored with manifest, signature, version and local time', async () => {
	const published = good();
	const started = now();
	const stored = await storedAfter( published );
	assert.deepEqual( Object.keys( stored ).sort(), [ 'first_seen', 'manifest', 'sig', 'version' ] );
	assert.equal( stored.manifest, published.manifest.toString( 'base64' ) );
	assert.equal( stored.sig, published.signature.toString( 'base64' ) );
	assert.equal( stored.version, '0.1.1' );
	assert.ok( stored.first_seen >= started - 5 && stored.first_seen <= now() + 5 );
	const autoload = await site.php( `
		global $wpdb;
		return $wpdb->get_var( "SELECT autoload FROM {$wpdb->options} WHERE option_name = 'site_dispatch_update'" );
	` );
	assert.ok( [ 'no', 'off' ].includes( autoload ), 'autoload is ' + autoload );
} );

test( 'release signed with the reserve key is stored', async () => {
	assert.equal( ( await storedAfter( good( '0.1.1', keys[ 1 ] ) ) ).version, '0.1.1' );
} );

test( 'every request is https, with tls check, without automatic redirects and size limited', async () => {
	await storedAfter( good() );
	const seen = release.requests.map( ( request ) => request.host + ' ' + request.path );
	assert.deepEqual( seen, [
		RELEASE_HOST + ' /manuel-will/site-dispatch/releases/latest/download/manifest.json',
		ASSET_HOST + ' /asset/manifest.json',
		RELEASE_HOST + ' /manuel-will/site-dispatch/releases/latest/download/manifest.json.sig',
		ASSET_HOST + ' /asset/manifest.json.sig',
	] );
	const args = ( limit ) => ( { sslverify: true, redirection: 0, timeout: 15, limit_response_size: limit, reject_unsafe_urls: true } );
	assert.deepEqual( release.requests.map( ( request ) => request.args ), [ args( 8193 ), args( 8193 ), args( 65 ), args( 65 ) ] );
	assert.ok( release.requests.every( ( request ) => 'GET' === request.method && 0 === request.body.length ) );
} );

test( 'manifest without a signature file stores nothing', async () => {
	const published = good();
	release.publish( { ...published, signature: null } );
	assert.equal( await check(), null );
} );

test( 'signature of an unknown key stores nothing', async () => {
	assert.equal( await storedAfter( good( '0.1.1', ctx.stranger ) ), null );
} );

test( 'one flipped bit in the manifest stores nothing', async () => {
	const published = good();
	// Flips a bit inside the hash, the manifest stays well formed.
	const at = published.manifest.indexOf( '"sha512":"' ) + 12;
	const forged = Buffer.from( published.manifest );
	forged[ at ] = 'a'.charCodeAt( 0 ) === forged[ at ] ? 'b'.charCodeAt( 0 ) : 'a'.charCodeAt( 0 );
	assert.equal( await storedAfter( { ...published, manifest: forged } ), null );
} );

test( 'one flipped bit in the signature stores nothing', async () => {
	const published = good();
	assert.equal( await storedAfter( { ...published, signature: flip( published.signature, 10 ) } ), null );
} );

test( 'signature of 63 and of 65 bytes stores nothing', async () => {
	const published = good();
	assert.equal( await storedAfter( { ...published, signature: published.signature.subarray( 0, 63 ) } ), null );
	assert.equal( await storedAfter( { ...published, signature: Buffer.concat( [ published.signature, Buffer.from( 'x' ) ] ) } ), null );
	assert.equal( await storedAfter( { ...published, signature: Buffer.alloc( 0 ) } ), null );
} );

test( 'signature made for the namespace git stores nothing', async () => {
	const published = good();
	assert.equal( await storedAfter( { ...published, signature: keys[ 0 ].sign( published.manifest, 'git' ) } ), null );
} );

test( 'armored signature file instead of the raw bytes stores nothing', async () => {
	const published = good();
	const armored = Buffer.from( '-----BEGIN SSH SIGNATURE-----\n' + published.signature.toString( 'base64' ) + '\n-----END SSH SIGNATURE-----\n' );
	assert.equal( await storedAfter( { ...published, signature: armored } ), null );
} );

test( 'same and lower version store nothing', async () => {
	assert.equal( await storedAfter( good( '0.1.0' ) ), null );
	assert.equal( await storedAfter( good( '0.0.9' ) ), null );
} );

test( 'version is compared by numbers', async () => {
	assert.equal( ( await storedAfter( good( '0.1.10' ) ) ).version, '0.1.10' );
	assert.equal( ( await storedAfter( good( '0.10.0' ) ) ).version, '0.10.0' );
} );

test( 'signed manifest with a foreign slug stores nothing', async () => {
	const base = good();
	assert.equal( await storedAfter( releaseAround( '0.1.1', base.zip, keys[ 0 ], { slug: 'other-plugin' } ) ), null );
} );

test( 'signed manifest with a path, an address or no version as file name stores nothing', async () => {
	const base = good();
	for ( const zip of [ '../site-dispatch-0.1.1.zip', 'https://evil.example.test/site-dispatch-0.1.1.zip', 'site-dispatch.zip', 'site-dispatch-0.1.2.zip' ] ) {
		assert.equal( await storedAfter( releaseAround( '0.1.1', base.zip, keys[ 0 ], { zip } ) ), null, zip );
	}
} );

test( 'signed manifest with an extra field against the waiting period stores nothing', async () => {
	const base = good();
	assert.equal( await storedAfter( releaseAround( '0.1.1', base.zip, keys[ 0 ], { first_seen: 0 } ) ), null );
	assert.equal( await storedAfter( releaseAround( '0.1.1', base.zip, keys[ 0 ], { wait: 0 } ) ), null );
} );

test( 'signed manifest that needs a newer wordpress or php stores nothing', async () => {
	const base = good();
	assert.equal( await storedAfter( releaseAround( '0.1.1', base.zip, keys[ 0 ], { requires_wp: '99.0' } ) ), null );
	assert.equal( await storedAfter( releaseAround( '0.1.1', base.zip, keys[ 0 ], { requires_php: '99.0' } ) ), null );
} );

test( 'manifest of 8192 bytes is taken, one byte more is not', async () => {
	const base = good();
	const padded = ( length ) => {
		const manifest = Buffer.concat( [ base.manifest, Buffer.alloc( length - base.manifest.length, 0x20 ) ] );
		return { ...base, manifest, signature: keys[ 0 ].sign( manifest ) };
	};
	assert.equal( ( await storedAfter( padded( 8192 ) ) ).version, '0.1.1' );
	await site.reset();
	assert.equal( await storedAfter( padded( 8193 ) ), null );
	assert.equal( await storedAfter( padded( 9000 ) ), null );
} );

test( 'redirect to http is not followed', async () => {
	release.redirectTo = ( file ) => 'http://' + ASSET_HOST + '/asset/' + file;
	assert.equal( await storedAfter( good() ), null );
	assert.equal( release.to( ASSET_HOST ).length, 0 );
	assert.equal( release.to( RELEASE_HOST ).length, 1, 'the signature is not asked for after a refused manifest' );
} );

test( 'redirect to a relative address, another port or an address with a user is not followed', async () => {
	for ( const target of [ '/asset/', 'https://' + ASSET_HOST + ':8443/asset/', 'https://user@' + ASSET_HOST + '/asset/', '//' + ASSET_HOST + '/asset/' ] ) {
		await site.reset();
		release.redirectTo = ( file ) => target + file;
		assert.equal( await storedAfter( good() ), null, target );
		assert.equal( release.to( ASSET_HOST ).length, 0, target );
	}
} );

test( 'five redirects are followed, the sixth is not', async () => {
	release.extraHops = 4;
	assert.equal( ( await storedAfter( good() ) ).version, '0.1.1' );
	await site.reset();
	release.extraHops = 5;
	assert.equal( await storedAfter( good() ), null );
	assert.equal( release.requests.length, 6, 'gives up after six requests' );
} );

test( 'second check of the same release keeps the local time', async () => {
	await storedAfter( good() );
	const aged = await site.php( php.age( 1000 ) );
	const again = await check();
	assert.equal( again.first_seen, aged );
} );

test( 'new version starts the clock again', async () => {
	await storedAfter( good() );
	const aged = await site.php( php.age( HOURS_72 ) );
	const next = await storedAfter( good( '0.1.2' ) );
	assert.equal( next.version, '0.1.2' );
	assert.ok( next.first_seen > aged + HOURS_72 - 60 );
} );

test( 'other bytes for the same version start the clock again', async () => {
	const first = good();
	await storedAfter( first );
	const aged = await site.php( php.age( HOURS_72 ) );
	const replaced = releaseAround( '0.1.1', Buffer.concat( [ first.zip ] ), keys[ 0 ], { requires_php: '7.4.0' } );
	const next = await storedAfter( replaced );
	assert.equal( next.manifest, replaced.manifest.toString( 'base64' ) );
	assert.ok( next.first_seen > aged + HOURS_72 - 60 );
} );

test( 'deleted release drops the waiting update', async () => {
	await storedAfter( good() );
	release.remove();
	assert.equal( await check(), null );
} );

test( 'release that was replaced by an older one drops the waiting update', async () => {
	await storedAfter( good() );
	assert.equal( await storedAfter( good( '0.1.0' ) ), null );
} );

test( 'server that does not answer keeps the waiting update', async () => {
	const stored = await storedAfter( good() );
	release.down = true;
	assert.deepEqual( await check(), stored );
} );

test( 'server error keeps the waiting update', async () => {
	const stored = await storedAfter( good() );
	for ( const status of [ 500, 503, 429, 403 ] ) {
		release.status = status;
		assert.deepEqual( await check(), stored, 'status ' + status );
	}
} );

test( 'invalid release keeps the waiting update', async () => {
	const stored = await storedAfter( good() );
	assert.deepEqual( await storedAfter( good( '0.1.2', ctx.stranger ) ), stored );
	const published = good( '0.1.2' );
	assert.deepEqual( await storedAfter( { ...published, signature: null } ), stored );
} );

test( 'admin page shows the waiting update and when it installs', async () => {
	const admin = await site.login( 'administrator' );
	const stored = await storedAfter( good() );
	const when = await site.php( `return wp_date( 'Y-m-d H:i', ${ stored.first_seen } + 72 * HOUR_IN_SECONDS );` );
	let page = await site.fetch( admin, '/wp-admin/tools.php?page=site-dispatch' );
	assert.equal( page.status, 200 );
	assert.ok( page.body.includes( '<td>0.1.1, installs from ' + when + '</td>' ) );

	await site.php( php.early( true ) );
	page = await site.fetch( admin, '/wp-admin/tools.php?page=site-dispatch' );
	assert.ok( page.body.includes( '<td>0.1.1, installs at the next check</td>' ) );
} );

test( 'admin page shows no update whose signature does not hold', async () => {
	const admin = await site.login( 'administrator' );
	const published = good( '0.1.1', ctx.stranger );
	await site.php( `
		add_option( 'site_dispatch_update', array(
			'manifest'   => '${ published.manifest.toString( 'base64' ) }',
			'sig'        => '${ published.signature.toString( 'base64' ) }',
			'version'    => '0.1.1',
			'first_seen' => time(),
		), '', false );
		return true;
	` );
	const page = await site.fetch( admin, '/wp-admin/tools.php?page=site-dispatch' );
	assert.ok( page.body.includes( '<th scope="row">Waiting update</th><td>None</td>' ) );
} );
