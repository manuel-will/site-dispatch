# Phase 4: Updater and Release Tools, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, one session).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plugin updates itself, and only from a release whose manifest carries a valid
signature of work key A or reserve key B. Three tools build a release, finish it after signing and
build the test release for the integration tests. Every line of the "Update" block of the attack
catalogue is covered by at least one test.

**Architecture:** `includes/updater.php` holds the update logic. Its decisions are pure functions
(PHPUnit), the WordPress part is thin. `includes/keys.php` and `includes/source.php` hold the two
public keys and the release address and nothing else. `site-dispatch.php` stays the only file that
registers hooks. The tools are Node scripts without dependencies. Integration tests run in
WordPress Playground against a fake release server on `127.0.0.1`.

**Tech stack:** as in Phase 3. New: Node `crypto` for Ed25519 test keys, an own ZIP writer.

**Spec:** `n8n-builder/workflows/plugin-scan/spec-plugin.md` (protocol 3, attack catalogue block
"Update"), `plan-plugin.md` (Phase 4), contract `PROTOCOL.md` section 3 in this repository.

## Global constraints

- `includes/verify.php` is finished and stays untouched.
- Public keys and release address can only be changed by a build, never at run time. No filter, no
  option, no constant that can be overridden.
- Every pattern ends in `\z`, never `$`.
- No private key in the repository, not even a throwaway one. Tests create their key pairs at run
  time. The real signing key is never used for a test. No tool and no test triggers a signature.
- No test talks to GitHub, wordpress.org or the real server. Fake servers bind to `127.0.0.1`.
- Nothing is pushed, no release is published. `finish-release.mjs` uploads only with an explicit
  flag, and that path is not run in this phase.
- The plugin writes no file by itself. Downloads go through the WordPress HTTP API into a file
  from `wp_tempnam()`.
- Commits never with `--no-verify`. Files with `$` or quotes are changed with the editor tools.
- Red runs are the job of the independent QA agent (Phase 6). Each new test file still runs once
  before its code exists.

## Starting point (2026-09-28)

`git config core.hooksPath` is `.githooks`. Green before the first change: `composer test` (98
tests), `composer stan`, `composer cs`, `composer vectors`, `npm test` (83 tests, 11 minutes while
a probe ran next to it).

Public keys handed over by Manuel in `C:\Users\manue\Dev\site-dispatch-keys\` (only `.pub` files in
that folder). Both are Ed25519, they differ, fingerprints as `ssh-keygen -l` prints them:

| Key | Fingerprint |
|---|---|
| A, work key | `SHA256:jfCAQZ8S65aZfS1lqpAAn6wRgWP1ED5wMDtYLKbBtyI` |
| B, reserve key | `SHA256:tCZGQFUkh0ZETS6tlcox0W6w2c2Z6uo7DQ+iSgiXiek` |

## Probe result (2026-09-28, scratchpad, nothing committed)

Playground with WordPress 7.1.2 and PHP 8.3.33, a fake on `127.0.0.1`, throwaway plugins:

- **Redirects.** WordPress follows redirects inside its HTTP library. The reroute of the tests
  (`pre_http_request`) sees only the first address. A redirect to a made up host ends in a
  connection error. With `redirection => 0` the plugin gets status `302` and the `Location` header.
- **Size limit while streaming.** `wp_remote_get()` with `stream`, `filename` and
  `limit_response_size` cuts the file at the limit (5000 bytes served, limit 1000, file 1000).
- **Upgrade of a mounted plugin fails.** The plugin folder of the Phase 3 harness is a mount.
  WordPress cannot remove it ("Could not remove the old plugin") and leaves an empty folder. A
  plugin copied into the file system of Playground upgrades fine.
- **Hooks during an upgrade.** `upgrader_pre_download` gets `hook_extra['plugin']`.
  `pre_unzip_file` (WordPress 6.4 and newer) gets the path of the package right before unpacking.
  `upgrader_source_selection` gets the unpacked folder.
- **Automatic updater.** `wp_maybe_auto_update()` installs the update of an active plugin and then
  calls the own site once (loopback check for fatal errors). With one worker that call blocks for
  50 seconds and WordPress rolls the update back. With three workers the run takes 7 seconds and
  the new version stays.
- `ZipArchive` is there. `sodium` comes from the polyfill of WordPress, not from the extension, so
  the tests exercise the slower of the two ways.

## Decisions this plan makes (please confirm at approval)

| # | Decision | Why |
|---|---|---|
| 1 | `Update URI` is `https://github.com/manuel-will/site-dispatch` | The address of the repository. WordPress then ignores wordpress.org data for this plugin |
| 2 | The plugin follows redirects by itself, hop by hop, at most 5, every hop `https` only. It does not use `download_url()` | WordPress would follow redirects out of sight, also to `http`. Hop by hop the rule "https only" holds for every address and every hop is testable. Same size limit and the same temp file as `download_url()` |
| 3 | Own daily cron hook `site_dispatch_update_check`, planned at activation, also on a site that is not connected or is a staging copy | Security fixes have to reach every installation. `site_dispatch_daily` only exists on connected sites. The list of binding names in `plan-plugin.md` grows by this one hook |
| 4 | The update entry is added when WordPress **reads** its update list (`site_transient_update_plugins`), not when it asks wordpress.org | The offer depends only on the own stored manifest and the clock, not on wordpress.org being reachable. A foreign entry for the own plugin is removed at every read |
| 5 | Recall rule. The daily check drops a waiting update when the latest release is gone (`404`) or when a validly signed manifest is not newer than the installed version. A transport error or an invalid signature changes nothing | Deleting a release within the waiting period must cancel it on every site. An attacker with the GitHub account but without a key cannot cancel or speed up anything |
| 6 | A manifest with other bytes for the same version counts as new and starts the 72 hours again | A release that was replaced is a new release |
| 7 | At install time the stored manifest is verified again, the waiting period is checked again, the ZIP is loaded from the address built from the manifest (the `package` value WordPress hands over is ignored), size and SHA-512 are checked, then every name inside the ZIP (all under `site-dispatch/`, no `..`, no backslash, no absolute path) | "Update now" and the automatic updater take the same way. Nothing from outside decides the address |
| 8 | Right before unpacking the file is hashed once more (`pre_unzip_file`). For that the plugin needs **WordPress 6.4** or newer (header `Requires at least: 6.4`, today `6.0`) | Closes the gap between the hash check and unpacking. WordPress 6.4 is from November 2023. Alternative: keep 6.0 and leave the gap open on old versions |
| 9 | Release ZIP without compression, files in sorted order, fixed date 1980-01-01, own writer of about 70 lines in `tools/lib/zip.mjs` | Same commit, same bytes, on every machine and with every Node version. The plugin is far below the 2 MB limit without compression |
| 10 | `build-release.mjs` takes the files from the last commit (`git`), not from the working folder, and refuses with uncommitted changes, with an existing tag `v<version>`, with a version that is not `x.y.z` and when `keys.php` or `source.php` do not match `tools/production-pins.json` | A release is a commit. The pins stop a test build from being released by accident |
| 11 | `finish-release.mjs` checks the signature against the keys in `includes/keys.php` (not against the key inside the signature file), checks the ZIP hash, writes the three release files to `dist/release/` and prints the upload command. It uploads only with `--publish` (through `gh`, Manuel's login). That path is not run before Phase 8 | No release without approval. The first real run is the pilot |
| 12 | Tests move the clock by moving `first_seen` in the stored option back by 72 hours. The plugin gets no switch for the clock | A clock switch in the plugin would be a way around the waiting period |
| 13 | The test build replaces exactly `includes/keys.php` (keys created at run time) and `includes/source.php` (`https://github.example.test/manuel-will/site-dispatch`) in a copy of the plugin. The reroute of the tests sends every host under `example.test` to the fake and tells it the host name | The fake can play GitHub and its asset host, including the redirect between them |
| 14 | Updater tests start their site with the plugin **copied** into Playground and with 3 workers. The existing tests stay as they are (mount, 1 worker) | See probe |
| 15 | `PROTOCOL.md` section 3 gets three sentences: redirects hop by hop and `https` only, the recall rule, the second hash right before unpacking | The contract has to say what the plugin does |
| 16 | New test folder `tests/tools/` with its own script `npm run test:tools`. One of its tests signs with Windows OpenSSH and a key created in a temp folder outside the repository, deleted afterwards | `finish-release.mjs` has to read what `ssh-keygen -Y sign` really writes |
| 17 | The plugin version stays `0.1.0`. The first real release is cut in Phase 8 | Nothing is released in this phase |

Not part of this phase: `SECURITY.md`, `tests/static/forbidden.test.mjs` (Phase 6), anything on
GitHub.

## Files

| File | Responsibility |
|---|---|
| `includes/keys.php` | `SITE_DISPATCH_PUBLIC_KEYS`: two raw public keys, base64. Nothing else |
| `includes/source.php` | `SITE_DISPATCH_RELEASE_BASE`. Nothing else |
| `includes/updater.php` | Pure decisions, fetch with redirects, daily check, stored update, five filters |
| `includes/admin.php` | "Waiting update" reads the verified update instead of the raw option |
| `site-dispatch.php` | Header `Update URI`, `Requires at least: 6.4`, loads the three files, registers cron and filters |
| `uninstall.php` | Also clears `site_dispatch_update_check` |
| `tools/lib/zip.mjs` | ZIP writer, stored entries |
| `tools/lib/sshsig.mjs` | Signed blob, reading an armored signature file, verify with Node `crypto` |
| `tools/lib/release.mjs` | File list, manifest bytes, version from the header |
| `tools/build-release.mjs` | Builds `dist/site-dispatch-<version>.zip` and `dist/manifest.json`, prints version, SHA-512 and the signing command, ends |
| `tools/finish-release.mjs` | Raw signature, local checks, `dist/release/`, upload only with `--publish` |
| `tools/build-test-zip.mjs` | Test keys, test build of the plugin, test release |
| `tools/production-pins.json` | SHA-256 of the production `keys.php` and `source.php` |
| `tests/unit/UpdaterTest.php`, `KeysTest.php` | PHPUnit for the pure functions and the key file |
| `tests/tools/*.test.mjs` | ZIP writer, signature file, release file list, refusals of `build-release` |
| `tests/integration/fake-release.mjs` | Fake of GitHub and its asset host |
| `tests/integration/mu/site-dispatch-test-reroute.php` | Every host under `example.test`, host name as header, own site allowed (loopback) |
| `tests/integration/mu/site-dispatch-test-swap.php` | Test only, behind a constant: swaps the package after the hash check |
| `tests/integration/harness.mjs` | Options `install: 'copy'`, `workers`, `build` |
| `tests/integration/update-*.test.mjs` | Four test files, see tasks |
| `PROTOCOL.md`, `README.md`, `.gitattributes`, `package.json` | Extended |

## Interfaces

```php
// keys.php, source.php
const SITE_DISPATCH_PUBLIC_KEYS  = array( '<base64 A>', '<base64 B>' );
const SITE_DISPATCH_RELEASE_BASE = 'https://github.com/manuel-will/site-dispatch';

// updater.php, pure (no WordPress)
site_dispatch_public_keys( array $encoded ): array                 // raw keys, empty on any fault
site_dispatch_redirect_target( string $location ): ?string          // absolute https address or null
site_dispatch_release_url( string $base, string $file ): ?string    // .../releases/latest/download/<file>
site_dispatch_zip_url( string $base, array $manifest ): ?string     // .../releases/download/v<version>/<zip>
site_dispatch_judge_release( string $manifest, string $sig, array $keys, string $installed, string $php, string $wp ): string
                                                                    // 'invalid', 'not_newer', 'unfit', 'ok'
site_dispatch_next_update( ?array $stored, string $fetch, string $verdict, string $manifest, string $sig, int $now ): ?array
                                                                    // what to store, null deletes, $stored keeps
site_dispatch_update_due( int $first_seen, int $now, bool $early ): bool
site_dispatch_zip_names_ok( array $names ): bool

// updater.php, WordPress
site_dispatch_fetch( string $url, int $max_bytes, string $file = '' ): array   // array{code: int, body: string}
site_dispatch_get_update(): ?array          // verified: manifest, version, first_seen, due
site_dispatch_update_check(): void          // cron
site_dispatch_schedule_update_check(): void
site_dispatch_filter_update_list( $value )  // site_transient_update_plugins
site_dispatch_pre_download( $reply, $package, $upgrader, $hook_extra )
site_dispatch_pre_unzip( $result, $file )
site_dispatch_source_selection( $source, $remote_source, $upgrader, $hook_extra )
site_dispatch_auto_update( $update, $item )
```

Limits: manifest 8192 bytes, signature exactly 64, ZIP 2 097 152, redirects 5, address 4096
characters, timeouts 15 seconds (ZIP 60). Every fetch asks for one byte more than its limit, so
"too large" is visible.

Rules of `site_dispatch_next_update()`:

| Fetch | Verdict | Stored update |
|---|---|---|
| transport error, `5xx`, `429`, other status, too large | any | unchanged |
| `404` on the manifest | any | deleted |
| `200` | `invalid` | unchanged |
| `200` | `not_newer` | deleted |
| `200` | `unfit` (WordPress or PHP too old) | deleted |
| `200` | `ok`, same bytes as stored | unchanged, `first_seen` stays |
| `200` | `ok`, other version or other bytes | new, `first_seen` is now |

---

### Task 1: Plan, keys, source, header

- [ ] **Step 1:** Commit this plan: `docs: plan for phase 4`.
- [ ] **Step 2:** `tests/unit/KeysTest.php`: the key file declares exactly two entries, each decodes
  to 32 bytes, they differ, the file declares nothing else (one `const`, no function). Same for
  `source.php`: one `const`, value starts with `https://github.com/`. Run, expected: red.
- [ ] **Step 3:** `includes/keys.php` with the two keys from the `.pub` files (raw 32 bytes,
  base64), `includes/source.php`. `tools/production-pins.json` with their SHA-256.
- [ ] **Step 4:** `site-dispatch.php`: header `Update URI`, `Requires at least: 6.4`, `require` of
  `keys.php`, `source.php`, `updater.php` (stub with file comment). `phpcs.xml.dist`:
  `minimum_wp_version` 6.4.
- [ ] **Step 5:** Four commands green. If gitleaks reports a public key: allowlist by exact value.
  Commit: `feat: public keys, release address, update uri`.

### Task 2: Pure decisions

| Test (`UpdaterTest.php`) | Expected |
|---|---|
| keys: two valid, one with 31 bytes, not base64, empty list, entry that is not text | raw keys, or empty list on any fault |
| redirect target: `https` address, `http`, relative, with `user@`, with port 443, with port 8443, upper case host, 4097 characters, line break at the end | address or null |
| release url and zip url: built from base and manifest, base with `http`, base with trailing slash, manifest with foreign `zip` | address or null |
| judge: valid with A, valid with B, unknown key, flipped bit in manifest, in signature, signature of 63 and 65 bytes, namespace `git`, same version, lower version, `1.10.0` against `1.9.0`, PHP too old, WordPress too old, extra field, foreign slug | verdict |
| next update: every row of the rules table, plus stored update that is damaged | see table |
| due: before 72 hours, at 72 hours, one second before, switch on, `first_seen` in the future | bool |
| zip names: good list, second top folder, file on top level, `../`, `..` in the middle, backslash, absolute path, drive letter, empty list, empty name | bool |

- [ ] **Step 1:** Write the tests, keys created with `sodium_crypto_sign_keypair()`. Run: red.
- [ ] **Step 2:** Write the pure functions. Run: green. `composer stan`, `composer cs`.
- [ ] **Step 3:** Commit: `feat: pure decisions of the updater`.

### Task 3: Tools

| Test (`tests/tools/`) | Expected |
|---|---|
| zip: same entries give the same bytes, order of the input does not matter | equal |
| zip: a ZIP reader (PowerShell is not used, the integration tests unpack with WordPress) finds every entry with its bytes | own reader in the test reads the central directory |
| sshsig: blob equals the vector of `PROTOCOL.md` | 112 bytes, hex equal |
| sshsig: signature of OpenSSH with a run time key is read and verifies, wrong namespace refused, key type other than Ed25519 refused, damaged armor refused | raw 64 bytes |
| release: file list of the last commit equals the file set the harness copies, nothing from `tests/`, `tools/`, `docs/` | equal |
| release: manifest has exactly the seven fields, no line break at the end, and `site_dispatch_parse_manifest()` takes it (checked through `php`) | accepted |
| build-release refuses: uncommitted change, version `0.1`, pins do not match, tag exists | exit code not 0, fixed text |
| build-test-zip: two builds with the same keys give the same ZIP, version in header and constant changed, `keys.php` and `source.php` replaced, nothing else differs from the source | equal |
| finish-release refuses: signature of an unknown key, ZIP changed after the build, signature over another manifest | exit code not 0 |

- [ ] **Step 1:** `package.json`: script `test:tools`. Write the tests. Run: red.
- [ ] **Step 2:** `tools/lib/zip.mjs`, `sshsig.mjs`, `release.mjs`, then the three tools. The
  refusal tests run `build-release.mjs` against a throwaway git repository in a temp folder.
- [ ] **Step 3:** Run: green. One dry run of `build-release.mjs` on this repository, twice, same
  SHA-512 both times. `dist/` is ignored by git. Commit: `feat: release tools and test build`.

### Task 4: Fetch, daily check, stored update

Harness first: `install: 'copy'`, `workers`, `build`, reroute for every host under `example.test`
with the header `X-Test-Host`, own site allowed. `fake-release.mjs`: `publish( release )`,
`remove()`, redirect from the GitHub host to the asset host, switches for every fault below. The 83
existing tests stay green (`uninstall.test.mjs` learns the third cron hook).

| Test (`update-check.test.mjs`) | Expected |
|---|---|
| activation plans the daily check, also without a connection | hook planned |
| valid release is stored with manifest, signature, version and `first_seen` | option without autoload |
| request arguments: `https`, TLS check on, no automatic redirects, size limit, unsafe addresses refused | as the fake saw them |
| manifest without signature file (`404` on the signature) | nothing stored |
| signature of an unknown key, flipped bit in the manifest, in the signature | nothing stored |
| signature of 63 and of 65 bytes | nothing stored |
| signature made for the namespace `git` | nothing stored |
| same version, lower version | nothing stored, waiting update dropped |
| foreign slug, file name with `../`, with an address, without version | nothing stored |
| manifest of 9 KB | nothing stored |
| extra field `first_seen` in a signed manifest | nothing stored |
| redirect to `http`, source address with `http` (second test build), sixth redirect | nothing stored, the fake saw no request after the refusal |
| second check of the same release keeps `first_seen` | unchanged |
| new version sets `first_seen` again | new value |
| release deleted (`404`) drops the waiting update | option gone |
| fake does not answer | waiting update unchanged |
| admin page shows the waiting update and the date | text on the page |

- [ ] **Step 1:** Harness, fake, reroute. `npm test`: the 83 stay green.
- [ ] **Step 2:** Test file. Run: red.
- [ ] **Step 3:** `updater.php`: fetch, check, reader. `site-dispatch.php`: cron. `uninstall.php`.
  `admin.php`: reader. Run: green. Four commands green.
- [ ] **Step 4:** Commit: `feat: daily update check with local waiting period`.

### Task 5: Offer and install

| Test (`update-offer.test.mjs`) | Expected |
|---|---|
| before 72 hours no offer | no entry for the plugin |
| after 72 hours (clock moved) the offer is there | entry with version and address |
| switch on: offer at once | entry |
| entries of other plugins are byte for byte the same after the filter | serialized equal |
| an entry for `site-dispatch` from wordpress.org in the stored list is never offered | removed at read |
| wordpress.org answers the update check with an entry for the slug: WordPress does not store it | `Update URI` works (fake plays `api.wordpress.org`) |
| damaged stored update (no base64, signature of another manifest) | no offer |

| Test (`update-install.test.mjs`) | Expected |
|---|---|
| automatic update with the switch on installs the new version | version on disk, plugin active |
| automatic update after 72 hours installs | same |
| "Update now" in wp-admin installs through the same checks | same, the fake saw the ZIP request |
| "Update now" before 72 hours | WordPress reports "up to date", nothing installed |
| direct call of the upgrader before 72 hours with a forged update list | refused by the install check |
| ZIP replaced on the server (hash differs) | refused, old version stays |
| ZIP of 2 MB plus one byte with a valid signature | refused |
| ZIP with a second top folder, with `../` paths (both validly signed) | refused before unpacking |
| package swapped after the hash check (test mu-plugin) | refused right before unpacking |
| foreign `package` address for the own plugin | ignored, own address used |
| update of another plugin passes the filters untouched | return value unchanged |
| after the update: cron hooks planned, all options there, daily report still sent | unchanged |
| release deleted between offer and install (`404` on the ZIP) | refused, old version stays |

| Test (`update-keys.test.mjs`) | Expected |
|---|---|
| release signed by reserve key B installs | new version |
| release with new built-in keys C and D, signed by A: installs, the next release signed by C installs | chain holds |
| release signed by C while the installed version knows A and B | ignored |

- [ ] **Step 1:** Test files. Run: red.
- [ ] **Step 2:** The five filters in `updater.php`, registered in `site-dispatch.php`. Run: green.
- [ ] **Step 3:** Four commands green. Commit: `feat: signed self update`.

### Task 6: Gate

- [ ] **Step 1:** `composer test`, `composer stan`, `composer cs`, `composer vectors`,
  `npm run test:tools`, `npm test`. `npm test` once more with `SITE_DISPATCH_TEST_PHP=7.4`.
- [ ] **Step 2:** Counter check in the scratchpad: a copy of the plugin with deliberate faults
  (signature check removed, waiting period removed, hash compare removed, name check removed,
  second hash removed, `https` rule removed, recall rule removed). The tests have to find each.
- [ ] **Step 3:** Coverage table: every line of the "Update" block of the attack catalogue with its
  tests. `PROTOCOL.md` (decision 15), `README.md` (release steps, `npm run test:tools`).
- [ ] **Step 4:** Commit: `docs: update contract and release steps, phase 4 done`.
- [ ] **Step 5:** In `n8n-builder`: finding of Phase 4 into `plan-plugin.md`, `signing-keys.md`
  brought up to date, session prompt for Phase 5, start offered as a chip. Present the gate.
  Phase 5 does not start.
