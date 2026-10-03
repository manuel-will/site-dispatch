// Text search over the production code for constructs the plugin must never contain.
//
// The attacker knows the source, so the plugin has no code paths that could become one:
// no code execution from data, no inbound endpoints, no writes outside the WordPress upgrader, no
// run-time switch for the public keys or the release address. Every rule lists its allowances
// explicitly, by file and by exact text, so a new occurrence anywhere else fails this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );

const PRODUCTION_PHP = [
	'site-dispatch.php',
	'uninstall.php',
	...fs
		.readdirSync( path.join( ROOT, 'includes' ) )
		.filter( ( name ) => name.endsWith( '.php' ) )
		.sort()
		.map( ( name ) => path.posix.join( 'includes', name ) ),
];

const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );

/**
 * Lines of a file with their 1-based numbers, PHP comments removed so that a rule cannot be
 * satisfied or tripped by prose. Strings are left in place on purpose: a forbidden name inside a
 * string is still a reason to look.
 */
function codeLines( file ) {
	const text = read( file ).replace( /\/\*[\s\S]*?\*\//g, ( block ) => block.replace( /[^\n]/g, ' ' ) );
	return text.split( '\n' ).map( ( line, index ) => ( {
		file,
		number: index + 1,
		text: line.replace( /(^|\s)(\/\/|#).*$/, '$1' ),
	} ) );
}

const ALL_LINES = PRODUCTION_PHP.flatMap( codeLines );

function hits( pattern ) {
	return ALL_LINES.filter( ( line ) => pattern.test( line.text ) ).map( ( line ) => `${ line.file }:${ line.number }: ${ line.text.trim() }` );
}

const FORBIDDEN = [
	[ 'eval', /\beval\s*\(/ ],
	[ 'unserialize (also the WordPress wrapper)', /\b(maybe_)?unserialize\s*\(/ ],
	[ 'assert', /\bassert\s*\(/ ],
	[ 'create_function', /\bcreate_function\b/ ],
	// A variable used as a function name, a dynamic method or property, a dynamic static call.
	// Static properties (Site_Dispatch_Memo::$package) are fixed names and stay allowed.
	[ 'dynamic function or method names', /\$[a-zA-Z_][a-zA-Z0-9_]*\s*\(|->\s*\$[a-zA-Z_]|::\s*\$[a-zA-Z_][a-zA-Z0-9_]*\s*\(/ ],
	// Callbacks named by a value. Closures passed as a variable (array_filter( $list, $keep )) are
	// code, not data, and stay allowed, as are literal names (array_map( 'strval', ... ),
	// function_exists( 'get_plugins' )); array_map and array_walk take the callback first.
	[ 'callbacks named at run time', /\b(call_user_func|call_user_func_array)\s*\(|\b(is_callable|function_exists|array_map|array_walk)\s*\(\s*\$/ ],
	[ 'REST routes', /\bregister_rest_route\b/ ],
	[ 'Ajax for visitors', /wp_ajax_nopriv_/ ],
	[ 'rewrite rules and endpoints', /\b(add_rewrite_rule|add_rewrite_endpoint|add_rewrite_tag)\b/ ],
	[ 'writing files outside the upgrader', /\b(file_put_contents|fopen|fwrite|fputs|unlink|rename|mkdir|rmdir|copy|tempnam|tmpfile|touch|chmod|move_uploaded_file|wp_mkdir_p|unzip_file|WP_Filesystem)\s*\(/ ],
	[ 'reading local files from data', /\b(file_get_contents|file|readfile|fpassthru|parse_ini_file)\s*\(\s*\$/ ],
	[ 'shell and process functions', /\b(shell_exec|exec|system|passthru|popen|proc_open|pcntl_exec)\s*\(/ ],
	[ 'extract into the symbol table', /\bextract\s*\(/ ],
	[ 'filters or actions around keys and the release address', /\b(apply_filters|apply_filters_ref_array|do_action|do_action_ref_array)\s*\(/ ],
	[ 'run-time definition of constants', /\bdefine\s*\(/ ],
	[ 'HTTP from data without the WordPress API', /\b(curl_init|curl_exec|fsockopen|stream_socket_client)\s*\(/ ],
	[ 'preg patterns anchored with $ instead of \\z', /\$[/~#@%!][a-zA-Z]*['"]/ ],
];

for ( const [ name, pattern ] of FORBIDDEN ) {
	test( `production code contains no ${ name }`, () => {
		assert.deepEqual( hits( pattern ), [] );
	} );
}

test( 'include and require only load fixed files: the plugin folder and two wp-admin helpers', () => {
	const statements = ALL_LINES.filter( ( line ) => /\b(include|require)(_once)?\b/.test( line.text ) );
	assert.ok( statements.length >= 10, 'the main file loads the includes with require' );
	const allowed = [
		[ 'site-dispatch.php', /^\s*require __DIR__ \. '\/includes\/[a-z0-9-]+\.php';$/ ],
		[ 'uninstall.php', /^\s*require __DIR__ \. '\/includes\/[a-z0-9-]+\.php';$/ ],
		[ 'includes/report.php', /^\s*require_once ABSPATH \. 'wp-admin\/includes\/plugin\.php';$/ ],
		[ 'includes/updater.php', /^\s*require_once ABSPATH \. 'wp-admin\/includes\/file\.php';$/ ],
	];
	const offending = statements
		.filter( ( line ) => ! allowed.some( ( [ file, pattern ] ) => file === line.file && pattern.test( line.text ) ) )
		.map( ( line ) => `${ line.file }:${ line.number }: ${ line.text.trim() }` );
	assert.deepEqual( offending, [] );
} );

test( 'keys.php holds exactly the two public keys and nothing else', () => {
	const code = codeLines( 'includes/keys.php' ).map( ( line ) => line.text.trim() ).filter( Boolean );
	assert.deepEqual( code, [
		'<?php',
		'const SITE_DISPATCH_PUBLIC_KEYS = array(',
		"'SrtmPWXaVFE/pf493gYke3MPHUsQTkFw9yopZVmu0ps=',",
		"'oC5qEUmBep0woFhjzuN8B3sRxIdRDCSoQNZfxZxEOnc=',",
		');',
	] );
	for ( const key of [ 'SrtmPWXaVFE/pf493gYke3MPHUsQTkFw9yopZVmu0ps=', 'oC5qEUmBep0woFhjzuN8B3sRxIdRDCSoQNZfxZxEOnc=' ] ) {
		assert.equal( Buffer.from( key, 'base64' ).length, 32, 'raw Ed25519 public key' );
	}
} );

test( 'source.php holds exactly the release address on github.com and nothing else', () => {
	const code = codeLines( 'includes/source.php' ).map( ( line ) => line.text.trim() ).filter( Boolean );
	assert.deepEqual( code, [ '<?php', "const SITE_DISPATCH_RELEASE_BASE = 'https://github.com/manuel-will/site-dispatch';" ] );
} );

test( 'the public keys and the release address are read only from their constants', () => {
	const readers = hits( /\b(get_option|get_site_option|get_transient|getenv|\$_(GET|POST|REQUEST|COOKIE|SERVER|ENV))\b.*\b(SITE_DISPATCH_PUBLIC_KEYS|SITE_DISPATCH_RELEASE_BASE)\b/ );
	assert.deepEqual( readers, [] );
	const definers = hits( /\b(SITE_DISPATCH_PUBLIC_KEYS|SITE_DISPATCH_RELEASE_BASE)\b\s*=[^=]/ ).filter(
		( hit ) => ! hit.startsWith( 'includes/keys.php:' ) && ! hit.startsWith( 'includes/source.php:' )
	);
	assert.deepEqual( definers, [] );
} );

test( 'the only Ajax action is the admin-only redeem poll', () => {
	const actions = hits( /add_action\s*\(\s*'wp_ajax_/ );
	assert.deepEqual( actions, [ "site-dispatch.php:78: add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );" ] );
} );

test( 'the admin script never writes HTML and never evaluates code', () => {
	const source = read( 'assets/admin.js' );
	assert.ok( ! /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setTimeout\s*\(\s*['"]/.test( source ) );
} );
