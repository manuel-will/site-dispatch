// Red proof for tests/static/forbidden.test.mjs and tests/js/admin.test.mjs: copy the plugin repo
// (without vendor and node_modules), apply one mutation per case to the copy, run the suite,
// expect the named case to fail. The repo itself is never written.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run: node qa/static-red-runs.mjs   (from the repo root, about a minute)
const REPO = dirname( dirname( fileURLToPath( import.meta.url ) ) );
const ADMIN = 'assets/admin.js';

const CASES = [
	// forbidden.test.mjs
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no eval', file: 'includes/common.php', search: '<?php', replace: "<?php\n$x = eval( '1;' );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no unserialize (also the WordPress wrapper)', file: 'includes/enroll.php', search: '<?php', replace: "<?php\n$x = maybe_unserialize( $y );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no assert', file: 'includes/common.php', search: '<?php', replace: "<?php\nassert( true );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no create_function', file: 'includes/common.php', search: '<?php', replace: "<?php\n$f = create_function( '', '' );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no dynamic function or method names', file: 'includes/common.php', search: '<?php', replace: "<?php\n$name( 1 );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no callbacks named at run time', file: 'includes/common.php', search: '<?php', replace: "<?php\ncall_user_func( $cb );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no REST routes', file: 'includes/admin.php', search: '<?php', replace: "<?php\nregister_rest_route( 'x', 'y', array() );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no Ajax for visitors', file: 'site-dispatch.php', search: "add_action( 'wp_ajax_site_dispatch_redeem'", replace: "add_action( 'wp_ajax_nopriv_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );\nadd_action( 'wp_ajax_site_dispatch_redeem'" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no rewrite rules and endpoints', file: 'includes/admin.php', search: '<?php', replace: "<?php\nadd_rewrite_rule( 'a', 'b' );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no writing files outside the upgrader', file: 'includes/updater.php', search: '<?php', replace: "<?php\nfile_put_contents( $p, $d );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no reading local files from data', file: 'includes/report.php', search: '<?php', replace: "<?php\n$x = file_get_contents( $path );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no shell and process functions', file: 'includes/common.php', search: '<?php', replace: "<?php\nexec( $cmd );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no extract into the symbol table', file: 'includes/common.php', search: '<?php', replace: "<?php\nextract( $_POST );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no filters or actions around keys and the release address', file: 'includes/updater.php', search: '<?php', replace: "<?php\n$keys = apply_filters( 'site_dispatch_keys', SITE_DISPATCH_PUBLIC_KEYS );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no run-time definition of constants', file: 'includes/source.php', search: '<?php', replace: "<?php\ndefine( 'SITE_DISPATCH_RELEASE_BASE', $url );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no HTTP from data without the WordPress API', file: 'includes/updater.php', search: '<?php', replace: "<?php\n$ch = curl_init( $url );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'production code contains no preg patterns anchored with $ instead of \\z', file: 'includes/verify.php', search: "const SITE_DISPATCH_VERSION_PATTERN    = '/^[0-9]+\\.[0-9]+\\.[0-9]+\\z/';", replace: "const SITE_DISPATCH_VERSION_PATTERN    = '/^[0-9]+\\.[0-9]+\\.[0-9]+$/';" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'include and require only load fixed files: the plugin folder and two wp-admin helpers', file: 'includes/admin.php', search: '<?php', replace: "<?php\nrequire $plugin_file;" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'keys.php holds exactly the two public keys and nothing else', file: 'includes/keys.php', search: "'oC5qEUmBep0woFhjzuN8B3sRxIdRDCSoQNZfxZxEOnc=',", replace: "'oC5qEUmBep0woFhjzuN8B3sRxIdRDCSoQNZfxZxEOnc=',\n\t'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',", },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'source.php holds exactly the release address on github.com and nothing else', file: 'includes/source.php', search: 'https://github.com/manuel-will/site-dispatch', replace: 'https://github.com/someone-else/site-dispatch' },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'the public keys and the release address are read only from their constants', file: 'includes/updater.php', search: '<?php', replace: "<?php\n$SITE_DISPATCH_RELEASE_BASE = get_option( 'site_dispatch_source', SITE_DISPATCH_RELEASE_BASE );" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'the only Ajax action is the admin-only redeem poll', file: 'site-dispatch.php', search: "add_action( 'wp_ajax_site_dispatch_redeem'", replace: "add_action( 'wp_ajax_site_dispatch_export', 'site_dispatch_ajax_export' );\nadd_action( 'wp_ajax_site_dispatch_redeem'" },
	{ suite: 'tests/static/forbidden.test.mjs', name: 'the admin script never writes HTML and never evaluates code', file: ADMIN, search: 'status.textContent = text;', replace: 'status.innerHTML = text;' },
	// admin.test.mjs
	{ suite: 'tests/js/admin.test.mjs', name: 'without the config object the script does nothing', file: ADMIN, search: 'if ( ! config ) {\n\t\treturn;\n\t}', replace: 'if ( ! config ) {\n\t\tconfig = {};\n\t}' },
	{ suite: 'tests/js/admin.test.mjs', name: 'polls admin-ajax with the redeem action, the nonce and same-origin credentials', file: ADMIN, search: "credentials: 'same-origin'", replace: "credentials: 'include'" },
	{ suite: 'tests/js/admin.test.mjs', name: 'pending and retry keep polling and show the waiting text', file: ADMIN, search: "if ( 'pending' === data.status || 'retry' === data.status ) {", replace: "if ( 'pending' === data.status ) {" },
	{ suite: 'tests/js/admin.test.mjs', name: 'connected stops polling and reloads the plugin page', file: ADMIN, search: 'window.location.assign( config.pageUrl );', replace: 'window.location.assign( config.ajaxUrl );' },
	{ suite: 'tests/js/admin.test.mjs', name: 'any other status stops polling and shows the failed text', file: ADMIN, search: 'stop();\n\t\t\t\tshow( config.textFailed );', replace: 'show( config.textFailed );' },
	{ suite: 'tests/js/admin.test.mjs', name: 'a response without a status counts as failure, not as connected', file: ADMIN, search: "if ( 'connected' === data.status ) {", replace: "if ( 'pending' !== data.status && 'retry' !== data.status && 'failed' !== data.status ) {" },
	{ suite: 'tests/js/admin.test.mjs', name: 'a network error shows the waiting text and keeps polling', file: ADMIN, search: '.catch( function () {\n\t\t\t\tshow( config.textWaiting );', replace: '.catch( function () {\n\t\t\t\tstop();\n\t\t\t\tshow( config.textFailed );' },
	{ suite: 'tests/js/admin.test.mjs', name: 'after maxTime the script stops without another request and shows the paused text', file: ADMIN, search: 'if ( Date.now() - started > config.maxTime ) {', replace: 'if ( Date.now() - started > config.maxTime * 1000 ) {' },
	{ suite: 'tests/js/admin.test.mjs', name: 'the check button triggers a poll immediately', file: ADMIN, search: "button.addEventListener( 'click', check );", replace: "button.addEventListener( 'click', stop );" },
	{ suite: 'tests/js/admin.test.mjs', name: 'a page without the button still polls', file: ADMIN, search: 'if ( button ) {\n\t\tbutton.addEventListener', replace: 'if ( ! button ) {\n\t\tstop();\n\t}\n\tif ( button ) {\n\t\tbutton.addEventListener' },
	{ suite: 'tests/js/admin.test.mjs', name: 'server text is written as text, never as HTML', file: ADMIN, search: 'status.textContent = text;', replace: 'status.innerHTML = text;' },
];

const base = mkdtempSync( join( tmpdir(), 'sd-static-red-' ) );
const copy = join( base, 'repo' );
cpSync( REPO, copy, { recursive: true, filter: ( src ) => ! /[\\/](vendor|node_modules|\.git)([\\/]|$)/.test( src ) } );

const rows = [];
for ( const c of CASES ) {
	const target = join( copy, c.file );
	const original = readFileSync( target, 'utf8' );
	if ( ! original.includes( c.search ) ) {
		rows.push( `| ${ c.suite } | ${ c.name } | ${ c.file } | ANCHOR MISSING |` );
		continue;
	}
	writeFileSync( target, original.replace( c.search, c.replace ) );
	const run = spawnSync( 'node', [ '--test', '--test-reporter=tap', c.suite ], { cwd: copy, encoding: 'utf8' } );
	writeFileSync( target, original );
	const out = run.stdout + run.stderr;
	// TAP doubles backslashes in test names.
	const tapName = c.name.replace( /\\/g, '\\\\' );
	const failedTarget = new RegExp( `not ok \\d+ - ${ tapName.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) }` ).test( out );
	const otherFails = ( out.match( /^not ok \d+ - .*/gm ) || [] ).length - ( failedTarget ? 1 : 0 );
	rows.push( `| ${ c.suite } | ${ c.name } | ${ c.file } | ${ failedTarget ? 'yes' : 'NO' } | ${ otherFails } |` );
}
rmSync( base, { recursive: true, force: true } );

console.log( '| Suite | Case | Mutated file | Red | Other cases red |' );
console.log( '|---|---|---|---|---|' );
for ( const row of rows ) console.log( row );
const red = rows.filter( ( r ) => r.includes( '| yes |' ) ).length;
console.log( `\n${ red } of ${ CASES.length } cases red` );
process.exit( red === CASES.length ? 0 : 1 );
