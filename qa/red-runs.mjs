// QA: show every test red before it counts as green.
//
// Copies the repository (without .git, node_modules, vendor, dist, qa) to a temp folder, applies
// one realistic mutation at a time to the PRODUCTION code of that copy, runs the relevant test
// command against the copy and records that the targeted case failed while the unmutated copy
// stays green. The checkout is never written: every file outside the skipped folders is hashed
// before and after.
//
// Three kinds of tests, three ways to run them against the copy:
//   php          vendor/bin/phpunit of this checkout with the copy's phpunit.xml.dist (bootstrap
//                loads the copy's includes/*.php), one run per mutation, all 199 cases.
//   tools        node --test of the copy's tests/tools (they resolve ../../tools inside the copy).
//   integration  node --test of THIS checkout's tests/integration/<file> with
//                SITE_DISPATCH_TEST_SOURCE pointing at the copy (harness.mjs copies the plugin
//                and builds the test build from there). Slow: one Playground site per file.
//
// Mutations live in qa/red-runs-mutations.mjs. Entry: { kind, target, file, search, replace,
// reason } or edits: [{ file, search, replace }] when one bug touches more than one place (the
// reason says why). spec names the integration test file. expect: 'survive' marks a coverage
// gap: a realistic bug the test cannot see; it is reported and does not fail the run.
//
// Run:  node qa/red-runs.mjs                          everything
//       node qa/red-runs.mjs --kinds=php,tools          fast kinds only
//       node qa/red-runs.mjs --kinds=integration --budget=120   stop starting new integration
//                                                       mutations after 120 minutes
//       node qa/red-runs.mjs --only=<substring>         only mutations whose target matches
//       node qa/red-runs.mjs --kinds=integration --specs=update-install.test.mjs   one test file
//       node qa/red-runs.mjs --kinds=integration --limit=10 --skip=earlier.err      continue a split run
//       QA_TMP=<dir>                                    place the copy somewhere else
import { cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { M } from './red-runs-mutations.mjs';

const ROOT = dirname( dirname( fileURLToPath( import.meta.url ) ) );
const SKIP = new Set( [ '.git', 'node_modules', 'vendor', 'dist', 'qa', '.phpunit.result.cache' ] );
const PHPUNIT = join( ROOT, 'vendor', 'phpunit', 'phpunit', 'phpunit' );
const INTEGRATION_FILES = [ 'hygiene', 'smoke', 'silent', 'uninstall', 'update-keys', 'report', 'enroll', 'admin', 'update-check', 'update-offer', 'update-install' ].map( ( n ) => n + '.test.mjs' );

const arg = ( name, fallback ) => {
	const hit = process.argv.find( ( a ) => a.startsWith( '--' + name + '=' ) );
	return hit ? hit.slice( name.length + 3 ) : fallback;
};
const KINDS = arg( 'kinds', 'php,tools,integration' ).split( ',' );
const ONLY = arg( 'only', '' );
// --specs=update-install.test.mjs,update-keys.test.mjs limits the integration files (to split a
// long run over two processes).
const SPECS = arg( 'specs', '' ) ? arg( 'specs', '' ).split( ',' ) : null;
const BUDGET_MS = Number( arg( 'budget', '0' ) ) * 60000;
// --limit=N runs at most N mutations in this invocation (the rest is listed as not run), and
// --skip=<log>,<log> takes the stderr logs of earlier invocations: a mutation that was RED or gap
// there is not run again and reported from the log. Together they let a long Playground run be
// split into pieces that fit a session (a background command here dies after two hours).
const LIMIT = Number( arg( 'limit', '0' ) );
const SKIP_LOGS = arg( 'skip', '' ) ? arg( 'skip', '' ).split( ',' ) : [];
const earlier = new Map();
for ( const log of SKIP_LOGS ) {
	for ( const line of readFileSync( log, 'utf8' ).split( /\r?\n/ ) ) {
		const m = /^(RED|gap|MISS) {2}(.+?) \/ (.+?)(?: \(from .*\))?$/.exec( line );
		if ( ! m ) {
			continue;
		}
		const key = m[ 2 ] + ' / ' + m[ 3 ];
		if ( 'MISS' !== m[ 1 ] || ! earlier.has( key ) ) {
			earlier.set( key, { state: m[ 1 ], log: log.split( /[\\/]/ ).pop() } );
		}
	}
}
let ran = 0;
const started = Date.now();

const fail = ( msg ) => { console.error( 'QA ABORT: ' + msg ); process.exit( 2 ); };
const count = ( hay, needle ) => hay.split( needle ).length - 1;
const editsOf = ( m ) => ( m.edits ? m.edits : [ { file: m.file, search: m.search, replace: m.replace } ] );
const esc = ( s ) => String( s ).replace( /\|/g, '\\|' ).replace( /\n/g, ' ' );
const short = ( list ) => list.map( ( o ) => o.name + ( 'not run' === o.how ? ' (not run)' : '' ) ).join( '; ' );
const filesOf = ( m ) => [ ...new Set( editsOf( m ).map( ( e ) => e.file ) ) ].join( ', ' );

const exec = ( cmd, args, options ) => new Promise( ( resolve ) => {
	execFile( cmd, args, { maxBuffer: 64 * 1024 * 1024, ...options }, ( err, stdout, stderr ) => {
		resolve( { code: err ? ( err.code ?? 1 ) : 0, stdout: String( stdout ), stderr: String( stderr ) } );
	} );
} );

const walk = ( dir, out = [] ) => {
	for ( const name of readdirSync( dir ) ) {
		if ( SKIP.has( name ) ) {
			continue;
		}
		const p = join( dir, name );
		if ( statSync( p ).isDirectory() ) {
			walk( p, out );
		} else {
			out.push( p );
		}
	}
	return out;
};
const snapshot = () => Object.fromEntries( walk( ROOT ).map( ( p ) => [ relative( ROOT, p ).split( sep ).join( '/' ), createHash( 'sha256' ).update( readFileSync( p ) ).digest( 'hex' ) ] ) );

// ---------- runners: each returns { ok: Set<name>, fail: Map<name, detail>, raw } ----------
const decode = ( s ) => s.replace( /&quot;/g, '"' ).replace( /&apos;/g, "'" ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' );

async function runPhp( copy ) {
	const log = join( copy, 'qa-junit.xml' );
	const r = await exec( 'php', [ PHPUNIT, '-c', join( copy, 'phpunit.xml.dist' ), '--do-not-cache-result', '--log-junit', log ], { cwd: copy, timeout: 300000 } );
	const ok = new Set();
	const failed = new Map();
	const xml = existsSync( log ) ? readFileSync( log, 'utf8' ) : '';
	for ( const m of xml.matchAll( /<testcase name="([^"]*)" class="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g ) ) {
		const name = decode( m[ 2 ] + '::' + m[ 1 ] );
		const body = m[ 4 ] || '';
		if ( '/>' === m[ 3 ] || ! /<(failure|error)/.test( body ) ) {
			ok.add( name );
		} else {
			const detail = /<(?:failure|error)[^>]*>([^\n]*)/.exec( body );
			failed.set( name, decode( detail ? detail[ 1 ].trim() : 'failed' ) );
		}
	}
	// A fatal error leaves no junit file: every expected case counts as not run.
	return { ok, fail: failed, code: r.code, stderr: r.stderr + ( xml ? '' : r.stdout ) };
}

function parseTap( stdout ) {
	const ok = new Set();
	const failed = new Map();
	const lines = stdout.split( /\r?\n/ );
	for ( let i = 0; i < lines.length; i++ ) {
		const m = /^\s*(not )?ok \d+ - (.*?)(?: # (?:SKIP|TODO).*)?$/.exec( lines[ i ] );
		if ( ! m ) {
			continue;
		}
		const name = m[ 2 ];
		if ( m[ 1 ] ) {
			const detail = lines.slice( i + 1, i + 12 ).find( ( l ) => /^\s*(error|message):/.test( l ) );
			failed.set( name, detail ? detail.trim() : 'failed' );
		} else {
			ok.add( name );
		}
	}
	return { ok, fail: failed };
}

async function runTools( copy ) {
	const files = readdirSync( join( copy, 'tests', 'tools' ) ).filter( ( f ) => f.endsWith( '.test.mjs' ) ).map( ( f ) => join( copy, 'tests', 'tools', f ) );
	const r = await exec( process.execPath, [ '--test', '--test-reporter=tap', ...files ], { cwd: copy, timeout: 600000 } );
	return { ...parseTap( r.stdout ), code: r.code, stderr: r.stderr };
}

async function runIntegration( spec, copy ) {
	const r = await exec( process.execPath, [ '--test', '--test-concurrency=1', '--test-reporter=tap', join( ROOT, 'tests', 'integration', spec ) ], {
		cwd: ROOT,
		timeout: 1800000,
		env: { ...process.env, SITE_DISPATCH_TEST_SOURCE: copy },
	} );
	const parsed = parseTap( r.stdout );
	// describe() blocks report as cases of their own, they are not test cases.
	const src = readFileSync( join( ROOT, 'tests', 'integration', spec ), 'utf8' );
	for ( const d of src.matchAll( /describe\(\s*'((?:[^'\\]|\\.)*)'/g ) ) {
		parsed.ok.delete( d[ 1 ] );
		parsed.fail.delete( d[ 1 ] );
	}
	return { ...parsed, code: r.code, stderr: r.stderr };
}

// ---------- copy ----------
const before = snapshot();
const copy = mkdtempSync( join( process.env.QA_TMP || tmpdir(), 'site-dispatch-qa-' ) );
cpSync( ROOT, copy, { recursive: true, filter: ( src ) => ! SKIP.has( src.split( /[\\/]/ ).pop() ) } );
console.error( 'copy: ' + copy );

const mutate = ( m ) => {
	const pristine = new Map();
	for ( const e of editsOf( m ) ) {
		const path = join( copy, e.file );
		if ( ! pristine.has( path ) ) {
			pristine.set( path, readFileSync( path, 'utf8' ) );
		}
		const current = readFileSync( path, 'utf8' );
		const hits = count( current, e.search );
		if ( 1 !== hits ) {
			for ( const [ p, text ] of pristine ) {
				writeFileSync( p, text );
			}
			fail( 'search string matches ' + hits + ' times in ' + e.file + ' (target ' + m.target + '): ' + e.search );
		}
		writeFileSync( path, current.replace( e.search, () => e.replace ) );
	}
	return () => {
		for ( const [ p, text ] of pristine ) {
			writeFileSync( p, text );
			if ( readFileSync( p, 'utf8' ) !== text ) {
				fail( 'restore failed for ' + p );
			}
		}
	};
};

const notOk = ( baseline, res ) => [ ...baseline ].filter( ( c ) => ! res.ok.has( c ) ).map( ( c ) => ( { name: c, how: res.fail.has( c ) ? 'fail' : 'not run' } ) );

const rows = [];
const skipped = [];
const baselines = {};

async function kindRun( kind, label, runner, mutations ) {
	const base = await runner();
	if ( 0 !== base.code && 0 === base.ok.size ) {
		fail( 'unmutated ' + label + ' did not run (exit ' + base.code + ')\n' + base.stderr );
	}
	if ( base.fail.size ) {
		fail( 'unmutated ' + label + ' is not green: ' + [ ...base.fail.keys() ].join( ', ' ) );
	}
	baselines[ label ] = base.ok;
	for ( const m of mutations ) {
		if ( 'survive' !== m.expect && ! base.ok.has( m.target ) ) {
			fail( 'mutation targets unknown case ' + label + ' / ' + m.target );
		}
	}
	for ( const m of mutations ) {
		const seen = earlier.get( label + ' / ' + m.target );
		if ( seen && 'MISS' !== seen.state ) {
			const red = 'RED' === seen.state;
			rows.push( { ...m, label, red, how: 'earlier run', detail: 'from the log of an earlier invocation (' + seen.log + ')', others: [], reds: red ? [ { name: m.target, how: 'fail' } ] : [] } );
			console.error( ( red ? 'RED  ' : 'gap  ' ) + label + ' / ' + m.target + ' (from ' + seen.log + ')' );
			continue;
		}
		if ( ( BUDGET_MS && Date.now() - started > BUDGET_MS ) || ( LIMIT && ran >= LIMIT ) ) {
			skipped.push( m );
			continue;
		}
		ran += 1;
		const restore = mutate( m );
		let res;
		try {
			res = await runner();
		} finally {
			restore();
		}
		const reds = notOk( base.ok, res );
		const target = reds.find( ( r ) => r.name === m.target );
		const others = reds.filter( ( r ) => r !== target );
		const detail = target ? ( 'fail' === target.how ? res.fail.get( m.target ) : 'not run (suite crashed' + ( res.stderr ? ': ' + res.stderr.trim().split( /\r?\n/ ).find( ( l ) => /rror/.test( l ) ) : '' ) + ')' ) : '';
		rows.push( { ...m, label, red: Boolean( target ), how: target && target.how, detail, others, reds } );
		console.error( ( target ? 'RED  ' : ( 'survive' === m.expect ? 'gap  ' : 'MISS ' ) ) + label + ' / ' + m.target );
	}
	// Green again after the last restore.
	const after = await runner();
	if ( after.fail.size ) {
		fail( label + ' not green after restoring: ' + [ ...after.fail.keys() ].join( ', ' ) );
	}
	report( label );
}

const pick = ( kind ) => M.filter( ( m ) => m.kind === kind && ( ! ONLY || m.target.includes( ONLY ) ) );

if ( KINDS.includes( 'php' ) ) {
	await kindRun( 'php', 'phpunit', () => runPhp( copy ), pick( 'php' ) );
}
if ( KINDS.includes( 'tools' ) ) {
	await kindRun( 'tools', 'tools', () => runTools( copy ), pick( 'tools' ) );
}
if ( KINDS.includes( 'integration' ) ) {
	for ( const spec of INTEGRATION_FILES.filter( ( s ) => ! SPECS || SPECS.includes( s ) ) ) {
		const mutations = pick( 'integration' ).filter( ( m ) => m.spec === spec );
		if ( ! mutations.length ) {
			continue;
		}
		if ( BUDGET_MS && Date.now() - started > BUDGET_MS ) {
			skipped.push( ...mutations );
			continue;
		}
		await kindRun( 'integration', spec, () => runIntegration( spec, copy ), mutations );
	}
}

rmSync( copy, { recursive: true, force: true } );
const afterSnap = snapshot();
const changed = Object.keys( { ...before, ...afterSnap } ).filter( ( p ) => before[ p ] !== afterSnap[ p ] );

// ---------- report: one section per label, printed as soon as that label is done ----------
function report( label ) {
	const mine = rows.filter( ( r ) => r.label === label );
	console.log( '\n## ' + label + '\n' );
	console.log( '| # | Case | File | Mutation reason | Red | Other cases red |' );
	console.log( '|---|---|---|---|---|---|' );
	let i = 0;
	for ( const r of mine.filter( ( x ) => 'survive' !== x.expect ) ) {
		i += 1;
		console.log( '| ' + i + ' | ' + esc( r.target ) + ' | ' + filesOf( r ) + ' | ' + esc( r.reason ) + ' | ' + ( r.red ? 'yes (' + r.how + ')' : '**NO**' ) + ' | ' + esc( short( r.others ) ) + ' |' );
	}
	const gaps = mine.filter( ( x ) => 'survive' === x.expect );
	if ( gaps.length ) {
		console.log( '\nCoverage gap mutations (expected to survive):\n' );
		console.log( '| Case | File | Mutation reason | Survived |' );
		console.log( '|---|---|---|---|' );
		for ( const r of gaps ) {
			console.log( '| ' + esc( r.target ) + ' | ' + filesOf( r ) + ' | ' + esc( r.reason ) + ' | ' + ( r.reds.length ? 'no, red: ' + esc( short( r.reds ) ) : 'yes' ) + ' |' );
		}
	}
	const redSet = new Set( mine.filter( ( r ) => 'survive' !== r.expect && r.red ).map( ( r ) => r.target ) );
	const total = baselines[ label ].size;
	const without = [ ...baselines[ label ] ].filter( ( c ) => ! redSet.has( c ) );
	console.log( '\nCases: ' + total + ', shown red: ' + redSet.size + ', mutations run: ' + mine.length );
	if ( without.length ) {
		console.log( 'Not shown red:\n  ' + without.join( '\n  ' ) );
	}
}
if ( skipped.length ) {
	console.log( '\n## Not run (time budget or --limit)\n' );
	for ( const m of skipped ) {
		console.log( '- ' + m.spec + ' / ' + m.target );
	}
}
console.log( '\nRepo files changed during the run: ' + ( changed.length ? changed.join( ', ' ) : 'none' ) );
console.log( 'Runtime: ' + Math.round( ( Date.now() - started ) / 60000 ) + ' min' );
if ( changed.length ) {
	console.error( 'WARNING: files changed during the run (another process, or the harness): ' + changed.join( ', ' ) );
}
const misses = rows.filter( ( r ) => 'survive' !== r.expect && ! r.red );
process.exit( misses.length ? 1 : 0 );
