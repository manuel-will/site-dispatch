<?php
/**
 * Pure parsers for the two enrollment responses. No WordPress, no side effects.
 *
 * Contract: PROTOCOL.md, section 2. Only the fields named there leave a parser.
 *
 * @package Site_Dispatch
 */

/**
 * Size limit and UUID pattern of the contract.
 */
const SITE_DISPATCH_RESPONSE_MAX_BYTES = 4096;
const SITE_DISPATCH_UUID_PATTERN       = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/';

/**
 * Decodes a response body into its top level fields. Null unless it is a JSON object with
 * "ok": true and at most 4 KB.
 *
 * @param string $body The response body.
 * @return array<string, mixed>|null
 */
function site_dispatch_decode_response( string $body ): ?array {
	$length = strlen( $body );
	if ( 0 === $length || $length > SITE_DISPATCH_RESPONSE_MAX_BYTES ) {
		return null;
	}
	$data = json_decode( $body, false, 8 );
	if ( ! $data instanceof \stdClass ) {
		return null;
	}
	$fields = array();
	foreach ( get_object_vars( $data ) as $name => $value ) {
		$fields[ (string) $name ] = $value;
	}
	if ( true !== ( $fields['ok'] ?? null ) ) {
		return null;
	}
	return $fields;
}

/**
 * Parses the response to an enrollment request.
 *
 * @param string $body The response body.
 * @return array{request_id: string, user_code: string}|null
 */
function site_dispatch_parse_request_response( string $body ): ?array {
	$fields = site_dispatch_decode_response( $body );
	if ( null === $fields ) {
		return null;
	}
	$request_id = $fields['request_id'] ?? null;
	$user_code  = $fields['user_code'] ?? null;
	if ( ! is_string( $request_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $request_id ) ) {
		return null;
	}
	if ( ! is_string( $user_code ) || 1 !== preg_match( '/^[A-HJ-NP-Z2-9]{8}\z/', $user_code ) ) {
		return null;
	}
	return array(
		'request_id' => $request_id,
		'user_code'  => $user_code,
	);
}

/**
 * Parses the response to a successful redeem.
 *
 * @param string $body The response body.
 * @return array{site_key: string, key_version: int, website_id: string}|null
 */
function site_dispatch_parse_redeem_response( string $body ): ?array {
	$fields = site_dispatch_decode_response( $body );
	if ( null === $fields ) {
		return null;
	}
	$site_key    = $fields['site_key'] ?? null;
	$key_version = $fields['key_version'] ?? null;
	$website_id  = $fields['website_id'] ?? null;
	if ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\z/', $site_key ) ) {
		return null;
	}
	if ( ! is_int( $key_version ) || $key_version < 1 ) {
		return null;
	}
	if ( ! is_string( $website_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $website_id ) ) {
		return null;
	}
	return array(
		'site_key'    => $site_key,
		'key_version' => $key_version,
		'website_id'  => $website_id,
	);
}
