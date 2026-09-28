<?php
/**
 * Host normalisation and the check of the server host an admin types in.
 *
 * @package Site_Dispatch
 */

use PHPUnit\Framework\TestCase;

final class HostsTest extends TestCase {

	public function test_valid_host_is_returned_unchanged(): void {
		$this->assertSame( 'n8n.example.com', site_dispatch_valid_server_host( 'n8n.example.com' ) );
		$this->assertSame( 'x.de', site_dispatch_valid_server_host( 'x.de' ) );
	}

	public function test_upper_case_becomes_lower_case(): void {
		$this->assertSame( 'n8n.example.com', site_dispatch_valid_server_host( 'N8N.Example.COM' ) );
	}

	public function test_host_with_scheme_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'http://x.de' ) );
		$this->assertNull( site_dispatch_valid_server_host( 'https://x.de' ) );
	}

	public function test_host_with_path_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'x.de/pfad' ) );
		$this->assertNull( site_dispatch_valid_server_host( 'x.de/' ) );
	}

	public function test_host_with_user_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'user@x.de' ) );
	}

	public function test_ipv4_literal_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( '1.2.3.4' ) );
	}

	public function test_ipv6_literal_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( '[::1]' ) );
	}

	public function test_localhost_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'localhost' ) );
	}

	public function test_internal_single_label_name_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'coolify' ) );
	}

	public function test_host_with_port_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'x.de:8443' ) );
	}

	public function test_whitespace_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'x .de' ) );
		$this->assertNull( site_dispatch_valid_server_host( ' x.de' ) );
		$this->assertNull( site_dispatch_valid_server_host( 'x.de ' ) );
		$this->assertNull( site_dispatch_valid_server_host( "x.de\n" ) );
		$this->assertNull( site_dispatch_valid_server_host( '' ) );
	}

	public function test_punycode_label_is_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'xn--bcher-kva.de' ) );
		$this->assertNull( site_dispatch_valid_server_host( 'n8n.xn--bcher-kva.de' ) );
		$this->assertNull( site_dispatch_valid_server_host( 'XN--bcher-kva.de' ) );
	}

	public function test_host_of_254_characters_is_rejected(): void {
		$label = str_repeat( 'a', 61 );
		$host  = $label . '.' . $label . '.' . $label . '.' . $label . '.abcde';
		$this->assertSame( 253, strlen( $host ) );
		$this->assertSame( $host, site_dispatch_valid_server_host( $host ) );
		$this->assertNull( site_dispatch_valid_server_host( $host . 'f' ) );
	}

	public function test_label_of_64_characters_is_rejected(): void {
		$this->assertNotNull( site_dispatch_valid_server_host( str_repeat( 'a', 63 ) . '.de' ) );
		$this->assertNull( site_dispatch_valid_server_host( str_repeat( 'a', 64 ) . '.de' ) );
	}

	public function test_trailing_dot_and_empty_label_are_rejected(): void {
		$this->assertNull( site_dispatch_valid_server_host( 'x.de.' ) );
		$this->assertNull( site_dispatch_valid_server_host( 'x..de' ) );
		$this->assertNull( site_dispatch_valid_server_host( '-x.de' ) );
	}

	public function test_norm_host_trims_lowers_and_drops_a_leading_www(): void {
		$this->assertSame( 'example.com', site_dispatch_norm_host( ' WWW.Example.com ' ) );
		$this->assertSame( 'example.com', site_dispatch_norm_host( 'example.com' ) );
		$this->assertSame( '', site_dispatch_norm_host( 'www.' ) );
		$this->assertSame( '', site_dispatch_norm_host( '' ) );
	}

	public function test_norm_host_drops_only_a_leading_www(): void {
		$this->assertSame( 'shop.www.example.com', site_dispatch_norm_host( 'shop.www.example.com' ) );
		$this->assertSame( 'wwwexample.com', site_dispatch_norm_host( 'wwwexample.com' ) );
		$this->assertSame( 'www.example.com', site_dispatch_norm_host( 'www.www.example.com' ) );
	}
}
