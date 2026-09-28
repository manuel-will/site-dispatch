// build-release.mjs and finish-release.mjs against throwaway repositories in a temp folder.
// Nothing here publishes anything: --publish is never passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeKeyPair } from '../../tools/lib/sshsig.mjs';
import { armor, change, commitAll, gitIn, makeRepo, removeFolder, runTool } from './helpers.mjs';

function withRepo( options, body ) {
	const repo = makeRepo( options );
	try {
		return body( repo );
	} finally {
		removeFolder( repo );
	}
}

const sha = ( out ) => /^SHA-512 {3}([0-9a-f]{128})$/m.exec( out )?.[ 1 ];

test( 'build-release builds zip and manifest and says what comes next', () => {
	withRepo( {}, ( repo ) => {
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 0, run.err );
		assert.match( run.out, /^Version {3}0\.1\.0$/m );
		assert.match( run.out, /ssh-keygen\.exe -Y sign/ );
		assert.deepEqual( fs.readdirSync( path.join( repo, 'dist' ) ).sort(), [ 'build.json', 'manifest.json', 'site-dispatch-0.1.0.zip' ] );
		const manifest = JSON.parse( fs.readFileSync( path.join( repo, 'dist', 'manifest.json' ), 'utf8' ) );
		assert.equal( manifest.sha512, sha( run.out ) );
		assert.equal( gitIn( repo, [ 'status', '--porcelain' ] ).trim(), '', 'dist is ignored by git' );
	} );
} );

test( 'build-release gives the same zip twice, and in a second clone of the same commit', () => {
	withRepo( {}, ( repo ) => {
		const first = sha( runTool( 'build-release.mjs', repo ).out );
		const second = sha( runTool( 'build-release.mjs', repo ).out );
		assert.ok( first );
		assert.equal( first, second );
		withRepo( {}, ( other ) => {
			assert.equal( sha( runTool( 'build-release.mjs', other ).out ), first );
		} );
	} );
} );

test( 'build-release refuses with a change that is not committed', () => {
	withRepo( {}, ( repo ) => {
		fs.appendFileSync( path.join( repo, 'uninstall.php' ), '// change\n' );
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: there are changes that are not committed/ );
		assert.ok( ! fs.existsSync( path.join( repo, 'dist' ) ) );
	} );
} );

test( 'build-release refuses with a new file that is not committed', () => {
	withRepo( {}, ( repo ) => {
		fs.writeFileSync( path.join( repo, 'includes', 'extra.php' ), '<?php\n' );
		assert.equal( runTool( 'build-release.mjs', repo ).code, 1 );
	} );
} );

test( 'build-release refuses a version that is not x.y.z', () => {
	withRepo( {}, ( repo ) => {
		const main = path.join( repo, 'site-dispatch.php' );
		change( main, ' * Version:           0.1.0', ' * Version:           0.1' );
		change( main, "const SITE_DISPATCH_VERSION = '0.1.0';", "const SITE_DISPATCH_VERSION = '0.1';" );
		commitAll( repo, 'short version' );
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: Version is not of the form x\.y\.z/ );
	} );
} );

test( 'build-release refuses when header and constant differ', () => {
	withRepo( {}, ( repo ) => {
		change( path.join( repo, 'site-dispatch.php' ), ' * Version:           0.1.0', ' * Version:           0.2.0' );
		commitAll( repo, 'header only' );
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: Header version and constant differ/ );
	} );
} );

test( 'build-release refuses keys that are not the pinned ones', () => {
	withRepo( {}, ( repo ) => {
		const pair = makeKeyPair();
		const file = path.join( repo, 'includes', 'keys.php' );
		const first = /^\t'([A-Za-z0-9+/]{43}=)',$/m.exec( fs.readFileSync( file, 'utf8' ) )[ 1 ];
		change( file, first, pair.publicBase64 );
		commitAll( repo, 'foreign key' );
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: includes\/keys\.php is not the production file/ );
	} );
} );

test( 'build-release refuses a release address that is not the pinned one', () => {
	withRepo( {}, ( repo ) => {
		change( path.join( repo, 'includes', 'source.php' ), 'https://github.com/manuel-will/site-dispatch', 'https://github.example.test/manuel-will/site-dispatch' );
		commitAll( repo, 'test address' );
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: includes\/source\.php is not the production file/ );
	} );
} );

test( 'build-release refuses when the tag exists', () => {
	withRepo( {}, ( repo ) => {
		gitIn( repo, [ 'tag', 'v0.1.0' ] );
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: the tag v0\.1\.0 exists already/ );
	} );
} );

// From here on the repository holds test keys, pinned in its own pins file.
function built( body ) {
	const keys = [ makeKeyPair(), makeKeyPair() ];
	withRepo( { keys }, ( repo ) => {
		const run = runTool( 'build-release.mjs', repo );
		assert.equal( run.code, 0, run.err );
		const dist = path.join( repo, 'dist' );
		const manifest = fs.readFileSync( path.join( dist, 'manifest.json' ) );
		const sign = ( options ) => fs.writeFileSync( path.join( dist, 'manifest.json.sig' ), armor( options ) );
		body( { repo, dist, keys, manifest, sign } );
	} );
}

test( 'finish-release takes the raw signature and uploads nothing', () => {
	built( ( { repo, dist, keys, manifest, sign } ) => {
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: keys[ 0 ].sign( manifest ) } );
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 0, run.err );
		assert.match( run.out, /Nothing was uploaded/ );
		const out = path.join( dist, 'release' );
		assert.deepEqual( fs.readdirSync( out ).sort(), [ 'manifest.json', 'manifest.json.sig', 'site-dispatch-0.1.0.zip' ] );
		assert.ok( fs.readFileSync( path.join( out, 'manifest.json.sig' ) ).equals( keys[ 0 ].sign( manifest ) ) );
		assert.ok( fs.readFileSync( path.join( out, 'manifest.json' ) ).equals( manifest ) );
	} );
} );

test( 'finish-release takes a signature of the reserve key', () => {
	built( ( { repo, keys, manifest, sign } ) => {
		sign( { publicRaw: keys[ 1 ].publicRaw, signature: keys[ 1 ].sign( manifest ) } );
		assert.equal( runTool( 'finish-release.mjs', repo ).code, 0 );
	} );
} );

test( 'finish-release refuses without a signature file', () => {
	built( ( { repo, dist } ) => {
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: dist\/manifest\.json\.sig is missing/ );
		assert.ok( ! fs.existsSync( path.join( dist, 'release' ) ) );
	} );
} );

test( 'finish-release refuses the signature of an unknown key', () => {
	built( ( { repo, dist, manifest, sign } ) => {
		const stranger = makeKeyPair();
		sign( { publicRaw: stranger.publicRaw, signature: stranger.sign( manifest ) } );
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: the signature does not verify/ );
		assert.ok( ! fs.existsSync( path.join( dist, 'release' ) ) );
	} );
} );

test( 'finish-release ignores the key named inside the signature file', () => {
	built( ( { repo, keys, manifest, sign } ) => {
		const stranger = makeKeyPair();
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: stranger.sign( manifest ) } );
		assert.equal( runTool( 'finish-release.mjs', repo ).code, 1 );
	} );
} );

test( 'finish-release refuses a signature over another manifest', () => {
	built( ( { repo, keys, sign } ) => {
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: keys[ 0 ].sign( Buffer.from( '{"other":1}' ) ) } );
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: the signature does not verify/ );
	} );
} );

test( 'finish-release refuses a signature made for another namespace', () => {
	built( ( { repo, keys, manifest, sign } ) => {
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: keys[ 0 ].sign( manifest, 'git' ), namespace: 'git' } );
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: the signature was made for another namespace/ );
	} );
} );

test( 'finish-release refuses a zip that was changed after the build', () => {
	built( ( { repo, dist, keys, manifest, sign } ) => {
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: keys[ 0 ].sign( manifest ) } );
		fs.appendFileSync( path.join( dist, 'site-dispatch-0.1.0.zip' ), 'x' );
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: ZIP or manifest in dist are not what this commit builds/ );
	} );
} );

test( 'finish-release refuses a manifest that was changed after the build', () => {
	built( ( { repo, dist, keys, sign } ) => {
		const file = path.join( dist, 'manifest.json' );
		const forged = Buffer.from( fs.readFileSync( file, 'utf8' ).replace( '"requires_php":"7.4"', '"requires_php":"5.6"' ) );
		fs.writeFileSync( file, forged );
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: keys[ 0 ].sign( forged ) } );
		assert.equal( runTool( 'finish-release.mjs', repo ).code, 1 );
	} );
} );

test( 'finish-release refuses when the commit changed since the build', () => {
	built( ( { repo, keys, manifest, sign } ) => {
		sign( { publicRaw: keys[ 0 ].publicRaw, signature: keys[ 0 ].sign( manifest ) } );
		fs.appendFileSync( path.join( repo, 'README.md' ), '\nmore\n' );
		commitAll( repo, 'later' );
		const run = runTool( 'finish-release.mjs', repo );
		assert.equal( run.code, 1 );
		assert.match( run.err, /^Refused: the commit changed since the build/ );
	} );
} );
