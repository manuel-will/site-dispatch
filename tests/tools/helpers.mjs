// Helpers of the tool tests: a throwaway git repository in a temp folder, an armored signature.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RELEASE_SET, sha256 } from '../../tools/lib/release.mjs';
import { keysFile } from '../../tools/build-test-zip.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
export const ROOT = path.resolve( here, '..', '..' );
export const SSH_KEYGEN = 'C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe';

const IDENTITY = [ '-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false' ];

export function gitIn( repo, args ) {
	return execFileSync( 'git', [ '-C', repo, ...IDENTITY, ...args ], { stdio: [ 'ignore', 'pipe', 'pipe' ] } ).toString( 'utf8' );
}

export function commitAll( repo, message ) {
	gitIn( repo, [ 'add', '-A' ] );
	gitIn( repo, [ 'commit', '-q', '-m', message ] );
}

// A copy of the plugin as its own repository. With keys, keys.php and the pins are replaced.
export function makeRepo( { keys = null } = {} ) {
	const repo = fs.mkdtempSync( path.join( os.tmpdir(), 'site-dispatch-tools-' ) );
	for ( const name of [ ...RELEASE_SET, '.gitattributes', '.gitignore' ] ) {
		fs.cpSync( path.join( ROOT, name ), path.join( repo, name ), { recursive: true } );
	}
	fs.mkdirSync( path.join( repo, 'tools' ) );
	fs.copyFileSync( path.join( ROOT, 'tools', 'production-pins.json' ), path.join( repo, 'tools', 'production-pins.json' ) );
	// Folders that must never reach a release.
	for ( const name of [ 'tests', 'docs' ] ) {
		fs.mkdirSync( path.join( repo, name ) );
		fs.writeFileSync( path.join( repo, name, 'note.txt' ), 'not part of a release\n' );
	}
	if ( keys ) {
		const text = keysFile( keys );
		fs.writeFileSync( path.join( repo, 'includes', 'keys.php' ), text );
		const pins = JSON.parse( fs.readFileSync( path.join( repo, 'tools', 'production-pins.json' ), 'utf8' ) );
		pins[ 'includes/keys.php' ] = sha256( Buffer.from( text, 'utf8' ) );
		fs.writeFileSync( path.join( repo, 'tools', 'production-pins.json' ), JSON.stringify( pins, null, '\t' ) + '\n' );
	}
	execFileSync( 'git', [ '-C', repo, 'init', '-q', '-b', 'main' ], { stdio: 'ignore' } );
	commitAll( repo, 'start' );
	return repo;
}

export function removeFolder( folder ) {
	fs.rmSync( folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } );
}

export function runTool( name, repo, more = [] ) {
	const run = spawnSync( process.execPath, [ path.join( ROOT, 'tools', name ), '--repo', repo, ...more ], { encoding: 'utf8' } );
	return { code: run.status, out: run.stdout, err: run.stderr };
}

export function change( file, from, to ) {
	const text = fs.readFileSync( file, 'utf8' );
	if ( 1 !== text.split( from ).length - 1 ) {
		throw new Error( 'Anchor not found exactly once: ' + from );
	}
	fs.writeFileSync( file, text.replace( from, to ) );
}

function sshString( bytes ) {
	const length = Buffer.alloc( 4 );
	length.writeUInt32BE( bytes.length, 0 );
	return Buffer.concat( [ length, bytes ] );
}

// The file "ssh-keygen -Y sign" would write for that key and raw signature.
export function armor( { publicRaw, signature, namespace = 'site-dispatch-update', type = 'ssh-ed25519' } ) {
	const version = Buffer.alloc( 4 );
	version.writeUInt32BE( 1, 0 );
	const bytes = Buffer.concat( [
		Buffer.from( 'SSHSIG' ),
		version,
		sshString( Buffer.concat( [ sshString( Buffer.from( type ) ), sshString( publicRaw ) ] ) ),
		sshString( Buffer.from( namespace ) ),
		sshString( Buffer.alloc( 0 ) ),
		sshString( Buffer.from( 'sha512' ) ),
		sshString( Buffer.concat( [ sshString( Buffer.from( type ) ), sshString( signature ) ] ) ),
	] );
	const lines = bytes.toString( 'base64' ).match( /.{1,70}/g ).join( '\n' );
	return '-----BEGIN SSH SIGNATURE-----\n' + lines + '\n-----END SSH SIGNATURE-----\n';
}
