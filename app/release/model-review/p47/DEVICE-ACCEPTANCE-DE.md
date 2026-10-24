# Verbindlicher Ziel-iPad-Test — noch nicht durchgeführt

Kein Ziel-iPad und keine installierte/signed .ipa waren hier zugänglich. Nichts in diesem Paket darf als Gerätefreigabe gelesen werden. Die rekonstruierte Web-Nutzlast ist keine Prüfung einer bereits installierten App.

Vor Beginn iPad-Modell/Chip, iPadOS, App-Build/Commit, Grafikstufe, Auflösung, Starttemperatur und Akkustand eintragen. Keine UDID, Zugangsdaten oder Zertifikate in den Bericht schreiben. Dasselbe Gerät und dieselben Einstellungen für Ausgangs- und Ersatzmodell verwenden.

Vorläufige messbare Schwellen: 15 Minuten anspruchsvolle Rheinmission, Start/Landung, mehrere KI-Flugzeuge und wiederholte Missionswechsel; Ziel 60 FPS mit p95 <=20 ms, p99 <=33,3 ms nach dem Laden, keine reproduzierbaren Aussetzer >100 ms; keine WebGL-/Texturfehler, kein Content-Process-Neustart. Falls das reale Zielgerät 30 FPS erfordert, Schwellen und Grafikprofil **vor** der endgültigen Messung ausdrücklich auf diese Geräteklasse festlegen, nicht nachträglich einen Fehlversuch umdeuten. Kaltstart bis Menü <=15 s, Flugzeug sichtbar <=5 s ab Briefing bei lokalem Paket. Maximaler residenter Speicher und Verlauf protokollieren; nach fünf gleichen Missionswechseln kein anhaltender Zuwachs >10 % gegenüber dem warmen Ausgangswert. Ohne Instruments/Web-Inspector-Messung kein Speicher-PASS.

Mit Web Inspector vorhandene `GameRuntime.frames.report()` und `flightQuality.report()` sowie Instruments für Speicher/Energie verwenden. Bildschirmaufzeichnung nur zusätzlich zur Messung. Niedriger Akkustand, Stromsparmodus und thermische Drosselung gesondert protokollieren. Flugmodus/WLAN aus für echten Offline-Kaltstart.

Mechanische Kontrolle: Originalpropeller, keine feste zweite Blattscheibe; Fahrwerk vollständig unten/oben; Reifenberührung auf Startbahn und bei Landung; Klappen/Quer-/Höhen-/Seitenruder; Spieler/KI getrennt; Nacht/Regen/Transparenz und Kameranähe. Fehlende neue GLB lokal simulieren: kein Download einer gesperrten alten Datei.

Am **tatsächlich exportierten** App-Paket `python3 scripts/check-model-package.py /Pfad/App.ipa --report package-result.json` ausführen. Der volle Prüflauf muss null gesperrte und null unbekannte Modellhashes melden. Der separate `--p47-only`-Lauf ist nur ein Teilnachweis. Er ersetzt keine Freigabe der anderen 17 offenen Modelle und darf nicht als volle App-Freigabe ausgegeben werden.

Ergebnisfelder: Gerät/OS/Commit; Startzeiten; p50/p95/p99; Frames >33/100 ms; Speicher warm/max/nach Wechseln; Warnungen/Abstürze; Offlinebefund; Mechanikbefund; kompletter Paket-Hashbericht; PASS/FAIL je Kriterium. Alle Felder derzeit **PENDING**.
