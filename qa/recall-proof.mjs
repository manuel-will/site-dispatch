// Recall proof on the second instance (plan-plugin.md, phase 9). Publishes a real release, lets
// the pilot site see it, deletes the release again and shows that the pilot drops the waiting
// update and refuses the version for good. One command instead of twelve, with the two waits on
// GitHub's cache that the hand-run chain does not have, and a stop at the first failed step.
//
//   node qa/recall-proof.mjs <version> [--pub <public key>] [--state <folder>] [--preflight]
//
// --preflight runs the checks and stops before the first push; nothing leaves the machine.
// Runs in your own terminal, not from a coding session: signing the manifest and the tag asks the
// SSH agent (1Password) twice. The version is burnt afterwards (a deleted release never comes
// back), so the next real release gets a higher number. Nothing here holds a private key.
//
// Steps: push main, build, sign manifest, finish, sign tag, push tag, publish, wait until
// GitHub serves the version as latest, pilot check (waits), delete release and remote tag, wait
// until the release page is gone, pilot check (recalled), drop the local tag.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const repo = path.resolve( here, '..' );
const args = process.argv.slice( 2 );
const version = args.find( ( arg ) => ! arg.startsWith( '--' ) ) ?? '';
const option = ( name, fallback ) => {
	const at = args.indexOf( name );
	return -1 === at ? fallback : args[ at + 1 ];
};
const pub = path.resolve( option( '--pub', path.join( repo, '..', 'site-dispatch-keys', 'site-dispatch-a.pub' ) ) );
const stateArgs = args.includes( '--state' ) ? [ '--state', option( '--state', '' ) ] : [];
const SSH_KEYGEN = 'C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe';
const REPO_SLUG = 'manuel-will/site-dispatch';
const BASE = 'https://github.com/' + REPO_SLUG;
const TAG = 'v' + version;
const WAIT_MS = 10000;
const WAIT_MAX = 30;

function fail( text ) {
	console.error( '' );
	console.error( 'STOP: ' + text );
	process.exit( 1 );
}

function step( title ) {
	console.log( '' );
	console.log( '== ' + title );
}

function run( file, list, options = {} ) {
	const result = spawnSync( file, list, { cwd: options.cwd ?? repo, stdio: options.capture ? [ 'inherit', 'pipe', 'inherit' ] : 'inherit', encoding: 'utf8', shell: false } );
	if ( result.error ) {
		fail( file + ' could not start: ' + result.error.message );
	}
	if ( 0 !== result.status ) {
		fail( file + ' ' + list.join( ' ' ) + ' ended with status ' + result.status );
	}
	return result.stdout ?? '';
}

function git( list, capture = false ) {
	return run( 'git', list, { capture } );
}

async function status( url, method = 'GET' ) {
	try {
		const answer = await fetch( url, { method, redirect: 'follow', cache: 'no-store', headers: { 'user-agent': 'site-dispatch-recall-proof' } } );
		const text = 'GET' === method ? await answer.text() : '';
		return { status: answer.status, text };
	} catch {
		return { status: 0, text: '' };
	}
}

async function waitFor( title, probe ) {
	for ( let round = 1; round <= WAIT_MAX; round += 1 ) {
		const seen = await probe();
		if ( seen.ok ) {
			console.log( title + ': ' + seen.text + ' (after ' + round + ' look' + ( 1 === round ? '' : 's' ) + ')' );
			return;
		}
		console.log( title + ': not yet, ' + seen.text + ', waiting ' + ( WAIT_MS / 1000 ) + ' s' );
		await new Promise( ( done ) => setTimeout( done, WAIT_MS ) );
	}
	fail( title + ' did not happen within ' + ( WAIT_MAX * WAIT_MS / 1000 ) + ' s.' );
}

function latestVersion( text ) {
	try {
		const manifest = JSON.parse( text );
		return 'string' === typeof manifest.version ? manifest.version : '';
	} catch {
		return '';
	}
}

function pilot( command, quiet = false ) {
	const out = run( 'node', [ path.join( here, 'pilot-instance.mjs' ), command, ...stateArgs ], { capture: true } );
	if ( ! quiet ) {
		process.stdout.write( out );
	}
	const at = out.indexOf( '\n{' );
	if ( -1 === at ) {
		fail( 'the pilot printed nothing readable for ' + command + '.' );
	}
	try {
		return JSON.parse( out.slice( at + 1 ) );
	} catch {
		fail( 'the pilot answer for ' + command + ' is not readable.' );
	}
	return null;
}

function pilotCheck() {
	return pilot( 'check' );
}

// What the pilot itself gets from GitHub. The cache of GitHub's CDN answers this machine and the
// Playground differently for a while (seen 2026-10-15: this machine saw 0.1.3 again, the pilot
// still 0.1.5), so the wait before each check asks the pilot, not GitHub directly.
function pilotSees() {
	const answer = pilot( 'fetch', true );
	return { status: answer.code, version: 200 === answer.code ? latestVersion( answer.body ) : '' };
}

// Preflight: everything that would stop the chain halfway is checked before the first push.
step( 'Preflight' );
if ( ! /^\d+\.\d+\.\d+$/.test( version ) ) {
	fail( 'pass the version, for example: node qa/recall-proof.mjs 0.1.5' );
}
const source = fs.readFileSync( path.join( repo, 'site-dispatch.php' ), 'utf8' );
const header = source.match( /^\s*\*\s*Version:\s*(\d+\.\d+\.\d+)\s*$/m );
if ( null === header || header[ 1 ] !== version ) {
	fail( 'site-dispatch.php says version ' + ( header ? header[ 1 ] : '(none)' ) + ', not ' + version + '.' );
}
if ( '' !== git( [ 'status', '--porcelain' ], true ).trim() ) {
	fail( 'there are changes that are not committed.' );
}
if ( 'main' !== git( [ 'rev-parse', '--abbrev-ref', 'HEAD' ], true ).trim() ) {
	fail( 'not on main.' );
}
if ( '' !== git( [ 'tag', '--list', TAG ], true ).trim() ) {
	fail( 'the tag ' + TAG + ' exists locally. The version is used; raise it.' );
}
if ( '' !== git( [ 'ls-remote', '--tags', 'origin', TAG ], true ).trim() ) {
	fail( 'the tag ' + TAG + ' exists on origin. The version is used; raise it.' );
}
if ( ! fs.existsSync( pub ) ) {
	fail( 'public key not found: ' + pub + ' (pass --pub).' );
}
if ( ! fs.existsSync( SSH_KEYGEN ) ) {
	fail( 'ssh-keygen not found at ' + SSH_KEYGEN + '.' );
}
run( 'gh', [ 'auth', 'status' ] );
const before = await status( BASE + '/releases/latest/download/manifest.json' );
const latestBefore = latestVersion( before.text );
if ( '' === latestBefore ) {
	fail( 'GitHub does not serve a readable latest manifest (HTTP ' + before.status + '). The proof needs a release to fall back to.' );
}
if ( latestBefore === version ) {
	fail( 'GitHub already serves ' + version + ' as latest.' );
}
console.log( 'Version ' + version + ', latest on GitHub is ' + latestBefore + ', key ' + path.basename( pub ) );
if ( args.includes( '--preflight' ) ) {
	console.log( 'Preflight passed. Nothing was pushed.' );
	process.exit( 0 );
}

step( 'Push main' );
git( [ 'push', 'origin', 'main' ] );

step( 'Build' );
run( 'node', [ path.join( repo, 'tools', 'build-release.mjs' ) ] );

step( 'Sign the manifest (the SSH agent asks you now)' );
run( SSH_KEYGEN, [ '-Y', 'sign', '-f', pub, '-n', 'site-dispatch-update', 'manifest.json' ], { cwd: path.join( repo, 'dist' ) } );

step( 'Finish' );
run( 'node', [ path.join( repo, 'tools', 'finish-release.mjs' ) ] );

step( 'Sign and push the tag (the SSH agent asks you again)' );
git( [ 'tag', '-s', TAG, '-m', TAG ] );
git( [ 'push', 'origin', TAG ] );

step( 'Publish' );
run( 'node', [ path.join( repo, 'tools', 'finish-release.mjs' ), '--publish' ] );

step( 'Wait until the pilot gets ' + version + ' as latest' );
await waitFor( 'latest as the pilot sees it', async () => {
	const seen = pilotSees();
	return { ok: seen.version === version, text: 'HTTP ' + seen.status + ', version ' + ( seen.version || '(none)' ) };
} );

step( 'Pilot check 1: the update should wait' );
const first = pilotCheck();
const waiting = first.waiting && first.waiting.version;
if ( waiting !== version || first.high_water !== version ) {
	fail( 'expected waiting ' + version + ' and high_water ' + version + ', got waiting ' + ( waiting || 'null' ) + ' and high_water "' + first.high_water + '".' );
}
console.log( 'OK: ' + version + ' waits, high water ' + first.high_water + '.' );

step( 'Delete the release and the remote tag' );
run( 'gh', [ 'release', 'delete', TAG, '--repo', REPO_SLUG, '--cleanup-tag', '--yes' ] );

step( 'Wait until the release page is gone and latest is back to ' + latestBefore );
await waitFor( 'release page', async () => {
	const seen = await status( BASE + '/releases/tag/' + TAG, 'HEAD' );
	return { ok: 404 === seen.status, text: 'HTTP ' + seen.status };
} );
await waitFor( 'latest as the pilot sees it', async () => {
	const seen = pilotSees();
	return { ok: seen.version === latestBefore, text: 'HTTP ' + seen.status + ', version ' + ( seen.version || '(none)' ) };
} );

step( 'Pilot check 2: the waiting update should be dropped and the version recalled' );
const second = pilotCheck();
if ( null !== second.waiting || second.recalled !== version ) {
	fail( 'expected waiting null and recalled ' + version + ', got waiting ' + JSON.stringify( second.waiting ) + ' and recalled "' + second.recalled + '".' );
}
console.log( 'OK: nothing waits, recalled ' + second.recalled + ', high water ' + second.high_water + '.' );

step( 'Drop the local tag' );
git( [ 'tag', '-d', TAG ] );

console.log( '' );
console.log( 'Recall proof done for ' + version + '. The number is burnt; the next release needs a higher one.' );
