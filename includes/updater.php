<?php
/**
 * Signed self update: daily check, local waiting period, checked download.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php. Contract: PROTOCOL.md,
 * section 3. Keys and release address come from keys.php and source.php and from nowhere else.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of this file. None of them can be changed at run time.
 */
const SITE_DISPATCH_SIG_BYTES         = 64;
const SITE_DISPATCH_ZIP_MAX_BYTES     = 2097152;
const SITE_DISPATCH_REDIRECT_MAX      = 5;
const SITE_DISPATCH_URL_MAX_LENGTH    = 4096;
const SITE_DISPATCH_UPDATE_DELAY      = 259200;
const SITE_DISPATCH_UPDATE_HOOK       = 'site_dispatch_update_check';
const SITE_DISPATCH_UPDATE_OPTION     = 'site_dispatch_update';
const SITE_DISPATCH_HIGH_WATER_OPTION = 'site_dispatch_high_water';
const SITE_DISPATCH_RECALLED_OPTION   = 'site_dispatch_recalled';
// Hosts in release addresses are plain names with a letters-only top level label and no punycode,
// like the server host: no IP literal, no port but 443, no user, nothing that is not a name.
const SITE_DISPATCH_URL_PATTERN  = '/^https:\/\/(?:(?!xn--)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::443)?\/[\x21-\x5b\x5d-\x7e]*\z/';
const SITE_DISPATCH_BASE_PATTERN = '/^https:\/\/(?:(?!xn--)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[A-Za-z0-9._-]+)+\z/';

/**
 * Decodes the built-in public keys. One faulty entry empties the list, so nothing verifies.
 *
 * @param array<mixed> $encoded Keys as base64 text.
 * @return array<int, string> Raw keys, 32 bytes each.
 */
function site_dispatch_public_keys( array $encoded ): array {
	$keys = array();
	foreach ( $encoded as $entry ) {
		if ( ! is_string( $entry ) ) {
			return array();
		}
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Decodes a public key.
		$raw = base64_decode( $entry, true );
		if ( ! is_string( $raw ) || 32 !== strlen( $raw ) ) {
			return array();
		}
		$keys[] = $raw;
	}
	return $keys;
}

/**
 * Takes an address only if it is absolute, https, without user, on port 443 and printable.
 *
 * @param string $location An address, from the code or from a Location header.
 * @return string|null
 */
function site_dispatch_redirect_target( string $location ): ?string {
	if ( strlen( $location ) > SITE_DISPATCH_URL_MAX_LENGTH ) {
		return null;
	}
	return 1 === preg_match( SITE_DISPATCH_URL_PATTERN, $location ) ? $location : null;
}

/**
 * Address of the manifest or of its signature in the latest release.
 *
 * @param string $base Release base address.
 * @param string $file One of the two file names.
 * @return string|null
 */
function site_dispatch_release_url( string $base, string $file ): ?string {
	if ( 1 !== preg_match( SITE_DISPATCH_BASE_PATTERN, $base ) ) {
		return null;
	}
	if ( 'manifest.json' !== $file && 'manifest.json.sig' !== $file ) {
		return null;
	}
	return $base . '/releases/latest/download/' . $file;
}

/**
 * Address of the ZIP, built from version and file name of a parsed manifest.
 *
 * @param string       $base     Release base address.
 * @param array<mixed> $manifest A manifest from site_dispatch_parse_manifest().
 * @return string|null
 */
function site_dispatch_zip_url( string $base, array $manifest ): ?string {
	$version = $manifest['version'] ?? null;
	$zip     = $manifest['zip'] ?? null;
	if ( 1 !== preg_match( SITE_DISPATCH_BASE_PATTERN, $base ) ) {
		return null;
	}
	if ( ! is_string( $version ) || 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) ) {
		return null;
	}
	if ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== $zip ) {
		return null;
	}
	return $base . '/releases/download/v' . $version . '/' . $zip;
}

/**
 * Verdict on a fetched release.
 *
 * @param string       $manifest_bytes The manifest as served.
 * @param string       $sig_raw        The raw signature.
 * @param array<mixed> $keys           Raw public keys.
 * @param string       $installed      The installed plugin version.
 * @param string       $php            The running PHP version.
 * @param string       $wp             The running WordPress version.
 * @return string 'invalid', 'not_newer', 'unfit' or 'ok'.
 */
function site_dispatch_judge_release( string $manifest_bytes, string $sig_raw, array $keys, string $installed, string $php, string $wp ): string {
	if ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) ) {
		return 'invalid';
	}
	$manifest = site_dispatch_parse_manifest( $manifest_bytes );
	if ( null === $manifest || 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $installed ) ) {
		return 'invalid';
	}
	$offered = site_dispatch_version_parts( $manifest['version'] );
	$current = site_dispatch_version_parts( $installed );
	if ( null === $offered || null === $current ) {
		return 'invalid';
	}
	if ( site_dispatch_compare_versions( $offered, $current ) <= 0 ) {
		return 'not_newer';
	}
	return site_dispatch_manifest_acceptable( $manifest, $installed, $php, $wp ) ? 'ok' : 'unfit';
}

/**
 * Reads the stored update. Null unless every field has its exact form. Verifies nothing.
 *
 * @param mixed $raw The option as stored.
 * @return array{manifest: string, sig: string, version: string, first_seen: int}|null Manifest and signature decoded.
 */
function site_dispatch_read_stored( $raw ): ?array {
	if ( ! is_array( $raw ) ) {
		return null;
	}
	$manifest   = $raw['manifest'] ?? null;
	$sig        = $raw['sig'] ?? null;
	$version    = $raw['version'] ?? null;
	$first_seen = $raw['first_seen'] ?? null;
	if ( ! is_string( $manifest ) || ! is_string( $sig ) || ! is_string( $version ) || ! is_int( $first_seen ) ) {
		return null;
	}
	// phpcs:disable WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Manifest and signature are bytes, the option holds text.
	$manifest_bytes = base64_decode( $manifest, true );
	$sig_raw        = base64_decode( $sig, true );
	// phpcs:enable WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
	if ( ! is_string( $manifest_bytes ) || '' === $manifest_bytes || strlen( $manifest_bytes ) > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {
		return null;
	}
	if ( ! is_string( $sig_raw ) || SITE_DISPATCH_SIG_BYTES !== strlen( $sig_raw ) ) {
		return null;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) || $first_seen < 0 ) {
		return null;
	}
	return array(
		'manifest'   => $manifest_bytes,
		'sig'        => $sig_raw,
		'version'    => $version,
		'first_seen' => $first_seen,
	);
}

/**
 * Decides what the daily check does with the stored update.
 *
 * Only a definite answer changes anything: a missing release or a validly signed manifest. A
 * transport error or an invalid signature keeps what is stored, so nobody without a key can cancel
 * or restart a waiting update.
 *
 * The high-water mark is the highest version this site has ever seen validly signed (the stored
 * option, never below the installed version), raised here by a waiting update. A signed manifest
 * below the mark is a replay of an old release: every manifest and signature ever published stays
 * valid forever, and whoever controls the release page could serve one again to hold sites on an
 * old version or to drop a waiting update. Such a manifest changes nothing.
 *
 * A recall is durable: when a 404 drops a waiting update, its version becomes the recall floor
 * (option `site_dispatch_recalled`) and is never accepted again, nor is anything below it. Without
 * the floor the deleted release could be uploaded again (its signature stays valid) and would be
 * installed 72 hours later. At the mark only the bytes already waiting count: other bytes for the
 * same version are a replay of a superseded variant and change nothing, a fix gets a new number.
 *
 * @param array<mixed>|null $stored         The stored update from site_dispatch_read_stored().
 * @param string            $fetch          'ok', 'gone' or 'failed'.
 * @param string            $verdict        Verdict of site_dispatch_judge_release().
 * @param string            $manifest_bytes The manifest as served.
 * @param string            $sig_raw        The raw signature.
 * @param int               $now            Local time.
 * @param string            $high_water     Highest version seen so far, '' if none.
 * @param string            $recalled       Highest version ever recalled by a 404, '' if none.
 * @return array{action: string, update?: array{manifest: string, sig: string, version: string, first_seen: int}, high_water?: string, recalled?: string} Action 'keep', 'delete' or 'store'; 'high_water' when the mark rises, 'recalled' when a waiting update was recalled.
 */
function site_dispatch_next_update( ?array $stored, string $fetch, string $verdict, string $manifest_bytes, string $sig_raw, int $now, string $high_water = '', string $recalled = '' ): array {
	if ( 'gone' === $fetch ) {
		$dropped = null !== $stored && is_string( $stored['version'] ?? null ) ? $stored['version'] : '';
		return '' === $dropped ? array( 'action' => 'delete' ) : array(
			'action'   => 'delete',
			'recalled' => $dropped,
		);
	}
	if ( 'ok' !== $fetch ) {
		return array( 'action' => 'keep' );
	}
	if ( 'not_newer' !== $verdict && 'unfit' !== $verdict && 'ok' !== $verdict ) {
		return array( 'action' => 'keep' );
	}
	$manifest = site_dispatch_parse_manifest( $manifest_bytes );
	if ( null === $manifest ) {
		return array( 'action' => 'keep' );
	}
	$floor = site_dispatch_highest_version( array( $recalled ) );
	if ( '' !== $floor && site_dispatch_version_order( $manifest['version'], $floor ) <= 0 ) {
		return array( 'action' => 'keep' );
	}
	$waiting = null !== $stored && is_string( $stored['version'] ?? null ) ? $stored['version'] : '';
	$mark    = site_dispatch_highest_version( array( $high_water, $waiting ) );
	$order   = site_dispatch_version_order( $manifest['version'], $mark );
	if ( $order < 0 ) {
		return array( 'action' => 'keep' );
	}
	$raised = $order > 0 ? array( 'high_water' => $manifest['version'] ) : array();
	if ( 'not_newer' === $verdict || 'unfit' === $verdict ) {
		return array( 'action' => 'delete' ) + $raised;
	}
	// At the mark with an update waiting: the same bytes are the same release (the clock keeps
	// running), other bytes for that version are a superseded variant and are ignored.
	if ( null !== $stored && 0 === $order ) {
		return array( 'action' => 'keep' );
	}
	// phpcs:disable WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Manifest and signature are bytes, the option holds text.
	return array(
		'action' => 'store',
		'update' => array(
			'manifest'   => base64_encode( $manifest_bytes ),
			'sig'        => base64_encode( $sig_raw ),
			'version'    => $manifest['version'],
			'first_seen' => $now,
		),
	) + $raised;
	// phpcs:enable WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
}

/**
 * The highest well formed version in a list, '' if there is none.
 *
 * @param array<int, string> $versions Candidates, malformed ones are skipped.
 * @return string
 */
function site_dispatch_highest_version( array $versions ): string {
	$best = '';
	foreach ( $versions as $version ) {
		if ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) ) {
			continue;
		}
		if ( '' === $best || site_dispatch_version_order( $version, $best ) > 0 ) {
			$best = $version;
		}
	}
	return $best;
}

/**
 * Compares two versions. An empty or malformed right side counts as lower than anything.
 *
 * @param string $left  Well formed version.
 * @param string $right Version or ''.
 * @return int -1, 0 or 1.
 */
function site_dispatch_version_order( string $left, string $right ): int {
	$a = site_dispatch_version_parts( $left );
	$b = site_dispatch_version_parts( $right );
	if ( null === $a ) {
		return -1;
	}
	if ( null === $b ) {
		return 1;
	}
	return site_dispatch_compare_versions( $a, $b );
}

/**
 * The waiting period is over, or the switch for immediate updates is on.
 *
 * @param int  $first_seen Local time the release was seen first.
 * @param int  $now        Local time.
 * @param bool $early      Immediate updates are on.
 * @return bool
 */
function site_dispatch_update_due( int $first_seen, int $now, bool $early ): bool {
	if ( $early ) {
		return true;
	}
	return $first_seen <= $now && $now - $first_seen >= SITE_DISPATCH_UPDATE_DELAY;
}

/**
 * Every name inside the ZIP lies under the one folder of the plugin, and the main file is there.
 *
 * @param array<mixed> $names Names as the ZIP lists them.
 * @return bool
 */
function site_dispatch_zip_names_ok( array $names ): bool {
	$prefix = SITE_DISPATCH_SLUG . '/';
	$main   = false;
	foreach ( $names as $name ) {
		if ( ! is_string( $name ) || 0 !== strpos( $name, $prefix ) ) {
			return false;
		}
		if ( 1 !== preg_match( '/^[\x20-\x5b\x5d-\x7e]{1,512}\z/', $name ) ) {
			return false;
		}
		$parts = explode( '/', $name );
		// A folder is listed with a slash at the end, that leaves one empty part as the last one.
		if ( '' === end( $parts ) ) {
			array_pop( $parts );
		}
		foreach ( $parts as $part ) {
			if ( '' === $part || '.' === $part || '..' === $part ) {
				return false;
			}
		}
		if ( $prefix . SITE_DISPATCH_SLUG . '.php' === $name ) {
			$main = true;
		}
	}
	return $main;
}

/**
 * Plugin file as WordPress names it, "site-dispatch/site-dispatch.php".
 *
 * @return string
 */
function site_dispatch_plugin_file(): string {
	return plugin_basename( SITE_DISPATCH_FILE );
}

/**
 * Fetches one address. Follows redirects by itself, so every hop is https and size limited.
 *
 * @param string $url       Start address.
 * @param int    $max_bytes Limit of the contract. One byte more is asked for, so "too large" shows.
 * @param string $file      Target file for a download, empty for an answer in memory.
 * @return array{code: int, body: string} Code 0 on a transport error or a refused address.
 */
function site_dispatch_fetch( string $url, int $max_bytes, string $file = '' ): array {
	$failed = array(
		'code' => 0,
		'body' => '',
	);
	$target = site_dispatch_redirect_target( $url );
	for ( $hop = 0; $hop <= SITE_DISPATCH_REDIRECT_MAX; $hop++ ) {
		if ( null === $target ) {
			return $failed;
		}
		$args = array(
			'timeout'             => '' === $file ? 15 : 60,
			'redirection'         => 0,
			'sslverify'           => true,
			'reject_unsafe_urls'  => true,
			'limit_response_size' => $max_bytes + 1,
		);
		if ( '' !== $file ) {
			$args['stream']   = true;
			$args['filename'] = $file;
		}
		$result = wp_remote_get( $target, $args );
		if ( is_wp_error( $result ) ) {
			return $failed;
		}
		$code = (int) wp_remote_retrieve_response_code( $result );
		if ( ! in_array( $code, array( 301, 302, 303, 307, 308 ), true ) ) {
			return array(
				'code' => $code,
				'body' => '' === $file ? wp_remote_retrieve_body( $result ) : '',
			);
		}
		$location = wp_remote_retrieve_header( $result, 'location' );
		$target   = is_string( $location ) ? site_dispatch_redirect_target( $location ) : null;
	}
	return $failed;
}

/**
 * Writes or deletes the stored update. Without autoload.
 *
 * @param array<string, mixed>|null $update What to store, null deletes.
 */
function site_dispatch_store_update( ?array $update ): void {
	delete_option( SITE_DISPATCH_UPDATE_OPTION );
	if ( null !== $update ) {
		add_option( SITE_DISPATCH_UPDATE_OPTION, $update, '', false );
	}
}

/**
 * The high-water mark of this site: the stored one or the installed version, whichever is higher.
 *
 * @return string
 */
function site_dispatch_high_water(): string {
	$raw = get_option( SITE_DISPATCH_HIGH_WATER_OPTION, '' );
	return site_dispatch_highest_version( array( is_string( $raw ) ? $raw : '', SITE_DISPATCH_VERSION ) );
}

/**
 * The recall floor of this site: the highest version a 404 has ever dropped, '' if none.
 *
 * @return string
 */
function site_dispatch_recalled(): string {
	$raw = get_option( SITE_DISPATCH_RECALLED_OPTION, '' );
	return site_dispatch_highest_version( array( is_string( $raw ) ? $raw : '' ) );
}

/**
 * Raises a version option (high-water mark, recall floor), without autoload. Never lowers it: two
 * checks running at once cannot take the mark back.
 *
 * @param string $option  Option name.
 * @param string $version Well formed version.
 */
function site_dispatch_raise_version_option( string $option, string $version ): void {
	if ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) ) {
		return;
	}
	$raw     = get_option( $option, '' );
	$current = site_dispatch_highest_version( array( is_string( $raw ) ? $raw : '' ) );
	if ( '' !== $current && site_dispatch_version_order( $version, $current ) <= 0 ) {
		return;
	}
	delete_option( $option );
	add_option( $option, $version, '', false );
}

/**
 * Names of the PHP extensions the signed update needs and the server lacks.
 *
 * @param bool $sodium sodium_crypto_sign_verify_detached() exists.
 * @param bool $zip    ZipArchive exists.
 * @return array<int, string> Empty when everything is there.
 */
function site_dispatch_missing_extensions( bool $sodium, bool $zip ): array {
	$missing = array();
	if ( ! $sodium ) {
		$missing[] = 'sodium';
	}
	if ( ! $zip ) {
		$missing[] = 'zip';
	}
	return $missing;
}

/**
 * Action "upgrader_process_complete": a package handed over but never unpacked (the upgrader
 * stopped in between) must not refuse a later unpacking in the same request.
 */
function site_dispatch_forget_package(): void {
	Site_Dispatch_Memo::$package = null;
}

/**
 * Verdict on a manifest for this installation.
 *
 * @param string $manifest_bytes The manifest.
 * @param string $sig_raw        The raw signature.
 * @return string
 */
function site_dispatch_judge_here( string $manifest_bytes, string $sig_raw ): string {
	return site_dispatch_judge_release(
		$manifest_bytes,
		$sig_raw,
		site_dispatch_public_keys( SITE_DISPATCH_PUBLIC_KEYS ),
		SITE_DISPATCH_VERSION,
		PHP_VERSION,
		(string) get_bloginfo( 'version' )
	);
}

/**
 * Daily: looks at the latest release and keeps, stores or drops the waiting update.
 */
function site_dispatch_update_check(): void {
	$manifest_url = site_dispatch_release_url( SITE_DISPATCH_RELEASE_BASE, 'manifest.json' );
	$sig_url      = site_dispatch_release_url( SITE_DISPATCH_RELEASE_BASE, 'manifest.json.sig' );
	if ( null === $manifest_url || null === $sig_url ) {
		return;
	}
	$fetch          = 'failed';
	$verdict        = 'invalid';
	$manifest_bytes = '';
	$sig_raw        = '';
	$answer         = site_dispatch_fetch( $manifest_url, SITE_DISPATCH_MANIFEST_MAX_BYTES );
	if ( 404 === $answer['code'] ) {
		$fetch = 'gone';
	} elseif ( 200 === $answer['code'] && '' !== $answer['body'] && strlen( $answer['body'] ) <= SITE_DISPATCH_MANIFEST_MAX_BYTES ) {
		$signature = site_dispatch_fetch( $sig_url, SITE_DISPATCH_SIG_BYTES );
		if ( 200 === $signature['code'] && SITE_DISPATCH_SIG_BYTES === strlen( $signature['body'] ) ) {
			$fetch          = 'ok';
			$manifest_bytes = $answer['body'];
			$sig_raw        = $signature['body'];
			$verdict        = site_dispatch_judge_here( $manifest_bytes, $sig_raw );
		}
	}
	$stored = site_dispatch_read_stored( get_option( SITE_DISPATCH_UPDATE_OPTION, null ) );
	$next   = site_dispatch_next_update( $stored, $fetch, $verdict, $manifest_bytes, $sig_raw, time(), site_dispatch_high_water(), site_dispatch_recalled() );
	if ( isset( $next['high_water'] ) ) {
		site_dispatch_raise_version_option( SITE_DISPATCH_HIGH_WATER_OPTION, $next['high_water'] );
	}
	if ( isset( $next['recalled'] ) ) {
		site_dispatch_raise_version_option( SITE_DISPATCH_RECALLED_OPTION, $next['recalled'] );
	}
	if ( 'delete' === $next['action'] ) {
		site_dispatch_store_update( null );
	} elseif ( 'store' === $next['action'] && isset( $next['update'] ) ) {
		site_dispatch_store_update( $next['update'] );
	}
}

/**
 * Plans the daily check. Also on a site that is not connected: fixes have to reach every copy.
 */
function site_dispatch_schedule_update_check(): void {
	if ( false === wp_next_scheduled( SITE_DISPATCH_UPDATE_HOOK ) ) {
		wp_schedule_event( time() + 10 * MINUTE_IN_SECONDS, 'daily', SITE_DISPATCH_UPDATE_HOOK );
	}
}

/**
 * The waiting update, verified against the built-in keys. Null if there is none that holds.
 *
 * The verdict is kept for the rest of the request as long as the stored bytes stay the same,
 * because WordPress reads its update list many times. The install path asks for a fresh one.
 *
 * @param bool $fresh Verify again even if the stored bytes are known.
 * @return array{manifest: array{schema: int, slug: string, version: string, zip: string, sha512: string, requires_wp: string, requires_php: string}, version: string, first_seen: int, due: bool}|null
 */
function site_dispatch_get_update( bool $fresh = false ): ?array {
	$stored = site_dispatch_read_stored( get_option( SITE_DISPATCH_UPDATE_OPTION, null ) );
	if ( null === $stored ) {
		return null;
	}
	$mark = hash( 'sha256', $stored['manifest'] . $stored['sig'] );
	if ( $fresh || ! isset( Site_Dispatch_Memo::$verdicts[ $mark ] ) ) {
		Site_Dispatch_Memo::$verdicts[ $mark ] = site_dispatch_judge_here( $stored['manifest'], $stored['sig'] );
	}
	$manifest = site_dispatch_parse_manifest( $stored['manifest'] );
	if ( 'ok' !== Site_Dispatch_Memo::$verdicts[ $mark ] || null === $manifest || $manifest['version'] !== $stored['version'] ) {
		return null;
	}
	return array(
		'manifest'   => $manifest,
		'version'    => $stored['version'],
		'first_seen' => $stored['first_seen'],
		'due'        => site_dispatch_update_due( $stored['first_seen'], time(), (bool) get_option( 'site_dispatch_early_updates', false ) ),
	);
}

/**
 * Filter on the update list of WordPress, at every read. Touches the own entry only.
 *
 * @param mixed $value The update list.
 * @return mixed
 */
function site_dispatch_filter_update_list( $value ) {
	$file = site_dispatch_plugin_file();
	if ( $value instanceof stdClass && isset( $value->response ) && is_array( $value->response ) && isset( $value->response[ $file ] ) ) {
		unset( $value->response[ $file ] );
	}
	$update = site_dispatch_get_update();
	$url    = null === $update ? null : site_dispatch_zip_url( SITE_DISPATCH_RELEASE_BASE, $update['manifest'] );
	if ( null === $update || null === $url || ! $update['due'] ) {
		return $value;
	}
	if ( ! $value instanceof stdClass ) {
		$value = new stdClass();
	}
	if ( ! isset( $value->response ) || ! is_array( $value->response ) ) {
		$value->response = array();
	}
	$value->response[ $file ] = (object) array(
		'id'           => SITE_DISPATCH_RELEASE_BASE,
		'slug'         => SITE_DISPATCH_SLUG,
		'plugin'       => $file,
		'new_version'  => $update['version'],
		'url'          => SITE_DISPATCH_RELEASE_BASE,
		'package'      => $url,
		'requires'     => $update['manifest']['requires_wp'],
		'requires_php' => $update['manifest']['requires_php'],
	);
	return $value;
}

/**
 * One fixed error for every refusal on the install path.
 *
 * @return WP_Error
 */
function site_dispatch_update_refused(): WP_Error {
	return new WP_Error( 'site_dispatch_update_refused', __( 'Site Dispatch refused this update: it did not pass the checks.', 'site-dispatch' ) );
}

/**
 * Names inside a ZIP file. Null if the file cannot be read as a ZIP.
 *
 * @param string $file Path of the ZIP.
 * @return array<int, string>|null
 */
function site_dispatch_zip_names( string $file ): ?array {
	if ( ! class_exists( 'ZipArchive' ) ) {
		return null;
	}
	$zip = new ZipArchive();
	if ( true !== $zip->open( $file, ZipArchive::CHECKCONS ) ) {
		return null;
	}
	$names = array();
	for ( $i = 0; $i < $zip->numFiles; $i++ ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- Property of ZipArchive.
		$name = $zip->getNameIndex( $i, ZipArchive::FL_UNCHANGED );
		if ( ! is_string( $name ) ) {
			$zip->close();
			return null;
		}
		$names[] = $name;
	}
	$zip->close();
	return $names;
}

/**
 * Filter "upgrader_pre_download": takes over the download of the own plugin.
 *
 * The package address WordPress hands over is ignored. The address comes from the stored manifest,
 * which is verified again here, and the waiting period is checked again.
 *
 * @param mixed $reply      False, or what another filter decided.
 * @param mixed $package    Package address from the update list.
 * @param mixed $upgrader   The upgrader.
 * @param mixed $hook_extra Says what is being updated.
 * @return mixed Path of the checked file, an error, or the value that came in.
 */
function site_dispatch_pre_download( $reply, $package, $upgrader, $hook_extra ) {
	$own_target  = is_array( $hook_extra ) && isset( $hook_extra['plugin'] ) && site_dispatch_plugin_file() === $hook_extra['plugin'];
	$own_package = is_string( $package ) && 0 === strpos( $package, SITE_DISPATCH_RELEASE_BASE . '/' );
	// Whatever is downloaded next, a package left over from an own download that never reached the
	// unpacking (disk full, mkdir failed) must not refuse it.
	Site_Dispatch_Memo::$package = null;
	if ( ! $own_target && ! $own_package ) {
		return $reply;
	}
	if ( ! $own_target ) {
		return site_dispatch_update_refused();
	}
	$update = site_dispatch_get_update( true );
	$url    = null === $update ? null : site_dispatch_zip_url( SITE_DISPATCH_RELEASE_BASE, $update['manifest'] );
	if ( null === $update || null === $url || ! $update['due'] ) {
		return site_dispatch_update_refused();
	}
	if ( ! function_exists( 'wp_tempnam' ) ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
	}
	$file = wp_tempnam( $update['manifest']['zip'] );
	if ( '' === $file ) {
		return site_dispatch_update_refused();
	}
	$answer = site_dispatch_fetch( $url, SITE_DISPATCH_ZIP_MAX_BYTES, $file );
	clearstatcache( true, $file );
	$size  = file_exists( $file ) ? filesize( $file ) : false;
	$hash  = false === $size ? false : hash_file( 'sha512', $file );
	$names = site_dispatch_zip_names( $file );
	$good  = 200 === $answer['code']
		&& is_int( $size ) && $size > 0 && $size <= SITE_DISPATCH_ZIP_MAX_BYTES
		&& is_string( $hash ) && hash_equals( $update['manifest']['sha512'], $hash )
		&& null !== $names && site_dispatch_zip_names_ok( $names );
	if ( ! $good ) {
		wp_delete_file( $file );
		return site_dispatch_update_refused();
	}
	Site_Dispatch_Memo::$package = array(
		'file'   => $file,
		'sha512' => $update['manifest']['sha512'],
	);
	return $file;
}

/**
 * Filter "pre_unzip_file": the first unpacking after the own download must be exactly that file,
 * with the same hash as at the check.
 *
 * @param mixed $result Null, or what another filter decided.
 * @param mixed $file   Path of the ZIP that is about to be unpacked.
 * @return mixed
 */
function site_dispatch_pre_unzip( $result, $file ) {
	$handed = Site_Dispatch_Memo::$package;
	if ( null === $handed ) {
		return $result;
	}
	Site_Dispatch_Memo::$package = null;
	clearstatcache( true, $handed['file'] );
	$hash = is_string( $file ) && $file === $handed['file'] && file_exists( $file ) ? hash_file( 'sha512', $file ) : false;
	if ( ! is_string( $hash ) || ! hash_equals( $handed['sha512'], $hash ) ) {
		return site_dispatch_update_refused();
	}
	return $result;
}

/**
 * Filter "upgrader_source_selection": the unpacked package of the own plugin is exactly one
 * folder with the name of the plugin.
 *
 * @param mixed $source        Folder that is about to be installed.
 * @param mixed $remote_source Folder the package was unpacked into.
 * @param mixed $upgrader      The upgrader.
 * @param mixed $hook_extra    Says what is being updated.
 * @return mixed
 */
function site_dispatch_source_selection( $source, $remote_source, $upgrader, $hook_extra ) {
	if ( ! is_array( $hook_extra ) || ! isset( $hook_extra['plugin'] ) || site_dispatch_plugin_file() !== $hook_extra['plugin'] ) {
		return $source;
	}
	if ( is_wp_error( $source ) ) {
		return $source;
	}
	if ( ! is_string( $source ) || ! is_string( $remote_source ) ) {
		return site_dispatch_update_refused();
	}
	// The package handed over in pre_download is cleared by the hash check right before unpacking.
	// If it is still there, that check never ran and WordPress took another way to this point.
	if ( null !== Site_Dispatch_Memo::$package ) {
		Site_Dispatch_Memo::$package = null;
		return site_dispatch_update_refused();
	}
	// The unpacked folder lives where WP_Filesystem put it, which on FTP or SSH hosts is not a path
	// PHP can read. Listing it through WP_Filesystem works on every method.
	global $wp_filesystem;
	$expected = untrailingslashit( $remote_source ) . '/' . SITE_DISPATCH_SLUG;
	$listing  = $wp_filesystem instanceof WP_Filesystem_Base ? $wp_filesystem->dirlist( $remote_source, false, false ) : false;
	$entries  = is_array( $listing ) ? array_keys( $listing ) : array();
	if ( untrailingslashit( $source ) !== $expected || array( SITE_DISPATCH_SLUG ) !== $entries ) {
		return site_dispatch_update_refused();
	}
	return $source;
}

/**
 * Filter "auto_update_plugin": the own plugin installs its verified updates by itself.
 *
 * @param mixed $update Decision so far.
 * @param mixed $item   The offered update.
 * @return mixed
 */
function site_dispatch_auto_update( $update, $item ) {
	if ( is_object( $item ) && isset( $item->plugin ) && site_dispatch_plugin_file() === $item->plugin ) {
		return true;
	}
	return $update;
}
