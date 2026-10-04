// Second instance for the pilot (plan-plugin.md, phase 8). A local WordPress Playground site that
// runs the real release ZIP against the real release page on GitHub, is not connected to any
// server, and has "install updates immediately" off. It shows what every client site does with a
// release: wait, install after 72 hours, drop a deleted release, refuse it for good.
//
// State lives in a folder outside the repository (wp-content with the SQLite database), so every
// command boots a fresh Playground on the same site and exits. Nothing here holds a key, a secret
// or a server address. The site never sends a report, because it is never connected.
//
//   node qa/pilot-instance.mjs install [--zip <file>]   unpack the release ZIP, activate the plugin
//   node qa/pilot-instance.mjs fetch                    ask GitHub for the manifest, print the status
//   node qa/pilot-instance.mjs check                    run the daily update check once, print state
//   node qa/pilot-instance.mjs state                    print the update state without a check
//   node qa/pilot-instance.mjs i01                      I-01: a foreign updater injects an entry for
//                                                       site-dispatch, the plugin strips it on read
//   node qa/pilot-instance.mjs i01-off                  remove the I-01 shim again
//   node qa/pilot-instance.mjs reset                    delete the state folder (a new site next time)
//
// Options: --state <folder> (default ../site-dispatch-pilot next to the repository).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCLI } from '@wp-playground/cli';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const repo = path.resolve( here, '..' );
const args = process.argv.slice( 2 );
const command = args.find( ( arg ) => ! arg.startsWith( '--' ) ) ?? 'state';
const option = ( name, fallback ) => {
	const at = args.indexOf( name );
	return -1 === at ? fallback : args[ at + 1 ];
};
const stateDir = path.resolve( option( '--state', path.join( repo, '..', 'site-dispatch-pilot' ) ) );
const PLUGIN_FILE = 'site-dispatch/site-dispatch.php';
const MU_SHIM = 'site-dispatch-i01-shim.php';

function phpString( value ) {
	return "'" + String( value ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) + "'";
}

function newestZip() {
	const dir = path.join( repo, 'dist', 'release' );
	const names = fs.existsSync( dir ) ? fs.readdirSync( dir ).filter( ( name ) => /^site-dispatch-\d+\.\d+\.\d+\.zip$/.test( name ) ) : [];
	if ( 0 === names.length ) {
		throw new Error( 'No release ZIP in dist/release. Pass --zip <file>.' );
	}
	return path.join( dir, names.sort().pop() );
}

if ( 'reset' === command ) {
	fs.rmSync( stateDir, { recursive: true, force: true } );
	console.log( 'State folder removed: ' + stateDir );
	process.exit( 0 );
}

const wpContent = path.join( stateDir, 'wp-content' );
const dropDir = path.join( stateDir, 'drop' );
const muDir = path.join( wpContent, 'mu-plugins' );
const fresh = ! fs.existsSync( path.join( wpContent, 'database' ) );
fs.mkdirSync( wpContent, { recursive: true } );
fs.mkdirSync( dropDir, { recursive: true } );
fs.mkdirSync( muDir, { recursive: true } );

if ( 'install' === command ) {
	const zip = path.resolve( option( '--zip', '' ) || newestZip() );
	fs.copyFileSync( zip, path.join( dropDir, 'release.zip' ) );
	console.log( 'ZIP ' + zip + ' (' + fs.statSync( zip ).size + ' bytes)' );
}

// I-01: what a foreign updater on the same site could do. WordPress asks every plugin's Update URI
// host through the filter update_plugins_<host>; a plugin that hooks update_plugins_github.com for
// its own purposes could answer for site-dispatch too. The shim does exactly that, and keeps the
// request to api.wordpress.org off the network so the run is deterministic.
const SHIM = `<?php
// PILOT TEST ONLY (I-01). Pretends to be a foreign updater that answers for site-dispatch.
add_filter(
	'update_plugins_github.com',
	static function ( $update, $plugin_data, $plugin_file ) {
		if ( 'site-dispatch/site-dispatch.php' !== $plugin_file ) {
			return $update;
		}
		return array(
			'id'          => 'https://github.com/evil/site-dispatch',
			'slug'        => 'site-dispatch',
			'plugin'      => $plugin_file,
			'version'     => '99.0.0',
			'url'         => 'https://github.com/evil/site-dispatch',
			'package'     => 'https://github.com/evil/site-dispatch/releases/download/v99.0.0/site-dispatch-99.0.0.zip',
			'requires'    => '6.0',
			'tested'      => '7.0',
			'requires_php' => '7.4',
		);
	},
	10,
	3
);
add_filter(
	'pre_http_request',
	static function ( $pre, $args, $url ) {
		if ( false !== strpos( $url, 'api.wordpress.org/plugins/update-check' ) ) {
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'headers'  => array(),
				'body'     => '{"plugins":{},"no_update":{},"translations":[]}',
				'cookies'  => array(),
			);
		}
		return $pre;
	},
	10,
	3
);
`;

if ( 'i01' === command ) {
	fs.writeFileSync( path.join( muDir, MU_SHIM ), SHIM );
}
if ( 'i01-off' === command ) {
	fs.rmSync( path.join( muDir, MU_SHIM ), { force: true } );
	console.log( 'I-01 shim removed. Clearing the stored update list it wrote to.' );
}

const cli = await runCLI( {
	command: 'server',
	port: 0,
	workers: 1,
	quiet: true,
	login: false,
	skipBrowser: true,
	'wordpress-install-mode': fresh ? 'download-and-install' : 'install-from-existing-files-if-needed',
	'mount-before-install': [ { hostPath: wpContent, vfsPath: '/wordpress/wp-content' } ],
	mount: [ { hostPath: dropDir, vfsPath: '/tmp/site-dispatch-drop' } ],
	define: { DISABLE_WP_CRON: '1', WP_ENVIRONMENT_TYPE: 'production' },
} );
await fetch( cli.serverUrl + '/', { redirect: 'manual' } );

async function php( code ) {
	const run = await cli.playground.run( {
		code: `<?php
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/update.php';
ob_start();
$pilot_result = ( static function () {
${ code }
} )();
$pilot_noise = ob_get_clean();
echo "\\n<<<RESULT>>>" . json_encode( array( 'result' => $pilot_result, 'noise' => $pilot_noise ) );
`,
	} );
	const text = run.text;
	const at = text.lastIndexOf( '<<<RESULT>>>' );
	if ( -1 === at ) {
		throw new Error( 'PHP gave no result: ' + text.slice( 0, 2000 ) + ' ' + ( run.errors ?? '' ) );
	}
	const parsed = JSON.parse( text.slice( at + 12 ) );
	const noise = ( text.slice( 0, at ) + parsed.noise ).trim();
	if ( '' !== noise ) {
		console.log( 'PHP printed: ' + noise.slice( 0, 2000 ) );
	}
	return parsed.result;
}

const STATE = `
	wp_cache_flush();
	$stored = get_option( 'site_dispatch_update', null );
	$early = (bool) get_option( 'site_dispatch_early_updates', false );
	$list = get_site_transient( 'update_plugins' );
	$raw = get_option( '_site_transient_update_plugins' );
	$own = static function ( $value ) {
		if ( ! is_object( $value ) || ! isset( $value->response ) || ! is_array( $value->response ) ) {
			return null;
		}
		if ( ! isset( $value->response[ 'site-dispatch/site-dispatch.php' ] ) ) {
			return null;
		}
		$entry = (array) $value->response[ 'site-dispatch/site-dispatch.php' ];
		return array( 'new_version' => $entry['new_version'] ?? null, 'package' => $entry['package'] ?? null );
	};
	return array(
		'installed'        => defined( 'SITE_DISPATCH_VERSION' ) ? SITE_DISPATCH_VERSION : null,
		'active'           => is_plugin_active( 'site-dispatch/site-dispatch.php' ),
		'early_updates'    => $early,
		'waiting'          => is_array( $stored ) ? array(
			'version'    => $stored['version'] ?? null,
			'first_seen' => isset( $stored['first_seen'] ) ? gmdate( 'c', (int) $stored['first_seen'] ) : null,
			'due'        => function_exists( 'site_dispatch_update_due' ) && isset( $stored['first_seen'] ) ? site_dispatch_update_due( (int) $stored['first_seen'], time(), $early ) : null,
		) : null,
		'high_water'       => get_option( 'site_dispatch_high_water', '' ),
		'recalled'         => get_option( 'site_dispatch_recalled', '' ),
		'offered_filtered' => $own( $list ),
		'offered_raw'      => $own( $raw ),
		'wp'               => get_bloginfo( 'version' ),
		'php'              => PHP_VERSION,
	);
`;

try {
	if ( 'install' === command ) {
		const result = await php( `
			WP_Filesystem();
			$target = WP_PLUGIN_DIR . '/site-dispatch';
			if ( is_dir( $target ) ) {
				return 'already installed, version ' . get_plugin_data( $target . '/site-dispatch.php', false, false )['Version'];
			}
			$done = unzip_file( '/tmp/site-dispatch-drop/release.zip', WP_PLUGIN_DIR );
			if ( is_wp_error( $done ) ) {
				return 'unzip failed ' . $done->get_error_message();
			}
			$active = activate_plugin( 'site-dispatch/site-dispatch.php' );
			if ( is_wp_error( $active ) ) {
				return 'activation failed ' . $active->get_error_message();
			}
			return 'installed and active, version ' . get_plugin_data( $target . '/site-dispatch.php', false, false )['Version'];
		` );
		console.log( result );
	} else if ( 'fetch' === command ) {
		const result = await php( `
			$url = site_dispatch_release_url( SITE_DISPATCH_RELEASE_BASE, 'manifest.json' );
			$answer = site_dispatch_fetch( $url, 8192 );
			return array( 'url' => $url, 'code' => $answer['code'], 'bytes' => strlen( $answer['body'] ), 'error' => $answer['error'] ?? '' );
		` );
		console.log( JSON.stringify( result, null, 2 ) );
	} else if ( 'check' === command ) {
		console.log( 'Update check at ' + new Date().toISOString() );
		await php( 'site_dispatch_update_check(); return true;' );
	} else if ( 'i01' === command ) {
		console.log( 'I-01 shim installed. Running wp_update_plugins() with the foreign updater active.' );
		await php( `
			delete_site_transient( 'update_plugins' );
			wp_update_plugins();
			return true;
		` );
	} else if ( 'i01-off' === command ) {
		await php( `
			delete_site_transient( 'update_plugins' );
			return true;
		` );
	}
	if ( 'install' !== command ) {
		const state = await php( STATE );
		console.log( JSON.stringify( state, null, 2 ) );
		if ( 'i01' === command ) {
			const injected = state.offered_raw && '99.0.0' === state.offered_raw.new_version;
			const stripped = null === state.offered_filtered || '99.0.0' !== state.offered_filtered.new_version;
			console.log( 'injected into the stored list: ' + ( injected ? 'yes' : 'no' ) );
			console.log( 'visible after the plugin filtered the list: ' + ( stripped ? 'no' : 'YES, I-01 FAILED' ) );
		}
	}
} finally {
	await cli[ Symbol.asyncDispose ]();
}
