# Site Dispatch Protocol

Version 1 of the contract between the Site Dispatch plugin and the server it reports to. Three
interfaces: the daily **report**, the one-time **enrollment**, and the signed **update**. The test
vectors at the end pin every cryptographic step byte for byte. `tests/vectors/verify-vectors.php`
recomputes them.

The plugin only makes outgoing requests. It has no REST route, no public Ajax action and no rewrite
rule. The server never calls a site.

## Conventions

- All requests are `POST` over `https` with TLS verification on and redirects off. The update
  download is the one exception, see there.
- `<server_host>` is the host name entered during enrollment. Paths are constants.
- JSON is UTF-8. Hex is lower case. Timestamps are UTC in the form `2026-01-01T00:00:00Z`.
- A UUID matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
- A host name matches `^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`. No scheme,
  no path, no port, no `user@`, no IP literal. A label starting with `xn--` is refused.
- Every response the plugin reads is size limited and checked against a fixed pattern. Anything else
  counts as a failure. Unknown fields in a server response are dropped, unknown fields in a manifest
  reject the manifest.

## Keys

The server holds one master key. Each site gets its own key, derived and never stored on the server:

```
key_input = website_id + ":" + key_version            e.g. 0000...0001:1
site_key  = hex( HMAC-SHA256( key = master_key, message = key_input ) )
```

`master_key` and `site_key` are used as the ASCII text they are written in, not as decoded bytes.
`site_key` is 64 hex characters. The server stores only `key_version` per site. Raising it
invalidates the old key at once.

## 1. Report

`POST https://<server_host>/webhook/plugin-report`

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-MW-Site` | `website_id` (UUID). Selects the key before the body is parsed |
| `X-MW-Signature` | `sha256=` + `hex( HMAC-SHA256( key = site_key, message = body bytes ) )` |

The HMAC covers the exact bytes of the request body. The plugin encodes once
(`JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`), signs those bytes and sends the same bytes.
Replay protection comes from `generated_at` inside the signed body.

### Body (`schema_version: 1`)

```json
{
  "schema_version": 1,
  "reporter_version": "1.0.0",
  "website_id": "<uuid>",
  "home_url": "https://example.com",
  "generated_at": "2026-01-01T00:00:00Z",
  "core": { "version": "6.8.2", "update": { "version": "6.8.3", "response": "upgrade" }, "last_checked": "2026-01-01T00:00:00Z" },
  "plugins_last_checked": "2026-01-01T00:00:00Z",
  "plugins": [
    { "file": "example/example.php", "slug": "example", "name": "Example", "version": "3.2.1",
      "active": true, "wporg": false, "update_known": true,
      "update": { "new_version": "3.2.4", "requires": "6.0", "requires_php": "7.4", "tested": "6.8" } }
  ],
  "themes_last_checked": "2026-01-01T00:00:00Z",
  "themes": [ { "stylesheet": "example-theme", "name": "Example Theme", "version": "1.0", "active": true, "update": null } ],
  "environment": { }
}
```

- `reporter_version` is the plugin version.
- `wporg`: the update transient lists the plugin with an `id` starting with `w.org/plugins/`.
- `update_known`: the plugin appears in `response` or `no_update` of the update transient. If it is
  in neither, no updater has checked it.
- `update` is `null` when no update is offered. The plugin reads what WordPress has stored and never
  triggers an update check itself. `*_last_checked` tells how old that data is.
- Allowlist: no URLs, no `package`, `url`, `icons` or `banners` fields, no license keys.
- At most 512 KB. The server processes at most 50 plugins per report.

### `environment` (optional)

Strict allowlist. Every field is optional, a server must accept a report without the block.

```json
"environment": {
  "wp": {
    "locale": "de_DE", "timezone": "Europe/Berlin", "environment_type": "production",
    "https": true, "debug": false, "cron_disabled": false, "object_cache": false,
    "core_auto_updates": "minor", "memory_limit": "256M"
  },
  "php": {
    "version": "8.2.30",
    "extensions": { "imagick": true, "sodium": true, "intl": true, "opcache": true },
    "memory_limit": "256M", "max_execution_time": 30,
    "upload_max_filesize": "64M", "post_max_size": "64M"
  },
  "db": { "type": "mariadb", "version": "10.11.6" },
  "server": "nginx/1.25.3"
}
```

- `wp.memory_limit` is `WP_MEMORY_LIMIT`, `php.memory_limit` is the ini value.
- `core_auto_updates` is one of `off`, `minor`, `all`. `db.type` is `mysql` or `mariadb`.
- `server` is name and version only (`^[A-Za-z][A-Za-z0-9_-]{0,31}(/[0-9][0-9.]{0,15})?$`), everything
  after that in `SERVER_SOFTWARE` is cut off.
- Never part of a report: file paths, database host, name or user, salts, email addresses, user
  counts or names, IP addresses.

### When the plugin sends

Only when all of these hold: environment type is `production`, no multisite, the host of
`home_url()` equals the host stored at enrollment (a staging clone copies the key but stays silent),
and the legacy constant `MW_PLUGIN_REPORT_KEY` is not defined.

Daily by WP-Cron. On a transport error, `429` or `5xx` one retry after an hour. A `4xx` is not retried.

### Server checks and responses

In this order: headers well formed, body present and at most 512 KB, site known, signature equal
(constant time), `website_id` in the body equals the header, `schema_version` is `1` and `plugins`
is an array, `generated_at` within 10 minutes of the server clock, host of `home_url` equals the
registered host (`www.` ignored). A report is stored only if its `generated_at` is newer than the
stored one.

| Status | Body | Meaning |
|---|---|---|
| `200` | `{"ok":true}` | Accepted (stored, or older than the stored report) |
| `400`, `401`, `413`, `422` | `{"ok":false}` | Rejected. The body never says why |

## 2. Enrollment

Device pattern: the site asks, a logged-in operator approves a short code on the server, the site
collects its key. The key goes only to the holder of the secret. Every window is 2 minutes.

### 2.1 Request

The plugin creates `secret`: 32 random bytes (`random_bytes`), written as 64 hex characters. It lives
in a short transient only.

```
secret_hash = hex( SHA-256( secret as ASCII text ) )
```

`POST https://<server_host>/webhook/site-dispatch-enroll-request`

```json
{ "secret_hash": "<64 hex>", "home_host": "example.com", "plugin_version": "1.0.0" }
```

Response `200`, at most 4 KB:

```json
{ "ok": true, "request_id": "<uuid>", "user_code": "ABCDEFGH" }
```

`user_code` matches `^[A-HJ-NP-Z2-9]{8}$` (no `I`, `O`, `0`, `1`). The request expires 2 minutes
after it was created. The server keeps only the hash, caps the number of open requests and prunes
expired ones on every call.

### 2.2 Approval

The plugin shows `user_code` and the link `https://<server_host>/form/site-dispatch-approve`. The
form needs a server login. The operator **types** the code, the server resolves `home_host` to
exactly one known website, shows it and asks for confirmation. There is no list of open requests.
Approval opens a 2 minute window for collecting.

### 2.3 Redeem

`POST https://<server_host>/webhook/site-dispatch-enroll-redeem`, every 3 seconds for at most
2 minutes, plus a button.

```json
{ "request_id": "<uuid>", "secret": "<64 hex>" }
```

| Status | Body | Meaning |
|---|---|---|
| `200` | `{"ok":true,"site_key":"<64 hex>","key_version":1,"website_id":"<uuid>"}` | Approved. The request is used up |
| `202` | `{"ok":false,"pending":true}` | Secret matches, not approved yet. Keep polling |
| `401` | `{"ok":false}` | Everything else, byte for byte the same |

Rejections do not distinguish between unknown request, wrong secret, expired, already redeemed or
malformed. `pending` is only visible with the matching secret. Of several parallel redeems exactly
one gets the key. A known site gets `key_version + 1`, a new site `1`.

The plugin accepts `site_key` only as `^[0-9a-f]{64}$`, `key_version` only as a positive integer (a
JSON number, not text), `website_id` only as a UUID. It stores them with `server_host` and the
current `home_url()` host in an option without autoload, deletes the transient and sends the first
report after a minute. The key is never shown anywhere.

Lost response: the request is used up, connect again. Rotation: connect again.

## 3. Update

The update source is fixed in the code (`includes/source.php`, `includes/keys.php`) and cannot be
changed at runtime. Enrollment decides where reports go, never where code comes from.

### Release files

A GitHub release with the tag `v<version>` carries exactly three assets:

| File | Content |
|---|---|
| `manifest.json` | The manifest, at most 8 KB |
| `manifest.json.sig` | Raw Ed25519 signature, exactly 64 bytes, no armor |
| `site-dispatch-<version>.zip` | The plugin, at most 2 MB, one top level folder `site-dispatch/` |

```
manifest, signature   https://github.com/<owner>/site-dispatch/releases/latest/download/<file>
zip                   https://github.com/<owner>/site-dispatch/releases/download/v<version>/<zip>
```

GitHub answers these with redirects to its asset host. Following them is safe because nothing is
trusted for where it came from: the manifest counts only with a valid signature, the ZIP only with
the hash from that manifest. The plugin follows redirects by itself, hop by hop and at most five.
Every hop has to be an absolute `https` address on port 443 without a user part, with TLS
verification on and with the size limit of the file that is being fetched. Anything else ends the
fetch. `latest` skips drafts and pre-releases. Manifest and signature fetched
across a release change do not match, which reads as an invalid signature and resolves itself at
the next daily check.

### Manifest

```json
{"schema":1,"slug":"site-dispatch","version":"1.2.3","zip":"site-dispatch-1.2.3.zip","sha512":"<128 hex>","requires_wp":"6.0","requires_php":"7.4"}
```

Exactly these seven fields. A missing or extra field, a wrong type or a failed pattern rejects the
manifest.

| Field | Rule |
|---|---|
| `schema` | The number `1` |
| `slug` | `site-dispatch` |
| `version` | `^\d+\.\d+\.\d+$`, compared number by number (`1.10.0` is higher than `1.9.0`) |
| `zip` | `^site-dispatch-\d+\.\d+\.\d+\.zip$`, and the version in the name equals `version`. A file name, never a URL or path |
| `sha512` | `^[0-9a-f]{128}$`, SHA-512 of the ZIP bytes |
| `requires_wp`, `requires_php` | `^\d+\.\d+(\.\d+)?$` |

Nothing in the manifest influences the waiting period.

### Signature

Signed are the manifest bytes as served, in the SSHSIG format of OpenSSH with the namespace
`site-dispatch-update`:

```
ssh-keygen -Y sign -f <public key> -n site-dispatch-update manifest.json
```

The plugin does not parse signature files. It rebuilds the signed blob from constants and the
manifest bytes, and verifies the raw signature with `sodium_crypto_sign_verify_detached` against the
built-in public keys (work key A, reserve key B; 32 bytes each):

```
string(x)   = uint32 big endian length of x, then x
signed blob = "SSHSIG" + string("site-dispatch-update") + string("") + string("sha512")
              + string( SHA-512( manifest bytes ), 64 raw bytes )
```

`manifest.json.sig` is the 64 byte signature taken out of the armored SSHSIG file. The public key
inside that file is ignored. A signature made for another namespace (a Git commit for example)
fails, because the namespace is part of the signed blob.

### On the site

1. Daily (cron hook `site_dispatch_update_check`, also on a site that is not connected): fetch
   manifest and signature, verify. Invalid: do nothing, store nothing.
2. Accept only if `slug` is its own, `version` is strictly higher than the installed one, `zip`
   matches, and the WordPress and PHP minimums are met.
3. A version seen for the first time gets a **local** timestamp. WordPress is offered the update
   72 hours later, or at once if "install updates immediately" is on (default off). A manifest with
   other bytes for the same version counts as new and starts the 72 hours again.
4. Recall and the high-water mark. The site remembers the highest version it has ever seen with a
   valid signature (option `site_dispatch_high_water`, never below the installed version or a
   waiting one). A validly signed manifest **below** that mark is a replay of an old release and
   changes nothing. At or above the mark: a waiting update is dropped when the latest release is
   gone (`404` on the manifest) or when the signed manifest is not newer than the installed version
   or does not fit the site. A transport error, any other status and an invalid signature change
   nothing. So deleting a release cancels it on every site at its next daily check. Whoever
   controls the release page without a signing key can delete, but can neither start nor restore an
   update and cannot move a site to a release it has already seen superseded.
5. Install, automatic or by click: verify the stored manifest again, check the waiting period
   again, download the ZIP from the address built from the manifest (the package address WordPress
   hands over is ignored), check the size, compare SHA-512 of the local file with `hash_equals`,
   check every name inside the ZIP (all under `site-dispatch/`, no `..`, no backslash, no absolute
   path, the main file present), hand exactly that file to the WordPress upgrader. Right before
   unpacking the file is hashed once more (`pre_unzip_file`, WordPress 6.4). After unpacking there
   has to be exactly one folder, `site-dispatch`. A deleted release answers the ZIP request with
   `404`, which ends the install.
6. The plugin header carries `Update URI`. WordPress sends it to wordpress.org, which then leaves
   the plugin out of its answer. The plugin does not rely on that: at every read of the update list
   it removes any entry for itself that it did not make.
7. A key change is a normal release with new built-in public keys, signed by a key the installed
   version already knows. Both built-in keys have the same power: the reserve key signs releases
   exactly like the work key.

A bad release is recalled with a higher version, or deleted within the waiting period. After a
deletion the next release has to carry a higher version than the deleted one, because the sites
remember what they have seen.

The plugin needs `ZipArchive` to look into the ZIP before unpacking. Without it no update installs.

## Test vectors

Files in `tests/vectors/`. The Ed25519 key was generated for this document and its private half
deleted right after signing. `master_key`, `site_key` and `enroll_secret` are canary values, not
secrets. None of them is used on a live system.

### A. Manifest signature

| | |
|---|---|
| `manifest.json` | 266 bytes, no trailing newline, shown under "Manifest" with the `sha512` below |
| `sha512` in the manifest | `668259adadeab11a45c26ffb8c6b36fa4b48a861ee22be286371164df18ba9dc6ddaeca6bce8182b1621f62d0d46e301afa51ebee5b24471d0b2faead33bbe1d` |
| Public key, base64 (`manifest-pubkey.b64`) | `UtQtnoAzaxZdWXvJdkXz6yjcTWPFVd2OIWnRtn1q6SI=` |
| Signature, base64 (`manifest.json.sig` holds the raw bytes) | `ML5nog/JRhOYjRgLcpVCXd40USnqcLOoZZzv8ZyeuFdyHmE7AI3rkthB2urQc2Sf/6N9zokIWJJb+jjRTwm+Ag==` |

Signed blob, hex (112 bytes):

```
535348534947
00000014 736974652d64697370617463682d757064617465
00000000
00000006 736861353132
00000040 30ec898be6a6fa822f22053b62001701b367c643527a5a0dfcf738ff51e273d4
         028cfdc226086b0cb6adf7956502b14c2419e326a914e8ef7917db874445b542
```

Expected: verification is true. It is false for the namespace `git`, for one flipped bit in the
manifest, and for one flipped bit in the signature.

### B. Report HMAC

| | |
|---|---|
| `master_key` | `canary-master-key-do-not-use-0123456789abcdef0123456789abcdef` |
| `website_id` | `00000000-0000-4000-8000-000000000001` |
| `key_version` | `1` |
| `key_input` | `00000000-0000-4000-8000-000000000001:1` |
| `site_key` | `ca705a03af3a0c475a33d4c8b80996b9cbcf38ca0f2309a7eca6e6e026b1ce4b` |
| Body | `report-body.json`, 524 bytes, contains `ö`, `ß` and an unescaped `/` |
| SHA-256 of the body | `77a28481015fd8e88de5a1668ce0bacf2462b05423ecf90d0171f7d4b0b0b3ec` |
| `X-MW-Signature` | `sha256=7d61bd1b0d681d85d9d5cd635a615c57507ab6f3d8db2d68e4bc41f7f5860196` |
| Registered base URL | `https://example.com` (the body says `https://www.example.com`) |

A server accepts this report when its clock is within 10 minutes of `2026-01-01T00:00:00Z`.

### C. Enrollment secret

| | |
|---|---|
| `secret` | `caaaaa00caaaaa00caaaaa00caaaaa00caaaaa00caaaaa00caaaaa00caaaaa00` |
| `secret_hash` | `e66d2a2e846dd6ff2986231204df27c9d9df8f02c7128ce982ffa16b801f3ddf` |
