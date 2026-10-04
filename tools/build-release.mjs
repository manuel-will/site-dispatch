// Step 1 of a release. Builds the ZIP and manifest.json from the last commit and stops.
// Signing is not done here and not from a Claude session. See README.md, "Release".
//
//   node tools/build-release.mjs [--repo <folder>]
//
// Output: dist/site-dispatch-<version>.zip, dist/manifest.json, dist/build.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelease, checkPins, checkReleaseSet, filesFromCommit, git, sha512 } from './lib/release.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );

function refuse( text ) {
	console.error( 'Refused: ' + text );
	process.exit( 1 );
}

const at = process.argv.indexOf( '--repo' );
const repo = path.resolve( -1 === at ? path.join( here, '..' ) : process.argv[ at + 1 ] ?? '' );

let release;
let commit;
try {
	if ( '' !== git( repo, [ 'status', '--porcelain' ] ).toString( 'utf8' ).trim() ) {
		refuse( 'there are changes that are not committed. A release is built from a commit.' );
	}
	commit = git( repo, [ 'rev-parse', 'HEAD' ] ).toString( 'utf8' ).trim();
	const files = filesFromCommit( repo );
	checkReleaseSet( files );
	checkPins( files, git( repo, [ 'show', 'HEAD:tools/production-pins.json' ] ).toString( 'utf8' ) );
	release = buildRelease( files );
	if ( '' !== git( repo, [ 'tag', '--list', 'v' + release.version ] ).toString( 'utf8' ).trim() ) {
		refuse( 'the tag v' + release.version + ' exists already. Raise the version first.' );
	}
} catch ( error ) {
	refuse( error.message.split( '\n' )[ 0 ] );
}

const dist = path.join( repo, 'dist' );
fs.rmSync( dist, { recursive: true, force: true } );
fs.mkdirSync( dist, { recursive: true } );
fs.writeFileSync( path.join( dist, release.zipName ), release.zip );
fs.writeFileSync( path.join( dist, 'manifest.json' ), release.manifest );
fs.writeFileSync(
	path.join( dist, 'build.json' ),
	JSON.stringify( { version: release.version, commit, zip: release.zipName, sha512: sha512( release.zip ) }, null, '\t' ) + '\n'
);

console.log( 'Version   ' + release.version );
console.log( 'Commit    ' + commit );
console.log( 'ZIP       dist/' + release.zipName + ' (' + release.zip.length + ' bytes)' );
console.log( 'SHA-512   ' + sha512( release.zip ) );
console.log( '' );
console.log( 'Next, in your own terminal, with no Claude session running, inside the folder dist:' );
console.log( '' );
console.log( '  C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe -Y sign -f <path to site-dispatch-a.pub> -n site-dispatch-update manifest.json' );
console.log( '' );
console.log( 'That writes dist/manifest.json.sig. Then: node tools/finish-release.mjs' );
