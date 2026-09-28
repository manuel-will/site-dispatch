// Test build. Replaces exactly two files of the plugin, includes/keys.php and
// includes/source.php, and sets the version. Keys are made at run time, no private key is ever
// written to disk. Used by the integration tests, never for a release.
//
//   node tools/build-test-zip.mjs <target folder> [version]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SLUG, filesFromFolder, manifestBytes, readMain, releaseZip, setVersion, sha512 } from './lib/release.mjs';
import { makeKeyPair } from './lib/sshsig.mjs';

export { makeKeyPair };
export const TEST_BASE = 'https://github.example.test/manuel-will/site-dispatch';

export function keysFile( keys ) {
	return [
		'<?php',
		'/**',
		' * TEST BUILD. Public keys made at run time of a test.',
		' *',
		' * @package Site_Dispatch',
		' */',
		'',
		'/**',
		' * First and second test key.',
		' */',
		'const SITE_DISPATCH_PUBLIC_KEYS = array(',
		...keys.map( ( key ) => "\t'" + key.publicBase64 + "'," ),
		');',
		'',
	].join( '\n' );
}

export function sourceFile( base ) {
	return [
		'<?php',
		'/**',
		' * TEST BUILD. Made up release address.',
		' *',
		' * @package Site_Dispatch',
		' */',
		'',
		'/**',
		' * Address the test reroute sends to the fake.',
		' */',
		"const SITE_DISPATCH_RELEASE_BASE = '" + base + "';",
		'',
	].join( '\n' );
}

// Files of the test build, from the plugin in the folder "source".
export function testFiles( source, { version, keys, base = TEST_BASE } ) {
	if ( 2 !== keys.length ) {
		throw new Error( 'A build holds exactly two keys.' );
	}
	return filesFromFolder( source ).map( ( file ) => {
		if ( 'includes/keys.php' === file.name ) {
			return { name: file.name, data: Buffer.from( keysFile( keys ), 'utf8' ) };
		}
		if ( 'includes/source.php' === file.name ) {
			return { name: file.name, data: Buffer.from( sourceFile( base ), 'utf8' ) };
		}
		if ( 'site-dispatch.php' === file.name && version ) {
			return { name: file.name, data: Buffer.from( setVersion( file.data.toString( 'utf8' ), version ), 'utf8' ) };
		}
		return file;
	} );
}

export function writeFiles( files, target ) {
	for ( const file of files ) {
		const full = path.join( target, file.name );
		fs.mkdirSync( path.dirname( full ), { recursive: true } );
		fs.writeFileSync( full, file.data );
	}
}

// A release of the test build: ZIP, manifest and raw signature.
export function testRelease( files, signer ) {
	const main = files.find( ( file ) => 'site-dispatch.php' === file.name );
	const { version, requiresWp, requiresPhp } = readMain( main.data.toString( 'utf8' ) );
	const zip = releaseZip( files );
	const manifest = manifestBytes( { version, zipHash: sha512( zip ), requiresWp, requiresPhp } );
	return { version, zip, zipName: SLUG + '-' + version + '.zip', manifest, signature: signer.sign( manifest ) };
}

if ( process.argv[ 1 ] && import.meta.url === pathToFileURL( process.argv[ 1 ] ).href ) {
	const target = process.argv[ 2 ];
	if ( ! target ) {
		console.error( 'Usage: node tools/build-test-zip.mjs <target folder> [version]' );
		process.exit( 1 );
	}
	const source = path.join( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
	const keys = [ makeKeyPair(), makeKeyPair() ];
	const files = testFiles( source, { version: process.argv[ 3 ], keys } );
	const release = testRelease( files, keys[ 0 ] );
	fs.mkdirSync( target, { recursive: true } );
	fs.writeFileSync( path.join( target, release.zipName ), release.zip );
	fs.writeFileSync( path.join( target, 'manifest.json' ), release.manifest );
	fs.writeFileSync( path.join( target, 'manifest.json.sig' ), release.signature );
	console.log( 'Test release ' + release.version + ' written to ' + target + '. Its keys are gone with this process.' );
}
