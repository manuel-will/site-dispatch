<?php
/**
 * Pure decisions of the updater. Key pairs are made at run time.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class UpdaterTest extends TestCase {

	private const BASE = 'https://github.com/manuel-will/site-dispatch';
	private const NOW  = 1800000000;

	/** @var string */
	private static $secret_a;
	/** @var string */
	private static $public_a;
	/** @var string */
	private static $secret_b;
	/** @var string */
	private static $public_b;
	/** @var string */
	private static $secret_c;

	public static function setUpBeforeClass(): void {
		$pair_a         = sodium_crypto_sign_keypair();
		$pair_b         = sodium_crypto_sign_keypair();
		$pair_c         = sodium_crypto_sign_keypair();
		self::$secret_a = sodium_crypto_sign_secretkey( $pair_a );
		self::$public_a = sodium_crypto_sign_publickey( $pair_a );
		self::$secret_b = sodium_crypto_sign_secretkey( $pair_b );
		self::$public_b = sodium_crypto_sign_publickey( $pair_b );
		self::$secret_c = sodium_crypto_sign_secretkey( $pair_c );
	}

	/**
	 * @param array<string, mixed> $changes Fields to replace or add.
	 */
	private static function manifest( array $changes = array() ): string {
		$fields = array_merge(
			array(
				'schema'       => 1,
				'slug'         => 'site-dispatch',
				'version'      => '1.2.3',
				'zip'          => 'site-dispatch-1.2.3.zip',
				'sha512'       => str_repeat( 'ab', 64 ),
				'requires_wp'  => '6.4',
				'requires_php' => '7.4',
			),
			$changes
		);
		return (string) json_encode( $fields, JSON_UNESCAPED_SLASHES );
	}

	private static function sign( string $message, string $secret, string $sig_namespace = 'site-dispatch-update' ): string {
		return sodium_crypto_sign_detached( site_dispatch_sshsig_blob( $message, $sig_namespace ), $secret );
	}

	private static function flip( string $bytes ): string {
		$bytes[0] = chr( ord( $bytes[0] ) ^ 1 );
		return $bytes;
	}

	/**
	 * @return array<int, string>
	 */
	private static function keys(): array {
		return array( self::$public_a, self::$public_b );
	}

	private static function judge( string $manifest, string $sig, string $installed = '1.2.2', string $php = '8.2.30', string $wp = '6.8.2' ): string {
		return site_dispatch_judge_release( $manifest, $sig, self::keys(), $installed, $php, $wp );
	}

	/**
	 * @return array{manifest: string, sig: string, version: string, first_seen: int}
	 */
	private static function stored( string $manifest, int $first_seen ): array {
		return array(
			'manifest'   => $manifest,
			'sig'        => self::sign( $manifest, self::$secret_a ),
			'version'    => '1.2.3',
			'first_seen' => $first_seen,
		);
	}

	// Keys.

	public function test_keys_two_valid_keys_are_decoded(): void {
		$this->assertSame( self::keys(), site_dispatch_public_keys( array( base64_encode( self::$public_a ), base64_encode( self::$public_b ) ) ) );
	}

	public function test_keys_the_built_in_keys_decode(): void {
		$this->assertCount( 2, site_dispatch_public_keys( SITE_DISPATCH_PUBLIC_KEYS ) );
	}

	public function test_keys_one_key_of_31_bytes_empties_the_list(): void {
		$this->assertSame( array(), site_dispatch_public_keys( array( base64_encode( self::$public_a ), base64_encode( substr( self::$public_b, 1 ) ) ) ) );
	}

	public function test_keys_text_that_is_not_base64_empties_the_list(): void {
		$this->assertSame( array(), site_dispatch_public_keys( array( base64_encode( self::$public_a ), '***' ) ) );
	}

	public function test_keys_empty_list_stays_empty(): void {
		$this->assertSame( array(), site_dispatch_public_keys( array() ) );
	}

	public function test_keys_entry_that_is_not_text_empties_the_list(): void {
		$this->assertSame( array(), site_dispatch_public_keys( array( base64_encode( self::$public_a ), 5 ) ) );
	}

	// Redirect targets.

	public function test_redirect_https_address_is_taken(): void {
		$url = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sp=r&sig=a%2Fb%3D&rscd=attachment%3B+filename%3Dmanifest.json';
		$this->assertSame( $url, site_dispatch_redirect_target( $url ) );
	}

	public function test_redirect_port_443_is_taken(): void {
		$this->assertSame( 'https://example.com:443/a', site_dispatch_redirect_target( 'https://example.com:443/a' ) );
	}

	/**
	 * @dataProvider refused_targets
	 */
	public function test_redirect_is_refused( string $location ): void {
		$this->assertNull( site_dispatch_redirect_target( $location ) );
	}

	/**
	 * @return array<string, array{string}>
	 */
	public static function refused_targets(): array {
		return array(
			'http'                 => array( 'http://example.com/a' ),
			'relative'             => array( '/a/b' ),
			'protocol relative'    => array( '//example.com/a' ),
			'user in the address'  => array( 'https://user@example.com/a' ),
			'port 8443'            => array( 'https://example.com:8443/a' ),
			'upper case host'      => array( 'https://Example.com/a' ),
			'ip literal v6'        => array( 'https://[::1]/a' ),
			'ip literal v4'        => array( 'https://1.2.3.4/a' ),
			'host without a dot'   => array( 'https://localhost/a' ),
			'numeric top level'    => array( 'https://example.123/a' ),
			'punycode label'       => array( 'https://xn--bcher-kva.example/a' ),
			'no path'              => array( 'https://example.com' ),
			'space'                => array( 'https://example.com/a b' ),
			'line break at end'    => array( "https://example.com/a\n" ),
			'line break inside'    => array( "https://example.com/a\r\nX: y" ),
			'too long'             => array( 'https://example.com/' . str_repeat( 'a', 4077 ) ),
			'empty'                => array( '' ),
			'other scheme'         => array( 'ftp://example.com/a' ),
			'upper case scheme'    => array( 'HTTPS://example.com/a' ),
			'backslash after host' => array( 'https://example.com\\@evil.example/a' ),
		);
	}

	public function test_redirect_address_of_4096_characters_is_taken(): void {
		$url = 'https://example.com/' . str_repeat( 'a', 4076 );
		$this->assertSame( 4096, strlen( $url ) );
		$this->assertSame( $url, site_dispatch_redirect_target( $url ) );
	}

	// Release addresses.

	public function test_url_of_manifest_and_signature(): void {
		$this->assertSame( self::BASE . '/releases/latest/download/manifest.json', site_dispatch_release_url( self::BASE, 'manifest.json' ) );
		$this->assertSame( self::BASE . '/releases/latest/download/manifest.json.sig', site_dispatch_release_url( self::BASE, 'manifest.json.sig' ) );
	}

	public function test_url_of_another_file_is_refused(): void {
		$this->assertNull( site_dispatch_release_url( self::BASE, 'other.json' ) );
		$this->assertNull( site_dispatch_release_url( self::BASE, '../manifest.json' ) );
	}

	/**
	 * @dataProvider refused_bases
	 */
	public function test_url_with_a_bad_base_is_refused( string $base ): void {
		$this->assertNull( site_dispatch_release_url( $base, 'manifest.json' ) );
		$this->assertNull( site_dispatch_zip_url( $base, (array) json_decode( self::manifest(), true ) ) );
	}

	/**
	 * @return array<string, array{string}>
	 */
	public static function refused_bases(): array {
		return array(
			'http'           => array( 'http://github.com/manuel-will/site-dispatch' ),
			'trailing slash' => array( 'https://github.com/manuel-will/site-dispatch/' ),
			'query'          => array( 'https://github.com/manuel-will/site-dispatch?x=1' ),
			'no path'        => array( 'https://github.com' ),
			'line break'     => array( "https://github.com/manuel-will/site-dispatch\n" ),
			'empty'          => array( '' ),
		);
	}

	public function test_url_of_the_zip_comes_from_version_and_name(): void {
		$this->assertSame(
			self::BASE . '/releases/download/v1.2.3/site-dispatch-1.2.3.zip',
			site_dispatch_zip_url( self::BASE, (array) json_decode( self::manifest(), true ) )
		);
	}

	public function test_url_of_a_foreign_zip_name_is_refused(): void {
		$this->assertNull( site_dispatch_zip_url( self::BASE, array( 'version' => '1.2.3', 'zip' => 'https://evil.example/site-dispatch-1.2.3.zip' ) ) );
		$this->assertNull( site_dispatch_zip_url( self::BASE, array( 'version' => '1.2.3', 'zip' => '../site-dispatch-1.2.3.zip' ) ) );
		$this->assertNull( site_dispatch_zip_url( self::BASE, array( 'version' => '1.2.3', 'zip' => 'site-dispatch-1.2.4.zip' ) ) );
		$this->assertNull( site_dispatch_zip_url( self::BASE, array( 'version' => '1.2', 'zip' => 'site-dispatch-1.2.zip' ) ) );
		$this->assertNull( site_dispatch_zip_url( self::BASE, array( 'zip' => 'site-dispatch-1.2.3.zip' ) ) );
	}

	// Verdict on a release.

	public function test_judge_valid_with_key_a(): void {
		$manifest = self::manifest();
		$this->assertSame( 'ok', self::judge( $manifest, self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_valid_with_key_b(): void {
		$manifest = self::manifest();
		$this->assertSame( 'ok', self::judge( $manifest, self::sign( $manifest, self::$secret_b ) ) );
	}

	public function test_judge_unknown_key(): void {
		$manifest = self::manifest();
		$this->assertSame( 'invalid', self::judge( $manifest, self::sign( $manifest, self::$secret_c ) ) );
	}

	public function test_judge_flipped_bit_in_the_manifest(): void {
		$manifest = self::manifest();
		$this->assertSame( 'invalid', self::judge( self::flip( $manifest ), self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_flipped_bit_in_the_signature(): void {
		$manifest = self::manifest();
		$this->assertSame( 'invalid', self::judge( $manifest, self::flip( self::sign( $manifest, self::$secret_a ) ) ) );
	}

	public function test_judge_signature_of_63_and_65_bytes(): void {
		$manifest = self::manifest();
		$sig      = self::sign( $manifest, self::$secret_a );
		$this->assertSame( 'invalid', self::judge( $manifest, substr( $sig, 0, 63 ) ) );
		$this->assertSame( 'invalid', self::judge( $manifest, $sig . 'x' ) );
		$this->assertSame( 'invalid', self::judge( $manifest, '' ) );
	}

	public function test_judge_signature_for_the_namespace_git(): void {
		$manifest = self::manifest();
		$this->assertSame( 'invalid', self::judge( $manifest, self::sign( $manifest, self::$secret_a, 'git' ) ) );
	}

	public function test_judge_empty_key_list(): void {
		$manifest = self::manifest();
		$this->assertSame( 'invalid', site_dispatch_judge_release( $manifest, self::sign( $manifest, self::$secret_a ), array(), '1.2.2', '8.2.30', '6.8.2' ) );
	}

	public function test_judge_signed_manifest_with_an_extra_field(): void {
		$manifest = self::manifest( array( 'first_seen' => 0 ) );
		$this->assertSame( 'invalid', self::judge( $manifest, self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_signed_manifest_with_a_foreign_slug(): void {
		$manifest = self::manifest( array( 'slug' => 'other-plugin' ) );
		$this->assertSame( 'invalid', self::judge( $manifest, self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_signed_manifest_with_a_path_as_zip(): void {
		$manifest = self::manifest( array( 'zip' => '../site-dispatch-1.2.3.zip' ) );
		$this->assertSame( 'invalid', self::judge( $manifest, self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_same_version(): void {
		$manifest = self::manifest();
		$this->assertSame( 'not_newer', self::judge( $manifest, self::sign( $manifest, self::$secret_a ), '1.2.3' ) );
	}

	public function test_judge_lower_version(): void {
		$manifest = self::manifest();
		$this->assertSame( 'not_newer', self::judge( $manifest, self::sign( $manifest, self::$secret_a ), '1.3.0' ) );
	}

	public function test_judge_compares_numbers_not_text(): void {
		$manifest = self::manifest(
			array(
				'version' => '1.10.0',
				'zip'     => 'site-dispatch-1.10.0.zip',
			)
		);
		$this->assertSame( 'ok', self::judge( $manifest, self::sign( $manifest, self::$secret_a ), '1.9.0' ) );
	}

	public function test_judge_php_too_old(): void {
		$manifest = self::manifest( array( 'requires_php' => '8.3' ) );
		$this->assertSame( 'unfit', self::judge( $manifest, self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_wordpress_too_old(): void {
		$manifest = self::manifest( array( 'requires_wp' => '6.9' ) );
		$this->assertSame( 'unfit', self::judge( $manifest, self::sign( $manifest, self::$secret_a ) ) );
	}

	public function test_judge_installed_version_without_form(): void {
		$manifest = self::manifest();
		$this->assertSame( 'invalid', self::judge( $manifest, self::sign( $manifest, self::$secret_a ), '1.2' ) );
	}

	// Stored update.

	public function test_stored_valid_option_is_read(): void {
		$manifest = self::manifest();
		$sig      = self::sign( $manifest, self::$secret_a );
		$this->assertSame(
			array(
				'manifest'   => $manifest,
				'sig'        => $sig,
				'version'    => '1.2.3',
				'first_seen' => self::NOW,
			),
			site_dispatch_read_stored(
				array(
					'manifest'   => base64_encode( $manifest ),
					'sig'        => base64_encode( $sig ),
					'version'    => '1.2.3',
					'first_seen' => self::NOW,
				)
			)
		);
	}

	/**
	 * @dataProvider damaged_options
	 * @param mixed $raw The option as stored.
	 */
	public function test_stored_damaged_option_is_refused( $raw ): void {
		$this->assertNull( site_dispatch_read_stored( $raw ) );
	}

	/**
	 * @return array<string, array{mixed}>
	 */
	public static function damaged_options(): array {
		$good = array(
			'manifest'   => base64_encode( '{}' ),
			'sig'        => base64_encode( str_repeat( 'x', 64 ) ),
			'version'    => '1.2.3',
			'first_seen' => self::NOW,
		);
		return array(
			'not an array'          => array( 'text' ),
			'null'                  => array( null ),
			'missing signature'     => array( array_diff_key( $good, array( 'sig' => 1 ) ) ),
			'manifest not base64'   => array( array_merge( $good, array( 'manifest' => '***' ) ) ),
			'empty manifest'        => array( array_merge( $good, array( 'manifest' => '' ) ) ),
			'manifest of 9 kb'      => array( array_merge( $good, array( 'manifest' => base64_encode( str_repeat( 'a', 9000 ) ) ) ) ),
			'signature of 63 bytes' => array( array_merge( $good, array( 'sig' => base64_encode( str_repeat( 'x', 63 ) ) ) ) ),
			'version without form'  => array( array_merge( $good, array( 'version' => '1.2' ) ) ),
			'first seen as text'    => array( array_merge( $good, array( 'first_seen' => '1800000000' ) ) ),
			'first seen negative'   => array( array_merge( $good, array( 'first_seen' => -1 ) ) ),
		);
	}

	// What the daily check stores.

	public function test_next_failed_fetch_keeps_the_stored_update(): void {
		$stored = self::stored( self::manifest(), self::NOW - 100 );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'failed', 'invalid', '', '', self::NOW ) );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'failed', 'invalid', '', '', self::NOW ) );
	}

	public function test_next_unknown_fetch_result_keeps_the_stored_update(): void {
		$manifest = self::manifest();
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'whatever', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW ) );
	}

	public function test_next_missing_release_deletes_and_recalls_the_waiting_version(): void {
		$stored = self::stored( self::manifest(), self::NOW - 100 );
		$this->assertSame(
			array(
				'action'   => 'delete',
				'recalled' => '1.2.3',
			),
			site_dispatch_next_update( $stored, 'gone', 'invalid', '', '', self::NOW )
		);
		$this->assertSame( array( 'action' => 'delete' ), site_dispatch_next_update( null, 'gone', 'invalid', '', '', self::NOW ), 'nothing waiting, nothing recalled' );
	}

	public function test_next_recalled_version_is_never_taken_again(): void {
		// The release was deleted while waiting; whoever controls the release page uploads the same
		// signed files again. The site refuses it and everything below it, a higher version passes.
		$manifest = self::manifest();
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW, '1.2.3', '1.2.3' ) );
		$lower = self::manifest(
			array(
				'version' => '1.2.2',
				'zip'     => 'site-dispatch-1.2.2.zip',
			)
		);
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'ok', 'ok', $lower, self::sign( $lower, self::$secret_a ), self::NOW, '1.2.3', '1.2.3' ) );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'ok', 'not_newer', $manifest, 'y', self::NOW, '1.2.3', '1.2.3' ), 'a recalled version drops nothing either' );
		$higher = self::manifest(
			array(
				'version' => '1.2.4',
				'zip'     => 'site-dispatch-1.2.4.zip',
			)
		);
		$next   = site_dispatch_next_update( null, 'ok', 'ok', $higher, self::sign( $higher, self::$secret_a ), self::NOW, '1.2.3', '1.2.3' );
		$this->assertSame( 'store', $next['action'] );
		$this->assertSame( '1.2.4', $next['high_water'] ?? null );
	}

	public function test_next_malformed_recall_floor_counts_as_none(): void {
		$manifest = self::manifest();
		$this->assertSame( 'store', site_dispatch_next_update( null, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW, '', 'deleted' )['action'] );
	}

	public function test_next_invalid_release_keeps_the_stored_update(): void {
		$stored = self::stored( self::manifest(), self::NOW - 100 );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'ok', 'invalid', 'x', 'y', self::NOW ) );
	}

	public function test_next_release_that_is_not_newer_deletes(): void {
		$stored = self::stored( self::manifest(), self::NOW - 100 );
		$this->assertSame( array( 'action' => 'delete' ), site_dispatch_next_update( $stored, 'ok', 'not_newer', self::manifest(), 'y', self::NOW ) );
	}

	public function test_next_release_that_does_not_fit_deletes(): void {
		$stored = self::stored( self::manifest(), self::NOW - 100 );
		$this->assertSame( array( 'action' => 'delete' ), site_dispatch_next_update( $stored, 'ok', 'unfit', self::manifest(), 'y', self::NOW ) );
	}

	public function test_next_same_release_keeps_first_seen(): void {
		$manifest = self::manifest();
		$stored   = self::stored( $manifest, self::NOW - 100 );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'ok', 'ok', $manifest, $stored['sig'], self::NOW ) );
	}

	public function test_next_first_release_is_stored_with_the_local_time(): void {
		$manifest = self::manifest();
		$sig      = self::sign( $manifest, self::$secret_a );
		$this->assertSame(
			array(
				'action' => 'store',
				'update' => array(
					'manifest'   => base64_encode( $manifest ),
					'sig'        => base64_encode( $sig ),
					'version'    => '1.2.3',
					'first_seen' => self::NOW,
				),
				'high_water' => '1.2.3',
			),
			site_dispatch_next_update( null, 'ok', 'ok', $manifest, $sig, self::NOW )
		);
	}

	// The high-water mark: a signed manifest below the highest version ever seen changes nothing.

	public function test_next_replayed_older_release_cannot_drop_the_waiting_update(): void {
		$waiting = self::manifest(
			array(
				'version' => '1.2.4',
				'zip'     => 'site-dispatch-1.2.4.zip',
			)
		);
		$stored  = array_merge( self::stored( $waiting, self::NOW - 100 ), array( 'version' => '1.2.4' ) );
		// The attacker serves the original manifest of 1.2.3 again, validly signed, installed is 1.2.3.
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'ok', 'not_newer', self::manifest(), 'y', self::NOW, '1.2.3' ) );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'ok', 'unfit', self::manifest(), 'y', self::NOW, '1.2.3' ) );
	}

	public function test_next_replayed_older_release_is_not_stored_below_the_mark(): void {
		// Installed 1.2.2, the site has seen 1.2.4 before (and installed or lost it): 1.2.3 is a replay.
		$manifest = self::manifest();
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW, '1.2.4' ) );
	}

	public function test_next_mark_from_the_option_counts_without_a_waiting_update(): void {
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'ok', 'not_newer', self::manifest(), 'y', self::NOW, '1.2.4' ) );
	}

	public function test_next_release_at_the_mark_is_handled_as_before(): void {
		$stored = self::stored( self::manifest(), self::NOW - 100 );
		$this->assertSame( array( 'action' => 'delete' ), site_dispatch_next_update( $stored, 'ok', 'not_newer', self::manifest(), 'y', self::NOW, '1.2.3' ) );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'ok', 'ok', self::manifest(), $stored['sig'], self::NOW, '1.2.3' ) );
	}

	public function test_next_higher_release_raises_the_mark(): void {
		$stored   = self::stored( self::manifest(), self::NOW - 100 );
		$manifest = self::manifest(
			array(
				'version' => '1.2.4',
				'zip'     => 'site-dispatch-1.2.4.zip',
			)
		);
		$next     = site_dispatch_next_update( $stored, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW, '1.2.3' );
		$this->assertSame( 'store', $next['action'] );
		$this->assertSame( '1.2.4', $next['high_water'] ?? null );
		$unfit = site_dispatch_next_update( $stored, 'ok', 'unfit', $manifest, 'y', self::NOW, '1.2.3' );
		$this->assertSame( array( 'action' => 'delete', 'high_water' => '1.2.4' ), $unfit );
	}

	public function test_next_malformed_mark_counts_as_none(): void {
		$manifest = self::manifest();
		$next     = site_dispatch_next_update( null, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW, 'latest' );
		$this->assertSame( 'store', $next['action'] );
		$this->assertSame( '1.2.3', $next['high_water'] ?? null );
	}

	public function test_highest_version_skips_malformed_entries(): void {
		$this->assertSame( '1.10.0', site_dispatch_highest_version( array( '1.9.9', 'x', '', '1.10.0', '1.2' ) ) );
		$this->assertSame( '', site_dispatch_highest_version( array( '', 'nope' ) ) );
	}

	public function test_missing_extensions_are_named(): void {
		$this->assertSame( array(), site_dispatch_missing_extensions( true, true ) );
		$this->assertSame( array( 'sodium' ), site_dispatch_missing_extensions( false, true ) );
		$this->assertSame( array( 'zip' ), site_dispatch_missing_extensions( true, false ) );
		$this->assertSame( array( 'sodium', 'zip' ), site_dispatch_missing_extensions( false, false ) );
	}

	public function test_next_new_version_starts_the_clock_again(): void {
		$stored   = self::stored( self::manifest(), self::NOW - 100 );
		$manifest = self::manifest(
			array(
				'version' => '1.2.4',
				'zip'     => 'site-dispatch-1.2.4.zip',
			)
		);
		$next     = site_dispatch_next_update( $stored, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW );
		$this->assertSame( 'store', $next['action'] );
		$this->assertSame( '1.2.4', $next['update']['version'] ?? null );
		$this->assertSame( self::NOW, $next['update']['first_seen'] ?? null );
	}

	public function test_next_other_bytes_for_the_same_version_are_ignored(): void {
		// A version is signed once. Other validly signed bytes at the waiting version are a superseded
		// variant (or a second signing) and must not replace what waits, nor restart the clock.
		$stored   = self::stored( self::manifest(), self::NOW - 100 );
		$manifest = self::manifest( array( 'sha512' => str_repeat( 'cd', 64 ) ) );
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( $stored, 'ok', 'ok', $manifest, self::sign( $manifest, self::$secret_a ), self::NOW ) );
	}

	public function test_next_manifest_that_does_not_parse_keeps(): void {
		$this->assertSame( array( 'action' => 'keep' ), site_dispatch_next_update( null, 'ok', 'ok', 'no json', 'y', self::NOW ) );
	}

	// Waiting period.

	public function test_due_not_before_72_hours(): void {
		$this->assertFalse( site_dispatch_update_due( self::NOW, self::NOW, false ) );
		$this->assertFalse( site_dispatch_update_due( self::NOW - 259199, self::NOW, false ) );
	}

	public function test_due_at_72_hours(): void {
		$this->assertTrue( site_dispatch_update_due( self::NOW - 259200, self::NOW, false ) );
		$this->assertTrue( site_dispatch_update_due( self::NOW - 400000, self::NOW, false ) );
	}

	public function test_due_at_once_with_the_switch(): void {
		$this->assertTrue( site_dispatch_update_due( self::NOW, self::NOW, true ) );
	}

	public function test_due_first_seen_in_the_future_waits(): void {
		$this->assertFalse( site_dispatch_update_due( self::NOW + 10, self::NOW, false ) );
	}

	// Names inside the ZIP.

	public function test_names_good_list(): void {
		$this->assertTrue(
			site_dispatch_zip_names_ok(
				array(
					'site-dispatch/',
					'site-dispatch/site-dispatch.php',
					'site-dispatch/includes/',
					'site-dispatch/includes/verify.php',
					'site-dispatch/LICENSE',
				)
			)
		);
	}

	/**
	 * @dataProvider bad_names
	 * @param array<mixed> $names Names as the ZIP lists them.
	 */
	public function test_names_are_refused( array $names ): void {
		$this->assertFalse( site_dispatch_zip_names_ok( $names ) );
	}

	/**
	 * @return array<string, array{array<mixed>}>
	 */
	public static function bad_names(): array {
		$main = 'site-dispatch/site-dispatch.php';
		return array(
			'empty list'            => array( array() ),
			'without the main file' => array( array( 'site-dispatch/includes/verify.php' ) ),
			'second top folder'     => array( array( $main, 'other/file.php' ) ),
			'file on top level'     => array( array( $main, 'file.php' ) ),
			'folder with suffix'    => array( array( $main, 'site-dispatch-2/file.php' ) ),
			'path up at the start'  => array( array( $main, '../evil.php' ) ),
			'path up in the middle' => array( array( $main, 'site-dispatch/../../evil.php' ) ),
			'path up at the end'    => array( array( $main, 'site-dispatch/..' ) ),
			'single dot'            => array( array( $main, 'site-dispatch/./file.php' ) ),
			'double slash'          => array( array( $main, 'site-dispatch//file.php' ) ),
			'backslash'             => array( array( $main, 'site-dispatch\\..\\evil.php' ) ),
			'absolute path'         => array( array( $main, '/site-dispatch/file.php' ) ),
			'drive letter'          => array( array( $main, 'C:/site-dispatch/file.php' ) ),
			'null byte'             => array( array( $main, "site-dispatch/file.php\0.txt" ) ),
			'empty name'            => array( array( $main, '' ) ),
			'not text'              => array( array( $main, 5 ) ),
			'upper case folder'     => array( array( $main, 'Site-Dispatch/file.php' ) ),
		);
	}
}
