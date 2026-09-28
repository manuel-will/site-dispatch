<?php
/**
 * Manifest parsing. Every case starts from one valid manifest and changes one thing.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class ParseManifestTest extends TestCase {

	/**
	 * A valid manifest with the given fields replaced. A value of null removes the field.
	 *
	 * @param array<string, mixed> $changes Fields to replace, add or remove.
	 */
	private static function manifest( array $changes = array() ): string {
		$fields = array(
			'schema'       => 1,
			'slug'         => 'site-dispatch',
			'version'      => '1.2.3',
			'zip'          => 'site-dispatch-1.2.3.zip',
			'sha512'       => str_repeat( 'ab', 64 ),
			'requires_wp'  => '6.0',
			'requires_php' => '7.4',
		);
		foreach ( $changes as $name => $value ) {
			if ( null === $value ) {
				unset( $fields[ $name ] );
			} else {
				$fields[ $name ] = $value;
			}
		}
		return (string) json_encode( $fields, JSON_UNESCAPED_SLASHES );
	}

	public function test_valid_manifest_returns_exactly_the_seven_fields(): void {
		$this->assertSame(
			array(
				'schema'       => 1,
				'slug'         => 'site-dispatch',
				'version'      => '1.2.3',
				'zip'          => 'site-dispatch-1.2.3.zip',
				'sha512'       => str_repeat( 'ab', 64 ),
				'requires_wp'  => '6.0',
				'requires_php' => '7.4',
			),
			site_dispatch_parse_manifest( self::manifest() )
		);
	}

	public function test_manifest_vector_from_the_protocol_parses(): void {
		$manifest = (string) file_get_contents( dirname( __DIR__ ) . '/vectors/manifest.json' );
		$parsed   = site_dispatch_parse_manifest( $manifest );
		$this->assertIsArray( $parsed );
		$this->assertSame( 'site-dispatch', $parsed['slug'] );
	}

	public function test_text_that_is_not_json_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( 'not json' ) );
		$this->assertNull( site_dispatch_parse_manifest( '' ) );
	}

	public function test_json_list_instead_of_object_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( '[1,"site-dispatch","1.2.3"]' ) );
		$this->assertNull( site_dispatch_parse_manifest( '[]' ) );
	}

	public function test_missing_field_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'requires_php' => null ) ) ) );
	}

	public function test_additional_field_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'first_seen' => '2026-01-01T00:00:00Z' ) ) ) );
	}

	public function test_foreign_slug_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'slug' => 'akismet' ) ) ) );
	}

	public function test_version_with_two_parts_is_rejected(): void {
		$this->assertNull(
			site_dispatch_parse_manifest(
				self::manifest(
					array(
						'version' => '1.2',
						'zip'     => 'site-dispatch-1.2.zip',
					)
				)
			)
		);
	}

	public function test_version_with_suffix_is_rejected(): void {
		$this->assertNull(
			site_dispatch_parse_manifest(
				self::manifest(
					array(
						'version' => '1.2.3-beta',
						'zip'     => 'site-dispatch-1.2.3-beta.zip',
					)
				)
			)
		);
	}

	public function test_version_with_trailing_newline_is_rejected(): void {
		$this->assertNull(
			site_dispatch_parse_manifest(
				self::manifest(
					array(
						'version' => "1.2.3\n",
						'zip'     => "site-dispatch-1.2.3\n.zip",
					)
				)
			)
		);
	}

	public function test_zip_with_parent_path_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'zip' => '../site-dispatch-1.2.3.zip' ) ) ) );
	}

	public function test_zip_as_url_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'zip' => 'https://example.com/site-dispatch-1.2.3.zip' ) ) ) );
	}

	public function test_zip_without_version_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'zip' => 'site-dispatch.zip' ) ) ) );
	}

	public function test_zip_with_another_version_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'zip' => 'site-dispatch-1.2.4.zip' ) ) ) );
	}

	public function test_sha512_that_is_too_short_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'sha512' => str_repeat( 'ab', 63 ) . 'a' ) ) ) );
	}

	public function test_sha512_in_upper_case_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'sha512' => str_repeat( 'AB', 64 ) ) ) ) );
	}

	public function test_manifest_of_9_kb_is_rejected(): void {
		$padded = self::manifest() . str_repeat( ' ', 9 * 1024 );
		$this->assertNotNull( json_decode( $padded ) );
		$this->assertNull( site_dispatch_parse_manifest( $padded ) );
	}

	public function test_manifest_of_exactly_8_kb_is_accepted(): void {
		$manifest = self::manifest();
		$padded   = $manifest . str_repeat( ' ', 8192 - strlen( $manifest ) );
		$this->assertIsArray( site_dispatch_parse_manifest( $padded ) );
		$this->assertNull( site_dispatch_parse_manifest( $padded . ' ' ) );
	}

	public function test_schema_as_text_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'schema' => '1' ) ) ) );
	}

	public function test_nested_value_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_manifest( self::manifest( array( 'requires_wp' => array( '6.0' ) ) ) ) );
	}
}
