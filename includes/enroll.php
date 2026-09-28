<?php
/**
 * Enrollment after the device pattern: ask, show a code, collect the key.
 * Contract: PROTOCOL.md, section 2.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of this file. None of them can be changed at run time.
 */
const SITE_DISPATCH_ENROLL_TRANSIENT    = 'site_dispatch_enroll';
const SITE_DISPATCH_ENROLL_TTL          = 240;
const SITE_DISPATCH_ENROLL_REQUEST_PATH = '/webhook/site-dispatch-enroll-request';
const SITE_DISPATCH_ENROLL_REDEEM_PATH  = '/webhook/site-dispatch-enroll-redeem';

/**
 * Reads the open enrollment. Null if there is none, if it is damaged or if its time is over.
 *
 * @return array{secret: string, request_id: string, user_code: string, server_host: string, expires: int}|null
 */
function site_dispatch_get_enrollment(): ?array {
	$raw = get_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	if ( false === $raw ) {
		return null;
	}
	$raw         = is_array( $raw ) ? $raw : array();
	$secret      = $raw['secret'] ?? null;
	$request_id  = $raw['request_id'] ?? null;
	$user_code   = $raw['user_code'] ?? null;
	$server_host = $raw['server_host'] ?? null;
	$expires     = $raw['expires'] ?? null;
	if (
		is_string( $secret ) && 1 === preg_match( SITE_DISPATCH_KEY_PATTERN, $secret )
		&& is_string( $request_id ) && 1 === preg_match( SITE_DISPATCH_UUID_PATTERN, $request_id )
		&& is_string( $user_code ) && 1 === preg_match( '/^[A-HJ-NP-Z2-9]{8}\z/', $user_code )
		&& is_string( $server_host ) && site_dispatch_valid_server_host( $server_host ) === $server_host
		&& is_int( $expires ) && $expires > time()
	) {
		return array(
			'secret'      => $secret,
			'request_id'  => $request_id,
			'user_code'   => $user_code,
			'server_host' => $server_host,
			'expires'     => $expires,
		);
	}
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	return null;
}

/**
 * Asks the server for an enrollment. The secret stays in a transient, the server gets its hash.
 *
 * @param string $server_host Host as returned by site_dispatch_valid_server_host().
 * @return bool
 */
function site_dispatch_enroll_request( string $server_host ): bool {
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	if ( site_dispatch_valid_server_host( $server_host ) !== $server_host || ! site_dispatch_environment_supported() ) {
		return false;
	}
	$home_host = site_dispatch_home_host();
	if ( '' === $home_host ) {
		return false;
	}
	try {
		$secret = bin2hex( random_bytes( 32 ) );
	} catch ( \Exception $e ) {
		return false;
	}
	$body = wp_json_encode(
		array(
			'secret_hash'    => hash( 'sha256', $secret ),
			'home_host'      => $home_host,
			'plugin_version' => SITE_DISPATCH_VERSION,
		)
	);
	if ( false === $body ) {
		return false;
	}
	$response = site_dispatch_post(
		'https://' . $server_host . SITE_DISPATCH_ENROLL_REQUEST_PATH,
		$body,
		array( 'Content-Type' => 'application/json' ),
		15
	);
	if ( 200 !== $response['code'] ) {
		return false;
	}
	$parsed = site_dispatch_parse_request_response( $response['body'] );
	if ( null === $parsed ) {
		return false;
	}
	return set_transient(
		SITE_DISPATCH_ENROLL_TRANSIENT,
		array(
			'secret'      => $secret,
			'request_id'  => $parsed['request_id'],
			'user_code'   => $parsed['user_code'],
			'server_host' => $server_host,
			'expires'     => time() + SITE_DISPATCH_ENROLL_TTL,
		),
		SITE_DISPATCH_ENROLL_TTL
	);
}

/**
 * Tries to collect the key. Returns one fixed word, never anything the server said.
 *
 * @return string connected, pending, retry, failed or none.
 */
function site_dispatch_enroll_redeem(): string {
	$enrollment = site_dispatch_get_enrollment();
	if ( null === $enrollment ) {
		return 'none';
	}
	$body = wp_json_encode(
		array(
			'request_id' => $enrollment['request_id'],
			'secret'     => $enrollment['secret'],
		)
	);
	if ( false === $body ) {
		return 'failed';
	}
	$response = site_dispatch_post(
		'https://' . $enrollment['server_host'] . SITE_DISPATCH_ENROLL_REDEEM_PATH,
		$body,
		array( 'Content-Type' => 'application/json' ),
		15
	);
	$code     = $response['code'];
	if ( 202 === $code ) {
		return 'pending';
	}
	if ( 0 === $code || 429 === $code || $code >= 500 ) {
		return 'retry';
	}
	// Every other answer means the request is used up.
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	if ( 200 !== $code ) {
		return 'failed';
	}
	$parsed = site_dispatch_parse_redeem_response( $response['body'] );
	if ( null === $parsed ) {
		return 'failed';
	}
	// Delete and add: update_option() keeps an old autoload flag when the value is unchanged.
	delete_option( 'site_dispatch_state' );
	add_option(
		'site_dispatch_state',
		array(
			'website_id'  => $parsed['website_id'],
			'key'         => $parsed['site_key'],
			'key_version' => $parsed['key_version'],
			'server_host' => $enrollment['server_host'],
			'home_host'   => site_dispatch_home_host(),
		),
		'',
		false
	);
	wp_clear_scheduled_hook( 'site_dispatch_daily' );
	wp_clear_scheduled_hook( 'site_dispatch_retry' );
	wp_schedule_event( time() + MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );
	return 'connected';
}
