<?php
/**
 * What the updater remembers within one request. Nothing here is stored anywhere.
 *
 * @package Site_Dispatch
 */

/**
 * Memory of one request.
 */
final class Site_Dispatch_Memo {

	/**
	 * Verdicts on stored updates, by the hash of manifest and signature.
	 *
	 * @var array<string, string>
	 */
	public static $verdicts = array();

	/**
	 * The package handed to the upgrader, until the next unpacking.
	 *
	 * @var array{file: string, sha512: string}|null
	 */
	public static $package = null;
}
