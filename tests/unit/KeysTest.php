<?php
/**
 * The two build files hold one constant each and nothing else.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class KeysTest extends TestCase {

	/**
	 * Code of a file without comments and without white space.
	 */
	private static function code( string $name ): string {
		$source = file_get_contents( dirname( __DIR__, 2 ) . '/includes/' . $name );
		self::assertIsString( $source );
		$code = '';
		foreach ( token_get_all( $source ) as $token ) {
			if ( is_array( $token ) ) {
				if ( in_array( $token[0], array( T_COMMENT, T_DOC_COMMENT, T_WHITESPACE ), true ) ) {
					continue;
				}
				$code .= $token[1];
				continue;
			}
			$code .= $token;
		}
		return $code;
	}

	public function test_key_file_declares_two_keys_and_nothing_else(): void {
		$this->assertSame(
			1,
			preg_match( '/^<\?php\s*constSITE_DISPATCH_PUBLIC_KEYS=array\(\'[A-Za-z0-9+\/]{43}=\',\'[A-Za-z0-9+\/]{43}=\',?\);\z/', self::code( 'keys.php' ) )
		);
	}

	public function test_both_keys_are_32_bytes(): void {
		$this->assertCount( 2, SITE_DISPATCH_PUBLIC_KEYS );
		foreach ( SITE_DISPATCH_PUBLIC_KEYS as $encoded ) {
			$raw = base64_decode( $encoded, true );
			$this->assertIsString( $raw );
			$this->assertSame( 32, strlen( $raw ) );
		}
	}

	public function test_the_two_keys_differ(): void {
		$this->assertNotSame( SITE_DISPATCH_PUBLIC_KEYS[0], SITE_DISPATCH_PUBLIC_KEYS[1] );
	}

	public function test_source_file_declares_the_address_and_nothing_else(): void {
		$this->assertSame(
			1,
			preg_match( '/^<\?php\s*constSITE_DISPATCH_RELEASE_BASE=\'https:\/\/github\.com\/[A-Za-z0-9._\/-]+\';\z/', self::code( 'source.php' ) )
		);
	}

	public function test_release_address_is_the_repository(): void {
		$this->assertSame( 'https://github.com/manuel-will/site-dispatch', SITE_DISPATCH_RELEASE_BASE );
	}
}
