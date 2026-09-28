<?php
/**
 * TEST ONLY. Never part of a release (tests/ is export-ignore).
 *
 * The plugin only speaks https to a host name without port. This file sends requests for
 * https://server.example.test/ to the fake server on 127.0.0.1 and tells it which request
 * arguments the plugin chose. Every other outgoing request is refused, so no test reaches the
 * internet.
 *
 * @package Site_Dispatch
 */

add_filter(
	'pre_http_request',
	static function ( $pre, $args, $url ) {
		$remote = 'https://server.example.test/';
		$local  = 'http://127.0.0.1:' . (int) SITE_DISPATCH_TEST_FAKE_PORT . '/';
		if ( 0 === strpos( $url, $local ) ) {
			return $pre;
		}
		if ( 0 !== strpos( $url, $remote ) ) {
			return new WP_Error( 'site_dispatch_test_blocked', 'Refused by the test reroute.' );
		}
		$seen = array();
		foreach ( array( 'sslverify', 'redirection', 'timeout', 'limit_response_size', 'reject_unsafe_urls' ) as $name ) {
			$seen[ $name ] = $args[ $name ] ?? null;
		}
		$forward                          = $args;
		$forward['headers']               = is_array( $args['headers'] ?? null ) ? $args['headers'] : array();
		$forward['headers']['X-Test-Args'] = wp_json_encode( $seen );
		$forward['sslverify']             = false;
		$forward['reject_unsafe_urls']    = false;
		return wp_remote_request( $local . substr( $url, strlen( $remote ) ), $forward );
	},
	10,
	3
);
