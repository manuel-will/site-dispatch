// Starts a WordPress Playground site with the plugin, runs PHP inside it and drives wp-admin.
// Passwords are created at run time. Nothing here talks to anything but 127.0.0.1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCLI } from '@wp-playground/cli';
import { CANARY_SITE_KEY, CANARY_WEBSITE_ID } from './fake-server.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..', '..' );

export const SERVER_HOST = 'server.example.test';
export const PLUGIN_FILE = 'site-dispatch/site-dispatch.php';
export const PLUGIN_VERSION = '0.1.0';

// The file set of a release: what the tests run is what would ship.
function copyPlugin() {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'site-dispatch-test-' ) );
	for ( const name of [ 'site-dispatch.php', 'uninstall.php', 'includes', 'assets' ] ) {
		fs.cpSync( path.join( root, name ), path.join( dir, name ), { recursive: true } );
	}
	return dir;
}

function phpString( value ) {
	return "'" + String( value ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) + "'";
}

export async function startSite( { fake, defines = {}, login = false } = {} ) {
	const pluginDir = copyPlugin();
	const args = {
		command: 'server',
		port: 0,
		workers: 1,
		quiet: true,
		login,
		skipBrowser: true,
		mount: [
			{ hostPath: pluginDir, vfsPath: '/wordpress/wp-content/plugins/site-dispatch' },
			{ hostPath: path.join( here, 'mu' ), vfsPath: '/wordpress/wp-content/mu-plugins' },
			{
				hostPath: path.join( here, 'fixtures', 'canary-plugin' ),
				vfsPath: '/wordpress/wp-content/plugins/canary-plugin',
			},
		],
		define: defines,
		'define-number': { SITE_DISPATCH_TEST_FAKE_PORT: fake.port },
	};
	if ( process.env.SITE_DISPATCH_TEST_PHP ) {
		args.php = process.env.SITE_DISPATCH_TEST_PHP;
	}
	const cli = await runCLI( args );
	const users = new Map();

	const site = {
		url: cli.serverUrl,
		fake,

		// Runs PHP after wp-load.php. The code is the body of a function and returns a value.
		async php( code, { cookies = {} } = {} ) {
			const cookieLines = Object.entries( cookies )
				.map( ( [ name, value ] ) => `$_COOKIE[${ phpString( name ) }] = ${ phpString( value ) };` )
				.join( '\n' );
			const run = await cli.playground.run( {
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
			const response = await fetch( site.url + target, init );
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

		async stop() {
			await cli[ Symbol.asyncDispose ]();
			fs.rmSync( pluginDir, { recursive: true, force: true } );
		},
	};

	const activated = await site.php( `
		$result = activate_plugin( ${ phpString( PLUGIN_FILE ) } );
		return is_wp_error( $result ) ? $result->get_error_message() : is_plugin_active( ${ phpString( PLUGIN_FILE ) } );
	` );
	if ( true !== activated ) {
		await site.stop();
		throw new Error( 'Plugin did not activate: ' + activated );
	}
	return site;
}
