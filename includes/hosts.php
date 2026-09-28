<?php
/**
 * Pure host checks. No WordPress, no side effects. Contract: PROTOCOL.md, "Conventions".
 *
 * @package Site_Dispatch
 */

/**
 * Host name pattern of the contract, with \z instead of $ so a trailing newline fails.
 */
const SITE_DISPATCH_HOST_PATTERN = '/^(?=.{4,253}\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\z/';

/**
 * Host for comparing: trimmed, lower case, without a leading "www.".
 *
 * Same rule as the reporter snippet and the inbox use. Not a validity check.
 *
 * @param string $host A host name.
 * @return string
 */
function site_dispatch_norm_host( string $host ): string {
	$host = strtolower( trim( $host ) );
	if ( 0 !== strpos( $host, 'www.' ) ) {
		return $host;
	}
	// On PHP 7 substr() gives false when nothing is left.
	$rest = substr( $host, 4 );
	return false === $rest ? '' : $rest;
}

/**
 * Checks the server host an admin typed in. Returns it in lower case, or null.
 *
 * Only a public looking host name passes: no scheme, path, port, user, IP literal, single label
 * name or whitespace. Punycode labels are refused, a look-alike host must not pass as the real one.
 *
 * @param string $input The input, unchanged.
 * @return string|null
 */
function site_dispatch_valid_server_host( string $input ): ?string {
	$host = strtolower( $input );
	if ( 1 !== preg_match( SITE_DISPATCH_HOST_PATTERN, $host ) ) {
		return null;
	}
	if ( 0 === strpos( $host, 'xn--' ) || false !== strpos( $host, '.xn--' ) ) {
		return null;
	}
	return $host;
}
