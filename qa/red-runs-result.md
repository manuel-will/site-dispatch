# Red runs, 2026-10-04T09:42Z

Output of `node qa/red-runs.mjs` (independent QA run, phase 6), merged from several invocations.
Every mutation edits a throwaway copy of the production code; the checkout is hashed before and
after by every invocation. Red means: with the mutation applied the named case failed (or its
suite crashed before it) while the unmutated copy was green before and after.

How the Playground part was run: a background command of this session dies after two hours, and the
first two invocations (budget 210 min) were killed before writing their report. Their stderr logs
(one line per mutation: RED, gap or MISS) survived. The remaining mutations ran in chunks
(`--specs`, `--limit`, `--skip=<earlier logs>`); a mutation that was red in an earlier log is
reported as "yes (earlier run)" and not run again. Mutations that missed in their first run were
corrected and rerun alone (report: accepted report plans no retry; enroll: host that is not valid
never causes a request; update-install: zip with one changed byte is refused, validly signed zip is
refused before unpacking: absolute path; update-check: redirect to a relative address ...); the
first, missing attempt is superseded by the corrected mutation shown here. One case was reclassified
as a coverage gap after its first run (admin: key is not part of the autoloaded options, the option
is written by the test harness).

"two layers" / "three layers" in a reason: a single weakened check is hidden by a second (third)
line of defence, so the mutation weakens both; the case is proven to fail, but a single realistic
slip in that place would not be caught by this test alone. Entries under "Coverage gap mutations"
are expected to survive and say why.

The PHPUnit cases are all 199 (data sets counted as the runner counts them). Test added by this
run: `tests/integration/hygiene.test.mjs` (debug.log never carries key or secret, leak inventory
7). Test strengthened: `tests/integration/enroll.test.mjs`, "host that is not valid never causes a
request" now counts HTTP attempts before the test reroute (see qa-summary).

Repo files changed during the runs: php+tools: none; consolidation: none; chunk F: none; chunk B2: none; chunk G: run did not finish; chunk B3: none; chunk H: none; chunk A3: none; chunk I: none.
Runtimes: php+tools 7 min, consolidation 17 min, chunk F 9 min, chunk B2 73 min, chunk G ?, chunk B3 77 min, chunk H 7 min, chunk A3 89 min, chunk I 4 min.

## phpunit

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | HostsTest::test_valid_host_is_returned_unchanged | includes/hosts.php | off-by-one on the minimum length, x.de refused | yes (fail) |  |
| 2 | HostsTest::test_upper_case_becomes_lower_case | includes/hosts.php | input not lower-cased | yes (fail) |  |
| 3 | HostsTest::test_host_with_scheme_is_rejected | includes/hosts.php | scheme tolerated | yes (fail) |  |
| 4 | HostsTest::test_host_with_path_is_rejected | includes/hosts.php | path cut off | yes (fail) |  |
| 5 | HostsTest::test_host_with_user_is_rejected | includes/hosts.php | user part cut off | yes (fail) |  |
| 6 | HostsTest::test_ipv4_literal_is_rejected | includes/hosts.php | last label without its letter rule, IPv4 passes | yes (fail) |  |
| 7 | HostsTest::test_ipv6_literal_is_rejected | includes/hosts.php | IPv6 literals allowed | yes (fail) |  |
| 8 | HostsTest::test_localhost_is_rejected | includes/hosts.php | single label names allowed | yes (fail) | HostsTest::test_internal_single_label_name_is_rejected |
| 9 | HostsTest::test_internal_single_label_name_is_rejected | includes/hosts.php | internal container names allowed | yes (fail) | HostsTest::test_localhost_is_rejected |
| 10 | HostsTest::test_host_with_port_is_rejected | includes/hosts.php | port cut off | yes (fail) |  |
| 11 | HostsTest::test_whitespace_is_rejected | includes/hosts.php | input trimmed before the check | yes (fail) |  |
| 12 | HostsTest::test_punycode_label_is_rejected | includes/hosts.php | punycode check dropped | yes (fail) |  |
| 13 | HostsTest::test_host_of_254_characters_is_rejected | includes/hosts.php | off-by-one on the maximum length | yes (fail) |  |
| 14 | HostsTest::test_label_of_64_characters_is_rejected | includes/hosts.php | off-by-one on the label length | yes (fail) |  |
| 15 | HostsTest::test_trailing_dot_and_empty_label_are_rejected | includes/hosts.php | trailing dot allowed | yes (fail) |  |
| 16 | HostsTest::test_norm_host_trims_lowers_and_drops_a_leading_www | includes/hosts.php | no trim in the normalisation | yes (fail) |  |
| 17 | HostsTest::test_norm_host_drops_only_a_leading_www | includes/hosts.php | www found anywhere, not only at the start | yes (fail) |  |
| 18 | KeysTest::test_key_file_declares_two_keys_and_nothing_else | includes/keys.php | a third key added | yes (fail) | KeysTest::test_both_keys_are_32_bytes; UpdaterTest::test_keys_the_built_in_keys_decode |
| 19 | KeysTest::test_both_keys_are_32_bytes | includes/keys.php | key text lost a character | yes (fail) | KeysTest::test_key_file_declares_two_keys_and_nothing_else; UpdaterTest::test_keys_the_built_in_keys_decode |
| 20 | KeysTest::test_the_two_keys_differ | includes/keys.php | reserve key equals the work key | yes (fail) |  |
| 21 | KeysTest::test_source_file_declares_the_address_and_nothing_else | includes/source.php | release address made overridable | yes (fail) |  |
| 22 | KeysTest::test_release_address_is_the_repository | includes/source.php | trailing slash in the address | yes (fail) |  |
| 23 | ManifestAcceptableTest::test_higher_version_is_accepted | includes/verify.php | arguments of the version comparison swapped | yes (fail) | ManifestAcceptableTest::test_lower_version_is_rejected; ManifestAcceptableTest::test_versions_compare_as_numbers_not_as_text; ManifestAcceptableTest::test_numbers_beyond_the_integer_range_still_compare; ManifestAcceptableTest::test_exactly_the_required_versions_are_enough; ManifestAcceptableTest::test_version_strings_with_a_vendor_suffix_are_read_by_their_numbers; UpdaterTest::test_judge_valid_with_key_a; UpdaterTest::test_judge_valid_with_key_b; UpdaterTest::test_judge_compares_numbers_not_text |
| 24 | ManifestAcceptableTest::test_same_version_is_rejected | includes/verify.php | same version accepted | yes (fail) | ManifestAcceptableTest::test_leading_zeros_do_not_make_a_version_higher |
| 25 | ManifestAcceptableTest::test_lower_version_is_rejected | includes/verify.php | any different version accepted | yes (fail) | ManifestAcceptableTest::test_versions_compare_as_numbers_not_as_text; ManifestAcceptableTest::test_numbers_beyond_the_integer_range_still_compare |
| 26 | ManifestAcceptableTest::test_versions_compare_as_numbers_not_as_text | includes/verify.php | versions compared as text | yes (fail) | UpdaterTest::test_judge_compares_numbers_not_text |
| 27 | ManifestAcceptableTest::test_leading_zeros_do_not_make_a_version_higher | includes/verify.php | leading zeros kept on one side | yes (fail) | ManifestAcceptableTest::test_numbers_beyond_the_integer_range_still_compare |
| 28 | ManifestAcceptableTest::test_numbers_beyond_the_integer_range_still_compare | includes/verify.php | parts cast to int, overflow makes them equal | yes (fail) |  |
| 29 | ManifestAcceptableTest::test_php_that_is_too_old_is_rejected | includes/verify.php | PHP minimum not checked | yes (fail) | UpdaterTest::test_judge_php_too_old |
| 30 | ManifestAcceptableTest::test_wordpress_that_is_too_old_is_rejected | includes/verify.php | WordPress minimum not checked | yes (fail) | UpdaterTest::test_judge_wordpress_too_old |
| 31 | ManifestAcceptableTest::test_exactly_the_required_versions_are_enough | includes/verify.php | exactly the required PHP version is not enough | yes (fail) |  |
| 32 | ManifestAcceptableTest::test_version_strings_with_a_vendor_suffix_are_read_by_their_numbers | includes/verify.php | version parts anchored at the end, vendor suffixes fail | yes (fail) |  |
| 33 | ManifestAcceptableTest::test_unreadable_running_versions_are_rejected | includes/verify.php | unreadable running PHP version falls back to the constant | yes (fail) |  |
| 34 | ManifestAcceptableTest::test_foreign_slug_is_rejected | includes/verify.php | slug not checked before acceptance | yes (fail) |  |
| 35 | ManifestAcceptableTest::test_array_that_is_not_a_manifest_is_rejected | includes/verify.php | missing key read without ??, a bare array raises a warning | yes (fail) |  |
| 36 | ParseManifestTest::test_valid_manifest_returns_exactly_the_seven_fields | includes/verify.php | requires_wp and requires_php swapped in the result | yes (fail) | UpdaterTest::test_judge_valid_with_key_a; UpdaterTest::test_judge_valid_with_key_b; UpdaterTest::test_judge_compares_numbers_not_text |
| 37 | ParseManifestTest::test_manifest_vector_from_the_protocol_parses | includes/verify.php | hex character class typo, f missing | yes (fail) |  |
| 38 | ParseManifestTest::test_text_that_is_not_json_is_rejected | includes/verify.php | type guard removed, get_object_vars on null | yes (fail) | ParseManifestTest::test_json_list_instead_of_object_is_rejected; ParseManifestTest::test_nested_value_is_rejected; UpdaterTest::test_next_manifest_that_does_not_parse_keeps |
| 39 | ParseManifestTest::test_json_list_instead_of_object_is_rejected | includes/verify.php | only a failed decode refused, a list reaches get_object_vars | yes (fail) |  |
| 40 | ParseManifestTest::test_missing_field_is_rejected | includes/verify.php | unknown names refused, missing ones tolerated | yes (fail) |  |
| 41 | ParseManifestTest::test_additional_field_is_rejected | includes/verify.php | required names present, extras ignored | yes (fail) | UpdaterTest::test_judge_signed_manifest_with_an_extra_field |
| 42 | ParseManifestTest::test_foreign_slug_is_rejected | includes/verify.php | slug not checked in the parser | yes (fail) | UpdaterTest::test_judge_signed_manifest_with_a_foreign_slug |
| 43 | ParseManifestTest::test_version_with_two_parts_is_rejected | includes/verify.php | third version part optional | yes (fail) | UpdaterTest::test_url_of_a_foreign_zip_name_is_refused; UpdaterTest::test_judge_installed_version_without_form; UpdaterTest::test_stored_damaged_option_is_refused with data set "version without form" |
| 44 | ParseManifestTest::test_version_with_suffix_is_rejected | includes/verify.php | pre-release suffix allowed | yes (fail) |  |
| 45 | ParseManifestTest::test_version_with_trailing_newline_is_rejected | includes/verify.php | $ instead of \z, a trailing newline passes | yes (fail) |  |
| 46 | ParseManifestTest::test_zip_with_parent_path_is_rejected | includes/verify.php | base name of the zip compared | yes (fail) | ParseManifestTest::test_zip_as_url_is_rejected; UpdaterTest::test_judge_signed_manifest_with_a_path_as_zip |
| 47 | ParseManifestTest::test_zip_as_url_is_rejected | includes/verify.php | suffix of the zip name compared | yes (fail) | ParseManifestTest::test_zip_with_parent_path_is_rejected; UpdaterTest::test_judge_signed_manifest_with_a_path_as_zip |
| 48 | ParseManifestTest::test_zip_without_version_is_rejected | includes/verify.php | version in the zip name optional | yes (fail) | ParseManifestTest::test_zip_with_another_version_is_rejected |
| 49 | ParseManifestTest::test_zip_with_another_version_is_rejected | includes/verify.php | zip name pattern without the tie to the version | yes (fail) |  |
| 50 | ParseManifestTest::test_sha512_that_is_too_short_is_rejected | includes/verify.php | lower bound of the hash length loosened | yes (fail) |  |
| 51 | ParseManifestTest::test_sha512_in_upper_case_is_rejected | includes/verify.php | hash accepted in either case | yes (fail) |  |
| 52 | ParseManifestTest::test_manifest_of_9_kb_is_rejected | includes/verify.php | KB/MB slip | yes (fail) | ParseManifestTest::test_manifest_of_exactly_8_kb_is_accepted; UpdaterTest::test_stored_damaged_option_is_refused with data set "manifest of 9 kb" |
| 53 | ParseManifestTest::test_manifest_of_exactly_8_kb_is_accepted | includes/verify.php | off-by-one on the size limit | yes (fail) |  |
| 54 | ParseManifestTest::test_schema_as_text_is_rejected | includes/verify.php | loose comparison on schema | yes (fail) |  |
| 55 | ParseManifestTest::test_nested_value_is_rejected | includes/verify.php | default decode depth and no type guard, a nested value reaches preg_match (two layers) | yes (fail) |  |
| 56 | ReportHelpersTest::test_signature_header_matches_the_protocol_vector | includes/report.php | data and key arguments swapped | yes (fail) |  |
| 57 | ReportHelpersTest::test_iso_formats_utc_and_gives_null_for_zero | includes/report.php | zero formatted as a date instead of never | yes (fail) |  |
| 58 | ReportHelpersTest::test_pick_copies_only_the_named_fields | includes/report.php | every field of the source copied | yes (fail) |  |
| 59 | ReportHelpersTest::test_pick_drops_empty_text_lists_and_booleans | includes/report.php | booleans allowed through | yes (fail) |  |
| 60 | ReportHelpersTest::test_pick_takes_arrays_and_objects_alike | includes/report.php | objects no longer converted | yes (fail) | ReportHelpersTest::test_pick_copies_only_the_named_fields |
| 61 | ReportHelpersTest::test_pick_gives_nothing_for_a_value_that_is_no_list | includes/report.php | object conversion without the type check | yes (fail) | ReportHelpersTest::test_pick_drops_empty_text_lists_and_booleans; ReportHelpersTest::test_pick_takes_arrays_and_objects_alike |
| 62 | ReportHelpersTest::test_server_software_keeps_name_and_version | includes/report.php | version part limited to four characters | yes (fail) | ReportHelpersTest::test_server_software_cuts_everything_after_the_version; ReportHelpersTest::test_server_software_cuts_at_a_line_break |
| 63 | ReportHelpersTest::test_server_software_cuts_everything_after_the_version | includes/report.php | not cut at the first foreign character | yes (fail) | ReportHelpersTest::test_server_software_cuts_at_a_line_break |
| 64 | ReportHelpersTest::test_server_software_without_version_keeps_the_name | includes/report.php | version part required | yes (fail) | ReportHelpersTest::test_server_software_with_a_strange_version_keeps_the_name |
| 65 | ReportHelpersTest::test_server_software_with_a_strange_version_keeps_the_name | includes/report.php | no fallback to the bare name | yes (fail) |  |
| 66 | ReportHelpersTest::test_server_software_with_a_path_is_dropped | includes/report.php | slashes allowed in the name | yes (fail) |  |
| 67 | ReportHelpersTest::test_server_software_cuts_at_a_line_break | includes/report.php | whitespace allowed in the token | yes (fail) | ReportHelpersTest::test_server_software_cuts_everything_after_the_version |
| 68 | ReportHelpersTest::test_clean_refuses_a_trailing_newline | includes/report.php | value trimmed for the check only | yes (fail) |  |
| 69 | ReportHelpersTest::test_clean_takes_whole_numbers_as_text | includes/report.php | whole numbers no longer taken | yes (fail) |  |
| 70 | ReportHelpersTest::test_clean_refuses_values_that_are_not_text | includes/report.php | floats rounded to whole numbers | yes (fail) |  |
| 71 | ReportHelpersTest::test_core_auto_updates_off_when_the_updater_is_disabled | includes/report.php | AUTOMATIC_UPDATER_DISABLED ignored | yes (fail) |  |
| 72 | ReportHelpersTest::test_core_auto_updates_follows_the_constant | includes/report.php | minor setting reported as all | yes (fail) |  |
| 73 | ReportHelpersTest::test_core_auto_updates_without_constant_follows_the_option | includes/report.php | option ignored | yes (fail) |  |
| 74 | ResponsesTest::test_valid_request_response_is_parsed | includes/responses.php | result key renamed | yes (fail) | ResponsesTest::test_additional_fields_are_dropped_from_a_request_response |
| 75 | ResponsesTest::test_valid_redeem_response_is_parsed | includes/responses.php | key version returned as text | yes (fail) |  |
| 76 | ResponsesTest::test_key_of_63_characters_is_rejected | includes/responses.php | lower bound of the key length loosened | yes (fail) |  |
| 77 | ResponsesTest::test_key_of_65_characters_is_rejected | includes/responses.php | end anchor missing on the key pattern | yes (fail) |  |
| 78 | ResponsesTest::test_upper_case_in_the_key_is_rejected | includes/responses.php | key accepted in either case | yes (fail) |  |
| 79 | ResponsesTest::test_key_version_as_text_is_rejected | includes/responses.php | numeric text accepted as version | yes (fail) | ResponsesTest::test_key_version_that_is_not_a_positive_integer_is_rejected |
| 80 | ResponsesTest::test_key_version_that_is_not_a_positive_integer_is_rejected | includes/responses.php | version zero accepted | yes (fail) |  |
| 81 | ResponsesTest::test_website_id_that_is_no_uuid_is_rejected | includes/responses.php | UUID accepted in upper case | yes (fail) |  |
| 82 | ResponsesTest::test_additional_fields_are_dropped_from_a_redeem_response | includes/responses.php | decoded fields returned as they are | yes (fail) | ResponsesTest::test_valid_redeem_response_is_parsed |
| 83 | ResponsesTest::test_additional_fields_are_dropped_from_a_request_response | includes/responses.php | decoded fields returned as they are | yes (fail) | ResponsesTest::test_valid_request_response_is_parsed |
| 84 | ResponsesTest::test_response_of_5_kb_is_rejected | includes/responses.php | limit raised to 16 KB | yes (fail) |  |
| 85 | ResponsesTest::test_html_instead_of_json_is_rejected | includes/responses.php | type guard removed, get_object_vars on null | yes (fail) | ResponsesTest::test_json_list_instead_of_object_is_rejected |
| 86 | ResponsesTest::test_json_list_instead_of_object_is_rejected | includes/responses.php | only a failed decode refused, a list reaches get_object_vars | yes (fail) |  |
| 87 | ResponsesTest::test_response_without_ok_true_is_rejected | includes/responses.php | any truthy ok accepted | yes (fail) |  |
| 88 | ResponsesTest::test_pending_response_is_not_a_redeem | includes/responses.php | ok not checked and the key read without ??, a pending answer raises a warning (two layers) | yes (fail) | ResponsesTest::test_response_without_ok_true_is_rejected |
| 89 | ResponsesTest::test_user_code_with_a_look_alike_character_is_rejected | includes/responses.php | full alphabet allowed in the user code | yes (fail) |  |
| 90 | ResponsesTest::test_request_id_that_is_no_uuid_is_rejected | includes/responses.php | $ instead of \z, a trailing newline passes | yes (fail) |  |
| 91 | UpdaterTest::test_keys_two_valid_keys_are_decoded | includes/updater.php | base64 text stored instead of the raw key | yes (fail) |  |
| 92 | UpdaterTest::test_keys_the_built_in_keys_decode | includes/updater.php | length checked on the text instead of the bytes | yes (fail) | UpdaterTest::test_keys_two_valid_keys_are_decoded |
| 93 | UpdaterTest::test_keys_one_key_of_31_bytes_empties_the_list | includes/updater.php | only too long keys refused | yes (fail) |  |
| 94 | UpdaterTest::test_keys_text_that_is_not_base64_empties_the_list | includes/updater.php | faulty entries skipped instead of emptying the list | yes (fail) | UpdaterTest::test_keys_one_key_of_31_bytes_empties_the_list |
| 95 | UpdaterTest::test_keys_empty_list_stays_empty | includes/updater.php | empty list falls back to the built-in keys | yes (fail) |  |
| 96 | UpdaterTest::test_keys_entry_that_is_not_text_empties_the_list | includes/updater.php | non-text entries skipped | yes (fail) |  |
| 97 | UpdaterTest::test_redirect_https_address_is_taken | includes/updater.php | query characters refused | yes (fail) |  |
| 98 | UpdaterTest::test_redirect_port_443_is_taken | includes/updater.php | explicit port 443 refused | yes (fail) |  |
| 99 | UpdaterTest::test_redirect_is_refused with data set "http" | includes/updater.php | http allowed | yes (fail) |  |
| 100 | UpdaterTest::test_redirect_is_refused with data set "relative" | includes/updater.php | relative redirects resolved against GitHub | yes (fail) |  |
| 101 | UpdaterTest::test_redirect_is_refused with data set "protocol relative" | includes/updater.php | protocol relative redirects resolved | yes (fail) |  |
| 102 | UpdaterTest::test_redirect_is_refused with data set "user in the address" | includes/updater.php | user part allowed | yes (fail) |  |
| 103 | UpdaterTest::test_redirect_is_refused with data set "port 8443" | includes/updater.php | any port allowed | yes (fail) |  |
| 104 | UpdaterTest::test_redirect_is_refused with data set "upper case host" | includes/updater.php | upper case host allowed | yes (fail) |  |
| 105 | UpdaterTest::test_redirect_is_refused with data set "ip literal v6" | includes/updater.php | IPv6 literal allowed | yes (fail) |  |
| 106 | UpdaterTest::test_redirect_is_refused with data set "no path" | includes/updater.php | path optional | yes (fail) |  |
| 107 | UpdaterTest::test_redirect_is_refused with data set "space" | includes/updater.php | space allowed in the path | yes (fail) |  |
| 108 | UpdaterTest::test_redirect_is_refused with data set "line break at end" | includes/updater.php | $ instead of \z | yes (fail) |  |
| 109 | UpdaterTest::test_redirect_is_refused with data set "line break inside" | includes/updater.php | printable class replaced by not-backslash | yes (fail) | UpdaterTest::test_redirect_is_refused with data set "space"; UpdaterTest::test_redirect_is_refused with data set "line break at end" |
| 110 | UpdaterTest::test_redirect_is_refused with data set "too long" | includes/updater.php | length limit dropped | yes (fail) |  |
| 111 | UpdaterTest::test_redirect_is_refused with data set "empty" | includes/updater.php | error check instead of match check on preg_match | yes (fail) | UpdaterTest::test_redirect_is_refused with data set "http"; UpdaterTest::test_redirect_is_refused with data set "relative"; UpdaterTest::test_redirect_is_refused with data set "protocol relative"; UpdaterTest::test_redirect_is_refused with data set "user in the address"; UpdaterTest::test_redirect_is_refused with data set "port 8443"; UpdaterTest::test_redirect_is_refused with data set "upper case host"; UpdaterTest::test_redirect_is_refused with data set "ip literal v6"; UpdaterTest::test_redirect_is_refused with data set "no path"; UpdaterTest::test_redirect_is_refused with data set "space"; UpdaterTest::test_redirect_is_refused with data set "line break at end"; UpdaterTest::test_redirect_is_refused with data set "line break inside"; UpdaterTest::test_redirect_is_refused with data set "other scheme"; UpdaterTest::test_redirect_is_refused with data set "upper case scheme"; UpdaterTest::test_redirect_is_refused with data set "backslash after host" |
| 112 | UpdaterTest::test_redirect_is_refused with data set "other scheme" | includes/updater.php | any scheme allowed | yes (fail) | UpdaterTest::test_redirect_is_refused with data set "http" |
| 113 | UpdaterTest::test_redirect_is_refused with data set "upper case scheme" | includes/updater.php | case-insensitive address pattern | yes (fail) | UpdaterTest::test_redirect_is_refused with data set "upper case host" |
| 114 | UpdaterTest::test_redirect_is_refused with data set "backslash after host" | includes/updater.php | backslashes normalised to slashes | yes (fail) |  |
| 115 | UpdaterTest::test_redirect_address_of_4096_characters_is_taken | includes/updater.php | off-by-one on the length limit | yes (fail) |  |
| 116 | UpdaterTest::test_url_of_manifest_and_signature | includes/updater.php | path typo | yes (fail) |  |
| 117 | UpdaterTest::test_url_of_another_file_is_refused | includes/updater.php | file name not restricted | yes (fail) |  |
| 118 | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "http" | includes/updater.php | http base allowed | yes (fail) |  |
| 119 | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "trailing slash" | includes/updater.php | trailing slash allowed | yes (fail) |  |
| 120 | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "query" | includes/updater.php | query allowed | yes (fail) |  |
| 121 | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "no path" | includes/updater.php | path optional | yes (fail) |  |
| 122 | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "line break" | includes/updater.php | $ instead of \z | yes (fail) |  |
| 123 | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "empty" | includes/updater.php | error check instead of match check on preg_match | yes (fail) | UpdaterTest::test_url_with_a_bad_base_is_refused with data set "http"; UpdaterTest::test_url_with_a_bad_base_is_refused with data set "trailing slash"; UpdaterTest::test_url_with_a_bad_base_is_refused with data set "query"; UpdaterTest::test_url_with_a_bad_base_is_refused with data set "no path"; UpdaterTest::test_url_with_a_bad_base_is_refused with data set "line break" |
| 124 | UpdaterTest::test_url_of_the_zip_comes_from_version_and_name | includes/updater.php | tag prefix v forgotten | yes (fail) |  |
| 125 | UpdaterTest::test_url_of_a_foreign_zip_name_is_refused | includes/updater.php | zip name not tied to the version | yes (fail) |  |
| 126 | UpdaterTest::test_judge_valid_with_key_a | includes/verify.php | first key skipped | yes (fail) | UpdaterTest::test_judge_same_version; UpdaterTest::test_judge_lower_version; UpdaterTest::test_judge_compares_numbers_not_text; UpdaterTest::test_judge_php_too_old; UpdaterTest::test_judge_wordpress_too_old; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies; VerifySignatureTest::test_valid_signature_of_key_a_is_accepted |
| 127 | UpdaterTest::test_judge_valid_with_key_b | includes/verify.php | only the first key checked | yes (fail) | VerifySignatureTest::test_valid_signature_of_key_b_is_accepted |
| 128 | UpdaterTest::test_judge_unknown_key | includes/updater.php | a readable manifest is trusted without a signature | yes (fail) | UpdaterTest::test_judge_flipped_bit_in_the_signature; UpdaterTest::test_judge_signature_of_63_and_65_bytes; UpdaterTest::test_judge_signature_for_the_namespace_git; UpdaterTest::test_judge_empty_key_list |
| 129 | UpdaterTest::test_judge_flipped_bit_in_the_manifest | includes/updater.php | bad signature reported as not newer, which deletes a waiting update | yes (fail) | UpdaterTest::test_judge_unknown_key; UpdaterTest::test_judge_flipped_bit_in_the_signature; UpdaterTest::test_judge_signature_of_63_and_65_bytes; UpdaterTest::test_judge_signature_for_the_namespace_git; UpdaterTest::test_judge_empty_key_list |
| 130 | UpdaterTest::test_judge_flipped_bit_in_the_signature | includes/updater.php | a signature of the right length is trusted | yes (fail) | UpdaterTest::test_judge_unknown_key; UpdaterTest::test_judge_signature_for_the_namespace_git; UpdaterTest::test_judge_empty_key_list |
| 131 | UpdaterTest::test_judge_signature_of_63_and_65_bytes | includes/updater.php | only an empty signature is fatal | yes (fail) | UpdaterTest::test_judge_unknown_key; UpdaterTest::test_judge_flipped_bit_in_the_signature; UpdaterTest::test_judge_signature_for_the_namespace_git; UpdaterTest::test_judge_empty_key_list |
| 132 | UpdaterTest::test_judge_signature_for_the_namespace_git | includes/verify.php | namespace left out of the signed blob | yes (fail) | VerifySignatureTest::test_blob_matches_the_documented_vector; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies; VerifySignatureTest::test_signature_made_for_namespace_git_is_rejected |
| 133 | UpdaterTest::test_judge_empty_key_list | includes/verify.php | fail open without keys | yes (fail) | VerifySignatureTest::test_empty_key_list_is_rejected |
| 134 | UpdaterTest::test_judge_signed_manifest_with_an_extra_field | includes/verify.php | extra manifest fields ignored | yes (fail) | ParseManifestTest::test_additional_field_is_rejected |
| 135 | UpdaterTest::test_judge_signed_manifest_with_a_foreign_slug | includes/verify.php | slug not checked in the parser | yes (fail) | ParseManifestTest::test_foreign_slug_is_rejected |
| 136 | UpdaterTest::test_judge_signed_manifest_with_a_path_as_zip | includes/verify.php | base name of the zip compared | yes (fail) | ParseManifestTest::test_zip_with_parent_path_is_rejected; ParseManifestTest::test_zip_as_url_is_rejected |
| 137 | UpdaterTest::test_judge_same_version | includes/updater.php | same version not refused by the verdict | yes (fail) |  |
| 138 | UpdaterTest::test_judge_lower_version | includes/updater.php | only the same version refused | yes (fail) |  |
| 139 | UpdaterTest::test_judge_compares_numbers_not_text | includes/verify.php | versions compared as text | yes (fail) | ManifestAcceptableTest::test_versions_compare_as_numbers_not_as_text |
| 140 | UpdaterTest::test_judge_php_too_old | includes/verify.php | PHP minimum not checked | yes (fail) | ManifestAcceptableTest::test_php_that_is_too_old_is_rejected |
| 141 | UpdaterTest::test_judge_wordpress_too_old | includes/verify.php | WordPress minimum not checked | yes (fail) | ManifestAcceptableTest::test_wordpress_that_is_too_old_is_rejected |
| 142 | UpdaterTest::test_judge_installed_version_without_form | includes/updater.php | installed version not checked for its form | yes (fail) |  |
| 143 | UpdaterTest::test_stored_valid_option_is_read | includes/updater.php | base64 text returned instead of the manifest bytes | yes (fail) |  |
| 144 | UpdaterTest::test_stored_damaged_option_is_refused with data set "not an array" | includes/updater.php | array guard removed and a key read without ??, a text option raises a TypeError (two layers) | yes (fail) | UpdaterTest::test_stored_damaged_option_is_refused with data set "null" |
| 145 | UpdaterTest::test_stored_damaged_option_is_refused with data set "null" | includes/updater.php | array guard removed and a key read without ??, a null option raises a warning (two layers) | yes (fail) | UpdaterTest::test_stored_damaged_option_is_refused with data set "not an array" |
| 146 | UpdaterTest::test_stored_damaged_option_is_refused with data set "missing signature" | includes/updater.php | key read without ??, a missing signature raises a warning | yes (fail) |  |
| 147 | UpdaterTest::test_stored_damaged_option_is_refused with data set "manifest not base64" | includes/updater.php | undecodable text kept as it is | yes (fail) |  |
| 148 | UpdaterTest::test_stored_damaged_option_is_refused with data set "empty manifest" | includes/updater.php | empty manifest accepted | yes (fail) |  |
| 149 | UpdaterTest::test_stored_damaged_option_is_refused with data set "manifest of 9 kb" | includes/updater.php | stored manifest limit doubled | yes (fail) |  |
| 150 | UpdaterTest::test_stored_damaged_option_is_refused with data set "signature of 63 bytes" | includes/updater.php | only too long signatures refused | yes (fail) |  |
| 151 | UpdaterTest::test_stored_damaged_option_is_refused with data set "version without form" | includes/updater.php | stored version not checked for its form | yes (fail) |  |
| 152 | UpdaterTest::test_stored_damaged_option_is_refused with data set "first seen as text" | includes/updater.php | numeric text accepted as time stamp | yes (fail) |  |
| 153 | UpdaterTest::test_stored_damaged_option_is_refused with data set "first seen negative" | includes/updater.php | negative time stamp accepted | yes (fail) |  |
| 154 | UpdaterTest::test_next_failed_fetch_keeps_the_stored_update | includes/updater.php | a failed fetch deletes the waiting update | yes (fail) | UpdaterTest::test_next_unknown_fetch_result_keeps_the_stored_update |
| 155 | UpdaterTest::test_next_unknown_fetch_result_keeps_the_stored_update | includes/updater.php | only the known failure keeps, anything else goes on | yes (fail) |  |
| 156 | UpdaterTest::test_next_missing_release_deletes | includes/updater.php | a deleted release keeps the waiting update | yes (fail) |  |
| 157 | UpdaterTest::test_next_invalid_release_keeps_the_stored_update | includes/updater.php | an invalid signature cancels the waiting update | yes (fail) |  |
| 158 | UpdaterTest::test_next_release_that_is_not_newer_deletes | includes/updater.php | not newer no longer deletes | yes (fail) |  |
| 159 | UpdaterTest::test_next_release_that_does_not_fit_deletes | includes/updater.php | unfit no longer deletes | yes (fail) |  |
| 160 | UpdaterTest::test_next_same_release_keeps_first_seen | includes/updater.php | every check stores again and restarts the clock | yes (fail) |  |
| 161 | UpdaterTest::test_next_first_release_is_stored_with_the_local_time | includes/updater.php | wall clock instead of the given time | yes (fail) | UpdaterTest::test_next_new_version_starts_the_clock_again; UpdaterTest::test_next_other_bytes_for_the_same_version_start_the_clock_again |
| 162 | UpdaterTest::test_next_new_version_starts_the_clock_again | includes/updater.php | any stored update is kept, a new version never arrives | yes (fail) | UpdaterTest::test_next_other_bytes_for_the_same_version_start_the_clock_again |
| 163 | UpdaterTest::test_next_other_bytes_for_the_same_version_start_the_clock_again | includes/updater.php | manifest bytes not compared, only the version | yes (fail) |  |
| 164 | UpdaterTest::test_next_manifest_that_does_not_parse_keeps | includes/updater.php | an unreadable manifest deletes | yes (fail) |  |
| 165 | UpdaterTest::test_due_not_before_72_hours | includes/updater.php | digit lost in the delay | yes (fail) |  |
| 166 | UpdaterTest::test_due_at_72_hours | includes/updater.php | off-by-one at exactly 72 hours | yes (fail) |  |
| 167 | UpdaterTest::test_due_at_once_with_the_switch | includes/updater.php | switch for immediate updates ignored | yes (fail) |  |
| 168 | UpdaterTest::test_due_first_seen_in_the_future_waits | includes/updater.php | a stamp in the future counts as due | yes (fail) |  |
| 169 | UpdaterTest::test_names_good_list | includes/updater.php | main file name slip | yes (fail) |  |
| 170 | UpdaterTest::test_names_are_refused with data set "empty list" | includes/updater.php | an empty archive passes | yes (fail) |  |
| 171 | UpdaterTest::test_names_are_refused with data set "without the main file" | includes/updater.php | main file presence not checked | yes (fail) | UpdaterTest::test_names_are_refused with data set "empty list" |
| 172 | UpdaterTest::test_names_are_refused with data set "second top folder" | includes/updater.php | any folder accepted | yes (fail) | UpdaterTest::test_names_are_refused with data set "folder with suffix"; UpdaterTest::test_names_are_refused with data set "drive letter"; UpdaterTest::test_names_are_refused with data set "upper case folder" |
| 173 | UpdaterTest::test_names_are_refused with data set "file on top level" | includes/updater.php | top level files tolerated | yes (fail) |  |
| 174 | UpdaterTest::test_names_are_refused with data set "folder with suffix" | includes/updater.php | prefix compared without the slash | yes (fail) |  |
| 175 | UpdaterTest::test_names_are_refused with data set "path up at the start" | includes/updater.php | prefix and dot segments not checked (two layers) | yes (fail) | UpdaterTest::test_names_are_refused with data set "second top folder"; UpdaterTest::test_names_are_refused with data set "file on top level"; UpdaterTest::test_names_are_refused with data set "folder with suffix"; UpdaterTest::test_names_are_refused with data set "path up in the middle"; UpdaterTest::test_names_are_refused with data set "path up at the end"; UpdaterTest::test_names_are_refused with data set "single dot"; UpdaterTest::test_names_are_refused with data set "drive letter"; UpdaterTest::test_names_are_refused with data set "upper case folder" |
| 176 | UpdaterTest::test_names_are_refused with data set "path up in the middle" | includes/updater.php | parent segment not refused | yes (fail) | UpdaterTest::test_names_are_refused with data set "path up at the end" |
| 177 | UpdaterTest::test_names_are_refused with data set "path up at the end" | includes/updater.php | last segment always dropped as the file name | yes (fail) |  |
| 178 | UpdaterTest::test_names_are_refused with data set "single dot" | includes/updater.php | single dot segment not refused | yes (fail) |  |
| 179 | UpdaterTest::test_names_are_refused with data set "double slash" | includes/updater.php | empty segment not refused | yes (fail) |  |
| 180 | UpdaterTest::test_names_are_refused with data set "backslash" | includes/updater.php | backslashes normalised for the prefix check and allowed by the pattern (two layers) | yes (fail) |  |
| 181 | UpdaterTest::test_names_are_refused with data set "absolute path" | includes/updater.php | leading slashes tolerated in the prefix check and when splitting (two layers) | yes (fail) |  |
| 182 | UpdaterTest::test_names_are_refused with data set "drive letter" | includes/updater.php | prefix found anywhere in the name | yes (fail) |  |
| 183 | UpdaterTest::test_names_are_refused with data set "null byte" | includes/updater.php | printable class replaced by not-backslash | yes (fail) |  |
| 184 | UpdaterTest::test_names_are_refused with data set "empty name" | includes/updater.php | foreign entries skipped instead of refusing the archive | yes (fail) | UpdaterTest::test_names_are_refused with data set "second top folder"; UpdaterTest::test_names_are_refused with data set "file on top level"; UpdaterTest::test_names_are_refused with data set "folder with suffix"; UpdaterTest::test_names_are_refused with data set "path up at the start"; UpdaterTest::test_names_are_refused with data set "backslash"; UpdaterTest::test_names_are_refused with data set "absolute path"; UpdaterTest::test_names_are_refused with data set "drive letter"; UpdaterTest::test_names_are_refused with data set "not text"; UpdaterTest::test_names_are_refused with data set "upper case folder" |
| 185 | UpdaterTest::test_names_are_refused with data set "not text" | includes/updater.php | non-text entries skipped | yes (fail) |  |
| 186 | UpdaterTest::test_names_are_refused with data set "upper case folder" | includes/updater.php | case-insensitive prefix check | yes (fail) |  |
| 187 | VerifySignatureTest::test_blob_matches_the_documented_vector | includes/verify.php | little endian length in the blob | yes (fail) | VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies |
| 188 | VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies | includes/verify.php | wrong hash over the message, the test keys still agree with themselves | yes (fail) | VerifySignatureTest::test_blob_matches_the_documented_vector |
| 189 | VerifySignatureTest::test_valid_signature_of_key_a_is_accepted | includes/verify.php | first key skipped | yes (fail) | UpdaterTest::test_judge_valid_with_key_a; UpdaterTest::test_judge_same_version; UpdaterTest::test_judge_lower_version; UpdaterTest::test_judge_compares_numbers_not_text; UpdaterTest::test_judge_php_too_old; UpdaterTest::test_judge_wordpress_too_old; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies |
| 190 | VerifySignatureTest::test_valid_signature_of_key_b_is_accepted | includes/verify.php | only the first key checked | yes (fail) | UpdaterTest::test_judge_valid_with_key_b |
| 191 | VerifySignatureTest::test_signature_of_a_foreign_key_is_rejected | includes/verify.php | result of the check thrown away | yes (fail) | UpdaterTest::test_judge_unknown_key; UpdaterTest::test_judge_flipped_bit_in_the_signature; UpdaterTest::test_judge_signature_for_the_namespace_git; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies; VerifySignatureTest::test_one_flipped_bit_in_the_manifest_is_rejected; VerifySignatureTest::test_one_flipped_bit_in_the_signature_is_rejected; VerifySignatureTest::test_signature_made_for_namespace_git_is_rejected |
| 192 | VerifySignatureTest::test_one_flipped_bit_in_the_manifest_is_rejected | includes/verify.php | blob hashes the namespace instead of the message | yes (fail) | VerifySignatureTest::test_blob_matches_the_documented_vector; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies |
| 193 | VerifySignatureTest::test_one_flipped_bit_in_the_signature_is_rejected | includes/verify.php | verdict initialised as valid | yes (fail) | UpdaterTest::test_judge_unknown_key; UpdaterTest::test_judge_flipped_bit_in_the_signature; UpdaterTest::test_judge_signature_for_the_namespace_git; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies; VerifySignatureTest::test_signature_of_a_foreign_key_is_rejected; VerifySignatureTest::test_one_flipped_bit_in_the_manifest_is_rejected; VerifySignatureTest::test_signature_made_for_namespace_git_is_rejected |
| 194 | VerifySignatureTest::test_signature_of_63_bytes_is_rejected | includes/verify.php | length guard loosened and sodium exception no longer caught (two layers) | yes (fail) | UpdaterTest::test_judge_signature_of_63_and_65_bytes |
| 195 | VerifySignatureTest::test_signature_of_65_bytes_is_rejected | includes/verify.php | length guard loosened and sodium exception no longer caught (two layers) | yes (fail) | UpdaterTest::test_judge_signature_of_63_and_65_bytes |
| 196 | VerifySignatureTest::test_empty_key_list_is_rejected | includes/verify.php | fail open without keys | yes (fail) | UpdaterTest::test_judge_empty_key_list |
| 197 | VerifySignatureTest::test_signature_made_for_namespace_git_is_rejected | includes/verify.php | namespace left out of the signed blob | yes (fail) | UpdaterTest::test_judge_signature_for_the_namespace_git; VerifySignatureTest::test_blob_matches_the_documented_vector; VerifySignatureTest::test_fixed_vector_from_the_protocol_verifies |
| 198 | VerifySignatureTest::test_key_of_wrong_length_is_rejected | includes/verify.php | key length not checked and sodium exception no longer caught (two layers) | yes (fail) | VerifySignatureTest::test_a_malformed_key_next_to_a_valid_one_rejects_the_whole_list |
| 199 | VerifySignatureTest::test_a_malformed_key_next_to_a_valid_one_rejects_the_whole_list | includes/verify.php | malformed keys skipped instead of refusing the list | yes (fail) |  |

Cases: 199, shown red: 199, mutations run: 199


## tools

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | zip: the same entries give the same bytes | tools/lib/zip.mjs | offset counter hoisted to module scope, every archive after the first is shifted | yes (fail) | zip: the order of the input does not matter; zip: every entry is stored with its bytes, without compression, with the fixed date; test build: same keys give the same release, and only three files differ from the source; test build: the release verifies with its own key and carries the hash of its zip |
| 2 | zip: the order of the input does not matter | tools/lib/zip.mjs | entries no longer sorted | yes (fail) | zip: every entry is stored with its bytes, without compression, with the fixed date |
| 3 | zip: every entry is stored with its bytes, without compression, with the fixed date | tools/lib/zip.mjs | central directory claims deflate while the bytes are stored | yes (fail) |  |
| 4 | sshsig: the blob equals the vector of PROTOCOL.md | tools/lib/sshsig.mjs | reserved field left out of the blob | yes (fail) | sshsig: the vector verifies, and not for another namespace or a flipped bit; sshsig: what OpenSSH writes is read and verifies |
| 5 | sshsig: the vector verifies, and not for another namespace or a flipped bit | tools/lib/sshsig.mjs | namespace argument ignored when verifying | yes (fail) |  |
| 6 | sshsig: an armored file is read back | tools/lib/sshsig.mjs | namespace and reserved field read in the wrong order | yes (fail) | sshsig: what OpenSSH writes is read and verifies; finish-release takes the raw signature and uploads nothing; finish-release takes a signature of the reserve key; finish-release refuses the signature of an unknown key; finish-release refuses a signature over another manifest; finish-release refuses a signature made for another namespace |
| 7 | sshsig: damaged or foreign files are refused | tools/lib/sshsig.mjs | signature length not checked | yes (fail) |  |
| 8 | sshsig: what OpenSSH writes is read and verifies | tools/lib/sshsig.mjs | wrong hash algorithm expected in the armored file | yes (fail) | sshsig: an armored file is read back; finish-release takes the raw signature and uploads nothing; finish-release takes a signature of the reserve key; finish-release refuses the signature of an unknown key; finish-release refuses a signature over another manifest; finish-release refuses a signature made for another namespace |
| 9 | release: the commit gives the same file set as the folder, nothing from tests, tools or docs | tools/lib/release.mjs | docs folder walked from the working folder while the commit export-ignores it | yes (fail) |  |
| 10 | release: the manifest has the seven fields, no line break, and the plugin takes it | tools/lib/release.mjs | trailing newline on the manifest | yes (fail) |  |
| 11 | release: version is read from header and constant, and both have to agree | tools/lib/release.mjs | minimum versions swapped | yes (fail) | finish-release refuses a manifest that was changed after the build |
| 12 | test build: same keys give the same release, and only three files differ from the source | tools/build-test-zip.mjs | build stamp in a generated file | yes (fail) |  |
| 13 | test build: the release verifies with its own key and carries the hash of its zip | tools/build-test-zip.mjs | zip signed instead of the manifest | yes (fail) |  |
| 14 | build-release builds zip and manifest and says what comes next | tools/build-release.mjs | hash of the wrong file shown | yes (fail) |  |
| 15 | build-release gives the same zip twice, and in a second clone of the same commit | tools/lib/release.mjs | build stamp file added to the archive | yes (fail) | finish-release takes the raw signature and uploads nothing; finish-release takes a signature of the reserve key; finish-release refuses the signature of an unknown key; finish-release refuses a signature over another manifest; finish-release refuses a signature made for another namespace |
| 16 | build-release refuses with a change that is not committed | tools/build-release.mjs | working tree not checked | yes (fail) | build-release refuses with a new file that is not committed |
| 17 | build-release refuses with a new file that is not committed | tools/build-release.mjs | untracked files ignored | yes (fail) |  |
| 18 | build-release refuses a version that is not x.y.z | tools/lib/release.mjs | third version part optional | yes (fail) | release: version is read from header and constant, and both have to agree |
| 19 | build-release refuses when header and constant differ | tools/lib/release.mjs | header and constant not compared | yes (fail) | release: version is read from header and constant, and both have to agree |
| 20 | build-release refuses keys that are not the pinned ones | tools/lib/release.mjs | keys.php not pinned | yes (fail) |  |
| 21 | build-release refuses a release address that is not the pinned one | tools/lib/release.mjs | source.php not pinned | yes (fail) |  |
| 22 | build-release refuses when the tag exists | tools/build-release.mjs | existing tag not checked | yes (fail) |  |
| 23 | finish-release takes the raw signature and uploads nothing | tools/finish-release.mjs | armored file copied instead of the raw signature | yes (fail) |  |
| 24 | finish-release takes a signature of the reserve key | tools/finish-release.mjs | only the work key accepted | yes (fail) |  |
| 25 | finish-release refuses without a signature file | tools/finish-release.mjs | missing signature file treated as empty | yes (fail) |  |
| 26 | finish-release refuses the signature of an unknown key | tools/finish-release.mjs | verified against the key named inside the signature file | yes (fail) |  |
| 27 | finish-release ignores the key named inside the signature file | tools/finish-release.mjs | verification skipped, the namespace check is trusted | yes (fail) | finish-release refuses the signature of an unknown key; finish-release refuses a signature over another manifest |
| 28 | finish-release refuses a signature over another manifest | tools/finish-release.mjs | verification only enforced for a foreign namespace | yes (fail) | finish-release refuses the signature of an unknown key; finish-release ignores the key named inside the signature file |
| 29 | finish-release refuses a signature made for another namespace | tools/finish-release.mjs | namespace not checked | yes (fail) |  |
| 30 | finish-release refuses a zip that was changed after the build | tools/finish-release.mjs | only the manifest compared with the build | yes (fail) |  |
| 31 | finish-release refuses a manifest that was changed after the build | tools/finish-release.mjs | only the zip compared with the build | yes (fail) |  |
| 32 | finish-release refuses when the commit changed since the build | tools/finish-release.mjs | commit not compared with the build | yes (fail) |  |

Coverage gap mutations (expected to survive):

| Case | File | Mutation reason | Survived |
|---|---|---|---|
| zip: one changed byte changes the archive | tools/lib/zip.mjs | crc over the name instead of the data (the data itself still differs, so the archive changes: no realistic bug keeps an archive identical when its content changes) | yes |

Cases: 33, shown red: 32, mutations run: 33
Not shown red:
  zip: one changed byte changes the archive


## hygiene.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | debug.log carries neither the site key nor the enrollment secret after every flow ran | includes/report.php | debug line with the site key left in the report path | yes (earlier run) |  |

Cases: 1, shown red: 1, mutations run: 1


## smoke.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | plugin activates without any output or notice | includes/source.php | closing tag with a blank line after it, output on every load | yes (fail) | a fresh site is not connected and plans no report, only the update check; a request to any other host never leaves the test site; a request to the test host reaches the fake server |
| 2 | a fresh site is not connected and plans no report, only the update check | site-dispatch.php | activation plans the report without a connection | yes (earlier run) |  |

Cases: 4, shown red: 2, mutations run: 2
Not shown red:
  a request to any other host never leaves the test site
  a request to the test host reaches the fake server


## silent.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | staging site stays silent | includes/common.php | only local excluded | yes (earlier run) |  |
| 2 | site with the snippet constant stays silent | includes/report.php | legacy constants no longer silence the plugin | yes (earlier run) |  |
| 3 | site with the snippet constant shows a notice to admins | includes/admin.php | value of the legacy constant shown in the notice | yes (earlier run) |  |
| 4 | staging site cannot connect | includes/enroll.php | environment not checked before a request | yes (earlier run) |  |
| 5 | staging site shows a note instead of the connect form | includes/admin.php | connect form shown on every environment | yes (earlier run) |  |
| 6 | site with the snippet constant can still connect | includes/enroll.php | legacy constants block the enrollment too, the migration path is cut | yes (earlier run) |  |

Cases: 6, shown red: 6, mutations run: 6


## uninstall.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | deactivation removes the cron events and the open enrollment | site-dispatch.php | open enrollment kept on deactivation | yes (earlier run) |  |
| 2 | deactivation keeps the connection | site-dispatch.php | deactivation drops the connection | yes (earlier run) |  |
| 3 | activation of a connected site plans the daily report | site-dispatch.php | activation no longer plans the report | yes (earlier run) |  |
| 4 | uninstall leaves no option, no transient and no cron event | uninstall.php | stored update left behind | yes (earlier run) |  |
| 5 | uninstall file does nothing when called outside of an uninstall | uninstall.php | uninstall guard removed | yes (earlier run) |  |

Coverage gap mutations (expected to survive):

| Case | File | Mutation reason | Survived |
|---|---|---|---|
| deactivated plugin sends nothing | site-dispatch.php | daily hook not cleared (the case tests WordPress: a deactivated plugin is not loaded, so no mutation of its code is visible) | yes |

Cases: 6, shown red: 5, mutations run: 6
Not shown red:
  deactivated plugin sends nothing


## update-keys.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | key change: new keys arrive with a release signed by a known key, old keys stop counting | includes/verify.php | only the work key checked | yes (earlier run) |  |
| 2 | build with an http release address fetches nothing | includes/updater.php | http allowed for the release base and for every fetched address (two layers) | yes (earlier run) |  |
| 3 | keys and release address cannot be changed at run time | includes/updater.php | release address read from an option | yes (earlier run) |  |

Cases: 3, shown red: 3, mutations run: 3


## report.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | report reaches the server and the signature matches the key of the test vector | includes/report.php | data and key arguments swapped | yes (earlier run) |  |
| 2 | report carries the contract fields and the plugin version | includes/report.php | hard-coded reporter version | yes (earlier run) |  |
| 3 | report is sent with tls check on and redirects off | includes/common.php | WP default redirects left on | yes (earlier run) |  |
| 4 | environment block contains only fields of the allowlist | includes/report.php | path added to the environment block | yes (earlier run) |  |
| 5 | license key and urls of the update data never appear in a report | includes/report.php | allowlist widened with url and package | yes (earlier run) |  |
| 6 | database host, database user, paths, salts and admin mail never appear in a report | includes/report.php | database host reported | yes (earlier run) |  |
| 7 | changed home url stays silent | includes/report.php | home host not compared with the enrollment host | yes (earlier run) |  |
| 8 | home url that differs only by www still reports | includes/hosts.php | typo in the www prefix, never stripped | yes (earlier run) |  |
| 9 | site without a connection sends nothing | includes/report.php | inverted null check, a report is built without a connection | yes (earlier run) |  |
| 10 | site with a damaged state sends nothing | includes/common.php | stored key not checked for its form | yes (earlier run) |  |
| 11 | server error plans exactly one retry | includes/report.php | retry after a minute instead of an hour | yes (earlier run) |  |
| 12 | rate limit plans a retry | includes/report.php | rate limit not retried | yes (earlier run) |  |
| 13 | rejected report plans no retry | includes/report.php | all 4xx retried | yes (earlier run) |  |
| 14 | failed retry plans no further retry | includes/report.php | retry reschedules itself | yes (earlier run) |  |
| 15 | accepted report plans no retry | includes/report.php | success return dropped and server-error threshold typo (two layers) | yes (earlier run) |  |
| 16 | last report records time and status | includes/report.php | last report autoloaded | yes (earlier run) |  |
| 17 | connected site plans the daily report when an admin page loads | includes/report.php | unit slip, first run in five hours | yes (earlier run) |  |

Cases: 17, shown red: 17, mutations run: 17


## enroll.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | enrollment stores the connection and plans the first report | includes/enroll.php | first report after an hour | yes (earlier run) |  |
| 2 | request sends the hash and never the secret | includes/enroll.php | secret sent instead of its hash | yes (earlier run) |  |
| 3 | every enrollment creates a new secret | includes/enroll.php | secret derived from the host instead of random | yes (earlier run) |  |
| 4 | redeem sends the request id and the secret to the redeem path only | includes/enroll.php | wrong path constant for the redeem | yes (earlier run) |  |
| 5 | requests go out with tls check on, redirects off and 15 seconds | includes/common.php | TLS check off | yes (earlier run) |  |
| 6 | redeem before approval stays pending | includes/enroll.php | pending answer treated as used up | yes (earlier run) |  |
| 7 | redeem without an open enrollment makes no call | includes/enroll.php | missing enrollment not checked, the redeem runs on null | yes (fail) | locally expired enrollment makes no call; damaged enrollment is dropped without a call |
| 8 | expired request ends as failed | includes/enroll.php | every error answer retried, an expired request is polled forever | yes (earlier run) |  |
| 9 | locally expired enrollment makes no call | includes/enroll.php | local expiry not checked | yes (earlier run) |  |
| 10 | damaged enrollment is dropped without a call | includes/enroll.php | stored server host not re-checked | yes (earlier run) |  |
| 11 | server error during redeem keeps the request | includes/enroll.php | server errors use up the request | yes (earlier run) |  |
| 12 | redeem answer with a short key is refused | includes/responses.php | lower bound of the key length loosened | yes (earlier run) |  |
| 13 | redeem answer with an upper case key is refused | includes/responses.php | key accepted in either case | yes (earlier run) |  |
| 14 | redeem answer with key version as text is refused | includes/responses.php | numeric text accepted as version | yes (earlier run) |  |
| 15 | redeem answer with a website id that is no uuid is refused | includes/responses.php | website id not checked for its form | yes (earlier run) |  |
| 16 | redeem answer that is html is refused | includes/responses.php | type guard removed, an HTML answer crashes the redeem | yes (earlier run) |  |
| 17 | redeem answer of 5 kb is refused | includes/responses.php | limit raised to 16 KB | yes (earlier run) |  |
| 18 | redeem answer of exactly 4 kb is accepted | includes/responses.php | off-by-one on the size limit | yes (earlier run) |  |
| 19 | redeem answer with a redirect is refused and not followed | includes/enroll.php | 3xx answers retried instead of used up | yes (earlier run) |  |
| 20 | request answer with a wrong user code is refused | includes/responses.php | user code not checked against its pattern | yes (earlier run) |  |
| 21 | request answer other than 200 is refused | includes/enroll.php | any answer below 400 accepted | yes (earlier run) |  |
| 22 | failed request drops an older open enrollment | includes/enroll.php | old enrollment kept when a new request fails | yes (earlier run) |  |
| 23 | host that is not valid never causes a request | includes/hosts.php | punycode check dropped | yes (earlier run) |  |
| 24 | second enrollment replaces the connection | includes/enroll.php | add_option without delete, the old connection stays | yes (earlier run) |  |
| 25 | failed second enrollment keeps the old connection | includes/enroll.php | a failed enrollment drops the existing connection | yes (earlier run) |  |
| 26 | state and transient are stored without autoload | includes/enroll.php | connection autoloaded | yes (earlier run) |  |

Cases: 26, shown red: 26, mutations run: 26


## admin.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | admin sees the page under tools | includes/admin.php | page registered under settings | yes (earlier run) |  |
| 2 | connected site shows host, version and last report | includes/admin.php | home host shown as server | yes (earlier run) |  |
| 3 | waiting update without manifest and signature is not shown | includes/admin.php | raw option shown without verification | yes (earlier run) |  |
| 4 | waiting update with a damaged version is not shown | includes/admin.php | raw option shown without verification | yes (earlier run) |  |
| 5 | connect through the form shows the code and the approval link | includes/admin.php | code tag dropped | yes (earlier run) |  |
| 6 | redeem through ajax connects the site | includes/admin.php | answer key renamed | yes (earlier run) |  |
| 7 | host with spaces around it is accepted | includes/admin.php | form value not trimmed | yes (fail) |  |
| 8 | invalid host shows a notice and causes no request | includes/admin.php | validation skipped in the handler, the request function has to refuse | yes (fail) | host sent as a list is refused without an error |
| 9 | host sent as a list is refused without an error | includes/admin.php | type check dropped, a list crashes the handler | yes (fail) |  |
| 10 | server that refuses the request shows a notice | includes/admin.php | result of the request ignored | yes (fail) |  |
| 11 | notice code from the address is never printed | includes/admin.php | notice code not sanitised and unknown codes echoed back | yes (fail) |  |
| 12 | subscriber gets 403 everywhere | includes/admin.php | any logged-in user may connect | yes (fail) | editor gets 403 everywhere |
| 13 | editor gets 403 everywhere | includes/admin.php | editor capability on the redeem | yes (fail) |  |
| 14 | request without nonce is refused | includes/admin.php | nonce not checked | yes (fail) | request with a nonce of another action is refused; nonce of another user is refused |
| 15 | request with a nonce of another action is refused | includes/admin.php | wrong nonce action in the connect handler | yes (fail) | connect through the form shows the code and the approval link; redeem through ajax connects the site; host with spaces around it is accepted; invalid host shows a notice and causes no request; host sent as a list is refused without an error; server that refuses the request shows a notice; secret of an open enrollment never appears in the page or in an ajax answer |
| 16 | nonce of another user is refused | includes/admin.php | nonce checked for its shape only | yes (fail) | request without nonce is refused; request with a nonce of another action is refused |
| 17 | key never appears in the page | includes/admin.php | key shown next to the server | yes (fail) | connected site shows host, version and last report |
| 18 | secret of an open enrollment never appears in the page or in an ajax answer | includes/admin.php | debug payload with the transient in the ajax answer | yes (fail) | redeem through ajax connects the site |
| 19 | key never appears in a rest answer | site-dispatch.php | connection registered as a REST visible setting | yes (fail) |  |
| 20 | key is not part of the autoloaded options | includes/enroll.php | connection autoloaded | **NO** |  |
| 21 | rest route list has no route of the plugin | site-dispatch.php | a status route added | yes (fail) |  |
| 22 | plugin registers no public action and no rewrite rule | site-dispatch.php | public ajax action registered | yes (fail) |  |
| 23 | switch for immediate updates is stored and shown | includes/admin.php | switch cannot be turned off | yes (fail) |  |

Coverage gap mutations (expected to survive):

| Case | File | Mutation reason | Survived |
|---|---|---|---|
| visitor without login triggers nothing | site-dispatch.php, includes/admin.php | public ajax action registered and the capability check dropped; the nonce of the admin still fails for a visitor (three layers) | no, red: subscriber gets 403 everywhere; editor gets 403 everywhere; plugin registers no public action and no rewrite rule |

Cases: 24, shown red: 22, mutations run: 24
Not shown red:
  visitor without login triggers nothing
  key is not part of the autoloaded options


## update-check.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | activation plans the daily check, also without a connection | site-dispatch.php | activation no longer plans the update check | yes (fail) |  |
| 2 | the cron hook runs the check | site-dispatch.php | cron hook not wired | yes (fail) |  |
| 3 | valid release is stored with manifest, signature, version and local time | includes/updater.php | stored update autoloaded | yes (fail) |  |
| 4 | release signed with the reserve key is stored | includes/verify.php | only the work key checked | yes (fail) |  |
| 5 | every request is https, with tls check, without automatic redirects and size limited | includes/updater.php | TLS check off on the release fetch | yes (fail) |  |
| 6 | signature of an unknown key stores nothing | includes/updater.php | a readable manifest is trusted without a signature | yes (fail) | one flipped bit in the manifest stores nothing; one flipped bit in the signature stores nothing; signature made for the namespace git stores nothing; invalid release keeps the waiting update; admin page shows no update whose signature does not hold |
| 7 | one flipped bit in the manifest stores nothing | includes/updater.php | a signature of the right length is trusted | yes (fail) | signature of an unknown key stores nothing; one flipped bit in the signature stores nothing; signature made for the namespace git stores nothing; invalid release keeps the waiting update; admin page shows no update whose signature does not hold |
| 8 | one flipped bit in the signature stores nothing | includes/updater.php | only an empty signature is fatal | yes (fail) | signature of an unknown key stores nothing; one flipped bit in the manifest stores nothing; signature made for the namespace git stores nothing; invalid release keeps the waiting update; admin page shows no update whose signature does not hold |
| 9 | signature made for the namespace git stores nothing | includes/verify.php | wrong namespace constant, a Git signature verifies | yes (fail) | the cron hook runs the check; valid release is stored with manifest, signature, version and local time; release signed with the reserve key is stored; version is compared by numbers; manifest of 8192 bytes is taken, one byte more is not; five redirects are followed, the sixth is not; second check of the same release keeps the local time; new version starts the clock again; other bytes for the same version start the clock again; admin page shows the waiting update and when it installs |
| 10 | armored signature file instead of the raw bytes stores nothing | includes/updater.php | signature only checked for presence at the fetch and at the verdict (two layers) | yes (fail) | signature of an unknown key stores nothing; one flipped bit in the manifest stores nothing; one flipped bit in the signature stores nothing; signature of 63 and of 65 bytes stores nothing; signature made for the namespace git stores nothing; invalid release keeps the waiting update; admin page shows no update whose signature does not hold |
| 11 | same and lower version store nothing | includes/updater.php, includes/verify.php | same version accepted by the verdict and by the acceptance check (two layers) | yes (fail) | release that was replaced by an older one drops the waiting update |
| 12 | version is compared by numbers | includes/verify.php | patch level ignored | yes (fail) | the cron hook runs the check; valid release is stored with manifest, signature, version and local time; release signed with the reserve key is stored; manifest of 8192 bytes is taken, one byte more is not; five redirects are followed, the sixth is not; second check of the same release keeps the local time; new version starts the clock again; other bytes for the same version start the clock again; admin page shows the waiting update and when it installs |
| 13 | signed manifest with a foreign slug stores nothing | includes/verify.php | slug checked neither by the parser nor by the acceptance (two layers) | yes (fail) |  |
| 14 | signed manifest with a path, an address or no version as file name stores nothing | includes/verify.php | base name of the zip compared | yes (fail) |  |
| 15 | signed manifest with an extra field against the waiting period stores nothing | includes/verify.php | extra manifest fields ignored | yes (fail) |  |
| 16 | signed manifest that needs a newer wordpress or php stores nothing | includes/verify.php | WordPress minimum not checked | yes (fail) |  |
| 17 | manifest of 8192 bytes is taken, one byte more is not | includes/verify.php | manifest limit doubled | yes (fail) | every request is https, with tls check, without automatic redirects and size limited |
| 18 | redirect to http is not followed | includes/updater.php | http redirects followed | yes (fail) |  |
| 19 | redirect to a relative address, another port or an address with a user is not followed | includes/updater.php | protocol relative redirects completed with https (port and user variants are refused by the test reroute before the plugin can be seen following them; UpdaterTest covers those) | yes (fail) |  (rerun alone after the mutation was corrected) |
| 20 | five redirects are followed, the sixth is not | includes/updater.php | one redirect more | yes (fail) |  |
| 21 | second check of the same release keeps the local time | includes/updater.php | every check restarts the clock | yes (fail) |  |
| 22 | new version starts the clock again | includes/updater.php | old stamp kept on a new version | yes (fail) | other bytes for the same version start the clock again |
| 23 | other bytes for the same version start the clock again | includes/updater.php | manifest bytes not compared, only the version | yes (fail) |  |
| 24 | deleted release drops the waiting update | includes/updater.php | a deleted release keeps the waiting update | yes (fail) |  |
| 25 | release that was replaced by an older one drops the waiting update | includes/updater.php | not newer no longer deletes | yes (fail) |  |
| 26 | server that does not answer keeps the waiting update | includes/updater.php | a failed fetch cancels the waiting update | yes (fail) | server error keeps the waiting update; invalid release keeps the waiting update |
| 27 | server error keeps the waiting update | includes/updater.php | any non-200 counts as gone | yes (fail) | server that does not answer keeps the waiting update |
| 28 | invalid release keeps the waiting update | includes/updater.php | an invalid signature cancels the waiting update | yes (fail) |  |
| 29 | admin page shows the waiting update and when it installs | includes/admin.php | first-seen time shown as install time | yes (fail) |  |
| 30 | admin page shows no update whose signature does not hold | includes/updater.php | verdict not checked when reading the stored update | yes (fail) |  |

Coverage gap mutations (expected to survive):

| Case | File | Mutation reason | Survived |
|---|---|---|---|
| manifest without a signature file stores nothing | includes/updater.php, includes/verify.php | fetch gate and length guard dropped; sodium itself still refuses an empty signature (three layers) | yes |
| signature of 63 and of 65 bytes stores nothing | includes/updater.php, includes/verify.php | fetch gate and length guard loosened; sodium itself still refuses the length (three layers) | yes |

Cases: 32, shown red: 30, mutations run: 32
Not shown red:
  manifest without a signature file stores nothing
  signature of 63 and of 65 bytes stores nothing


## update-offer.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | before 72 hours there is no offer | includes/updater.php | digit lost in the delay | yes (fail) |  |
| 2 | after 72 hours the offer is there | includes/updater.php | minimum versions swapped in the offer | yes (fail) |  |
| 3 | with the switch on the offer is there at once | includes/updater.php | switch for immediate updates ignored | yes (fail) | entries of other plugins stay byte for byte the same, offer open; an entry for the own plugin from wordpress.org is replaced by the own offer |
| 4 | a local time in the future does not open the offer | includes/updater.php | a stamp in the future counts as due | yes (fail) |  |
| 5 | without a stored update there is no offer and the list stays as it is | includes/updater.php | an update list is created even when there is nothing to offer | yes (fail) |  |
| 6 | entries of other plugins stay byte for byte the same, offer closed | includes/updater.php | own entry also removed from the checked list while the offer is closed | yes (fail) |  (rerun alone after the mutation was corrected) |
| 7 | entries of other plugins stay byte for byte the same, offer open | includes/updater.php | response list replaced instead of extended | yes (fail) |  |
| 8 | an entry for the own plugin from wordpress.org is never offered | includes/updater.php | foreign entry for the own slug no longer removed | yes (fail) | an answer of wordpress.org about the slug is never offered, and wordpress.org is told the Update URI |
| 9 | an entry for the own plugin from wordpress.org is replaced by the own offer | includes/updater.php | foreign entry for the own slug kept and left alone (two layers) | yes (fail) | an entry for the own plugin from wordpress.org is never offered; an answer of wordpress.org about the slug is never offered, and wordpress.org is told the Update URI |
| 10 | an answer of wordpress.org about the slug is never offered, and wordpress.org is told the Update URI | site-dispatch.php | Update URI header dropped | yes (fail) |  |
| 11 | damaged stored update gives no offer | includes/updater.php | stored version label not compared with the manifest | yes (fail) |  |
| 12 | stored update signed by an unknown key gives no offer | includes/updater.php | a readable manifest is trusted without a signature | yes (fail) | damaged stored update gives no offer |
| 13 | stored update for the installed version gives no offer | includes/updater.php, includes/verify.php | same version accepted by the verdict and by the acceptance check (two layers) | yes (fail) |  |
| 14 | the automatic updater is told to install the own plugin and nothing else | includes/updater.php | every plugin switched to automatic updates | yes (fail) |  |

Cases: 14, shown red: 14, mutations run: 14
Not shown red:


## update-install.test.mjs

| # | Case | File | Mutation reason | Red | Other cases red |
|---|---|---|---|---|---|
| 1 | automatic update with the switch on installs the new version | includes/updater.php | download timeout halved | yes (earlier run) |  |
| 2 | automatic update after 72 hours installs the new version | includes/updater.php | waiting period doubled | yes (earlier run) |  |
| 3 | automatic update before 72 hours installs nothing | includes/updater.php | waiting period enforced neither at the offer nor at the download (two layers) | yes (earlier run) |  |
| 4 | update now in wp-admin installs through the same checks | includes/updater.php | dot entry not excluded, every real install is refused | yes (earlier run) |  |
| 5 | update now before 72 hours installs nothing | includes/updater.php | waiting period enforced neither at the offer nor at the download (two layers) | yes (earlier run) |  |
| 6 | forged update list before 72 hours is refused at the install check | includes/updater.php | waiting period not checked again at the download | yes (earlier run) |  |
| 7 | foreign package address for the own plugin is ignored, the own address is used | includes/updater.php | package address from the update list used | yes (earlier run) |  |
| 8 | install without any stored update is refused | includes/updater.php | without a stored update the download is handed back to WordPress | yes (earlier run) |  |
| 9 | zip replaced on the server is refused | includes/updater.php | hash compared with itself | yes (earlier run) |  |
| 10 | zip with one changed byte is refused | includes/updater.php | hash not compared and an unreadable archive handed on (two layers: the flipped byte also breaks the zip structure) | yes (earlier run) |  |
| 11 | zip of exactly 2 mb installs, one byte more is refused | includes/updater.php | off-by-one on the zip size | yes (earlier run) |  |
| 12 | validly signed zip is refused before unpacking: second top folder | includes/updater.php | any folder accepted | yes (earlier run) |  |
| 13 | validly signed zip is refused before unpacking: file on top level | includes/updater.php | top level files tolerated | yes (earlier run) |  |
| 14 | validly signed zip is refused before unpacking: path up | includes/updater.php | prefix and dot segments not checked (two layers) | yes (earlier run) |  |
| 15 | validly signed zip is refused before unpacking: path up inside the folder | includes/updater.php | parent segment not refused | yes (earlier run) |  |
| 16 | validly signed zip is refused before unpacking: backslash path | includes/updater.php | backslashes normalised for the prefix check and allowed by the pattern (two layers) | yes (fail) |  |
| 17 | validly signed zip is refused before unpacking: absolute path | includes/updater.php | leading slashes tolerated in the prefix check and when splitting (two layers) | **NO** |  |
| 18 | validly signed zip is refused before unpacking: other folder name | includes/updater.php | prefix compared without the slash and the main file found by its base name (two layers) | yes (fail) |  |
| 19 | validly signed zip is refused before unpacking: without the main file | includes/updater.php | main file presence not checked | yes (fail) |  |
| 20 | validly signed file that is no zip is refused | includes/updater.php | unreadable archive handed to WordPress | yes (fail) |  |
| 21 | package swapped after the hash check is refused right before unpacking: content | includes/updater.php | second hash taken from memory instead of the file | yes (fail) | package swapped after the hash check is refused right before unpacking: path |
| 22 | package swapped after the hash check is refused right before unpacking: path | includes/updater.php | second hash taken from memory instead of the file | yes (fail) | package swapped after the hash check is refused right before unpacking: content |
| 23 | the swap of the test really installs when the second hash is not there to stop it | site-dispatch.php | filter priority changed, the test can no longer remove it | yes (fail) |  |

Coverage gap mutations (expected to survive):

| Case | File | Mutation reason | Survived |
|---|---|---|---|
| release deleted between offer and install is refused | includes/updater.php | status and size checks dropped; the hash of an empty file still fails (three layers) | yes |
| server that does not answer at install time is refused | includes/updater.php | status and size checks dropped; the hash of an empty file still fails (three layers) | yes |

Cases: 31, shown red: 22, mutations run: 25
Not shown red:
  validly signed zip is refused before unpacking: absolute path
  release deleted between offer and install is refused
  server that does not answer at install time is refused
  redirect of the zip to http is not followed
  refused install leaves no temp file behind
  update of another plugin passes all filters untouched
  the own package address for another target is refused
  after the update cron and options are there and the daily report is still sent
  after the update the offer is gone and the next check clears the stored update


## Not run (time budget or --limit)

chunk A3:
- update-install.test.mjs / redirect of the zip to http is not followed
- update-install.test.mjs / refused install leaves no temp file behind
- update-install.test.mjs / update of another plugin passes all filters untouched
- update-install.test.mjs / the own package address for another target is refused
- update-install.test.mjs / after the update cron and options are there and the daily report is still sent
- update-install.test.mjs / after the update the offer is gone and the next check clears the stored update
