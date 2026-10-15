# Replacement model qualification

This branch is a review preview, not a release approval. Default production model URLs
remain unchanged. Open `remagen-mission.html?appModels=preview` to load only the supplied
Bf 109 replacement for that type; there is no fallback to the War Thunder Bf 109 in this mode.
The offline release builder does not include this candidate directory.

## Bf 109 candidate

The 6,279,492-byte supplied GLB is preserved byte-for-byte. Its SHA-256 is
`0d3ed09912fb5b5eb7f91f2e7835de25b33c603be96a4614e928b5ed2c78cac0`.
The embedded asset metadata declares CC BY 4.0, Sabre as adapter and this source:
<https://sketchfab.com/3d-models/manilovaps-bf-109-remix-4a663a81690b41a1a700c0a501b00001>.
The source description credits manilov.ap's original:
<https://sketchfab.com/3d-models/bf109-109ef10964dc404089507fc33aad2982>.
License: <https://creativecommons.org/licenses/by/4.0/>.

Changes at runtime: measured pitch alignment, separation of original textured propeller,
main/tail gear and canopy by connected index components, closed canopy, continuous gear
pose and independently posed textured flap panels. Original vertex, normal and UV data
are retained. The adapter validates that normal-map UV channels match; no custom shader
is needed. Removed source faces are pruned from cloned index buffers only.

`node okinawa/tests/model-replacements.cjs` checks the exact file and source declaration,
then renders both current and replacement models with the game's actual loader/rig.
Set `GAME_TEST_CHROME` to an installed Chrome executable for the required WebGL proof.
Screenshots and measured results are written to ignored `test-visuals/`.
The 2026-10-15 desktop Chrome/SwiftShader run passed: 43 to 10 draw calls;
25,524 to 27,104 rendered triangles; 5,022 changed propeller pixels and 3,967
visible flap pixels for the candidate. Wheel/ground residual was below 1e-12 m.
Gear motion and separate flap poses passed at simulated 20, 60 and 120 FPS.
Full sorties, weapon origins, final visual acceptance, provenance sign-off and iPad/Safari
verification remain open. A CC label alone is not a verified chain of rights.

## Download checklist (Deutsch)

Bevorzugt CC0 oder CC BY 4.0 von den tatsächlichen Modell-/Textururhebern.
CC BY verlangt Credits, Lizenzlink und Änderungsangaben. Keine NC-/ND-Varianten für
unseren geplanten bearbeiteten, möglicherweise kommerziellen Release. BY-SA nur nach
gesonderter Prüfung; kommerzielle Nutzung ist damit nicht grundsätzlich verboten.
Bei gekauften Modellen muss die konkrete Lizenz Spiele/App-Vertrieb und eingebettete
Meshes/Texturen erlauben. Keine allein auf Reuploads aus War Thunder, Call of Duty oder
World of Warships gestützte Freigabe.

| Priorität | Modell / Suchbegriff | Anforderung |
| --- | --- | --- |
| 1 | P-47D-28 Thunderbolt bubble canopy / bubbletop | Glaskuppel zwingend; kein Razorback. Der verlinkte manilov.ap-Kandidat ist noch nicht auf diese Form geprüft. |
| 1 | B-17 Flying Fortress | Eigenständig freigegebene Ausgabe; vorhandene NC-Remixdatei reicht nicht. |
| 1 | Fw 190 F-8; Me 262 A-1a; Me 163 B; Ju 87 B-2 | Serienvarianten, detaillierte Texturen und geeignete bewegliche Teile. |
| 1 | SBD Dauntless; F4U-1C Corsair | Eigenständiger Ersatz für die bisherigen War-Thunder-Dateien. |
| 2 | M16 MGMC; M4A1 (76) W Sherman; Jagdpanther; 8.8 cm Flak 37 Sfl. | Selbst erstellte/geklärte Modelle; bei Flak ggf. zuerst eine alternative 8.8-cm-Ausführung abstimmen. |
| 2 | US-Flugzeugträger; japanischer Flugzeugträger; Fletcher-Zerstörer; Landungsschiff | Bauzustand Zweiter Weltkrieg, tatsächliche Deckgeometrie und Herkunft prüfen. |
| 2 | Frachtschiff | Vorhandene Liberty Ship zuerst prüfen; kein doppelter Download nötig. |
| 3 | Zerstörter Bauernhof / WWII farm ruins | Eigenständiger Ersatz für die FPS-Creator-Ableitung. |

Der Bf-109-Remix liegt bereits vor. Bunker und Beobachtungsposten müssen nicht erneut
geladen werden. Auch für Liberty Ship und Samidare liegen Dateien zur Prüfung vor.
Die bisherige Midway-Datei ist nicht automatisch durch die separat hochgeladene Saratoga
lizenziert oder ersetzt.

Ein erster B-17-Downloadkandidat ist maykel-bv:
<https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-473f99fba3cb44ef97d0e40100e89d72>.
Öffentliche Metadaten am 15.10.2026: Download aktiv, CC BY 4.0, 84.958 Faces;
laut Beschreibung selbst in Blender/Maya nach Bauplänen erstellt. Noch nicht lokal
geladen oder hinsichtlich beweglicher Teile, App-Leistung und endgültiger Herkunft geprüft.

Bitte GLB mit sämtlichen Texturen herunterladen, alternativ das vollständige glTF-ZIP.
Originalarchiv, Modell-URL, Autor, genaue Lizenz samt Versionsnummer und einen Screenshot
der Download-/Lizenzseite aufbewahren. Optionale originale Blender/FBX-Dateien helfen,
wenn Propeller, Fahrwerk oder Klappen darin getrennt vorliegen. Detailqualität vorab im
Viewer ansehen; keine pauschale Polygonreduktion als Ersatz für die Qualitätsprüfung.
