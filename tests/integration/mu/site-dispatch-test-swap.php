<?php
/**
 * TEST ONLY. Never part of a release (tests/ is export-ignore).
 *
 * Plays something on the server that gets at the package after the plugin checked it. Does
 * nothing unless a test set the option "sd_test_swap":
 *
 * content   other bytes are written into the checked file
 * path      the upgrader gets another file than the checked one
 *
 * The filter is added after all plugins are loaded, so it runs after the one of the plugin.
 *
 * @package Site_Dispatch
 */

add_action(
	'plugins_loaded',
	static function () {
		add_filter(
			'upgrader_pre_download',
			static function ( $reply ) {
				$mode  = get_option( 'sd_test_swap', '' );
				$bytes = base64_decode( (string) get_option( 'sd_test_swap_zip', '' ), true );
				if ( ! is_string( $reply ) || ! is_string( $bytes ) || ! in_array( $mode, array( 'content', 'path' ), true ) ) {
					return $reply;
				}
				$target = 'path' === $mode ? wp_tempnam( 'swapped.zip' ) : $reply;
				file_put_contents( $target, $bytes );
				return $target;
			},
			PHP_INT_MAX
		);
	}
);
