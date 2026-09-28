<?php
/**
 * Acceptance of a parsed manifest against the installed plugin, PHP and WordPress.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class ManifestAcceptableTest extends TestCase {

	/**
	 * A parsed manifest for the given version.
	 *
	 * @return array<string, mixed>
	 */
	private static function manifest( string $version, string $requires_wp = '6.0', string $requires_php = '7.4' ): array {
		return array(
			'schema'       => 1,
			'slug'         => 'site-dispatch',
			'version'      => $version,
			'zip'          => 'site-dispatch-' . $version . '.zip',
			'sha512'       => str_repeat( 'ab', 64 ),
			'requires_wp'  => $requires_wp,
			'requires_php' => $requires_php,
		);
	}

	public function test_higher_version_is_accepted(): void {
		$this->assertTrue( site_dispatch_manifest_acceptable( self::manifest( '1.2.4' ), '1.2.3', '8.2.30', '6.8.2' ) );
	}

	public function test_same_version_is_rejected(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.3' ), '1.2.3', '8.2.30', '6.8.2' ) );
	}

	public function test_lower_version_is_rejected(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.2' ), '1.2.3', '8.2.30', '6.8.2' ) );
	}

	public function test_versions_compare_as_numbers_not_as_text(): void {
		$this->assertTrue( site_dispatch_manifest_acceptable( self::manifest( '1.10.0' ), '1.9.0', '8.2.30', '6.8.2' ) );
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.9.0' ), '1.10.0', '8.2.30', '6.8.2' ) );
	}

	public function test_leading_zeros_do_not_make_a_version_higher(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.02.3' ), '1.2.3', '8.2.30', '6.8.2' ) );
	}

	public function test_numbers_beyond_the_integer_range_still_compare(): void {
		$this->assertTrue( site_dispatch_manifest_acceptable( self::manifest( '1.0.99999999999999999999' ), '1.0.99999999999999999998', '8.2.30', '6.8.2' ) );
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.0.99999999999999999998' ), '1.0.99999999999999999999', '8.2.30', '6.8.2' ) );
	}

	public function test_php_that_is_too_old_is_rejected(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.4', '6.0', '8.1' ), '1.2.3', '7.4.33', '6.8.2' ) );
	}

	public function test_wordpress_that_is_too_old_is_rejected(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.4', '6.5' ), '1.2.3', '8.2.30', '6.4.3' ) );
	}

	public function test_exactly_the_required_versions_are_enough(): void {
		$this->assertTrue( site_dispatch_manifest_acceptable( self::manifest( '1.2.4', '6.5', '8.1' ), '1.2.3', '8.1.0', '6.5' ) );
	}

	public function test_version_strings_with_a_vendor_suffix_are_read_by_their_numbers(): void {
		$this->assertTrue( site_dispatch_manifest_acceptable( self::manifest( '1.2.4', '6.5', '7.4' ), '1.2.3', '7.4.33-0ubuntu0.20.04.1', '6.9-beta1' ) );
	}

	public function test_unreadable_running_versions_are_rejected(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.4' ), '1.2.3', '', '6.8.2' ) );
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.4' ), '1.2.3', '8.2.30', 'trunk' ) );
		$this->assertFalse( site_dispatch_manifest_acceptable( self::manifest( '1.2.4' ), 'dev', '8.2.30', '6.8.2' ) );
	}

	public function test_foreign_slug_is_rejected(): void {
		$manifest         = self::manifest( '1.2.4' );
		$manifest['slug'] = 'akismet';
		$this->assertFalse( site_dispatch_manifest_acceptable( $manifest, '1.2.3', '8.2.30', '6.8.2' ) );
	}

	public function test_array_that_is_not_a_manifest_is_rejected(): void {
		$this->assertFalse( site_dispatch_manifest_acceptable( array(), '1.2.3', '8.2.30', '6.8.2' ) );
		$this->assertFalse( site_dispatch_manifest_acceptable( array( 'slug' => 'site-dispatch', 'version' => 124 ), '1.2.3', '8.2.30', '6.8.2' ) );
	}
}
