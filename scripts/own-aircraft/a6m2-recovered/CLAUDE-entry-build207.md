**25.10.2026, Build 207: eigene A6M2 Zero (V-103, Tainan Kokutai, Lae, Juli 1942) im Pazifikspiel.**
Nutzer: „Jetzt baust du bitte eine zero für das spiel. Anhand der original pläne, kein raten, massstabsgerecht. Lackierung überlasse ich dir.
Details bei der lackierung, nieten, gebrauchsspuren, russ, etc…"; nach der ersten Fassung: „ganz ok, aber nicht wirklich ähnlich wie das
Original. Außerdem viel zu wenig Details … kein Maßstab getreuer Nachbau der Zero". Referenz ist das vom Nutzer gelieferte PDF „Profile
Publications Aircraft No. 129 – The Mitsubishi A6M2 Zero-Sen" (16 gescannte Seiten, SHA256 9c3991af…0847): S. 2 Fünfseitenansicht der
V-103 (Sakai), S. 14 Datentabelle (A6M2 Model 21: 12,0 m / 9,06 m / 3,05 m, 22,44 m², 518 l + 330 l, Sakae 12, 288 kt, 2×7,7 + 2×20 mm).
**Die Zeichnung ist © Profile Publications 1966 / P. Endsleigh Castle und NICHT frei lizenziert:** kein Pixel davon liegt im Repo (die
Zuschnitte entstehen außerhalb), nur Zahlen (`shape.json`) und die nachgezeichneten Vektor-Mittellinien ihrer Fugen/Luken (`lines.json`) plus
der PDF-Hash. Ob Vermessen + Nachzeichnen der Linienlage eine Bearbeitung ist, ist offen (Register-Status `own-build-reference-review-open`).
- Werkzeuge: `prepare-a6m2-reference.py` (Ansichten ausschneiden, Ziel außerhalb des Repos, prüft den PDF-Hash), `measure-a6m2.mjs`
  (→ `shape.json`, schreibt außerdem die Gate-Referenzen neben die Zuschnitte), `trace-a6m2-lines.py` (dünne dunkle Neutral-Striche →
  Zhang-Suen-Skelett → Polylinien in Metern → `lines.json`; reproduzierbar, Parameter im Kopf von `strokes()`), `linefield.cjs`
  (Abstandsfeld für Linien), `build-own-a6m2.cjs` (→ `assets/aircraft/a6m2-own.glb`: 71 012 Dreiecke, 4,86 MB, 34 Meshes, 16 Materialien,
  3 Bilder à 2048², Rig-Vertrag v1, Khronos 0/0). `--release` verlangt `--ref <Zuschnitte>` und das bestandene Silhouetten-Gate
  (rest Seite/Draufsicht/Front IoU 0,996/0,993/0,963, P95 2,8/3,1/4,9 cm; Fahrwerk unten Seite IoU 0,972, P95 0,76 %). Gate-Überlagerungen
  enthalten die Silhouette der Zeichnung: sie landen in `build/`, nie in `assets/`. Alle nicht gemessenen Werte stehen als `assumed` in den GLB-Extras.
- **Warum die erste Fassung „nicht ähnlich" war (1:1-Überlagerung Zeichnung/Modell, nicht geraten):** Die Umrisse stimmten (IoU > 0,99), es
  fehlte Aussehen und Detail: leere weiße Haube (das Deck schien durch das Glas), Kuppel statt Gewächshaus-Verstrebung, keine Fugenlage,
  fleckiges Abplatzen in Weiß, zu helle Farbe, schwarze Blätter, Radschächte nicht dort, wo sie gezeichnet sind.
- Zweite Runde: (1) **Fugen aus der Zeichnung**: Rumpf/Flügel/Leitwerk malen die nachgezeichneten Linien als 8-mm-Nut (Normalmap) mit
  Nietenreihen (28 mm Teilung) neben jeder Linie > 0,4 m; die alten erfundenen Fugen-/Rippenreihen sind entfernt. Der Tracer findet die
  deutlichen Striche, nicht jede schwache Fuge (ein Ridge-Filter mit Hysterese war schlechter und wurde verworfen). (2) Haube: 1,9× breite
  Sillschiene, dickere Rahmen in hellem Grüngrau, dunkleres Glas, dunkler Cockpitboden, Sitzlehne, Panzerplatte, Kopfstütze, Knüppel, Seitenpulte,
  Instrumentenbrett, Visier — alles auf dem Deck (die Haut unter der Haube ist geschlossen; Pilot/Kopf lagen vorher über dem Haubendach und
  stachen aus der Silhouette: Gate Seite 0,994 → 0,996 nach der Korrektur). (3) Motorhaube: die 12-cm-Stationen der Nase werden mit monotoner
  kubischer Interpolation verfeinert (vorher Bänder), glänzendes blauschwarzes Material über eine neue Metall/Rauigkeits-Textur (Paint.bake
  liefert jetzt optional `rough`/`metal`, `Paint.roughnessPng`). (4) Propeller: 3 helle Blätter mit gemessenen Spitzenstreifen rot-gelb-rot
  (eigene Materialien, Blatt bei den Spitzen alle 2 cm unterteilt). (5) Radschächte/Beinschlitz an den gemessenen Maßen (x 0,062…0,673,
  z 2,098…2,793; Schlitz bis x 1,845, 0,32 m) mit Radunterseite gemalt; die Stauposition wird nach dem Abstand zur Schachtmitte
  gewählt (das Rad liegt dennoch 0,37 m weiter hinten im Flügel, weil dort die Haut dick genug ist: `assumed`). (6) Farbe etwas dunkler und
  kühler (Zeichnung wirkt im Spielgarten heller), Abplatzer nur klein an Fugen/Unterkanten, Stoffruder-Farbe angeglichen.
- Fahrwerk: ein festes Gelenk, Bein spannweitig einwärts, Rad flach; Builder bricht ab, wenn eingefahren irgendein Vertex durch die Haut
  sticht (6 mm unten / 14 mm oben Luft); Test schießt Strahlen durch die echte Haut: 4 von 4 Teilen zu 100 % innen. Hauben-Schiebemechanik
  fehlt im Vertrag (nur Rotation): die Haube ist fest (`assumed`).
- Spiel (`torpedo-carrier.html`): `aircraft-contract.js` wird geladen; `loadZeroModel` nutzt das Modell wie geliefert (kein Zentrieren/Skalieren/
  Suchen/Schneiden, `DropTank` wird aus der Vorlage entfernt: die Zero fliegt sauber; wahre Spannweite 11,96 m statt der alten 11 m).
  `zeroFrame()` findet den Artikulations-Rahmen (Kind `zero`); Spieler: Rotor `prop` (Achse z, `rotorStep`), Fahrwerk/Klappen über
  `AircraftArticulation.pose`; die alte Heuristik (flachste Scheibe als Rotor, `zeroGear`) bleibt nur für den prozeduralen Ersatz. KI-Zeros
  und japanische Bomber-Raider drehen die echten Blätter (`rotorStep(dt,PROP_STEP)`, vorher 1,6 rad/Bild = Aliasing) mit eingefahrenem Fahrwerk,
  keine Ersatzscheibe. Mündungen der 20-mm-Kanonen kommen per Name (`MuzzleCannonLeft/Right`) aus dem Modell; die 7,7-mm-Hauben-MGs werden wie bisher
  nicht simuliert. Texturgrenze `PacificAssets.configure('assets/aircraft/a6m2-own.glb',…)`: Desktop 2048, Touch 1024 (3 Bilder ≈ 17 MB GPU).
  Flugleistung, Munition, Tank, Schaden unverändert (die Tabelle ist in den GLB-Extras `specification` festgehalten, nicht im Flugmodell).
  `zero.glb` wird nicht mehr geladen und ist nicht mehr im App-Payload (bleibt als Datei im Repo für `carrier-prop.cjs` und das Classic-Spiel).
  Bei der Gelegenheit gefunden: der alte Zero-Probe-Wert `shipWingProbes.zero` (Spannweite 11) auf 12/-.2/-1.4 angepasst.
- **Kosten:** 71 012 Dreiecke je Zero statt 821 beim alten Modell. Spieler + bis zu vier KI-Zeros/Raider ≈ 350 000 Dreiecke, vergleichbar mit SBD und
  Avenger-Rottenfliegern; auf dem iPad NICHT gemessen. Falls es dort zu schwer ist: Ringzahl des Rumpfs (`ring:48`) und `step` im Builder senken, nicht
  das Modell ausdünnen.
Tests: neu `okinawa/tests/own-a6m2-pipeline.cjs` (Builder, Vertrag, Khronos 0/0, Spannweite/Länge gegen die Tabelle, Fahrwerk in der Haut per Strahl,
`--release` ohne Referenz/aus unvermessener Tabelle verweigert, echter Spiel-Loader auf der echten GLB, vier benannte Mündungen) und
`okinawa/tests/own-a6m2-browser.cjs` (echtes Pazifikspiel: Vertrags-Rig, Blätter drehen, eingefahrene Räder 100 % in der Haut, Geschosse an den
Kanonenmündungen, KI-Zeros mit echten Blättern; Bilder `test-visuals/build207-zero-*.png`). Angepasst (nicht abgeschwächt): carrier-fire (Zero mit
Vertrags-Mündungen), carrier-prop (`zeroFrame` im Ausschnitt), carrier-start-browser/browser-smoke/aircraft-systems-browser (Fahrwerk über `GearLeft/GearRight`,
Rahmen über `zeroFrame`), app-payload (Zero in, `zero.glb` aus dem Payload). `ship-contact-browser`: Spalttoleranz 2 → 4 mm (die großen Reifen der Zero
erreichen −2,7 mm im ersten Kontaktbild bei 20 FPS; Soll 20 mm Luft, Durchdringung wäre −20 mm; Ursache nur vermutet: leicht gewölbtes IJN-Deck).
`aircraft-systems-browser`: die Klappen-Dreieckszählung suchte die Fläche nur im ersten Kind und brach beim unabhängigen P-47 ab (vorbestehend).
Build 207 an Board, beiden Spielen, Menü-CSS, App-Payload (322 Dateien, 36 Modelle) und Xcode; Register neu. Kein iPad-Test.
**Nicht von dieser Arbeit:** main (Build 206) ist rot (CI „terrain-system regression tests", Lauf 40203486168); lokal rote Rhein-Hälften in
`combat-sorties-browser` (P-47 Haut-Schaden) und `carrier-recovery-browser` (Landegeschwindigkeits-Text) — die Pazifik-Hälften beider Tests sind grün.

