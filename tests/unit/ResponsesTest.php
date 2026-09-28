<?php
/**
 * Parsers for the two enrollment responses. The site key is the canary of PROTOCOL.md, vector B.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class ResponsesTest extends TestCase {

	private const UUID = '00000000-0000-4000-8000-000000000001';

	private static function canary_key(): string {
		$vector = json_decode( (string) file_get_contents( dirname( __DIR__ ) . '/vectors/report-hmac.json' ), true );
		return (string) $vector['site_key'];
	}

	/**
	 * A valid redeem response with the given fields replaced.
	 *
	 * @param array<string, mixed> $changes Fields to replace or add.
	 */
	private static function redeem( array $changes = array() ): string {
		$fields = array(
			'ok'          => true,
			'site_key'    => self::canary_key(),
			'key_version' => 1,
			'website_id'  => self::UUID,
		);
		return (string) json_encode( array_merge( $fields, $changes ) );
	}

	/**
	 * A valid request response with the given fields replaced.
	 *
	 * @param array<string, mixed> $changes Fields to replace or add.
	 */
	private static function request( array $changes = array() ): string {
		$fields = array(
			'ok'         => true,
			'request_id' => self::UUID,
			'user_code'  => 'ABCDEFGH',
		);
		return (string) json_encode( array_merge( $fields, $changes ) );
	}

	public function test_valid_request_response_is_parsed(): void {
		$this->assertSame(
			array(
				'request_id' => self::UUID,
				'user_code'  => 'ABCDEFGH',
			),
			site_dispatch_parse_request_response( self::request() )
		);
	}

	public function test_valid_redeem_response_is_parsed(): void {
		$this->assertSame(
			array(
				'site_key'    => self::canary_key(),
				'key_version' => 1,
				'website_id'  => self::UUID,
			),
			site_dispatch_parse_redeem_response( self::redeem() )
		);
	}

	public function test_key_of_63_characters_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'site_key' => substr( self::canary_key(), 0, 63 ) ) ) ) );
	}

	public function test_key_of_65_characters_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'site_key' => self::canary_key() . 'a' ) ) ) );
	}

	public function test_upper_case_in_the_key_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'site_key' => strtoupper( self::canary_key() ) ) ) ) );
	}

	public function test_key_version_as_text_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'key_version' => '1' ) ) ) );
	}

	public function test_key_version_that_is_not_a_positive_integer_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'key_version' => 0 ) ) ) );
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'key_version' => -1 ) ) ) );
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'key_version' => 1.5 ) ) ) );
	}

	public function test_website_id_that_is_no_uuid_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'website_id' => strtoupper( 'abcdef00-0000-4000-8000-000000000001' ) ) ) ) );
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'website_id' => '1' ) ) ) );
	}

	public function test_additional_fields_are_dropped_from_a_redeem_response(): void {
		$parsed = site_dispatch_parse_redeem_response(
			self::redeem(
				array(
					'server_host' => 'evil.example.com',
					'nested'      => array( 'a' => array( 'b' => 1 ) ),
				)
			)
		);
		$this->assertIsArray( $parsed );
		$this->assertSame( array( 'site_key', 'key_version', 'website_id' ), array_keys( $parsed ) );
	}

	public function test_additional_fields_are_dropped_from_a_request_response(): void {
		$parsed = site_dispatch_parse_request_response( self::request( array( 'approve_url' => 'https://evil.example.com/' ) ) );
		$this->assertIsArray( $parsed );
		$this->assertSame( array( 'request_id', 'user_code' ), array_keys( $parsed ) );
	}

	public function test_response_of_5_kb_is_rejected(): void {
		$padding = array( 'padding' => str_repeat( 'a', 5 * 1024 ) );
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( $padding ) ) );
		$this->assertNull( site_dispatch_parse_request_response( self::request( $padding ) ) );
	}

	public function test_html_instead_of_json_is_rejected(): void {
		$html = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';
		$this->assertNull( site_dispatch_parse_redeem_response( $html ) );
		$this->assertNull( site_dispatch_parse_request_response( $html ) );
	}

	public function test_json_list_instead_of_object_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( '[true]' ) );
		$this->assertNull( site_dispatch_parse_request_response( '[]' ) );
	}

	public function test_response_without_ok_true_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'ok' => false ) ) ) );
		$this->assertNull( site_dispatch_parse_redeem_response( self::redeem( array( 'ok' => 1 ) ) ) );
		$this->assertNull( site_dispatch_parse_request_response( self::request( array( 'ok' => 'true' ) ) ) );
	}

	public function test_pending_response_is_not_a_redeem(): void {
		$this->assertNull( site_dispatch_parse_redeem_response( '{"ok":false,"pending":true}' ) );
	}

	public function test_user_code_with_a_look_alike_character_is_rejected(): void {
		foreach ( array( 'ABCDEFGI', 'ABCDEFGO', 'ABCDEFG0', 'ABCDEFG1', 'abcdefgh', 'ABCDEFG', 'ABCDEFGHJ' ) as $code ) {
			$this->assertNull( site_dispatch_parse_request_response( self::request( array( 'user_code' => $code ) ) ), $code );
		}
	}

	public function test_request_id_that_is_no_uuid_is_rejected(): void {
		$this->assertNull( site_dispatch_parse_request_response( self::request( array( 'request_id' => self::UUID . "\n" ) ) ) );
	}
}
