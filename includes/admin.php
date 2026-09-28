<?php
/**
 * Page under "Tools": status, connect, switch for immediate updates. The key is never shown.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of this file. None of them can be changed at run time.
 */
const SITE_DISPATCH_PAGE          = 'site-dispatch';
const SITE_DISPATCH_POLL_INTERVAL = 3000;
const SITE_DISPATCH_POLL_MAX      = 120000;
const SITE_DISPATCH_UPDATE_DELAY  = 259200;

/**
 * Adds the page to the "Tools" menu.
 */
function site_dispatch_admin_menu(): void {
	add_management_page(
		__( 'Site Dispatch', 'site-dispatch' ),
		__( 'Site Dispatch', 'site-dispatch' ),
		'manage_options',
		SITE_DISPATCH_PAGE,
		'site_dispatch_render_page'
	);
}

/**
 * Address of the page, with a notice code if given.
 *
 * @param string $notice One of the fixed notice codes.
 * @return string
 */
function site_dispatch_page_url( string $notice = '' ): string {
	$url = admin_url( 'tools.php?page=' . SITE_DISPATCH_PAGE );
	return '' === $notice ? $url : add_query_arg( 'site_dispatch_notice', $notice, $url );
}

/**
 * Texts of the notices. Anything else in the address is ignored.
 *
 * @return array<string, array{type: string, text: string}>
 */
function site_dispatch_notices(): array {
	return array(
		'bad_host'       => array(
			'type' => 'error',
			'text' => __( 'This is not a valid host name. Enter it without https:// and without a path, for example server.example.com.', 'site-dispatch' ),
		),
		'connect_failed' => array(
			'type' => 'error',
			'text' => __( 'The server did not accept the request. Check the host name and try again.', 'site-dispatch' ),
		),
		'saved'          => array(
			'type' => 'success',
			'text' => __( 'Saved.', 'site-dispatch' ),
		),
	);
}

/**
 * Stops with 403 unless an administrator sent the form with its nonce.
 *
 * @param string $action Nonce action.
 */
function site_dispatch_require_admin( string $action ): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );
	}
	check_admin_referer( $action );
}

/**
 * Turns a form value into a checked host name. Null for anything that is not one.
 *
 * @param mixed $raw The unslashed form value.
 * @return string|null
 */
function site_dispatch_host_input( $raw ): ?string {
	return is_string( $raw ) ? site_dispatch_valid_server_host( trim( $raw ) ) : null;
}

/**
 * Form "Connect": checks the host and asks the server for an enrollment.
 */
function site_dispatch_handle_connect(): void {
	site_dispatch_require_admin( 'site_dispatch_connect' );
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked in site_dispatch_require_admin().
	$input  = isset( $_POST['server_host'] ) ? site_dispatch_host_input( wp_unslash( $_POST['server_host'] ) ) : null;
	$notice = 'bad_host';
	if ( null !== $input ) {
		$notice = site_dispatch_enroll_request( $input ) ? '' : 'connect_failed';
	}
	wp_safe_redirect( site_dispatch_page_url( $notice ) );
	exit;
}

/**
 * Form "Settings": the switch for immediate updates.
 */
function site_dispatch_handle_settings(): void {
	site_dispatch_require_admin( 'site_dispatch_settings' );
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked in site_dispatch_require_admin().
	$early = isset( $_POST['early_updates'] );
	delete_option( 'site_dispatch_early_updates' );
	add_option( 'site_dispatch_early_updates', $early ? 1 : 0, '', false );
	wp_safe_redirect( site_dispatch_page_url( 'saved' ) );
	exit;
}

/**
 * Ajax for logged-in administrators: one attempt to collect the key.
 */
function site_dispatch_ajax_redeem(): void {
	if ( ! current_user_can( 'manage_options' ) || false === check_ajax_referer( 'site_dispatch_redeem', 'nonce', false ) ) {
		wp_send_json( array( 'status' => 'forbidden' ), 403 );
	}
	wp_send_json( array( 'status' => site_dispatch_enroll_redeem() ) );
}

/**
 * Loads the polling script, only on the page and only while an enrollment is open.
 *
 * @param string $hook Current admin page.
 */
function site_dispatch_admin_assets( string $hook ): void {
	if ( 'tools_page_' . SITE_DISPATCH_PAGE !== $hook || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( null === site_dispatch_get_enrollment() ) {
		return;
	}
	wp_enqueue_script( 'site-dispatch-admin', plugins_url( 'assets/admin.js', SITE_DISPATCH_FILE ), array(), SITE_DISPATCH_VERSION, true );
	wp_localize_script(
		'site-dispatch-admin',
		'siteDispatchAdmin',
		array(
			'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
			'pageUrl'     => site_dispatch_page_url(),
			'nonce'       => wp_create_nonce( 'site_dispatch_redeem' ),
			'interval'    => SITE_DISPATCH_POLL_INTERVAL,
			'maxTime'     => SITE_DISPATCH_POLL_MAX,
			'textWaiting' => __( 'Waiting for the approval.', 'site-dispatch' ),
			'textPaused'  => __( 'Still not approved. Use the button to check again.', 'site-dispatch' ),
			'textFailed'  => __( 'The request failed or has expired. Connect again.', 'site-dispatch' ),
		)
	);
}

/**
 * Tells administrators that the snippet reporter is still configured.
 */
function site_dispatch_legacy_notice(): void {
	if ( ! site_dispatch_legacy_reporter_present() || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	printf(
		'<div class="notice notice-warning"><p>%s</p></div>',
		esc_html__( 'Site Dispatch sends no reports while the constants of the old report snippet are defined. Remove the snippets to let the plugin take over.', 'site-dispatch' )
	);
}

/**
 * One row of the status table.
 *
 * @param string $label Label, already translated.
 * @param string $value Value as plain text.
 */
function site_dispatch_row( string $label, string $value ): void {
	printf( '<tr><th scope="row">%s</th><td>%s</td></tr>', esc_html( $label ), esc_html( $value ) );
}

/**
 * Text for the last report.
 *
 * @return string
 */
function site_dispatch_last_report_text(): string {
	$last   = get_option( 'site_dispatch_last_report', null );
	$at     = is_array( $last ) ? ( $last['at'] ?? null ) : null;
	$status = is_array( $last ) ? ( $last['http_status'] ?? null ) : null;
	if ( ! is_int( $at ) || ! is_int( $status ) ) {
		return __( 'None yet', 'site-dispatch' );
	}
	$when = (string) wp_date( 'Y-m-d H:i', $at );
	if ( 0 === $status ) {
		/* translators: %s: date and time */
		return sprintf( __( '%s, server not reached', 'site-dispatch' ), $when );
	}
	/* translators: 1: date and time, 2: HTTP status code */
	return sprintf( __( '%1$s, status %2$d', 'site-dispatch' ), $when, $status );
}

/**
 * Text for a waiting update.
 *
 * @param bool $early Immediate updates are on.
 * @return string
 */
function site_dispatch_waiting_update_text( bool $early ): string {
	$update     = get_option( 'site_dispatch_update', null );
	$version    = is_array( $update ) ? ( $update['version'] ?? null ) : null;
	$first_seen = is_array( $update ) ? ( $update['first_seen'] ?? null ) : null;
	if ( ! is_string( $version ) || 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) || ! is_int( $first_seen ) ) {
		return __( 'None', 'site-dispatch' );
	}
	if ( $early ) {
		/* translators: %s: version number */
		return sprintf( __( '%s, installs at the next check', 'site-dispatch' ), $version );
	}
	/* translators: 1: version number, 2: date and time */
	return sprintf( __( '%1$s, installs from %2$s', 'site-dispatch' ), $version, (string) wp_date( 'Y-m-d H:i', $first_seen + SITE_DISPATCH_UPDATE_DELAY ) );
}

/**
 * Renders the page.
 */
function site_dispatch_render_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to view this page.', 'site-dispatch' ), '', array( 'response' => 403 ) );
	}
	$state      = site_dispatch_get_state();
	$enrollment = site_dispatch_get_enrollment();
	$early      = (bool) get_option( 'site_dispatch_early_updates', false );
	$notices    = site_dispatch_notices();
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Selects one of three fixed texts, changes nothing.
	$code = isset( $_GET['site_dispatch_notice'] ) && is_string( $_GET['site_dispatch_notice'] ) ? sanitize_key( $_GET['site_dispatch_notice'] ) : '';

	echo '<div class="wrap"><h1>' . esc_html__( 'Site Dispatch', 'site-dispatch' ) . '</h1>';
	if ( isset( $notices[ $code ] ) ) {
		printf( '<div class="notice notice-%s"><p>%s</p></div>', esc_attr( $notices[ $code ]['type'] ), esc_html( $notices[ $code ]['text'] ) );
	}

	echo '<table class="widefat striped" role="presentation" style="max-width:40em;margin-top:1em"><tbody>';
	site_dispatch_row( __( 'Connected', 'site-dispatch' ), null === $state ? __( 'No, not connected', 'site-dispatch' ) : __( 'Yes', 'site-dispatch' ) );
	site_dispatch_row( __( 'Server', 'site-dispatch' ), null === $state ? '-' : $state['server_host'] );
	site_dispatch_row( __( 'Last report', 'site-dispatch' ), site_dispatch_last_report_text() );
	site_dispatch_row( __( 'Version', 'site-dispatch' ), SITE_DISPATCH_VERSION );
	site_dispatch_row( __( 'Waiting update', 'site-dispatch' ), site_dispatch_waiting_update_text( $early ) );
	echo '</tbody></table>';

	if ( null !== $enrollment ) {
		echo '<h2>' . esc_html__( 'Approve this site', 'site-dispatch' ) . '</h2>';
		printf( '<p>%s <strong><code>%s</code></strong></p>', esc_html__( 'Type this code into the approval form of your server:', 'site-dispatch' ), esc_html( $enrollment['user_code'] ) );
		$form = 'https://' . $enrollment['server_host'] . '/form/site-dispatch-approve';
		printf( '<p><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></p>', esc_url( $form ), esc_html( $form ) );
		printf( '<p id="site-dispatch-enroll-status" aria-live="polite">%s</p>', esc_html__( 'Waiting for the approval.', 'site-dispatch' ) );
		printf( '<p><button type="button" class="button" id="site-dispatch-check">%s</button></p>', esc_html__( 'Check now', 'site-dispatch' ) );
	}

	echo '<h2>' . esc_html( null === $state ? __( 'Connect', 'site-dispatch' ) : __( 'Connect again', 'site-dispatch' ) ) . '</h2>';
	if ( ! site_dispatch_environment_supported() ) {
		echo '<p>' . esc_html__( 'Connecting is only possible on a production site without multisite.', 'site-dispatch' ) . '</p>';
	} else {
		printf( '<form method="post" action="%s">', esc_url( admin_url( 'admin-post.php' ) ) );
		echo '<input type="hidden" name="action" value="site_dispatch_connect">';
		wp_nonce_field( 'site_dispatch_connect' );
		printf( '<p><label for="site-dispatch-host">%s</label><br>', esc_html__( 'Host name of the server', 'site-dispatch' ) );
		echo '<input type="text" class="regular-text" id="site-dispatch-host" name="server_host" autocomplete="off" spellcheck="false" placeholder="server.example.com"></p>';
		if ( null !== $state ) {
			echo '<p class="description">' . esc_html__( 'Connecting again replaces the key of this site.', 'site-dispatch' ) . '</p>';
		}
		submit_button( __( 'Connect', 'site-dispatch' ), 'primary', 'submit', true );
		echo '</form>';
	}

	echo '<h2>' . esc_html__( 'Updates', 'site-dispatch' ) . '</h2>';
	printf( '<form method="post" action="%s">', esc_url( admin_url( 'admin-post.php' ) ) );
	echo '<input type="hidden" name="action" value="site_dispatch_settings">';
	wp_nonce_field( 'site_dispatch_settings' );
	printf(
		'<p><label><input type="checkbox" name="early_updates" value="1"%s> %s</label></p>',
		checked( $early, true, false ),
		esc_html__( 'Install updates of this plugin immediately, without the waiting period of 72 hours', 'site-dispatch' )
	);
	submit_button( __( 'Save', 'site-dispatch' ), 'secondary', 'submit', true );
	echo '</form></div>';
}
