# Phase 2: Pure Checks, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, one session).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight pure PHP functions that check signatures, manifests, hosts and enrollment responses,
each test case of the master plan covered by one PHPUnit test.

**Architecture:** Three files under `includes/`, each self-contained (no file needs another one).
Functions and constants only, no WordPress, no I/O, no exception leaves a function. Every pattern
ends in `\z`, never `$`, so a trailing newline fails.

**Tech stack:** PHP 7.4 syntax (analysed as 7.4, run locally on 8.2), `sodium` extension, PHPUnit 9.6,
PHPStan 2 level max, PHPCS with WordPress-Extra and WordPress-Docs.

**Spec:** `n8n-builder/workflows/plugin-scan/spec-plugin.md` and `plan-plugin.md` (Phase 2), contract
`PROTOCOL.md` in this repository.

## Global constraints

- Signatures, names, patterns and sizes as in `plan-plugin.md`, Phase 2, and `PROTOCOL.md`.
- No private key in the repository. Signature tests create key pairs at run time
  (`sodium_crypto_sign_keypair`). One test runs against the fixed vector in `tests/vectors/`.
- Hex literals in tests: only the canary values already allowlisted in `.gitleaks.toml`, read from
  `tests/vectors/report-hmac.json`. Variants (63 characters, upper case) are derived at run time.
- Commits never with `--no-verify`. Nothing is pushed.
- Red runs are the job of the independent QA agent (Phase 6). This plan still runs each new test
  file once before the code exists, as a sanity check that the test is wired up.
- Files with `$` or quotes are written with the editor tools, not by shell scripts.

## Decisions this plan makes (please confirm at approval)

| # | Decision | Why |
|---|---|---|
| 1 | One malformed key (wrong length, not a string) rejects the **whole** key list, even next to a valid key | Keys are build constants. A broken one is a build error and must show up in tests, not pass quietly |
| 2 | Versions are compared on their digits (length, then text), not as integers | `\d+` has no upper bound, an integer cast would overflow. `1.02.3` equals `1.2.3` |
| 3 | Running PHP and WordPress versions are read by their numeric start (`7.4.33-0ubuntu1` is 7.4.33, `6.9-beta1` is 6.9.0). Without a numeric start: not acceptable | Real version strings carry suffixes. The installed plugin version must match `x.y.z` strictly |
| 4 | `site_dispatch_valid_server_host()` does not trim. Leading or trailing whitespace fails | The function stays strict. The admin page (Phase 3) may trim before it calls |
| 5 | Any label starting with `xn--` fails, in any position | The contract pattern alone would let Punycode pass. Proposed one-line addition to `PROTOCOL.md`, "Conventions": "A label starting with `xn--` is refused." Only with your go |
| 6 | `site_dispatch_norm_host()` behaves like the snippet reporter: trim, lower case, drop one leading `www.` | Same rule on both sides of the host check (reporter and inbox) |
| 7 | Responses need `"ok": true`. The `202` pending body parses to `null` | Phase 3 tells "pending" apart by status code, not through these parsers |
| 8 | No `ABSPATH` guard in the three files | They only declare functions and constants. Calling a file directly does nothing, and the tests run without WordPress |
| 9 | Three small helpers next to the eight functions: `site_dispatch_version_parts()`, `site_dispatch_compare_versions()`, `site_dispatch_decode_response()` | Used more than once, tested through the public functions |
| 10 | First parameter name `$sig_namespace` instead of `$namespace` | WPCS refuses reserved keywords as parameter names. Position and type are unchanged |
| 11 | PHPCS checks the plugin code only, not `tests/` and `tools/` | WordPress rules for file names and file access do not fit test code |

Open question, not part of this plan: `phpcompatibility/phpcompatibility-wp` as a further dev
dependency would check the 7.4 syntax floor in PHPCS. PHPStan with `phpVersion: 70400` covers most of
it. Recommendation: add it in Phase 6 with the other static checks.

## Files

| File | Responsibility |
|---|---|
| `phpunit.xml.dist` | Suite `unit` over `tests/unit`, strict flags |
| `phpstan.neon.dist` | Level max, PHP 7.4, path `includes` |
| `phpcs.xml.dist` | WordPress-Extra, WordPress-Docs, prefix `site_dispatch`, text domain |
| `composer.lock` | Pins the dev tools (created by `composer install`, already present, uncommitted) |
| `includes/verify.php` | `site_dispatch_sshsig_blob`, `site_dispatch_verify_signature`, `site_dispatch_parse_manifest`, `site_dispatch_manifest_acceptable`, two version helpers, five constants |
| `includes/hosts.php` | `site_dispatch_norm_host`, `site_dispatch_valid_server_host`, host pattern |
| `includes/responses.php` | `site_dispatch_parse_request_response`, `site_dispatch_parse_redeem_response`, decode helper, two constants |
| `tests/unit/bootstrap.php` | Requires the three files |
| `tests/unit/*Test.php` | Five test classes, see tasks |
| `README.md` | Development section: `composer test`, `composer stan`, `composer cs` |

`.gitattributes` already lists the three config files, `composer.lock`, `/docs` and `/tests` as
`export-ignore`. Nothing to add.

---

### Task 1: Tooling

**Files:** create `phpunit.xml.dist`, `phpstan.neon.dist`, `phpcs.xml.dist`, `tests/unit/bootstrap.php`,
the three files under `includes/` with header comment only. Add `composer.lock` and this plan.

- [x] **Step 1:** `git config core.hooksPath` prints `.githooks`. `composer install` is done.
- [x] **Step 2:** `phpunit.xml.dist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
	bootstrap="tests/unit/bootstrap.php"
	colors="true"
	failOnWarning="true"
	failOnRisky="true"
	beStrictAboutTestsThatDoNotTestAnything="true"
	beStrictAboutOutputDuringTests="true">
	<testsuites>
		<testsuite name="unit">
			<directory>tests/unit</directory>
		</testsuite>
	</testsuites>
</phpunit>
```

- [x] **Step 3:** `phpstan.neon.dist`

```neon
parameters:
	level: max
	phpVersion: 70400
	paths:
		- includes
```

- [x] **Step 4:** `phpcs.xml.dist`

```xml
<?xml version="1.0"?>
<ruleset name="Site Dispatch">
	<description>WordPress rules for the plugin code. Tests and tools are not part of a release.</description>

	<file>.</file>
	<exclude-pattern>/vendor/*</exclude-pattern>
	<exclude-pattern>/node_modules/*</exclude-pattern>
	<exclude-pattern>/tests/*</exclude-pattern>
	<exclude-pattern>/tools/*</exclude-pattern>
	<exclude-pattern>/build/*</exclude-pattern>
	<exclude-pattern>/dist/*</exclude-pattern>

	<arg name="extensions" value="php"/>
	<arg value="sp"/>

	<config name="minimum_wp_version" value="6.0"/>

	<rule ref="WordPress-Extra"/>
	<rule ref="WordPress-Docs"/>

	<rule ref="WordPress.NamingConventions.PrefixAllGlobals">
		<properties>
			<property name="prefixes" type="array">
				<element value="site_dispatch"/>
			</property>
		</properties>
	</rule>
	<rule ref="WordPress.WP.I18n">
		<properties>
			<property name="text_domain" type="array">
				<element value="site-dispatch"/>
			</property>
		</properties>
	</rule>
</ruleset>
```

- [x] **Step 5:** `tests/unit/bootstrap.php`

```php
<?php
/**
 * Loads the pure functions. No WordPress, no autoloader magic.
 *
 * @package Site_Dispatch
 */

require dirname( __DIR__, 2 ) . '/includes/verify.php';
require dirname( __DIR__, 2 ) . '/includes/hosts.php';
require dirname( __DIR__, 2 ) . '/includes/responses.php';
```

- [x] **Step 6:** The three files under `includes/`, each with its file comment only (text as in
  tasks 2, 5 and 6). `composer stan` reports no errors, `composer cs` is clean.
- [x] **Step 7:** Commit: `chore: phpunit, phpstan and phpcs config, plan for phase 2`.

### Task 2: Signed blob and signature

**Files:** `includes/verify.php`, test `tests/unit/VerifySignatureTest.php`.

**Produces:** `site_dispatch_sshsig_blob( string $message, string $sig_namespace ): string`,
`site_dispatch_verify_signature( string $manifest_bytes, string $sig_raw, array $pubkeys_raw ): bool`,
constants `SITE_DISPATCH_SLUG`, `SITE_DISPATCH_SIG_NAMESPACE`.

Test helpers: `setUpBeforeClass()` creates key pairs A and B, `sign( $message, $secret, $namespace )`
signs `site_dispatch_sshsig_blob()` with `sodium_crypto_sign_detached`, `flip_first_bit()` flips
bit 0 of byte 0. Manifest in the tests: `{"schema":1,"slug":"site-dispatch","version":"1.2.3"}`.
Key list is `[A, B]` unless stated.

| Test | Input | Expected |
|---|---|---|
| `test_blob_matches_the_documented_vector` | `tests/vectors/manifest.json`, namespace `site-dispatch-update` | Hex equals the 112 byte blob in `PROTOCOL.md` |
| `test_fixed_vector_from_the_protocol_verifies` | Vector manifest, signature, public key | true, and false with one flipped bit |
| `test_valid_signature_of_key_a_is_accepted` | Signed with A | true |
| `test_valid_signature_of_key_b_is_accepted` | Signed with B | true |
| `test_signature_of_a_foreign_key_is_rejected` | Signed with a third key | false |
| `test_one_flipped_bit_in_the_manifest_is_rejected` | Manifest changed after signing | false |
| `test_one_flipped_bit_in_the_signature_is_rejected` | Signature changed | false |
| `test_signature_of_63_bytes_is_rejected` | Signature cut | false |
| `test_signature_of_65_bytes_is_rejected` | Signature plus one byte | false |
| `test_empty_key_list_is_rejected` | Keys `[]` | false |
| `test_signature_made_for_namespace_git_is_rejected` | Signed over the blob for `git` | false |
| `test_key_of_wrong_length_is_rejected` | Key A with 31 and with 33 bytes | false |
| `test_a_malformed_key_next_to_a_valid_one_rejects_the_whole_list` | `[A, 'short']`, `[A, 42]` | false |

- [x] **Step 1:** Write the test file. Run `composer test`. Expected: errors, "Call to undefined
  function site_dispatch_sshsig_blob()".
- [x] **Step 2:** Code:

```php
<?php
/**
 * Pure checks for the signed update: signed blob, signature, manifest, acceptance.
 *
 * No WordPress, no side effects, no exception leaves a function. Contract: PROTOCOL.md, section 3.
 *
 * @package Site_Dispatch
 */

/**
 * Fixed values of the update contract. None of them can be changed at run time.
 */
const SITE_DISPATCH_SLUG               = 'site-dispatch';
const SITE_DISPATCH_SIG_NAMESPACE      = 'site-dispatch-update';
const SITE_DISPATCH_MANIFEST_MAX_BYTES = 8192;
const SITE_DISPATCH_VERSION_PATTERN    = '/^[0-9]+\.[0-9]+\.[0-9]+\z/';
const SITE_DISPATCH_REQUIRES_PATTERN   = '/^[0-9]+\.[0-9]+(\.[0-9]+)?\z/';

/**
 * Builds the blob that OpenSSH signs for a file (SSHSIG format, hash sha512).
 *
 * @param string $message       The signed file, byte for byte.
 * @param string $sig_namespace The SSHSIG namespace.
 * @return string
 */
function site_dispatch_sshsig_blob( string $message, string $sig_namespace ): string {
	$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $message, true ) );
	$blob   = 'SSHSIG';
	foreach ( $fields as $field ) {
		$blob .= pack( 'N', strlen( $field ) ) . $field;
	}
	return $blob;
}

/**
 * Checks a raw Ed25519 signature over the manifest against a list of public keys.
 *
 * A malformed key list fails as a whole: the keys are build constants, a broken one is a build
 * error and must not pass quietly.
 *
 * @param string       $manifest_bytes The manifest as served.
 * @param string       $sig_raw        The raw signature, exactly 64 bytes.
 * @param array<mixed> $pubkeys_raw    Raw public keys, 32 bytes each.
 * @return bool
 */
function site_dispatch_verify_signature( string $manifest_bytes, string $sig_raw, array $pubkeys_raw ): bool {
	if ( 64 !== strlen( $sig_raw ) || array() === $pubkeys_raw ) {
		return false;
	}
	if ( ! function_exists( 'sodium_crypto_sign_verify_detached' ) ) {
		return false;
	}
	$keys = array();
	foreach ( $pubkeys_raw as $key ) {
		if ( ! is_string( $key ) || 32 !== strlen( $key ) ) {
			return false;
		}
		$keys[] = $key;
	}
	$blob  = site_dispatch_sshsig_blob( $manifest_bytes, SITE_DISPATCH_SIG_NAMESPACE );
	$valid = false;
	try {
		foreach ( $keys as $key ) {
			if ( sodium_crypto_sign_verify_detached( $sig_raw, $blob, $key ) ) {
				$valid = true;
			}
		}
	} catch ( \Throwable $e ) {
		return false;
	}
	return $valid;
}
```

- [x] **Step 3:** `composer test` green for this class, `composer stan` without errors.
- [x] **Step 4:** Commit: `feat: sshsig blob and signature check`.

### Task 3: Manifest parser

**Files:** `includes/verify.php`, test `tests/unit/ParseManifestTest.php`.

**Produces:** `site_dispatch_parse_manifest( string $manifest_bytes ): ?array` with exactly the keys
`schema`, `slug`, `version`, `zip`, `sha512`, `requires_wp`, `requires_php`.

Test helper `manifest( array $changes )`: a valid manifest (`version` `1.2.3`, `zip`
`site-dispatch-1.2.3.zip`, `sha512` 64 times `ab`, `requires_wp` `6.0`, `requires_php` `7.4`) with
fields replaced, `null` removes a field, encoded with `JSON_UNESCAPED_SLASHES`.

| Test | Change | Expected |
|---|---|---|
| `test_valid_manifest_returns_exactly_the_seven_fields` | none | The seven fields, `schema` as integer 1 |
| `test_manifest_vector_from_the_protocol_parses` | `tests/vectors/manifest.json` | Array, slug `site-dispatch` |
| `test_text_that_is_not_json_is_rejected` | `not json`, empty text | null |
| `test_json_list_instead_of_object_is_rejected` | `[1,"site-dispatch","1.2.3"]`, `[]` | null |
| `test_missing_field_is_rejected` | `requires_php` removed | null |
| `test_additional_field_is_rejected` | `first_seen` added | null |
| `test_foreign_slug_is_rejected` | slug `akismet` | null |
| `test_version_with_two_parts_is_rejected` | version `1.2`, zip to match | null |
| `test_version_with_suffix_is_rejected` | version `1.2.3-beta`, zip to match | null |
| `test_version_with_trailing_newline_is_rejected` | version `1.2.3\n`, zip to match | null |
| `test_zip_with_parent_path_is_rejected` | `../site-dispatch-1.2.3.zip` | null |
| `test_zip_as_url_is_rejected` | `https://example.com/site-dispatch-1.2.3.zip` | null |
| `test_zip_without_version_is_rejected` | `site-dispatch.zip` | null |
| `test_zip_with_another_version_is_rejected` | `site-dispatch-1.2.4.zip` | null |
| `test_sha512_that_is_too_short_is_rejected` | 127 characters | null |
| `test_sha512_in_upper_case_is_rejected` | 64 times `AB` | null |
| `test_manifest_of_9_kb_is_rejected` | Valid JSON padded with 9 KB of spaces | null |
| `test_manifest_of_exactly_8_kb_is_accepted` | Padded to 8192 bytes, then 8193 | Array, then null |
| `test_schema_as_text_is_rejected` | schema `"1"` | null |
| `test_nested_value_is_rejected` | `requires_wp` as list | null |

- [x] **Step 1:** Write the test file, run, expected: undefined function.
- [x] **Step 2:** Code, appended to `includes/verify.php`:

```php
/**
 * Parses a manifest. Returns null on any deviation from the seven fields and their patterns.
 *
 * @param string $manifest_bytes The manifest as served.
 * @return array{schema: int, slug: string, version: string, zip: string, sha512: string, requires_wp: string, requires_php: string}|null
 */
function site_dispatch_parse_manifest( string $manifest_bytes ): ?array {
	$length = strlen( $manifest_bytes );
	if ( 0 === $length || $length > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {
		return null;
	}
	// Depth 2 is a flat object. Any nested value fails the decode.
	$data = json_decode( $manifest_bytes, false, 2 );
	if ( ! $data instanceof \stdClass ) {
		return null;
	}
	$fields = get_object_vars( $data );
	$names  = array_map( 'strval', array_keys( $fields ) );
	sort( $names, SORT_STRING );
	if ( array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ) !== $names ) {
		return null;
	}
	$version      = $fields['version'];
	$zip          = $fields['zip'];
	$sha512       = $fields['sha512'];
	$requires_wp  = $fields['requires_wp'];
	$requires_php = $fields['requires_php'];
	if ( 1 !== $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {
		return null;
	}
	if ( ! is_string( $version ) || ! is_string( $zip ) || ! is_string( $sha512 ) || ! is_string( $requires_wp ) || ! is_string( $requires_php ) ) {
		return null;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) ) {
		return null;
	}
	// Equality with the name built from the version covers the file name pattern: no path, no URL.
	if ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== $zip ) {
		return null;
	}
	if ( 1 !== preg_match( '/^[0-9a-f]{128}\z/', $sha512 ) ) {
		return null;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_REQUIRES_PATTERN, $requires_wp ) || 1 !== preg_match( SITE_DISPATCH_REQUIRES_PATTERN, $requires_php ) ) {
		return null;
	}
	return array(
		'schema'       => 1,
		'slug'         => SITE_DISPATCH_SLUG,
		'version'      => $version,
		'zip'          => $zip,
		'sha512'       => $sha512,
		'requires_wp'  => $requires_wp,
		'requires_php' => $requires_php,
	);
}
```

- [x] **Step 3:** `composer test` and `composer stan` green.
- [x] **Step 4:** Commit: `feat: manifest parser`.

### Task 4: Acceptance

**Files:** `includes/verify.php`, test `tests/unit/ManifestAcceptableTest.php`.

**Produces:** `site_dispatch_manifest_acceptable( array $m, string $installed, string $php, string $wp ): bool`.

Test helper `manifest( $version, $requires_wp = '6.0', $requires_php = '7.4' )` returns a parsed
manifest. Defaults for the call: installed `1.2.3`, PHP `8.2.30`, WordPress `6.8.2`.

| Test | Input | Expected |
|---|---|---|
| `test_higher_version_is_accepted` | `1.2.4` | true |
| `test_same_version_is_rejected` | `1.2.3` | false |
| `test_lower_version_is_rejected` | `1.2.2` | false |
| `test_versions_compare_as_numbers_not_as_text` | `1.10.0` over `1.9.0`, and the reverse | true, false |
| `test_leading_zeros_do_not_make_a_version_higher` | `1.02.3` over `1.2.3` | false |
| `test_numbers_beyond_the_integer_range_still_compare` | 20 digit patch numbers, one apart, both directions | true, false |
| `test_php_that_is_too_old_is_rejected` | requires PHP `8.1`, running `7.4.33` | false |
| `test_wordpress_that_is_too_old_is_rejected` | requires WP `6.5`, running `6.4.3` | false |
| `test_exactly_the_required_versions_are_enough` | requires `6.5` and `8.1`, running `6.5` and `8.1.0` | true |
| `test_version_strings_with_a_vendor_suffix_are_read_by_their_numbers` | PHP `7.4.33-0ubuntu0.20.04.1`, WP `6.9-beta1`, requires `7.4` and `6.5` | true |
| `test_unreadable_running_versions_are_rejected` | PHP empty, WP `trunk`, installed `dev` | false each |
| `test_foreign_slug_is_rejected` | slug `akismet` | false |
| `test_array_that_is_not_a_manifest_is_rejected` | `[]`, version as integer | false |

- [x] **Step 1:** Write the test file, run, expected: undefined function.
- [x] **Step 2:** Code, appended to `includes/verify.php`:

```php
/**
 * Splits the numeric start of a version into three parts. Missing parts count as 0.
 *
 * Takes what PHP and WordPress report ("8.2.30", "6.9-beta1", "7.4.33-0ubuntu1").
 *
 * @param string $version A version string.
 * @return array{string, string, string}|null Null without a numeric start.
 */
function site_dispatch_version_parts( string $version ): ?array {
	if ( 1 !== preg_match( '/^([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?/', $version, $hit ) ) {
		return null;
	}
	return array( $hit[1], $hit[2] ?? '0', $hit[3] ?? '0' );
}

/**
 * Compares two versions number by number, on the digits, so no length overflows.
 *
 * @param array{string, string, string} $left  Parts of the left version.
 * @param array{string, string, string} $right Parts of the right version.
 * @return int -1, 0 or 1.
 */
function site_dispatch_compare_versions( array $left, array $right ): int {
	foreach ( array( 0, 1, 2 ) as $i ) {
		$a = ltrim( $left[ $i ], '0' );
		$b = ltrim( $right[ $i ], '0' );
		$d = strlen( $a ) <=> strlen( $b );
		if ( 0 === $d ) {
			$d = strcmp( $a, $b ) <=> 0;
		}
		if ( 0 !== $d ) {
			return $d;
		}
	}
	return 0;
}

/**
 * Decides whether a parsed manifest may be offered as an update.
 *
 * @param array<mixed> $m         A manifest from site_dispatch_parse_manifest().
 * @param string       $installed The installed plugin version.
 * @param string       $php       The running PHP version.
 * @param string       $wp        The running WordPress version.
 * @return bool
 */
function site_dispatch_manifest_acceptable( array $m, string $installed, string $php, string $wp ): bool {
	$version      = $m['version'] ?? null;
	$requires_wp  = $m['requires_wp'] ?? null;
	$requires_php = $m['requires_php'] ?? null;
	if ( SITE_DISPATCH_SLUG !== ( $m['slug'] ?? null ) ) {
		return false;
	}
	if ( ! is_string( $version ) || ! is_string( $requires_wp ) || ! is_string( $requires_php ) ) {
		return false;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) || 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $installed ) ) {
		return false;
	}
	if ( 1 !== preg_match( SITE_DISPATCH_REQUIRES_PATTERN, $requires_wp ) || 1 !== preg_match( SITE_DISPATCH_REQUIRES_PATTERN, $requires_php ) ) {
		return false;
	}
	$offered   = site_dispatch_version_parts( $version );
	$current   = site_dispatch_version_parts( $installed );
	$php_has   = site_dispatch_version_parts( $php );
	$php_needs = site_dispatch_version_parts( $requires_php );
	$wp_has    = site_dispatch_version_parts( $wp );
	$wp_needs  = site_dispatch_version_parts( $requires_wp );
	if ( null === $offered || null === $current || null === $php_has || null === $php_needs || null === $wp_has || null === $wp_needs ) {
		return false;
	}
	return site_dispatch_compare_versions( $offered, $current ) > 0
		&& site_dispatch_compare_versions( $php_has, $php_needs ) >= 0
		&& site_dispatch_compare_versions( $wp_has, $wp_needs ) >= 0;
}
```

- [x] **Step 3:** `composer test` and `composer stan` green.
- [x] **Step 4:** Commit: `feat: manifest acceptance with numeric version compare`.

### Task 5: Hosts

**Files:** `includes/hosts.php`, test `tests/unit/HostsTest.php`.

**Produces:** `site_dispatch_norm_host( string $host ): string`,
`site_dispatch_valid_server_host( string $input ): ?string`.

| Test | Input | Expected |
|---|---|---|
| `test_valid_host_is_returned_unchanged` | `n8n.example.com`, `x.de` | same text |
| `test_upper_case_becomes_lower_case` | `N8N.Example.COM` | `n8n.example.com` |
| `test_host_with_scheme_is_rejected` | `http://x.de`, `https://x.de` | null |
| `test_host_with_path_is_rejected` | `x.de/pfad`, `x.de/` | null |
| `test_host_with_user_is_rejected` | `user@x.de` | null |
| `test_ipv4_literal_is_rejected` | `1.2.3.4` | null |
| `test_ipv6_literal_is_rejected` | `[::1]` | null |
| `test_localhost_is_rejected` | `localhost` | null |
| `test_internal_single_label_name_is_rejected` | `coolify` | null |
| `test_host_with_port_is_rejected` | `x.de:8443` | null |
| `test_whitespace_is_rejected` | `x .de`, leading, trailing, trailing newline, empty | null |
| `test_punycode_label_is_rejected` | `xn--bcher-kva.de`, as second label, in upper case | null |
| `test_host_of_254_characters_is_rejected` | 253 characters, then 254 | same text, then null |
| `test_label_of_64_characters_is_rejected` | label of 63, then 64 | not null, then null |
| `test_trailing_dot_and_empty_label_are_rejected` | `x.de.`, `x..de`, `-x.de` | null |
| `test_norm_host_trims_lowers_and_drops_a_leading_www` | ` WWW.Example.com `, `www.`, empty | `example.com`, empty, empty |
| `test_norm_host_drops_only_a_leading_www` | `shop.www.example.com`, `wwwexample.com`, `www.www.example.com` | unchanged, unchanged, `www.example.com` |

- [x] **Step 1:** Write the test file, run, expected: undefined function.
- [x] **Step 2:** Code:

```php
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
```

- [x] **Step 3:** `composer test` and `composer stan` green.
- [x] **Step 4:** Commit: `feat: host normalisation and server host check`.

### Task 6: Enrollment responses

**Files:** `includes/responses.php`, test `tests/unit/ResponsesTest.php`.

**Produces:** `site_dispatch_parse_request_response( string $body ): ?array` (`request_id`,
`user_code`), `site_dispatch_parse_redeem_response( string $body ): ?array` (`site_key`,
`key_version`, `website_id`).

Test helpers `request( array $changes )` and `redeem( array $changes )` build a valid body and merge
changes. UUID `00000000-0000-4000-8000-000000000001`, user code `ABCDEFGH`, site key read from
`tests/vectors/report-hmac.json`.

| Test | Input | Expected |
|---|---|---|
| `test_valid_request_response_is_parsed` | valid | `request_id`, `user_code` |
| `test_valid_redeem_response_is_parsed` | valid | `site_key`, `key_version` 1, `website_id` |
| `test_key_of_63_characters_is_rejected` | key cut | null |
| `test_key_of_65_characters_is_rejected` | key plus `a` | null |
| `test_upper_case_in_the_key_is_rejected` | key in upper case | null |
| `test_key_version_as_text_is_rejected` | `"1"` | null |
| `test_key_version_that_is_not_a_positive_integer_is_rejected` | `0`, `-1`, `1.5` | null |
| `test_website_id_that_is_no_uuid_is_rejected` | UUID in upper case, `1` | null |
| `test_additional_fields_are_dropped_from_a_redeem_response` | plus `server_host` and a nested field | exactly the three keys |
| `test_additional_fields_are_dropped_from_a_request_response` | plus `approve_url` | exactly the two keys |
| `test_response_of_5_kb_is_rejected` | both bodies plus 5 KB padding field | null |
| `test_html_instead_of_json_is_rejected` | HTML error page, both parsers | null |
| `test_json_list_instead_of_object_is_rejected` | `[true]`, `[]` | null |
| `test_response_without_ok_true_is_rejected` | `ok` false, `1`, `"true"` | null |
| `test_pending_response_is_not_a_redeem` | `{"ok":false,"pending":true}` | null |
| `test_user_code_with_a_look_alike_character_is_rejected` | codes with `I`, `O`, `0`, `1`, lower case, 7 and 9 characters | null |
| `test_request_id_that_is_no_uuid_is_rejected` | UUID plus newline | null |

- [x] **Step 1:** Write the test file, run, expected: undefined function.
- [x] **Step 2:** Code:

```php
<?php
/**
 * Pure parsers for the two enrollment responses. No WordPress, no side effects.
 *
 * Contract: PROTOCOL.md, section 2. Only the fields named there leave a parser.
 *
 * @package Site_Dispatch
 */

/**
 * Size limit and UUID pattern of the contract.
 */
const SITE_DISPATCH_RESPONSE_MAX_BYTES = 4096;
const SITE_DISPATCH_UUID_PATTERN       = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/';

/**
 * Decodes a response body into its top level fields. Null unless it is a JSON object with
 * "ok": true and at most 4 KB.
 *
 * @param string $body The response body.
 * @return array<string, mixed>|null
 */
function site_dispatch_decode_response( string $body ): ?array {
	$length = strlen( $body );
	if ( 0 === $length || $length > SITE_DISPATCH_RESPONSE_MAX_BYTES ) {
		return null;
	}
	$data = json_decode( $body, false, 8 );
	if ( ! $data instanceof \stdClass ) {
		return null;
	}
	$fields = array();
	foreach ( get_object_vars( $data ) as $name => $value ) {
		$fields[ (string) $name ] = $value;
	}
	if ( true !== ( $fields['ok'] ?? null ) ) {
		return null;
	}
	return $fields;
}

/**
 * Parses the response to an enrollment request.
 *
 * @param string $body The response body.
 * @return array{request_id: string, user_code: string}|null
 */
function site_dispatch_parse_request_response( string $body ): ?array {
	$fields = site_dispatch_decode_response( $body );
	if ( null === $fields ) {
		return null;
	}
	$request_id = $fields['request_id'] ?? null;
	$user_code  = $fields['user_code'] ?? null;
	if ( ! is_string( $request_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $request_id ) ) {
		return null;
	}
	if ( ! is_string( $user_code ) || 1 !== preg_match( '/^[A-HJ-NP-Z2-9]{8}\z/', $user_code ) ) {
		return null;
	}
	return array(
		'request_id' => $request_id,
		'user_code'  => $user_code,
	);
}

/**
 * Parses the response to a successful redeem.
 *
 * @param string $body The response body.
 * @return array{site_key: string, key_version: int, website_id: string}|null
 */
function site_dispatch_parse_redeem_response( string $body ): ?array {
	$fields = site_dispatch_decode_response( $body );
	if ( null === $fields ) {
		return null;
	}
	$site_key    = $fields['site_key'] ?? null;
	$key_version = $fields['key_version'] ?? null;
	$website_id  = $fields['website_id'] ?? null;
	if ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\z/', $site_key ) ) {
		return null;
	}
	if ( ! is_int( $key_version ) || $key_version < 1 ) {
		return null;
	}
	if ( ! is_string( $website_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $website_id ) ) {
		return null;
	}
	return array(
		'site_key'    => $site_key,
		'key_version' => $key_version,
		'website_id'  => $website_id,
	);
}
```

- [x] **Step 3:** `composer test` and `composer stan` green.
- [x] **Step 4:** Commit: `feat: parsers for the enrollment responses`.

### Task 7: Gate

- [x] **Step 1:** `composer test` (expected: 80 tests, all green), `composer stan` (no errors),
  `composer cs` (clean), `composer vectors` (all vectors hold).
- [x] **Step 2:** `README.md`, section "Development": add `composer test`, `composer stan`,
  `composer cs` to the command block.
- [x] **Step 3:** If decision 5 is approved: add the Punycode sentence to `PROTOCOL.md`.
- [x] **Step 4:** Commit: `docs: development commands, phase 2 done`.
- [x] **Step 5:** In `n8n-builder`: finding of Phase 2 into `plan-plugin.md`, session prompt for
  Phase 3 next to it. Present the gate. Phase 3 does not start.

## Coverage of the master plan

| Block in `plan-plugin.md` | Cases there | Tests here |
|---|---|---|
| Signature | 10 | 13 (plus blob vector, fixed vector, mixed key list) |
| Manifest | 13 | 20 |
| Acceptance | 5 | 13 |
| Host | 13 | 17 |
| Responses | 7 | 17 |
