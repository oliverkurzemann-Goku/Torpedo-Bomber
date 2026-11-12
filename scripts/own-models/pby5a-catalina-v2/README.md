# Consolidated PBY-5A Catalina für Torpedo Carrier

## Freiflug

ZIP entpacken und `Offline_Freiflug.html` in einem WebGL-fähigen Browser öffnen. Die Datei enthält beide GLBs und alle Skripte. Im Menü stehen Wasserstart, Pistenstart und Freiflug in der Luft zur Wahl. Die Lackierung lässt sich im laufenden Flug umschalten.

| Funktion | Tastatur |
|---|---|
| Leistung erhöhen oder senken | W / S halten |
| Nase heben oder senken | Pfeil ↓ / ↑ |
| Querneigung und Rollen am Boden | Pfeil ← / → |
| Fahrwerk / Schwimmer | G / F |
| Blisterluken / Suchscheinwerfer | H / L |
| Bremse / Kamera / Neustart | B / C / R |

Die Touch-Tasten erscheinen auf Geräten mit Touch-Bedienung. Für Wasserstarts und Wasserlandungen das Fahrwerk einfahren und die Schwimmer ausfahren. Für Pistenstarts und Pistenlandungen das Fahrwerk ausfahren. Im Freiflug bewegen sich die Blisterluken nur bei langsamer Fahrt auf dem Wasser. Die Flugphysik und Geschwindigkeiten sind Spielwerte.

## GLB-Dateien

| Dateiname | Lackierung | Größe |
|---|---|---:|
| `assets/aircraft/pby5a-own.glb` | Blaugrau über Hellgrau, US Navy Ende 1942 | 2.579.412 Bytes |
| `assets/aircraft/pby5a-blackcat-own.glb` | Mattes Schwarz, Black Cat | 2.454.572 Bytes |

Beide Varianten teilen Geometrie und Knotenstruktur. Je Variante sind 14.666 Dreiecke, 37 Meshes, 2 Materialien und eine eingebettete Albedo-Textur mit 2048 × 2048 px enthalten. Die Außenmaße in Ruhepose betragen **31,699 × 19,456 × 6,147 m** (Spannweite × Länge × Höhe). +Z ist Bug, X ist Spannweite und +Y zeigt nach oben. **Die tiefste Kielunterkante liegt bei Y = −0,8772 m** relativ zur Modellwasserlinie Y = 0. Der Reifenaufstand liegt in der Ruhepose bei Y = −1,6072 m.

Die 35 bisherigen Knoten behalten Namen und Indizes. Der benannte Wurzelknoten ist für die Wasserlinie um 1,6072 m nach unten verschoben. Die lokalen Gelenkpunkte, Achsen und Bereiche bleiben erhalten. Die originalgetreue Außenkontur ist an das vorhandene Rig angepasst. Deshalb liegen die Motorachsen bei X = ±3,39 m (Originalplan ±2,11 m) und die Hauptfahrwerksspur bleibt 3,22 m (Originalplan 5,11 m). Die Bordnummer 27 der Tageslackierung ist die Spielkennung.

`BlisterHatchLeft` und `BlisterHatchRight` sind getrennte `canopy`-Gelenke. Eingabewert 0 ist geschlossen, 1 öffnet nach außen. Die Winkel stehen als Radiant in `extras.rig.range`. Bei `gear` und den beiden `float`-Drives entspricht Eingabewert 0 dem ausgefahrenen Zustand. Die zwölf Positionsmarker tragen kein Mesh. Die Strahlrichtung von `SearchLight` steht in `extras.direction` und zeigt in +Z mit 8° Neigung nach unten.

## Einbau in Torpedo-Bomber

Der Patch basiert auf `main` bei Commit `73744194c63661ed6705b984d13fdf10e63f4601` (Build 248). Er ergänzt den Freiflug im Pacific-Menü, registriert ihn für den Offline-App-Build und übernimmt die Wasserlinie und rechte Blisterluke im bestehenden KI-Rettungsflug.

1. `catalina.html`, `catalina-flight.js` und `catalina-flight-core.js` in den Stammordner des Spiels kopieren.
2. Die zwei GLBs nach `assets/aircraft/` kopieren und die vorhandene Tages-Catalina ersetzen.
3. Aus dem Repo-Stamm `git apply --check /Pfad/zum/Torpedo-Bomber-Catalina.patch` ausführen und anschließend mit `git apply /Pfad/zum/Torpedo-Bomber-Catalina.patch` anwenden. Der Patch liegt im Paket unter `integration/`.
4. Das Pacific-Menü enthält **PBY-5A Catalina · Amphibian Free Flight**. Für die App den normalen Projekt-Build mit `npm run build:app` ausführen.

## Prüfung

- Khronos glTF Validator meldet je GLB **0 Fehler und 0 Warnungen**. Die leeren Positionsknoten erzeugen Informationsmeldungen.
- Außenmaße, Wasserlinie, Kiel, UV-Atlas, Dateigrößen und altes Rig wurden binär geprüft. Die beiden Geometrien sind bytegleich.
- Das Flugmodul wurde automatisiert auf Starts und Landungen an Land und auf Wasser geprüft. Die KI-Rettung wurde bis zur Aufnahme simuliert, einschließlich rechter Luke und Höhenlage auf der Wasserlinie.
- Beide GLBs wurden für den Export geprüft. Das eigenständige HTML wurde auf Skriptsyntax, fehlende externe Skriptverweise und bytegleiche eingebettete Modelle geprüft. Ein praktischer Browser- und iPad-Test steht aus.
- Messwerte, Prüfsummen und Validator-Ausgabe stehen in `Pruefprotokoll.json`.

## Referenzen und Lizenzen

| Referenz | Verwendung und Rechte |
|---|---|
| [US-Wartungshandbuch AN 01-5MA-2, Abb. 1 und 2](https://www.usaf-sig.org/index.php/references/downloads/4-technical-orders/38-type-specific/42-pby-catalina?download=163:an-01-5ma-2-pby-5-pby-5a) | Dreiseitenansicht und Stationen. Amtliche US-Vorlage, in den USA gemeinfrei. |
| [Pima Air & Space Museum, PBY-5A](https://pimaair.org/museum-aircraft/consolidated-pby-5a/) | Hauptabmessungen. Museumsmaterial ohne ausgewiesene freie Lizenz, als Referenz. |
| [Canso Flight Operations Handbook, S. 25 und 43–45](https://pbycatalina.com/wp-content/uploads/2020/07/PFB-June-2020-Handbook2.pdf) | Cockpit und rotierender Blister-Innenschild. Pacific Flying Boats, urheberrechtlich geschützte Ausgabe, als Referenz. |
| [NHHC, Aircraft Markings](https://www.history.navy.mil/content/history/nhhc/research/histories/naval-aviation-history/aircraft-markings.html) und [Eduard, PBY-5A VP-42](https://info.eduard.com/en/07-2026-1/markings-for-pby-5a-catalina-1-48) | US-Hoheitszeichen und Blue Gray / Light Gray. Amtlicher US-Navy-Text und urheberrechtlich geschützte Eduard-Ausgabe, als Referenzen. |
| [Australian War Memorial, NEA0344](https://www.awm.gov.au/collection/C296465) | Black-Cat-Nachtanstrich. Das Archiv kennzeichnet das Foto als gemeinfrei. |
| [8th Air Force Historical Society, S. 7](https://www.8thafhs.org/wp-content/uploads/2022/04/2007-3RD.pdf) und [Rathmines Catalina Association](https://rathmines-catalina.com/The-PBY-Catalina) | Blister als Bergeöffnung und Unterflügel-Scheinwerfer. Texte ohne ausgewiesene freie Lizenz, als Referenzen. |

Mesh und Texturen sind Eigenarbeit für das Torpedo-Bomber-Projekt. Die Vorlagen dienten als visuelle und technische Referenz. Three.js r128 und GLTFLoader sind unter MIT lizenziert. Der Lizenztext liegt unter `vendor/THREE-LICENSE.txt`.
