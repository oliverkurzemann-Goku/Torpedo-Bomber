# Squadron auf deinem iPad installieren

Stand: 14.10.2026 · Spiel Build 196 · Mac vorhanden, keine bezahlte Apple-Mitgliedschaft.

## Was du brauchst

- Deinen Mac, dein iPad und ein Datenkabel.
- Vollständiges Xcode und Node.js 22 oder neuer. Xcode einmal öffnen und die Installation abschließen.
- Deinen eigenen Apple Account in Xcode. Zugangsdaten bleiben auf deinem Mac.
- Internet für Abhängigkeiten, Swift-Pakete und die erste Signierung; das fertige Spielpaket ist lokal.

Für den direkten Test auf deinem eigenen iPad reicht Apples kostenloses **Personal Team**.
Die Signierung gilt dabei sieben Tage; danach mit Xcode erneut bauen und installieren.
Apple nennt außerdem maximal drei Testgeräte und drei Apps je Gerät. TestFlight und
App-Store-Verteilung benötigen die passende kostenpflichtige Mitgliedschaft.
[Apple: Developer account overview](https://developer.apple.com/help/account/basics/about-your-developer-account/).

Wähle Xcode passend zu **deinem macOS und iPadOS**, nicht allein nach der Nummer des bisherigen
Simulator-Builds. Das Projekt wurde mit Xcode 26.3 kompiliert; ein neueres iPadOS kann ein
neueres Xcode/macOS erfordern. [Apple: aktuelle Systemanforderungen](https://developer.apple.com/xcode/system-requirements).

## Installation

1. [Projekt herunterladen](https://github.com/oliverkurzemann-Goku/Torpedo-Bomber/archive/refs/heads/main.zip)
   und vollständig entpacken. Ein vorhandenes Checkout stattdessen auf den aktuellen `main`-Stand bringen.
2. Terminal öffnen und in den entpackten Projektordner wechseln. Dann:

   ```sh
   bash iPad-vorbereiten.command
   ```

   Der Starter installiert die festgelegten Projektabhängigkeiten, prüft die Mac-Voraussetzungen,
   baut das Offline-Paket und öffnet Xcode. Er registriert keinen kostenpflichtigen Account und
   führt keine Anmeldung, Signierung oder Veröffentlichung selbst aus.
3. In Xcode: **Settings → Accounts → + → Apple Account** und selbst anmelden.
4. Links das blaue **App**-Projekt wählen, dann **TARGETS → App → Signing & Capabilities**.
   **Automatically manage signing** aktiv lassen und bei **Team** dein **Personal Team** wählen.
   Der vorläufige Bundle Identifier ist `at.kurzemann.squadron`. Falls Xcode ihn nicht
   registrieren kann, einen eigenen eindeutigen Identifier wählen und ihn künftig beibehalten.
   Bei einer dauerhaften Änderung später auch `appId` in `capacitor.config.json` angleichen.
5. iPad verbinden, entsperren und die Verbindung zu deinem Mac bestätigen. Oben als Ziel das
   **echte iPad** wählen, nicht „Any iOS Device“ oder einen Simulator. Schema: **App**.
6. Falls Xcode dazu auffordert: auf dem iPad **Einstellungen → Datenschutz & Sicherheit →
   Entwicklermodus** aktivieren, neu starten und bestätigen. Der Schalter erscheint gegebenenfalls
   erst nach dem ersten Verbindungs-/Startversuch.
   [Apple: Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).
7. In Xcode **Run ▶** drücken. Eventuelle Vertrauens-/Signierungsdialoge am eigenen Gerät bestätigen.
   Danach zuerst beide Kampagnen öffnen, anschließend die Tests in [DEVICE-TEST-DE.md](DEVICE-TEST-DE.md) durchführen.

Bei späteren Spieländerungen vor dem erneuten Run im Projektordner `npm run app:sync` ausführen.
Der Xcode-Build allein kopiert geänderte HTML-/Modelldateien nicht neu.

## Wenn es hakt

| Anzeige | Nächster Schritt |
| --- | --- |
| `node` / `npm` fehlt | Node.js 22+ installieren und ein neues Terminal öffnen. |
| Xcode fehlt / nur Command Line Tools aktiv | Vollständiges Xcode öffnen; Settings → Locations → Command Line Tools passend auswählen. |
| Developer disk image / OS nicht unterstützt | Xcode-/macOS-Version mit dem iPadOS anhand der Apple-Tabelle abgleichen. |
| Signing requires a development team | App-Target → Signing & Capabilities → eigenes Personal Team auswählen. |
| Bundle Identifier unavailable | Einen eigenen eindeutigen Identifier wählen; nicht wiederholt neue IDs erzeugen. |
| Provisioning abgelaufen / App startet nach sieben Tagen nicht mehr | iPad verbinden, gleiches Team und Identifier verwenden und mit Run neu installieren. |
| Swift-Pakete laden nicht | Mac-Internet prüfen und Xcode die Paketauflösung abschließen lassen. |
| Schwarzer Bildschirm / Rückkehr zum Home-Bildschirm | Xcode-Fehlertext, Mission, iPad-Modell und iPadOS notieren; nicht als erfolgreichen Gerätetest abhaken. |

## Aktueller Nachweis und Grenzen

Der [native Simulator-Build](https://github.com/oliverkurzemann-Goku/Torpedo-Bomber/actions/runs/38481797488)
ist erfolgreich. Die tatsächliche Signierung, Installation und Spielprüfung auf deinem iPad
stehen noch aus. Speicherstände aus Safari werden nicht automatisch in die App übernommen.
Eine App-Löschung kann lokale Spielstände entfernen; nicht zum Erneuern der Signierung löschen.

Die persönliche Installation löst die offenen Modellrechte nicht. Externe Beta-/Store-Verteilung
erst nach dokumentierter Freigabe oder passenden Ersatzmodellen; siehe [Rechteprüfung](../../APP-ASSET-AUDIT.md).
