<?php
/**
 * Shared helpers: the stored connection and the one way out to the server.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of this file. None of them can be changed at run time.
 */
const SITE_DISPATCH_HOME_HOST_PATTERN = '/^[a-z0-9.-]{1,253}\z/';
const SITE_DISPATCH_KEY_PATTERN       = '/^[0-9a-f]{64}\z/';

/**
 * Host of home_url() for comparing. Empty text if there is none.
 *
 * @return string
 */
function site_dispatch_home_host(): string {
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	return is_string( $host ) ? site_dispatch_norm_host( $host ) : '';
}

/**
 * Only a production site without multisite connects and reports.
 *
 * @return bool
 */
function site_dispatch_environment_supported(): bool {
	return ! is_multisite() && 'production' === wp_get_environment_type();
}

/**
 * The snippet reporter is still configured on this site.
 *
 * @return bool
 */
function site_dispatch_legacy_reporter_present(): bool {
	return defined( 'MW_PLUGIN_REPORT_KEY' );
}

/**
 * Reads the stored connection. Null unless every field has its exact form.
 *
 * @return array{website_id: string, key: string, key_version: int, server_host: string, home_host: string}|null
 */
function site_dispatch_get_state(): ?array {
	$raw = get_option( 'site_dispatch_state', null );
	if ( ! is_array( $raw ) ) {
		return null;
	}
	$website_id  = $raw['website_id'] ?? null;
	$key         = $raw['key'] ?? null;
	$key_version = $raw['key_version'] ?? null;
	$server_host = $raw['server_host'] ?? null;
	$home_host   = $raw['home_host'] ?? null;
	if ( ! is_string( $website_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $website_id ) ) {
		return null;
	}
	if ( ! is_string( $key ) || 1 !== preg_match( SITE_DISPATCH_KEY_PATTERN, $key ) ) {
		return null;
	}
	if ( ! is_int( $key_version ) || $key_version < 1 ) {
		return null;
	}
	if ( ! is_string( $server_host ) || site_dispatch_valid_server_host( $server_host ) !== $server_host ) {
		return null;
	}
	if ( ! is_string( $home_host ) || 1 !== preg_match( SITE_DISPATCH_HOME_HOST_PATTERN, $home_host ) ) {
		return null;
	}
	return array(
		'website_id'  => $website_id,
		'key'         => $key,
		'key_version' => $key_version,
		'server_host' => $server_host,
		'home_host'   => $home_host,
	);
}

/**
 * Sends one POST. TLS check on, no redirects, answer cut one byte above the contract limit so the
 * parsers can tell that it was too large.
 *
 * @param string                $url     Target, always https.
 * @param string                $body    Request body, sent byte for byte.
 * @param array<string, string> $headers Request headers.
 * @param int                   $timeout Seconds.
 * @return array{code: int, body: string} Code 0 on a transport error.
 */
function site_dispatch_post( string $url, string $body, array $headers, int $timeout ): array {
	$result = wp_remote_post(
		$url,
		array(
			'timeout'             => $timeout,
			'redirection'         => 0,
			'sslverify'           => true,
			'reject_unsafe_urls'  => true,
			'limit_response_size' => SITE_DISPATCH_RESPONSE_MAX_BYTES + 1,
			'headers'             => $headers,
			'body'                => $body,
			'data_format'         => 'body',
		)
	);
	if ( is_wp_error( $result ) ) {
		return array(
			'code' => 0,
			'body' => '',
		);
	}
	return array(
		'code' => (int) wp_remote_retrieve_response_code( $result ),
		'body' => wp_remote_retrieve_body( $result ),
	);
}
