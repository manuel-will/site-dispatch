// Step 2 of a release, after signing. Takes the raw signature out of the file OpenSSH wrote,
// checks everything locally and puts the three release files into dist/release.
//
//   node tools/finish-release.mjs [--repo <folder>] [--publish]
//
// Without --publish nothing leaves this machine. With it the release is created through the
// GitHub CLI (gh) with the login of whoever runs this. Never run --publish from a test.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRelease, checkPins, filesFromCommit, git, readBase, readKeys, sha512 } from './lib/release.mjs';
import { NAMESPACE, readArmored, verifyRaw } from './lib/sshsig.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );

function refuse( text ) {
	console.error( 'Refused: ' + text );
	process.exit( 1 );
}

const at = process.argv.indexOf( '--repo' );
const repo = path.resolve( -1 === at ? path.join( here, '..' ) : process.argv[ at + 1 ] ?? '' );
const publish = process.argv.includes( '--publish' );
const dist = path.join( repo, 'dist' );

let build;
let manifest;
let zip;
let signature;
let base;
try {
	build = JSON.parse( fs.readFileSync( path.join( dist, 'build.json' ), 'utf8' ) );
	manifest = fs.readFileSync( path.join( dist, 'manifest.json' ) );
	zip = fs.readFileSync( path.join( dist, build.zip ) );
} catch {
	refuse( 'dist is incomplete. Run tools/build-release.mjs first.' );
}
let armored;
try {
	armored = fs.readFileSync( path.join( dist, 'manifest.json.sig' ), 'utf8' );
} catch {
	refuse( 'dist/manifest.json.sig is missing. Sign dist/manifest.json first.' );
}

try {
	if ( '' !== git( repo, [ 'status', '--porcelain' ] ).toString( 'utf8' ).trim() ) {
		refuse( 'there are changes that are not committed.' );
	}
	if ( build.commit !== git( repo, [ 'rev-parse', 'HEAD' ] ).toString( 'utf8' ).trim() ) {
		refuse( 'the commit changed since the build. Build again.' );
	}
	const files = filesFromCommit( repo );
	checkPins( files, git( repo, [ 'show', 'HEAD:tools/production-pins.json' ] ).toString( 'utf8' ) );
	const again = buildRelease( files );
	if ( ! again.zip.equals( zip ) || ! again.manifest.equals( manifest ) || sha512( zip ) !== build.sha512 ) {
		refuse( 'ZIP or manifest in dist are not what this commit builds.' );
	}
	const text = ( name ) => files.find( ( file ) => name === file.name ).data.toString( 'utf8' );
	base = readBase( text( 'includes/source.php' ) );
	const read = readArmored( armored );
	if ( NAMESPACE !== read.namespace ) {
		refuse( 'the signature was made for another namespace.' );
	}
	if ( ! verifyRaw( manifest, read.signature, readKeys( text( 'includes/keys.php' ) ) ) ) {
		refuse( 'the signature does not verify against the keys built into the plugin.' );
	}
	signature = read.signature;
} catch ( error ) {
	refuse( error.message.split( '\n' )[ 0 ] );
}

const out = path.join( dist, 'release' );
fs.rmSync( out, { recursive: true, force: true } );
fs.mkdirSync( out, { recursive: true } );
fs.writeFileSync( path.join( out, 'manifest.json' ), manifest );
fs.writeFileSync( path.join( out, 'manifest.json.sig' ), signature );
fs.writeFileSync( path.join( out, build.zip ), zip );

const slug = base.replace( 'https://github.com/', '' );
const tag = 'v' + build.version;
const args = [
	'release', 'create', tag,
	'--repo', slug,
	'--target', build.commit,
	'--title', tag,
	'--notes', 'Site Dispatch ' + build.version,
	path.join( out, 'manifest.json' ),
	path.join( out, 'manifest.json.sig' ),
	path.join( out, build.zip ),
];

console.log( 'Signature verifies. Release files are in dist/release:' );
console.log( '  manifest.json, manifest.json.sig (64 bytes), ' + build.zip );
console.log( '' );
if ( ! publish ) {
	console.log( 'Nothing was uploaded. The commit has to be on GitHub first. To publish:' );
	console.log( '' );
	console.log( '  node tools/finish-release.mjs --publish' );
	process.exit( 0 );
}
execFileSync( 'gh', args, { stdio: 'inherit' } );
console.log( 'Published ' + tag + ' on ' + slug + '.' );
