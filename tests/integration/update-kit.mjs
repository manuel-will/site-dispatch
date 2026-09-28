// What the update tests share: a site that runs the test build, releases signed with keys made
// at run time, and the few PHP snippets all of them need.
import { startFake } from './fake-server.mjs';
import { startRelease } from './fake-release.mjs';
import { startSite, SOURCE_ROOT, phpString } from './harness.mjs';
import { makeKeyPair, testFiles, testRelease, TEST_BASE } from '../../tools/build-test-zip.mjs';
import { manifestBytes, releaseZip, sha512, SLUG } from '../../tools/lib/release.mjs';
import { zipStore } from '../../tools/lib/zip.mjs';

export { makeKeyPair, phpString, sha512, zipStore, TEST_BASE };
export const INSTALLED = '0.1.0';
export const HOURS_72 = 259200;

// Site with the test build installed as a copy. keys are the two keys built into it.
export async function startUpdateSite( { base = TEST_BASE, defines = {} } = {} ) {
	const keys = [ makeKeyPair(), makeKeyPair() ];
	const stranger = makeKeyPair();
	const fake = await startFake();
	const release = await startRelease();
	const site = await startSite( {
		fake,
		release,
		files: testFiles( SOURCE_ROOT, { version: INSTALLED, keys, base } ),
		install: 'copy',
		workers: 3,
		defines: { DISABLE_WP_CRON: '1', SITE_DISPATCH_TEST_LOOPBACK: '1', ...defines },
	} );
	return {
		site,
		fake,
		release,
		keys,
		stranger,
		async stop() {
			await site.stop();
			await release.stop();
			await fake.stop();
		},
	};
}

// A complete release of the test build. builtIn are the keys inside the new version.
export function makeRelease( version, { builtIn, signer, base = TEST_BASE } ) {
	return testRelease( testFiles( SOURCE_ROOT, { version, keys: builtIn, base } ), signer );
}

// A release around a ZIP the test made up. The manifest is signed and names the hash of that ZIP.
export function releaseAround( version, zip, signer, changes = {} ) {
	const manifest = manifestBytes( { version, zipHash: sha512( zip ), requiresWp: '6.4', requiresPhp: '7.4' } );
	const fields = { ...JSON.parse( manifest.toString( 'utf8' ) ), ...changes };
	const bytes = Buffer.from( JSON.stringify( fields ), 'utf8' );
	return { version, zip, zipName: SLUG + '-' + version + '.zip', manifest: bytes, signature: signer.sign( bytes ) };
}

// A ZIP whose entries the test names itself.
export function zipOf( entries ) {
	return zipStore( entries.map( ( [ name, text ] ) => ( { name, data: Buffer.from( text, 'utf8' ) } ) ), { keepOrder: true } );
}

export { releaseZip };

export const php = {
	check: `
		site_dispatch_update_check();
		wp_cache_flush();
		return get_option( 'site_dispatch_update', null );
	`,
	stored: `
		wp_cache_flush();
		return get_option( 'site_dispatch_update', null );
	`,
	// Moves the clock: the release was seen that many seconds earlier.
	age: ( seconds ) => `
		$update = get_option( 'site_dispatch_update', null );
		if ( ! is_array( $update ) ) {
			return false;
		}
		$update['first_seen'] -= ${ Number( seconds ) };
		delete_option( 'site_dispatch_update' );
		add_option( 'site_dispatch_update', $update, '', false );
		return $update['first_seen'];
	`,
	early: ( on ) => `
		delete_option( 'site_dispatch_early_updates' );
		add_option( 'site_dispatch_early_updates', ${ on ? 1 : 0 }, '', false );
		return true;
	`,
	offer: `
		$list = get_site_transient( 'update_plugins' );
		$file = 'site-dispatch/site-dispatch.php';
		return is_object( $list ) && isset( $list->response[ $file ] ) ? (array) $list->response[ $file ] : null;
	`,
	version: `
		clearstatcache();
		$file = WP_PLUGIN_DIR . '/site-dispatch/site-dispatch.php';
		if ( ! file_exists( $file ) ) {
			return 'gone';
		}
		$data = get_file_data( $file, array( 'version' => 'Version' ) );
		return array(
			'header' => $data['version'],
			'loaded' => defined( 'SITE_DISPATCH_VERSION' ) ? SITE_DISPATCH_VERSION : null,
			'active' => is_plugin_active( 'site-dispatch/site-dispatch.php' ),
		);
	`,
	// Runs the upgrader the way the link "update now" in the plugin list does (that one works
	// through Ajax and bulk_upgrade), without a page around it.
	upgrade: `
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/misc.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		$file     = 'site-dispatch/site-dispatch.php';
		$skin     = new WP_Ajax_Upgrader_Skin();
		$upgrader = new Plugin_Upgrader( $skin );
		$results  = $upgrader->bulk_upgrade( array( $file ) );
		$result   = is_array( $results ) && array_key_exists( $file, $results ) ? $results[ $file ] : $results;
		$codes    = $skin->get_errors()->get_error_codes();
		foreach ( array( $result, $skin->result ) as $value ) {
			if ( is_wp_error( $value ) ) {
				$codes = array_merge( $codes, $value->get_error_codes() );
			}
		}
		return array(
			'installed' => is_array( $result ) && ! empty( $result['destination_name'] ),
			'codes'     => array_values( array_unique( $codes ) ),
			'messages'  => $skin->get_upgrade_messages(),
		);
	`,
	// The automatic updater runs in cron. Outside of cron WordPress would switch the plugin off
	// before the upgrade and leave it to a browser to switch it on again.
	auto: `
		define( 'DOING_CRON', true );
		require_once ABSPATH . 'wp-admin/includes/admin.php';
		add_filter( 'pre_wp_mail', '__return_true' );
		wp_maybe_auto_update();
		return true;
	`,
};
