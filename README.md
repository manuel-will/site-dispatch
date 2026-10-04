# Site Dispatch

WordPress plugin. Sends a signed, read-only status report (plugins, available updates, WordPress and
server versions) to a server you connect it to. No inbound endpoints, no remote commands.

**Status: in development, no release yet.**

- [PROTOCOL.md](PROTOCOL.md): report, enrollment and update interfaces, with test vectors.
- License: GPL-2.0-or-later.

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

1. Raise the version in `site-dispatch.php` (header and constant), commit.
2. `node tools/build-release.mjs` builds `dist/site-dispatch-<version>.zip` and
   `dist/manifest.json` and stops. It refuses with uncommitted changes, with an existing tag, and
   when `includes/keys.php` or `includes/source.php` are not the pinned production files
   (`tools/production-pins.json`). The same commit gives the same ZIP, byte for byte.
3. Sign `dist/manifest.json` in your own terminal, with no coding agent running:
   `ssh-keygen -Y sign -f <public key> -n site-dispatch-update manifest.json`
4. `node tools/finish-release.mjs` takes the raw 64 byte signature out of the file OpenSSH wrote,
   checks it against the keys built into the plugin and puts the three release files into
   `dist/release`. It uploads nothing.
5. `node tools/finish-release.mjs --publish` creates the GitHub release with the GitHub CLI. The
   commit has to be pushed before.

Versions only go up. `releases/latest` is GitHub's newest release by date, not by number, and every
site remembers the highest version it has seen validly signed and ignores anything lower. So never
publish a lower version after a higher one, and after deleting a release give the next one a
higher version than the deleted one. A bad release is recalled by deleting it within the waiting
period or by publishing a higher version.

A key change is a release like any other: new keys in `includes/keys.php`, new hash in
`tools/production-pins.json` and in `.gitleaks.toml`, signed with a key the installed version knows.

No private key, real site key or server address belongs in this repository. Everything key shaped
under `tests/` is a throwaway or canary value, and the keys of the update tests are made at run
time and never written to disk.
