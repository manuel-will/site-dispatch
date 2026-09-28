<?php
/**
 * Daily report: payload, eligibility, signature, dispatch, retry. Contract: PROTOCOL.md, section 1.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of this file. None of them can be changed at run time.
 */
const SITE_DISPATCH_REPORT_PATH    = '/webhook/plugin-report';
const SITE_DISPATCH_SIZE_PATTERN   = '/^-?[0-9]{1,12}[KMGkmg]?\z/';
const SITE_DISPATCH_SERVER_PATTERN = '/^[A-Za-z][A-Za-z0-9_-]{0,31}(\/[0-9][0-9.]{0,15})?\z/';

/**
 * UTC timestamp in the form of the contract, null for "never".
 *
 * @param int $timestamp Unix time.
 * @return string|null
 */
function site_dispatch_iso( int $timestamp ): ?string {
	return $timestamp > 0 ? gmdate( 'Y-m-d\TH:i:s\Z', $timestamp ) : null;
}

/**
 * Copies only the allowed keys, only non-empty text and numbers. Never URLs or packages.
 *
 * @param mixed         $source Array or object from an update transient.
 * @param array<string> $keys   Allowed field names.
 * @return array<string, string>
 */
function site_dispatch_pick( $source, array $keys ): array {
	if ( is_object( $source ) ) {
		$source = get_object_vars( $source );
	}
	if ( ! is_array( $source ) ) {
		return array();
	}
	$out = array();
	foreach ( $keys as $key ) {
		$value = $source[ $key ] ?? null;
		if ( ( is_string( $value ) || is_int( $value ) || is_float( $value ) ) && '' !== (string) $value ) {
			$out[ $key ] = (string) $value;
		}
	}
	return $out;
}

/**
 * Lets a value pass only as text that matches the pattern.
 *
 * @param mixed  $value   Any value.
 * @param string $pattern Pattern, anchored with \z.
 * @return string|null
 */
function site_dispatch_clean( $value, string $pattern ): ?string {
	if ( is_int( $value ) ) {
		$value = (string) $value;
	}
	return is_string( $value ) && 1 === preg_match( $pattern, $value ) ? $value : null;
}

/**
 * Name and version of the web server, everything after that cut off.
 *
 * @param string $raw SERVER_SOFTWARE.
 * @return string|null
 */
function site_dispatch_server_software( string $raw ): ?string {
	$allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./';
	$token   = (string) substr( $raw, 0, strspn( $raw, $allowed ) );
	$full    = site_dispatch_clean( $token, SITE_DISPATCH_SERVER_PATTERN );
	if ( null !== $full ) {
		return $full;
	}
	return site_dispatch_clean( (string) substr( $token, 0, strcspn( $token, '/' ) ), SITE_DISPATCH_SERVER_PATTERN );
}

/**
 * Maps the core update settings to off, minor or all.
 *
 * @param mixed $constant         Value of WP_AUTO_UPDATE_CORE, null if not defined.
 * @param bool  $updater_disabled AUTOMATIC_UPDATER_DISABLED is on.
 * @param mixed $major_option     Option auto_update_core_major.
 * @return string
 */
function site_dispatch_core_auto_updates( $constant, bool $updater_disabled, $major_option ): string {
	if ( $updater_disabled || false === $constant ) {
		return 'off';
	}
	if ( 'minor' === $constant ) {
		return 'minor';
	}
	if ( null !== $constant ) {
		return 'all';
	}
	return 'enabled' === $major_option ? 'all' : 'minor';
}

/**
 * Value of the signature header: HMAC over the exact body bytes.
 *
 * @param string $body     The request body.
 * @param string $site_key The site key as the text it is stored in.
 * @return string
 */
function site_dispatch_sign_body( string $body, string $site_key ): string {
	return 'sha256=' . hash_hmac( 'sha256', $body, $site_key );
}

/**
 * May this site send a report right now?
 *
 * @param array{website_id: string, key: string, key_version: int, server_host: string, home_host: string}|null $state The stored connection.
 * @return bool
 */
function site_dispatch_eligible( ?array $state ): bool {
	if ( null === $state || site_dispatch_legacy_reporter_present() || ! site_dispatch_environment_supported() ) {
		return false;
	}
	// A staging clone copies the key with the database. Its host differs, it stays silent.
	$host = site_dispatch_home_host();
	return '' !== $host && $state['home_host'] === $host;
}

/**
 * Plans the daily report if it is due and not planned yet.
 */
function site_dispatch_schedule(): void {
	if ( ! site_dispatch_eligible( site_dispatch_get_state() ) ) {
		return;
	}
	if ( false === wp_next_scheduled( 'site_dispatch_daily' ) ) {
		wp_schedule_event( time() + 5 * MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );
	}
}

/**
 * Reads what WordPress has stored about updates. Never triggers a check.
 *
 * @param string $name update_plugins, update_themes or update_core.
 * @return array{response: array<mixed>, no_update: array<mixed>, updates: array<mixed>, last_checked: string|null}
 */
function site_dispatch_update_data( string $name ): array {
	$out       = array(
		'response'     => array(),
		'no_update'    => array(),
		'updates'      => array(),
		'last_checked' => null,
	);
	$transient = get_site_transient( $name );
	if ( ! is_object( $transient ) ) {
		return $out;
	}
	$fields = get_object_vars( $transient );
	foreach ( array( 'response', 'no_update', 'updates' ) as $field ) {
		if ( isset( $fields[ $field ] ) && is_array( $fields[ $field ] ) ) {
			$out[ $field ] = $fields[ $field ];
		}
	}
	if ( isset( $fields['last_checked'] ) && is_numeric( $fields['last_checked'] ) ) {
		$out['last_checked'] = site_dispatch_iso( (int) $fields['last_checked'] );
	}
	return $out;
}

/**
 * Installed plugins with the update WordPress knows about.
 *
 * @param array{response: array<mixed>, no_update: array<mixed>, updates: array<mixed>, last_checked: string|null} $data Update data.
 * @return array<int, array<string, mixed>>
 */
function site_dispatch_report_plugins( array $data ): array {
	if ( ! function_exists( 'get_plugins' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}
	$plugins = array();
	foreach ( get_plugins() as $file => $header ) {
		$file   = (string) $file;
		$dir    = dirname( $file );
		$slug   = '.' === $dir ? basename( $file, '.php' ) : $dir;
		$offer  = $data['response'][ $file ] ?? null;
		$entry  = $offer ?? ( $data['no_update'][ $file ] ?? null );
		$id     = site_dispatch_pick( $entry, array( 'id' ) )['id'] ?? '';
		$picked = site_dispatch_pick( $offer, array( 'new_version', 'requires', 'requires_php', 'tested' ) );

		$plugins[] = array(
			'file'         => $file,
			'slug'         => $slug,
			'name'         => isset( $header['Name'] ) && is_string( $header['Name'] ) ? $header['Name'] : $slug,
			'version'      => isset( $header['Version'] ) && is_string( $header['Version'] ) ? $header['Version'] : '',
			'active'       => is_plugin_active( $file ),
			'wporg'        => 0 === strpos( $id, 'w.org/plugins/' ),
			'update_known' => null !== $entry,
			'update'       => isset( $picked['new_version'] ) ? $picked : null,
		);
	}
	return $plugins;
}

/**
 * Installed themes with the update WordPress knows about.
 *
 * @param array{response: array<mixed>, no_update: array<mixed>, updates: array<mixed>, last_checked: string|null} $data Update data.
 * @return array<int, array<string, mixed>>
 */
function site_dispatch_report_themes( array $data ): array {
	$active = get_stylesheet();
	$parent = get_template();
	$themes = array();
	foreach ( wp_get_themes() as $stylesheet => $theme ) {
		$stylesheet = (string) $stylesheet;
		$picked     = site_dispatch_pick( $data['response'][ $stylesheet ] ?? null, array( 'new_version', 'requires', 'requires_php' ) );
		$themes[]   = array(
			'stylesheet' => $stylesheet,
			'name'       => (string) $theme->get( 'Name' ),
			'version'    => (string) $theme->get( 'Version' ),
			'active'     => $stylesheet === $active,
			'parent'     => $stylesheet === $parent && $stylesheet !== $active,
			'update'     => isset( $picked['new_version'] ) ? $picked : null,
		);
	}
	return $themes;
}

/**
 * Core version with the upgrade WordPress knows about.
 *
 * @return array{version: string, update: array{version: string, response: string}|null, last_checked: string|null}
 */
function site_dispatch_report_core(): array {
	$data   = site_dispatch_update_data( 'update_core' );
	$update = null;
	foreach ( $data['updates'] as $offer ) {
		$picked = site_dispatch_pick( $offer, array( 'current', 'response' ) );
		if ( 'upgrade' === ( $picked['response'] ?? '' ) ) {
			if ( isset( $picked['current'] ) ) {
				$update = array(
					'version'  => $picked['current'],
					'response' => 'upgrade',
				);
			}
			break;
		}
	}
	return array(
		'version'      => (string) get_bloginfo( 'version' ),
		'update'       => $update,
		'last_checked' => $data['last_checked'],
	);
}

/**
 * Value of a constant, null if it is not defined.
 *
 * @param string $name Name of the constant.
 * @return mixed
 */
function site_dispatch_constant( string $name ) {
	return defined( $name ) ? constant( $name ) : null;
}

/**
 * The environment block. Strict allowlist, a value that fails its pattern is left out.
 *
 * @return array<string, mixed>
 */
function site_dispatch_environment(): array {
	global $wpdb;
	$keep = static function ( $value ): bool {
		return null !== $value;
	};

	$wp = array(
		'locale'            => site_dispatch_clean( get_locale(), '/^[A-Za-z0-9_-]{2,32}\z/' ),
		'timezone'          => site_dispatch_clean( wp_timezone_string(), '/^[A-Za-z0-9_+:\/-]{1,64}\z/' ),
		'environment_type'  => site_dispatch_clean( wp_get_environment_type(), '/^[a-z]{1,20}\z/' ),
		'https'             => 'https' === wp_parse_url( home_url(), PHP_URL_SCHEME ),
		'debug'             => true === site_dispatch_constant( 'WP_DEBUG' ),
		'cron_disabled'     => true === site_dispatch_constant( 'DISABLE_WP_CRON' ),
		'object_cache'      => (bool) wp_using_ext_object_cache(),
		'core_auto_updates' => site_dispatch_core_auto_updates(
			site_dispatch_constant( 'WP_AUTO_UPDATE_CORE' ),
			true === site_dispatch_constant( 'AUTOMATIC_UPDATER_DISABLED' ),
			get_site_option( 'auto_update_core_major', null )
		),
		'memory_limit'      => site_dispatch_clean( site_dispatch_constant( 'WP_MEMORY_LIMIT' ), SITE_DISPATCH_SIZE_PATTERN ),
	);

	$time = ini_get( 'max_execution_time' );
	$php  = array(
		'version'             => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '.' . PHP_RELEASE_VERSION,
		'extensions'          => array(
			'imagick' => extension_loaded( 'imagick' ),
			'sodium'  => extension_loaded( 'sodium' ),
			'intl'    => extension_loaded( 'intl' ),
			'opcache' => extension_loaded( 'Zend OPcache' ),
		),
		'memory_limit'        => site_dispatch_clean( ini_get( 'memory_limit' ), SITE_DISPATCH_SIZE_PATTERN ),
		'max_execution_time'  => 1 === preg_match( '/^[0-9]{1,6}\z/', (string) $time ) ? (int) $time : null,
		'upload_max_filesize' => site_dispatch_clean( ini_get( 'upload_max_filesize' ), SITE_DISPATCH_SIZE_PATTERN ),
		'post_max_size'       => site_dispatch_clean( ini_get( 'post_max_size' ), SITE_DISPATCH_SIZE_PATTERN ),
	);

	$environment = array(
		'wp'  => array_filter( $wp, $keep ),
		'php' => array_filter( $php, $keep ),
	);

	if ( $wpdb instanceof \wpdb ) {
		$db_version = site_dispatch_clean( $wpdb->db_version(), '/^[0-9]{1,3}(\.[0-9]{1,5}){1,3}\z/' );
		if ( null !== $db_version ) {
			$environment['db'] = array(
				'type'    => false !== stripos( $wpdb->db_server_info(), 'mariadb' ) ? 'mariadb' : 'mysql',
				'version' => $db_version,
			);
		}
	}

	// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- Reduced to name and version by a fixed pattern.
	$software = isset( $_SERVER['SERVER_SOFTWARE'] ) && is_string( $_SERVER['SERVER_SOFTWARE'] ) ? $_SERVER['SERVER_SOFTWARE'] : '';
	$server   = site_dispatch_server_software( $software );
	if ( null !== $server ) {
		$environment['server'] = $server;
	}
	return $environment;
}

/**
 * Builds the report body.
 *
 * @param array{website_id: string, key: string, key_version: int, server_host: string, home_host: string} $state The stored connection.
 * @return array<string, mixed>
 */
function site_dispatch_build_report( array $state ): array {
	$plugins = site_dispatch_update_data( 'update_plugins' );
	$themes  = site_dispatch_update_data( 'update_themes' );
	return array(
		'schema_version'       => 1,
		'reporter_version'     => SITE_DISPATCH_VERSION,
		'website_id'           => $state['website_id'],
		'home_url'             => (string) home_url(),
		'generated_at'         => site_dispatch_iso( time() ),
		'core'                 => site_dispatch_report_core(),
		'plugins_last_checked' => $plugins['last_checked'],
		'plugins'              => site_dispatch_report_plugins( $plugins ),
		'themes_last_checked'  => $themes['last_checked'],
		'themes'               => site_dispatch_report_themes( $themes ),
		'environment'          => site_dispatch_environment(),
	);
}

/**
 * Sends the report. One retry after an hour for transport errors, 429 and 5xx.
 *
 * @param bool $is_retry This run is the retry.
 */
function site_dispatch_send( bool $is_retry ): void {
	$state = site_dispatch_get_state();
	if ( null === $state || ! site_dispatch_eligible( $state ) ) {
		return;
	}
	$body = wp_json_encode( site_dispatch_build_report( $state ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	if ( false === $body ) {
		return;
	}
	// Signed over the exact body bytes. Replay protection comes from generated_at inside the body.
	$response = site_dispatch_post(
		'https://' . $state['server_host'] . SITE_DISPATCH_REPORT_PATH,
		$body,
		array(
			'Content-Type'   => 'application/json',
			'X-MW-Site'      => $state['website_id'],
			'X-MW-Signature' => site_dispatch_sign_body( $body, $state['key'] ),
		),
		20
	);
	$code     = $response['code'];
	update_option(
		'site_dispatch_last_report',
		array(
			'at'          => time(),
			'http_status' => $code,
		),
		false
	);
	if ( $code >= 200 && $code < 300 ) {
		return;
	}
	// A rejected report (4xx) would be rejected again, the server reports it.
	$retryable = 0 === $code || 429 === $code || $code >= 500;
	if ( $retryable && ! $is_retry && false === wp_next_scheduled( 'site_dispatch_retry' ) ) {
		wp_schedule_single_event( time() + HOUR_IN_SECONDS, 'site_dispatch_retry' );
	}
}

/**
 * Cron callback of the daily report.
 */
function site_dispatch_send_daily(): void {
	site_dispatch_send( false );
}

/**
 * Cron callback of the retry.
 */
function site_dispatch_send_retry(): void {
	site_dispatch_send( true );
}
