// What a release is made of: the file set, the version, the manifest bytes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipStore } from './zip.mjs';

export const SLUG = 'site-dispatch';
export const ZIP_MAX_BYTES = 2097152;
export const MANIFEST_MAX_BYTES = 8192;
// Top level names of a release in the working folder. The commit decides (export-ignore in
// .gitattributes), a test holds the two against each other.
export const RELEASE_SET = [ 'LICENSE', 'README.md', 'assets', 'includes', 'site-dispatch.php', 'uninstall.php' ];

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const REQUIRES = /^[0-9]+\.[0-9]+(\.[0-9]+)?$/;

export const sha256 = ( bytes ) => crypto.createHash( 'sha256' ).update( bytes ).digest( 'hex' );
export const sha512 = ( bytes ) => crypto.createHash( 'sha512' ).update( bytes ).digest( 'hex' );

export function git( repo, args, options = {} ) {
	return execFileSync( 'git', [ '-C', repo, ...args ], { maxBuffer: 64 * 1024 * 1024, stdio: [ 'ignore', 'pipe', 'pipe' ], ...options } );
}

function field( header, from, length ) {
	const part = header.subarray( from, from + length );
	const end = part.indexOf( 0 );
	return part.subarray( 0, -1 === end ? length : end ).toString( 'utf8' );
}

// Files of a tar archive as "git archive" writes it.
export function readTar( bytes ) {
	const files = [];
	let at = 0;
	while ( at + 512 <= bytes.length ) {
		const header = bytes.subarray( at, at + 512 );
		if ( header.every( ( byte ) => 0 === byte ) ) {
			break;
		}
		const name = field( header, 0, 100 );
		const size = parseInt( field( header, 124, 12 ).trim() || '0', 8 );
		const type = String.fromCharCode( header[ 156 ] );
		const prefix = field( header, 345, 155 );
		at += 512;
		const data = Buffer.from( bytes.subarray( at, at + size ) );
		at += Math.ceil( size / 512 ) * 512;
		if ( '0' === type || '\0' === type ) {
			files.push( { name: prefix ? prefix + '/' + name : name, data } );
		} else if ( 'g' !== type && '5' !== type ) {
			throw new Error( 'Unexpected entry in the archive.' );
		}
	}
	return files.sort( ( left, right ) => Buffer.compare( Buffer.from( left.name ), Buffer.from( right.name ) ) );
}

// The files of a commit that belong to a release, as git would export them.
export function filesFromCommit( repo, ref = 'HEAD' ) {
	return readTar( git( repo, [ 'archive', '--format=tar', ref ] ) );
}

// The same set read from a folder, for the test build and for comparing.
export function filesFromFolder( root ) {
	const files = [];
	const walk = ( relative ) => {
		const full = path.join( root, relative );
		if ( fs.statSync( full ).isDirectory() ) {
			for ( const name of fs.readdirSync( full ) ) {
				walk( relative + '/' + name );
			}
			return;
		}
		files.push( { name: relative, data: fs.readFileSync( full ) } );
	};
	for ( const name of RELEASE_SET ) {
		if ( fs.existsSync( path.join( root, name ) ) ) {
			walk( name );
		}
	}
	return files.sort( ( left, right ) => Buffer.compare( Buffer.from( left.name ), Buffer.from( right.name ) ) );
}

function one( text, pattern, what ) {
	const hits = [ ...text.matchAll( pattern ) ];
	if ( 1 !== hits.length ) {
		throw new Error( what + ' not found exactly once in site-dispatch.php.' );
	}
	return hits[ 0 ][ 1 ];
}

// Version and minimum versions from the main file. Header and constant have to agree.
export function readMain( text ) {
	const header = one( text, /^ \* Version:[ \t]+(\S+)[ \t]*$/gm, 'Header "Version"' );
	const constant = one( text, /^const SITE_DISPATCH_VERSION = '([^']*)';$/gm, 'Constant SITE_DISPATCH_VERSION' );
	const requiresWp = one( text, /^ \* Requires at least:[ \t]+(\S+)[ \t]*$/gm, 'Header "Requires at least"' );
	const requiresPhp = one( text, /^ \* Requires PHP:[ \t]+(\S+)[ \t]*$/gm, 'Header "Requires PHP"' );
	if ( header !== constant ) {
		throw new Error( 'Header version and constant differ.' );
	}
	if ( ! VERSION.test( header ) || header.includes( '\n' ) ) {
		throw new Error( 'Version is not of the form x.y.z.' );
	}
	if ( ! REQUIRES.test( requiresWp ) || ! REQUIRES.test( requiresPhp ) ) {
		throw new Error( 'Minimum versions are not of the form x.y or x.y.z.' );
	}
	return { version: header, requiresWp, requiresPhp };
}

export function setVersion( text, version ) {
	const before = readMain( text );
	return text
		.replace( /^( \* Version:[ \t]+)\S+([ \t]*)$/m, '$1' + version + '$2' )
		.replace( "const SITE_DISPATCH_VERSION = '" + before.version + "';", "const SITE_DISPATCH_VERSION = '" + version + "';" );
}

// The two raw public keys of a keys.php.
export function readKeys( text ) {
	const hits = [ ...text.matchAll( /^\t'([A-Za-z0-9+/]{43}=)',$/gm ) ];
	if ( 2 !== hits.length ) {
		throw new Error( 'keys.php does not hold exactly two keys.' );
	}
	return hits.map( ( hit ) => Buffer.from( hit[ 1 ], 'base64' ) );
}

export function readBase( text ) {
	return one( text, /^const SITE_DISPATCH_RELEASE_BASE = '([^']*)';$/gm, 'Release address' );
}

// Exactly the seven fields of the contract, no line break at the end.
export function manifestBytes( { version, zipHash, requiresWp, requiresPhp } ) {
	return Buffer.from(
		JSON.stringify( {
			schema: 1,
			slug: SLUG,
			version,
			zip: SLUG + '-' + version + '.zip',
			sha512: zipHash,
			requires_wp: requiresWp,
			requires_php: requiresPhp,
		} ),
		'utf8'
	);
}

export function releaseZip( files ) {
	return zipStore( files.map( ( file ) => ( { name: SLUG + '/' + file.name, data: file.data } ) ) );
}

// Builds ZIP and manifest from a list of files.
export function buildRelease( files ) {
	const main = files.find( ( file ) => 'site-dispatch.php' === file.name );
	if ( ! main ) {
		throw new Error( 'site-dispatch.php is missing.' );
	}
	const { version, requiresWp, requiresPhp } = readMain( main.data.toString( 'utf8' ) );
	const zip = releaseZip( files );
	if ( zip.length > ZIP_MAX_BYTES ) {
		throw new Error( 'The ZIP is larger than 2 MB.' );
	}
	const manifest = manifestBytes( { version, zipHash: sha512( zip ), requiresWp, requiresPhp } );
	return { version, zip, zipName: SLUG + '-' + version + '.zip', manifest };
}

// Every top level name of the export has to be in RELEASE_SET. A new folder in the repository
// that is not export-ignored in .gitattributes would otherwise ship inside the plugin ZIP.
export function checkReleaseSet( files ) {
	const stray = [ ...new Set( files.map( ( file ) => file.name.split( '/' )[ 0 ] ) ) ].filter( ( name ) => ! RELEASE_SET.includes( name ) );
	if ( 0 !== stray.length ) {
		throw new Error( 'not part of a release, add export-ignore in .gitattributes: ' + stray.join( ', ' ) );
	}
}

export function checkPins( files, pinsText ) {
	const pins = JSON.parse( pinsText );
	for ( const name of [ 'includes/keys.php', 'includes/source.php' ] ) {
		const file = files.find( ( entry ) => name === entry.name );
		if ( ! file || 'string' !== typeof pins[ name ] || sha256( file.data ) !== pins[ name ] ) {
			throw new Error( name + ' is not the production file (tools/production-pins.json).' );
		}
	}
}
