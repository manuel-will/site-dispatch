# Site Dispatch

WordPress plugin. Sends a signed, read-only status report (plugins, available updates, WordPress and
server versions) to a server you connect it to. No inbound endpoints, no remote commands.

**Status: pilot. The first release runs on one site, more sites follow after a week of
observation.**

- [PROTOCOL.md](PROTOCOL.md): report, enrollment and update interfaces, with test vectors.
- [SECURITY.md](SECURITY.md): how to report a vulnerability.
- License: GPL-2.0-or-later.

## Installation

Install only the ZIP of a GitHub release (`site-dispatch-<version>.zip`), through "Plugins, Add
New, Upload Plugin" or by unpacking it into `wp-content/plugins/`. It unpacks into the folder
`site-dispatch/`, the folder the updater expects. A copy under another folder name (the "Source
code" archive GitHub adds to every release, a clone of the repository, a renamed folder) is moved to
`site-dispatch/` at its first update and deactivates itself in the process. Connect the plugin under
"Tools, Site Dispatch" with the host name of your server; whoever runs the server approves the code
the page shows.

## Development

```
git config core.hooksPath .githooks    # once per clone: gitleaks runs before every commit
composer install
composer vectors                       # recomputes the test vectors from PROTOCOL.md
composer test                          # PHPUnit, pure functions without WordPress
composer stan                          # PHPStan level max on the plugin code
composer cs                            # PHPCS with the WordPress rules
composer compat                        # PHPCompatibilityWP, PHP 7.4 and newer
npm install
npm run test:static                    # forbidden constructs, fixed keys and release address
npm run test:js                        # assets/admin.js in a vm sandbox
npm run test:tools                     # release tools, against throwaway repositories in a temp folder
npm test                               # integration tests in WordPress Playground, about 25 minutes
npm run playground                     # the admin page in a local Playground, with the fake server
node qa/red-runs.mjs --kinds=php,tools # red runs: one production mutation per test case, about 7 minutes
node qa/red-runs.mjs --kinds=integration --specs=update-check.test.mjs   # Playground red runs, one file
node qa/static-red-runs.mjs            # red runs for the static and admin.js tests, about a minute
node qa/pilot-instance.mjs <command>   # a local Playground site running a real release against GitHub
```

Red runs prove that every test can fail: `qa/red-runs-mutations.mjs` holds one realistic bug per
test case, the harness applies it to a throwaway copy and expects exactly that case to go red. The
protocol of the last full run is `qa/red-runs-result.md`.

Needs PHP 7.4 or newer with the `sodium` extension, Node 20.18 or newer, and
[gitleaks](https://github.com/gitleaks/gitleaks) on the PATH. Without gitleaks the pre-commit hook
refuses the commit.

The integration tests start WordPress Playground from Node, run PHP inside it and drive wp-admin
over HTTP. The plugin only speaks `https` to a host name, so a mu-plugin that exists only under
`tests/` sends requests for the made up hosts under `example.test` to fake servers on `127.0.0.1`
and refuses every other outgoing request. No test reaches the internet, GitHub or a real server.

The update tests run a **test build**: a copy of the plugin in which `includes/keys.php` holds keys
made at run time and `includes/source.php` a made up address. Nothing else differs. A switch at run
time for keys or address does not exist.

- `SITE_DISPATCH_TEST_PHP=7.4 npm test` runs them on another PHP version.
- `SITE_DISPATCH_TEST_SOURCE=<directory> npm test` runs them against another copy of the plugin,
  for red runs with a mutated copy.

## Release

A release is a commit, a ZIP built from it, a manifest and a signature over the manifest.

**Signing is the release decision.** Every manifest ever signed with one of the two built-in keys
stays installable on every site that has not seen a higher version, for as long as it is the latest
release on GitHub. There is no later veto except deleting the release within the waiting period or
publishing a higher version. So sign only what should run on every site, and nothing for a test:
tests use throwaway keys (`npm test`, `qa/pilot-instance.mjs` uses a real release on a local site
instead).

1. Raise the version in `site-dispatch.php` (header and constant), commit, push.
2. `node tools/build-release.mjs` builds `dist/site-dispatch-<version>.zip` and
   `dist/manifest.json` and stops. It refuses with uncommitted changes, with an existing tag, and
   when `includes/keys.php` or `includes/source.php` are not the pinned production files
   (`tools/production-pins.json`). The same commit gives the same ZIP, byte for byte.
3. Sign `dist/manifest.json` in your own terminal, with no coding agent running. The signing key
   lives in an SSH agent (1Password), so the agent has to be up and `ssh-add -l` has to list the
   key; `-f` names the public key file, the private key never leaves the agent:
   `ssh-keygen -Y sign -f <public key> -n site-dispatch-update manifest.json`
4. `node tools/finish-release.mjs` takes the raw 64 byte signature out of the file OpenSSH wrote,
   checks it against the keys built into the plugin and puts the three release files into
   `dist/release`. It uploads nothing.
5. Tag the commit with a signed tag and push the tag: `git tag -s v<version> -m v<version>` and
   `git push origin v<version>`. The GitHub CLI reuses an existing tag; without this step it would
   create an unsigned one.
6. `node tools/finish-release.mjs --publish` creates the GitHub release with the GitHub CLI, under
   the login of whoever runs it.

Versions only go up. `releases/latest` is GitHub's newest release by date, not by number, and every
site remembers the highest version it has seen validly signed and ignores anything lower. So never
publish a lower version after a higher one, never sign a version twice (a fix gets a new number),
and after deleting a release give the next one a higher version than the deleted one: the sites
refuse a deleted version for good. A bad release is recalled by deleting it within the waiting
period or by publishing a higher version. After a deletion GitHub shows the previous release as
latest; a site that was waiting on the deleted one reads that as the recall (the first pilot on
2026-10-04 found that only a `404` counted, fixed in 0.1.3).

A key change is a release like any other: new keys in `includes/keys.php`, new hash in
`tools/production-pins.json` and in `.gitleaks.toml`, signed with a key the installed version knows.

No private key, real site key or server address belongs in this repository. Everything key shaped
under `tests/` is a throwaway or canary value, and the keys of the update tests are made at run
time and never written to disk.
