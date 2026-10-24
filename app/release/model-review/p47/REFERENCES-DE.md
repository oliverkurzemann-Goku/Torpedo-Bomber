# P-47 Referenz- und Formprüfung

**Ergebnis: technische Integrationsprobe bestanden, historische Qualitätsfreigabe offen.** Der Kandidat wird nicht als vollständig maß- und konturgetreue D-28 ausgegeben.

## Belastbare Ausgangsdaten

Primärdokument: USAAF, AN 01-65BC-1A, 25. Januar 1945, *Pilot's Operating Instructions for P-47D-25, -26, -27, -28, -30 and -35 Aircraft*. Auf PDF-Seite 5 (gedruckte Seite 1) stehen als angenäherte Gesamtmaße: Länge 36 ft 1 in = 10,9982 m; Spannweite 40 ft 9 1/16 in = 12,4221875 m; Höhe 14 ft 2 in = 4,318 m. [Archivkopie bei EverySpec](https://everyspec.com/ARMY/ARMY-General/P-47D-25--35_AIRCRAFT_PILOTS_OPERATING_INSTRUCTIONS_1945_57084/). Das Originaldokument wurde gelesen; eine Rundung wird ausdrücklich nicht als Spantmaß interpretiert.

Die [USAF-Museumsseite zur Bubbletop-P-47](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/858869/republic-p-47/) nennt abweichende gerundete Länge/Höhe. Varianten-, Bezugs- und Bodenlagenunterschiede sind vor der Höhenfreigabe zu klären. Nicht mitteln und nicht durch unabhängiges Strecken der Achsen passend machen.

Konkret gefundenes Originalzeichnungsarchiv: [AirCorps Library, Republic P-47](https://app.aircorpslibrary.com/aircraft/p-47-republic-thunderbolt). Der Katalog ist identifiziert; die erforderlichen Republic-Kontur-/Spantblätter sind in dieser Arbeit nicht beschafft worden. Eine Katalogseite ist kein bereits gelesener Bauplan.

## Varianten- und Konturvergleich vor weiterer Detaillierung

Der freie Ausgangsautor nennt P-47D-40-RA, während unser bisheriger Spieletyp eine D-28 Bubbletop ist. Razorback-Alternativen wurden ausgeschieden. Der D-40-Rückenfillet wurde an den tatsächlichen Komponenten 21/301 entfernt. Geometrische RAF-Abzeichen und Kennungen wurden vollständig separat entfernt. Die runden Unterflügelteile waren RAF-Rondelle, **keine** identifizierten Sturzflugbremsen; eine entsprechende frühe Zuordnung wurde korrigiert. Eine D-28-Unterseitenfreigabe ist damit nicht bewiesen.

Die ursprüngliche Bodenlage war um zehn Grad in die Geometrie eingerechnet. Nach einer starren Drehung um X und genau einem gleichmäßigen Maßstabsfaktor 0,9983956078 ergeben sich 12,420000 m Spannweite und 11,004575 m Länge. Relative Abweichungen zum Handbuch: etwa −0,018 % bzw. +0,058 %. Keine Achse wurde separat gestreckt.

Konservativer Höhencheck: maximale Propeller-Rotationshülle in der aus den Reifen angepassten Bodenlage 4,4862 m gegenüber 4,318 m Handbuchhöhe, etwa +3,90 %. Der Wert hängt von der vereinbarten Höhen-/Propellerdefinition ab; bis zur eindeutigen Referenz gilt das 1-%-Höhenkriterium als **nicht bestanden**, statt einen zufällig günstig gedrehten Propeller als Nachweis zu verwenden.

`measurements-before-paint.json` enthält zehn numerische Rumpfschnitte aus der unbemalten Ausgangsgeometrie. Die Schnittgrafik und Orthogonalansichten machen die Form überprüfbar; sie beweisen ihre historische Richtigkeit nicht. Die Handbuchfotos zeigen den Typ aus schräger Perspektive und erlauben eine qualitative Kontrolle von Bubbletop, radialem Bug, Flügel-/Leitwerksanordnung. Sie liefern keine maßhaltigen Spanten. Originalquerschnitte und unabhängige Kontur-Überlagerungen bleiben **PENDING**.

## Bearbeitung und technische Prüfung

Vier Originalblätter drehen als ein Rotor um die aus der Originalwelle gemessene Achse. Drei Originalreifen bleiben geometrisch rund; originale bewegliche Flächen und separate Gruppen erhalten. Die Source-Restrotation bleibt vor der lokalen Propellerdrehung erhalten. Spieler, KI und Clips teilen keine veränderlichen Posen. Eigene silberne Lackierung, Schachbrettbug, PBR-Gebrauchsspuren; B/WZ/492024 ist eine eigene Spielinterpretation, keine dokumentierte historische Einzelmaschine.

Kein War-Thunder-Modell und keine alten Textur-/Normalmap-Pixel wurden vom Modellgenerator geöffnet. Die alte P-47 wurde nur im getrennten Audit auf Hashes/Metadaten untersucht. Vier neue eingebettete Bilder, davon zwei eigene 2048er Lack-/Oberflächenkarten und kleine CC0-Detailkarten. Exakte alte Texturhashes fehlen im neuen Modell; das ist zusätzlich zum dokumentierten Eingabeweg geprüft.

GLB-Validator: null Fehler und Warnungen. Produktionsloader r128, Spielmission, Spieler/KI, acht Mündungen, Fahrwerk und unabhängige Klone geprüft. Die gezeigten Spielbilder stammen aus Chromium/SwiftShader unter Linux. Sie sind kein Nachweis für Safari/WKWebView, iPad-Speicher oder iPad-Bildrate.
