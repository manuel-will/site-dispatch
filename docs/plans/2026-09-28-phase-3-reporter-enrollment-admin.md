# Phase 3: Reporter, Enrollment, Admin Page, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, one session).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plugin reports daily, connects through the device pattern and shows its status under
"Tools", with every integration case of the master plan covered by one test in WordPress Playground.

**Architecture:** `site-dispatch.php` is the only file that registers hooks. Everything under
`includes/` declares functions and constants only, so the pure helpers stay testable with PHPUnit
without WordPress. Integration tests are Node scripts: they start WordPress Playground through its
library API, run PHP inside it and drive wp-admin over HTTP, against a fake server on `127.0.0.1`.

**Tech stack:** PHP 7.4 syntax, PHPUnit 9.6, PHPStan 2 level max with WordPress stubs, PHPCS with
WordPress-Extra, Node 24 with the built-in test runner, `@wp-playground/cli` 3.1.56.

**Spec:** `n8n-builder/workflows/plugin-scan/spec-plugin.md` and `plan-plugin.md` (Phase 3), contract
`PROTOCOL.md` in this repository. Behaviour of the reporter: `reporter/mw-plugin-report.php` there.

## Global constraints

- Names, options, cron hooks and endpoints as in `plan-plugin.md`, "Verbindliche Namen".
- `includes/verify.php`, `hosts.php`, `responses.php` are finished and stay untouched. Their constants
  are not defined again.
- Every pattern ends in `\z`, never `$`.
- Host input goes through `site_dispatch_valid_server_host()`, host comparison through
  `site_dispatch_norm_host()`, server answers through the two parsers. "Pending" is the status code
  `202`.
- No REST route, no `wp_ajax_nopriv_`, no `admin_post_nopriv_`, no rewrite rule, no file write.
- The plugin never logs and never prints a key, a secret or a server answer. Error texts are fixed.
- Keys and secrets in tests are the canary values already allowlisted in `.gitleaks.toml` or are
  created at run time. No test talks to a real server. The fake server binds to `127.0.0.1` only.
- Commits never with `--no-verify`. Nothing is pushed.
- Red runs are the job of the independent QA agent (Phase 6). Each new test file still runs once
  before its code exists.
- Files with `$` or quotes are written with the editor tools, not by shell scripts.

## Probe result (2026-09-28, scratchpad, nothing committed)

Playground CLI 3.1.56 runs on this machine (Windows 11, Node 24.18, npm 12):

- `runCLI({ command: 'server', port: 0, mount: [...] })` from `@wp-playground/cli` starts WordPress
  (7.1.2, PHP 8.3.33, SQLite) and returns `serverUrl` and `playground`. First start 22 s including the
  WordPress download.
- `playground.run({ code })` runs PHP inside the instance. `wp-load.php` works, `sodium` is there,
  `wp_get_environment_type()` is `production`, `home_url()` is `http://127.0.0.1:<port>`.
- PHP inside Playground reaches a Node server on `127.0.0.1`. A `POST` arrived with its body.
- Mounting a Windows directory as `mu-plugins` works.
- npm did not run the install script of `fs-ext-extra-prebuilt` (blocked by default). Playground
  works without it. It prints two harmless `lockWholeFile: unlock failed` lines at start.
- Default is 6 worker threads. Tests use `workers: 1`, so requests run in order.

## Decisions this plan makes (please confirm at approval)

| # | Decision | Why |
|---|---|---|
| 1 | `site-dispatch.php` is created in Phase 3, version `0.1.0`, without `Update URI` | Every integration test needs an activatable plugin. `Update URI`, `keys.php` and `source.php` stay in Phase 4 as planned. Nothing is released before that |
| 2 | New dev dependency `szepeviktor/phpstan-wordpress` (brings `php-stubs/wordpress-stubs`) | Stubs alone do not know `ABSPATH` or `MINUTE_IN_SECONDS` and type `get_option()` as plain mixed. The extension is the usual pair for PHPStan on WordPress code. Dev only, never in a release |
| 3 | New `package.json` with one dev dependency, `@wp-playground/cli` pinned to `3.1.56`, plus `package-lock.json`. Both `export-ignore` | Reproducible test runs. Tests run with `npm test` (`node --test`), no test framework |
| 4 | The plugin only speaks `https` to a host name without port. Tests reroute `https://server.example.test/...` to the fake server with a **test-only mu-plugin** (`pre_http_request`), which also reports the request arguments the plugin chose | No TLS certificate handling on Windows, and the arguments (`sslverify`, `redirection`, `timeout`, size limit, `reject_unsafe_urls`) become checkable. TLS itself is not exercised by a test. The mu-plugin lives under `tests/` and is never part of a release |
| 5 | `limit_response_size` is `4097`, not `4096` | With `4096` WordPress cuts a larger answer down to the limit and the parser can no longer see that it was too large. With one byte more the parser's own limit of 4096 decides |
| 6 | Two new files that the master plan does not list: `includes/common.php` (validated state reader, the one HTTP helper) and `assets/admin.js` (polling) | State and HTTP arguments are used by reporter and enrollment alike. A script file instead of inline JavaScript keeps the page free of inline code |
| 7 | The enrollment transient lives 240 seconds (120 for the approval, 120 for collecting). The page polls for 120 seconds, after that the button still works until the transient is gone | The contract gives two windows of 2 minutes each. A transient of 120 seconds would drop the secret while collecting is still allowed |
| 8 | Redeem outcomes: `200` and valid stores the state, `202` keeps polling, transport error, `429` and `5xx` keep the request and poll again, every other answer deletes the transient and ends as "failed" | A `401` or a malformed `200` means the request is used up. The browser only ever gets one of five fixed words |
| 9 | All four options are stored without autoload. The state is written with `delete_option()` plus `add_option()` | `update_option()` leaves the autoload flag alone when the value is unchanged |
| 10 | The state is read only in wp-admin and in cron. Scheduling happens at activation, after a successful enrollment and as self-healing on `admin_init`, not on every `init` | The snippet read constants, the plugin reads an option without autoload. Front end requests must not pay a database query for it |
| 11 | With the legacy constant defined the plugin stays silent and shows a notice, but enrollment still works | The pilot connects first and removes the snippets afterwards |
| 12 | No "disconnect" and no "send now" button | Not in the spec. Rotation is connecting again |
| 13 | Values of the `environment` block that fail their pattern are left out. An empty block is left out as a whole | The contract makes every field optional |
| 14 | "Changed home_url" is tested with a `home_url` filter inside the test run. The "waiting update" row reads `site_dispatch_update`, which only Phase 4 writes | Playground pins its own address. The row is tested with a hand-written option |
| 15 | Gate run twice: PHP 8.3 (default) and PHP 7.4 (`SITE_DISPATCH_TEST_PHP=7.4`), WordPress latest | 7.4 is the floor of the target sites |
| 16 | `assets/admin.js` is not covered by an automated test. The tests call the Ajax action directly | No browser automation in this phase. You see the polling at the gate |

## Files

| File | Responsibility |
|---|---|
| `site-dispatch.php` | Header, `SITE_DISPATCH_VERSION`, loads `includes/`, registers every hook, activation and deactivation |
| `includes/common.php` | `site_dispatch_get_state()`, `site_dispatch_home_host()`, `site_dispatch_environment_supported()`, `site_dispatch_legacy_reporter_present()`, `site_dispatch_post()` |
| `includes/report.php` | Payload, `environment`, eligibility, signature, dispatch, retry, scheduling |
| `includes/enroll.php` | Request, redeem, storing the state |
| `includes/admin.php` | Page under "Tools", three actions, notices |
| `assets/admin.js` | Polls the redeem action every 3 seconds for at most 2 minutes |
| `uninstall.php` | Deletes options, transient and cron events |
| `tests/unit/ReportHelpersTest.php` | PHPUnit for the pure helpers in `report.php` |
| `tests/integration/harness.mjs` | Starts a site, runs PHP, logs users in, builds nonces |
| `tests/integration/fake-server.mjs` | Fake of the three server endpoints, records every request |
| `tests/integration/mu/site-dispatch-test-reroute.php` | Test-only reroute, see decision 4 |
| `tests/integration/fixtures/canary-plugin/canary-plugin.php` | Empty plugin that the canary update data points to |
| `tests/integration/*.test.mjs` | Five test files, see tasks |
| `tests/integration/serve.mjs` | Starts site and fake server and keeps them running, for the gate |
| `package.json`, `package-lock.json` | Dev dependency and the scripts `test` and `playground` |
| `phpstan.neon.dist`, `phpcs.xml.dist`, `.gitattributes`, `composer.json`, `README.md` | Extended, see Task 1 |

---

### Task 1: Tooling

- [ ] **Step 1:** `git config core.hooksPath` prints `.githooks`. `composer test`, `composer stan`,
  `composer cs`, `composer vectors` are green (checked 2026-09-28 before this plan: 80 tests).
- [ ] **Step 2:** `composer require --dev szepeviktor/phpstan-wordpress:^2.0`.
- [ ] **Step 3:** `phpstan.neon.dist`:

```neon
includes:
	- vendor/szepeviktor/phpstan-wordpress/extension.neon
parameters:
	level: max
	phpVersion: 70400
	paths:
		- site-dispatch.php
		- uninstall.php
		- includes
```

- [ ] **Step 4:** `phpcs.xml.dist`, inside the ruleset: the host check counts as sanitizing.

```xml
	<rule ref="WordPress.Security.ValidatedSanitizedInput">
		<properties>
			<property name="customSanitizingFunctions" type="array">
				<element value="site_dispatch_valid_server_host"/>
			</property>
		</properties>
	</rule>
```

- [ ] **Step 5:** `package.json`:

```json
{
	"name": "site-dispatch-dev",
	"private": true,
	"type": "module",
	"scripts": {
		"test": "node --test --test-concurrency=1 tests/integration/",
		"playground": "node tests/integration/serve.mjs"
	},
	"devDependencies": {
		"@wp-playground/cli": "3.1.56"
	}
}
```

  Then `npm install`. `.gitattributes` gets `/package.json export-ignore`,
  `/package-lock.json export-ignore`.
- [ ] **Step 6:** Commit: `chore: phpstan wordpress extension, playground cli, plan for phase 3`.

### Task 2: Main file and common helpers

**Files:** `site-dispatch.php`, `includes/common.php`. Stubs of `report.php`, `enroll.php`,
`admin.php` with their file comment, so the main file loads.

**Produces:**

```php
site_dispatch_get_state(): ?array   // array{website_id: string, key: string, key_version: int, server_host: string, home_host: string}
site_dispatch_home_host(): string
site_dispatch_environment_supported(): bool
site_dispatch_legacy_reporter_present(): bool
site_dispatch_post( string $url, string $body, array $headers, int $timeout ): array   // array{code: int, body: string}
```

- [ ] **Step 1:** `site-dispatch.php`:

```php
<?php
/**
 * Plugin Name:       Site Dispatch
 * Description:       Sends a signed, read-only status report (plugins, available updates, WordPress and server versions) to a server you connect it to. No inbound endpoints, no remote commands.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Manuel Will
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       site-dispatch
 *
 * @package Site_Dispatch
 */

defined( 'ABSPATH' ) || exit;

// A second copy of the plugin must not load.
if ( defined( 'SITE_DISPATCH_VERSION' ) ) {
	return;
}

const SITE_DISPATCH_VERSION = '0.1.0';
const SITE_DISPATCH_FILE    = __FILE__;

require __DIR__ . '/includes/verify.php';
require __DIR__ . '/includes/hosts.php';
require __DIR__ . '/includes/responses.php';
require __DIR__ . '/includes/common.php';
require __DIR__ . '/includes/report.php';
require __DIR__ . '/includes/enroll.php';
require __DIR__ . '/includes/admin.php';

/**
 * Plans the daily report if the site is connected.
 */
function site_dispatch_activate(): void {
	site_dispatch_schedule();
}

/**
 * Removes the cron events and an open enrollment. The connection stays.
 */
function site_dispatch_deactivate(): void {
	wp_clear_scheduled_hook( 'site_dispatch_daily' );
	wp_clear_scheduled_hook( 'site_dispatch_retry' );
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
}

register_activation_hook( __FILE__, 'site_dispatch_activate' );
register_deactivation_hook( __FILE__, 'site_dispatch_deactivate' );

add_action( 'site_dispatch_daily', 'site_dispatch_send_daily' );
add_action( 'site_dispatch_retry', 'site_dispatch_send_retry' );

add_action( 'admin_init', 'site_dispatch_schedule' );
add_action( 'admin_menu', 'site_dispatch_admin_menu' );
add_action( 'admin_notices', 'site_dispatch_legacy_notice' );
add_action( 'admin_enqueue_scripts', 'site_dispatch_admin_assets' );
add_action( 'admin_post_site_dispatch_connect', 'site_dispatch_handle_connect' );
add_action( 'admin_post_site_dispatch_settings', 'site_dispatch_handle_settings' );
add_action( 'wp_ajax_site_dispatch_redeem', 'site_dispatch_ajax_redeem' );
```

- [ ] **Step 2:** `includes/common.php`:

```php
<?php
/**
 * Shared helpers: the stored connection and the one way out to the server.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

const SITE_DISPATCH_HOME_HOST_PATTERN = '/^[a-z0-9.-]{1,253}\z/';
const SITE_DISPATCH_KEY_PATTERN       = '/^[0-9a-f]{64}\z/';

/**
 * Host of home_url() for comparing. Empty text if there is none.
 *
 * @return string
 */
function site_dispatch_home_host(): string {
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	return is_string( $host ) ? site_dispatch_norm_host( $host ) : '';
}

/**
 * Only a production site without multisite connects and reports.
 *
 * @return bool
 */
function site_dispatch_environment_supported(): bool {
	return ! is_multisite() && 'production' === wp_get_environment_type();
}

/**
 * The snippet reporter is still configured on this site.
 *
 * @return bool
 */
function site_dispatch_legacy_reporter_present(): bool {
	return defined( 'MW_PLUGIN_REPORT_KEY' );
}

/**
 * Reads the stored connection. Null unless every field has its exact form.
 *
 * @return array{website_id: string, key: string, key_version: int, server_host: string, home_host: string}|null
 */
function site_dispatch_get_state(): ?array {
	$raw = get_option( 'site_dispatch_state', null );
	if ( ! is_array( $raw ) ) {
		return null;
	}
	$website_id  = $raw['website_id'] ?? null;
	$key         = $raw['key'] ?? null;
	$key_version = $raw['key_version'] ?? null;
	$server_host = $raw['server_host'] ?? null;
	$home_host   = $raw['home_host'] ?? null;
	if ( ! is_string( $website_id ) || 1 !== preg_match( SITE_DISPATCH_UUID_PATTERN, $website_id ) ) {
		return null;
	}
	if ( ! is_string( $key ) || 1 !== preg_match( SITE_DISPATCH_KEY_PATTERN, $key ) ) {
		return null;
	}
	if ( ! is_int( $key_version ) || $key_version < 1 ) {
		return null;
	}
	if ( ! is_string( $server_host ) || site_dispatch_valid_server_host( $server_host ) !== $server_host ) {
		return null;
	}
	if ( ! is_string( $home_host ) || 1 !== preg_match( SITE_DISPATCH_HOME_HOST_PATTERN, $home_host ) ) {
		return null;
	}
	return array(
		'website_id'  => $website_id,
		'key'         => $key,
		'key_version' => $key_version,
		'server_host' => $server_host,
		'home_host'   => $home_host,
	);
}

/**
 * Sends one POST. TLS check on, no redirects, answer cut one byte above the contract limit so the
 * parsers can tell that it was too large.
 *
 * @param string                $url     Target, always https.
 * @param string                $body    Request body, sent byte for byte.
 * @param array<string, string> $headers Request headers.
 * @param int                   $timeout Seconds.
 * @return array{code: int, body: string} Code 0 on a transport error.
 */
function site_dispatch_post( string $url, string $body, array $headers, int $timeout ): array {
	$result = wp_remote_post(
		$url,
		array(
			'timeout'             => $timeout,
			'redirection'         => 0,
			'sslverify'           => true,
			'reject_unsafe_urls'  => true,
			'limit_response_size' => SITE_DISPATCH_RESPONSE_MAX_BYTES + 1,
			'headers'             => $headers,
			'body'                => $body,
			'data_format'         => 'body',
		)
	);
	if ( is_wp_error( $result ) ) {
		return array(
			'code' => 0,
			'body' => '',
		);
	}
	return array(
		'code' => (int) wp_remote_retrieve_response_code( $result ),
		'body' => wp_remote_retrieve_body( $result ),
	);
}
```

- [ ] **Step 3:** `composer stan`, `composer cs` clean (the hooks point to functions of later tasks,
  which PHPStan does not check by name). Commit: `feat: main plugin file, state reader and http helper`.

### Task 3: Pure report helpers

**Files:** `includes/report.php`, test `tests/unit/ReportHelpersTest.php`, `tests/unit/bootstrap.php`
(requires `report.php` as well).

**Produces:**

```php
site_dispatch_iso( int $timestamp ): ?string
site_dispatch_pick( $source, array $keys ): array          // array<string, string>
site_dispatch_clean( $value, string $pattern ): ?string
site_dispatch_server_software( string $raw ): ?string
site_dispatch_core_auto_updates( $constant, bool $updater_disabled, $major_option ): string
site_dispatch_sign_body( string $body, string $site_key ): string
```

| Test | Input | Expected |
|---|---|---|
| `test_signature_header_matches_the_protocol_vector` | `tests/vectors/report-body.json`, `site_key` from `report-hmac.json` | The `X-MW-Signature` of vector B |
| `test_iso_formats_utc_and_gives_null_for_zero` | `1767225600`, `0` | `2026-01-01T00:00:00Z`, null |
| `test_pick_copies_only_the_named_fields` | Object with `new_version`, `package`, `url`, `license_key` | Only `new_version` |
| `test_pick_drops_empty_text_lists_and_booleans` | `''`, `array()`, `true` | Empty array |
| `test_pick_takes_arrays_and_objects_alike` | Same fields as array and as object | Same result |
| `test_server_software_keeps_name_and_version` | `nginx/1.25.3` | `nginx/1.25.3` |
| `test_server_software_cuts_everything_after_the_version` | `Apache/2.4.57 (Debian) OpenSSL/3.0.11` | `Apache/2.4.57` |
| `test_server_software_without_version_keeps_the_name` | `LiteSpeed` | `LiteSpeed` |
| `test_server_software_with_a_strange_version_keeps_the_name` | `Apache/2.4.57-custom` | `Apache` |
| `test_server_software_with_a_path_is_dropped` | `/usr/sbin/httpd`, empty text | null |
| `test_clean_refuses_a_trailing_newline` | `256M\n` against the size pattern | null |
| `test_clean_refuses_values_that_are_not_text` | list, null, float | null |
| `test_core_auto_updates_off_when_the_updater_is_disabled` | any constant, disabled true | `off` |
| `test_core_auto_updates_follows_the_constant` | `false`, `'minor'`, `true`, `'beta'` | `off`, `minor`, `all`, `all` |
| `test_core_auto_updates_without_constant_follows_the_option` | null with `'enabled'`, null with `'unset'` | `all`, `minor` |

- [ ] **Step 1:** Write the test file, extend the bootstrap, run `composer test`. Expected: undefined
  function.
- [ ] **Step 2:** Code, first part of `includes/report.php`:

```php
<?php
/**
 * Daily report: payload, eligibility, signature, dispatch, retry. Contract: PROTOCOL.md, section 1.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

const SITE_DISPATCH_REPORT_PATH    = '/webhook/plugin-report';
const SITE_DISPATCH_SIZE_PATTERN   = '/^-?[0-9]{1,12}[KMGkmg]?\z/';
const SITE_DISPATCH_SERVER_PATTERN = '/^[A-Za-z][A-Za-z0-9_-]{0,31}(\/[0-9][0-9.]{0,15})?\z/';

/**
 * UTC timestamp in the form of the contract, null for "never".
 *
 * @param int $timestamp Unix time.
 * @return string|null
 */
function site_dispatch_iso( int $timestamp ): ?string {
	return $timestamp > 0 ? gmdate( 'Y-m-d\TH:i:s\Z', $timestamp ) : null;
}

/**
 * Copies only the allowed keys, only non-empty text and numbers. Never URLs or packages.
 *
 * @param mixed         $source Array or object from an update transient.
 * @param array<string> $keys   Allowed field names.
 * @return array<string, string>
 */
function site_dispatch_pick( $source, array $keys ): array {
	if ( is_object( $source ) ) {
		$source = get_object_vars( $source );
	}
	if ( ! is_array( $source ) ) {
		return array();
	}
	$out = array();
	foreach ( $keys as $key ) {
		$value = $source[ $key ] ?? null;
		if ( ( is_string( $value ) || is_int( $value ) || is_float( $value ) ) && '' !== (string) $value ) {
			$out[ $key ] = (string) $value;
		}
	}
	return $out;
}

/**
 * Lets a value pass only as text that matches the pattern.
 *
 * @param mixed  $value   Any value.
 * @param string $pattern Pattern, anchored with \z.
 * @return string|null
 */
function site_dispatch_clean( $value, string $pattern ): ?string {
	if ( is_int( $value ) ) {
		$value = (string) $value;
	}
	return is_string( $value ) && 1 === preg_match( $pattern, $value ) ? $value : null;
}

/**
 * Name and version of the web server, everything after that cut off.
 *
 * @param string $raw SERVER_SOFTWARE.
 * @return string|null
 */
function site_dispatch_server_software( string $raw ): ?string {
	$allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./';
	$token   = substr( $raw, 0, strspn( $raw, $allowed ) );
	$full    = site_dispatch_clean( $token, SITE_DISPATCH_SERVER_PATTERN );
	if ( null !== $full ) {
		return $full;
	}
	return site_dispatch_clean( substr( $token, 0, strcspn( $token, '/' ) ), SITE_DISPATCH_SERVER_PATTERN );
}

/**
 * Maps the core update settings to off, minor or all.
 *
 * @param mixed $constant         Value of WP_AUTO_UPDATE_CORE, null if not defined.
 * @param bool  $updater_disabled AUTOMATIC_UPDATER_DISABLED is on.
 * @param mixed $major_option     Option auto_update_core_major.
 * @return string
 */
function site_dispatch_core_auto_updates( $constant, bool $updater_disabled, $major_option ): string {
	if ( $updater_disabled || false === $constant ) {
		return 'off';
	}
	if ( 'minor' === $constant ) {
		return 'minor';
	}
	if ( null !== $constant ) {
		return 'all';
	}
	return 'enabled' === $major_option ? 'all' : 'minor';
}

/**
 * Value of the signature header: HMAC over the exact body bytes.
 *
 * @param string $body     The request body.
 * @param string $site_key The site key as the text it is stored in.
 * @return string
 */
function site_dispatch_sign_body( string $body, string $site_key ): string {
	return 'sha256=' . hash_hmac( 'sha256', $body, $site_key );
}
```

- [ ] **Step 3:** `composer test`, `composer stan`, `composer cs` green.
  Commit: `feat: pure helpers of the report`.

### Task 4: Harness, fake server, smoke test

**Files:** `tests/integration/harness.mjs`, `fake-server.mjs`, `mu/site-dispatch-test-reroute.php`,
`fixtures/canary-plugin/canary-plugin.php`, `smoke.test.mjs`.

**Harness (`harness.mjs`):**

| Export | Behaviour |
|---|---|
| `startSite({ defines, fake })` | Copies `site-dispatch.php`, `uninstall.php`, `includes/`, `assets/` to a temp directory (the file set of a release), starts `runCLI` with `command: 'server'`, `port: 0`, `workers: 1`, `login: false`, `skipBrowser: true`, `php` from `SITE_DISPATCH_TEST_PHP`, mounts plugin, mu-plugin and canary plugin, passes `defines` and the fake port (`SITE_DISPATCH_TEST_FAKE_PORT`) as PHP constants, activates the plugin. Returns `site` |
| `site.php(code)` | Runs PHP after `wp-load.php`, returns the decoded JSON that the code prints |
| `site.login(role)` | Creates a user of that role with a password made at run time, logs in through `wp-login.php`, returns a cookie jar |
| `site.fetch(jar, path, { method, form })` | HTTP request with the jar, `redirect: 'manual'`, returns status, location and body |
| `site.nonce(jar, action)` | Builds a nonce that is valid for the session of that jar (PHP run with the jar's login cookie) |
| `site.reset()` | Deletes the four options, the transient and both cron hooks, empties the fake server log |
| `site.stop()` | Stops the site, removes the temp directory |

**Fake server (`fake-server.mjs`):** `startFake()` listens on `127.0.0.1`, port 0.

| Path | Behaviour |
|---|---|
| `/webhook/plugin-report` | Answers with `fake.reportStatus` (default `200 {"ok":true}`) |
| `/webhook/site-dispatch-enroll-request` | Keeps `secret_hash`, answers with a request id and the user code `ABCDEFGH`. `fake.requestAnswer` replaces the answer |
| `/webhook/site-dispatch-enroll-redeem` | `401 {"ok":false}` unless SHA-256 of the sent secret equals the kept hash. Then `202` until `fake.approve()`, then `200` with the canary `site_key`, `key_version` 1 and the `website_id` of vector B. `fake.redeemAnswer` replaces the answer, `fake.expire()` makes it `401` |
| every request | Recorded in `fake.requests`: path, headers, raw body bytes, and the plugin's request arguments from the header `X-Test-Args` |

**Reroute (`mu/site-dispatch-test-reroute.php`):** on `pre_http_request`, only for URLs that start
with `https://server.example.test/`: sends the same method, headers and body to
`http://127.0.0.1:<SITE_DISPATCH_TEST_FAKE_PORT>` plus the path, adds the header `X-Test-Args` with
`sslverify`, `redirection`, `timeout`, `limit_response_size`, `reject_unsafe_urls` as the plugin set
them, and returns that answer. Every other URL gets a `WP_Error`, so no test reaches the internet.

| Test (`smoke.test.mjs`) | Expected |
|---|---|
| `plugin activates without any output or notice` | Active, no PHP warning in the activation run |
| `a fresh site is not connected and has no cron event` | State null, no `site_dispatch_*` hook in the cron array |
| `a request to any other host never leaves the test site` | `wp_remote_get( 'https://example.com' )` is a `WP_Error`, fake log empty |

- [ ] **Step 1:** Write the four infrastructure files and the smoke test. `npm test` green.
- [ ] **Step 2:** Commit: `test: playground harness, fake server, smoke test`.

### Task 5: Report

**Files:** `includes/report.php` (second part), tests `tests/integration/report.test.mjs`,
`tests/integration/silent.test.mjs`.

**Consumes:** Task 2 and 3. **Produces:** `site_dispatch_eligible( ?array $state ): bool`,
`site_dispatch_schedule(): void`, `site_dispatch_build_report( array $state ): array`,
`site_dispatch_environment(): array`, `site_dispatch_send( bool $is_retry ): void`,
`site_dispatch_send_daily(): void`, `site_dispatch_send_retry(): void`.

Tests put the state in place by hand: canary `site_key` and `website_id` of vector B,
`server_host` `server.example.test`, `home_host` `127.0.0.1`. A report is triggered with
`do_action( 'site_dispatch_daily' )`.

| Test (`report.test.mjs`) | Expected |
|---|---|
| `report reaches the server and the signature matches the key of the test vector` | One request, `X-MW-Signature` equals the HMAC of the received bytes with the canary key, `X-MW-Site` is the website id |
| `report carries the contract fields and the plugin version` | `schema_version` 1, `reporter_version` `0.1.0`, `website_id`, `home_url`, `generated_at` in contract form, the canary plugin in `plugins` |
| `report is sent with tls check on and redirects off` | `X-Test-Args`: `sslverify` true, `redirection` 0, `timeout` 20, `limit_response_size` 4097, `reject_unsafe_urls` true |
| `environment block contains only fields of the allowlist` | Every key on every level is one of the contract, every value has the contract type |
| `site without a connection sends nothing` | No request |
| `site with a damaged state sends nothing` | Key with 63 characters in the option: no request |
| `changed home url stays silent` | `home_url` filtered to `https://clone.example.test`: no request |
| `license key and urls of the update data never appear in a report` | Update transient with `package`, `url`, `icons`, `license_key` that carry `CANARY-LICENSE-DO-NOT-LEAK`: body has `new_version`, not the canary, no `http` inside `plugins` |
| `database host, database user, paths, salts and admin mail never appear in a report` | Body contains none of: `DB_HOST`, `DB_USER`, `DB_NAME`, `ABSPATH`, the eight salts, `admin_email` (set to a canary address). Values are read inside the test site, values under 4 characters are skipped |
| `server error plans exactly one retry` | `500`: one `site_dispatch_retry` event about an hour ahead. A second failing run adds none |
| `rejected report plans no retry` | `401`: no retry event |
| `failed retry plans no further retry` | `do_action( 'site_dispatch_retry' )` with `500`: no retry event |
| `last report records time and status` | Option `site_dispatch_last_report` with `at` and `http_status`, autoload off |

| Test (`silent.test.mjs`) | Site | Expected |
|---|---|---|
| `staging site stays silent` | `WP_ENVIRONMENT_TYPE` `staging` | No request, no cron event after `admin_init` |
| `staging site cannot connect` | same | Connect action ends with a notice, no request |
| `site with the snippet constant stays silent` | `MW_PLUGIN_REPORT_KEY` defined (canary text) | No request |
| `site with the snippet constant shows a notice to admins` | same | Dashboard HTML contains the notice text, and not the value of the constant |

- [ ] **Step 1:** Write both test files, run, expected: red (functions missing).
- [ ] **Step 2:** Code, appended to `includes/report.php`:

```php
/**
 * May this site send a report right now?
 *
 * @param array{website_id: string, key: string, key_version: int, server_host: string, home_host: string}|null $state The stored connection.
 * @return bool
 */
function site_dispatch_eligible( ?array $state ): bool {
	if ( null === $state || site_dispatch_legacy_reporter_present() || ! site_dispatch_environment_supported() ) {
		return false;
	}
	// A staging clone copies the key with the database. Its host differs, it stays silent.
	$host = site_dispatch_home_host();
	return '' !== $host && $state['home_host'] === $host;
}

/**
 * Plans the daily report if it is due and not planned yet.
 */
function site_dispatch_schedule(): void {
	if ( ! site_dispatch_eligible( site_dispatch_get_state() ) ) {
		return;
	}
	if ( false === wp_next_scheduled( 'site_dispatch_daily' ) ) {
		wp_schedule_event( time() + 5 * MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );
	}
}

/**
 * Reads what WordPress has stored about updates. Never triggers a check.
 *
 * @param string $name update_plugins, update_themes or update_core.
 * @return array{response: array<mixed>, no_update: array<mixed>, updates: array<mixed>, last_checked: string|null}
 */
function site_dispatch_update_data( string $name ): array {
	$out       = array(
		'response'     => array(),
		'no_update'    => array(),
		'updates'      => array(),
		'last_checked' => null,
	);
	$transient = get_site_transient( $name );
	if ( ! is_object( $transient ) ) {
		return $out;
	}
	$fields = get_object_vars( $transient );
	foreach ( array( 'response', 'no_update', 'updates' ) as $field ) {
		if ( isset( $fields[ $field ] ) && is_array( $fields[ $field ] ) ) {
			$out[ $field ] = $fields[ $field ];
		}
	}
	if ( isset( $fields['last_checked'] ) && is_numeric( $fields['last_checked'] ) ) {
		$out['last_checked'] = site_dispatch_iso( (int) $fields['last_checked'] );
	}
	return $out;
}

/**
 * Installed plugins with the update WordPress knows about.
 *
 * @param array{response: array<mixed>, no_update: array<mixed>, updates: array<mixed>, last_checked: string|null} $data Update data.
 * @return array<int, array<string, mixed>>
 */
function site_dispatch_report_plugins( array $data ): array {
	if ( ! function_exists( 'get_plugins' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}
	$plugins = array();
	foreach ( get_plugins() as $file => $header ) {
		$file   = (string) $file;
		$dir    = dirname( $file );
		$slug   = '.' === $dir ? basename( $file, '.php' ) : $dir;
		$offer  = $data['response'][ $file ] ?? null;
		$entry  = $offer ?? ( $data['no_update'][ $file ] ?? null );
		$id     = site_dispatch_pick( $entry, array( 'id' ) )['id'] ?? '';
		$picked = site_dispatch_pick( $offer, array( 'new_version', 'requires', 'requires_php', 'tested' ) );

		$plugins[] = array(
			'file'         => $file,
			'slug'         => $slug,
			'name'         => isset( $header['Name'] ) ? (string) $header['Name'] : $slug,
			'version'      => isset( $header['Version'] ) ? (string) $header['Version'] : '',
			'active'       => is_plugin_active( $file ),
			'wporg'        => 0 === strpos( $id, 'w.org/plugins/' ),
			'update_known' => null !== $entry,
			'update'       => isset( $picked['new_version'] ) ? $picked : null,
		);
	}
	return $plugins;
}

/**
 * Installed themes with the update WordPress knows about.
 *
 * @param array{response: array<mixed>, no_update: array<mixed>, updates: array<mixed>, last_checked: string|null} $data Update data.
 * @return array<int, array<string, mixed>>
 */
function site_dispatch_report_themes( array $data ): array {
	$active = get_stylesheet();
	$parent = get_template();
	$themes = array();
	foreach ( wp_get_themes() as $stylesheet => $theme ) {
		$stylesheet = (string) $stylesheet;
		$picked     = site_dispatch_pick( $data['response'][ $stylesheet ] ?? null, array( 'new_version', 'requires', 'requires_php' ) );
		$themes[]   = array(
			'stylesheet' => $stylesheet,
			'name'       => (string) $theme->get( 'Name' ),
			'version'    => (string) $theme->get( 'Version' ),
			'active'     => $stylesheet === $active,
			'parent'     => $stylesheet === $parent && $stylesheet !== $active,
			'update'     => isset( $picked['new_version'] ) ? $picked : null,
		);
	}
	return $themes;
}

/**
 * Core version with the upgrade WordPress knows about.
 *
 * @return array{version: string, update: array{version: string, response: string}|null, last_checked: string|null}
 */
function site_dispatch_report_core(): array {
	$data   = site_dispatch_update_data( 'update_core' );
	$update = null;
	foreach ( $data['updates'] as $offer ) {
		$picked = site_dispatch_pick( $offer, array( 'current', 'response' ) );
		if ( 'upgrade' === ( $picked['response'] ?? '' ) ) {
			if ( isset( $picked['current'] ) ) {
				$update = array(
					'version'  => $picked['current'],
					'response' => 'upgrade',
				);
			}
			break;
		}
	}
	return array(
		'version'      => (string) get_bloginfo( 'version' ),
		'update'       => $update,
		'last_checked' => $data['last_checked'],
	);
}

/**
 * Value of a constant, null if it is not defined.
 *
 * @param string $name Name of the constant.
 * @return mixed
 */
function site_dispatch_constant( string $name ) {
	return defined( $name ) ? constant( $name ) : null;
}

/**
 * The environment block. Strict allowlist, a value that fails its pattern is left out.
 *
 * @return array<string, mixed>
 */
function site_dispatch_environment(): array {
	global $wpdb;
	$keep = static function ( $value ): bool {
		return null !== $value;
	};

	$wp = array(
		'locale'            => site_dispatch_clean( get_locale(), '/^[A-Za-z0-9_-]{2,32}\z/' ),
		'timezone'          => site_dispatch_clean( wp_timezone_string(), '/^[A-Za-z0-9_+:\/-]{1,64}\z/' ),
		'environment_type'  => site_dispatch_clean( wp_get_environment_type(), '/^[a-z]{1,20}\z/' ),
		'https'             => 'https' === wp_parse_url( home_url(), PHP_URL_SCHEME ),
		'debug'             => true === site_dispatch_constant( 'WP_DEBUG' ),
		'cron_disabled'     => true === site_dispatch_constant( 'DISABLE_WP_CRON' ),
		'object_cache'      => (bool) wp_using_ext_object_cache(),
		'core_auto_updates' => site_dispatch_core_auto_updates(
			site_dispatch_constant( 'WP_AUTO_UPDATE_CORE' ),
			true === site_dispatch_constant( 'AUTOMATIC_UPDATER_DISABLED' ),
			get_site_option( 'auto_update_core_major', null )
		),
		'memory_limit'      => site_dispatch_clean( site_dispatch_constant( 'WP_MEMORY_LIMIT' ), SITE_DISPATCH_SIZE_PATTERN ),
	);

	$time = ini_get( 'max_execution_time' );
	$php  = array(
		'version'             => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '.' . PHP_RELEASE_VERSION,
		'extensions'          => array(
			'imagick' => extension_loaded( 'imagick' ),
			'sodium'  => extension_loaded( 'sodium' ),
			'intl'    => extension_loaded( 'intl' ),
			'opcache' => extension_loaded( 'Zend OPcache' ),
		),
		'memory_limit'        => site_dispatch_clean( ini_get( 'memory_limit' ), SITE_DISPATCH_SIZE_PATTERN ),
		'max_execution_time'  => is_string( $time ) && 1 === preg_match( '/^[0-9]{1,6}\z/', $time ) ? (int) $time : null,
		'upload_max_filesize' => site_dispatch_clean( ini_get( 'upload_max_filesize' ), SITE_DISPATCH_SIZE_PATTERN ),
		'post_max_size'       => site_dispatch_clean( ini_get( 'post_max_size' ), SITE_DISPATCH_SIZE_PATTERN ),
	);

	$environment = array(
		'wp'  => array_filter( $wp, $keep ),
		'php' => array_filter( $php, $keep ),
	);

	$db_version = site_dispatch_clean( $wpdb->db_version(), '/^[0-9]{1,3}(\.[0-9]{1,5}){1,3}\z/' );
	if ( null !== $db_version ) {
		$environment['db'] = array(
			'type'    => false !== stripos( (string) $wpdb->db_server_info(), 'mariadb' ) ? 'mariadb' : 'mysql',
			'version' => $db_version,
		);
	}

	// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- Reduced to name and version by a fixed pattern.
	$software = isset( $_SERVER['SERVER_SOFTWARE'] ) && is_string( $_SERVER['SERVER_SOFTWARE'] ) ? $_SERVER['SERVER_SOFTWARE'] : '';
	$server   = site_dispatch_server_software( $software );
	if ( null !== $server ) {
		$environment['server'] = $server;
	}
	return $environment;
}

/**
 * Builds the report body.
 *
 * @param array{website_id: string, key: string, key_version: int, server_host: string, home_host: string} $state The stored connection.
 * @return array<string, mixed>
 */
function site_dispatch_build_report( array $state ): array {
	$plugins = site_dispatch_update_data( 'update_plugins' );
	$themes  = site_dispatch_update_data( 'update_themes' );
	return array(
		'schema_version'       => 1,
		'reporter_version'     => SITE_DISPATCH_VERSION,
		'website_id'           => $state['website_id'],
		'home_url'             => (string) home_url(),
		'generated_at'         => site_dispatch_iso( time() ),
		'core'                 => site_dispatch_report_core(),
		'plugins_last_checked' => $plugins['last_checked'],
		'plugins'              => site_dispatch_report_plugins( $plugins ),
		'themes_last_checked'  => $themes['last_checked'],
		'themes'               => site_dispatch_report_themes( $themes ),
		'environment'          => site_dispatch_environment(),
	);
}

/**
 * Sends the report. One retry after an hour for transport errors, 429 and 5xx.
 *
 * @param bool $is_retry This run is the retry.
 */
function site_dispatch_send( bool $is_retry ): void {
	$state = site_dispatch_get_state();
	if ( null === $state || ! site_dispatch_eligible( $state ) ) {
		return;
	}
	$body = wp_json_encode( site_dispatch_build_report( $state ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	if ( false === $body ) {
		return;
	}
	// Signed over the exact body bytes. Replay protection comes from generated_at inside the body.
	$response = site_dispatch_post(
		'https://' . $state['server_host'] . SITE_DISPATCH_REPORT_PATH,
		$body,
		array(
			'Content-Type'   => 'application/json',
			'X-MW-Site'      => $state['website_id'],
			'X-MW-Signature' => site_dispatch_sign_body( $body, $state['key'] ),
		),
		20
	);
	$code     = $response['code'];
	update_option(
		'site_dispatch_last_report',
		array(
			'at'          => time(),
			'http_status' => $code,
		),
		false
	);
	if ( $code >= 200 && $code < 300 ) {
		return;
	}
	// A rejected report (4xx) would be rejected again, the server reports it.
	$retryable = 0 === $code || 429 === $code || $code >= 500;
	if ( $retryable && ! $is_retry && false === wp_next_scheduled( 'site_dispatch_retry' ) ) {
		wp_schedule_single_event( time() + HOUR_IN_SECONDS, 'site_dispatch_retry' );
	}
}

/**
 * Cron callback of the daily report.
 */
function site_dispatch_send_daily(): void {
	site_dispatch_send( false );
}

/**
 * Cron callback of the retry.
 */
function site_dispatch_send_retry(): void {
	site_dispatch_send( true );
}
```

- [ ] **Step 3:** `npm test`, `composer test`, `composer stan`, `composer cs` green.
  Commit: `feat: daily report with environment block`.

### Task 6: Enrollment

**Files:** `includes/enroll.php`, test `tests/integration/enroll.test.mjs`.

**Produces:** `site_dispatch_get_enrollment(): ?array`,
`site_dispatch_enroll_request( string $server_host ): bool`,
`site_dispatch_enroll_redeem(): string` (one of `connected`, `pending`, `retry`, `failed`, `none`).

In this task the tests call the two functions through `site.php()`. Task 7 adds the way through
wp-admin.

| Test (`enroll.test.mjs`) | Expected |
|---|---|
| `enrollment stores the connection and plans the first report` | After request, `fake.approve()` and redeem: `connected`, state with canary key, `key_version` 1, website id, `server_host`, `home_host` `127.0.0.1`. Transient gone. `site_dispatch_daily` due within 60 seconds |
| `request sends the hash and never the secret` | Body has `secret_hash` (64 hex), `home_host`, `plugin_version`. The secret from the transient appears in no request to the request endpoint, and SHA-256 of its text equals the sent hash |
| `requests go out with tls check on, redirects off and 15 seconds` | `X-Test-Args` of both calls: `sslverify` true, `redirection` 0, `timeout` 15, `limit_response_size` 4097, `reject_unsafe_urls` true |
| `redeem before approval stays pending` | `pending`, transient still there, no state |
| `expired request ends as failed` | `fake.expire()`: `failed`, transient gone, no state |
| `locally expired enrollment makes no call` | `expires` in the transient set to the past: `none`, no request |
| `server error during redeem keeps the request` | `500`: `retry`, transient still there |
| `redeem answer with a short key is refused` | `site_key` with 63 characters: `failed`, no state |
| `redeem answer with key version as text is refused` | `"key_version":"1"`: `failed`, no state |
| `redeem answer that is html is refused` | `failed`, no state |
| `redeem answer of 5 kb is refused` | Valid answer padded with spaces to 5 KB: `failed`, no state |
| `request answer with a wrong user code is refused` | `user_code` `<script>`: false, no transient |
| `request answer other than 200 is refused` | `401`: false, no transient |
| `host that is not valid never causes a request` | `http://x.de`, `x.de/path`, `user@x.de`, `1.2.3.4`, `localhost`, `x.de:8443`, `xn--80ak6aa92e.com`: false, no request |
| `second enrollment replaces the connection` | Fake answers with `key_version` 2: state carries 2 |
| `state and transient are stored without autoload` | Neither name in `wp_load_alloptions()` |

- [ ] **Step 1:** Write the test file, run, expected: red.
- [ ] **Step 2:** Code, `includes/enroll.php`:

```php
<?php
/**
 * Enrollment after the device pattern: ask, show a code, collect the key.
 * Contract: PROTOCOL.md, section 2.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

const SITE_DISPATCH_ENROLL_TRANSIENT    = 'site_dispatch_enroll';
const SITE_DISPATCH_ENROLL_TTL          = 240;
const SITE_DISPATCH_ENROLL_REQUEST_PATH = '/webhook/site-dispatch-enroll-request';
const SITE_DISPATCH_ENROLL_REDEEM_PATH  = '/webhook/site-dispatch-enroll-redeem';

/**
 * Reads the open enrollment. Null if there is none, if it is damaged or if its time is over.
 *
 * @return array{secret: string, request_id: string, user_code: string, server_host: string, expires: int}|null
 */
function site_dispatch_get_enrollment(): ?array {
	$raw = get_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	if ( ! is_array( $raw ) ) {
		return null;
	}
	$secret      = $raw['secret'] ?? null;
	$request_id  = $raw['request_id'] ?? null;
	$user_code   = $raw['user_code'] ?? null;
	$server_host = $raw['server_host'] ?? null;
	$expires     = $raw['expires'] ?? null;
	$valid       = is_string( $secret ) && 1 === preg_match( SITE_DISPATCH_KEY_PATTERN, $secret )
		&& is_string( $request_id ) && 1 === preg_match( SITE_DISPATCH_UUID_PATTERN, $request_id )
		&& is_string( $user_code ) && 1 === preg_match( '/^[A-HJ-NP-Z2-9]{8}\z/', $user_code )
		&& is_string( $server_host ) && site_dispatch_valid_server_host( $server_host ) === $server_host
		&& is_int( $expires ) && $expires > time();
	if ( ! $valid ) {
		delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
		return null;
	}
	return array(
		'secret'      => $secret,
		'request_id'  => $request_id,
		'user_code'   => $user_code,
		'server_host' => $server_host,
		'expires'     => $expires,
	);
}

/**
 * Asks the server for an enrollment. The secret stays in a transient, the server gets its hash.
 *
 * @param string $server_host Host as returned by site_dispatch_valid_server_host().
 * @return bool
 */
function site_dispatch_enroll_request( string $server_host ): bool {
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	if ( site_dispatch_valid_server_host( $server_host ) !== $server_host || ! site_dispatch_environment_supported() ) {
		return false;
	}
	$home_host = site_dispatch_home_host();
	if ( '' === $home_host ) {
		return false;
	}
	try {
		$secret = bin2hex( random_bytes( 32 ) );
	} catch ( \Exception $e ) {
		return false;
	}
	$body = wp_json_encode(
		array(
			'secret_hash'    => hash( 'sha256', $secret ),
			'home_host'      => $home_host,
			'plugin_version' => SITE_DISPATCH_VERSION,
		)
	);
	if ( false === $body ) {
		return false;
	}
	$response = site_dispatch_post(
		'https://' . $server_host . SITE_DISPATCH_ENROLL_REQUEST_PATH,
		$body,
		array( 'Content-Type' => 'application/json' ),
		15
	);
	if ( 200 !== $response['code'] ) {
		return false;
	}
	$parsed = site_dispatch_parse_request_response( $response['body'] );
	if ( null === $parsed ) {
		return false;
	}
	return set_transient(
		SITE_DISPATCH_ENROLL_TRANSIENT,
		array(
			'secret'      => $secret,
			'request_id'  => $parsed['request_id'],
			'user_code'   => $parsed['user_code'],
			'server_host' => $server_host,
			'expires'     => time() + SITE_DISPATCH_ENROLL_TTL,
		),
		SITE_DISPATCH_ENROLL_TTL
	);
}

/**
 * Tries to collect the key. Returns one fixed word, never anything the server said.
 *
 * @return string connected, pending, retry, failed or none.
 */
function site_dispatch_enroll_redeem(): string {
	$enrollment = site_dispatch_get_enrollment();
	if ( null === $enrollment ) {
		return 'none';
	}
	$body = wp_json_encode(
		array(
			'request_id' => $enrollment['request_id'],
			'secret'     => $enrollment['secret'],
		)
	);
	if ( false === $body ) {
		return 'failed';
	}
	$response = site_dispatch_post(
		'https://' . $enrollment['server_host'] . SITE_DISPATCH_ENROLL_REDEEM_PATH,
		$body,
		array( 'Content-Type' => 'application/json' ),
		15
	);
	$code     = $response['code'];
	if ( 202 === $code ) {
		return 'pending';
	}
	if ( 0 === $code || 429 === $code || $code >= 500 ) {
		return 'retry';
	}
	// Every other answer means the request is used up.
	delete_transient( SITE_DISPATCH_ENROLL_TRANSIENT );
	if ( 200 !== $code ) {
		return 'failed';
	}
	$parsed = site_dispatch_parse_redeem_response( $response['body'] );
	if ( null === $parsed ) {
		return 'failed';
	}
	// Delete and add: update_option() keeps an old autoload flag when the value is unchanged.
	delete_option( 'site_dispatch_state' );
	add_option(
		'site_dispatch_state',
		array(
			'website_id'  => $parsed['website_id'],
			'key'         => $parsed['site_key'],
			'key_version' => $parsed['key_version'],
			'server_host' => $enrollment['server_host'],
			'home_host'   => site_dispatch_home_host(),
		),
		'',
		false
	);
	wp_clear_scheduled_hook( 'site_dispatch_daily' );
	wp_clear_scheduled_hook( 'site_dispatch_retry' );
	wp_schedule_event( time() + MINUTE_IN_SECONDS, 'daily', 'site_dispatch_daily' );
	return 'connected';
}
```

- [ ] **Step 3:** All four commands green. Commit: `feat: enrollment request and redeem`.

### Task 7: Admin page

**Files:** `includes/admin.php`, `assets/admin.js`, test `tests/integration/admin.test.mjs`.

**Produces:** `site_dispatch_admin_menu()`, `site_dispatch_render_page()`,
`site_dispatch_admin_assets( string $hook )`, `site_dispatch_legacy_notice()`,
`site_dispatch_handle_connect()`, `site_dispatch_handle_settings()`, `site_dispatch_ajax_redeem()`.

| Action | Entry | Nonce action | Field |
|---|---|---|---|
| Connect | `admin-post.php`, `action=site_dispatch_connect` | `site_dispatch_connect` | `server_host` |
| Settings | `admin-post.php`, `action=site_dispatch_settings` | `site_dispatch_settings` | `early_updates` |
| Redeem | `admin-ajax.php`, `action=site_dispatch_redeem` | `site_dispatch_redeem`, field `nonce` | none |

| Test (`admin.test.mjs`) | Expected |
|---|---|
| `admin sees the page under tools` | `tools.php?page=site-dispatch` is 200 and says "not connected" |
| `connected site shows host, version and last report` | With state and `site_dispatch_last_report`: host, `0.1.0`, status 200 |
| `waiting update shows its install date` | With a hand-written `site_dispatch_update` (version `9.9.9`, `first_seen` now): version and a date 72 hours ahead |
| `connect through the form shows the code and the approval link` | Redirect to the page, page has `ABCDEFGH` and `https://server.example.test/form/site-dispatch-approve` |
| `redeem through ajax connects the site` | After `fake.approve()`: JSON `{"status":"connected"}`, state stored |
| `host with spaces around it is accepted` | `"  server.example.test  "`: request goes out |
| `invalid host shows a notice and causes no request` | `http://x.de`: notice, no request |
| `subscriber gets 403 everywhere` | Page, connect, settings, redeem, each with a nonce valid for the subscriber's session: 403, no request, no option written |
| `editor gets 403 everywhere` | Same with an editor |
| `visitor without login triggers nothing` | `admin-post.php` and `admin-ajax.php` without cookie: no request, no option written, status not 200 with a plugin answer |
| `request without nonce is refused` | Admin, all three actions without nonce: 403, nothing happens |
| `request with a nonce of another action is refused` | Admin, connect with the settings nonce: 403 |
| `key never appears in the page` | Connected with the canary key: page HTML, dashboard HTML and plugin list HTML do not contain it |
| `secret of an open enrollment never appears in the page or in an ajax answer` | Secret read from the transient is in none of them |
| `key never appears in a rest answer` | As admin through `rest_do_request`: index, `/wp/v2/settings`, `/wp/v2/plugins`, `/wp/v2/plugins/site-dispatch/site-dispatch` |
| `key is not part of the autoloaded options` | Serialized `wp_load_alloptions()` does not contain it |
| `rest route list has no route of the plugin` | No namespace and no route contains `site-dispatch` or `site_dispatch` |
| `plugin registers no public action and no rewrite rule` | No callback on `wp_ajax_nopriv_site_dispatch_redeem`, `admin_post_nopriv_site_dispatch_connect`, `admin_post_nopriv_site_dispatch_settings`. Rewrite rules without `site-dispatch` |
| `switch for immediate updates is stored and shown` | Settings with `early_updates=1`: option true, checkbox checked. Without the field: false |
| `multisite or staging shows no connect form` | Covered in `silent.test.mjs` for staging: page has the note, no form |

- [ ] **Step 1:** Write the test file, run, expected: red.
- [ ] **Step 2:** Code, `includes/admin.php`:

```php
<?php
/**
 * Page under "Tools": status, connect, switch for immediate updates. The key is never shown.
 *
 * Declares functions only. Hooks are registered in site-dispatch.php.
 *
 * @package Site_Dispatch
 */

const SITE_DISPATCH_PAGE          = 'site-dispatch';
const SITE_DISPATCH_POLL_INTERVAL = 3000;
const SITE_DISPATCH_POLL_MAX      = 120000;
const SITE_DISPATCH_UPDATE_DELAY  = 72 * 3600;

/**
 * Adds the page to the "Tools" menu.
 */
function site_dispatch_admin_menu(): void {
	add_management_page(
		__( 'Site Dispatch', 'site-dispatch' ),
		__( 'Site Dispatch', 'site-dispatch' ),
		'manage_options',
		SITE_DISPATCH_PAGE,
		'site_dispatch_render_page'
	);
}

/**
 * Address of the page, with a notice code if given.
 *
 * @param string $notice One of the fixed notice codes.
 * @return string
 */
function site_dispatch_page_url( string $notice = '' ): string {
	$url = admin_url( 'tools.php?page=' . SITE_DISPATCH_PAGE );
	return '' === $notice ? $url : add_query_arg( 'site_dispatch_notice', $notice, $url );
}

/**
 * Texts of the notices. Anything else in the address is ignored.
 *
 * @return array<string, array{type: string, text: string}>
 */
function site_dispatch_notices(): array {
	return array(
		'bad_host'       => array(
			'type' => 'error',
			'text' => __( 'This is not a valid host name. Enter it without https:// and without a path, for example server.example.com.', 'site-dispatch' ),
		),
		'connect_failed' => array(
			'type' => 'error',
			'text' => __( 'The server did not accept the request. Check the host name and try again.', 'site-dispatch' ),
		),
		'saved'          => array(
			'type' => 'success',
			'text' => __( 'Saved.', 'site-dispatch' ),
		),
	);
}

/**
 * Stops with 403 unless an administrator sent the form with its nonce.
 *
 * @param string $action Nonce action.
 */
function site_dispatch_require_admin( string $action ): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to do this.', 'site-dispatch' ), '', array( 'response' => 403 ) );
	}
	check_admin_referer( $action );
}

/**
 * Form "Connect": checks the host and asks the server for an enrollment.
 */
function site_dispatch_handle_connect(): void {
	site_dispatch_require_admin( 'site_dispatch_connect' );
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked in site_dispatch_require_admin().
	$input  = isset( $_POST['server_host'] ) && is_string( $_POST['server_host'] ) ? $_POST['server_host'] : '';
	$host   = site_dispatch_valid_server_host( trim( wp_unslash( $input ) ) );
	$notice = 'bad_host';
	if ( null !== $host ) {
		$notice = site_dispatch_enroll_request( $host ) ? '' : 'connect_failed';
	}
	wp_safe_redirect( site_dispatch_page_url( $notice ) );
	exit;
}

/**
 * Form "Settings": the switch for immediate updates.
 */
function site_dispatch_handle_settings(): void {
	site_dispatch_require_admin( 'site_dispatch_settings' );
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked in site_dispatch_require_admin().
	$early = isset( $_POST['early_updates'] );
	delete_option( 'site_dispatch_early_updates' );
	add_option( 'site_dispatch_early_updates', $early, '', false );
	wp_safe_redirect( site_dispatch_page_url( 'saved' ) );
	exit;
}

/**
 * Ajax for logged-in administrators: one attempt to collect the key.
 */
function site_dispatch_ajax_redeem(): void {
	if ( ! current_user_can( 'manage_options' ) || false === check_ajax_referer( 'site_dispatch_redeem', 'nonce', false ) ) {
		wp_send_json( array( 'status' => 'forbidden' ), 403 );
	}
	wp_send_json( array( 'status' => site_dispatch_enroll_redeem() ) );
}

/**
 * Loads the polling script, only on the page and only while an enrollment is open.
 *
 * @param string $hook Current admin page.
 */
function site_dispatch_admin_assets( string $hook ): void {
	if ( 'tools_page_' . SITE_DISPATCH_PAGE !== $hook || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( null === site_dispatch_get_enrollment() ) {
		return;
	}
	wp_enqueue_script( 'site-dispatch-admin', plugins_url( 'assets/admin.js', SITE_DISPATCH_FILE ), array(), SITE_DISPATCH_VERSION, true );
	wp_localize_script(
		'site-dispatch-admin',
		'siteDispatchAdmin',
		array(
			'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
			'pageUrl'     => site_dispatch_page_url(),
			'nonce'       => wp_create_nonce( 'site_dispatch_redeem' ),
			'interval'    => SITE_DISPATCH_POLL_INTERVAL,
			'maxTime'     => SITE_DISPATCH_POLL_MAX,
			'textWaiting' => __( 'Waiting for the approval.', 'site-dispatch' ),
			'textPaused'  => __( 'Still not approved. Use the button to check again.', 'site-dispatch' ),
			'textFailed'  => __( 'The request failed or has expired. Connect again.', 'site-dispatch' ),
		)
	);
}

/**
 * Tells administrators that the snippet reporter is still configured.
 */
function site_dispatch_legacy_notice(): void {
	if ( ! site_dispatch_legacy_reporter_present() || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	printf(
		'<div class="notice notice-warning"><p>%s</p></div>',
		esc_html__( 'Site Dispatch sends no reports while the constants of the old report snippet are defined. Remove the snippets to let the plugin take over.', 'site-dispatch' )
	);
}

/**
 * One row of the status table.
 *
 * @param string $label Label, already translated.
 * @param string $value Value as plain text.
 */
function site_dispatch_row( string $label, string $value ): void {
	printf( '<tr><th scope="row">%s</th><td>%s</td></tr>', esc_html( $label ), esc_html( $value ) );
}

/**
 * Text for the last report.
 *
 * @return string
 */
function site_dispatch_last_report_text(): string {
	$last = get_option( 'site_dispatch_last_report', null );
	if ( ! is_array( $last ) || ! isset( $last['at'], $last['http_status'] ) || ! is_int( $last['at'] ) || ! is_int( $last['http_status'] ) ) {
		return __( 'None yet', 'site-dispatch' );
	}
	$when = (string) wp_date( 'Y-m-d H:i', $last['at'] );
	if ( 0 === $last['http_status'] ) {
		/* translators: %s: date and time */
		return sprintf( __( '%s, server not reached', 'site-dispatch' ), $when );
	}
	/* translators: 1: date and time, 2: HTTP status code */
	return sprintf( __( '%1$s, status %2$d', 'site-dispatch' ), $when, $last['http_status'] );
}

/**
 * Text for a waiting update.
 *
 * @param bool $early Immediate updates are on.
 * @return string
 */
function site_dispatch_waiting_update_text( bool $early ): string {
	$update     = get_option( 'site_dispatch_update', null );
	$version    = is_array( $update ) ? ( $update['version'] ?? null ) : null;
	$first_seen = is_array( $update ) ? ( $update['first_seen'] ?? null ) : null;
	if ( ! is_string( $version ) || 1 !== preg_match( SITE_DISPATCH_VERSION_PATTERN, $version ) || ! is_int( $first_seen ) ) {
		return __( 'None', 'site-dispatch' );
	}
	if ( $early ) {
		/* translators: %s: version number */
		return sprintf( __( '%s, installs at the next check', 'site-dispatch' ), $version );
	}
	/* translators: 1: version number, 2: date and time */
	return sprintf( __( '%1$s, installs from %2$s', 'site-dispatch' ), $version, (string) wp_date( 'Y-m-d H:i', $first_seen + SITE_DISPATCH_UPDATE_DELAY ) );
}

/**
 * Renders the page.
 */
function site_dispatch_render_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to view this page.', 'site-dispatch' ), '', array( 'response' => 403 ) );
	}
	$state      = site_dispatch_get_state();
	$enrollment = site_dispatch_get_enrollment();
	$early      = (bool) get_option( 'site_dispatch_early_updates', false );
	$notices    = site_dispatch_notices();
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Selects one of three fixed texts, changes nothing.
	$code = isset( $_GET['site_dispatch_notice'] ) && is_string( $_GET['site_dispatch_notice'] ) ? sanitize_key( $_GET['site_dispatch_notice'] ) : '';

	echo '<div class="wrap"><h1>' . esc_html__( 'Site Dispatch', 'site-dispatch' ) . '</h1>';
	if ( isset( $notices[ $code ] ) ) {
		printf( '<div class="notice notice-%s"><p>%s</p></div>', esc_attr( $notices[ $code ]['type'] ), esc_html( $notices[ $code ]['text'] ) );
	}

	echo '<table class="form-table" role="presentation"><tbody>';
	site_dispatch_row( __( 'Connected', 'site-dispatch' ), null === $state ? __( 'No, not connected', 'site-dispatch' ) : __( 'Yes', 'site-dispatch' ) );
	site_dispatch_row( __( 'Server', 'site-dispatch' ), null === $state ? '-' : $state['server_host'] );
	site_dispatch_row( __( 'Last report', 'site-dispatch' ), site_dispatch_last_report_text() );
	site_dispatch_row( __( 'Version', 'site-dispatch' ), SITE_DISPATCH_VERSION );
	site_dispatch_row( __( 'Waiting update', 'site-dispatch' ), site_dispatch_waiting_update_text( $early ) );
	echo '</tbody></table>';

	if ( null !== $enrollment ) {
		echo '<h2>' . esc_html__( 'Approve this site', 'site-dispatch' ) . '</h2>';
		printf( '<p>%s <strong><code>%s</code></strong></p>', esc_html__( 'Type this code into the approval form of your server:', 'site-dispatch' ), esc_html( $enrollment['user_code'] ) );
		$form = 'https://' . $enrollment['server_host'] . '/form/site-dispatch-approve';
		printf( '<p><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></p>', esc_url( $form ), esc_html( $form ) );
		printf( '<p id="site-dispatch-enroll-status" aria-live="polite">%s</p>', esc_html__( 'Waiting for the approval.', 'site-dispatch' ) );
		printf( '<p><button type="button" class="button" id="site-dispatch-check">%s</button></p>', esc_html__( 'Check now', 'site-dispatch' ) );
	}

	echo '<h2>' . esc_html( null === $state ? __( 'Connect', 'site-dispatch' ) : __( 'Connect again', 'site-dispatch' ) ) . '</h2>';
	if ( ! site_dispatch_environment_supported() ) {
		echo '<p>' . esc_html__( 'Connecting is only possible on a production site without multisite.', 'site-dispatch' ) . '</p>';
	} else {
		printf( '<form method="post" action="%s">', esc_url( admin_url( 'admin-post.php' ) ) );
		echo '<input type="hidden" name="action" value="site_dispatch_connect">';
		wp_nonce_field( 'site_dispatch_connect' );
		printf( '<p><label for="site-dispatch-host">%s</label><br>', esc_html__( 'Host name of the server', 'site-dispatch' ) );
		echo '<input type="text" class="regular-text" id="site-dispatch-host" name="server_host" autocomplete="off" spellcheck="false" placeholder="server.example.com"></p>';
		if ( null !== $state ) {
			echo '<p class="description">' . esc_html__( 'Connecting again replaces the key of this site.', 'site-dispatch' ) . '</p>';
		}
		submit_button( __( 'Connect', 'site-dispatch' ), 'primary', 'submit', true );
		echo '</form>';
	}

	echo '<h2>' . esc_html__( 'Updates', 'site-dispatch' ) . '</h2>';
	printf( '<form method="post" action="%s">', esc_url( admin_url( 'admin-post.php' ) ) );
	echo '<input type="hidden" name="action" value="site_dispatch_settings">';
	wp_nonce_field( 'site_dispatch_settings' );
	printf(
		'<p><label><input type="checkbox" name="early_updates" value="1"%s> %s</label></p>',
		checked( $early, true, false ),
		esc_html__( 'Install updates of this plugin immediately, without the waiting period of 72 hours', 'site-dispatch' )
	);
	submit_button( __( 'Save', 'site-dispatch' ), 'secondary', 'submit', true );
	echo '</form></div>';
}
```

- [ ] **Step 3:** `assets/admin.js`:

```js
/**
 * Polls the redeem action while an enrollment is open. Writes text only, never HTML.
 */
( function () {
	var config = window.siteDispatchAdmin;
	if ( ! config ) {
		return;
	}
	var status = document.getElementById( 'site-dispatch-enroll-status' );
	var button = document.getElementById( 'site-dispatch-check' );
	var started = Date.now();
	var timer = null;

	function show( text ) {
		if ( status ) {
			status.textContent = text;
		}
	}

	function stop() {
		if ( timer ) {
			window.clearInterval( timer );
			timer = null;
		}
	}

	function check() {
		var body = new URLSearchParams();
		body.append( 'action', 'site_dispatch_redeem' );
		body.append( 'nonce', config.nonce );
		window
			.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body } )
			.then( function ( response ) {
				return response.json();
			} )
			.then( function ( data ) {
				if ( 'connected' === data.status ) {
					stop();
					window.location.assign( config.pageUrl );
					return;
				}
				if ( 'pending' === data.status || 'retry' === data.status ) {
					show( config.textWaiting );
					return;
				}
				stop();
				show( config.textFailed );
			} )
			.catch( function () {
				show( config.textWaiting );
			} );
	}

	timer = window.setInterval( function () {
		if ( Date.now() - started > config.maxTime ) {
			stop();
			show( config.textPaused );
			return;
		}
		check();
	}, config.interval );

	if ( button ) {
		button.addEventListener( 'click', check );
	}
}() );
```

- [ ] **Step 4:** All four commands green. Commit: `feat: admin page under tools`.

### Task 8: Deactivation and uninstall

**Files:** `uninstall.php`, test `tests/integration/uninstall.test.mjs`. Deactivation is already in
`site-dispatch.php` (Task 2).

Before each test: state, last report, switch and a hand-written `site_dispatch_update` in place, an
open enrollment, both cron hooks planned.

| Test (`uninstall.test.mjs`) | Expected |
|---|---|
| `deactivation removes the cron events and the open enrollment` | No `site_dispatch_*` hook in the cron array, transient gone |
| `deactivation keeps the connection` | State unchanged |
| `activation of a connected site plans the daily report` | `site_dispatch_daily` planned |
| `uninstall leaves no option, no transient and no cron event` | After `uninstall_plugin()`: no row in the options table whose name contains `site_dispatch`, no hook in the cron array |
| `uninstall file does nothing when called outside of an uninstall` | `uninstall.php` included without `WP_UNINSTALL_PLUGIN`: ends at once, options unchanged (run in a separate PHP call) |

- [ ] **Step 1:** Write the test file, run, expected: red.
- [ ] **Step 2:** `uninstall.php`:

```php
<?php
/**
 * Removes everything the plugin stored: options, the enrollment transient, cron events.
 *
 * @package Site_Dispatch
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'site_dispatch_state' );
delete_option( 'site_dispatch_update' );
delete_option( 'site_dispatch_early_updates' );
delete_option( 'site_dispatch_last_report' );
delete_transient( 'site_dispatch_enroll' );
wp_clear_scheduled_hook( 'site_dispatch_daily' );
wp_clear_scheduled_hook( 'site_dispatch_retry' );
```

- [ ] **Step 3:** All four commands green. Commit: `feat: uninstall removes options, transient and cron`.

### Task 9: Gate

- [ ] **Step 1:** `composer test`, `composer stan`, `composer cs`, `composer vectors`, `npm test`.
  Then `npm test` once more with `SITE_DISPATCH_TEST_PHP=7.4`. All green, numbers noted.
- [ ] **Step 2:** `tests/integration/serve.mjs`: starts fake server and site with auto login, prints
  the address of the page, keeps running until Ctrl+C. `fake.approve()` is triggered by pressing
  Enter in the terminal. Manuel opens the page once: status, connect with `server.example.test`,
  code, approval, reload as connected, switch.
- [ ] **Step 3:** `README.md`, section "Development": `npm install`, `npm test`, `npm run playground`,
  Node 20.18 or newer.
- [ ] **Step 4:** Commit: `docs: integration tests in the readme, phase 3 done`.
- [ ] **Step 5:** In `n8n-builder`: finding of Phase 3 into `plan-plugin.md`, session prompt for
  Phase 4 next to it, start offered as a chip. Present the gate. Phase 4 does not start.

## Coverage of the master plan

| Case in `plan-plugin.md`, Phase 3 | Test |
|---|---|
| Enrollment happy path | `enroll`: stores the connection. `admin`: connect through the form, redeem through ajax |
| Redeem before approval | `enroll`: stays pending |
| Expired | `enroll`: expired request, locally expired |
| Answer with wrong format | `enroll`: short key, key version as text, html, 5 kb, wrong user code |
| Report arrives, HMAC matches the vector | `report`: signature matches. Unit: protocol vector |
| Staging silent | `silent`: staging site stays silent, cannot connect |
| Changed `home_url` silent | `report`: changed home url |
| Snippet constant silent | `silent`: both tests |
| Canary values in no report | `report`: license key and urls, database host and the rest |
| Subscriber and editor get 403 | `admin`: two tests, four entries each |
| Request without nonce refused | `admin`: without nonce, nonce of another action |
| Key never in HTML, REST, `wp_load_alloptions()` | `admin`: four tests. `enroll`: without autoload |
| REST route list without own namespace | `admin`: rest route list, no public action |
| Uninstall leaves nothing | `uninstall`: five tests |

Beyond the list: transport arguments, host inputs through the form, retry rules, damaged state,
visitor without login.
