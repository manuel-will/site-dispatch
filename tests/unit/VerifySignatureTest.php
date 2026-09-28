<?php
/**
 * Signature checks. Key pairs are made at run time, no private key lives in the repository.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class VerifySignatureTest extends TestCase {

	private const MANIFEST = '{"schema":1,"slug":"site-dispatch","version":"1.2.3"}';

	/** @var string */
	private static $secret_a;
	/** @var string */
	private static $public_a;
	/** @var string */
	private static $secret_b;
	/** @var string */
	private static $public_b;

	public static function setUpBeforeClass(): void {
		$pair_a         = sodium_crypto_sign_keypair();
		$pair_b         = sodium_crypto_sign_keypair();
		self::$secret_a = sodium_crypto_sign_secretkey( $pair_a );
		self::$public_a = sodium_crypto_sign_publickey( $pair_a );
		self::$secret_b = sodium_crypto_sign_secretkey( $pair_b );
		self::$public_b = sodium_crypto_sign_publickey( $pair_b );
	}

	private static function sign( string $message, string $secret, string $sig_namespace = 'site-dispatch-update' ): string {
		return sodium_crypto_sign_detached( site_dispatch_sshsig_blob( $message, $sig_namespace ), $secret );
	}

	private static function flip_first_bit( string $bytes ): string {
		$bytes[0] = chr( ord( $bytes[0] ) ^ 1 );
		return $bytes;
	}

	public function test_blob_matches_the_documented_vector(): void {
		$manifest = (string) file_get_contents( dirname( __DIR__ ) . '/vectors/manifest.json' );
		$expected = '535348534947'
			. '00000014' . '736974652d64697370617463682d757064617465'
			. '00000000'
			. '00000006' . '736861353132'
			. '00000040' . '30ec898be6a6fa822f22053b62001701b367c643527a5a0dfcf738ff51e273d4'
			. '028cfdc226086b0cb6adf7956502b14c2419e326a914e8ef7917db874445b542';
		$this->assertSame( $expected, bin2hex( site_dispatch_sshsig_blob( $manifest, 'site-dispatch-update' ) ) );
	}

	public function test_fixed_vector_from_the_protocol_verifies(): void {
		$dir      = dirname( __DIR__ ) . '/vectors/';
		$manifest = (string) file_get_contents( $dir . 'manifest.json' );
		$sig      = (string) file_get_contents( $dir . 'manifest.json.sig' );
		$public   = (string) base64_decode( trim( (string) file_get_contents( $dir . 'manifest-pubkey.b64' ) ), true );
		$this->assertTrue( site_dispatch_verify_signature( $manifest, $sig, array( $public ) ) );
		$this->assertFalse( site_dispatch_verify_signature( self::flip_first_bit( $manifest ), $sig, array( $public ) ) );
	}

	public function test_valid_signature_of_key_a_is_accepted(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a );
		$this->assertTrue( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a, self::$public_b ) ) );
	}

	public function test_valid_signature_of_key_b_is_accepted(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_b );
		$this->assertTrue( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a, self::$public_b ) ) );
	}

	public function test_signature_of_a_foreign_key_is_rejected(): void {
		$foreign = sodium_crypto_sign_secretkey( sodium_crypto_sign_keypair() );
		$sig     = self::sign( self::MANIFEST, $foreign );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a, self::$public_b ) ) );
	}

	public function test_one_flipped_bit_in_the_manifest_is_rejected(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a );
		$this->assertFalse( site_dispatch_verify_signature( self::flip_first_bit( self::MANIFEST ), $sig, array( self::$public_a ) ) );
	}

	public function test_one_flipped_bit_in_the_signature_is_rejected(): void {
		$sig = self::flip_first_bit( self::sign( self::MANIFEST, self::$secret_a ) );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a ) ) );
	}

	public function test_signature_of_63_bytes_is_rejected(): void {
		$sig = substr( self::sign( self::MANIFEST, self::$secret_a ), 0, 63 );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a ) ) );
	}

	public function test_signature_of_65_bytes_is_rejected(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a ) . "\0";
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a ) ) );
	}

	public function test_empty_key_list_is_rejected(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array() ) );
	}

	public function test_signature_made_for_namespace_git_is_rejected(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a, 'git' );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a ) ) );
	}

	public function test_key_of_wrong_length_is_rejected(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( substr( self::$public_a, 0, 31 ) ) ) );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a . "\0" ) ) );
	}

	public function test_a_malformed_key_next_to_a_valid_one_rejects_the_whole_list(): void {
		$sig = self::sign( self::MANIFEST, self::$secret_a );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a, 'short' ) ) );
		$this->assertFalse( site_dispatch_verify_signature( self::MANIFEST, $sig, array( self::$public_a, 42 ) ) );
	}
}
