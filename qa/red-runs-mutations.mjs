// Mutations for qa/red-runs.mjs. One realistic bug per test case, applied to a copy of the
// production code. Fields: kind (php, tools, integration), target (the case as the runner names
// it), file + search + replace or edits[], reason. spec names the integration test file.
// expect: 'survive' marks a case no realistic mutation can turn red (defence in depth or a test
// of WordPress itself); the entry documents the attempt.
//
// Search strings have to match exactly once. Tabs are the indentation of the PHP files.
const HOSTS = 'includes/hosts.php';
const VERIFY = 'includes/verify.php';
const REPORT = 'includes/report.php';
const RESP = 'includes/responses.php';
const UPD = 'includes/updater.php';
const KEYS = 'includes/keys.php';
const SOURCE = 'includes/source.php';
const COMMON = 'includes/common.php';
const ENROLL = 'includes/enroll.php';
const ADMIN = 'includes/admin.php';
const MAIN = 'site-dispatch.php';
const UNINSTALL = 'uninstall.php';

const KEY_A = "'SrtmPWXaVFE/pf493gYke3MPHUsQTkFw9yopZVmu0ps='";
const KEY_B = "'oC5qEUmBep0woFhjzuN8B3sRxIdRDCSoQNZfxZxEOnc='";
const HOST_PATTERN = "const SITE_DISPATCH_HOST_PATTERN = '/^(?=.{4,253}\\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}\\z/';";
const HP = ( pattern ) => "const SITE_DISPATCH_HOST_PATTERN = '" + pattern + "';";
const LOWER = '\t$host = strtolower( $input );';
const PUNY = "\tif ( 0 === strpos( $host, 'xn--' ) || false !== strpos( $host, '.xn--' ) ) {\n\t\treturn null;\n\t}\n";
const COMPARE_BODY = '\t\t$d = strlen( $a ) <=> strlen( $b );\n\t\tif ( 0 === $d ) {\n\t\t\t$d = strcmp( $a, $b ) <=> 0;\n\t\t}';
const ACCEPT_RETURN = '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n\t\t&& site_dispatch_compare_versions( $php_has, $php_needs ) >= 0\n\t\t&& site_dispatch_compare_versions( $wp_has, $wp_needs ) >= 0;';
const NAMES_CHECK = "\tif ( array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ) !== $names ) {";
const ZIP_CHECK = "\tif ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== $zip ) {\n\t\treturn null;\n\t}\n\tif ( 1 !== preg_match( '/^[0-9a-f]{128}\\z/', $sha512 ) ) {";
const VERSION_PATTERN = "const SITE_DISPATCH_VERSION_PATTERN    = '/^[0-9]+\\.[0-9]+\\.[0-9]+\\z/';";
const VP = ( p ) => "const SITE_DISPATCH_VERSION_PATTERN    = '" + p + "';";
const SHA_CHECK = "\tif ( 1 !== preg_match( '/^[0-9a-f]{128}\\z/', $sha512 ) ) {";
const URL_PATTERN = "const SITE_DISPATCH_URL_PATTERN    = '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/';";
const UP = ( p ) => "const SITE_DISPATCH_URL_PATTERN    = '" + p + "';";
const BASE_PATTERN = "const SITE_DISPATCH_BASE_PATTERN   = '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)+\\z/';";
const BP = ( p ) => "const SITE_DISPATCH_BASE_PATTERN   = '" + p + "';";
const REDIRECT_RETURN = '\treturn 1 === preg_match( SITE_DISPATCH_URL_PATTERN, $location ) ? $location : null;';
const JUDGE_VERIFY = "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) ) {\n\t\treturn 'invalid';\n\t}";
const JUDGE_NEWER = "\tif ( site_dispatch_compare_versions( $offered, $current ) <= 0 ) {\n\t\treturn 'not_newer';\n\t}";
const VERIFY_GUARD = '\tif ( 64 !== strlen( $sig_raw ) || array() === $pubkeys_raw ) {\n\t\treturn false;\n\t}';
const VERIFY_LOOP = '\t$valid = false;\n\ttry {\n\t\tforeach ( $keys as $key ) {\n\t\t\tif ( sodium_crypto_sign_verify_detached( $sig_raw, $blob, $key ) ) {\n\t\t\t\t$valid = true;\n\t\t\t}\n\t\t}\n\t} catch ( \\Throwable $e ) {\n\t\treturn false;\n\t}\n\treturn $valid;';
const VERIFY_LOOP_NO_TRY = '\t$valid = false;\n\tforeach ( $keys as $key ) {\n\t\tif ( sodium_crypto_sign_verify_detached( $sig_raw, $blob, $key ) ) {\n\t\t\t$valid = true;\n\t\t}\n\t}\n\treturn $valid;';
const KEY_GUARD = "\t\tif ( ! is_string( $key ) || 32 !== strlen( $key ) ) {\n\t\t\treturn false;\n\t\t}\n";
const NAMES_PREFIX = '\t\tif ( ! is_string( $name ) || 0 !== strpos( $name, $prefix ) ) {\n\t\t\treturn false;\n\t\t}';
const NAMES_PARTS = "\t\t\tif ( '' === $part || '.' === $part || '..' === $part ) {";
const NAMES_PATTERN = "\t\tif ( 1 !== preg_match( '/^[\\x20-\\x5b\\x5d-\\x7e]{1,512}\\z/', $name ) ) {";
const NEXT_SAME = "\tif ( null !== $stored && ( $stored['manifest'] ?? null ) === $manifest_bytes && ( $stored['version'] ?? null ) === $manifest['version'] ) {\n\t\treturn array( 'action' => 'keep' );\n\t}\n";
const DUE_RETURN = '\treturn $first_seen <= $now && $now - $first_seen >= SITE_DISPATCH_UPDATE_DELAY;';
const PICK_COND = "( is_string( $value ) || is_int( $value ) || is_float( $value ) ) && '' !== (string) $value";
const SERVER_PATTERN = "const SITE_DISPATCH_SERVER_PATTERN = '/^[A-Za-z][A-Za-z0-9_-]{0,31}(\\/[0-9][0-9.]{0,15})?\\z/';";
const SP = ( p ) => "const SITE_DISPATCH_SERVER_PATTERN = '" + p + "';";
const UUID_PATTERN = "const SITE_DISPATCH_UUID_PATTERN       = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\z/';";
const DECODE_GUARD = '\tif ( ! $data instanceof \\stdClass ) {\n\t\treturn null;\n\t}\n\t$fields = array();';
const REDEEM_RETURN = "\treturn array(\n\t\t'site_key'    => $site_key,\n\t\t'key_version' => $key_version,\n\t\t'website_id'  => $website_id,\n\t);";
const REQUEST_RETURN = "\treturn array(\n\t\t'request_id' => $request_id,\n\t\t'user_code'  => $user_code,\n\t);";

const php = ( target, file, search, replace, reason ) => ( { kind: 'php', target, file, search, replace, reason } );
const phpEdits = ( target, reason, edits ) => ( { kind: 'php', target, reason, edits } );
const H = ( t ) => 'HostsTest::' + t;
const K = ( t ) => 'KeysTest::' + t;
const MA = ( t ) => 'ManifestAcceptableTest::' + t;
const PM = ( t ) => 'ParseManifestTest::' + t;
const RH = ( t ) => 'ReportHelpersTest::' + t;
const RS = ( t ) => 'ResponsesTest::' + t;
const U = ( t ) => 'UpdaterTest::' + t;
const UD = ( t, set ) => 'UpdaterTest::' + t + ' with data set "' + set + '"';
const VS = ( t ) => 'VerifySignatureTest::' + t;

export const PHP = [
	// ----- HostsTest -----
	php( H( 'test_valid_host_is_returned_unchanged' ), HOSTS, HOST_PATTERN, HP( '/^(?=.{5,253}\\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}\\z/' ), 'off-by-one on the minimum length, x.de refused' ),
	php( H( 'test_upper_case_becomes_lower_case' ), HOSTS, LOWER, '\t$host = $input;', 'input not lower-cased' ),
	php( H( 'test_host_with_scheme_is_rejected' ), HOSTS, LOWER, "\t$host = strtolower( preg_replace( '#^https?://#', '', $input ) );", 'scheme tolerated' ),
	php( H( 'test_host_with_path_is_rejected' ), HOSTS, LOWER, "\t$host = strtolower( (string) strtok( $input, '/' ) );", 'path cut off' ),
	php( H( 'test_host_with_user_is_rejected' ), HOSTS, LOWER, "\t$host = strtolower( preg_replace( '/^[^@]*@/', '', $input ) );", 'user part cut off' ),
	php( H( 'test_ipv4_literal_is_rejected' ), HOSTS, HOST_PATTERN, HP( '/^(?=.{4,253}\\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9]+\\z/' ), 'last label without its letter rule, IPv4 passes' ),
	php( H( 'test_ipv6_literal_is_rejected' ), HOSTS, '\tif ( 1 !== preg_match( SITE_DISPATCH_HOST_PATTERN, $host ) ) {', "\tif ( 1 !== preg_match( SITE_DISPATCH_HOST_PATTERN, $host ) && false === filter_var( trim( $host, '[]' ), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 ) ) {", 'IPv6 literals allowed' ),
	php( H( 'test_localhost_is_rejected' ), HOSTS, HOST_PATTERN, HP( '/^(?=.{4,253}\\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)*[a-z]{2,}\\z/' ), 'single label names allowed' ),
	php( H( 'test_internal_single_label_name_is_rejected' ), HOSTS, '\tif ( 1 !== preg_match( SITE_DISPATCH_HOST_PATTERN, $host ) ) {', "\tif ( 1 !== preg_match( SITE_DISPATCH_HOST_PATTERN, $host ) && 1 !== preg_match( '/^[a-z][a-z0-9-]{2,62}\\z/', $host ) ) {", 'internal container names allowed' ),
	php( H( 'test_host_with_port_is_rejected' ), HOSTS, LOWER, "\t$host = strtolower( preg_replace( '/:[0-9]+\\z/', '', $input ) );", 'port cut off' ),
	php( H( 'test_whitespace_is_rejected' ), HOSTS, LOWER, '\t$host = strtolower( trim( $input ) );', 'input trimmed before the check' ),
	php( H( 'test_punycode_label_is_rejected' ), HOSTS, PUNY, '', 'punycode check dropped' ),
	php( H( 'test_host_of_254_characters_is_rejected' ), HOSTS, HOST_PATTERN, HP( '/^(?=.{4,254}\\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}\\z/' ), 'off-by-one on the maximum length' ),
	php( H( 'test_label_of_64_characters_is_rejected' ), HOSTS, HOST_PATTERN, HP( '/^(?=.{4,253}\\z)([a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?\\.)+[a-z]{2,}\\z/' ), 'off-by-one on the label length' ),
	php( H( 'test_trailing_dot_and_empty_label_are_rejected' ), HOSTS, HOST_PATTERN, HP( '/^(?=.{4,253}\\z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}\\.?\\z/' ), 'trailing dot allowed' ),
	php( H( 'test_norm_host_trims_lowers_and_drops_a_leading_www' ), HOSTS, '\t$host = strtolower( trim( $host ) );', '\t$host = strtolower( $host );', 'no trim in the normalisation' ),
	php( H( 'test_norm_host_drops_only_a_leading_www' ), HOSTS, "\tif ( 0 !== strpos( $host, 'www.' ) ) {", "\tif ( false === strpos( $host, 'www.' ) ) {", 'www found anywhere, not only at the start' ),

	// ----- KeysTest -----
	php( K( 'test_key_file_declares_two_keys_and_nothing_else' ), KEYS, KEY_B + ',\n);', KEY_B + ',\n\t' + KEY_B + ',\n);', 'a third key added' ),
	php( K( 'test_both_keys_are_32_bytes' ), KEYS, KEY_A, "'SrtmPWXaVFE/pf493gYke3MPHUsQTkFw9yopZVmu0p='", 'key text lost a character' ),
	php( K( 'test_the_two_keys_differ' ), KEYS, KEY_B, KEY_A, 'reserve key equals the work key' ),
	php( K( 'test_source_file_declares_the_address_and_nothing_else' ), SOURCE, "const SITE_DISPATCH_RELEASE_BASE = 'https://github.com/manuel-will/site-dispatch';", "define( 'SITE_DISPATCH_RELEASE_BASE', getenv( 'SITE_DISPATCH_RELEASE_BASE' ) ?: 'https://github.com/manuel-will/site-dispatch' );", 'release address made overridable' ),
	php( K( 'test_release_address_is_the_repository' ), SOURCE, "'https://github.com/manuel-will/site-dispatch'", "'https://github.com/manuel-will/site-dispatch/'", 'trailing slash in the address' ),

	// ----- ManifestAcceptableTest -----
	php( MA( 'test_higher_version_is_accepted' ), VERIFY, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n', '\treturn site_dispatch_compare_versions( $current, $offered ) > 0\n', 'arguments of the version comparison swapped' ),
	php( MA( 'test_same_version_is_rejected' ), VERIFY, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n', '\treturn site_dispatch_compare_versions( $offered, $current ) >= 0\n', 'same version accepted' ),
	php( MA( 'test_lower_version_is_rejected' ), VERIFY, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n', '\treturn site_dispatch_compare_versions( $offered, $current ) !== 0\n', 'any different version accepted' ),
	php( MA( 'test_versions_compare_as_numbers_not_as_text' ), VERIFY, COMPARE_BODY, '\t\t$d = strcmp( $a, $b ) <=> 0;', 'versions compared as text' ),
	php( MA( 'test_leading_zeros_do_not_make_a_version_higher' ), VERIFY, "\t\t$a = ltrim( $left[ $i ], '0' );", '\t\t$a = $left[ $i ];', 'leading zeros kept on one side' ),
	php( MA( 'test_numbers_beyond_the_integer_range_still_compare' ), VERIFY, COMPARE_BODY, '\t\t$d = (int) $a <=> (int) $b;', 'parts cast to int, overflow makes them equal' ),
	php( MA( 'test_php_that_is_too_old_is_rejected' ), VERIFY, ACCEPT_RETURN, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n\t\t&& site_dispatch_compare_versions( $wp_has, $wp_needs ) >= 0;', 'PHP minimum not checked' ),
	php( MA( 'test_wordpress_that_is_too_old_is_rejected' ), VERIFY, ACCEPT_RETURN, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n\t\t&& site_dispatch_compare_versions( $php_has, $php_needs ) >= 0;', 'WordPress minimum not checked' ),
	php( MA( 'test_exactly_the_required_versions_are_enough' ), VERIFY, '\t\t&& site_dispatch_compare_versions( $php_has, $php_needs ) >= 0\n', '\t\t&& site_dispatch_compare_versions( $php_has, $php_needs ) > 0\n', 'exactly the required PHP version is not enough' ),
	php( MA( 'test_version_strings_with_a_vendor_suffix_are_read_by_their_numbers' ), VERIFY, "\tif ( 1 !== preg_match( '/^([0-9]+)(?:\\.([0-9]+))?(?:\\.([0-9]+))?/', $version, $hit ) ) {", "\tif ( 1 !== preg_match( '/^([0-9]+)(?:\\.([0-9]+))?(?:\\.([0-9]+))?\\z/', $version, $hit ) ) {", 'version parts anchored at the end, vendor suffixes fail' ),
	php( MA( 'test_unreadable_running_versions_are_rejected' ), VERIFY, '\t$php_has   = site_dispatch_version_parts( $php );', '\t$php_has   = site_dispatch_version_parts( $php ) ?? site_dispatch_version_parts( PHP_VERSION );', 'unreadable running PHP version falls back to the constant' ),
	php( MA( 'test_foreign_slug_is_rejected' ), VERIFY, "\tif ( SITE_DISPATCH_SLUG !== ( $m['slug'] ?? null ) ) {\n\t\treturn false;\n\t}\n", '', 'slug not checked before acceptance' ),
	php( MA( 'test_array_that_is_not_a_manifest_is_rejected' ), VERIFY, "\tif ( SITE_DISPATCH_SLUG !== ( $m['slug'] ?? null ) ) {", "\tif ( SITE_DISPATCH_SLUG !== $m['slug'] ) {", 'missing key read without ??, a bare array raises a warning' ),

	// ----- ParseManifestTest -----
	php( PM( 'test_valid_manifest_returns_exactly_the_seven_fields' ), VERIFY, "\t\t'requires_wp'  => $requires_wp,\n\t\t'requires_php' => $requires_php,\n\t);", "\t\t'requires_wp'  => $requires_php,\n\t\t'requires_php' => $requires_wp,\n\t);", 'requires_wp and requires_php swapped in the result' ),
	php( PM( 'test_manifest_vector_from_the_protocol_parses' ), VERIFY, SHA_CHECK, "\tif ( 1 !== preg_match( '/^[0-9a-e]{128}\\z/', $sha512 ) ) {", 'hex character class typo, f missing' ),
	php( PM( 'test_text_that_is_not_json_is_rejected' ), VERIFY, '\t$data = json_decode( $manifest_bytes, false, 2 );\n\tif ( ! $data instanceof \\stdClass ) {\n\t\treturn null;\n\t}', '\t$data = json_decode( $manifest_bytes, false, 2 );', 'type guard removed, get_object_vars on null' ),
	php( PM( 'test_json_list_instead_of_object_is_rejected' ), VERIFY, '\t$data = json_decode( $manifest_bytes, false, 2 );\n\tif ( ! $data instanceof \\stdClass ) {', '\t$data = json_decode( $manifest_bytes, false, 2 );\n\tif ( null === $data ) {', 'only a failed decode refused, a list reaches get_object_vars' ),
	php( PM( 'test_missing_field_is_rejected' ), VERIFY, NAMES_CHECK, "\tif ( array_diff( $names, array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ) ) ) {", 'unknown names refused, missing ones tolerated' ),
	php( PM( 'test_additional_field_is_rejected' ), VERIFY, NAMES_CHECK, "\tif ( array_diff( array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ), $names ) ) {", 'required names present, extras ignored' ),
	php( PM( 'test_foreign_slug_is_rejected' ), VERIFY, "\tif ( 1 !== $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {", "\tif ( 1 !== $fields['schema'] ) {", 'slug not checked in the parser' ),
	php( PM( 'test_version_with_two_parts_is_rejected' ), VERIFY, VERSION_PATTERN, VP( '/^[0-9]+\\.[0-9]+(\\.[0-9]+)?\\z/' ), 'third version part optional' ),
	php( PM( 'test_version_with_suffix_is_rejected' ), VERIFY, VERSION_PATTERN, VP( '/^[0-9]+\\.[0-9]+\\.[0-9]+(-[a-z0-9.]+)?\\z/' ), 'pre-release suffix allowed' ),
	php( PM( 'test_version_with_trailing_newline_is_rejected' ), VERIFY, VERSION_PATTERN, VP( '/^[0-9]+\\.[0-9]+\\.[0-9]+$/' ), '$ instead of \\z, a trailing newline passes' ),
	php( PM( 'test_zip_with_parent_path_is_rejected' ), VERIFY, ZIP_CHECK, "\tif ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== basename( $zip ) ) {\n\t\treturn null;\n\t}\n" + SHA_CHECK, 'base name of the zip compared' ),
	php( PM( 'test_zip_as_url_is_rejected' ), VERIFY, ZIP_CHECK, "\tif ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== substr( $zip, -strlen( SITE_DISPATCH_SLUG . '-' . $version . '.zip' ) ) ) {\n\t\treturn null;\n\t}\n" + SHA_CHECK, 'suffix of the zip name compared' ),
	php( PM( 'test_zip_without_version_is_rejected' ), VERIFY, ZIP_CHECK, "\tif ( 1 !== preg_match( '/^site-dispatch(-[0-9.]+)?\\.zip\\z/', $zip ) ) {\n\t\treturn null;\n\t}\n" + SHA_CHECK, 'version in the zip name optional' ),
	php( PM( 'test_zip_with_another_version_is_rejected' ), VERIFY, ZIP_CHECK, "\tif ( 1 !== preg_match( '/^site-dispatch-[0-9]+\\.[0-9]+\\.[0-9]+\\.zip\\z/', $zip ) ) {\n\t\treturn null;\n\t}\n" + SHA_CHECK, 'zip name pattern without the tie to the version' ),
	php( PM( 'test_sha512_that_is_too_short_is_rejected' ), VERIFY, SHA_CHECK, "\tif ( 1 !== preg_match( '/^[0-9a-f]{64,128}\\z/', $sha512 ) ) {", 'lower bound of the hash length loosened' ),
	php( PM( 'test_sha512_in_upper_case_is_rejected' ), VERIFY, SHA_CHECK, "\tif ( 1 !== preg_match( '/^[0-9a-f]{128}\\z/i', $sha512 ) ) {", 'hash accepted in either case' ),
	php( PM( 'test_manifest_of_9_kb_is_rejected' ), VERIFY, 'const SITE_DISPATCH_MANIFEST_MAX_BYTES = 8192;', 'const SITE_DISPATCH_MANIFEST_MAX_BYTES = 8192 * 1024;', 'KB/MB slip' ),
	php( PM( 'test_manifest_of_exactly_8_kb_is_accepted' ), VERIFY, '\tif ( 0 === $length || $length > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {', '\tif ( 0 === $length || $length >= SITE_DISPATCH_MANIFEST_MAX_BYTES ) {', 'off-by-one on the size limit' ),
	php( PM( 'test_schema_as_text_is_rejected' ), VERIFY, "\tif ( 1 !== $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {", "\tif ( 1 != $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {", 'loose comparison on schema' ),
	phpEdits( PM( 'test_nested_value_is_rejected' ), 'default decode depth and no type guard, a nested value reaches preg_match (two layers)', [
		{ file: VERIFY, search: '\t$data = json_decode( $manifest_bytes, false, 2 );', replace: '\t$data = json_decode( $manifest_bytes );' },
		{ file: VERIFY, search: '\tif ( ! is_string( $version ) || ! is_string( $zip ) || ! is_string( $sha512 ) || ! is_string( $requires_wp ) || ! is_string( $requires_php ) ) {\n\t\treturn null;\n\t}\n', replace: '' },
	] ),

	// ----- ReportHelpersTest -----
	php( RH( 'test_signature_header_matches_the_protocol_vector' ), REPORT, "\treturn 'sha256=' . hash_hmac( 'sha256', $body, $site_key );", "\treturn 'sha256=' . hash_hmac( 'sha256', $site_key, $body );", 'data and key arguments swapped' ),
	php( RH( 'test_iso_formats_utc_and_gives_null_for_zero' ), REPORT, "\treturn $timestamp > 0 ? gmdate( 'Y-m-d\\TH:i:s\\Z', $timestamp ) : null;", "\treturn $timestamp >= 0 ? gmdate( 'Y-m-d\\TH:i:s\\Z', $timestamp ) : null;", 'zero formatted as a date instead of never' ),
	php( RH( 'test_pick_copies_only_the_named_fields' ), REPORT, '\tforeach ( $keys as $key ) {\n\t\t$value = $source[ $key ] ?? null;', '\tforeach ( array_keys( $source ) as $key ) {\n\t\t$value = $source[ $key ] ?? null;', 'every field of the source copied' ),
	php( RH( 'test_pick_drops_empty_text_lists_and_booleans' ), REPORT, PICK_COND, "is_scalar( $value ) && '' !== (string) $value", 'booleans allowed through' ),
	php( RH( 'test_pick_takes_arrays_and_objects_alike' ), REPORT, '\tif ( is_object( $source ) ) {\n\t\t$source = get_object_vars( $source );\n\t}\n\tif ( ! is_array( $source ) ) {', '\tif ( ! is_array( $source ) ) {', 'objects no longer converted' ),
	php( RH( 'test_pick_gives_nothing_for_a_value_that_is_no_list' ), REPORT, '\tif ( is_object( $source ) ) {\n\t\t$source = get_object_vars( $source );\n\t}', '\t$source = get_object_vars( $source );', 'object conversion without the type check' ),
	php( RH( 'test_server_software_keeps_name_and_version' ), REPORT, SERVER_PATTERN, SP( '/^[A-Za-z][A-Za-z0-9_-]{0,31}(\\/[0-9][0-9.]{0,3})?\\z/' ), 'version part limited to four characters' ),
	php( RH( 'test_server_software_cuts_everything_after_the_version' ), REPORT, '\t$token   = (string) substr( $raw, 0, strspn( $raw, $allowed ) );', '\t$token   = $raw;', 'not cut at the first foreign character' ),
	php( RH( 'test_server_software_without_version_keeps_the_name' ), REPORT, SERVER_PATTERN, SP( '/^[A-Za-z][A-Za-z0-9_-]{0,31}(\\/[0-9][0-9.]{0,15})\\z/' ), 'version part required' ),
	php( RH( 'test_server_software_with_a_strange_version_keeps_the_name' ), REPORT, "\treturn site_dispatch_clean( (string) substr( $token, 0, strcspn( $token, '/' ) ), SITE_DISPATCH_SERVER_PATTERN );", '\treturn null;', 'no fallback to the bare name' ),
	php( RH( 'test_server_software_with_a_path_is_dropped' ), REPORT, SERVER_PATTERN, SP( '/^[A-Za-z\\/][A-Za-z0-9_\\/-]{0,31}(\\/[0-9][0-9.]{0,15})?\\z/' ), 'slashes allowed in the name' ),
	php( RH( 'test_server_software_cuts_at_a_line_break' ), REPORT, "\t$allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./';", "\t$allowed = \"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./ \\n\";", 'whitespace allowed in the token' ),
	php( RH( 'test_clean_refuses_a_trailing_newline' ), REPORT, '\treturn is_string( $value ) && 1 === preg_match( $pattern, $value ) ? $value : null;', '\treturn is_string( $value ) && 1 === preg_match( $pattern, trim( $value ) ) ? $value : null;', 'value trimmed for the check only' ),
	php( RH( 'test_clean_takes_whole_numbers_as_text' ), REPORT, '\tif ( is_int( $value ) ) {\n\t\t$value = (string) $value;\n\t}\n', '', 'whole numbers no longer taken' ),
	php( RH( 'test_clean_refuses_values_that_are_not_text' ), REPORT, '\tif ( is_int( $value ) ) {\n\t\t$value = (string) $value;\n\t}', '\tif ( is_numeric( $value ) ) {\n\t\t$value = (string) (int) $value;\n\t}', 'floats rounded to whole numbers' ),
	php( RH( 'test_core_auto_updates_off_when_the_updater_is_disabled' ), REPORT, '\tif ( $updater_disabled || false === $constant ) {', '\tif ( false === $constant ) {', 'AUTOMATIC_UPDATER_DISABLED ignored' ),
	php( RH( 'test_core_auto_updates_follows_the_constant' ), REPORT, "\tif ( 'minor' === $constant ) {\n\t\treturn 'minor';\n\t}\n", '', 'minor setting reported as all' ),
	php( RH( 'test_core_auto_updates_without_constant_follows_the_option' ), REPORT, "\treturn 'enabled' === $major_option ? 'all' : 'minor';", "\treturn 'minor';", 'option ignored' ),

	// ----- ResponsesTest -----
	php( RS( 'test_valid_request_response_is_parsed' ), RESP, "\t\t'user_code'  => $user_code,\n\t);", "\t\t'code'       => $user_code,\n\t);", 'result key renamed' ),
	php( RS( 'test_valid_redeem_response_is_parsed' ), RESP, "\t\t'key_version' => $key_version,", "\t\t'key_version' => (string) $key_version,", 'key version returned as text' ),
	php( RS( 'test_key_of_63_characters_is_rejected' ), RESP, "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/', $site_key ) ) {", "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{32,64}\\z/', $site_key ) ) {", 'lower bound of the key length loosened' ),
	php( RS( 'test_key_of_65_characters_is_rejected' ), RESP, "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/', $site_key ) ) {", "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}/', $site_key ) ) {", 'end anchor missing on the key pattern' ),
	php( RS( 'test_upper_case_in_the_key_is_rejected' ), RESP, "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/', $site_key ) ) {", "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/i', $site_key ) ) {", 'key accepted in either case' ),
	php( RS( 'test_key_version_as_text_is_rejected' ), RESP, '\tif ( ! is_int( $key_version ) || $key_version < 1 ) {\n\t\treturn null;\n\t}\n\tif ( ! is_string( $website_id )', '\tif ( ! is_numeric( $key_version ) || $key_version < 1 ) {\n\t\treturn null;\n\t}\n\tif ( ! is_string( $website_id )', 'numeric text accepted as version' ),
	php( RS( 'test_key_version_that_is_not_a_positive_integer_is_rejected' ), RESP, '\tif ( ! is_int( $key_version ) || $key_version < 1 ) {\n\t\treturn null;\n\t}\n\tif ( ! is_string( $website_id )', '\tif ( ! is_int( $key_version ) || $key_version < 0 ) {\n\t\treturn null;\n\t}\n\tif ( ! is_string( $website_id )', 'version zero accepted' ),
	php( RS( 'test_website_id_that_is_no_uuid_is_rejected' ), RESP, UUID_PATTERN, "const SITE_DISPATCH_UUID_PATTERN       = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\z/i';", 'UUID accepted in upper case' ),
	php( RS( 'test_additional_fields_are_dropped_from_a_redeem_response' ), RESP, REDEEM_RETURN, '\treturn $fields;', 'decoded fields returned as they are' ),
	php( RS( 'test_additional_fields_are_dropped_from_a_request_response' ), RESP, REQUEST_RETURN, '\treturn $fields;', 'decoded fields returned as they are' ),
	php( RS( 'test_response_of_5_kb_is_rejected' ), RESP, 'const SITE_DISPATCH_RESPONSE_MAX_BYTES = 4096;', 'const SITE_DISPATCH_RESPONSE_MAX_BYTES = 4096 * 4;', 'limit raised to 16 KB' ),
	php( RS( 'test_html_instead_of_json_is_rejected' ), RESP, DECODE_GUARD, '\t$fields = array();', 'type guard removed, get_object_vars on null' ),
	php( RS( 'test_json_list_instead_of_object_is_rejected' ), RESP, DECODE_GUARD, '\tif ( null === $data ) {\n\t\treturn null;\n\t}\n\t$fields = array();', 'only a failed decode refused, a list reaches get_object_vars' ),
	php( RS( 'test_response_without_ok_true_is_rejected' ), RESP, "\tif ( true !== ( $fields['ok'] ?? null ) ) {", "\tif ( empty( $fields['ok'] ) ) {", 'any truthy ok accepted' ),
	phpEdits( RS( 'test_pending_response_is_not_a_redeem' ), 'ok not checked and the key read without ??, a pending answer raises a warning (two layers)', [
		{ file: RESP, search: "\tif ( true !== ( $fields['ok'] ?? null ) ) {\n\t\treturn null;\n\t}\n", replace: '' },
		{ file: RESP, search: "\t$site_key    = $fields['site_key'] ?? null;", replace: "\t$site_key    = $fields['site_key'];" },
	] ),
	php( RS( 'test_user_code_with_a_look_alike_character_is_rejected' ), RESP, "\tif ( ! is_string( $user_code ) || 1 !== preg_match( '/^[A-HJ-NP-Z2-9]{8}\\z/', $user_code ) ) {", "\tif ( ! is_string( $user_code ) || 1 !== preg_match( '/^[A-Z0-9]{8}\\z/', $user_code ) ) {", 'full alphabet allowed in the user code' ),
	php( RS( 'test_request_id_that_is_no_uuid_is_rejected' ), RESP, UUID_PATTERN, "const SITE_DISPATCH_UUID_PATTERN       = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';", '$ instead of \\z, a trailing newline passes' ),

	// ----- UpdaterTest: keys -----
	php( U( 'test_keys_two_valid_keys_are_decoded' ), UPD, '\t\t$keys[] = $raw;', '\t\t$keys[] = $entry;', 'base64 text stored instead of the raw key' ),
	php( U( 'test_keys_the_built_in_keys_decode' ), UPD, '\t\tif ( ! is_string( $raw ) || 32 !== strlen( $raw ) ) {', '\t\tif ( ! is_string( $raw ) || 32 !== strlen( $entry ) ) {', 'length checked on the text instead of the bytes' ),
	php( U( 'test_keys_one_key_of_31_bytes_empties_the_list' ), UPD, '\t\tif ( ! is_string( $raw ) || 32 !== strlen( $raw ) ) {', '\t\tif ( ! is_string( $raw ) || strlen( $raw ) > 32 ) {', 'only too long keys refused' ),
	php( U( 'test_keys_text_that_is_not_base64_empties_the_list' ), UPD, '\t\tif ( ! is_string( $raw ) || 32 !== strlen( $raw ) ) {\n\t\t\treturn array();\n\t\t}', '\t\tif ( ! is_string( $raw ) || 32 !== strlen( $raw ) ) {\n\t\t\tcontinue;\n\t\t}', 'faulty entries skipped instead of emptying the list' ),
	php( U( 'test_keys_empty_list_stays_empty' ), UPD, '\tforeach ( $encoded as $entry ) {', '\tforeach ( $encoded ?: SITE_DISPATCH_PUBLIC_KEYS as $entry ) {', 'empty list falls back to the built-in keys' ),
	php( U( 'test_keys_entry_that_is_not_text_empties_the_list' ), UPD, '\t\tif ( ! is_string( $entry ) ) {\n\t\t\treturn array();\n\t\t}', '\t\tif ( ! is_string( $entry ) ) {\n\t\t\tcontinue;\n\t\t}', 'non-text entries skipped' ),

	// ----- UpdaterTest: redirect targets -----
	php( U( 'test_redirect_https_address_is_taken' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[A-Za-z0-9._\\/-]*\\z/' ), 'query characters refused' ),
	php( U( 'test_redirect_port_443_is_taken' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'explicit port 443 refused' ),
	php( UD( 'test_redirect_is_refused', 'http' ), UPD, URL_PATTERN, UP( '/^https?:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'http allowed' ),
	php( UD( 'test_redirect_is_refused', 'relative' ), UPD, REDIRECT_RETURN, "\tif ( 0 === strpos( $location, '/' ) && 0 !== strpos( $location, '//' ) ) {\n\t\t$location = 'https://github.com' . $location;\n\t}\n" + REDIRECT_RETURN, 'relative redirects resolved against GitHub' ),
	php( UD( 'test_redirect_is_refused', 'protocol relative' ), UPD, REDIRECT_RETURN, "\tif ( 0 === strpos( $location, '//' ) ) {\n\t\t$location = 'https:' . $location;\n\t}\n" + REDIRECT_RETURN, 'protocol relative redirects resolved' ),
	php( UD( 'test_redirect_is_refused', 'user in the address' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/(?:[a-z0-9]+@)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'user part allowed' ),
	php( UD( 'test_redirect_is_refused', 'port 8443' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::[0-9]{1,5})?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'any port allowed' ),
	php( UD( 'test_redirect_is_refused', 'upper case host' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'upper case host allowed' ),
	php( UD( 'test_redirect_is_refused', 'ip literal v6' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/(?:\\[[0-9a-f:]+\\]|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'IPv6 literal allowed' ),
	php( UD( 'test_redirect_is_refused', 'no path' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?(?:\\/[\\x21-\\x5b\\x5d-\\x7e]*)?\\z/' ), 'path optional' ),
	php( UD( 'test_redirect_is_refused', 'space' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x20-\\x5b\\x5d-\\x7e]*\\z/' ), 'space allowed in the path' ),
	php( UD( 'test_redirect_is_refused', 'line break at end' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*$/' ), '$ instead of \\z' ),
	php( UD( 'test_redirect_is_refused', 'line break inside' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[^\\\\\\\\]*\\z/' ), 'printable class replaced by not-backslash' ),
	php( UD( 'test_redirect_is_refused', 'too long' ), UPD, '\tif ( strlen( $location ) > SITE_DISPATCH_URL_MAX_LENGTH ) {\n\t\treturn null;\n\t}\n', '', 'length limit dropped' ),
	php( UD( 'test_redirect_is_refused', 'empty' ), UPD, REDIRECT_RETURN, '\treturn false !== preg_match( SITE_DISPATCH_URL_PATTERN, $location ) ? $location : null;', 'error check instead of match check on preg_match' ),
	php( UD( 'test_redirect_is_refused', 'other scheme' ), UPD, URL_PATTERN, UP( '/^[a-z]+:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'any scheme allowed' ),
	php( UD( 'test_redirect_is_refused', 'upper case scheme' ), UPD, URL_PATTERN, UP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/i' ), 'case-insensitive address pattern' ),
	php( UD( 'test_redirect_is_refused', 'backslash after host' ), UPD, REDIRECT_RETURN, "\t$location = str_replace( '\\\\', '/', $location );\n" + REDIRECT_RETURN, 'backslashes normalised to slashes' ),
	php( U( 'test_redirect_address_of_4096_characters_is_taken' ), UPD, '\tif ( strlen( $location ) > SITE_DISPATCH_URL_MAX_LENGTH ) {', '\tif ( strlen( $location ) >= SITE_DISPATCH_URL_MAX_LENGTH ) {', 'off-by-one on the length limit' ),

	// ----- UpdaterTest: release addresses -----
	php( U( 'test_url_of_manifest_and_signature' ), UPD, "\treturn $base . '/releases/latest/download/' . $file;", "\treturn $base . '/releases/latest/downloads/' . $file;", 'path typo' ),
	php( U( 'test_url_of_another_file_is_refused' ), UPD, "\tif ( 'manifest.json' !== $file && 'manifest.json.sig' !== $file ) {\n\t\treturn null;\n\t}\n", '', 'file name not restricted' ),
	php( UD( 'test_url_with_a_bad_base_is_refused', 'http' ), UPD, BASE_PATTERN, BP( '/^https?:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)+\\z/' ), 'http base allowed' ),
	php( UD( 'test_url_with_a_bad_base_is_refused', 'trailing slash' ), UPD, BASE_PATTERN, BP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)+\\/?\\z/' ), 'trailing slash allowed' ),
	php( UD( 'test_url_with_a_bad_base_is_refused', 'query' ), UPD, BASE_PATTERN, BP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)+(?:\\?[^\\s]*)?\\z/' ), 'query allowed' ),
	php( UD( 'test_url_with_a_bad_base_is_refused', 'no path' ), UPD, BASE_PATTERN, BP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)*\\z/' ), 'path optional' ),
	php( UD( 'test_url_with_a_bad_base_is_refused', 'line break' ), UPD, BASE_PATTERN, BP( '/^https:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)+$/' ), '$ instead of \\z' ),
	php( UD( 'test_url_with_a_bad_base_is_refused', 'empty' ), UPD, "\tif ( 1 !== preg_match( SITE_DISPATCH_BASE_PATTERN, $base ) ) {\n\t\treturn null;\n\t}\n\tif ( 'manifest.json' !== $file", "\tif ( false === preg_match( SITE_DISPATCH_BASE_PATTERN, $base ) ) {\n\t\treturn null;\n\t}\n\tif ( 'manifest.json' !== $file", 'error check instead of match check on preg_match' ),
	php( U( 'test_url_of_the_zip_comes_from_version_and_name' ), UPD, "\treturn $base . '/releases/download/v' . $version . '/' . $zip;", "\treturn $base . '/releases/download/' . $version . '/' . $zip;", 'tag prefix v forgotten' ),
	php( U( 'test_url_of_a_foreign_zip_name_is_refused' ), UPD, "\tif ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== $zip ) {\n\t\treturn null;\n\t}\n\treturn $base . '/releases/download/v'", "\treturn $base . '/releases/download/v'", 'zip name not tied to the version' ),

	// ----- UpdaterTest: verdict -----
	php( U( 'test_judge_valid_with_key_a' ), VERIFY, '\t\tforeach ( $keys as $key ) {\n\t\t\tif ( sodium', '\t\tforeach ( array_slice( $keys, 1 ) as $key ) {\n\t\t\tif ( sodium', 'first key skipped' ),
	php( U( 'test_judge_valid_with_key_b' ), VERIFY, '\t\tforeach ( $keys as $key ) {\n\t\t\tif ( sodium', '\t\tforeach ( array_slice( $keys, 0, 1 ) as $key ) {\n\t\t\tif ( sodium', 'only the first key checked' ),
	php( U( 'test_judge_unknown_key' ), UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && null === site_dispatch_parse_manifest( $manifest_bytes ) ) {\n\t\treturn 'invalid';\n\t}", 'a readable manifest is trusted without a signature' ),
	php( U( 'test_judge_flipped_bit_in_the_manifest' ), UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) ) {\n\t\treturn 'not_newer';\n\t}", 'bad signature reported as not newer, which deletes a waiting update' ),
	php( U( 'test_judge_flipped_bit_in_the_signature' ), UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && 64 !== strlen( $sig_raw ) ) {\n\t\treturn 'invalid';\n\t}", 'a signature of the right length is trusted' ),
	php( U( 'test_judge_signature_of_63_and_65_bytes' ), UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && '' === $sig_raw ) {\n\t\treturn 'invalid';\n\t}", 'only an empty signature is fatal' ),
	php( U( 'test_judge_signature_for_the_namespace_git' ), VERIFY, "\t$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $message, true ) );", "\t$fields = array( '', '', 'sha512', hash( 'sha512', $message, true ) );", 'namespace left out of the signed blob' ),
	php( U( 'test_judge_empty_key_list' ), VERIFY, VERIFY_GUARD, '\tif ( 64 !== strlen( $sig_raw ) ) {\n\t\treturn false;\n\t}\n\tif ( array() === $pubkeys_raw ) {\n\t\treturn true;\n\t}', 'fail open without keys' ),
	php( U( 'test_judge_signed_manifest_with_an_extra_field' ), VERIFY, NAMES_CHECK, "\tif ( array_diff( array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ), $names ) ) {", 'extra manifest fields ignored' ),
	php( U( 'test_judge_signed_manifest_with_a_foreign_slug' ), VERIFY, "\tif ( 1 !== $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {", "\tif ( 1 !== $fields['schema'] ) {", 'slug not checked in the parser' ),
	php( U( 'test_judge_signed_manifest_with_a_path_as_zip' ), VERIFY, ZIP_CHECK, "\tif ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== basename( $zip ) ) {\n\t\treturn null;\n\t}\n" + SHA_CHECK, 'base name of the zip compared' ),
	php( U( 'test_judge_same_version' ), UPD, JUDGE_NEWER, "\tif ( site_dispatch_compare_versions( $offered, $current ) < 0 ) {\n\t\treturn 'not_newer';\n\t}", 'same version not refused by the verdict' ),
	php( U( 'test_judge_lower_version' ), UPD, JUDGE_NEWER, "\tif ( 0 === site_dispatch_compare_versions( $offered, $current ) ) {\n\t\treturn 'not_newer';\n\t}", 'only the same version refused' ),
	php( U( 'test_judge_compares_numbers_not_text' ), VERIFY, COMPARE_BODY, '\t\t$d = strcmp( $a, $b ) <=> 0;', 'versions compared as text' ),
	php( U( 'test_judge_php_too_old' ), VERIFY, ACCEPT_RETURN, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n\t\t&& site_dispatch_compare_versions( $wp_has, $wp_needs ) >= 0;', 'PHP minimum not checked' ),
	php( U( 'test_judge_wordpress_too_old' ), VERIFY, ACCEPT_RETURN, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n\t\t&& site_dispatch_compare_versions( $php_has, $php_needs ) >= 0;', 'WordPress minimum not checked' ),
	php( U( 'test_judge_installed_version_without_form' ), UPD, "\tif ( null === $manifest || 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $installed ) ) {\n\t\treturn 'invalid';\n\t}", "\tif ( null === $manifest ) {\n\t\treturn 'invalid';\n\t}", 'installed version not checked for its form' ),

	// ----- UpdaterTest: stored update -----
	php( U( 'test_stored_valid_option_is_read' ), UPD, "\t\t'manifest'   => $manifest_bytes,\n\t\t'sig'        => $sig_raw,", "\t\t'manifest'   => $manifest,\n\t\t'sig'        => $sig_raw,", 'base64 text returned instead of the manifest bytes' ),
	phpEdits( UD( 'test_stored_damaged_option_is_refused', 'not an array' ), 'array guard removed and a key read without ??, a text option raises a TypeError (two layers)', [
		{ file: UPD, search: '\tif ( ! is_array( $raw ) ) {\n\t\treturn null;\n\t}\n\t$manifest   = $raw[\'manifest\'] ?? null;', replace: "\t$manifest   = $raw['manifest'];" },
	] ),
	phpEdits( UD( 'test_stored_damaged_option_is_refused', 'null' ), 'array guard removed and a key read without ??, a null option raises a warning (two layers)', [
		{ file: UPD, search: '\tif ( ! is_array( $raw ) ) {\n\t\treturn null;\n\t}\n', replace: '' },
		{ file: UPD, search: "\t$version    = $raw['version'] ?? null;", replace: "\t$version    = $raw['version'];" },
	] ),
	php( UD( 'test_stored_damaged_option_is_refused', 'missing signature' ), UPD, "\t$sig        = $raw['sig'] ?? null;", "\t$sig        = $raw['sig'];", 'key read without ??, a missing signature raises a warning' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'manifest not base64' ), UPD, '\t$manifest_bytes = base64_decode( $manifest, true );', '\t$manifest_bytes = base64_decode( $manifest, true ) ?: $manifest;', 'undecodable text kept as it is' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'empty manifest' ), UPD, "\tif ( ! is_string( $manifest_bytes ) || '' === $manifest_bytes || strlen( $manifest_bytes ) > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {", '\tif ( ! is_string( $manifest_bytes ) || strlen( $manifest_bytes ) > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {', 'empty manifest accepted' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'manifest of 9 kb' ), UPD, "\tif ( ! is_string( $manifest_bytes ) || '' === $manifest_bytes || strlen( $manifest_bytes ) > SITE_DISPATCH_MANIFEST_MAX_BYTES ) {", "\tif ( ! is_string( $manifest_bytes ) || '' === $manifest_bytes || strlen( $manifest_bytes ) > SITE_DISPATCH_MANIFEST_MAX_BYTES * 2 ) {", 'stored manifest limit doubled' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'signature of 63 bytes' ), UPD, '\tif ( ! is_string( $sig_raw ) || SITE_DISPATCH_SIG_BYTES !== strlen( $sig_raw ) ) {', '\tif ( ! is_string( $sig_raw ) || strlen( $sig_raw ) > SITE_DISPATCH_SIG_BYTES ) {', 'only too long signatures refused' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'version without form' ), UPD, '\tif ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) || $first_seen < 0 ) {', '\tif ( $first_seen < 0 ) {', 'stored version not checked for its form' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'first seen as text' ), UPD, '\tif ( ! is_string( $manifest ) || ! is_string( $sig ) || ! is_string( $version ) || ! is_int( $first_seen ) ) {', '\tif ( ! is_string( $manifest ) || ! is_string( $sig ) || ! is_string( $version ) || ! is_numeric( $first_seen ) ) {', 'numeric text accepted as time stamp' ),
	php( UD( 'test_stored_damaged_option_is_refused', 'first seen negative' ), UPD, '\tif ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) || $first_seen < 0 ) {', '\tif ( 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) ) {', 'negative time stamp accepted' ),

	// ----- UpdaterTest: next update -----
	php( U( 'test_next_failed_fetch_keeps_the_stored_update' ), UPD, "\tif ( 'ok' !== $fetch ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", "\tif ( 'ok' !== $fetch ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", 'a failed fetch deletes the waiting update' ),
	php( U( 'test_next_unknown_fetch_result_keeps_the_stored_update' ), UPD, "\tif ( 'ok' !== $fetch ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", "\tif ( 'failed' === $fetch ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", 'only the known failure keeps, anything else goes on' ),
	php( U( 'test_next_missing_release_deletes' ), UPD, "\tif ( 'gone' === $fetch ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", "\tif ( 'gone' === $fetch ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", 'a deleted release keeps the waiting update' ),
	php( U( 'test_next_invalid_release_keeps_the_stored_update' ), UPD, "\tif ( 'ok' !== $verdict ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", "\tif ( 'ok' !== $verdict ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", 'an invalid signature cancels the waiting update' ),
	php( U( 'test_next_release_that_is_not_newer_deletes' ), UPD, "\tif ( 'not_newer' === $verdict || 'unfit' === $verdict ) {", "\tif ( 'unfit' === $verdict ) {", 'not newer no longer deletes' ),
	php( U( 'test_next_release_that_does_not_fit_deletes' ), UPD, "\tif ( 'not_newer' === $verdict || 'unfit' === $verdict ) {", "\tif ( 'not_newer' === $verdict ) {", 'unfit no longer deletes' ),
	php( U( 'test_next_same_release_keeps_first_seen' ), UPD, NEXT_SAME, '', 'every check stores again and restarts the clock' ),
	php( U( 'test_next_first_release_is_stored_with_the_local_time' ), UPD, "\t\t\t'first_seen' => $now,", "\t\t\t'first_seen' => time(),", 'wall clock instead of the given time' ),
	php( U( 'test_next_new_version_starts_the_clock_again' ), UPD, NEXT_SAME, "\tif ( null !== $stored ) {\n\t\treturn array( 'action' => 'keep' );\n\t}\n", 'any stored update is kept, a new version never arrives' ),
	php( U( 'test_next_other_bytes_for_the_same_version_start_the_clock_again' ), UPD, "\tif ( null !== $stored && ( $stored['manifest'] ?? null ) === $manifest_bytes && ( $stored['version'] ?? null ) === $manifest['version'] ) {", "\tif ( null !== $stored && ( $stored['version'] ?? null ) === $manifest['version'] ) {", 'manifest bytes not compared, only the version' ),
	php( U( 'test_next_manifest_that_does_not_parse_keeps' ), UPD, "\t$manifest = site_dispatch_parse_manifest( $manifest_bytes );\n\tif ( null === $manifest ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", "\t$manifest = site_dispatch_parse_manifest( $manifest_bytes );\n\tif ( null === $manifest ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", 'an unreadable manifest deletes' ),

	// ----- UpdaterTest: waiting period -----
	php( U( 'test_due_not_before_72_hours' ), UPD, 'const SITE_DISPATCH_UPDATE_DELAY   = 259200;', 'const SITE_DISPATCH_UPDATE_DELAY   = 25920;', 'digit lost in the delay' ),
	php( U( 'test_due_at_72_hours' ), UPD, DUE_RETURN, '\treturn $first_seen <= $now && $now - $first_seen > SITE_DISPATCH_UPDATE_DELAY;', 'off-by-one at exactly 72 hours' ),
	php( U( 'test_due_at_once_with_the_switch' ), UPD, '\tif ( $early ) {\n\t\treturn true;\n\t}\n', '', 'switch for immediate updates ignored' ),
	php( U( 'test_due_first_seen_in_the_future_waits' ), UPD, DUE_RETURN, '\treturn $first_seen > $now || $now - $first_seen >= SITE_DISPATCH_UPDATE_DELAY;', 'a stamp in the future counts as due' ),

	// ----- UpdaterTest: names inside the zip -----
	php( U( 'test_names_good_list' ), UPD, "\t\tif ( $prefix . SITE_DISPATCH_SLUG . '.php' === $name ) {", "\t\tif ( $prefix . 'plugin.php' === $name ) {", 'main file name slip' ),
	php( UD( 'test_names_are_refused', 'empty list' ), UPD, '\treturn $main;\n}\n\n/**\n * Plugin file as WordPress names it', '\treturn $main || array() === $names;\n}\n\n/**\n * Plugin file as WordPress names it', 'an empty archive passes' ),
	php( UD( 'test_names_are_refused', 'without the main file' ), UPD, '\treturn $main;\n}\n\n/**\n * Plugin file as WordPress names it', '\treturn true;\n}\n\n/**\n * Plugin file as WordPress names it', 'main file presence not checked' ),
	php( UD( 'test_names_are_refused', 'second top folder' ), UPD, NAMES_PREFIX, "\t\tif ( ! is_string( $name ) || false === strpos( $name, '/' ) ) {\n\t\t\treturn false;\n\t\t}", 'any folder accepted' ),
	php( UD( 'test_names_are_refused', 'file on top level' ), UPD, NAMES_PREFIX, "\t\tif ( ! is_string( $name ) || ( 0 !== strpos( $name, $prefix ) && false !== strpos( $name, '/' ) ) ) {\n\t\t\treturn false;\n\t\t}", 'top level files tolerated' ),
	php( UD( 'test_names_are_refused', 'folder with suffix' ), UPD, NAMES_PREFIX, '\t\tif ( ! is_string( $name ) || 0 !== strpos( $name, SITE_DISPATCH_SLUG ) ) {\n\t\t\treturn false;\n\t\t}', 'prefix compared without the slash' ),
	phpEdits( UD( 'test_names_are_refused', 'path up at the start' ), 'prefix and dot segments not checked (two layers)', [
		{ file: UPD, search: NAMES_PREFIX, replace: '\t\tif ( ! is_string( $name ) ) {\n\t\t\treturn false;\n\t\t}' },
		{ file: UPD, search: NAMES_PARTS, replace: "\t\t\tif ( '' === $part ) {" },
	] ),
	php( UD( 'test_names_are_refused', 'path up in the middle' ), UPD, NAMES_PARTS, "\t\t\tif ( '' === $part || '.' === $part ) {", 'parent segment not refused' ),
	php( UD( 'test_names_are_refused', 'path up at the end' ), UPD, "\t\tif ( '' === end( $parts ) ) {\n\t\t\tarray_pop( $parts );\n\t\t}", '\t\tarray_pop( $parts );', 'last segment always dropped as the file name' ),
	php( UD( 'test_names_are_refused', 'single dot' ), UPD, NAMES_PARTS, "\t\t\tif ( '' === $part || '..' === $part ) {", 'single dot segment not refused' ),
	php( UD( 'test_names_are_refused', 'double slash' ), UPD, NAMES_PARTS, "\t\t\tif ( '.' === $part || '..' === $part ) {", 'empty segment not refused' ),
	phpEdits( UD( 'test_names_are_refused', 'backslash' ), 'backslashes normalised for the prefix check and allowed by the pattern (two layers)', [
		{ file: UPD, search: NAMES_PREFIX, replace: "\t\tif ( ! is_string( $name ) || 0 !== strpos( str_replace( '\\\\', '/', $name ), $prefix ) ) {\n\t\t\treturn false;\n\t\t}" },
		{ file: UPD, search: NAMES_PATTERN, replace: "\t\tif ( 1 !== preg_match( '/^[\\x20-\\x7e]{1,512}\\z/', $name ) ) {" },
	] ),
	phpEdits( UD( 'test_names_are_refused', 'absolute path' ), 'leading slashes tolerated in the prefix check and when splitting (two layers)', [
		{ file: UPD, search: NAMES_PREFIX, replace: "\t\tif ( ! is_string( $name ) || 0 !== strpos( ltrim( $name, '/' ), $prefix ) ) {\n\t\t\treturn false;\n\t\t}" },
		{ file: UPD, search: "\t\t$parts = explode( '/', $name );", replace: "\t\t$parts = explode( '/', ltrim( $name, '/' ) );" },
	] ),
	php( UD( 'test_names_are_refused', 'drive letter' ), UPD, NAMES_PREFIX, '\t\tif ( ! is_string( $name ) || false === strpos( $name, $prefix ) ) {\n\t\t\treturn false;\n\t\t}', 'prefix found anywhere in the name' ),
	php( UD( 'test_names_are_refused', 'null byte' ), UPD, NAMES_PATTERN, "\t\tif ( 1 !== preg_match( '/^[^\\\\\\\\]{1,512}\\z/', $name ) ) {", 'printable class replaced by not-backslash' ),
	php( UD( 'test_names_are_refused', 'empty name' ), UPD, NAMES_PREFIX, '\t\tif ( ! is_string( $name ) || 0 !== strpos( $name, $prefix ) ) {\n\t\t\tcontinue;\n\t\t}', 'foreign entries skipped instead of refusing the archive' ),
	php( UD( 'test_names_are_refused', 'not text' ), UPD, NAMES_PREFIX, '\t\tif ( ! is_string( $name ) ) {\n\t\t\tcontinue;\n\t\t}\n\t\tif ( 0 !== strpos( $name, $prefix ) ) {\n\t\t\treturn false;\n\t\t}', 'non-text entries skipped' ),
	php( UD( 'test_names_are_refused', 'upper case folder' ), UPD, NAMES_PREFIX, '\t\tif ( ! is_string( $name ) || 0 !== stripos( $name, $prefix ) ) {\n\t\t\treturn false;\n\t\t}', 'case-insensitive prefix check' ),

	// ----- VerifySignatureTest -----
	php( VS( 'test_blob_matches_the_documented_vector' ), VERIFY, "\t\t$blob .= pack( 'N', strlen( $field ) ) . $field;", "\t\t$blob .= pack( 'V', strlen( $field ) ) . $field;", 'little endian length in the blob' ),
	php( VS( 'test_fixed_vector_from_the_protocol_verifies' ), VERIFY, "\t$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $message, true ) );", "\t$fields = array( $sig_namespace, '', 'sha512', hash( 'sha256', $message, true ) );", 'wrong hash over the message, the test keys still agree with themselves' ),
	php( VS( 'test_valid_signature_of_key_a_is_accepted' ), VERIFY, '\t\tforeach ( $keys as $key ) {\n\t\t\tif ( sodium', '\t\tforeach ( array_slice( $keys, 1 ) as $key ) {\n\t\t\tif ( sodium', 'first key skipped' ),
	php( VS( 'test_valid_signature_of_key_b_is_accepted' ), VERIFY, '\t\tforeach ( $keys as $key ) {\n\t\t\tif ( sodium', '\t\tforeach ( array_slice( $keys, 0, 1 ) as $key ) {\n\t\t\tif ( sodium', 'only the first key checked' ),
	php( VS( 'test_signature_of_a_foreign_key_is_rejected' ), VERIFY, '\t\t\tif ( sodium_crypto_sign_verify_detached( $sig_raw, $blob, $key ) ) {\n\t\t\t\t$valid = true;\n\t\t\t}', '\t\t\t$valid = true;\n\t\t\tsodium_crypto_sign_verify_detached( $sig_raw, $blob, $key );', 'result of the check thrown away' ),
	php( VS( 'test_one_flipped_bit_in_the_manifest_is_rejected' ), VERIFY, "\t$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $message, true ) );", "\t$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $sig_namespace, true ) );", 'blob hashes the namespace instead of the message' ),
	php( VS( 'test_one_flipped_bit_in_the_signature_is_rejected' ), VERIFY, '\t$valid = false;\n\ttry {', '\t$valid = true;\n\ttry {', 'verdict initialised as valid' ),
	phpEdits( VS( 'test_signature_of_63_bytes_is_rejected' ), 'length guard loosened and sodium exception no longer caught (two layers)', [
		{ file: VERIFY, search: VERIFY_GUARD, replace: '\tif ( strlen( $sig_raw ) > 64 || array() === $pubkeys_raw ) {\n\t\treturn false;\n\t}' },
		{ file: VERIFY, search: VERIFY_LOOP, replace: VERIFY_LOOP_NO_TRY },
	] ),
	phpEdits( VS( 'test_signature_of_65_bytes_is_rejected' ), 'length guard loosened and sodium exception no longer caught (two layers)', [
		{ file: VERIFY, search: VERIFY_GUARD, replace: '\tif ( strlen( $sig_raw ) < 64 || array() === $pubkeys_raw ) {\n\t\treturn false;\n\t}' },
		{ file: VERIFY, search: VERIFY_LOOP, replace: VERIFY_LOOP_NO_TRY },
	] ),
	php( VS( 'test_empty_key_list_is_rejected' ), VERIFY, VERIFY_GUARD, '\tif ( 64 !== strlen( $sig_raw ) ) {\n\t\treturn false;\n\t}\n\tif ( array() === $pubkeys_raw ) {\n\t\treturn true;\n\t}', 'fail open without keys' ),
	php( VS( 'test_signature_made_for_namespace_git_is_rejected' ), VERIFY, "\t$fields = array( $sig_namespace, '', 'sha512', hash( 'sha512', $message, true ) );", "\t$fields = array( '', '', 'sha512', hash( 'sha512', $message, true ) );", 'namespace left out of the signed blob' ),
	phpEdits( VS( 'test_key_of_wrong_length_is_rejected' ), 'key length not checked and sodium exception no longer caught (two layers)', [
		{ file: VERIFY, search: KEY_GUARD, replace: '' },
		{ file: VERIFY, search: VERIFY_LOOP, replace: VERIFY_LOOP_NO_TRY },
	] ),
	php( VS( 'test_a_malformed_key_next_to_a_valid_one_rejects_the_whole_list' ), VERIFY, KEY_GUARD, '\t\tif ( ! is_string( $key ) || 32 !== strlen( $key ) ) {\n\t\t\tcontinue;\n\t\t}\n', 'malformed keys skipped instead of refusing the list' ),
];

// ---------- tools/*.mjs, run by tests/tools ----------
const ZIP = 'tools/lib/zip.mjs';
const SSHSIG = 'tools/lib/sshsig.mjs';
const REL = 'tools/lib/release.mjs';
const BUILD = 'tools/build-release.mjs';
const FINISH = 'tools/finish-release.mjs';
const TESTZIP = 'tools/build-test-zip.mjs';
const tool = ( target, file, search, replace, reason, expect ) => ( { kind: 'tools', target, file, search, replace, reason, ...( expect ? { expect } : {} ) } );
const toolEdits = ( target, reason, edits ) => ( { kind: 'tools', target, reason, edits } );
const FINISH_CHECK = "\tif ( ! again.zip.equals( zip ) || ! again.manifest.equals( manifest ) || sha512( zip ) !== build.sha512 ) {";
const FINISH_VERIFY = "\tif ( ! verifyRaw( manifest, read.signature, readKeys( text( 'includes/keys.php' ) ) ) ) {\n\t\trefuse( 'the signature does not verify against the keys built into the plugin.' );\n\t}";
const STATUS_CHECK = "\tif ( '' !== git( repo, [ 'status', '--porcelain' ] ).toString( 'utf8' ).trim() ) {\n\t\trefuse( 'there are changes that are not committed. A release is built from a commit.' );\n\t}\n";

export const TOOLS = [
	toolEdits( 'zip: the same entries give the same bytes', 'offset counter hoisted to module scope, every archive after the first is shifted', [
		{ file: ZIP, search: '\tlet offset = 0;\n\tfor ( const entry of list ) {', replace: '\tfor ( const entry of list ) {' },
		{ file: ZIP, search: 'export function zipStore( entries, { keepOrder = false } = {} ) {', replace: 'let offset = 0;\nexport function zipStore( entries, { keepOrder = false } = {} ) {' },
	] ),
	tool( 'zip: the order of the input does not matter', ZIP, '\tconst list = keepOrder ? [ ...entries ] : [ ...entries ].sort( compareBytes );', '\tconst list = [ ...entries ];', 'entries no longer sorted' ),
	tool( 'zip: every entry is stored with its bytes, without compression, with the fixed date', ZIP, '\t\thead.writeUInt16LE( 0, 10 );', '\t\thead.writeUInt16LE( 8, 10 );', 'central directory claims deflate while the bytes are stored' ),
	tool( 'zip: one changed byte changes the archive', ZIP, '\t\tconst crc = zlib.crc32( data );', '\t\tconst crc = zlib.crc32( name );', 'crc over the name instead of the data (the data itself still differs, so the archive changes: no realistic bug keeps an archive identical when its content changes)', 'survive' ),
	tool( 'sshsig: the blob equals the vector of PROTOCOL.md', SSHSIG, "\t\tsshString( Buffer.alloc( 0 ) ),\n\t\tsshString( Buffer.from( 'sha512', 'ascii' ) ),", "\t\tsshString( Buffer.from( 'sha512', 'ascii' ) ),", 'reserved field left out of the blob' ),
	tool( 'sshsig: the vector verifies, and not for another namespace or a flipped bit', SSHSIG, '\tconst blob = sshsigBlob( message, namespace );\n\tlet valid = false;', '\tconst blob = sshsigBlob( message );\n\tlet valid = false;', 'namespace argument ignored when verifying' ),
	tool( 'sshsig: an armored file is read back', SSHSIG, "\tconst namespace = outer.string().toString( 'utf8' );\n\tconst reserved = outer.string();", "\tconst reserved = outer.string();\n\tconst namespace = outer.string().toString( 'utf8' );", 'namespace and reserved field read in the wrong order' ),
	tool( 'sshsig: damaged or foreign files are refused', SSHSIG, "\tif ( 'ssh-ed25519' !== keyType || 'ssh-ed25519' !== signatureType || 32 !== publicRaw.length || 64 !== signature.length ) {", "\tif ( 'ssh-ed25519' !== keyType || 'ssh-ed25519' !== signatureType || 32 !== publicRaw.length ) {", 'signature length not checked' ),
	tool( 'sshsig: what OpenSSH writes is read and verifies', SSHSIG, "\tif ( 0 !== reserved.length || 'sha512' !== hashAlgorithm ) {", "\tif ( 0 !== reserved.length || 'sha256' !== hashAlgorithm ) {", 'wrong hash algorithm expected in the armored file' ),
	tool( 'release: the commit gives the same file set as the folder, nothing from tests, tools or docs', REL, '\tfor ( const name of RELEASE_SET ) {\n\t\tif ( fs.existsSync( path.join( root, name ) ) ) {', "\tfor ( const name of [ ...RELEASE_SET, 'docs' ] ) {\n\t\tif ( fs.existsSync( path.join( root, name ) ) ) {", 'docs folder walked from the working folder while the commit export-ignores it' ),
	tool( 'release: the manifest has the seven fields, no line break, and the plugin takes it', REL, "\t\t} ),\n\t\t'utf8'\n\t);\n}\n\nexport function releaseZip", "\t\t} ) + '\\n',\n\t\t'utf8'\n\t);\n}\n\nexport function releaseZip", 'trailing newline on the manifest' ),
	tool( 'release: version is read from header and constant, and both have to agree', REL, '\treturn { version: header, requiresWp, requiresPhp };', '\treturn { version: header, requiresWp: requiresPhp, requiresPhp: requiresWp };', 'minimum versions swapped' ),
	tool( 'test build: same keys give the same release, and only three files differ from the source', TESTZIP, "\t\t' * TEST BUILD. Public keys made at run time of a test.',", "\t\t' * TEST BUILD. Public keys made at run time of a test, built ' + new Date().toISOString() + '.',", 'build stamp in a generated file' ),
	tool( 'test build: the release verifies with its own key and carries the hash of its zip', TESTZIP, "\treturn { version, zip, zipName: SLUG + '-' + version + '.zip', manifest, signature: signer.sign( manifest ) };", "\treturn { version, zip, zipName: SLUG + '-' + version + '.zip', manifest, signature: signer.sign( zip ) };", 'zip signed instead of the manifest' ),
	tool( 'build-release builds zip and manifest and says what comes next', BUILD, "console.log( 'SHA-512   ' + sha512( release.zip ) );", "console.log( 'SHA-512   ' + sha512( release.manifest ) );", 'hash of the wrong file shown' ),
	tool( 'build-release gives the same zip twice, and in a second clone of the same commit', REL, "\tconst zip = releaseZip( files );\n\tif ( zip.length > ZIP_MAX_BYTES ) {", "\tconst zip = releaseZip( [ ...files, { name: 'BUILD', data: Buffer.from( new Date().toISOString(), 'utf8' ) } ] );\n\tif ( zip.length > ZIP_MAX_BYTES ) {", 'build stamp file added to the archive' ),
	tool( 'build-release refuses with a change that is not committed', BUILD, STATUS_CHECK, '', 'working tree not checked' ),
	tool( 'build-release refuses with a new file that is not committed', BUILD, "\tif ( '' !== git( repo, [ 'status', '--porcelain' ] ).toString( 'utf8' ).trim() ) {\n\t\trefuse( 'there are changes that are not committed. A release", "\tif ( '' !== git( repo, [ 'status', '--porcelain', '--untracked-files=no' ] ).toString( 'utf8' ).trim() ) {\n\t\trefuse( 'there are changes that are not committed. A release", 'untracked files ignored' ),
	tool( 'build-release refuses a version that is not x.y.z', REL, 'const VERSION = /^[0-9]+\\.[0-9]+\\.[0-9]+$/;', 'const VERSION = /^[0-9]+\\.[0-9]+(\\.[0-9]+)?$/;', 'third version part optional' ),
	tool( 'build-release refuses when header and constant differ', REL, "\tif ( header !== constant ) {\n\t\tthrow new Error( 'Header version and constant differ.' );\n\t}\n", '', 'header and constant not compared' ),
	tool( 'build-release refuses keys that are not the pinned ones', REL, "\tfor ( const name of [ 'includes/keys.php', 'includes/source.php' ] ) {", "\tfor ( const name of [ 'includes/source.php' ] ) {", 'keys.php not pinned' ),
	tool( 'build-release refuses a release address that is not the pinned one', REL, "\tfor ( const name of [ 'includes/keys.php', 'includes/source.php' ] ) {", "\tfor ( const name of [ 'includes/keys.php' ] ) {", 'source.php not pinned' ),
	tool( 'build-release refuses when the tag exists', BUILD, "\tif ( '' !== git( repo, [ 'tag', '--list', 'v' + release.version ] ).toString( 'utf8' ).trim() ) {\n\t\trefuse( 'the tag v' + release.version + ' exists already. Raise the version first.' );\n\t}\n", '', 'existing tag not checked' ),
	tool( 'finish-release takes the raw signature and uploads nothing', FINISH, "fs.writeFileSync( path.join( out, 'manifest.json.sig' ), signature );", "fs.writeFileSync( path.join( out, 'manifest.json.sig' ), armored );", 'armored file copied instead of the raw signature' ),
	tool( 'finish-release takes a signature of the reserve key', FINISH, "readKeys( text( 'includes/keys.php' ) ) ) ) {", "readKeys( text( 'includes/keys.php' ) ).slice( 0, 1 ) ) ) {", 'only the work key accepted' ),
	tool( 'finish-release refuses without a signature file', FINISH, "} catch {\n\trefuse( 'dist/manifest.json.sig is missing. Sign dist/manifest.json first.' );\n}", "} catch {\n\tarmored = '';\n}", 'missing signature file treated as empty' ),
	tool( 'finish-release refuses the signature of an unknown key', FINISH, "readKeys( text( 'includes/keys.php' ) ) ) ) {", '[ read.publicRaw ] ) ) {', 'verified against the key named inside the signature file' ),
	tool( 'finish-release ignores the key named inside the signature file', FINISH, FINISH_VERIFY, '', 'verification skipped, the namespace check is trusted' ),
	tool( 'finish-release refuses a signature over another manifest', FINISH, "\tif ( ! verifyRaw( manifest, read.signature, readKeys( text( 'includes/keys.php' ) ) ) ) {", "\tif ( ! verifyRaw( manifest, read.signature, readKeys( text( 'includes/keys.php' ) ) ) && NAMESPACE !== read.namespace ) {", 'verification only enforced for a foreign namespace' ),
	tool( 'finish-release refuses a signature made for another namespace', FINISH, "\tif ( NAMESPACE !== read.namespace ) {\n\t\trefuse( 'the signature was made for another namespace.' );\n\t}\n", '', 'namespace not checked' ),
	tool( 'finish-release refuses a zip that was changed after the build', FINISH, FINISH_CHECK, '\tif ( ! again.manifest.equals( manifest ) ) {', 'only the manifest compared with the build' ),
	tool( 'finish-release refuses a manifest that was changed after the build', FINISH, FINISH_CHECK, '\tif ( ! again.zip.equals( zip ) || sha512( zip ) !== build.sha512 ) {', 'only the zip compared with the build' ),
	tool( 'finish-release refuses when the commit changed since the build', FINISH, "\tif ( build.commit !== git( repo, [ 'rev-parse', 'HEAD' ] ).toString( 'utf8' ).trim() ) {\n\t\trefuse( 'the commit changed since the build. Build again.' );\n\t}\n", '', 'commit not compared with the build' ),
];

// ---------- tests/integration, Playground; prod files of the copy ----------
const it = ( spec, target, file, search, replace, reason, catalogue, expect ) => ( { kind: 'integration', spec, target, file, search, replace, reason, catalogue, ...( expect ? { expect } : {} ) } );
const itEdits = ( spec, target, reason, catalogue, edits, expect ) => ( { kind: 'integration', spec, target, reason, catalogue, edits, ...( expect ? { expect } : {} ) } );
const SMOKE = 'smoke.test.mjs';
const SILENT = 'silent.test.mjs';
const RPT = 'report.test.mjs';
const ENR = 'enroll.test.mjs';
const ADM = 'admin.test.mjs';
const UNI = 'uninstall.test.mjs';
const UCHK = 'update-check.test.mjs';
const UOFF = 'update-offer.test.mjs';
const UINS = 'update-install.test.mjs';
const UKEY = 'update-keys.test.mjs';
const RETRYABLE = '\t$retryable = 0 === $code || 429 === $code || $code >= 500;';
const REDEEM_RETRY = "\tif ( 0 === $code || 429 === $code || $code >= 500 ) {\n\t\treturn 'retry';\n\t}";
const ELIGIBLE = "\treturn '' !== $host && $state['home_host'] === $host;";
const PRE_DUE = "\tif ( null === $update || null === $url || ! $update['due'] ) {\n\t\treturn site_dispatch_update_refused();\n\t}";
const LIST_DUE = "\tif ( null === $update || null === $url || ! $update['due'] ) {\n\t\treturn $value;\n\t}";
const UNSET_OWN = '\tif ( $value instanceof stdClass && isset( $value->response ) && is_array( $value->response ) && isset( $value->response[ $file ] ) ) {\n\t\tunset( $value->response[ $file ] );\n\t}\n';
const GOOD_HASH = "\t\t&& is_string( $hash ) && hash_equals( $update['manifest']['sha512'], $hash )\n";
const REQUIRE_ADMIN = "\tif ( ! current_user_can( 'manage_options' ) ) {\n\t\twp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );\n\t}\n\tcheck_admin_referer( $action );";
const AJAX_CAP = "\tif ( ! current_user_can( 'manage_options' ) || false === check_ajax_referer( 'site_dispatch_redeem', 'nonce', false ) ) {";
const STATE_ADD = "\t\t\t'home_host'   => site_dispatch_home_host(),\n\t\t),\n\t\t'',\n\t\tfalse\n\t);";
const VERIFY_LOOP_INT = '\t\tforeach ( $keys as $key ) {\n\t\t\tif ( sodium';

export const INTEGRATION = [
	// ----- catalogue "Hygiene", leak inventory 7 (test added by the QA run) -----
	it( 'hygiene.test.mjs', 'debug.log carries neither the site key nor the enrollment secret after every flow ran', REPORT, '\t// Signed over the exact body bytes. Replay protection comes from generated_at inside the body.', "\terror_log( 'Site Dispatch: sending report signed with ' . $state['key'] );\n\t// Signed over the exact body bytes. Replay protection comes from generated_at inside the body.", 'debug line with the site key left in the report path', 'Hygiene: Kanarienwert in keinem Log (Leck-Inventar 7)' ),

	// ----- catalogue "Bericht" -----
	it( SILENT, 'staging site stays silent', COMMON, "\treturn ! is_multisite() && 'production' === wp_get_environment_type();", "\treturn ! is_multisite() && 'local' !== wp_get_environment_type();", 'only local excluded', 'Bericht: Staging-Klon stumm' ),
	it( SILENT, 'site with the snippet constant stays silent', REPORT, '\tif ( null === $state || site_dispatch_legacy_reporter_present() || ! site_dispatch_environment_supported() ) {', '\tif ( null === $state || ! site_dispatch_environment_supported() ) {', 'legacy constants no longer silence the plugin', 'Bericht: alte Snippet-Konstanten' ),
	it( SILENT, 'site with the snippet constant shows a notice to admins', ADMIN, "\t\tesc_html__( 'Site Dispatch sends no reports while the constants of the old report snippet are defined. Remove the snippets to let the plugin take over.', 'site-dispatch' )", "\t\tesc_html( 'Site Dispatch sends no reports while the constants of the old report snippet are defined (MW_PLUGIN_REPORT_KEY = ' . MW_PLUGIN_REPORT_KEY . '). Remove the snippets to let the plugin take over.' )", 'value of the legacy constant shown in the notice', 'Hygiene: Kanarienwert in einer Ausgabe' ),
	it( SILENT, 'staging site cannot connect', ENROLL, '\tif ( site_dispatch_valid_server_host( $server_host ) !== $server_host || ! site_dispatch_environment_supported() ) {', '\tif ( site_dispatch_valid_server_host( $server_host ) !== $server_host ) {', 'environment not checked before a request', 'Bericht: Staging-Klon' ),
	it( SILENT, 'staging site shows a note instead of the connect form', ADMIN, '\tif ( ! site_dispatch_environment_supported() ) {\n\t\techo \'<p>\' . esc_html__( \'Connecting is only possible on a production site without multisite.\', \'site-dispatch\' ) . \'</p>\';\n\t} else {', '\tif ( false ) {\n\t\techo \'<p>\' . esc_html__( \'Connecting is only possible on a production site without multisite.\', \'site-dispatch\' ) . \'</p>\';\n\t} else {', 'connect form shown on every environment', 'wp-admin' ),
	it( SILENT, 'site with the snippet constant can still connect', ENROLL, '\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );\n\tif ( site_dispatch_valid_server_host( $server_host ) !== $server_host || ! site_dispatch_environment_supported() ) {', '\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );\n\tif ( site_dispatch_valid_server_host( $server_host ) !== $server_host || ! site_dispatch_environment_supported() || site_dispatch_legacy_reporter_present() ) {', 'legacy constants block the enrollment too, the migration path is cut', 'Bericht: Migration' ),
	it( RPT, 'report reaches the server and the signature matches the key of the test vector', REPORT, "\treturn 'sha256=' . hash_hmac( 'sha256', $body, $site_key );", "\treturn 'sha256=' . hash_hmac( 'sha256', $site_key, $body );", 'data and key arguments swapped', 'Bericht' ),
	it( RPT, 'report carries the contract fields and the plugin version', REPORT, "\t\t'reporter_version'     => SITE_DISPATCH_VERSION,", "\t\t'reporter_version'     => '1.0.0',", 'hard-coded reporter version', 'Bericht' ),
	it( RPT, 'report is sent with tls check on and redirects off', COMMON, "\t\t\t'redirection'         => 0,", "\t\t\t'redirection'         => 5,", 'WP default redirects left on', 'Bericht: TLS/Redirects' ),
	it( RPT, 'environment block contains only fields of the allowlist', REPORT, "\t\t'memory_limit'      => site_dispatch_clean( site_dispatch_constant( 'WP_MEMORY_LIMIT' ), SITE_DISPATCH_SIZE_PATTERN ),\n\t);", "\t\t'memory_limit'      => site_dispatch_clean( site_dispatch_constant( 'WP_MEMORY_LIMIT' ), SITE_DISPATCH_SIZE_PATTERN ),\n\t\t'abspath'           => ABSPATH,\n\t);", 'path added to the environment block', 'Bericht: Kanarien Pfade' ),
	it( RPT, 'license key and urls of the update data never appear in a report', REPORT, "\t\t$picked = site_dispatch_pick( $offer, array( 'new_version', 'requires', 'requires_php', 'tested' ) );", "\t\t$picked = site_dispatch_pick( $offer, array( 'new_version', 'requires', 'requires_php', 'tested', 'url', 'package' ) );", 'allowlist widened with url and package', 'Bericht: Lizenzschluessel und URLs' ),
	it( RPT, 'database host, database user, paths, salts and admin mail never appear in a report', REPORT, "\t\t\t\t'type'    => false !== stripos( $wpdb->db_server_info(), 'mariadb' ) ? 'mariadb' : 'mysql',", "\t\t\t\t'host'    => DB_HOST,\n\t\t\t\t'type'    => false !== stripos( $wpdb->db_server_info(), 'mariadb' ) ? 'mariadb' : 'mysql',", 'database host reported', 'Bericht: Kanarien DB-Host' ),
	it( RPT, 'changed home url stays silent', REPORT, ELIGIBLE, "\treturn '' !== $host;", 'home host not compared with the enrollment host', 'Bericht: Staging-Klon stumm' ),
	it( RPT, 'home url that differs only by www still reports', HOSTS, "\tif ( 0 !== strpos( $host, 'www.' ) ) {", "\tif ( 0 !== strpos( $host, 'www.www.' ) ) {", 'typo in the www prefix, never stripped', 'Bericht' ),
	it( RPT, 'site without a connection sends nothing', REPORT, '\tif ( null === $state || ! site_dispatch_eligible( $state ) ) {\n\t\treturn;\n\t}\n\t$body = wp_json_encode( site_dispatch_build_report( $state )', '\tif ( null !== $state && ! site_dispatch_eligible( $state ) ) {\n\t\treturn;\n\t}\n\t$body = wp_json_encode( site_dispatch_build_report( $state )', 'inverted null check, a report is built without a connection', 'Bericht' ),
	it( RPT, 'site with a damaged state sends nothing', COMMON, '\tif ( ! is_string( $key ) || 1 !== preg_match( SITE_DISPATCH_KEY_PATTERN, $key ) ) {', '\tif ( ! is_string( $key ) ) {', 'stored key not checked for its form', 'Bericht' ),
	it( RPT, 'server error plans exactly one retry', REPORT, "\t\twp_schedule_single_event( time() + HOUR_IN_SECONDS, 'site_dispatch_retry' );", "\t\twp_schedule_single_event( time() + MINUTE_IN_SECONDS, 'site_dispatch_retry' );", 'retry after a minute instead of an hour', 'Bericht' ),
	it( RPT, 'rate limit plans a retry', REPORT, RETRYABLE, '\t$retryable = 0 === $code || $code >= 500;', 'rate limit not retried', 'Bericht' ),
	it( RPT, 'rejected report plans no retry', REPORT, RETRYABLE, '\t$retryable = 0 === $code || $code >= 400;', 'all 4xx retried', 'Bericht' ),
	it( RPT, 'failed retry plans no further retry', REPORT, "\tif ( $retryable && ! $is_retry && false === wp_next_scheduled( 'site_dispatch_retry' ) ) {", "\tif ( $retryable && false === wp_next_scheduled( 'site_dispatch_retry' ) ) {", 'retry reschedules itself', 'Bericht' ),
	itEdits( RPT, 'accepted report plans no retry', 'success return dropped and server-error threshold typo (two layers)', 'Bericht', [
		{ file: REPORT, search: '\tif ( $code >= 200 && $code < 300 ) {\n\t\treturn;\n\t}\n', replace: '' },
		{ file: REPORT, search: RETRYABLE, replace: '\t$retryable = 0 === $code || 429 === $code || $code >= 200;' },
	] ),
	it( RPT, 'last report records time and status', REPORT, "\t\t\t'http_status' => $code,\n\t\t),\n\t\tfalse\n\t);", "\t\t\t'http_status' => $code,\n\t\t),\n\t\ttrue\n\t);", 'last report autoloaded', 'Bericht' ),
	it( RPT, 'connected site plans the daily report when an admin page loads', REPORT, "\t\twp_schedule_event( time() + 5 * MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );", "\t\twp_schedule_event( time() + 5 * HOUR_IN_SECONDS, 'daily', 'site_dispatch_daily' );", 'unit slip, first run in five hours', 'Bericht' ),

	// ----- catalogue "Enrollment" (plugin side) -----
	it( ENR, 'enrollment stores the connection and plans the first report', ENROLL, "\twp_schedule_event( time() + MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );", "\twp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'site_dispatch_daily' );", 'first report after an hour', 'Enrollment' ),
	it( ENR, 'request sends the hash and never the secret', ENROLL, "\t\t\t'secret_hash'    => hash( 'sha256', $secret ),", "\t\t\t'secret_hash'    => $secret,", 'secret sent instead of its hash', 'Leck-Inventar 4' ),
	it( ENR, 'every enrollment creates a new secret', ENROLL, '\t\t$secret = bin2hex( random_bytes( 32 ) );', "\t\t$secret = hash( 'sha256', site_dispatch_home_host() );", 'secret derived from the host instead of random', 'Enrollment' ),
	it( ENR, 'redeem sends the request id and the secret to the redeem path only', ENROLL, "\t\t'https://' . $enrollment['server_host'] . SITE_DISPATCH_ENROLL_REDEEM_PATH,", "\t\t'https://' . $enrollment['server_host'] . SITE_DISPATCH_ENROLL_REQUEST_PATH,", 'wrong path constant for the redeem', 'Enrollment' ),
	it( ENR, 'requests go out with tls check on, redirects off and 15 seconds', COMMON, "\t\t\t'sslverify'           => true,", "\t\t\t'sslverify'           => false,", 'TLS check off', 'Enrollment: TLS' ),
	it( ENR, 'redeem before approval stays pending', ENROLL, "\tif ( 202 === $code ) {\n\t\treturn 'pending';\n\t}\n", '', 'pending answer treated as used up', 'Enrollment: Abholen ohne Freigabe' ),
	it( ENR, 'redeem without an open enrollment makes no call', ENROLL, "\t$enrollment = site_dispatch_get_enrollment();\n\tif ( null === $enrollment ) {\n\t\treturn 'none';\n\t}\n", "\t$enrollment = site_dispatch_get_enrollment();\n", 'missing enrollment not checked, the redeem runs on null', 'Enrollment' ),
	it( ENR, 'expired request ends as failed', ENROLL, REDEEM_RETRY, "\tif ( 0 === $code || $code >= 400 ) {\n\t\treturn 'retry';\n\t}", 'every error answer retried, an expired request is polled forever', 'Enrollment: nach Ablauf' ),
	it( ENR, 'locally expired enrollment makes no call', ENROLL, '\t\t&& is_int( $expires ) && $expires > time()\n', '\t\t&& is_int( $expires )\n', 'local expiry not checked', 'Enrollment: nach Ablauf' ),
	it( ENR, 'damaged enrollment is dropped without a call', ENROLL, '\t\t&& is_string( $server_host ) && site_dispatch_valid_server_host( $server_host ) === $server_host\n', '\t\t&& is_string( $server_host )\n', 'stored server host not re-checked', 'Enrollment: Host' ),
	it( ENR, 'server error during redeem keeps the request', ENROLL, REDEEM_RETRY + '\n', '', 'server errors use up the request', 'Enrollment' ),
	it( ENR, 'redeem answer with a short key is refused', RESP, "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/', $site_key ) ) {", "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{32,64}\\z/', $site_key ) ) {", 'lower bound of the key length loosened', 'Enrollment: n8n-Antwort falsches Format' ),
	it( ENR, 'redeem answer with an upper case key is refused', RESP, "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/', $site_key ) ) {", "\tif ( ! is_string( $site_key ) || 1 !== preg_match( '/^[0-9a-f]{64}\\z/i', $site_key ) ) {", 'key accepted in either case', 'Enrollment: n8n-Antwort falsches Format' ),
	it( ENR, 'redeem answer with key version as text is refused', RESP, '\tif ( ! is_int( $key_version ) || $key_version < 1 ) {\n\t\treturn null;\n\t}\n\tif ( ! is_string( $website_id )', '\tif ( ! is_numeric( $key_version ) || $key_version < 1 ) {\n\t\treturn null;\n\t}\n\tif ( ! is_string( $website_id )', 'numeric text accepted as version', 'Enrollment: n8n-Antwort falsches Format' ),
	it( ENR, 'redeem answer with a website id that is no uuid is refused', RESP, '\tif ( ! is_string( $website_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $website_id ) ) {\n\t\treturn null;\n\t}\n\treturn array(\n\t\t\'site_key\'', '\tif ( ! is_string( $website_id ) ) {\n\t\treturn null;\n\t}\n\treturn array(\n\t\t\'site_key\'', 'website id not checked for its form', 'Enrollment: n8n-Antwort falsches Format' ),
	it( ENR, 'redeem answer that is html is refused', RESP, DECODE_GUARD, '\t$fields = array();', 'type guard removed, an HTML answer crashes the redeem', 'Enrollment: n8n-Antwort falsches Format' ),
	it( ENR, 'redeem answer of 5 kb is refused', RESP, 'const SITE_DISPATCH_RESPONSE_MAX_BYTES = 4096;', 'const SITE_DISPATCH_RESPONSE_MAX_BYTES = 4096 * 4;', 'limit raised to 16 KB', 'Enrollment: Uebergroesse' ),
	it( ENR, 'redeem answer of exactly 4 kb is accepted', RESP, '\tif ( 0 === $length || $length > SITE_DISPATCH_RESPONSE_MAX_BYTES ) {', '\tif ( 0 === $length || $length >= SITE_DISPATCH_RESPONSE_MAX_BYTES ) {', 'off-by-one on the size limit', 'Enrollment' ),
	it( ENR, 'redeem answer with a redirect is refused and not followed', ENROLL, REDEEM_RETRY, "\tif ( 0 === $code || 429 === $code || $code >= 300 ) {\n\t\treturn 'retry';\n\t}", '3xx answers retried instead of used up', 'Enrollment' ),
	it( ENR, 'request answer with a wrong user code is refused', RESP, "\tif ( ! is_string( $user_code ) || 1 !== preg_match( '/^[A-HJ-NP-Z2-9]{8}\\z/', $user_code ) ) {", '\tif ( ! is_string( $user_code ) ) {', 'user code not checked against its pattern', 'wp-admin: n8n-Antworten escaped' ),
	it( ENR, 'request answer other than 200 is refused', ENROLL, "\tif ( 200 !== $response['code'] ) {\n\t\treturn false;\n\t}\n\t$parsed = site_dispatch_parse_request_response", "\tif ( $response['code'] >= 400 ) {\n\t\treturn false;\n\t}\n\t$parsed = site_dispatch_parse_request_response", 'any answer below 400 accepted', 'Enrollment' ),
	it( ENR, 'failed request drops an older open enrollment', ENROLL, '\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );\n\tif ( site_dispatch_valid_server_host( $server_host ) !== $server_host', '\tif ( site_dispatch_valid_server_host( $server_host ) !== $server_host', 'old enrollment kept when a new request fails', 'Enrollment' ),
	it( ENR, 'host that is not valid never causes a request', HOSTS, PUNY, '', 'punycode check dropped', 'Enrollment: Host-Eingaben Punycode' ),
	it( ENR, 'second enrollment replaces the connection', ENROLL, "\tdelete_option( 'site_dispatch_state' );\n\tadd_option(", '\tadd_option(', 'add_option without delete, the old connection stays', 'Enrollment: Rotation' ),
	it( ENR, 'failed second enrollment keeps the old connection', ENROLL, '\t// Every other answer means the request is used up.\n\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );', "\t// Every other answer means the request is used up.\n\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );\n\tdelete_option( 'site_dispatch_state' );", 'a failed enrollment drops the existing connection', 'Enrollment' ),
	it( ENR, 'state and transient are stored without autoload', ENROLL, STATE_ADD, "\t\t\t'home_host'   => site_dispatch_home_host(),\n\t\t),\n\t\t'',\n\t\ttrue\n\t);", 'connection autoloaded', 'Leck-Inventar 6: Autoload' ),

	// ----- catalogue "wp-admin" -----
	it( ADM, 'admin sees the page under tools', ADMIN, '\tadd_management_page(', '\tadd_options_page(', 'page registered under settings', 'wp-admin' ),
	it( ADM, 'connected site shows host, version and last report', ADMIN, "\tsite_dispatch_row( __( 'Server', 'site-dispatch' ), null === $state ? '-' : $state['server_host'] );", "\tsite_dispatch_row( __( 'Server', 'site-dispatch' ), null === $state ? '-' : $state['home_host'] );", 'home host shown as server', 'wp-admin' ),
	it( ADM, 'waiting update without manifest and signature is not shown', ADMIN, '\t$update = site_dispatch_get_update();\n\tif ( null === $update ) {\n\t\treturn __( \'None\', \'site-dispatch\' );\n\t}', '\t$update = get_option( SITE_DISPATCH_UPDATE_OPTION, null );\n\tif ( ! is_array( $update ) ) {\n\t\treturn __( \'None\', \'site-dispatch\' );\n\t}', 'raw option shown without verification', 'wp-admin' ),
	it( ADM, 'waiting update with a damaged version is not shown', ADMIN, '\t$update = site_dispatch_get_update();\n\tif ( null === $update ) {\n\t\treturn __( \'None\', \'site-dispatch\' );\n\t}', '\t$update = get_option( SITE_DISPATCH_UPDATE_OPTION, null );\n\tif ( ! is_array( $update ) ) {\n\t\treturn __( \'None\', \'site-dispatch\' );\n\t}', 'raw option shown without verification', 'wp-admin' ),
	it( ADM, 'connect through the form shows the code and the approval link', ADMIN, "\t\tprintf( '<p>%s <strong><code>%s</code></strong></p>', esc_html__( 'Type this code into the approval form of your server:', 'site-dispatch' ), esc_html( $enrollment['user_code'] ) );", "\t\tprintf( '<p>%s <strong>%s</strong></p>', esc_html__( 'Type this code into the approval form of your server:', 'site-dispatch' ), esc_html( $enrollment['user_code'] ) );", 'code tag dropped', 'wp-admin' ),
	it( ADM, 'redeem through ajax connects the site', ADMIN, "\twp_send_json( array( 'status' => site_dispatch_enroll_redeem() ) );", "\twp_send_json( array( 'state' => site_dispatch_enroll_redeem() ) );", 'answer key renamed', 'wp-admin' ),
	it( ADM, 'host with spaces around it is accepted', ADMIN, '\treturn is_string( $raw ) ? site_dispatch_valid_server_host( trim( $raw ) ) : null;', '\treturn is_string( $raw ) ? site_dispatch_valid_server_host( $raw ) : null;', 'form value not trimmed', 'wp-admin' ),
	it( ADM, 'invalid host shows a notice and causes no request', ADMIN, "\t$input  = isset( $_POST['server_host'] ) ? site_dispatch_host_input( wp_unslash( $_POST['server_host'] ) ) : null;", "\t$input  = isset( $_POST['server_host'] ) ? strtolower( trim( (string) wp_unslash( $_POST['server_host'] ) ) ) : null;", 'validation skipped in the handler, the request function has to refuse', 'Enrollment: Host-Eingaben' ),
	it( ADM, 'host sent as a list is refused without an error', ADMIN, '\treturn is_string( $raw ) ? site_dispatch_valid_server_host( trim( $raw ) ) : null;', '\treturn site_dispatch_valid_server_host( trim( $raw ) );', 'type check dropped, a list crashes the handler', 'wp-admin' ),
	it( ADM, 'server that refuses the request shows a notice', ADMIN, "\t\t$notice = site_dispatch_enroll_request( $input ) ? '' : 'connect_failed';", "\t\tsite_dispatch_enroll_request( $input );\n\t\t$notice = '';", 'result of the request ignored', 'wp-admin' ),
	itEdits( ADM, 'notice code from the address is never printed', 'notice code not sanitised and unknown codes echoed back', 'wp-admin: Escaping', [
		{ file: ADMIN, search: "\t$code = isset( $_GET['site_dispatch_notice'] ) && is_string( $_GET['site_dispatch_notice'] ) ? sanitize_key( $_GET['site_dispatch_notice'] ) : '';", replace: "\t$code = isset( $_GET['site_dispatch_notice'] ) && is_string( $_GET['site_dispatch_notice'] ) ? (string) wp_unslash( $_GET['site_dispatch_notice'] ) : '';" },
		{ file: ADMIN, search: "\tif ( isset( $notices[ $code ] ) ) {\n\t\tprintf( '<div class=\"notice notice-%s\"><p>%s</p></div>', esc_attr( $notices[ $code ]['type'] ), esc_html( $notices[ $code ]['text'] ) );\n\t}", replace: "\tif ( '' !== $code ) {\n\t\tprintf( '<div class=\"notice notice-%s\"><p>%s</p></div>', esc_attr( $notices[ $code ]['type'] ?? 'info' ), $notices[ $code ]['text'] ?? $code );\n\t}" },
	] ),
	it( ADM, 'subscriber gets 403 everywhere', ADMIN, REQUIRE_ADMIN, "\tif ( ! is_user_logged_in() ) {\n\t\twp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );\n\t}\n\tcheck_admin_referer( $action );", 'any logged-in user may connect', 'wp-admin: ohne manage_options 403' ),
	it( ADM, 'editor gets 403 everywhere', ADMIN, AJAX_CAP, "\tif ( ! current_user_can( 'edit_posts' ) || false === check_ajax_referer( 'site_dispatch_redeem', 'nonce', false ) ) {", 'editor capability on the redeem', 'wp-admin: ohne manage_options 403' ),
	itEdits( ADM, 'visitor without login triggers nothing', 'public ajax action registered and the capability check dropped; the nonce of the admin still fails for a visitor (three layers)', 'Enrollment: Freigabe ohne Login', [
		{ file: MAIN, search: "add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );", replace: "add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );\nadd_action( 'wp_ajax_nopriv_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );" },
		{ file: ADMIN, search: AJAX_CAP, replace: "\tif ( false === check_ajax_referer( 'site_dispatch_redeem', 'nonce', false ) ) {" },
	], 'survive' ),
	it( ADM, 'request without nonce is refused', ADMIN, REQUIRE_ADMIN, "\tif ( ! current_user_can( 'manage_options' ) ) {\n\t\twp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );\n\t}", 'nonce not checked', 'wp-admin: ohne Nonce' ),
	it( ADM, 'request with a nonce of another action is refused', ADMIN, "\tsite_dispatch_require_admin( 'site_dispatch_connect' );", "\tsite_dispatch_require_admin( 'site_dispatch_settings' );", 'wrong nonce action in the connect handler', 'wp-admin: Nonce' ),
	it( ADM, 'nonce of another user is refused', ADMIN, REQUIRE_ADMIN, "\tif ( ! current_user_can( 'manage_options' ) ) {\n\t\twp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );\n\t}\n\tif ( ! isset( $_REQUEST['_wpnonce'] ) || 10 !== strlen( (string) $_REQUEST['_wpnonce'] ) ) {\n\t\twp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );\n\t}", 'nonce checked for its shape only', 'wp-admin: Nonce' ),
	it( ADM, 'key never appears in the page', ADMIN, "\tsite_dispatch_row( __( 'Server', 'site-dispatch' ), null === $state ? '-' : $state['server_host'] );", "\tsite_dispatch_row( __( 'Server', 'site-dispatch' ), null === $state ? '-' : $state['server_host'] . ' (' . $state['key'] . ')' );", 'key shown next to the server', 'Leck-Inventar 6: HTML' ),
	it( ADM, 'secret of an open enrollment never appears in the page or in an ajax answer', ADMIN, "\twp_send_json( array( 'status' => site_dispatch_enroll_redeem() ) );", "\twp_send_json( array( 'status' => site_dispatch_enroll_redeem(), 'enrollment' => get_transient( SITE_DISPATCH_ENROLL_TRANSIENT ) ) );", 'debug payload with the transient in the ajax answer', 'Hygiene: Geheimnis in einer Ausgabe' ),
	it( ADM, 'key never appears in a rest answer', MAIN, "add_action( 'admin_init', 'site_dispatch_schedule' );", "add_action( 'init', static function () {\n\tregister_setting( 'site_dispatch', 'site_dispatch_state', array( 'type' => 'object', 'show_in_rest' => array( 'schema' => array( 'type' => 'object', 'additionalProperties' => true ) ) ) );\n} );\nadd_action( 'admin_init', 'site_dispatch_schedule' );", 'connection registered as a REST visible setting', 'Leck-Inventar 6: REST' ),
	it( ADM, 'key is not part of the autoloaded options', ENROLL, STATE_ADD, "\t\t\t'home_host'   => site_dispatch_home_host(),\n\t\t),\n\t\t'',\n\t\ttrue\n\t);", 'connection autoloaded (the case reads an option the test harness wrote itself with site.connect(), so the plugin write cannot reach it; the plugin write is proven by enroll "state and transient are stored without autoload")', 'Leck-Inventar 6: Autoload', 'survive' ),
	it( ADM, 'rest route list has no route of the plugin', MAIN, "add_action( 'admin_init', 'site_dispatch_schedule' );", "add_action( 'rest_api_init', static function () {\n\tregister_rest_route( 'site-dispatch/v1', '/status', array( 'methods' => 'GET', 'callback' => '__return_empty_array', 'permission_callback' => '__return_true' ) );\n} );\nadd_action( 'admin_init', 'site_dispatch_schedule' );", 'a status route added', 'Invariante 2: kein Endpoint' ),
	it( ADM, 'plugin registers no public action and no rewrite rule', MAIN, "add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );", "add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );\nadd_action( 'wp_ajax_nopriv_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );", 'public ajax action registered', 'Invariante 2: keine nopriv-Action' ),
	it( ADM, 'switch for immediate updates is stored and shown', ADMIN, "\tadd_option( 'site_dispatch_early_updates', $early ? 1 : 0, '', false );", "\tadd_option( 'site_dispatch_early_updates', 1, '', false );", 'switch cannot be turned off', 'wp-admin' ),

	// ----- uninstall / lifecycle -----
	it( SMOKE, 'plugin activates without any output or notice', SOURCE, "const SITE_DISPATCH_RELEASE_BASE = 'https://github.com/manuel-will/site-dispatch';\n", "const SITE_DISPATCH_RELEASE_BASE = 'https://github.com/manuel-will/site-dispatch';\n?>\n\n", 'closing tag with a blank line after it, output on every load', 'wp-admin' ),
	it( SMOKE, 'a fresh site is not connected and plans no report, only the update check', MAIN, 'function site_dispatch_activate(): void {\n\tsite_dispatch_schedule();', "function site_dispatch_activate(): void {\n\twp_schedule_event( time() + 5 * MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );", 'activation plans the report without a connection', 'Bericht' ),
	it( UNI, 'deactivation removes the cron events and the open enrollment', MAIN, "\twp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );\n\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );", '\twp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );', 'open enrollment kept on deactivation', 'wp-admin: Deinstallation' ),
	it( UNI, 'deactivation keeps the connection', MAIN, "\twp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );\n\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );", "\twp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );\n\tdelete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );\n\tdelete_option( 'site_dispatch_state' );", 'deactivation drops the connection', 'wp-admin' ),
	it( UNI, 'deactivated plugin sends nothing', MAIN, "\twp_clear_scheduled_hook( 'site_dispatch_daily' );\n\twp_clear_scheduled_hook( 'site_dispatch_retry' );\n\twp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );", "\twp_clear_scheduled_hook( 'site_dispatch_retry' );\n\twp_clear_scheduled_hook( SITE_DISPATCH_UPDATE_HOOK );", 'daily hook not cleared (the case tests WordPress: a deactivated plugin is not loaded, so no mutation of its code is visible)', 'wp-admin', 'survive' ),
	it( UNI, 'activation of a connected site plans the daily report', MAIN, 'function site_dispatch_activate(): void {\n\tsite_dispatch_schedule();\n', 'function site_dispatch_activate(): void {\n', 'activation no longer plans the report', 'wp-admin' ),
	it( UNI, 'uninstall leaves no option, no transient and no cron event', UNINSTALL, "delete_option( 'site_dispatch_update' );\n", '', 'stored update left behind', 'wp-admin: Deinstallation restlos' ),
	it( UNI, 'uninstall file does nothing when called outside of an uninstall', UNINSTALL, "defined( 'WP_UNINSTALL_PLUGIN' ) || exit;\n", '', 'uninstall guard removed', 'wp-admin: Deinstallation' ),

	// ----- catalogue "Update": daily check -----
	it( UCHK, 'activation plans the daily check, also without a connection', MAIN, '\tsite_dispatch_schedule();\n\tsite_dispatch_schedule_update_check();\n}', '\tsite_dispatch_schedule();\n}', 'activation no longer plans the update check', 'Update' ),
	it( UCHK, 'the cron hook runs the check', MAIN, "add_action( SITE_DISPATCH_UPDATE_HOOK, 'site_dispatch_update_check' );\n", '', 'cron hook not wired', 'Update' ),
	it( UCHK, 'valid release is stored with manifest, signature, version and local time', UPD, "\t\tadd_option( SITE_DISPATCH_UPDATE_OPTION, $update, '', false );", "\t\tadd_option( SITE_DISPATCH_UPDATE_OPTION, $update, '', true );", 'stored update autoloaded', 'Update' ),
	it( UCHK, 'release signed with the reserve key is stored', VERIFY, VERIFY_LOOP_INT, '\t\tforeach ( array_slice( $keys, 0, 1 ) as $key ) {\n\t\t\tif ( sodium', 'only the work key checked', 'Update: Schluesselwechsel' ),
	it( UCHK, 'every request is https, with tls check, without automatic redirects and size limited', UPD, "\t\t\t'sslverify'           => true,\n\t\t\t'reject_unsafe_urls'  => true,\n\t\t\t'limit_response_size' => $max_bytes + 1,", "\t\t\t'sslverify'           => false,\n\t\t\t'reject_unsafe_urls'  => true,\n\t\t\t'limit_response_size' => $max_bytes + 1,", 'TLS check off on the release fetch', 'Update: http/TLS' ),
	itEdits( UCHK, 'manifest without a signature file stores nothing', 'fetch gate and length guard dropped; sodium itself still refuses an empty signature (three layers)', 'Update: Manifest ohne Signatur', [
		{ file: UPD, search: "\t\tif ( 200 === $signature['code'] && SITE_DISPATCH_SIG_BYTES === strlen( $signature['body'] ) ) {", replace: '\t\tif ( true ) {' },
		{ file: VERIFY, search: VERIFY_GUARD, replace: '\tif ( array() === $pubkeys_raw ) {\n\t\treturn false;\n\t}' },
	], 'survive' ),
	it( UCHK, 'signature of an unknown key stores nothing', UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && null === site_dispatch_parse_manifest( $manifest_bytes ) ) {\n\t\treturn 'invalid';\n\t}", 'a readable manifest is trusted without a signature', 'Update: fremder Schluessel' ),
	it( UCHK, 'one flipped bit in the manifest stores nothing', UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && 64 !== strlen( $sig_raw ) ) {\n\t\treturn 'invalid';\n\t}", 'a signature of the right length is trusted', 'Update: gekipptes Bit' ),
	it( UCHK, 'one flipped bit in the signature stores nothing', UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && '' === $sig_raw ) {\n\t\treturn 'invalid';\n\t}", 'only an empty signature is fatal', 'Update: gekipptes Bit' ),
	itEdits( UCHK, 'signature of 63 and of 65 bytes stores nothing', 'fetch gate and length guard loosened; sodium itself still refuses the length (three layers)', 'Update: Signatur falscher Laenge', [
		{ file: UPD, search: "\t\tif ( 200 === $signature['code'] && SITE_DISPATCH_SIG_BYTES === strlen( $signature['body'] ) ) {", replace: "\t\tif ( 200 === $signature['code'] && strlen( $signature['body'] ) > 0 ) {" },
		{ file: VERIFY, search: VERIFY_GUARD, replace: '\tif ( array() === $pubkeys_raw ) {\n\t\treturn false;\n\t}' },
	], 'survive' ),
	it( UCHK, 'signature made for the namespace git stores nothing', VERIFY, "const SITE_DISPATCH_SIG_NAMESPACE      = 'site-dispatch-update';", "const SITE_DISPATCH_SIG_NAMESPACE      = 'git';", 'wrong namespace constant, a Git signature verifies', 'Update: Signatur aus anderem Namespace' ),
	itEdits( UCHK, 'armored signature file instead of the raw bytes stores nothing', 'signature only checked for presence at the fetch and at the verdict (two layers)', 'Update: Signatur falscher Laenge', [
		{ file: UPD, search: "\t\tif ( 200 === $signature['code'] && SITE_DISPATCH_SIG_BYTES === strlen( $signature['body'] ) ) {", replace: "\t\tif ( 200 === $signature['code'] && strlen( $signature['body'] ) > 0 ) {" },
		{ file: UPD, search: JUDGE_VERIFY, replace: "\tif ( '' === $sig_raw ) {\n\t\treturn 'invalid';\n\t}" },
	] ),
	itEdits( UCHK, 'same and lower version store nothing', 'same version accepted by the verdict and by the acceptance check (two layers)', 'Update: gleiche und niedrigere Version', [
		{ file: UPD, search: JUDGE_NEWER, replace: "\tif ( site_dispatch_compare_versions( $offered, $current ) < 0 ) {\n\t\treturn 'not_newer';\n\t}" },
		{ file: VERIFY, search: '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n', replace: '\treturn site_dispatch_compare_versions( $offered, $current ) >= 0\n' },
	] ),
	it( UCHK, 'version is compared by numbers', VERIFY, "\tif ( 1 !== preg_match( '/^([0-9]+)(?:\\.([0-9]+))?(?:\\.([0-9]+))?/', $version, $hit ) ) {", "\tif ( 1 !== preg_match( '/^([0-9]+)(?:\\.([0-9]+))?/', $version, $hit ) ) {", 'patch level ignored', 'Update' ),
	itEdits( UCHK, 'signed manifest with a foreign slug stores nothing', 'slug checked neither by the parser nor by the acceptance (two layers)', 'Update: fremder Slug', [
		{ file: VERIFY, search: "\tif ( 1 !== $fields['schema'] || SITE_DISPATCH_SLUG !== $fields['slug'] ) {", replace: "\tif ( 1 !== $fields['schema'] ) {" },
		{ file: VERIFY, search: "\tif ( SITE_DISPATCH_SLUG !== ( $m['slug'] ?? null ) ) {\n\t\treturn false;\n\t}\n", replace: '' },
	] ),
	it( UCHK, 'signed manifest with a path, an address or no version as file name stores nothing', VERIFY, ZIP_CHECK, "\tif ( SITE_DISPATCH_SLUG . '-' . $version . '.zip' !== basename( $zip ) ) {\n\t\treturn null;\n\t}\n" + SHA_CHECK, 'base name of the zip compared', 'Update: Dateiname mit ../' ),
	it( UCHK, 'signed manifest with an extra field against the waiting period stores nothing', VERIFY, NAMES_CHECK, "\tif ( array_diff( array( 'requires_php', 'requires_wp', 'schema', 'sha512', 'slug', 'version', 'zip' ), $names ) ) {", 'extra manifest fields ignored', 'Update: Manifest-Felder gegen die Wartezeit' ),
	it( UCHK, 'signed manifest that needs a newer wordpress or php stores nothing', VERIFY, ACCEPT_RETURN, '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n\t\t&& site_dispatch_compare_versions( $php_has, $php_needs ) >= 0;', 'WordPress minimum not checked', 'Update' ),
	it( UCHK, 'manifest of 8192 bytes is taken, one byte more is not', VERIFY, 'const SITE_DISPATCH_MANIFEST_MAX_BYTES = 8192;', 'const SITE_DISPATCH_MANIFEST_MAX_BYTES = 16384;', 'manifest limit doubled', 'Update: uebergrosses Manifest' ),
	it( UCHK, 'redirect to http is not followed', UPD, URL_PATTERN, UP( '/^https?:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'http redirects followed', 'Update: http' ),
	it( UCHK, 'redirect to a relative address, another port or an address with a user is not followed', UPD, '\t\t$target   = is_string( $location ) ? site_dispatch_redirect_target( $location ) : null;', "\t\t$target   = is_string( $location ) ? site_dispatch_redirect_target( 0 === strpos( $location, '//' ) ? 'https:' . $location : $location ) : null;", 'protocol relative redirects completed with https (port and user variants are refused by the test reroute before the plugin can be seen following them; UpdaterTest covers those)', 'Update: http' ),
	it( UCHK, 'five redirects are followed, the sixth is not', UPD, 'const SITE_DISPATCH_REDIRECT_MAX   = 5;', 'const SITE_DISPATCH_REDIRECT_MAX   = 6;', 'one redirect more', 'Update' ),
	it( UCHK, 'second check of the same release keeps the local time', UPD, NEXT_SAME, '', 'every check restarts the clock', 'Update: Wartezeit' ),
	it( UCHK, 'new version starts the clock again', UPD, "\t\t\t'first_seen' => $now,", "\t\t\t'first_seen' => $stored['first_seen'] ?? $now,", 'old stamp kept on a new version', 'Update: Wartezeit' ),
	it( UCHK, 'other bytes for the same version start the clock again', UPD, "\tif ( null !== $stored && ( $stored['manifest'] ?? null ) === $manifest_bytes && ( $stored['version'] ?? null ) === $manifest['version'] ) {", "\tif ( null !== $stored && ( $stored['version'] ?? null ) === $manifest['version'] ) {", 'manifest bytes not compared, only the version', 'Update: ausgetauschtes ZIP' ),
	it( UCHK, 'deleted release drops the waiting update', UPD, "\tif ( 'gone' === $fetch ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", "\tif ( 'gone' === $fetch ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", 'a deleted release keeps the waiting update', 'Update: Rueckruf' ),
	it( UCHK, 'release that was replaced by an older one drops the waiting update', UPD, "\tif ( 'not_newer' === $verdict || 'unfit' === $verdict ) {", "\tif ( 'unfit' === $verdict ) {", 'not newer no longer deletes', 'Update: Rueckruf' ),
	it( UCHK, 'server that does not answer keeps the waiting update', UPD, "\tif ( 'ok' !== $fetch ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", "\tif ( 'ok' !== $fetch ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", 'a failed fetch cancels the waiting update', 'Update' ),
	it( UCHK, 'server error keeps the waiting update', UPD, "\tif ( 404 === $answer['code'] ) {\n\t\t$fetch = 'gone';", "\tif ( 200 !== $answer['code'] ) {\n\t\t$fetch = 'gone';", 'any non-200 counts as gone', 'Update' ),
	it( UCHK, 'invalid release keeps the waiting update', UPD, "\tif ( 'ok' !== $verdict ) {\n\t\treturn array( 'action' => 'keep' );\n\t}", "\tif ( 'ok' !== $verdict ) {\n\t\treturn array( 'action' => 'delete' );\n\t}", 'an invalid signature cancels the waiting update', 'Update: Rueckruf' ),
	it( UCHK, 'admin page shows the waiting update and when it installs', ADMIN, "(string) wp_date( 'Y-m-d H:i', $first_seen + SITE_DISPATCH_UPDATE_DELAY )", "(string) wp_date( 'Y-m-d H:i', $first_seen )", 'first-seen time shown as install time', 'wp-admin' ),
	it( UCHK, 'admin page shows no update whose signature does not hold', UPD, "\tif ( 'ok' !== Site_Dispatch_Memo::$verdicts[ $mark ] || null === $manifest || $manifest['version'] !== $stored['version'] ) {", "\tif ( null === $manifest || $manifest['version'] !== $stored['version'] ) {", 'verdict not checked when reading the stored update', 'wp-admin' ),

	// ----- catalogue "Update": offer -----
	it( UOFF, 'before 72 hours there is no offer', UPD, 'const SITE_DISPATCH_UPDATE_DELAY   = 259200;', 'const SITE_DISPATCH_UPDATE_DELAY   = 25920;', 'digit lost in the delay', 'Update: Wartezeit' ),
	it( UOFF, 'after 72 hours the offer is there', UPD, "\t\t'requires'     => $update['manifest']['requires_wp'],\n\t\t'requires_php' => $update['manifest']['requires_php'],", "\t\t'requires'     => $update['manifest']['requires_php'],\n\t\t'requires_php' => $update['manifest']['requires_wp'],", 'minimum versions swapped in the offer', 'Update' ),
	it( UOFF, 'with the switch on the offer is there at once', UPD, "\t\t'due'        => site_dispatch_update_due( $stored['first_seen'], time(), (bool) get_option( 'site_dispatch_early_updates', false ) ),", "\t\t'due'        => site_dispatch_update_due( $stored['first_seen'], time(), false ),", 'switch for immediate updates ignored', 'Update' ),
	it( UOFF, 'a local time in the future does not open the offer', UPD, DUE_RETURN, '\treturn $first_seen > $now || $now - $first_seen >= SITE_DISPATCH_UPDATE_DELAY;', 'a stamp in the future counts as due', 'Update: Wartezeit' ),
	it( UOFF, 'without a stored update there is no offer and the list stays as it is', UPD, UNSET_OWN, '\tif ( ! $value instanceof stdClass ) {\n\t\t$value = new stdClass();\n\t}\n\tif ( isset( $value->response ) && is_array( $value->response ) && isset( $value->response[ $file ] ) ) {\n\t\tunset( $value->response[ $file ] );\n\t}\n', 'an update list is created even when there is nothing to offer', 'Update: fremde Update-Daten' ),
	it( UOFF, 'entries of other plugins stay byte for byte the same, offer closed', UPD, LIST_DUE, "\tif ( null === $update || null === $url || ! $update['due'] ) {\n\t\tif ( $value instanceof stdClass && isset( $value->checked[ $file ] ) ) {\n\t\t\tunset( $value->checked[ $file ] );\n\t\t}\n\t\treturn $value;\n\t}", 'own entry also removed from the checked list while the offer is closed', 'Update: fremde Update-Daten' ),
	itEdits( UOFF, 'entries of other plugins stay byte for byte the same, offer open', 'response list replaced instead of extended', 'Update: fremde Update-Daten', [
		{ file: UPD, search: "\t$value->response[ $file ] = (object) array(\n\t\t'id'           => SITE_DISPATCH_RELEASE_BASE,", replace: "\t$value->response = array( $file => (object) array(\n\t\t'id'           => SITE_DISPATCH_RELEASE_BASE," },
		{ file: UPD, search: "\t\t'requires_php' => $update['manifest']['requires_php'],\n\t);\n\treturn $value;", replace: "\t\t'requires_php' => $update['manifest']['requires_php'],\n\t) );\n\treturn $value;" },
	] ),
	it( UOFF, 'an entry for the own plugin from wordpress.org is never offered', UPD, UNSET_OWN, '', 'foreign entry for the own slug no longer removed', 'Update: Update URI' ),
	itEdits( UOFF, 'an entry for the own plugin from wordpress.org is replaced by the own offer', 'foreign entry for the own slug kept and left alone (two layers)', 'Update: Update URI', [
		{ file: UPD, search: UNSET_OWN, replace: '' },
		{ file: UPD, search: LIST_DUE, replace: "\tif ( null === $update || null === $url || ! $update['due'] || ( $value instanceof stdClass && isset( $value->response[ $file ] ) ) ) {\n\t\treturn $value;\n\t}" },
	] ),
	it( UOFF, 'an answer of wordpress.org about the slug is never offered, and wordpress.org is told the Update URI', MAIN, ' * Update URI:        https://github.com/manuel-will/site-dispatch\n', '', 'Update URI header dropped', 'Update: Update URI' ),
	it( UOFF, 'damaged stored update gives no offer', UPD, "\tif ( 'ok' !== Site_Dispatch_Memo::$verdicts[ $mark ] || null === $manifest || $manifest['version'] !== $stored['version'] ) {", "\tif ( 'ok' !== Site_Dispatch_Memo::$verdicts[ $mark ] || null === $manifest ) {", 'stored version label not compared with the manifest', 'Update' ),
	it( UOFF, 'stored update signed by an unknown key gives no offer', UPD, JUDGE_VERIFY, "\tif ( ! site_dispatch_verify_signature( $manifest_bytes, $sig_raw, $keys ) && null === site_dispatch_parse_manifest( $manifest_bytes ) ) {\n\t\treturn 'invalid';\n\t}", 'a readable manifest is trusted without a signature', 'Update: fremder Schluessel' ),
	itEdits( UOFF, 'stored update for the installed version gives no offer', 'same version accepted by the verdict and by the acceptance check (two layers)', 'Update: gleiche Version', [
		{ file: UPD, search: JUDGE_NEWER, replace: "\tif ( site_dispatch_compare_versions( $offered, $current ) < 0 ) {\n\t\treturn 'not_newer';\n\t}" },
		{ file: VERIFY, search: '\treturn site_dispatch_compare_versions( $offered, $current ) > 0\n', replace: '\treturn site_dispatch_compare_versions( $offered, $current ) >= 0\n' },
	] ),
	it( UOFF, 'the automatic updater is told to install the own plugin and nothing else', UPD, '\tif ( is_object( $item ) && isset( $item->plugin ) && site_dispatch_plugin_file() === $item->plugin ) {\n\t\treturn true;\n\t}', '\tif ( is_object( $item ) && isset( $item->plugin ) ) {\n\t\treturn true;\n\t}', 'every plugin switched to automatic updates', 'Update: fremde Plugins unberuehrt' ),

	// ----- catalogue "Update": install -----
	it( UINS, 'automatic update with the switch on installs the new version', UPD, "\t\t\t'timeout'             => '' === $file ? 15 : 60,", "\t\t\t'timeout'             => '' === $file ? 15 : 30,", 'download timeout halved', 'Update' ),
	it( UINS, 'automatic update after 72 hours installs the new version', UPD, 'const SITE_DISPATCH_UPDATE_DELAY   = 259200;', 'const SITE_DISPATCH_UPDATE_DELAY   = 259200 * 2;', 'waiting period doubled', 'Update: Wartezeit' ),
	itEdits( UINS, 'automatic update before 72 hours installs nothing', 'waiting period enforced neither at the offer nor at the download (two layers)', 'Update: Wartezeit', [
		{ file: UPD, search: LIST_DUE, replace: '\tif ( null === $update || null === $url ) {\n\t\treturn $value;\n\t}' },
		{ file: UPD, search: PRE_DUE, replace: '\tif ( null === $update || null === $url ) {\n\t\treturn site_dispatch_update_refused();\n\t}' },
	] ),
	it( UINS, 'update now in wp-admin installs through the same checks', UPD, "\t$entries  = is_array( $listing ) ? array_values( array_diff( $listing, array( '.', '..' ) ) ) : array();", "\t$entries  = is_array( $listing ) ? array_values( array_diff( $listing, array( '..' ) ) ) : array();", 'dot entry not excluded, every real install is refused', 'Update' ),
	itEdits( UINS, 'update now before 72 hours installs nothing', 'waiting period enforced neither at the offer nor at the download (two layers)', 'Update: Jetzt aktualisieren am Pruefweg vorbei', [
		{ file: UPD, search: LIST_DUE, replace: '\tif ( null === $update || null === $url ) {\n\t\treturn $value;\n\t}' },
		{ file: UPD, search: PRE_DUE, replace: '\tif ( null === $update || null === $url ) {\n\t\treturn site_dispatch_update_refused();\n\t}' },
	] ),
	it( UINS, 'forged update list before 72 hours is refused at the install check', UPD, PRE_DUE, '\tif ( null === $update || null === $url ) {\n\t\treturn site_dispatch_update_refused();\n\t}', 'waiting period not checked again at the download', 'Update: Jetzt aktualisieren am Pruefweg vorbei' ),
	it( UINS, 'foreign package address for the own plugin is ignored, the own address is used', UPD, '\t$answer = site_dispatch_fetch( $url, SITE_DISPATCH_ZIP_MAX_BYTES, $file );', '\t$answer = site_dispatch_fetch( is_string( $package ) ? $package : $url, SITE_DISPATCH_ZIP_MAX_BYTES, $file );', 'package address from the update list used', 'Invariante 5: nie eine URL vom Manifest oder von WordPress' ),
	it( UINS, 'install without any stored update is refused', UPD, PRE_DUE, "\tif ( null === $update ) {\n\t\treturn $reply;\n\t}\n\tif ( null === $url || ! $update['due'] ) {\n\t\treturn site_dispatch_update_refused();\n\t}", 'without a stored update the download is handed back to WordPress', 'Update: Jetzt aktualisieren am Pruefweg vorbei' ),
	it( UINS, 'zip replaced on the server is refused', UPD, GOOD_HASH, "\t\t&& is_string( $hash ) && hash_equals( $hash, $hash )\n", 'hash compared with itself', 'Update: ausgetauschtes ZIP' ),
	itEdits( UINS, 'zip with one changed byte is refused', 'hash not compared and an unreadable archive handed on (two layers: the flipped byte also breaks the zip structure)', 'Update: ausgetauschtes ZIP', [
		{ file: UPD, search: GOOD_HASH, replace: '' },
		{ file: UPD, search: '\t\t&& null !== $names && site_dispatch_zip_names_ok( $names );', replace: '\t\t&& ( null === $names || site_dispatch_zip_names_ok( $names ) );' },
	] ),
	it( UINS, 'zip of exactly 2 mb installs, one byte more is refused', UPD, '\t\t&& is_int( $size ) && $size > 0 && $size <= SITE_DISPATCH_ZIP_MAX_BYTES\n', '\t\t&& is_int( $size ) && $size > 0 && $size <= SITE_DISPATCH_ZIP_MAX_BYTES + 1\n', 'off-by-one on the zip size', 'Update: uebergrosses ZIP' ),
	it( UINS, 'validly signed zip is refused before unpacking: second top folder', UPD, NAMES_PREFIX, "\t\tif ( ! is_string( $name ) || false === strpos( $name, '/' ) ) {\n\t\t\treturn false;\n\t\t}", 'any folder accepted', 'Update: ZIP mit falschem Ordner' ),
	it( UINS, 'validly signed zip is refused before unpacking: file on top level', UPD, NAMES_PREFIX, "\t\tif ( ! is_string( $name ) || ( 0 !== strpos( $name, $prefix ) && false !== strpos( $name, '/' ) ) ) {\n\t\t\treturn false;\n\t\t}", 'top level files tolerated', 'Update: ZIP mit falschem Ordner' ),
	itEdits( UINS, 'validly signed zip is refused before unpacking: path up', 'prefix and dot segments not checked (two layers)', 'Update: Pfade nach aussen', [
		{ file: UPD, search: NAMES_PREFIX, replace: '\t\tif ( ! is_string( $name ) ) {\n\t\t\treturn false;\n\t\t}' },
		{ file: UPD, search: NAMES_PARTS, replace: "\t\t\tif ( '' === $part ) {" },
	] ),
	it( UINS, 'validly signed zip is refused before unpacking: path up inside the folder', UPD, NAMES_PARTS, "\t\t\tif ( '' === $part || '.' === $part ) {", 'parent segment not refused', 'Update: Pfade nach aussen' ),
	itEdits( UINS, 'validly signed zip is refused before unpacking: backslash path', 'backslashes normalised for the prefix check and allowed by the pattern (two layers)', 'Update: Pfade nach aussen', [
		{ file: UPD, search: NAMES_PREFIX, replace: "\t\tif ( ! is_string( $name ) || 0 !== strpos( str_replace( '\\\\', '/', $name ), $prefix ) ) {\n\t\t\treturn false;\n\t\t}" },
		{ file: UPD, search: NAMES_PATTERN, replace: "\t\tif ( 1 !== preg_match( '/^[\\x20-\\x7e]{1,512}\\z/', $name ) ) {" },
	] ),
	itEdits( UINS, 'validly signed zip is refused before unpacking: absolute path', 'absolute names skipped by the prefix check and the leading slash dropped when splitting (two layers)', 'Update: Pfade nach aussen', [
		{ file: UPD, search: NAMES_PREFIX, replace: "\t\tif ( ! is_string( $name ) || ( '/' !== $name[0] && 0 !== strpos( $name, $prefix ) ) ) {\n\t\t\treturn false;\n\t\t}" },
		{ file: UPD, search: "\t\t$parts = explode( '/', $name );", replace: "\t\t$parts = explode( '/', ltrim( $name, '/' ) );" },
	] ),
	itEdits( UINS, 'validly signed zip is refused before unpacking: other folder name', 'prefix compared without the slash and the main file found by its base name (two layers)', 'Update: ZIP mit falschem Ordner', [
		{ file: UPD, search: NAMES_PREFIX, replace: '\t\tif ( ! is_string( $name ) || 0 !== strpos( $name, SITE_DISPATCH_SLUG ) ) {\n\t\t\treturn false;\n\t\t}' },
		{ file: UPD, search: "\t\tif ( $prefix . SITE_DISPATCH_SLUG . '.php' === $name ) {", replace: "\t\tif ( SITE_DISPATCH_SLUG . '.php' === basename( $name ) ) {" },
	] ),
	it( UINS, 'validly signed zip is refused before unpacking: without the main file', UPD, '\treturn $main;\n}\n\n/**\n * Plugin file as WordPress names it', '\treturn true;\n}\n\n/**\n * Plugin file as WordPress names it', 'main file presence not checked', 'Update: ZIP mit falschem Ordner' ),
	it( UINS, 'validly signed file that is no zip is refused', UPD, '\t\t&& null !== $names && site_dispatch_zip_names_ok( $names );', '\t\t&& ( null === $names || site_dispatch_zip_names_ok( $names ) );', 'unreadable archive handed to WordPress', 'Update' ),
	it( UINS, 'package swapped after the hash check is refused right before unpacking: content', UPD, "\t$hash = is_string( $file ) && $file === $handed['file'] && file_exists( $file ) ? hash_file( 'sha512', $file ) : false;", "\t$hash = $handed['sha512'];", 'second hash taken from memory instead of the file', 'Update: Dateitausch zwischen Pruefung und Installation' ),
	it( UINS, 'package swapped after the hash check is refused right before unpacking: path', UPD, "\t$hash = is_string( $file ) && $file === $handed['file'] && file_exists( $file ) ? hash_file( 'sha512', $file ) : false;", "\t$hash = $handed['sha512'];", 'second hash taken from memory instead of the file', 'Update: Dateitausch zwischen Pruefung und Installation' ),
	it( UINS, 'the swap of the test really installs when the second hash is not there to stop it', MAIN, "add_filter( 'pre_unzip_file', 'site_dispatch_pre_unzip', PHP_INT_MAX, 2 );", "add_filter( 'pre_unzip_file', 'site_dispatch_pre_unzip', PHP_INT_MAX - 1, 2 );", 'filter priority changed, the test can no longer remove it', 'Update' ),
	itEdits( UINS, 'release deleted between offer and install is refused', 'status and size checks dropped; the hash of an empty file still fails (three layers)', 'Update: Rueckruf', [
		{ file: UPD, search: "\t$good  = 200 === $answer['code']\n\t\t&& is_int( $size ) && $size > 0 && $size <= SITE_DISPATCH_ZIP_MAX_BYTES\n", replace: '\t$good  = is_int( $size ) && $size <= SITE_DISPATCH_ZIP_MAX_BYTES\n' },
	], 'survive' ),
	itEdits( UINS, 'server that does not answer at install time is refused', 'status and size checks dropped; the hash of an empty file still fails (three layers)', 'Update', [
		{ file: UPD, search: "\t$good  = 200 === $answer['code']\n\t\t&& is_int( $size ) && $size > 0 && $size <= SITE_DISPATCH_ZIP_MAX_BYTES\n", replace: '\t$good  = is_int( $size ) && $size <= SITE_DISPATCH_ZIP_MAX_BYTES\n' },
	], 'survive' ),
	it( UINS, 'redirect of the zip to http is not followed', UPD, URL_PATTERN, UP( '/^https?:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ), 'http redirects followed', 'Update: http' ),
	it( UINS, 'refused install leaves no temp file behind', UPD, '\tif ( ! $good ) {\n\t\twp_delete_file( $file );\n\t\treturn site_dispatch_update_refused();\n\t}', '\tif ( ! $good ) {\n\t\treturn site_dispatch_update_refused();\n\t}', 'temp file not deleted on refusal', 'Update' ),
	it( UINS, 'update of another plugin passes all filters untouched', UPD, '\tif ( ! $own_target && ! $own_package ) {\n\t\treturn $reply;\n\t}', '\tif ( ! $own_target && ! $own_package ) {\n\t\treturn site_dispatch_update_refused();\n\t}', 'foreign downloads refused', 'Update: fremde Plugins unberuehrt' ),
	it( UINS, 'the own package address for another target is refused', UPD, '\tif ( ! $own_target ) {\n\t\treturn site_dispatch_update_refused();\n\t}', '\tif ( ! $own_target ) {\n\t\treturn $reply;\n\t}', 'own package for another plugin handed back to WordPress', 'Invariante 7: nur der eigene Slug' ),
	it( UINS, 'after the update cron and options are there and the daily report is still sent', REPORT, "\t\t'reporter_version'     => SITE_DISPATCH_VERSION,", "\t\t'reporter_version'     => '1.0.0',", 'hard-coded reporter version', 'Update' ),
	it( UINS, 'after the update the offer is gone and the next check clears the stored update', UPD, "\tif ( 'not_newer' === $verdict || 'unfit' === $verdict ) {", "\tif ( 'unfit' === $verdict ) {", 'not newer no longer deletes', 'Update' ),

	// ----- catalogue "Update": keys -----
	it( UKEY, 'key change: new keys arrive with a release signed by a known key, old keys stop counting', VERIFY, VERIFY_LOOP_INT, '\t\tforeach ( array_slice( $keys, 0, 1 ) as $key ) {\n\t\t\tif ( sodium', 'only the work key checked', 'Update: Schluesselwechsel' ),
	itEdits( UKEY, 'build with an http release address fetches nothing', 'http allowed for the release base and for every fetched address (two layers)', 'Update: http', [
		{ file: UPD, search: BASE_PATTERN, replace: BP( '/^https?:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?:\\/[A-Za-z0-9._-]+)+\\z/' ) },
		{ file: UPD, search: URL_PATTERN, replace: UP( '/^https?:\\/\\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::443)?\\/[\\x21-\\x5b\\x5d-\\x7e]*\\z/' ) },
	] ),
	it( UKEY, 'keys and release address cannot be changed at run time', UPD, "\t$manifest_url = site_dispatch_release_url( SITE_DISPATCH_RELEASE_BASE, 'manifest.json' );\n\t$sig_url      = site_dispatch_release_url( SITE_DISPATCH_RELEASE_BASE, 'manifest.json.sig' );", "\t$base         = (string) get_option( 'site_dispatch_release_base', SITE_DISPATCH_RELEASE_BASE );\n\t$manifest_url = site_dispatch_release_url( $base, 'manifest.json' );\n\t$sig_url      = site_dispatch_release_url( $base, 'manifest.json.sig' );", 'release address read from an option', 'Invariante 4: Update-Quelle fest im Code' ),
];
export const M = [ ...PHP, ...TOOLS, ...INTEGRATION ];
