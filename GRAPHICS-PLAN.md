# Grafik- und Performance-Plan

Stand: 16.11.2026, **Build 277: Phasen 0–6 umgesetzt, Build 278–283: Nachbesserungen nach iPad-Test (Abschnitte 0a–0f)** (Freigabe des Nutzers: „setze deine Phasen um …
aber keine 120 fps"). Zielgerät des Nutzers: **iPad Pro mit M1**, Ziel **stetige 60 Bilder/s** (120 Hz ist
ausdrücklich kein Ziel). Was gebaut ist, steht im neuen Abschnitt 0; die Abschnitte 1–8 sind der Plan von
Build 276 (unverändert, mit Vermerken).

## 0f. Build 283: Pazifik „Ultra High“, Hitzeflimmern ohne Gelee-Triebwerke

**Pazifik Ultra** (Menü „Pacific scenery“, `tc_pacific_scenery`, `?scenery=ultra`). Im Pazifik besteht der größte Teil des Bildes aus Meer
und Himmel; dort setzt Ultra an (nicht Gelände wie am Rhein):
- Meer (Fragment-Shader, `#ifdef ULTRA`): Wellen-Normalenkarte 256² (48 Sinuswellen, ganzzahlige Wellenzahlen → kachelbar, Kanal B =
  geschärfte Kämme) in drei Maßstäben 23/7/2 m, windgetrieben; die kleinen Maßstäbe blenden zwischen 120 und 900 m aus (Rest erledigen
  Mipmaps + anisotrope Filterung 8×). Subsurface-Licht durch Kämme, Glitzern mit entfernungsabhängiger Rauigkeit, Wolkenschatten aus
  zwei Rauschwerten (720/260 m, Stärke nach Wetter), Schaumkronen nach Seegang, Brandungsbänder an Okinawa (aus der vorhandenen
  Küstentextur). Netz 320 statt 170 Reihen. Höhe unverändert (`seaHeightAt`).
- Himmel: Horizont-Dunstband, wärmer Richtung Sonne, engere Scheibe, breiter Hof.
- Post-Pass immer an (MSAA 4×, 24-Bit-Tiefe); Glühen nur, wenn die Stufe es hat.
- Kosten (nicht auf dem iPad gemessen): je Meer-Pixel drei Texturzugriffe + zwei Rauschwerte mehr; +147 000 Dreiecke Meer.
- Nicht gebaut: Gelände-Relief/-Schatten für Okinawa, Wolkenschatten auf Insel und Schiffen, Schiffs-Bugwellen in Ultra.

**Hitzeflimmern** (Me 262/Me 163, Rhein Ultra + High): der Post-Pass zeichnet die Silhouette des Spielerflugzeugs in eine Maske halber
Auflösung (Ebene 6; die Szenenlichter liegen mit auf der Ebene, damit kein Material sein Programm neu wählt; die Schattenkarte wird für
diesen Pass nicht gezeichnet) und verschiebt kein Pixel, das selbst oder dessen Quelle auf dem Flugzeug liegt. Gemessen: wackelnde
Flugzeug-Pixel 377 → 1, die Luft dahinter flimmert weiter (`heat-haze-browser.cjs`).

## 0e. Build 282: Das Nadelöhr ist die CPU (WebGL-Aufrufe), nicht nur die Pixel

Nutzer: „Die stabile frame rate funktioniert nicht. Auch bei steady 60 sinkt sie. Was ist eigentlich das
Nadelöhr …?" Ein Bild kostet zwei Dinge, die parallel laufen: **CPU** (Spiellogik + jeden Draw-Call an WebGL
übergeben) und **Grafikchip** (Dreiecke und vor allem Pixel). Die Bildrate richtet sich nach dem langsameren.
Auflösung senken entlastet nur den Grafikchip.

Gemessen (Chromium, Rhein Ultra/High, P-47 in 300 m, Draw-Aufrufe als No-op = nur CPU-Seite):

| | vor Build 282 | Build 282 |
|---|---|---|
| Draw-Calls je Bild | ~600 | ~600 (unverändert) |
| WebGL-Aufrufe je Bild | 6 960 | **2 384** |
| Zeichenbefehle abschicken, Median / P95 | 8,1 / 10,9 ms | **4,2 / 7,5 ms** |
| Welt/Gelände (Skript) | 3,3 ms | 3,1 ms |

Herkunft der ~600 Draws: Bodenflächen 133 · Bäume (1-km-Zellen × 5 Arten) ~170 · Gebäude ~85 · Gelände 36 ·
übrige Szene ~85 · Schattenpass ~50. Weitere Hebel gemessen: ohne Schattenpass −6 % Aufrufe; Sichtweite
Bäume/Gebäude 7 → 5,5 / 4,5 / 3,5 km: −9 / −14 / −50 % (3,5 km: ganze Kacheln Bäume fehlen sichtbar – nicht gebaut).

Ursache: r128 bindet bei jedem `InstancedMesh`-Draw alle Vertex-Attribute neu (`updateBuffers=true`).
Patch `scripts/patch-three-instancing.cjs` (VAO je Instanz-Mesh, Neubindung nur bei geändertem Instanzpuffer,
Freigabe beim `dispose`). Bild bitgleich (`okinawa/tests/three-instancing-browser.cjs`).

Die Messanzeige zeigt jetzt `CPU … ms (draws …) of … ms · limit: CPU/GPU` und die 60-FPS-Stufe. Nächste
Schritte, falls das iPad weiter „CPU“ meldet: Bodenflächen je Kachel zu einem Mesh, Baumarten je Zelle bündeln.

## 0d. Build 281: Flackern in den Jet-Einsätzen – Wolken-Sprites vor der Kamera und beim Umsetzen

Nutzer (Foto Build 279, Komet): „Bei der me262 Mission und der Komet Mission flackert der Bildschirm und die
Farben verändern sich…." Gemessen im echten Spiel (Chromium/SwiftShader, Ultra/High, Wetter `broken`):

| Verdacht | Messung | Ergebnis |
|---|---|---|
| Glühen (Bloom) | Bild mit/ohne Glühen bei Nick −0,35…+0,6 | identisch, kein Pixel über der Schwelle .92 |
| Hitzeflimmern | Bereich (0,5; 0,3), Radius 0,08 Bildhöhe, Ausschlag 0,0022 | klein, hinter dem Heck; nicht ausgeschlossen auf der Apple-GPU |
| Sicht in der Wolke | 40 s Komet-Steigflug 1 050 → 2 000 m | Sichtweite 8 500 → 6 800 m, weich (Zeitkonstante 0,5 s) |
| **Kamera in einem Wolken-Sprite** | dieselben 40 s | **296 von 1 200 Bildern** |
| Wolken-Umsetzen | Spanne 10 km (Pazifik 9 km), 28 Wolken, 240 m/s | ein Wolkenstück taucht ~alle 1,5 s bei 5 km auf |

Me 262 und Komet sind die einzigen Spielerflugzeuge, die durch die Schicht steigen (der Komet startet in ihr).
Ein Puff ist eine kamerazugewandte Scheibe von 300–500 m: knapp vor der Kamera füllt er das Bild mit
55–80 % Deckkraft und ist im nächsten Bild weg. **Fix:** `FlightOps.fadeClouds` (beide Spiele, jedes Bild in
`updateClouds()`): Puff-Deckkraft × smoothstep(1 r, 2,4 r, Abstand), Wolke × (1 − smoothstep(0,74, 0,92 der
halben Spanne)). Test `okinawa/tests/cloud-fade.cjs`: um die Kamera Deckkraft 0, größter Schritt je Bild
0,033 (20 FPS) / 0,011 (60) / 0,005 (120), Umsetzen unsichtbar. Kosten: eine Schleife über ~240 Puffs je Bild.

**Nachmessung (Build 282):** im gerenderten Bild (600 Bilder Komet-Steigflug, 110 mit Kamera im Puff) gab es
auch **ohne** Ausblenden keinen Helligkeitssprung (größter Sprung des Bildmittels 0,3/255; Ultra-Puffs sind nur
~20 % deckend). Die Wolken sind als Ursache **nicht bestätigt**; das Ausblenden bleibt als Vorsorge.

## 0c. Build 280: Einstellung „Frame rate“ (60 halten / 30 fest / unbegrenzt)

Nutzer (iPad-Bild, Build 279, Ultra High + High: „30 FPS · P95 41 ms · 1,38 M tris · 522 draws · 143 MB · 2,00×"):
„Jetzt sind es meist nur 1,5 Millionen tris, trotzdem wird die Framerate auch bei High auf bis zu 28 fps
gedrosselt. Ich habe schon mit 5 Mio tris und 48 fps gespielt … Warum gibt es keine fixe fps Einstellung?"
- **Keine Drosselung im Code:** Auf Ultra lief weder die alte `AdaptiveQuality` noch ein Bildratendeckel. Die
  30 FPS sind die Grafikkarte: ein Bild, das 16,7 ms verfehlt, zeigt der 60-Hz-Bildschirm erst nach 33 ms.
- **Dreiecke sind nicht der Engpass, Bildpunkte sind es.** Ultra + High rendert mit Pixelverhältnis **2,0**
  (2732×2048 = 5,6 Mio. Bildpunkte, 4× MSAA im Szenenziel), dazu Schattenkarte und Glühen; Build 276 lief mit
  1,5× (3,1 Mio.) ohne beides. Gemessen im echten Spiel (Chromium/SwiftShader, Rhein-Freiflug Ultra/High,
  iPad-Viewport 1194×834 @2×, Mittel aus 6 Bildern inkl. GPU-Synchronisation; Software-GPU, nur Verhältnisse
  aussagekräftig): 2× alles 3 319 ms · 1,5× 2 634 · 1× 2 005 · 2× ohne Schatten 2 958 · 2× ohne
  Nachbearbeitung 2 858 · 2× ohne Glühen 3 067 · **1,5× ohne Schatten/Nachbearbeitung (≈ Build 276) 2 074**.
  Ultra/High kostet also das **1,6-fache** von Build 276 – genau 48 FPS → 30 FPS. Von den Mehrkosten hängen
  ~2/3 an der Auflösung.
- **Neu (`graphics-quality.js`, beide Spiele, Menü und Pausenmenü „Frame rate“, Schlüssel
  `graphicsFrameRate`, `?framerate=`):** `hold60` (Vorgabe): Fenster von 1 s; ist das Mittel > 112 % von
  16,7 ms, sinkt die Auflösung eine Stufe (Leiter 2 · 1,75 · 1,5 · 1,3 · 1,15 · 1, nie unter 1×, Tier-Maximum
  bleibt Obergrenze); nach 6 Fenstern im Ziel ein Versuch nach oben, scheitert er binnen 4 s, zurück und
  doppelte Wartezeit (30 s … 5 min), nach drei Fehlversuchen auf derselben Stufe keine weiteren. Schatten,
  Glühen, Detail bleiben – Auflösungswechsel kompilieren keine Shader. Ist schon die Skriptzeit des Bildes
  (`GameRuntime.frames.lastCpu`) über dem Ziel, bleibt die Auflösung (weniger Bildpunkte helfen dann nicht).
  Auto ändert die Stufe erst, wenn die Auflösung ganz unten (zu langsam) bzw. ganz oben (schnell genug) ist.
  `cap30`: zeichnet jedes zweite 60-Hz-Bild (≥ 28 ms Abstand), volle Auflösung, Ziel 33 ms. `free`: wie bis
  Build 279. Die alte `AdaptiveQuality` (Auflösung bei fester Stufe) läuft nur noch bei `free`.
- **Automatisierte Browser** (`navigator.webdriver`) bleiben auf `free`, damit simulierte 20-FPS-Testschleifen
  nie die Auflösung ändern; `?framerate=` schaltet es für Tests ein.
- Tests: neu `okinawa/tests/graphics-framerate.cjs` (iPad-Modell 60-Hz-Vsync: findet die höchste passende Stufe,
  ≤ 9 Wechsel in 10 min, danach ruhig; schneller Gerät bleibt 2×; Boden 1×; Auto erst an der Untergrenze; 30 FPS
  bei 60/120 Hz; CPU-Wächter; Speicherung). Im echten Spiel (Rhein Ultra/High, 30-ms-Bilder): 2 → 1,75 → 1,5 →
  1,3 → 1,15 in 8 s, danach 60-FPS-Bilder → wieder 1,3; Schatten/Nachbearbeitung/Glühen an, kein GL-Fehler.
- **Offen:** kein iPad-Test. Ob das iPad bei 1,3–1,5× die 60 schafft, ist nicht gemessen; ist es CPU-gebunden,
  hilft die Einstellung nicht (dann sinkt nichts). Unter 1× bleibt Ultra/High notfalls langsamer als 60 –
  dann `cap30` oder Medium.

## 0b. Nachbesserung Build 279: Schatten kamen spät und plötzlich (High)

Nutzer nach Build 278: „Jetzt kommen die Schatten leider sehr spät und kurzfristig bei High und hoher Framerate."
Gemessen im echten Rhein-Freiflug (P-47, 150 m/s, 60 und 300 m über Grund, Stufe High = Ultra):
- Die Schattenkarte (2048², ±240 m) war auf das **Flugzeug** zentriert. Entlang der Flugbahn deckte sie
  200 m nach vorn und 200 m nach hinten ab; die Verfolgerkamera (52 m hinter dem Flugzeug) sieht viel weiter.
  Bäume bekamen ihren Schatten also erst 200 m vor dem Flugzeug und an einer harten Kante.
- Welche Baumzellen (166 m Radius) und Gebäude Schatten werfen, wurde nur **alle 2 s** neu gewählt. Bei
  150 m/s war in 60 m Höhe zeitweise **keine** Zelle vor dem Flugzeug mehr als Schattenwerfer markiert
  (weiteste markierte Zelle 150 → 50 → 0 → −100 m, dann Sprung auf 800 m) – die Schatten direkt vor dem
  Flugzeug fehlten bis zu ~1,5 s.

Geändert (`graphics-extras.js`, `graphics-quality.js`):
- Schattenbox auf dem **Boden vor der Kamera**: Mittelpunkt = Bodenpunkt unter dem Flugzeug + 0,55 × Reichweite
  in Blickrichtung (Gelände über `getRenderedHeight`), weiterhin auf Texel eingerastet.
- Reichweite High 240 → 360 m (0,35 m je Texel statt 0,23), Medium 130 → 200 m (0,39 m).
- Schattenwerfer viermal je Sekunde neu gewählt (Zellen bis 1,6 × Reichweite um die Box-Mitte); kleine
  Einzelobjekte und Flugzeuge weiter alle 2 s.
- **Weicher Rand:** `ShaderChunk.shadowmap_pars_fragment` wird beim Anlegen einmal gepatcht – der Schatten
  blendet in den äußeren 16 % der Box aus statt an einer Linie abzubrechen (nur die Rheinseite lädt das Modul).

Gemessen danach (gleiche Strecke): Schatten bis **550 m** vor dem Flugzeug (vorher 200), 150 m dahinter;
die weiteste markierte Zelle liegt durchgehend 950–1 500 m voraus (nie mehr hinter dem Flugzeug). Bild
(Ultra/High) ohne Shaderfehler, 1,55 Mio. Dreiecke, 587 Draw-Calls (Budget 2,5 Mio./800). Test
`okinawa/tests/graphics-shadows.cjs` (scheitert am alten Code). Grenze: Bäume weiter als ~0,6 km haben
weiterhin keinen Echtzeitschatten (nur die gebackenen Geländeschatten); dafür bräuchte es Kaskaden.

## 0a. Nachbesserung Build 278 (iPad-Rückmeldung zu Build 277)

- **Auto hatte Hänger:** Auto senkte nach 2 s unter 45 Bildern/s eine Stufe und hob nach 15 s flüssigem Flug wieder
  an. Ein Gerät, das auf Medium ~40 Bilder/s schafft und auf Low 60, pendelte so alle ~25 s hin und her. Jeder
  Wechsel schaltete Schatten an/aus (alle Shader neu übersetzen) und änderte die anisotrope Filterung (alle Texturen
  neu hochladen). Gemessen im Testbrowser (SwiftShader, echtes Ultra): erstes Bild nach einem Wechsel 0,2–184 s,
  20 neue Shaderprogramme. Jetzt: Auto wechselt nur noch Auflösung, Baumreichweite, Glühen, Bodendetail; Schatten
  und Filterung bleiben auf dem Stand der Startstufe; eine Stufe, die einmal zu langsam war, wird in dieser Sitzung
  nicht wieder versucht; Senken nach 3 s statt 2 s, Heben nach 20 s statt 15 s. Gemessen danach: erstes Bild nach
  dem Wechsel 64 ms, 0 neue Programme, kein Zurückpendeln. Feste Stufen (Low/Medium/High) unverändert.
  Test `okinawa/tests/graphics-quality.cjs`.
- **Junge Bäume schwebten (Rattenflug):** `OSMManager.updateNearForest` setzte die jungen Bäume auf die *gerade
  gezeichnete* Geländehöhe. Nach einem Luftstart (Rattenflug, 13,5 km vom Platz) sind die Kacheln noch grob; die
  Gruppen blieben dann in der Luft hängen, auch nachdem das Gelände fein wurde. Gemessen, nachdem das Gelände fein war: 557 junge Bäume mehr
  als 6 m über dem Boden (normale Bäume: 0); mit der Korrektur auf derselben Strecke 0. Jetzt: Höhe des Elternbestands plus DEM-Gefälle (unabhängig vom LOD). `landscape-variety.cjs`
  prüft das (alter Code: 40 m daneben).
- **Braune Stellen am Ufer (Ultra):** die „Sandbänke" (`RhineRiverLife`, braungrüne Flecken im Uferwasser) wurden für
  die nächsten 48 Uferstellen gezeichnet und erschienen am Rand dieser Liste schlagartig – einige hundert Meter vor dem
  Flugzeug. Jetzt 96 Stellen, und sie blenden zur Grenze der Liste weich aus (kein Aufpoppen mehr).

## 0. Umsetzungsstand Build 277

Neue Module (beide Spiele): `graphics-quality.js` (Grafikstufen, Auto-Regelung, Messanzeige, anisotrope
Filterung), `graphics-post.js` (Nachbearbeitung: Tonwertkurve, Glühen, Hitzeflimmern), `graphics-extras.js`
(Schattenkarte ums Flugzeug, Kondensstreifen, Gras am Flugplatz, Wolkenlicht). iOS: `GraphicsHealth.swift`.

| Phase | Gebaut | Wo |
|---|---|---|
| 0 Messen | Messanzeige jetzt auch im Pazifik (`?perf=1` / Häkchen „Performance panel"), mit Texturspeicher und Grafikstufe; Budget-Test `okinawa/tests/render-budget-browser.cjs` (Rhein Ultra/High + Pazifik/High, 8 Blickrichtungen) | beide |
| 1 Budget | Menü **Graphics: Auto (60 FPS) / Low / Medium / High** (Pause und Startmenü, gespeichert); Bäume in **1-km-Zellen** mit eigenem Frustum-Test (vorher wurde jede Baum-Kachel immer gezeichnet: r128 schaltet den Test für InstancedMesh ab); **Baum-Detailstufen** (nah volle Krone, ab 1,6 km × Stufe 4-/8-flächige Fernkrone, Stämme nur bis 1,1 km); anisotrope Filterung 2/4/8× je Stufe; **Okinawa (Pazifik)**: dieselbe Lösung für die ~8 800 Laubbäume (2-km-Zellen, Fernkrone 20 statt 224 Dreiecke ab 1,6 km × Stufe, Stämme bis 1,1 km) – vorher gingen dort in **jedem** Bild 2,0 Mio. Baum-Dreiecke an die Grafikkarte, auch hinter der Kamera | Bäume beide, Rest beide |
| 2 Licht | in **Ultra High**: Tonwertkurve ACES in der Nachbearbeitung (Rhein; Pazifik hatte sie schon); **Schattenkarte ums Flugzeug** (1024/2048 px, 130/240 m, Flugzeuge, Häuser, nahe Bäume, Flugplatz); **gebackene Geländeschatten + Gelände-Normalen** pro Kachel (128², in 2,4-ms-Scheiben gebacken); Wolken mit Sonnen-/Schattenseite | Rhein Ultra |
| 3 Oberflächen | Bodendetail im Nahbereich (Ultra, Medium/High); Fensterlicht in Dämmerung/Nacht; Himmels-Spiegelung für **alle** Flugzeugtypen (bisher nur Me 262/Bf 109) | Rhein Ultra; Spiegelung beide |
| 4 Vegetation | **junge Bäume um das Flugzeug** (Medium: halbe, High: volle Dichte, innerhalb 900 m, je Zelle eine Instanzgruppe); **Gras am Flugplatz** (Grasbüschel neben Piste und Rollwegen) | Rhein Ultra |
| 5 Effekte | **Glühen** (High), Kondensstreifen ab 3,4 km Höhe, **Hitzeflimmern** hinter der Me 262 (High) | Glühen beide; Rest Rhein Ultra |
| 6 App | `GraphicsHealth.swift`: Temperaturstufe (`ProcessInfo.thermalState`) und Speicherwarnung → Ereignis `graphicsdevicehealth` → höchste erlaubte Stufe sinkt (ernst → Medium, kritisch/Speicher → Low); **komprimierte Texturen bewusst nicht** (siehe unten) | App |

**Ultra-Hänger (Ursache gemessen, behoben):** Die Kulissenstufe Ultra zeichnete alle 0,14 s eine 512²-Landmaske
(Felder, Schatten aller Bäume und Häuser von neun Kacheln, zweimal Zurücklesen) **in einem einzigen Frame**.
Gemessen im echten Spiel (Chromium/SwiftShader): 1,7–2,4 s pro Maske in einem Stück. Das Zerteilen der
Zeichenbefehle half nicht (ein 2D-Canvas sammelt die Befehle und arbeitet alles beim Zurücklesen ab: größtes
Stück danach immer noch 0,9–1,2 s). Jetzt: Daten im Hauptthread sammeln (4–14 ms), **Zeichnen und Zurücklesen
in einem Worker mit OffscreenCanvas** (Safari ab 16.4); Ergebnis bitgleich zur Hauptthread-Fassung und bis auf
4 von 262 144 Pixeln (Kantenglättung, ≤ 14 Stufen im Grünkanal) gleich dem alten Bild. Ohne Worker fällt sie
auf die alte Zeichnung im Hauptthread zurück. Ein weiterer, nicht behobener Posten: `terrain.updateLOD` bis
45 ms in einzelnen Frames (Kachelwechsel; Basis- und neuer Stand gleich) – das ist der vermutete
„Geländekachel-Aufbau" und bleibt offen (siehe Abschnitt 8).

**Budget-Test (Build 277, `okinawa/tests/render-budget-browser.cjs`, Stufe High, je 8 Blickrichtungen, Schattenpass
mitgezählt; Zählwerte gelten für jedes Gerät, Zeiten sind hier nicht gemessen):**

| Ort | Dreiecke je Bild | Draw-Calls | Texturen |
|---|---|---|---|
| Rhein Ultra, Freiflug 350 m | 1,13–1,42 Mio. | 422–543 | 106 MB |
| Pazifik, Flotte (3 km vom Träger, 320 m) | 0,29–0,67 Mio. (Build 276: bis 2,56 Mio.) | 258–393 | 95 MB |
| Pazifik, über Okinawa (450 m, Blick über die Insel) | 0,70–1,32 Mio. (Build 276: 2,72–3,03 Mio.) | 383–655 | 95 MB |

Budget High: ≤ 2,5 Mio. Dreiecke, ≤ 800 Draw-Calls, ≤ 350 MB – alle Orte darunter. Der erste Lauf fiel im Pazifik
durch (2,56 Mio.): die Okinawa-Laubbäume (3 Instanzgruppen, 2,0 Mio. Dreiecke) wurden immer ganz gezeichnet;
jetzt Zellen + Fernkrone wie im Rhein (Bild vorher/nachher im Arbeitsordner verglichen, gleich).

**Komprimierte Texturen – Entscheidung, nicht gebaut:** Texturspeicher gemessen (Budget-Test oben: 95–106 MB) liegt deutlich unter dem Budget von 350 MB; r128 hat in der Nicht-Modul-Fassung keinen `KTX2Loader`,
nur `BasisTextureLoader` mit eigenem Transcoder (WASM). Ein Umbau aller GLB-Texturen brächte heute keinen
sichtbaren Gewinn. Erst nötig, wenn 4096er-Flugzeugtexturen zurückkommen sollen.

**Was „Auto" tut:** startet auf Touch-Geräten auf Medium, sonst High; senkt nach 2 s unter 45 Bildern/s, hebt
nach 15 s über 57 Bildern/s; eine Temperatur- oder Speicherwarnung der App begrenzt die Obergrenze. Die
alte Regelung (`AdaptiveQuality`: Auflösung, Rauch, Regen) läuft im Rhein nur noch, wenn eine feste Stufe
gewählt ist – sonst würden zwei Regler gegeneinander arbeiten. Auch Ultra High folgt jetzt der Stufe (Pixelverhältnis Low 1 · Medium 1,5 · High 2; vorher fest 2) – auf dem iPad beginnt Ultra also mit 1,5 und steigt auf 2, wenn die Bilder es erlauben.

Dieser Plan gilt für **alle Sitzungen** (auch andere KI-Sitzungen, die an der Rhein-Kulisse arbeiten):
wer Grafik ändert, hält die Budgets in Abschnitt 3 ein und trägt Messwerte hier nach.

**Abgleich mit `main` (Builds 272–275 einer anderen Sitzung, parallel zu diesem Plan entstanden):** Der Rhein hat
jetzt eine wählbare Kulissenstufe **„Ultra High“** (`terrain-system/RhineUltra.js`, Menü „Rhine scenery“, Link
`?scenery=ultra`). Sie bringt Pixelverhältnis 2 mit fester Qualität (keine automatische Absenkung), einen
berechneten Himmel mit Wolkendecke, **Wolkenschatten**, **Luftperspektive** (Dunst nach Entfernung und Talhöhe),
belebtes Ufer, Schiffsverkehr und Vögel sowie eine **Leistungsanzeige** (`?perf=1` oder Häkchen im Menü:
Bilder/s, schlechteste 5 % Bildzeit, Dreiecke, Draw-Calls, Pixelverhältnis). Damit ist ein Teil von Phase 0
und Phase 2 schon vorhanden; die Phasen unten sind darauf angepasst. Die Zählwerte in Abschnitt 1 sind vor
Ultra gemessen (Stufe „Detailed“); Ultra ist in diesem Plan noch nicht vermessen.

---

## 1. Ausgangslage (gemessen, nicht geschätzt)

Gemessen im echten Spiel in Chromium (Zählwerte sind geräteunabhängig; Zeiten wären es nicht und stehen
deshalb nicht hier). Messskripte: Arbeitsordner der Sitzung, Muster in `CLAUDE.md` (Eintrag 15.11.2026).

| | Rhein | Pazifik |
|---|---|---|
| Dreiecke pro Bild | 4,7–5,3 Mio. | 3,1–3,2 Mio. (mit Schattenpass) |
| Draw-Calls | 470–580 | 290–590 |
| Texturen im Grafikspeicher | 300 MB → **104 MB** (Build 276) | ≈ 90 MB |
| Pixelverhältnis am iPad | 1,5 (Deckel) | 2,0 |
| Schatten | keine | weich, 2048 px, ±240 m |
| Tone-Mapping / sRGB-Ausgabe | nein / nein | ACES / ja |
| Himmel | einfarbige Fläche + linearer Nebel | Himmelskuppel |
| Anisotrope Filterung Flugzeug | aus | teils (Avenger 4×) |

**Drei Befunde, die den Plan bestimmen:**

1. **76 % der gezeichneten Baum- und Gebäudedreiecke liegen außerhalb des Bildes.** Das Spiel schickt im Mittel
   4,28 Mio. Instanz-Dreiecke an die Grafikkarte, im Bild liegen 1,01 Mio. (je nach Blickrichtung 16–34 %).
   Grund: Bäume hängen als ein Paket je 4-km-Kachel an der Szene; ein Paket wird nur verworfen, wenn die ganze
   Kachel außerhalb liegt.
2. **Zwei Drittel der Baum- und Gebäudedreiecke im Bild sind weiter als 4 km entfernt** – dort ist eine Baumgruppe
   (bis 40 m breit) nur 5–10 Bildpunkte groß, wird aber mit 78–84 Dreiecken gezeichnet; die Dreiecke sind kleiner
   als ein Bildpunkt. Innerhalb von 2 km liegen nur 8 %.
   Mit Zellen-Culling und drei Detailstufen käme der Rhein rechnerisch von ≈ 4,9 Mio. auf ≈ 1 Mio. Dreiecke
   bei gleichem Bild (Rechnung aus der Entfernungsverteilung, noch nicht gebaut).
3. **Der sichtbare Abstand zu „guten" Spielen liegt nicht an der Polygonzahl, sondern am Licht.**
   Der Rhein hat keinen Schattenwurf (Flugzeuge „schweben" am Boden), keinen echten Himmel, keine
   Tonwertkurve (helle Flächen brennen aus, alles wirkt flach), unscharfe Bodentexturen im Nahbereich.

Dazu ein Messwert aus dem P-47-Vergleich: **8-fache anisotrope Filterung** verändert 9–14 % der
Flugzeug-Pixel sichtbar (schärfere Blechstöße bei flachem Blickwinkel) und kostet auf Apple-GPUs wenig.

---

## 2. Grundsatzentscheidungen

**Web oder App?** Die Grafik entsteht im gemeinsamen Spielcode. Die App (Capacitor) zeigt denselben Code
in derselben WebKit-Engine wie Safari. Deshalb:

- **Grafik jetzt im Spielcode verbessern** – der Nutzer testet wie bisher per Safari-Link, die App erbt alles.
- **Die App ist die Verpackung**, nicht die Grafik-Engine: offline, kein Cache-Ärger, Vollbild ohne
  Safari-Leisten, und über eine kleine native Brücke Temperatur- und Speicherwarnungen (Phase 6).
- **Kein nativer Neubau** (Unity/Metal): hieße, Flugphysik, Missionen, KI und rund 180 Testdateien neu zu schreiben.
  Für den hier angestrebten Stil reicht WebGL 2 auf dem M1 aus.
- **Kein Engine-Wechsel jetzt** (three.js r128 → aktuell bzw. WebGPU): das Spiel ist ohne Build-Werkzeuge
  gebaut und hängt mit eigenen Shader-Eingriffen an r128. Erst prüfen, wenn eine Technik es wirklich verlangt.

**Zielgerät.** Das iPad Pro M1 hat eine Grafikleistung auf Laptop-Niveau, 8 oder 16 GB Speicher und ein
120-Hz-Display. Das Spiel nutzt davon wenig: der Rhein rendert mit 56 % der möglichen Pixel, ohne Schatten.
Die Stufe **High wird für den M1 ausgelegt**; Medium/Low halten das Spiel auf älteren iPads lauffähig.

**Zwei Hauptrisiken bleiben auch auf dem M1:** Wärme (kein Lüfter, Drosselung nach Minuten Dauerlast) und der
einzelne JavaScript-Thread. Deshalb gilt als Ziel nicht „schafft 60 FPS", sondern „schafft 60 FPS mit Reserve".

---

## 3. Budgets (Entwurfsziele für High auf dem M1, 60 Bilder/s)

Das sind Zielwerte für die Entwicklung. Ob sie auf dem Gerät halten, zeigt erst die Diagnose-Einblendung (Phase 0).

| Größe | Budget | heute (Rhein) |
|---|---|---|
| Bildzeit gesamt | 16,6 ms, davon JavaScript ≤ 7 ms, GPU ≤ 10 ms | auf dem iPad nie gemessen |
| Dreiecke pro Bild (inkl. Schattenpass) | ≤ 2,5 Mio. | 4,7–5,3 Mio. |
| Draw-Calls | ≤ 800 | 470–580 |
| Texturspeicher | ≤ 350 MB unkomprimiert | 104 MB |
| Durchsichtige Großflächen übereinander | ≤ 3 Lagen | nicht gemessen |
| Ladezeit in der App | ≤ 20 s | nicht gemessen |

Ein Browsertest soll diese Zählwerte künftig prüfen (`render-budget-browser.cjs`, Phase 0), damit keine
Sitzung sie unbemerkt sprengt.

---

## 4. Arbeitsregeln (aus den Fehlern dieses Projekts)

1. **Eine Technik pro Build, jede mit Schalter.** Build 11 hat gezeigt, was ein Sammel-Grafikpaket anrichtet.
2. **Software-Chromium ist kein iPad.** Jede neue Shader-Technik braucht die Sichtprüfung des Nutzers am Gerät.
   Bekannte iOS-Fallen: Instanz-/Vertexfarben, `createImageBitmap`, Canvas-Texturen mit Farbflecken.
3. **„Klassisch" bleibt wählbar**, bis der Nutzer die neue Optik freigibt (wie beim Kulissen-Schalter).
4. **Vorher/Nachher-Bild aus derselben Kamera** und Zählwerte (Dreiecke, Draw-Calls, Texturspeicher) zu jedem Build.
5. **Erst Budget freimachen, dann ausgeben.** Jede Aufrüstung nennt, woher ihr Budget kommt.
6. **Texturen nie größer als der Bildschirm sie zeigen kann** (Maßstab: P-47-Messung in Abschnitt 6).

---

## 5. Phasen

Reihenfolge nach „sichtbarer Gewinn pro Risiko". Aufwand in Builds, nicht in Tagen.

### Phase 0 – Messen können (1 Build)
- **Diagnose-Einblendung:** im Rhein seit Build 272 (`main`) vorhanden – Bilder/s, schlechteste 5 %,
  Dreiecke, Draw-Calls, Pixelverhältnis. Noch fehlend: dieselbe Anzeige im Pazifik, Texturspeicher,
  Qualitätsstufe der Regelung, Bildwiederholrate (60 oder 120 Hz).
- **Budget-Test** für CI (Zählwerte aus Abschnitt 3), für „Detailed“ und „Ultra High“.
- Abnahme: der Nutzer liest auf dem M1 Zahlen für Rhein-Start, Tiefflug Remagen, Pazifik-Trägerstart ab.
  Diese Zahlen entscheiden, wie viel Phase 1 wirklich nötig ist und wie weit High gehen darf.

### Phase 1 – Geschenkte Qualität und freies Budget (3–4 Builds, kein Stilwechsel)
| Maßnahme | Wirkung | Risiko |
|---|---|---|
| P-47-Texturen 4096 → 2048 | −192 MB, Datei 9,2 → 4,7 MB, Bild gleich | **erledigt, Build 276** |
| Anisotrope Filterung 8× für Flugzeuge, Gelände, Piste | schärfere Flächen bei flachem Blick | gering |
| Pixelverhältnis 2,0 statt 1,5, wenn das Gerät Reserve hat | 78 % mehr Bildpunkte, sichtbar schärfer | gering, mit Regelung (in Ultra High schon fest 2,0) |
| Bäume in 1-km-Zellen statt 4-km-Kacheln | −60 bis −75 % Baumdreiecke, Bild gleich | mittel (Draw-Calls steigen, geschätzt um 100–250) |
| Baum-Detailstufen: nah voll, 1,5–3 km vereinfacht, weiter als 3 km Flächen | Rhein ≈ 1 Mio. Dreiecke | mittel (Übergänge dürfen nicht „ploppen") |
| Vereinfachte Flugzeuge für geparkte und ferne Maschinen (P-47 hat 89 500 Dreiecke) | −0,2 bis −0,4 Mio. | gering |
| Grafikmenü Auto / Low / Medium / High, Regelung erweitert (Baumweite, Schatten, Auflösung; Ziel 45 statt 38 FPS als Eingriffsschwelle) | Nutzer wählt Obergrenze | gering |

### Phase 2 – Licht und Atmosphäre (4–6 Builds, der größte sichtbare Sprung)
Der Schalter dafür existiert schon: die Stufe **„Ultra High“** (Builds 272–275 auf `main`) hat Himmel,
Wolkenschatten und Luftperspektive (Punkte 2, 3 und 4c unten sind dort in einer ersten Form gebaut). Phase 2
baut deshalb **in Ultra High weiter** statt eine zweite Probeszene anzulegen; „Detailed“ und „Classic“ bleiben
unverändert, bis der Nutzer Ultra auf dem iPad freigibt. Offen in Ultra: Farb-Pipeline (1), Schattenkarte (4a),
gebackene Geländeschatten (4b), Gelände-Normalen (5).

1. **Farb-Pipeline wie im Pazifik:** sRGB-Ausgabe und filmische Tonwertkurve (ACES). Helle Flächen brennen nicht
   mehr aus, Licht addiert sich richtig. Aufwendigster Schritt: alle Rhein-Farben sind für die alte Ausgabe
   abgestimmt und müssen umgerechnet und nachgestellt werden. Danach teilen beide Spiele eine Pipeline.
2. **Echter Himmel:** berechnete Himmelskuppel mit Sonne, Horizontaufhellung, Tageszeit und Wetter; daraus
   Nebelfarbe, Umgebungslicht und Spiegelungen. Ersetzt die einfarbige Fläche.
3. **Luftperspektive:** Dunst nach Entfernung und Höhe, zur Sonne hin wärmer. Gibt dem Rheintal Tiefe.
4. **Schatten:** (a) Schattenkarte um das eigene Flugzeug (wie Pazifik) für Flugzeuge, Flugplatz, nahe Bäume
   und Häuser; (b) Geländeschatten und Hangschattierung einmal beim Laden aus dem Höhenmodell gebacken
   (kostet im Flug nichts); (c) **Wolkenschatten**, die über die Landschaft ziehen – kostet fast nichts und ist
   aus dem Cockpit der stärkste Tiefenreiz.
5. **Gelände-Beleuchtung pro Pixel** aus einer Normalen-Textur des Höhenmodells: ferne, grobe Kacheln behalten
   ihr Relief, Detailwechsel sind im Licht nicht mehr zu sehen.

Budget: Schattenpass ≈ 0,3–0,5 Mio. Dreiecke – kommt aus Phase 1.

### Phase 3 – Oberflächen (3–4 Builds)
- **Boden im Nahbereich:** Detailtexturen (Gras, Acker, Erde), die mit der Entfernung ausblenden; schärfere
  Feld- und Waldgrenzen. Behebt die verwaschenen Flächen am Flugplatz und im Tiefflug.
- **Wasser:** Rhein mit Himmelsspiegelung und Sonnenglitzern passend zum neuen Himmel, dunklere Ufer;
  Pazifik-Wasser an denselben Himmel angeschlossen.
- **Flugzeuge:** Umgebungsspiegelung für alle Typen (bisher nur Me 262 und Bf 109), Glas der Haube,
  Propellerscheibe mit Bewegungsunschärfe.
- **Gebäude:** Fensterlicht in Dämmerung und Nacht.

### Phase 4 – Vegetation und Dichte (3–4 Builds)
- Neue Baumdarstellung für den Nahbereich (Blattflächen mit Silhouette statt glatter Körper), dafür
  **drei- bis viermal so viele Bäume in Flugzeugnähe** bei weniger Dreiecken als heute.
- Wind im Nahbereich, Feldstrukturen und Bodenbewuchs um Flugplatz und Tiefflugstrecken (nur High).
- Abstimmung mit der Sitzung, die die Rhein-Kulisse baut: sie liefert Inhalte, dieser Plan die Budgets.

### Phase 5 – Effekte und Nachbearbeitung (3–4 Builds, nur High)
- **Glühen (Bloom)** für Sonne, Leuchtspur, Mündungsfeuer, Feuer und Explosionen; dezente Farbabstimmung je
  Schauplatz und Tageszeit. Ein zusätzlicher Bilddurchlauf in halber Auflösung.
- Rauch und Wolken ohne harte Schnittkanten am Gelände, beleuchteter Rauch, bessere Explosionen,
  Kondensstreifen in der Höhe, Hitzeflimmern hinter der Me 262.
- Wolken mit Sonnen- und Schattenseite.
- Bewusst **nicht** geplant: Umgebungsverdeckung (SSAO), Tiefenunschärfe, echte Volumenwolken – hohe Kosten
  pro Bildpunkt, auf dem iPad schlechtes Verhältnis von Aufwand zu Wirkung.

### Phase 6 – App (2–3 Builds, parallel möglich)
- Native Brücke: Gerätetemperatur-Stufe, Speicherwarnung, Speichergröße → das Spiel regelt vor dem Drosseln
  herunter und wählt die Startstufe passend zum Gerät.
- Prüfen, ob die App 120 Bilder/s darstellen kann (Safari liefert standardmäßig 60). Nicht zugesagt.
- Komprimierte Texturen (Basis/ASTC): gleiche Schärfe bei etwa einem Achtel des Speichers; Voraussetzung für
  4096er-Flugzeugtexturen in High. Die unverkleinerte P-47 liegt dafür im Quellordner.

---

## 6. Grafikstufen (Entwurf)

| Stellschraube | Low | Medium | High (M1) |
|---|---|---|---|
| Pixelverhältnis | 1,0 | 1,5 | 2,0 |
| Kantenglättung | aus | an | an |
| Schatten | Fleck unter dem Flugzeug | 1024 px, 120 m | 2048 px weich, 250 m, Wolkenschatten |
| Bäume voll / vereinfacht / Fläche bis | 0,8 / 2,5 / 4 km | 1,2 / 4 / 6 km | 1,5 / 5 / 7 km und dichter |
| Flugzeugtexturen | 1024 | 2048 | 2048, 8× anisotrop |
| Himmel, Tonwertkurve, Luftperspektive | ja | ja | ja |
| Bodendetail im Nahbereich | aus | an | an |
| Glühen und Farbabstimmung | aus | aus | an |
| Rhein-Kulisse | Classic | Detailed | Ultra High |

**Auto** ist der Standard: startet auf Medium, hebt nach 15 s mit Reserve an, senkt bei Bildzeit über 22 ms,
später zusätzlich bei Wärmewarnung aus der App. Die gewählte Stufe ist die Obergrenze.

**Maßstab für Texturgrößen (gemessen, Build 276):** P-47 auf dem größten iPad bei Pixelverhältnis 2. Gegen 4096 px
weicht 2048 px in keiner Spielkamera sichtbar ab (größte Abweichung 2–7 von 255 Stufen, kein Bildpunkt über 8);
1024 px bleibt ohne anisotrope Filterung ebenfalls unauffällig (0,6 % der Bildpunkte über 4 Stufen), mit 8×
anisotroper Filterung aber nicht mehr (bis 5,9 %). Erst eine Nahaufnahme aus 8 m, die das Spiel nicht hat, zeigt
bei 2048 px Unterschiede (4,8 %).

---

## 7. Was realistisch herauskommt

- Nach Phase 1: gleiches Bild, schärfer, weniger Last – Grundlage für alles Weitere.
- Nach Phase 2: der Rhein sieht nicht mehr „flach" aus – Schatten, Himmel, Dunst, Tiefe. Das ist der Schritt,
  den man auf den ersten Blick sieht.
- Nach Phase 3–5: Niveau eines gut gemachten Mobil-Flugspiels mittlerer bis guter Grafik.
- Nicht erreichbar mit diesem Unterbau: die Detailfülle großer nativer PC-/Konsolen-Flugsimulatoren.

## 8. Offen / nicht gemessen
- **Stand Build 277:** Alles aus Abschnitt 0 ist nur in Chromium/SwiftShader (Software-GPU) geprüft. Auf dem
  M1 noch nicht gesehen: wie Schatten, Glühen, junge Bäume und Gras aussehen und was sie kosten; ob Auto auf
  dem iPad zuverlässig auf High steigt; ob die Temperaturmeldung der App ankommt (`GraphicsHealth.swift`
  ist nur im Mac-Build der CI kompiliert, nicht auf dem Gerät gelaufen).
- `terrain.updateLOD` bis 45 ms in einzelnen Frames beim Kachelwechsel (Basis und Build 277 gleich) – der
  zweite Kandidat für kurze Hänger; nicht angefasst.
- Bildzeiten, Wärmeverhalten und Speichergrenze auf dem iPad Pro M1 (Phase 0 und 6).
- Ob auf dem M1 die Dreiecke oder die Bildpunkte zuerst begrenzen.
- Kosten der Schatten und des Glühens auf dem Gerät (Probeszene).
- 120 Hz in Safari und in der App.
