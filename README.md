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
npm install
npm test                               # integration tests in WordPress Playground, about 8 minutes
npm run playground                     # the admin page in a local Playground, with the fake server
```

Needs PHP 7.4 or newer with the `sodium` extension, Node 20.18 or newer, and
[gitleaks](https://github.com/gitleaks/gitleaks) on the PATH. Without gitleaks the pre-commit hook
refuses the commit.

The integration tests start WordPress Playground from Node, run PHP inside it and drive wp-admin
over HTTP. The plugin only speaks `https` to a host name, so a mu-plugin that exists only under
`tests/` sends requests for `server.example.test` to a fake server on `127.0.0.1` and refuses every
other outgoing request. No test reaches the internet or a real server.

- `SITE_DISPATCH_TEST_PHP=7.4 npm test` runs them on another PHP version.
- `SITE_DISPATCH_TEST_SOURCE=<directory> npm test` runs them against another copy of the plugin,
  for red runs with a mutated copy.

Release signing happens outside this repository. No private key, real site key or server address
belongs in it. Everything key shaped under `tests/` is a throwaway or canary value.
