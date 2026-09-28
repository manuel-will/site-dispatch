<?php
/**
 * Pure helpers of the report: signature header, allowlist copy, patterns, server name.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class ReportHelpersTest extends TestCase {

	private const SIZE = '/^-?[0-9]{1,12}[KMGkmg]?\z/';

	public function test_signature_header_matches_the_protocol_vector(): void {
		$dir    = dirname( __DIR__ ) . '/vectors';
		$body   = (string) file_get_contents( $dir . '/report-body.json' );
		$vector = json_decode( (string) file_get_contents( $dir . '/report-hmac.json' ), true );
		$this->assertIsArray( $vector );
		$this->assertSame( 524, strlen( $body ) );

		$this->assertSame( $vector['signature_header'], site_dispatch_sign_body( $body, $vector['site_key'] ) );
		$this->assertNotSame( $vector['signature_header'], site_dispatch_sign_body( $body . ' ', $vector['site_key'] ) );
	}

	public function test_iso_formats_utc_and_gives_null_for_zero(): void {
		$this->assertSame( '2026-01-01T00:00:00Z', site_dispatch_iso( 1767225600 ) );
		$this->assertNull( site_dispatch_iso( 0 ) );
		$this->assertNull( site_dispatch_iso( -5 ) );
	}

	public function test_pick_copies_only_the_named_fields(): void {
		$offer = (object) array(
			'new_version' => '3.2.4',
			'package'     => 'https://example.com/download?key=CANARY',
			'url'         => 'https://example.com',
			'license_key' => 'CANARY',
		);
		$this->assertSame( array( 'new_version' => '3.2.4' ), site_dispatch_pick( $offer, array( 'new_version', 'requires' ) ) );
	}

	public function test_pick_drops_empty_text_lists_and_booleans(): void {
		$source = array(
			'a' => '',
			'b' => array( 'x' ),
			'c' => true,
			'd' => null,
		);
		$this->assertSame( array(), site_dispatch_pick( $source, array( 'a', 'b', 'c', 'd', 'missing' ) ) );
	}

	public function test_pick_takes_arrays_and_objects_alike(): void {
		$fields = array(
			'new_version' => '1.0',
			'tested'      => 6.8,
			'requires'    => 6,
		);
		$want   = array(
			'new_version' => '1.0',
			'tested'      => '6.8',
			'requires'    => '6',
		);
		$keys   = array( 'new_version', 'tested', 'requires' );
		$this->assertSame( $want, site_dispatch_pick( $fields, $keys ) );
		$this->assertSame( $want, site_dispatch_pick( (object) $fields, $keys ) );
	}

	public function test_pick_gives_nothing_for_a_value_that_is_no_list(): void {
		$this->assertSame( array(), site_dispatch_pick( null, array( 'id' ) ) );
		$this->assertSame( array(), site_dispatch_pick( 'text', array( 'id' ) ) );
	}

	public function test_server_software_keeps_name_and_version(): void {
		$this->assertSame( 'nginx/1.25.3', site_dispatch_server_software( 'nginx/1.25.3' ) );
	}

	public function test_server_software_cuts_everything_after_the_version(): void {
		$this->assertSame( 'Apache/2.4.57', site_dispatch_server_software( 'Apache/2.4.57 (Debian) OpenSSL/3.0.11' ) );
	}

	public function test_server_software_without_version_keeps_the_name(): void {
		$this->assertSame( 'LiteSpeed', site_dispatch_server_software( 'LiteSpeed' ) );
	}

	public function test_server_software_with_a_strange_version_keeps_the_name(): void {
		$this->assertSame( 'Apache', site_dispatch_server_software( 'Apache/2.4.57-custom' ) );
	}

	public function test_server_software_with_a_path_is_dropped(): void {
		$this->assertNull( site_dispatch_server_software( '/usr/sbin/httpd' ) );
		$this->assertNull( site_dispatch_server_software( '' ) );
	}

	public function test_server_software_cuts_at_a_line_break(): void {
		$this->assertSame( 'nginx/1.25.3', site_dispatch_server_software( "nginx/1.25.3\n/var/www" ) );
	}

	public function test_clean_refuses_a_trailing_newline(): void {
		$this->assertSame( '256M', site_dispatch_clean( '256M', self::SIZE ) );
		$this->assertNull( site_dispatch_clean( "256M\n", self::SIZE ) );
	}

	public function test_clean_takes_whole_numbers_as_text(): void {
		$this->assertSame( '-1', site_dispatch_clean( -1, self::SIZE ) );
	}

	public function test_clean_refuses_values_that_are_not_text(): void {
		$this->assertNull( site_dispatch_clean( array( '256M' ), self::SIZE ) );
		$this->assertNull( site_dispatch_clean( null, self::SIZE ) );
		$this->assertNull( site_dispatch_clean( 1.5, self::SIZE ) );
	}

	public function test_core_auto_updates_off_when_the_updater_is_disabled(): void {
		$this->assertSame( 'off', site_dispatch_core_auto_updates( true, true, 'enabled' ) );
		$this->assertSame( 'off', site_dispatch_core_auto_updates( null, true, 'enabled' ) );
	}

	public function test_core_auto_updates_follows_the_constant(): void {
		$this->assertSame( 'off', site_dispatch_core_auto_updates( false, false, 'enabled' ) );
		$this->assertSame( 'minor', site_dispatch_core_auto_updates( 'minor', false, 'enabled' ) );
		$this->assertSame( 'all', site_dispatch_core_auto_updates( true, false, 'unset' ) );
		$this->assertSame( 'all', site_dispatch_core_auto_updates( 'beta', false, 'unset' ) );
	}

	public function test_core_auto_updates_without_constant_follows_the_option(): void {
		$this->assertSame( 'all', site_dispatch_core_auto_updates( null, false, 'enabled' ) );
		$this->assertSame( 'minor', site_dispatch_core_auto_updates( null, false, 'unset' ) );
		$this->assertSame( 'minor', site_dispatch_core_auto_updates( null, false, null ) );
	}
}
