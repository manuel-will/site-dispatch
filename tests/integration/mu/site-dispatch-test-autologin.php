<?php
/**
 * TEST ONLY. Never part of a release (tests/ is export-ignore).
 *
 * Logs the visitor in as the first administrator, for the local preview (npm run playground).
 * Does nothing unless the preview defines SITE_DISPATCH_TEST_AUTOLOGIN. The test runs never do.
 *
 * @package Site_Dispatch
 */

add_action(
	'init',
	static function () {
		if ( ! defined( 'SITE_DISPATCH_TEST_AUTOLOGIN' ) || is_user_logged_in() || wp_doing_ajax() || wp_doing_cron() ) {
			return;
		}
		// Only for a browser that opens wp-admin. PHP runs of the harness have no such address.
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? (string) $_SERVER['REQUEST_METHOD'] : '';
		$target = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
		if ( 'GET' !== $method || false === strpos( $target, '/wp-admin/' ) ) {
			return;
		}
		$admins = get_users(
			array(
				'role'   => 'administrator',
				'number' => 1,
				'fields' => 'ID',
			)
		);
		if ( empty( $admins ) ) {
			return;
		}
		wp_set_current_user( (int) $admins[0] );
		wp_set_auth_cookie( (int) $admins[0] );
		// The cookies only count from the next request on. Send the visitor to wp-admin.
		if ( ! headers_sent() ) {
			wp_safe_redirect( admin_url( 'tools.php?page=site-dispatch' ) );
			exit;
		}
	}
);
