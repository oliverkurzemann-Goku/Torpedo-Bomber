# Gerätetest — Squadron Build 196

**Vorlage, noch nicht durchgeführt.** Pro Gerät eine eigene ausgefüllte Kopie außerhalb des
öffentlichen Repositories aufbewahren. Keine Apple-Zugangsdaten, UDIDs oder Zertifikate eintragen.

| Gerätedaten | Eintrag |
| --- | --- |
| iPad-Modell / Chip | offen |
| iPadOS | offen |
| macOS / Xcode | offen |
| Git-Commit / Build | offen / 196 |
| Datum / Umgebung / Hülle | offen |
| Freier Speicher / Akku vor/nach | offen |

| Prüfung | Ablauf und erwartetes Ergebnis | Ergebnis / Fehler |
| --- | --- | --- |
| Erster Start | Installation über Xcode; Start bis Menü ohne leeren Bildschirm oder nativen Fehler. | offen |
| Echter Offline-Kaltstart | App nach Erstinstallation beenden; Flugmodus **und WLAN aus**; App neu öffnen. Beide Kampagnen und jeweils noch nicht verwendete Flugzeuge/Schiffe/Terrain/Audio laden. | offen |
| Touch / Querformat | Beide Landschaftsrichtungen; keine abgeschnittenen Briefings/HUDs. Stick, Gas und Waffen gleichzeitig; kein Seitenzoom. | offen |
| Unterbrechung | Im Flug Control Center öffnen, sperren und zu anderer App wechseln. Spiel pausiert; nach Rückkehr keine klemmende Steuerung oder weiterlaufendes Gefecht. | offen |
| Speichern / Neustart | Im Flug Pause drücken, App über App-Umschalter beenden, neu öffnen, Continue. Spieler/Gegner/Ziele/Schäden/Waffenbestand erhalten; Fortsetzung zunächst pausiert. | offen |
| Automatisches Speichern | Ohne Pause mindestens 25 Sekunden fliegen, beenden/neustarten. Letzter gültiger Flugstand verfügbar; keine Garantie einer letzten Speicherung beim OS-Abbruch. | offen |
| Kampagnen getrennt | Je einen Flug in Pacific/Rhine speichern; keine gegenseitige Überschreibung. Neue Mission/Abort löscht deren alten Checkpoint. | offen |
| Pacific 30 Minuten | Wetter/CB/Regen, Flak, Schiffsangriff, Versenkung und Rückkehr; frühes und spätes Aufsetzen, Fangseil, Ausrollen, Service und manueller Neustart. | offen |
| Rhine 30 Minuten | Wald-/Dorf-Tiefflug, Flak/AI, Bombenabwurf und Flugplatzlandung mit Ausrollen; Schäden/Service/Relaunch. | offen |
| Speicher / Wiederholungen | Fünf Missionswechsel je Kampagne; keine zunehmenden Abstürze oder systematische Verschlechterung. In Instruments/Xcode prüfen, falls verfügbar. | offen |
| Wärme / Akku / Frames | Zu Beginn und nach 30 Minuten gleiche Ansicht vergleichen. Bounded Reports `GameRuntime.frames.report()` und `flightQuality.report()` bei Bedarf über Web Inspector, ohne Daten hochzuladen. | offen |
| System-Speicherdruck | Natürliche App-Neuladung oder Web-Content-Verlust protokollieren; kein bestandener Test durch bloße Simulation auf Desktop. Bei echtem Verlust Wiederherstellung prüfen. | offen |

Freigabe erst nach echten Ergebnissen: keine reproduzierbaren Blocker/Abstürze, alle Touch-/
Offline-/Speichertests bestanden, stabile gewählte Grafikstufe während längerer Einsätze.
60 FPS sind das Ziel; 30 FPS als Geräteklasse erst nach Messung und bewusster Abstimmung.
Das nominelle iPadOS-Minimum ist keine Zusage, dass jedes alte iPad ausreichend schnell ist.

Fehler kurz melden: **Gerät + iPadOS + Build + Mission/Flugzeug + Schritte + erwartet/tatsächlich**.
Ein Screenshot oder kurzes Video nur bei einem sichtbaren Fehler; native Absturzlogs privat halten.
