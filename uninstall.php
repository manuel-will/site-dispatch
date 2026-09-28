<?php
/**
 * Removes everything the plugin stored: options, the enrollment transient, cron events.
 *
 * @package Site_Dispatch
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'site_dispatch_state' );
delete_option( 'site_dispatch_update' );
delete_option( 'site_dispatch_early_updates' );
delete_option( 'site_dispatch_last_report' );
delete_transient( 'site_dispatch_enroll' );
wp_clear_scheduled_hook( 'site_dispatch_daily' );
wp_clear_scheduled_hook( 'site_dispatch_retry' );
wp_clear_scheduled_hook( 'site_dispatch_update_check' );
