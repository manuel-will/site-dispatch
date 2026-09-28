<?php
/**
 * TEST ONLY. Never part of a release (tests/ is export-ignore).
 *
 * The plugin only speaks https to a host name without port. This file sends requests for the
 * made up hosts of the tests to the fake servers on 127.0.0.1, tells them the host name and
 * which request arguments the plugin chose. Every other outgoing request is refused, so no test
 * reaches the internet.
 *
 * server.example.test                          fake of the report and enrollment server
 * github.example.test, assets.example.test     fake of the release host and its asset host
 * api.wordpress.org                            the release fake, only with SITE_DISPATCH_TEST_WPORG
 * the own site                                 only with SITE_DISPATCH_TEST_LOOPBACK (an upgrade of
 *                                              an active plugin calls the own site once)
 *
 * @package Site_Dispatch
 */

add_filter(
	'pre_http_request',
	static function ( $pre, $args, $url ) {
		$ports = array();
		if ( defined( 'SITE_DISPATCH_TEST_FAKE_PORT' ) ) {
			$ports['server.example.test'] = (int) SITE_DISPATCH_TEST_FAKE_PORT;
		}
		if ( defined( 'SITE_DISPATCH_TEST_RELEASE_PORT' ) ) {
			$ports['github.example.test'] = (int) SITE_DISPATCH_TEST_RELEASE_PORT;
			$ports['assets.example.test'] = (int) SITE_DISPATCH_TEST_RELEASE_PORT;
			if ( defined( 'SITE_DISPATCH_TEST_WPORG' ) ) {
				$ports['api.wordpress.org'] = (int) SITE_DISPATCH_TEST_RELEASE_PORT;
			}
		}
		foreach ( $ports as $port ) {
			if ( 0 === strpos( $url, 'http://127.0.0.1:' . $port . '/' ) ) {
				return $pre;
			}
		}
		if ( defined( 'SITE_DISPATCH_TEST_LOOPBACK' ) && 0 === strpos( $url, home_url( '/' ) ) ) {
			return $pre;
		}
		if ( 1 !== preg_match( '#^https://([a-z0-9.-]+)/(.*)\z#s', $url, $hit ) || ! isset( $ports[ $hit[1] ] ) ) {
			return new WP_Error( 'site_dispatch_test_blocked', 'Refused by the test reroute.' );
		}
		$seen = array();
		foreach ( array( 'sslverify', 'redirection', 'timeout', 'limit_response_size', 'reject_unsafe_urls' ) as $name ) {
			$seen[ $name ] = $args[ $name ] ?? null;
		}
		if ( ! empty( $args['stream'] ) ) {
			$seen['stream'] = true;
		}
		$forward                           = $args;
		$forward['headers']                = is_array( $args['headers'] ?? null ) ? $args['headers'] : array();
		$forward['headers']['X-Test-Args'] = wp_json_encode( $seen );
		$forward['headers']['X-Test-Host'] = $hit[1];
		$forward['sslverify']              = false;
		$forward['reject_unsafe_urls']     = false;
		return wp_remote_request( 'http://127.0.0.1:' . $ports[ $hit[1] ] . '/' . $hit[2], $forward );
	},
	10,
	3
);
