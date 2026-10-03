# Security

Site Dispatch runs on client sites and installs its own updates. A flaw here matters more than in
most plugins, so reports are welcome and taken seriously.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

- Preferred: GitHub private vulnerability reporting on this repository ("Report a vulnerability"
  under the Security tab).
- Alternative: email hello@manuelwill.com with "Site Dispatch security" in the subject.

Include the plugin version, what you observed, how to reproduce it, and what an attacker could do
with it. You will get an acknowledgement within 3 working days and a decision (fix, mitigation or
no action, with reasons) within 14 days. Please give us that time before publishing.

## What counts

Anything that lets someone who is not the connected server or a site administrator do one of these:

- install or run code on a site through the update path (signature, manifest, ZIP handling, the
  72-hour wait, the recall of a deleted release);
- read or forge the site key, the enrollment secret or a report;
- connect a site to a server the administrator did not approve, or move a connected site;
- make the plugin send data it is not meant to send (anything beyond the fields in
  [PROTOCOL.md](PROTOCOL.md)), or send it anywhere but the connected server;
- act on a site through the plugin from the outside. The plugin has no inbound endpoints by design,
  so any reachable endpoint is a bug.

Out of scope: issues that require a compromised WordPress administrator account or write access to
the site's files or database, denial of service against the connected server, and findings in
WordPress core or other plugins.

## How updates are protected

Releases are signed with an Ed25519 key kept in a hardware-backed password manager, never on a
build machine. The plugin ships both public keys (work and reserve) and the release address in its
code; neither can be changed by an option, a filter or a constant at run time. A release is
installed only when the manifest signature verifies, the ZIP hash matches the signed manifest, and
the release has been visible for 72 hours (administrators can opt in to immediate installs on their
own sites). Deleting a release on GitHub recalls it from every site. Details and test vectors:
[PROTOCOL.md](PROTOCOL.md), section 3.

## Supported versions

Only the latest release receives fixes. Sites install it automatically after the waiting period.
