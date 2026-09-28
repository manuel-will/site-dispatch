// Key change: a normal release with new built-in keys, signed by a key the installed version
// already knows. Also the two ways the update source could be bent: http and another key.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeKeyPair, makeRelease, php, startUpdateSite } from './update-kit.mjs';

const contexts = [];

async function start( options ) {
	const ctx = await startUpdateSite( options );
	contexts.push( ctx );
	return ctx;
}

after( async () => {
	for ( const ctx of contexts ) {
		await ctx.stop();
	}
} );

async function install( ctx, published ) {
	ctx.release.publish( published );
	const stored = await ctx.site.php( php.check );
	if ( null === stored ) {
		return 'not taken';
	}
	await ctx.site.php( php.early( true ) );
	const run = await ctx.site.php( php.upgrade );
	return run.installed ? ( await ctx.site.php( php.version ) ).loaded : run.codes.join( ',' );
}

test( 'key change: new keys arrive with a release signed by a known key, old keys stop counting', async () => {
	const ctx = await start();
	const [ a, b ] = ctx.keys;
	const c = makeKeyPair();
	const d = makeKeyPair();

	// Signed by C while the installed version knows A and B.
	assert.equal( await install( ctx, makeRelease( '0.1.1', { builtIn: [ c, d ], signer: c } ) ), 'not taken' );

	// Signed by the reserve key B, carries C and D.
	assert.equal( await install( ctx, makeRelease( '0.1.1', { builtIn: [ c, d ], signer: b } ) ), '0.1.1' );
	const built = await ctx.site.php( `return SITE_DISPATCH_PUBLIC_KEYS;` );
	assert.deepEqual( built, [ c.publicBase64, d.publicBase64 ] );

	// From here on A and B are strangers.
	await ctx.site.reset();
	assert.equal( await install( ctx, makeRelease( '0.1.2', { builtIn: [ c, d ], signer: a } ) ), 'not taken' );
	assert.equal( await install( ctx, makeRelease( '0.1.2', { builtIn: [ c, d ], signer: b } ) ), 'not taken' );

	// And C and D count.
	assert.equal( await install( ctx, makeRelease( '0.1.2', { builtIn: [ c, d ], signer: d } ) ), '0.1.2' );
	await ctx.site.reset();
	assert.equal( await install( ctx, makeRelease( '0.1.3', { builtIn: [ c, d ], signer: c } ) ), '0.1.3' );
} );

test( 'build with an http release address fetches nothing', async () => {
	const ctx = await start( { base: 'http://github.example.test/manuel-will/site-dispatch' } );
	ctx.release.publish( makeRelease( '0.1.1', { builtIn: ctx.keys, signer: ctx.keys[ 0 ] } ) );
	assert.equal( await ctx.site.php( php.check ), null );
	assert.equal( ctx.release.requests.length, 0 );
	assert.equal( await ctx.site.php( `return SITE_DISPATCH_RELEASE_BASE;` ), 'http://github.example.test/manuel-will/site-dispatch' );
} );

test( 'keys and release address cannot be changed at run time', async () => {
	const ctx = contexts[ 0 ];
	await ctx.site.reset();
	const stranger = makeKeyPair();
	ctx.release.publish( makeRelease( '0.9.0', { builtIn: ctx.keys, signer: stranger } ) );
	const seen = await ctx.site.php( `
		// What a hostile plugin or a line in wp-config.php could try.
		$tried = array(
			'define keys'   => @define( 'SITE_DISPATCH_PUBLIC_KEYS', array( '${ stranger.publicBase64 }', '${ stranger.publicBase64 }' ) ),
			'define source' => @define( 'SITE_DISPATCH_RELEASE_BASE', 'https://assets.example.test/evil' ),
		);
		add_filter( 'site_dispatch_public_keys', static fn() => array( base64_decode( '${ stranger.publicBase64 }' ) ) );
		add_filter( 'site_dispatch_release_base', static fn() => 'https://assets.example.test/evil' );
		update_option( 'site_dispatch_public_keys', array( '${ stranger.publicBase64 }' ) );
		update_option( 'site_dispatch_release_base', 'https://assets.example.test/evil' );
		site_dispatch_update_check();
		delete_option( 'site_dispatch_public_keys' );
		delete_option( 'site_dispatch_release_base' );
		return array( 'tried' => $tried, 'stored' => get_option( 'site_dispatch_update', null ) );
	` );
	assert.deepEqual( seen.tried, { 'define keys': false, 'define source': false } );
	assert.equal( seen.stored, null );
	assert.ok( ctx.release.requests.every( ( request ) => request.path.startsWith( '/manuel-will/site-dispatch/' ) || request.path.startsWith( '/asset/manifest' ) ) );
} );
