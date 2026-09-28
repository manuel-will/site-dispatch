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
composer stan                          # PHPStan level max on includes/
composer cs                            # PHPCS with the WordPress rules
```

Needs PHP 7.4 or newer with the `sodium` extension, and [gitleaks](https://github.com/gitleaks/gitleaks)
on the PATH. Without gitleaks the pre-commit hook refuses the commit.

Release signing happens outside this repository. No private key, real site key or server address
belongs in it. Everything key shaped under `tests/` is a throwaway or canary value.
