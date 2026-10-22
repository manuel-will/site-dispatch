# Befund 2026-10-22: Ein Hoster kann den Auto-Install stillschweigend abschalten

Status: offen, noch kein Fix im Plugin. Gefunden auf `gracefreunde.de` (Raidboxes),
n8n-Seite: Fibery Task 713, Plugin Report Processor meldete taeglich
`reporter 0.1.3 is outdated, current 0.1.6`.

## Was passiert ist

Die Site blieb nach dem Rollout vom 2026-10-15 auf 0.1.3 stehen, waehrend die
uebrigen 22 angebundenen Sites 0.1.6 erreichten. Der Updater selbst war dabei
vollstaendig in Ordnung:

- `site_dispatch_update` enthielt das signierte 0.1.6-Manifest, `first_seen` 2026-10-16T08:05:05Z
- `site_dispatch_high_water` = `0.1.6`, `site_dispatch_recalled` leer
- Wartezeit abgelaufen seit 2026-10-19, `site_dispatch_get_update()['due']` = `true`
- Angebot lag im Transient `update_plugins`, `auto_update_plugin` lieferte `true`
- ZIP von GitHub erreichbar, SHA-512 identisch mit dem Manifest
- `ZipArchive` und `sodium_crypto_sign_verify_detached()` vorhanden, PHP 8.2, WP 7.1.3

Blockiert hat der Hoster. Raidboxes laedt
`wp-content/mu-plugins/raidboxes-mu-plugins/wordpress/disable-core-update.php` bei
jedem Web-Request (die Datei wird unter `! defined('WP_CLI')` eingebunden). Sie tut zwei Dinge:

1. `add_filter('schedule_event', ...)` verwirft jedes `wp_version_check`-Event. Das Event laesst
   sich gar nicht speichern, also laeuft `wp_version_check()` nie im Cron, also feuert das
   `do_action('wp_maybe_auto_update')` an dessen Ende nie.
2. `add_filter('automatic_updates_is_vcs_checkout', '__return_true')` im Konstruktor, also fuer
   **alle** Requests. Damit liefert `WP_Automatic_Updater::should_update()` fuer **jedes** Plugin
   `false`, nicht nur fuer Core. Der Filtername sagt Core, die Wirkung ist fleetweit.

Gemessen am 2026-10-22 im Web-Request-Kontext auf der Site (wp-load.php ohne `WP_CLI`):

```
RBDisableCoreUpdatePlugin_loaded=true
apply schedule_event(wp_version_check)   => false
apply schedule_event(site_dispatch_...)  => object (kept)
is_vcs_checkout(WP_PLUGIN_DIR)           => true
offer_in_transient                       => 0.1.6
auto_update_plugin filter                => true
should_update(plugin)                    => false
```

Der eigene Hook `site_dispatch_update_check` wird vom selben Filter durchgelassen. Deshalb
funktionierte die taegliche Pruefung die ganze Zeit und nur die Installation fehlte.

## Warum das nicht auffiel

Jede Pruefung per WP-CLI sieht alles gruen, weil die mu-Plugin-Datei unter WP-CLI nicht geladen
wird. `is_vcs_checkout` lieferte dort `false`, `should_update` lieferte `true`. Der Unterschied
zwischen den beiden Kontexten ist der eigentliche Stolperstein bei der Diagnose.

Der Report meldet den Zustand nicht. `environment.wp.core_auto_updates` kommt aus
`WP_AUTO_UPDATE_CORE` und `auto_update_core_major` und sagt nichts ueber Plugin-Auto-Updates.
`$updater->is_disabled()` ist hier `false`, der VCS-Riegel sitzt eine Ebene tiefer.

## Was das fuer das Versprechen des Plugins heisst

`PROTOCOL.md` Punkt 5 ("Install, automatic or by click") setzt voraus, dass WordPress den
Hintergrund-Updater ueberhaupt startet. Auf einem Hoster, der das abschaltet, wartet ein Release
unbegrenzt und niemand erfaehrt es, ausser ueber die Reporter-Warnung im Processor, die nur sagt
"veraltet", nicht "kommt auch nie an".

Zwei Richtungen, beide noch nicht entschieden:

- **Melden.** Der Report bekommt ein Feld, das die beiden Signale traegt:
  `automatic_updates_is_vcs_checkout` im Web-Kontext und ob `wp_version_check` planbar ist. Dann
  sieht der Processor den Unterschied zwischen "haengt hinterher" und "kann nicht installieren".
  Billig, aendert nichts am Verhalten.
- **Selbst installieren.** Der eigene Cron-Hook fuehrt den `Plugin_Upgrader` selbst aus, statt
  sich auf `wp_maybe_auto_update` zu verlassen. Die gesamte Pruefkette (`upgrader_pre_download`,
  `pre_unzip_file`, `upgrader_source_selection`) haengt an Filtern und laeuft dabei unveraendert
  mit. Das macht das Versprechen unabhaengig vom Hoster, baut aber einen eigenen Installationsweg,
  der zur Wartezeit, zum Recall-Boden und zum Schalter "Updates sofort installieren" passen muss.

## Erledigt und offen

- gracefreunde.de steht seit 2026-10-22 auf 0.1.6, installiert per `wp plugin update site-dispatch`
  ueber SSH. Das laeuft durch den eigenen Updater-Pfad, also mit Signatur-, SHA-512- und
  ZIP-Namenspruefung. Report danach ausgeloest, in `wp_plugin_reports` steht `reporter_version`
  `0.1.6`, keine Ablehnung.
- **Bei jedem kuenftigen Release wiederholt sich das auf dieser Site**, bis eine der beiden
  Richtungen oben umgesetzt ist. Bis dahin: nach jedem Release von Hand nachsehen.
- Nicht ermittelt, welche weiteren Sites bei Raidboxes liegen. Hinweis ohne Beweis: bei
  `baries.de` und `postcode-stiftung.de` ist im Report `core.last_checked` auf die Sekunde gleich
  `generated_at`, was zum gefaelschten `pre_site_transient_update_core` dieses mu-Plugins passt.
  Beide stehen aber auf 0.1.6, also heute ohne Wirkung. Sicher feststellen laesst es sich nur per
  SSH an `wp-content/mu-plugins/raidboxes-mu-plugins/`.
- Nebenbefund auf gracefreunde.de, gehoert nicht hierher: `WP_DEBUG` ist an, `debug.log` ist
  200 MB gross.
