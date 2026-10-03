<?php
/**
 * Plugin Name:       Site Dispatch
 * Description:       Sends a signed, read-only status report (plugins, available updates, WordPress and server versions) to a server you connect it to. No inbound endpoints, no remote commands.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Update URI:        https://github.com/manuel-will/site-dispatch
 * Author:            Manuel Will
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       site-dispatch
 *
 * @package Site_Dispatch
 */

defined( 'ABSPATH' ) || exit;

// A second copy of the plugin must not load.
if ( defined( 'SITE_DISPATCH_VERSION' ) ) {
	return;
}

const SITE_DISPATCH_VERSION = '0.1.0';
const SITE_DISPATCH_FILE    = __FILE__;

require __DIR__ . '/includes/verify.php';
require __DIR__ . '/includes/hosts.php';
require __DIR__ . '/includes/responses.php';
require __DIR__ . '/includes/common.php';
require __DIR__ . '/includes/report.php';
require __DIR__ . '/includes/enroll.php';
require __DIR__ . '/includes/keys.php';
require __DIR__ . '/includes/source.php';
require __DIR__ . '/includes/class-site-dispatch-memo.php';
require __DIR__ . '/includes/updater.php';
require __DIR__ . '/includes/admin.php';

/**
 * Plans the daily update check, and the daily report if the site is connected. Refuses to
 * activate on a multisite network: the plugin reports and updates one site, nothing else.
 */
function site_dispatch_activate(): void {
	if ( is_multisite() ) {
		deactivate_plugins( plugin_basename( __FILE__ ) );
		wp_die( esc_html__( 'Site Dispatch does not run on a multisite network.', 'site-dispatch' ), '', array( 'back_link' => true ) );
	}
	site_dispatch_schedule();
	site_dispatch_schedule_update_check();
}

/**
 * Removes the cron events and an open enrollment. The connection stays.
 */
function site_dispatch_deactivate(): void {
	wp_clear_scheduled_hook( 'site_dispatch_daily' );
	wp_clear_scheduled_hook( 'site_dispatch_retry' );
	wp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
}

register_activation_hook( __FILE__, 'site_dispatch_activate' );
register_deactivation_hook( __FILE__, 'site_dispatch_deactivate' );

add_action( 'site_dispatch_daily', 'site_dispatch_send_daily' );
add_action( 'site_dispatch_retry', 'site_dispatch_send_retry' );

add_action( SITE_DISPATCH_UPDATE_HOOK, 'site_dispatch_update_check' );

add_filter( 'site_transient_update_plugins', 'site_dispatch_filter_update_list', PHP_INT_MAX );
add_filter( 'upgrader_pre_download', 'site_dispatch_pre_download', PHP_INT_MAX, 4 );
add_filter( 'pre_unzip_file', 'site_dispatch_pre_unzip', PHP_INT_MAX, 2 );
add_filter( 'upgrader_source_selection', 'site_dispatch_source_selection', PHP_INT_MAX, 4 );
add_filter( 'auto_update_plugin', 'site_dispatch_auto_update', PHP_INT_MAX, 2 );
add_action( 'upgrader_process_complete', 'site_dispatch_forget_package' );

add_action( 'admin_init', 'site_dispatch_schedule' );
add_action( 'admin_init', 'site_dispatch_schedule_update_check' );
add_action( 'admin_menu', 'site_dispatch_admin_menu' );
add_action( 'admin_notices', 'site_dispatch_legacy_notice' );
add_action( 'admin_notices', 'site_dispatch_capability_notice' );
add_action( 'admin_enqueue_scripts', 'site_dispatch_admin_assets' );
add_action( 'admin_post_site_dispatch_connect', 'site_dispatch_handle_connect' );
add_action( 'admin_post_site_dispatch_settings', 'site_dispatch_handle_settings' );
add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );
