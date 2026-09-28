// Starts a WordPress Playground site with the plugin, runs PHP inside it and drives wp-admin.
// Passwords are created at run time. Nothing here talks to anything but 127.0.0.1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCLI } from '@wp-playground/cli';
import { CANARY_SITE_KEY, CANARY_WEBSITE_ID } from './fake-server.mjs';
import { RELEASE_SET } from '../../tools/lib/release.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
// SITE_DISPATCH_TEST_SOURCE points the tests at another copy of the plugin, for red runs with a
// mutated copy. Default is this repository.
const root = process.env.SITE_DISPATCH_TEST_SOURCE
	? path.resolve( process.env.SITE_DISPATCH_TEST_SOURCE )
	: path.resolve( here, '..', '..' );

export const SERVER_HOST = 'server.example.test';
export const PLUGIN_FILE = 'site-dispatch/site-dispatch.php';
export const PLUGIN_VERSION = '0.1.0';
export const SOURCE_ROOT = root;

const SOURCE_IN_SITE = '/tmp/site-dispatch-src';

// The file set of a release: what the tests run is what would ship. With "files" the plugin is
// written from that list instead, that is how a test build gets in.
function copyPlugin( files ) {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'site-dispatch-test-' ) );
	if ( files ) {
		for ( const file of files ) {
			fs.mkdirSync( path.dirname( path.join( dir, file.name ) ), { recursive: true } );
			fs.writeFileSync( path.join( dir, file.name ), file.data );
		}
		return dir;
	}
	for ( const name of RELEASE_SET ) {
		if ( fs.existsSync( path.join( root, name ) ) ) {
			fs.cpSync( path.join( root, name ), path.join( dir, name ), { recursive: true } );
		}
	}
	return dir;
}

export function phpString( value ) {
	return "'" + String( value ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) + "'";
}

// install 'mount' keeps the plugin folder on the host, that is fast and enough for everything
// but an upgrade: WordPress cannot remove a mounted folder. 'copy' puts the files into the file
// system of the site. An upgrade of an active plugin calls the own site once, so it needs more
// than one worker.
export async function startSite( { fake, release = null, files = null, install = 'mount', workers = 1, defines = {}, login = false } = {} ) {
	const pluginDir = copyPlugin( files );
	const numbers = { SITE_DISPATCH_TEST_FAKE_PORT: fake.port };
	if ( release ) {
		numbers.SITE_DISPATCH_TEST_RELEASE_PORT = release.port;
	}
	const args = {
		command: 'server',
		port: 0,
		workers,
		quiet: true,
		login,
		skipBrowser: true,
		mount: [
			{
				hostPath: pluginDir,
				vfsPath: 'copy' === install ? SOURCE_IN_SITE : '/wordpress/wp-content/plugins/site-dispatch',
			},
			{ hostPath: path.join( here, 'mu' ), vfsPath: '/wordpress/wp-content/mu-plugins' },
			{
				hostPath: path.join( here, 'fixtures', 'canary-plugin' ),
				vfsPath: '/wordpress/wp-content/plugins/canary-plugin',
			},
		],
		define: defines,
		'define-number': numbers,
	};
	if ( process.env.SITE_DISPATCH_TEST_PHP ) {
		args.php = process.env.SITE_DISPATCH_TEST_PHP;
	}
	const cli = await runCLI( args );
	const users = new Map();
	// Playground answers the very first HTTP request with a redirect to itself. Spend it here.
	await fetch( cli.serverUrl + '/', { redirect: 'manual' } );

	// With several workers and after an upgrade, a worker can still see the file ".maintenance"
	// that another worker deleted. WordPress then finds the file, fails to open it and stops in
	// wp-load.php, before any code of a test or of the plugin ran. Only that case is tried again.
	const LIMBO = "Failed opening required '/wordpress/.maintenance'";
	const pause = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );
	async function runPhp( request ) {
		for ( let attempt = 0; ; attempt++ ) {
			try {
				return await cli.playground.run( request );
			} catch ( error ) {
				if ( attempt >= 60 || ! String( error?.message ).includes( LIMBO ) ) {
					throw error;
				}
				await pause( 500 );
			}
		}
	}

	const site = {
		url: cli.serverUrl,
		fake,
		release,

		// Copy mode only: puts the plugin back as it was at the start, active, without an update.
		async reinstall() {
			const done = await site.php( `
				require_once ABSPATH . 'wp-admin/includes/file.php';
				WP_Filesystem();
				global $wp_filesystem;
				$target = WP_PLUGIN_DIR . '/site-dispatch';
				if ( $wp_filesystem->exists( $target ) && ! $wp_filesystem->delete( $target, true ) ) {
					return 'could not remove the plugin folder';
				}
				wp_mkdir_p( $target );
				$copied = copy_dir( ${ phpString( SOURCE_IN_SITE ) }, $target );
				if ( is_wp_error( $copied ) ) {
					return $copied->get_error_message();
				}
				wp_opcache_invalidate_directory( $target );
				wp_clean_plugins_cache();
				return true;
			` );
			if ( true !== done ) {
				throw new Error( 'Reinstall failed: ' + done );
			}
			const active = await site.php( `
				$result = activate_plugin( ${ phpString( PLUGIN_FILE ) } );
				return is_wp_error( $result ) ? $result->get_error_message() : is_plugin_active( ${ phpString( PLUGIN_FILE ) } );
			` );
			if ( true !== active ) {
				throw new Error( 'Plugin did not activate: ' + active );
			}
		},

		// Runs PHP after wp-load.php. The code is the body of a function and returns a value.
		async php( code, { cookies = {} } = {} ) {
			const cookieLines = Object.entries( cookies )
				.map( ( [ name, value ] ) => `$_COOKIE[${ phpString( name ) }] = ${ phpString( value ) };` )
				.join( '\n' );
			const run = await runPhp( {
				code: `<?php
${ cookieLines }
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
ob_start();
$site_dispatch_test_result = ( static function () {
${ code }
} )();
$site_dispatch_test_noise = ob_get_clean();
echo "\\n<<<RESULT>>>" . json_encode( array( 'result' => $site_dispatch_test_result, 'noise' => $site_dispatch_test_noise ) );
`,
			} );
			const text = run.text;
			const at = text.lastIndexOf( '<<<RESULT>>>' );
			if ( -1 === at ) {
				throw new Error( 'PHP run gave no result: ' + text.slice( 0, 2000 ) + ' ' + ( run.errors ?? '' ) );
			}
			const parsed = JSON.parse( text.slice( at + 12 ) );
			const noise = ( text.slice( 0, at ) + parsed.noise ).trim();
			if ( '' !== noise ) {
				throw new Error( 'PHP run printed something: ' + noise.slice( 0, 2000 ) );
			}
			return parsed.result;
		},

		// Creates a user of that role and logs in through wp-login.php. Returns a cookie jar.
		async login( role ) {
			if ( ! users.has( role ) ) {
				const password = crypto.randomBytes( 18 ).toString( 'base64url' );
				const name = 'test_' + role;
				await site.php( `
					$id = wp_insert_user( array(
						'user_login' => ${ phpString( name ) },
						'user_pass'  => ${ phpString( password ) },
						'user_email' => ${ phpString( name + '@example.test' ) },
						'role'       => ${ phpString( role ) },
					) );
					return is_wp_error( $id ) ? $id->get_error_message() : $id;
				` );
				users.set( role, { name, password } );
			}
			const user = users.get( role );
			const jar = new Map( [ [ 'wordpress_test_cookie', 'WP%20Cookie%20check' ] ] );
			const response = await site.fetch( jar, '/wp-login.php', {
				method: 'POST',
				form: { log: user.name, pwd: user.password, 'wp-submit': 'Log In', testcookie: '1' },
			} );
			if ( 302 !== response.status || ! [ ...jar.keys() ].some( ( name ) => name.startsWith( 'wordpress_logged_in_' ) ) ) {
				throw new Error( 'Login as ' + role + ' failed with status ' + response.status );
			}
			return jar;
		},

		async fetch( jar, target, { method = 'GET', form = null } = {} ) {
			const headers = {};
			if ( jar && jar.size > 0 ) {
				headers.Cookie = [ ...jar ].map( ( [ name, value ] ) => name + '=' + value ).join( '; ' );
			}
			const init = { method, headers, redirect: 'manual' };
			if ( form ) {
				init.body = new URLSearchParams( form );
			}
			let response = await fetch( site.url + target, init );
			for ( let attempt = 0; attempt < 60 && 500 === response.status; attempt++ ) {
				if ( ! ( await response.clone().text() ).includes( LIMBO ) ) {
					break;
				}
				await pause( 500 );
				response = await fetch( site.url + target, init );
			}
			if ( jar ) {
				for ( const line of response.headers.getSetCookie() ) {
					const pair = line.split( ';' )[ 0 ];
					const cut = pair.indexOf( '=' );
					jar.set( pair.slice( 0, cut ), pair.slice( cut + 1 ) );
				}
			}
			return {
				status: response.status,
				location: response.headers.get( 'location' ) ?? '',
				body: await response.text(),
			};
		},

		// A nonce that is valid for the session of that jar.
		async nonce( jar, action ) {
			const cookies = {};
			for ( const [ name, value ] of jar ) {
				cookies[ name ] = decodeURIComponent( value );
			}
			return site.php( `return wp_create_nonce( ${ phpString( action ) } );`, { cookies } );
		},

		// Puts a valid connection in place, as an enrollment would have stored it.
		async connect( changes = {} ) {
			const state = {
				website_id: CANARY_WEBSITE_ID,
				key: CANARY_SITE_KEY,
				key_version: 1,
				server_host: SERVER_HOST,
				home_host: '127.0.0.1',
				...changes,
			};
			await site.php( `
				delete_option( 'site_dispatch_state' );
				add_option( 'site_dispatch_state', json_decode( ${ phpString( JSON.stringify( state ) ) }, true ), '', false );
				return true;
			` );
			return state;
		},

		async reset() {
			await site.php( `
				foreach ( array( 'site_dispatch_state', 'site_dispatch_update', 'site_dispatch_early_updates', 'site_dispatch_last_report' ) as $name ) {
					delete_option( $name );
				}
				delete_transient( 'site_dispatch_enroll' );
				delete_site_transient( 'update_plugins' );
				wp_clear_scheduled_hook( 'site_dispatch_daily' );
				wp_clear_scheduled_hook( 'site_dispatch_retry' );
				return true;
			` );
			fake.reset();
			release?.reset();
		},

		// Names of the cron hooks of the plugin with their next run, seconds from now.
		cron() {
			return site.php( `
				$found = array();
				foreach ( (array) _get_cron_array() as $time => $hooks ) {
					foreach ( array_keys( (array) $hooks ) as $hook ) {
						if ( 0 === strpos( (string) $hook, 'site_dispatch' ) ) {
							$found[ $hook ][] = (int) $time - time();
						}
					}
				}
				return $found;
			` );
		},

		// The same without the daily update check, which is planned on every site. An empty list
		// says: nothing is planned that would send a report.
		async reportCron() {
			const found = await site.cron();
			if ( Array.isArray( found ) ) {
				return found;
			}
			const { site_dispatch_update_check: check, ...rest } = found;
			return check && 0 === Object.keys( rest ).length ? [] : rest;
		},

		async stop() {
			await cli[ Symbol.asyncDispose ]();
			fs.rmSync( pluginDir, { recursive: true, force: true } );
		},
	};

	try {
		if ( 'copy' === install ) {
			await site.reinstall();
		} else {
			const activated = await site.php( `
				$result = activate_plugin( ${ phpString( PLUGIN_FILE ) } );
				return is_wp_error( $result ) ? $result->get_error_message() : is_plugin_active( ${ phpString( PLUGIN_FILE ) } );
			` );
			if ( true !== activated ) {
				throw new Error( 'Plugin did not activate: ' + activated );
			}
		}
	} catch ( error ) {
		await site.stop();
		throw error;
	}
	return site;
}
