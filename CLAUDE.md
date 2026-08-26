# Torpedo-Bomber — Übergabe an Claude Code

**Lies diese Datei komplett, bevor du irgendetwas änderst.** Sie beschreibt ein Projekt mit
langer Vorgeschichte voller Sackgassen — die meisten davon selbst gebaut, in einem Chat ohne
Git-Zugriff, wo jede „Lösung" ungetestet ausgeliefert wurde. Der Abschnitt „Gelernte Lektionen"
ist keine Höflichkeitsfloskel, sondern verhindert, dass du dieselben Fehler wiederholst.

Stand bei Übergabe: **Torpedo Squadron BUILD 102 · Thunderbolt Squadron EU BUILD 24**
Repo: `oliverkurzemann-Goku/Torpedo-Bomber`, ausgeliefert über GitHub Pages.
Alle Angaben unten sind aus dem tatsächlichen Code verifiziert, nicht aus dem Gedächtnis.

---

## 1. Was das Projekt ist

Drei zusammengehörige, eigenständige HTML-Dateien im selben Repo. Three.js r128 über CDN,
keine Build-Werkzeuge, kein npm/webpack — alles läuft direkt im Browser. Zielgerät ist
iPad/iPhone Safari.

| Datei | Was |
|---|---|
| `index.html` | Startseite, Auswahl zwischen beiden Spielen |
| `torpedo-carrier.html` | **Teil 1** — Pazifik, Trägerbetrieb (BUILD 99) |
| `thunderbolt-europe.html` | **Teil 2** — Europa, Bodenangriff (EU BUILD 23) |
| `model-check.html` | Kalibrier-Werkzeug für neue Flugzeugmodelle (Ausrichtung, Maßstab) |

Beide Spiele haben getrennte Speicherstände (`localStorage`-Präfixe `tc_*` bzw. `eu_*`).

Der Nutzer (Oliver) kommuniziert auf Deutsch, testet ausschließlich auf einem echten iPad,
und hat **keinen** Entwickler-Hintergrund — er kann keinen Code lesen und keine Fehler
selbst diagnostizieren. Beschreibungen von ihm sind Beobachtungen aus dem Spiel, keine
technischen Diagnosen. Nimm sie ernst, aber leite die Ursache selbst her.

---

## 2. Deploy — die häufigste Fehlerquelle

**GitHub verwandelt beim Hochladen manchmal Unterstriche in Leerzeichen.** Das hat dieses
Projekt mehrfach lahmgelegt. Der Modell-Loader in `thunderbolt-europe.html` probiert deshalb
pro Flugzeug mehrere Schreibweisen durch (`MODEL_URL`-Objekt).

**Bei jeder Änderung:**
1. Build-Nummer im Code hochzählen (`BUILD N` bzw. `EU BUILD N`, an mehreren Stellen im
   selben File — alle Vorkommen ersetzen).
2. GitHub Pages braucht nach dem Push ein bis zwei Minuten. iPad-Safari hält alte Versionen
   hartnäckig im Cache — der Nutzer muss die Seite mit `?v=N` aufrufen oder hart neu laden.
3. Die Build-Nummer steht unten im Bild im Spiel. Wenn der Nutzer eine alte Nummer meldet,
   ist es fast immer der Cache, nicht der Code.

### Dateien im Repo (verifiziert)
Flugzeuge Teil 1: `grumman tbm avenger.glb`, `zero.glb`, `sbd dauntless.glb`
Schiffe: `uss_midway.glb`, `ijn carrier.glb`, `ijn cruiser.glb`, `samidare_destroyer.glb`,
`merchant_ship.glb`
Cockpits Teil 1: `cockpit.png`, `cockpit zero.png`, `cockpit sbd.png`
Flugzeuge Teil 2: `p47new.glb`, `bf109new.glb`, `fw190.glb`, `b17.glb`, `b24.glb`
Cockpits Teil 2: `cockpit_p47.png`, `cockpit_bf109.png`

---

## 3. Architektur-Fakten, die man nicht raten kann

### 3.1 KHR_mesh_quantization — betrifft fast jedes Modell-Problem
Alle Flugzeug-GLBs sind quantisiert: Positionen liegen als `Int16Array` mit
`normalized=true`, ein Node-Scale-Faktor rechnet sie beim Rendern zurück in Meter.
Three.js macht das beim Rendern automatisch, und `Box3.setFromObject()` auch — aber
**`fromBufferAttribute()` beim manuellen Auslesen liefert den Rohwert**, nicht den Meterwert.

Das wurde erst nach stundenlangem Suchen gefunden, indem das echte Modell mit dem echten
`GLTFLoader` in einer Node-Umgebung geladen und der wortwörtlich aus dem Spiel extrahierte
Code darauf laufen gelassen wurde (siehe Abschnitt 6). Ein Handauslesen ergab 373.481 m
Spannweite statt 12,62 m. **Jede Funktion, die Vertex-Positionen manuell liest, muss
`readVert()` benutzen** (in beiden Spielen vorhanden — de-normalisiert korrekt).

**Geometrie dieser Modelle NIEMALS neu aufbauen** (neue `BufferGeometry` mit kopierten
Werten). Das wurde dreimal versucht:
- Rohwerte in ein `Float32BufferAttribute` kopiert → Normalisierung verloren, Modell wurde
  hunderte Kilometer groß.
- Einzelne Vertices auf einen Punkt kollabiert → Dreiecke, die nur teilweise in der
  Kollapszone lagen, wurden zu langen Zipfeln verzogen (sichtbar als helle Dreiecksflächen
  am Flügel).
- Ganze Dreiecke kollabiert (nur wenn alle 3 Ecken betroffen) → bei indizierter Geometrie
  teilen sich Nachbardreiecke Eckpunkte, Folgeschäden blieben.

**Aktueller Ansatz (Stand BUILD 99 / EU BUILD 23):** Geometrie wird nicht mehr verändert.
Der Propeller ist in allen Modellen mit dem Rumpf-Mesh verschweißt (gemessen: P-47 20 % eines
Meshes, Bf 109 11 %, Dauntless 52 % — es gibt kein trennbares Objekt). Stattdessen wird eine
**deckende, undurchsichtige Scheibe** vor die verschweißten Blätter gesetzt
(`fitPropeller()` in Teil 1, entsprechender Block in `rigModel()` in Teil 2).

### 3.2 Geometrie-Filter: immer über Form, nie über Namen
Three.js verändert Knotennamen beim Laden (`Cube.001_3` → `Cube001_3`), und jeder
Modellbauer benennt anders. Fahrwerk, Propeller etc. werden über Bounding-Box-Maße im
**Weltkoordinatensystem** gefunden (`applyMatrix4(o.matrixWorld)`), nie über
`geometry.boundingBox` roh (das ist mesh-lokal, ignoriert die eigene Transformation des
Teils — genau das hat den Avenger-Fahrwerksfilter zweimal scheitern lassen, siehe 4.3).

### 3.3 Propeller-Platzierung: an das Modell hängen, nicht an den Parent
Wird eine Propeller-Ersatzgruppe an einen anderen Knoten gehängt als den, in dessen
Koordinaten die Position gemessen wurde, muss die Transformation manuell umgerechnet werden
— und genau das ging beim Rottenflieger-Modell schief (das Modell ist um `Math.PI` gedreht;
die Handumrechnung wusste nichts davon → Propeller landete an der Flügelspitze, 90° verdreht).
**Immer: `model.add(propellerGruppe)`, nie `parent.add(...)` mit Koordinatenumrechnung.**

---

## 4. OFFENE FEHLER — Stand nach BUILD 99 / EU BUILD 23

Diese vier Punkte hat der Nutzer nach dem letzten Deploy gemeldet. **Keiner davon ist
untersucht oder bestätigt behoben.** Nicht annehmen, dass frühere Kommentare im Code
("PROBLEM GELÖST") noch stimmen — genau diese Annahme hat das Projekt wiederholt zurückgeworfen.

### 4.1 Dauntless: alter starrer Propeller sichtbar zusätzlich zur neuen Scheibe — BEHOBEN in BUILD 100, am echten Modell nachgewiesen

**Die vermutete Ursache im vorigen Stand (Radius-Deckel `Math.min(S.x*0.34,...)`, falsche
`disc.z`) war falsch.** Mit dem Prüfstand aus Abschnitt 6 (echter `GLTFLoader` r128, echtes
`sbd dauntless.glb`, `findPropDisc`/`fitPropeller` wortwörtlich aus der Datei extrahiert)
zeigte sich: Bei **an der Herkunft ruhendem, unrotiertem** Modell lieferte `findPropDisc`
plausible Werte (Radius ≈1,66–1,80 m, Zentrum nahe der Mittellinie). Das ist aber nicht die
Situation im Spiel.

**Tatsächliche Ursache — zwei Bugs, beide verifiziert:**

1. **Koordinatensystem-Vermischung (der eigentliche Auslöser, genau Lektion 2 aus Abschnitt 5).**
   `findPropDisc()` berechnete die „Schnittebene vor der Nase" (`front`/`cut`) aus
   `whole = new THREE.Box3().setFromObject(root)` — das liefert laut Three.js immer
   **Weltkoordinaten**. Die anschließende Vertex-Schleife rechnet jeden Punkt aber über
   `root.worldToLocal(v)` in **root-lokale** Koordinaten um. Sobald das Flugzeug (`planeGroup`)
   irgendwo abseits vom Weltursprung mit einer Rotation ≠ 0 steht — also praktisch immer, sobald
   es fliegt (`planeGroup.position.copy(P.pos)` und `planeGroup.quaternion.setFromRotationMatrix(m)`
   in `animate()`) — lag `cut` in einem völlig anderen Zahlenbereich als `v.z`. Am Prüfstand mit
   einer realistischen Flugpose (Position abseits vom Ursprung, volle 3-Achsen-Rotation)
   nachgestellt: `findPropDisc` fand **unter 40 Punkte und lieferte `null`** — bei identischem
   Modell am Ursprung ohne Rotation funktionierte es. `fitPropeller()` fällt bei `null` auf
   `rigOwnProp()` zurück; diese Funktion sucht aber nach einem **eigenständigen Mesh-Objekt**
   für den Propeller. Da der Propeller laut 3.1 in die Rumpf-Geometrie eingeschweißt ist (bei
   der Dauntless 52 % eines Meshes), findet `rigOwnProp` dort nur zwei irrelevante kleine Teile
   (siehe Kommentar im alten Code: „the nose holds only two small parts, 1.27 m / 1.11 m") und
   dreht diese — während die echten, eingeschweißten Propellerblätter nie abgedeckt werden und
   komplett sichtbar bleiben. Das ist exakt das gemeldete Bild.
2. **Sampling-Lücke (zweiter, kleinerer Effekt, nur relevant sobald Bug 1 behoben ist).**
   `findPropDisc` hat vor der z-Filterung mit `st=Math.floor(pos.count/9000)` über das
   **gesamte** Mesh gestridet, nicht nur über den Nasenbereich. Am Dauntless-Mesh (36899
   Vertices) hat dieses Stride-Sampling den tatsächlich breitesten Blattspitzen-Vertex
   verpasst: erschöpfende Messung ergab Y-Ausdehnung 1,78 m, das Sampling fand nur 1,35 m —
   das verschob das berechnete Scheiben-Zentrum um 0,22 m und ließ einen Ring der echten
   Blätter am Scheibenrand herausragen.

**Fix (BUILD 100):** `findPropDisc()` baut `whole` jetzt konsequent in **root-lokalen**
Koordinaten (`invRoot = root.matrixWorld.invert()`, jede Mesh-Box damit transformiert statt mit
`o.matrixWorld` allein) — dieselbe Zahlenbasis wie die Vertex-Schleife. Zusätzlich ein günstiger
Bounding-Box-Vorfilter pro Mesh (verwirft Meshes, die den Nasenbereich gar nicht erreichen
können), und für die verbleibenden Meshes **kein Stride mehr**, sondern vollständiges Abtasten
— günstig, weil nur noch wenige Meshes überhaupt in Frage kommen.

**Nachgewiesen am echten Modell, exakt aus der Datei extrahiert** (`torpedo-carrier.html`,
Funktionen `readVert`, `findPropDisc`, `fitPropeller` per Klammerzählung extrahiert, gegen
echtes `sbd dauntless.glb` mit echtem `GLTFLoader` r128 ausgeführt, Szene mit `planeGroup` an
einer realistischen Flugposition/-rotation aufgebaut — nicht am Ursprung, nicht ungetestet):
- Vorher: `fitPropeller(playerSBD, planeGroup, -1)` → `null` in Flugpose.
- Nachher: liefert eine Scheibe mit Radius 1,796 m, zentriert bei cx=-0,0104/cy=0,560
  (root-lokal), unabhängig von Position/Rotation des `planeGroup` — identisches Ergebnis am
  Ursprung und in Flugpose.

**Regressionscheck Avenger (nicht Teil dieses Bugs, aber selbe Funktion, selbe Datei):** Der
gleiche Koordinatenfehler betrifft auch die Avenger-Aufrufe (`spawnWingman`, Raider-Spawn), war
dort aber unauffällig, weil `rigOwnProp` als Fallback offenbar ein brauchbares Ergebnis liefert
und der Nutzer dort nichts gemeldet hat. Mit behobenem Koordinatenfehler würde `findPropDisc`
für den Avenger **auch** erfolgreich sein — aber mit einem falschen Ergebnis: der flache 7-%-
Nasenschnitt trifft auf die breitere Avenger-Cowling/Lufthutze statt auf den Propeller (gemessen
cx=-1,62 m bei 12,45 m Spannweite — weit von der Mittellinie, keine Propellerwelle sitzt dort).
Deshalb zusätzlich in `fitPropeller()`: Scheiben-Zentrum wird verworfen (→ `null`, Fallback auf
`rigOwnProp` wie bisher), wenn `|disc.cx| > S.x*0.12` — dieselbe Mittellinien-Heuristik, die
`rigOwnProp` für einzelne Teile schon verwendet. Damit bleibt das Avenger-Verhalten exakt wie
vor diesem Fix (am Prüfstand mit derselben Flugpose bestätigt: liefert weiterhin `null`).

**Offen / nicht in diesem Fix:** Die zugrunde liegende Nasenschnitt-Heuristik (feste 7 % Tiefe)
könnte für die Avenger-Cowling grundsätzlich verbessert werden, damit sie dort ebenfalls die
Scheiben-Methode statt `rigOwnProp` nutzen kann — das ist aber ein separates, unbeauftragtes
Thema und wurde nicht angefasst (Avenger hat aktuell keine gemeldeten Propellerprobleme).

#### Nachtrag BUILD 102, aus echtem Spiel-Feedback nach BUILD 101: starre Blätter immer noch teilweise sichtbar — BEHOBEN, Ursache war eine dritte, andere Sache

Der Nutzer hat BUILD 101 tatsächlich gespielt und gemeldet: Avenger sieht gut aus, bei der
Dauntless ist aber weiterhin zusätzlich zum Propeller noch der starre Original-Propeller zu
sehen. Mit Screenshots (nicht nur Zahlen) am echten Prüfstand nachgestellt: aus einer Kamera,
die exakt entlang der Propellerachse blickt, deckt die Scheibe die Blätter tatsächlich
**vollständig** ab (0 Blatt-Vertices außerhalb des Scheibenradius gemessen). Aus jedem anderen
Blickwinkel — und eine Verfolgungskamera schaut so gut wie nie exakt entlang dieser Achse —
ragen Blattspitzen sichtbar heraus.

**Ursache:** Die Scheibe war eine `CircleGeometry` — praktisch papierdünn. Die echten,
eingeschweißten Propellerblätter sind das nicht: am Dauntless-Modell gemessen erstreckt sich
das Blattmaterial über 0,587 m entlang der Propellerachse (Blattwurzel liegt deutlich tiefer im
Rumpf als die Blattspitze). Eine papierdünne Scheibe deckt eine Form mit echter Tiefe nur von
exakt vorne ab — von der Seite gesehen ragt die „Rückseite" des Blattmaterials immer heraus.
Exakt dasselbe Muster wie bei 4.2 (Avenger-Fahrwerk): eine flache Kappe reichte dort auch
nicht, erst ein Zylinder mit echter Tiefe.

**Fix (BUILD 102):** Die Scheibe ist jetzt ein flacher **Zylinder** (`CylinderGeometry`,
Tiefe ≈max(R·0,34, 0,6 m)) statt einer `CircleGeometry`. Dekor (Streifen, Rand, Spinner) sitzt
jetzt auf der äußeren (Nutzer-zugewandten) Stirnfläche des Zylinders statt nahe der Mitte —
sonst wäre es im jetzt massiven Zylinder vergraben und unsichtbar gewesen. Der alte
Vorwärts-Versatz (`disc.z ± dia*0.05`) entfällt, die Scheibe sitzt jetzt zentriert auf dem
gemessenen Mittelwert der Blattgeometrie — der Versatz war nur nötig, um die fehlende Tiefe
einer papierdünnen Scheibe zu kompensieren.

**Nachgewiesen:** Kamera exakt entlang der Propellerachse (Blätter isoliert freigestellt,
Rest des Flugzeugs ausgeblendet) zeigt keine sichtbaren Blattreste mehr außerhalb der Scheibe,
weder bei der Spieler-SBD noch beim SBD-Begleitflugzeug. Eine 3/4-Perspektive (typische
Verfolgungskamera-Ansicht) zeigt ebenfalls keine herausragenden Blätter mehr.

**Offen — zwei vom Nutzer gemeldete Punkte, nicht reproduziert:**
- „Bei den Dauntless-Begleitflugzeugen ist der Propeller außen links am Flügel." Am Prüfstand
  mit exakt demselben Code-Pfad wie `spawnWingman()` (SBD-Zweig, keine Rotation,
  `fitPropeller(inner, mesh, +1)`) nachgestellt: die Scheibe landet zentriert auf der
  Nase (cx≈0,010, gut innerhalb der Mittellinien-Toleranz), nicht am Flügel. Es gibt bereits
  einen Lade-Timing-Schutz (`wingmenPendingT`, wartet bis zu 6 s auf `sbdTemplate`, siehe
  `animate()`), der einen früheren, ähnlichen Fehler (Avenger-Ersatz während SBD noch lädt)
  bereits verhindert — beide Begleitflugzeuge spawnen zudem im selben Aufruf mit demselben
  Template-Status, eine Asymmetrie zwischen „linkem" und „rechtem" Flugzeug ist aus dem Code
  heraus nicht ersichtlich. **Nicht behoben, weil nicht reproduzierbar** — Screenshot vom
  Nutzer nötig, um weiterzukommen.
- „Größe der Propeller" — gemessen (siehe Tabelle unten): Dauntless-Scheibe liegt 10–20 % über
  dem echten Vorbild (3,28 m real vs. 3,61–3,93 m gemessen, je nach Pfad). Das ist keine
  Regel-, sondern eine Modell-Eigenschaft — das gemessene Blattmaterial selbst reicht so weit
  hinaus, die Scheibe misst nur nach, was da ist. Nicht korrigiert, da unklar, ob der Nutzer
  einen künstlichen Abschlag (Clamp) auf die reale Größe wünscht oder die Modellgröße
  akzeptiert. Rückfrage nötig.

| Pfad | Datei-Radius gemessen | Durchmesser | Real | Verhältnis |
|---|---|---|---|---|
| SBD Spieler (`playerSBD`, noseSign −1) | 1,965 m | 3,93 m | 3,28 m | 1,20× |
| SBD Begleitflugzeug (`spawnWingman`, noseSign +1) | 1,807 m | 3,61 m | 3,28 m | 1,10× |

Code: `torpedo-carrier.html`, Funktionen `findPropDisc`, `fitPropeller` (Suche im File danach).

### 4.2 Avenger: Fahrwerk fährt bei „Gear Up" nicht ein, weiße Streben bleiben sichtbar — BEHOBEN in BUILD 101, am echten Modell mit Screenshots nachgewiesen

**Keine der beiden im vorigen Stand vermuteten Ursachen (zu große/zu kleine Vereinigung,
veraltete Liste durchs Ladetiming) war die eigentliche.** Mit dem echten
`grumman tbm avenger.glb`, einem echten `GLTFLoader` r128 und einem echten headless
WebGL-Renderer (`gl`-Paket + Xvfb, Screenshots gespeichert und tatsächlich angesehen — nicht
nur Zahlen verglichen) zeigte sich das eigentliche Bild:

1. **`gearMesh` findet korrekt genau EIN Mesh** — ein einzelnes verschmolzenes Mesh, das
   BEIDE Hauptfahrwerksräder UND das Spornrad enthält (per Vertex-Clustering auf diesem
   Mesh bestätigt: exakt 3 räumlich getrennte Cluster, symmetrisch, mit den erwarteten
   Radien ~0,41–0,42 m für die Haupträder und ~0,11–0,13 m fürs Spornrad). Dieses eine
   Mesh korrekt aus- und einzublenden funktioniert bereits und blendet die Räder korrekt
   aus. **Das war nie das Problem.**
2. **Die sichtbar bleibenden „weißen Streben" sind gar keine Räder, sondern die Beinen
   selbst — und die sind in die Rumpf/Flügel-Geometrie eingeschweißt** (Meshes `Object_31`/
   `Object_32`, dieselben riesigen Meshes, die auch den Großteil von Rumpf und Flächen
   bilden — exakt dasselbe Modellierungs-Shortcut wie beim Propeller, siehe 3.1). Ein
   Renderdurchlauf mit jedem Mesh in einer eigenen Farbe zeigte das eindeutig: das
   Rad/Spornrad-Mesh (rot eingefärbt) endet am Radaufhängungspunkt, aber das Bein darüber
   bis zur Fläche (in derselben Farbe wie der Rumpf) ist Teil des großen Rumpf-Meshes.
   Da es kein eigenständiges Bein-Objekt gibt, kann **kein** Filter auf `gearMesh` das je
   erfassen — das war von Anfang an gar nicht lösbar über bessere Mesh-Auswahl.

**Zusätzlich, unabhängig gefunden und ebenfalls behoben:** Die alte `gearMesh`-Klassifizierung
maß `whole` über `Box3.setFromObject(model)` (immer **Weltkoordinaten**) und verglich damit
`o.matrixWorld`-transformierte Boxen (auch Weltkoordinaten, in sich konsistent — anders als
der Propeller-Bug, aber trotzdem noch **abhängig von der aktuellen Fluglage** des Flugzeugs
im Moment des Ladens). Am Prüfstand mit einer gebankten Fluglage nachgestellt: sobald das
Flugzeug gegenüber dem Ursprung gedreht ist, kippt „unten" im Welt-Sinn nicht mehr mit „unten"
am Rumpf zusammen, und die Klassifizierung würde andere (potenziell falsche) Teile finden.
In der Praxis bleibt `P.pitch`/`P.roll` bei Missionsstart auf 0, das 15-MB-Modell lädt aber
asynchron und kann theoretisch erst mitten im Flug fertig werden (die SBD-Ladelogik im
selben File behandelt exakt dasselbe Timing-Problem explizit) — daher als Härtung mit
behoben, nicht weil es hier der Auslöser war.

**Fix (BUILD 101):**
- `gearMesh`-Messung läuft jetzt durchgehend in **modell-lokalen** Koordinaten
  (`invModel = model.matrixWorld.invert()`), unabhängig von Position/Rotation des Flugzeugs.
- Drei kleine Zylinder („Bein-Verkleidungen") werden an den gemessenen Bein-Positionen
  angebracht — links/rechts Hauptfahrwerk und Spornrad — und nur sichtbar geschaltet, wenn
  `gearMesh` unsichtbar ist (also bei „Gear Up"), exakt gegenläufig zum Rad-Mesh. Gleiches
  Prinzip wie die Propellerscheibe: nicht schneiden, abdecken.
- Länge und Radius jedes Zylinders wurden am echten Bein gemessen (Vertex-Scan entlang der
  Bein-Säule, `Object_31`/`Object_32` Vertices um die gemessene Radposition, Radiusprofil
  pro Höhenschicht) und mit Sicherheitsmarge nach unten verlängert, bis Screenshots aus
  mehreren Winkeln (von schräg unten, von hinten, aus der Nähe) **keinen sichtbaren
  Rumpfrest mehr zeigten** — sowohl bei „Gear Up" (Zylinder sichtbar, Bein vollständig
  verdeckt) als auch bei „Gear Down" (Zylinder unsichtbar, Original unverändert).

Code: `torpedo-carrier.html`, Suche nach `gearMesh=[]` (Klassifizierung + Zylinder-Aufbau)
und `gearDoors[i].visible` (Sichtbarkeits-Toggle, gleich neben dem `gearMesh`-Toggle).

**Offen:** Nur am headless-Renderer geprüft (echtes Modell, aber ohne Texturen/Beleuchtung
des echten Spiels) — Bestätigung auf dem echten iPad steht noch aus, genau wie bei 4.1.

### 4.3 P-47: Spornrad hängt nach dem Start ~1 m unter dem Flugzeug — BEHOBEN in EU BUILD 24, mit Messwerten am echten Modell nachgewiesen

**Keine der beiden im vorigen Stand vermuteten Ursachen (`tg` nicht in derselben Gruppe,
Vorzeichenfehler bei der Achse) war es.** Am Prüfstand bestätigt: `tg` landet korrekt in
derselben `gear`-Gruppe, die der Sichtbarkeits-Toggle anspricht (3 Kinder: Haupt-links,
Haupt-rechts, Spornrad — alle zusammen ein-/ausgeblendet). Das Hauptfahrwerk und das Spornrad
verschwinden also tatsächlich gemeinsam. Der Nutzer hat nicht „ein sichtbares Spornrad bei
Gear Up" gemeldet, sondern dass es **falsch positioniert** ist.

**Tatsächliche Ursache, mit dem echten `p47new.glb` gemessen:** `buildGear()` hängt jedes
Bein (beide Hauptfahrwerksbeine UND das Spornrad) von genau **einem globalen Ankerpunkt** ab:
`belly = whole.min.y`, dem tiefsten Punkt des GESAMTEN Flugzeugs. Am echten Modell ist dieser
tiefste Punkt der Bauchlufteinlass/Kühlerschacht nahe dem Triebwerk (x≈−0,03, z≈3,2 — nahe der
Motorhaube, nicht am Heck) — **nicht** die Rumpfunterseite an der Stelle, wo die Beine
tatsächlich hängen sollen. Gemessen: an der Hauptfahrwerks-Position liegt die echte
Rumpfunterseite 0,87 m über diesem globalen Ankerpunkt, am Spornrad 0,80 m — praktisch exakt
das gemeldete „~1 m". Das lange Hauptfahrwerksbein (0,65 m Bein + Rad) überbrückt diese Lücke
weitgehend von selbst, was optisch noch als Bein durchgeht. Das kurze Spornradbein (nur
`legLen*0.42` ≈ 0,27 m) überbrückt sie nicht — zwischen Rumpf und Rad bleibt eine sichtbare
Lücke, die genau als „hängt separat unter dem Flugzeug" auffällt.

**Fix (EU BUILD 24):** Neue Funktion `localFloor(root, x, z, radius)` misst die echte
Rumpfunterseite direkt über JEDER Bein-Position einzeln (Vertex-Scan in einem engen Radius um
die jeweilige x/z-Position), statt sich auf einen einzigen globalen Tiefpunkt zu verlassen.
`buildGear()` verankert jedes Bein jetzt an seiner eigenen lokal gemessenen Rumpfunterseite.

**Nachgewiesen am echten Modell** (`readVert`, `localFloor`, `buildGear`, `rigModel` wortwörtlich
aus der Datei extrahiert, gegen echtes `p47new.glb` mit echtem `GLTFLoader` r128 UND echtem
headless-WebGL-Renderer ausgeführt, Screenshots gespeichert und angesehen — nicht nur Zahlen
verglichen): Hauptfahrwerk sitzt jetzt bündig unter dem Flügel, keine sichtbare Lücke mehr.
Spornrad sitzt jetzt exakt am im Modell vorhandenen Spornradschacht — vorher y=−1,62 (Lücke),
nachher y=−0,69 (bündig, Differenz 0,93 auf der Modellskala).

**Regressionscheck an den anderen 4 Baumustern (dieselbe `buildGear`-Funktion wird geteilt):**
- Bf 109, B‑24: nutzen `rigModel()`s „own gear"-Pfad (eigene, trennbare Fahrwerksteile im
  Modell gefunden) — `buildGear()` läuft dort gar nicht, meine Änderung hat keinen Effekt.
- FW 190: nutzt `buildGear()`, sieht am Prüfstand sauber aus (Räder bündig am Rumpf).
- B‑17: nutzt ebenfalls `buildGear()`. Meine Änderung verbessert die Position messbar (Spornrad
  1,3 Einheiten näher am Rumpf als vorher), **deckt aber einen separaten, unabhängigen Fund
  auf**: Die B‑17 hat laut Screenshot bereits ein eigenes, echtes Fahrwerk/Rad im Modell
  eingebaut, das die „own gear"-Erkennung nicht findet (Schwellenwerte vermutlich auf das
  falsche Maß kalibriert für ein 4-motoriges Flugzeug) — es entsteht ein doppeltes Fahrwerk
  (echtes + synthetisches nebeneinander). Das ist **nicht** Teil dieses Fixes und war schon vor
  dieser Änderung so; nicht angefasst, da unbeauftragt und eigenständig zu untersuchen.

Code: `thunderbolt-europe.html`, Funktionen `localFloor` (neu, direkt nach `readVert`) und
`buildGear` (~Zeile 1235).

### 4.4 B-17: „own gear"-Erkennung findet das eingebaute Fahrwerk nicht (neu entdeckt, nicht behoben)
Nebenbefund beim Prüfen von 4.3: die B-17 (`b17.glb`) hat laut Screenshot bereits ein eigenes,
gut aussehendes Fahrwerk/Rad im Modell — aber `rigModel()`s Erkennung für „eigenes Fahrwerk"
(Zeile ~1192: `bb.max.y<floor && sz.y<S.y*0.5 && sz.x<S.x*0.30`) findet es nicht und baut
zusätzlich das synthetische `buildGear()`-Fahrwerk daneben. Ergebnis: doppeltes Fahrwerk.
Vermutung (nicht geprüft): die Schwellenwerte sind an einjährigen Jägern kalibriert und passen
nicht auf die Proportionen eines 4-motorigen Bombers. Nicht Teil eines gemeldeten Bugs, daher
nicht angefasst — eigenständig am Prüfstand untersuchen, bevor daran gearbeitet wird.

### 4.5 Generelle Warnung zu 4.1–4.3
Alle drei Punkte hängen an Code, der in den letzten Sitzungen mehrfach als „jetzt behoben"
ausgeliefert wurde und es nicht war. **Vor jeder erneuten Behauptung „gelöst": am echten
Modell im Prüfstand nachweisen (Abschnitt 6), nicht nur Syntax prüfen und hoffen.**

### 4.6 Bf 109 „wirkt klein" — geprüft, keine Ursache gefunden (kein Bug)
Nutzerbeobachtung: Bf 109 wirkt im Vergleich zu den anderen Flugzeugen recht klein. Am echten
`bf109new.glb` nachgemessen: rohe Modellbreite 9,82 m, `REAL_SPAN.bf109=9,92` m → Auto-Skalierung
×1,01 (kaum Korrektur nötig). Zum Vergleich: FW190 roh 10,54 m vs. Sollwert 10,51 m (×0,997),
P-47 roh 12,47 m vs. 12,42 m (×0,996) — alle drei Modelle sind intern konsistent und korrekt
skaliert. Die reale Bf 109 hatte tatsächlich nur 9,92 m Spannweite gegenüber 12,42 m beim P-47
Thunderbolt (einem der größten einmotorigen Jäger des Krieges) — ein echter, historischer
Unterschied von 20 %, keine Formel-Vermutung. **Kein Bug, korrekte Größenverhältnisse.**

### 4.7 Backlog (Nutzer-Reminder, nicht bearbeitet)
Flugverhalten der verschiedenen Modelle wirkt laut Nutzer zu arcade-lastig — „zu aggressiv und
zu simpel". Explizit als Erinnerung für eine spätere, eigene Sitzung markiert, nicht Teil der
aktuellen Bugfix-Runde. Nicht angefasst.

---

## 5. Gelernte Lektionen (aus echten, wiederholten Fehlern)

1. **Nie im Chat/offline testen und im Spiel hoffen.** Der größte Zeitfresser dieses
   Projekts: Code wurde gegen extrahierte Modelldaten geprüft, die Zahlen stimmten, und im
   Browser passierte trotzdem nichts oder etwas anderes. Grund: siehe 3.1 — die
   Quantisierung wurde beim Handauslesen ignoriert, aber Box3 rechnete korrekt, sodass
   Prüfungen, die Box3 nutzten, "bestanden" und Prüfungen mit Handauslesen falsche Werte
   ergaben, ohne dass der Unterschied auffiel.
2. **Koordinatensysteme nie mischen.** `Box3.setFromObject()` liefert Weltkoordinaten,
   `geometry.boundingBox` liefert mesh-lokale Koordinaten ohne Transformation. Wer beides
   vermischt, bekommt Objekte, die im Nichts landen oder Filter, die nichts finden.
3. **Fehler im eigenen Testaufbau sehen aus wie Fehler im Spiel.** Zweimal lag ein
   scheinbarer Spielfehler am Test selbst (Spieler fuhr mit Leerlauf statt Vollgas;
   Bewegung wurde doppelt angewendet). Erst das Ausgeben von Zwischenwerten deckte das auf.
4. **Nie über Namen suchen, immer über Geometrie** (Form, Größe, Position). Begründung
   siehe 3.2.
5. **Nicht aus Screenshots zurückrechnen.** Die Modellausrichtung wurde zweimal aus der
   Kameralage im Screenshot hergeleitet — beide Male mit sich widersprechendem Ergebnis.
   Es gibt ein `TURN MODEL`-Werkzeug im Spiel (Debug-Overlay im Menü einschalten), das eine
   Vierteldrehung anwendet und dauerhaft speichert — das ist der zuverlässige Weg, nicht
   die Rückrechnung.
6. **Dateinamen mit Leerzeichen/Unterstrichen prüfen**, siehe Abschnitt 2. Drei separate
   Ausfälle hatten dieselbe Ursache.
7. **Physik statt Heuristik, wo möglich.** Die Gegner-KI wurde erst brauchbar, als die
   Flugkurve aus echter Querneigung und Lastvielfachem (`ω = g·√(n²−1)/v`) berechnet wurde
   statt aus einem beliebigen Richtungs-Lerp. Vorher drehten Gegner mit ~180°/s, physikalisch
   möglich sind bei Kampfgeschwindigkeit 6–17°/s.
8. **Wenn eine Reparatur wiederholt fehlschlägt, das Vorgehen wechseln, nicht die Parameter.**
   Der Propeller-Fall brauchte drei grundverschiedene Ansätze (Objekt suchen → Geometrie
   schneiden → Geometrie zudecken), bevor einer ohne Nebenwirkungen funktionierte.

---

## 6. Wie man hier wirklich testet

**Kein Test in diesem Projekt zählt, der nicht das echte Modell mit dem echten
`GLTFLoader` lädt.** Reine Zahlen-Offline-Rechnung hat wiederholt "bestanden", während das
Spiel kaputt war (siehe 3.1, Lektion 1).

Funktionierendes Verfahren (in einer früheren Sitzung aufgebaut, ggf. neu einrichten):
```bash
npm install three@0.128.0
# echtes r128 GLTFLoader-Skript aus node_modules laden, mit minimalen
# Browser-Attrappen (document.createElement -> Bild-Stub mit funktionierendem
# addEventListener('load', ...), sonst hängt der Loader beim Textur-Parsing)
# .parse(arrayBuffer, '', onLoad, onError) statt .load() — kein Netzwerk nötig,
# GLB direkt von der Festplatte lesen
```
Dann die betroffene Funktion **wörtlich** aus der HTML-Datei extrahieren (z. B. per
Textsuche nach `function findPropDisc(` bis zur schließenden Klammer, Klammerzählung), in
ein Testskript einfügen, gegen das echte geladene Modell aufrufen und Zwischenwerte
ausgeben (Position, Durchmesser, betroffene Dreieckszahl). Erst wenn das am echten Modell
etwas Sinnvolles zeigt, in die Datei zurückspielen.

Für reine Spiellogik (Missionen, KI, Flugmodell — kein Modell-Laden) reicht ein einfacherer
Headless-Test: THREE- und DOM-Stubs (Vector3, Group, Mesh, Canvas-2D-Context-Attrappe,
`getElementById`-Attrappe), das komplette Inline-`<script>` aus der HTML-Datei per `eval`
laden, `init()` aufrufen, dann `animate()` in einer Schleife. Damit lassen sich Missionen
durchspielen, Kollisionen prüfen, Flugbahnen über viele Frames verfolgen — nur eben keine
Aussagen über Modellgeometrie treffen (dafür Abschnitt 6, oberer Teil, verwenden).

---

## 7. Arbeitsweise, die der Nutzer erwartet

- Kommunikation auf Deutsch, Spiel-UI bleibt Englisch.
- **Keine Teillieferungen** — vollständige, lauffähige Dateien.
- **Nie eine Behauptung wie „ist jetzt behoben" ohne Nachweis** — siehe Abschnitt 4.4. Der
  Nutzer hat das wiederholt zu Recht zurückgewiesen.
- Vor jeder Auslieferung: Syntax prüfen (extrahiertes Script, `node --check` oder
  gleichwertig) UND die konkrete Kernannahme verifizieren (Zahlen durchrechnen oder am
  echten Modell testen, nicht nur "sollte jetzt gehen").
- Build-Nummer bei jeder Änderung hochzählen (Abschnitt 2).
- Chirurgische, gezielte Änderungen bevorzugen — keine großflächigen Neuschreibungen ohne
  Not, das Projekt ist bereits umfangreich und funktionierende Teile sollen es bleiben.

---

*Erstellt aus dem Code von BUILD 99 / EU BUILD 23. Wenn du Fortschritte machst, aktualisiere
diese Datei — insbesondere Abschnitt 4 — damit die nächste Sitzung (menschlich oder KI)
nicht wieder bei null anfängt.*
