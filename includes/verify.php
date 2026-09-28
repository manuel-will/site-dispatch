<?php
/**
 * Pure checks for the signed update: signed blob, signature, manifest, acceptance.
 *
 * No WordPress, no side effects, no exception leaves a function. Contract: PROTOCOL.md, section 3.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of the update contract. None of them can be changed at run time.
 */
const SITE_DISPATCH_SLUG               = 'site-dispatch';
const SITE_DISPATCH_SIG_NAMESPACE      = 'site-dispatch-update';
const SITE_DISPATCH_MANIFEST_MAX_BYTES = 8192;
const SITE_DISPATCH_VERSION_PATTERN    = '/^[0-9]+\.[0-9]+\.[0-9]+\z/';
const SITE_DISPATCH_REQUIRES_PATTERN   = '/^[0-9]+\.[0-9]+(\.[0-9]+)?\z/';

/**
 * Builds the blob that OpenSSH signs for a file (SSHSIG format, hash sha512).
 *
 * @param string $message       The signed file, byte for byte.
 * @param string $sig_namespace The SSHSIG namespace.
 * @return string
 */
function site_dispatch_sshsig_blob( string $message, string $sig_namespace ): string {
	$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $message, true ) );
	$blob   = 'SSHSIG';
	foreach ( $fields as $field ) {
		$blob .= pack( 'N', strlen( $field ) ) . $field;
	}
	return $blob;
}

/**
 * Checks a raw Ed25519 signature over the manifest against a list of public keys.
 *
 * A malformed key list fails as a whole: the keys are build constants, a broken one is a build
 * error and must not pass quietly.
 *
 * @param string       $manifest_bytes The manifest as served.
 * @param string       $sig_raw        The raw signature, exactly 64 bytes.
 * @param array<mixed> $pubkeys_raw    Raw public keys, 32 bytes each.
 * @return bool
 */
function site_dispatch_verify_signature( string $manifest_bytes, string $sig_raw, array $pubkeys_raw ): bool {
	if ( 64 !== strlen( $sig_raw ) || array() === $pubkeys_raw ) {
		return false;
	}
	if ( ! function_exists( 'sodium_crypto_sign_verify_detached' ) ) {
		return false;
	}
	$keys = array();
	foreach ( $pubkeys_raw as $key ) {
		if ( ! is_string( $key ) || 32 !== strlen( $key ) ) {
			return false;
		}
		$keys[] = $key;
	}
	$blob  = site_dispatch_sshsig_blob( $manifest_bytes, SITE_DISPATCH_SIG_NAMESPACE );
	$valid = false;
	try {
		foreach ( $keys as $key ) {
			if ( sodium_crypto_sign_verify_detached( $sig_raw, $blob, $key ) ) {
				$valid = true;
			}
		}
	} catch ( \Throwable $e ) {
		return false;
	}
	return $valid;
}

/**
 * Parses a manifest. Returns null on any deviation from the seven fields and their patterns.
 *
 * @param string $manifest_bytes The manifest as served.
 * @return array{schema: int, slug: string, version: string, zip: string, sha512: string, requires_wp: string, requires_php: string}|null
 */
function site_dispatch_parse_manifest( string $manifest_bytes ): ?array {
	$length = strlen( $manifest_bytes );
	if ( 0 === $length || $length > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {
		return null;
	}
	// Depth 2 is a flat object. Any nested value fails the decode.
	$data = json_decode( $manifest_bytes, false, 2 );
	if ( ! $data instanceof \stdClass ) {
		return null;
	}
	$fields = get_object_vars( $data );
	$names  = array_map( 'strval', array_keys( $fields ) );
	sort( $names, SORT_STRING );
	if ( array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ) !== $names ) {
		return null;
	}
	$version      = $fields['version'];
	$zip          = $fields['zip'];
	$sha512       = $fields['sha512'];
	$requires_wp  = $fields['requires_wp'];
	$requires_php = $fields['requires_php'];
	if ( 1 !== $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {
		return null;
	}
	if ( ! is_string( $version ) || ! is_string( $zip ) || ! is_string( $sha512 ) || ! is_string( $requires_wp ) || ! is_string( $requires_php ) ) {
		return null;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) ) {
		return null;
	}
	// Equality with the name built from the version covers the file name pattern: no path, no URL.
	if ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== $zip ) {
		return null;
	}
	if ( 1 !== preg_match( '/^[0-9a-f]{128}\z/', $sha512 ) ) {
		return null;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_REQUIRES_PATTERN, $requires_wp ) || 1 !== preg_match( SITE_DISPATCH_REQUIRES_PATTERN, $requires_php ) ) {
		return null;
	}
	return array(
		'schema'       => 1,
		'slug'         => SITE_DISPATCH_SLUG,
		'version'      => $version,
		'zip'          => $zip,
		'sha512'       => $sha512,
		'requires_wp'  => $requires_wp,
		'requires_php' => $requires_php,
	);
}

