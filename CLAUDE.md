# Torpedo-Bomber — Übergabe an Claude Code

**Lies diese Datei komplett, bevor du irgendetwas änderst.** Sie beschreibt ein Projekt mit
langer Vorgeschichte voller Sackgassen — die meisten davon selbst gebaut, in einem Chat ohne
Git-Zugriff, wo jede „Lösung" ungetestet ausgeliefert wurde. Der Abschnitt „Gelernte Lektionen"
ist keine Höflichkeitsfloskel, sondern verhindert, dass du dieselben Fehler wiederholst.

Stand bei Übergabe: **Torpedo Squadron BUILD 114 · Thunderbolt Squadron EU BUILD 37**
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
| `torpedo-carrier.html` | **Teil 1** — Pazifik, Trägerbetrieb (BUILD 106) |
| `thunderbolt-europe.html` | **Teil 2** — Europa, Bodenangriff (EU BUILD 27) |
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
4. **Ausnahme, einmal beobachtet (26.08.2026):** Der Pages-Deploy-Job selbst blieb nach einem
   Push über 10 Minuten auf „queued" hängen (per GitHub-API bestätigt, nicht nur vermutet —
   `gh`/API zeigte `status:"queued"` unverändert, ein Retrigger-Versuch schlug mit
   „already running" fehl, ein Cancel danach mit „not yet queued"). Das war kein Cache-Problem
   beim Nutzer, sondern ein hängender Job auf GitHub-Seite. Ein neuer, echter Commit (nicht
   Cache-Reload, nicht Nutzer-Aktion) hat einen frischen Workflow-Run ausgelöst, der dann
   normal durchlief. Falls das wieder passiert: zuerst mit der GitHub-API/`actions`-Tools den
   Run-Status direkt prüfen (nicht raten), dann einen neuen Commit pushen statt endlos auf den
   alten Run zu warten.

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

**KORREKTUR (BUILD 111 / EU BUILD 32, siehe 4.21):** Der Satz „es gibt kein trennbares Objekt"
stimmt, die daraus gezogene Folgerung „also ist der Propeller nicht entfernbar" war aber falsch.
Alle fünf GLBs sind **indiziert**; setzt man die drei Indizes eines Dreiecks auf denselben Wert,
verschwindet es, ohne dass eine einzige Position angefasst wird. Damit sind alle drei unten
genannten Fehlermodi konstruktionsbedingt ausgeschlossen. Propeller und Avenger-Fahrwerksbeine
werden seit BUILD 111 so entfernt und durch echte, bewegliche Teile ersetzt. Der Rest dieses
Abschnitts bleibt gültig — er beschreibt, warum das Anfassen von POSITIONEN scheitert:

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

### 4.4 B-17: „own gear"-Erkennung findet das eingebaute Fahrwerk nicht — BEHOBEN in EU BUILD 35, siehe 4.24
Ursprünglicher Befund (Nebenbefund beim Prüfen von 4.3, damals nicht behoben): die B-17
(`b17.glb`) hat laut Screenshot bereits ein eigenes, gut aussehendes Fahrwerk/Rad im Modell —
aber `rigModel()`s Erkennung für „eigenes Fahrwerk" findet es nicht und baut zusätzlich das
synthetische `buildGear()`-Fahrwerk daneben. Für die tatsächliche Ursache, den Fix und den
Nachweis am echten Modell siehe 4.24 — die Diagnose „doppeltes Fahrwerk sichtbar" stimmte nur
teilweise: siehe dort, warum.

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

### 4.7 Backlog (Nutzer-Reminder) — Flugverhalten in BUILD 104/EU BUILD 25 angegangen, siehe 4.10
Flugverhalten der verschiedenen Modelle wirkt laut Nutzer zu arcade-lastig — „zu aggressiv und
zu simpel". Ursprünglich als Erinnerung für eine spätere, eigene Sitzung markiert. Diese Sitzung
war das: siehe 4.10 für den ersten Umbau (Spieler-Flugmodell, beide Spiele). Grafik des Spiels
ist als nächstes Thema angekündigt, noch nicht begonnen.

### 4.8 Propellerrotation und Propellergröße — Stand nach BUILD 103

**Propellerrotation ist bereits überall verdrahtet, keine Änderung nötig.** Geprüft (Grep,
keine Testfahrt nötig, da reine Code-Inspektion ausreicht um „ist der Aufruf vorhanden"
festzustellen): Spieler-Avenger (`propPivot.rotation.z-=spin`), Spieler-SBD
(`sbdRotor.rotation.z-=...`), Zero (`zeroRotor.rotation[zeroRotorAxis]-=...`), SBD-Begleiter
(`w.disc.rotation.z-=PROP_STEP`) und Raider (`r.disc.rotation.z-=PROP_STEP`) drehen alle schon
in `animate()`. Der Nutzer hatte vermutlich einen stehenden Propeller in genau den Momenten
gesehen, in denen `fitPropeller` `null` liefert (4.1 vor BUILD 100) oder die Scheibe falsch saß
(vor BUILD 102) — mit den Fixes aus 4.1 sollte das Bild jetzt stimmen.

**Propellergröße — Entscheidung getroffen: aktuelle Größe bleibt, keine Codeänderung.** Gemessen
(siehe 4.1-Tabelle): SBD-Scheibe 10–20 % größer als der reale 3,28 m-Propeller, weil die Scheibe
exakt das im Modell eingeschweißte Blattmaterial nachmisst. Ein künstlicher Clamp auf 3,28 m
würde die Scheibe kleiner machen als die echten Blätter darunter — genau der Zustand, den
BUILD 102 gerade behoben hat (Blattspitzen ragen wieder heraus, siehe „Nachtrag BUILD 102" in
4.1). Es gibt keine Möglichkeit, gleichzeitig „historisch korrekte Größe" UND „volle Abdeckung
der eingeschweißten Blätter" zu erfüllen, ohne die Blattgeometrie selbst zu verändern — was laut
3.1 aus guten Gründen (dreimal gescheitert) tabu ist. Dem Nutzer vorgelegt und entschieden:
**aktuelle (leicht überdimensionierte, aber vollständig abgedeckte) Größe bleibt** — historische
Größe mit dem Risiko sichtbarer Blattspitzen wurde bewusst abgelehnt. Nichts zu tun.

### 4.9 Klappen, Fanghaken, Dive Brakes an den echten Modellen sichtbar — BEHOBEN in BUILD 103

Vorher gab es Landeklappen, Dive Brakes und Fanghaken nur am eingebauten Platzhalter-Rumpf
(`flapL/flapR/diveFlapL/diveFlapR`, `hook` in der Platzhalter-Konstruktion) — sobald das echte
GLB-Modell nachlädt und den Platzhalter ersetzt (wie bei Propeller/Fahrwerk, siehe 3.1/3.3),
verschwanden diese Teile ersatzlos, weil auch hier alles in die Rumpf-Geometrie eingeschweißt
ist. Nach demselben „Cover/Add, don't cut"-Muster wie Propellerscheibe und Fahrwerk-Verkleidung
wurden synthetische Klappen-, Dive-Brake- und Hakenteile direkt auf `model` aufgesetzt (Avenger
in `loadPlaneModel()`, SBD in `loadSBDModel()` auf dem geteilten `sbdTemplate`, damit auch
Begleitflugzeuge sie bekommen). Neue globale Variablen `sbdFlapL/sbdFlapR/sbdDiveFlapL/
sbdDiveFlapR` halten die SBD-eigenen Klone getrennt von `flapL/flapR/diveFlapL/diveFlapR`
(Platzhalter + Avenger), damit ein späterer erneuter Avenger-Einsatz in derselben Sitzung nicht
auf veraltete SBD-Referenzen zeigt. Jede Klappen-Hinge-Gruppe trägt `userData.flapSign` (±1),
weil „hinten" je nach Modellrahmen ein anderes Vorzeichen hat — die gemeinsame Update-Schleife
rechnet einheitlich `rotation.x=(flapSign||1)*fl*0.8`.

**Zwei grundverschiedene, verifizierte Achsfehler dabei gefunden und korrigiert — beide erst
durch Rendern entdeckt, nicht durch Nachrechnen (genau das Muster aus Abschnitt 5, Lektion 1):**

1. **Avenger: „vorne/hinten" ist X, nicht Z.** Erster Versuch nahm (in Analogie zum
   Propeller-Code) an, „hinten" liege bei ±Z im `model`-lokalen Rahmen (dem Rahmen, in den
   `model.add()` einfügt). Ein Render zeigte Klappe und Haken direkt am Propeller/Fahrwerk statt
   an Flügel/Heck. Ursache: `model`-lokal (also OHNE das auf `gltfRoot` gebackene
   `MODEL_YAW=-90°`) liegt die Nase bei x≈-5,2 bis -5,3 (gemessen an den 5 Propeller/Spinner-
   Meshes, exakt dieselbe Nasenerkennungs-Logik wie beim `propPivot`-Aufbau, nur in
   `model`-lokale statt `planeGroup`-lokale Koordinaten umgerechnet) — konsistent mit den
   bereits verifizierten Fahrwerksankern aus 4.2 (Hauptfahrwerk x=-2,381, Spornrad x=+3,734,
   beide zwischen Nase und Heck liegend). Z ist stattdessen die Spannweitenachse. Nach der
   Korrektur (Klappen-Trefferpunkt auf X statt Z, Spannweite auf Z statt X, plus
   `grp.rotation.y=-Math.PI/2` auf jeder Klappen-Gruppe, damit die von allen drei Flugzeugtypen
   geteilte Update-Schleife mit `rotation.x` weiterhin um die richtige — jetzt lokal auf Z
   ausgerichtete — Scharnierachse dreht statt die Klappe um die Sehnenachse zu „rollen") zeigt
   ein Render die Klappen korrekt am Flügelansatz nach unten ausschlagend und den Haken frei
   unter dem Heck hängend.
2. **SBD: Achsen-Konvention war richtig, die Positionswerte waren es nicht.** Die
   Grundannahme „Nase bei +Z, Spannweite auf X" stimmte (unabhängig bestätigt durch die
   bereits funktionierende `fitPropeller(playerSBD,...,-1)`- bzw.
   `fitPropeller(inner,...,+1)`-Aufrufe für Spieler bzw. Begleitflugzeug) — aber die
   Zahlenwerte (`trailZ=-0.24`, Haken bei `z=-4.55`) waren nie am Modell gemessen worden. Ein
   Render zeigte den Fanghaken frei im Raum schwebend, weit hinter dem tatsächlichen Heck.
   Ein Vertex-Scan der Rumpfunterseite entlang der Mittellinie ergab die reale
   Flügelhinterkante bei z≈-2,0 bis -2,2 (im Klappen-Spannweitenbereich x=1,0–2,0) und die
   Rumpfunterseite am Heckkegel bei z≈-3,8 bis -4,0, y≈-0,08 — beide Werte entsprechend
   korrigiert (`trailZ=-2.0`, Dive-Brake bei `dbZ=-1.6`, Haken bei `z=-4.0`).

**Nachgewiesen** (headless-WebGL-Renderer, echte `grumman tbm avenger.glb` und
`sbd dauntless.glb`, echter `GLTFLoader` r128, Klappen bei der Prüfung voll ausgeschlagen
gerendert): Avenger zeigt Klappen am Flügelansatz nach unten ausschlagend und einen frei unter
dem Heck hängenden Haken (Screenshots `avenger_flaps_side.png`, `avenger_hook_tail2.png` im
Prüfstand); SBD zeigt Klappen/Dive-Brakes direkt unter der (im Modell bereits vorhandenen,
perforierten) Tragflächen-Hinterkante und einen Haken unter dem Heckkegel statt frei schwebend
(`sbd_flaps_side.png`, `sbd_hook_tail.png`).

**Offen:** Nur am Prüfstand (headless, ohne Texturen/Beleuchtung des echten Spiels) geprüft —
Bestätigung auf dem echten iPad steht aus. Die SBD hat im Original-Mesh bereits sichtbare,
perforierte Dive-Brake-Flächen fest eingebaut (auffällig im Render) — die neuen synthetischen
Dive Brakes kommen zusätzlich dazu und sind die einzigen davon, die sich mit `P.diveBrake`
ein-/ausblenden lassen; nicht geprüft, ob das im Spiel doppelt wirkt. `thunderbolt-europe.html`
hat für den eigenen, inline gebauten Propeller in `rigModel()` denselben Tiefen-Bug wie 4.1 vor
BUILD 102 (flache `CircleGeometry` statt Zylinder) — nicht angefasst, da der gemeldete Bug sich
auf das Torpedo-Spiel bezog.

Code: `torpedo-carrier.html`, Suche nach „Flaps + arrestor hook" (Avenger, in `loadPlaneModel()`)
und „Flaps, dive brakes and the arrestor hook" (SBD, in `loadSBDModel()`).

### 4.10 Flugverhalten: Spieler-Flugmodell auf echte Trägheit/Physik umgestellt — BUILD 104 / EU BUILD 25

Nutzer-Feedback: Flugverhalten wirkt „zu aggressiv und zu simpel". Vor jeder Änderung im Code
nachgesehen statt geraten (Abschnitt 7-Vorgabe): in `updateFlight()` (beide Spiele) folgten Nick
und Roll dem Stick als reine Erste-Ordnung-Annäherung an einen Zielwinkel
(`P.roll += (target-P.roll)*rate*dt`) — keine Masse, keine Trägheit, kein Überschwingen, das
Flugzeug „schnappt" jeden Frame Richtung Zielwinkel. Die Kurve selbst war ein flacher Faktor
(`heading -= sin(roll)*1.1*AC.turn*dt*(spd/APP_SPD)`) — mit Geschwindigkeit **steigender**
Drehrate, was aerodynamisch falsch herum ist (eine gegebene Querlage dreht bei höherer Fahrt
LANGSAMER, nicht schneller). Auffällig dabei: die **Gegner-KI** in `thunderbolt-europe.html`
(`flyAI()`) fliegt bereits mit echter Physik (`turn = g·√(n²−1)/v`, aus Lastvielfachem und
Querlage) — der Spieler selbst aber nicht. Genau diese Inkonsistenz dürfte einen Teil des
„simpel" ausgemacht haben.

**Wichtiger Fund, der die Umsetzung geprägt hat:** `thunderbolt-europe.html`s eigener Code
enthält bereits einen Kommentar, der erklärt, dass ratenbasiertes Rollen (Stick kommandiert eine
Rollrate statt einen Zielwinkel) **schon einmal ausprobiert und wieder verworfen** wurde: das
Flugzeug „blieb stehen, wo man es losgelassen hatte" und driftete über 80° Querlage — auf einem
Touchscreen nicht mehr beherrschbar. Diese Lektion wurde nicht wiederholt.

**Umsetzung (beide Spiele, `updateFlight()`):**
1. **Nick/Roll:** Stick-Position kommandiert weiterhin einen Ziel-**winkel** (nicht eine Rate) —
   genau wie bisher, damit das Flugzeug beim Loslassen von selbst wieder in den Horizontalflug
   zurückfindet (die oben genannte Lektion bleibt gültig). Neu: statt jeden Frame direkt zum
   Zielwinkel zu springen, nähert sich der Winkel über einen gedämpften Federschwinger
   (`P.rollVel += (rollRate²·(target-roll) - 2·ζ·rollRate·rollVel)·dt; P.roll += rollVel·dt`),
   mit den bisherigen `pitchRate`/`rollRate`-Werten als Eigenfrequenz — jedes Flugzeug behält
   also sein bisheriges relatives Gefühl (Zero spritzig, Avenger schwer), nur WIE der Zielwinkel
   erreicht wird, ändert sich. `ζ=0.85` (leicht unterdämpft) sorgt für spürbare Trägheit ohne
   Schwammigkeit. `P.pitchVel`/`P.rollVel` neu eingeführt, bei jedem Sortie-/Missionsstart und
   Katapultstart auf 0 zurückgesetzt (sonst würde Drehimpuls vom vorigen Leben übernommen).
2. **Kurvenrate:** dieselbe Formel wie die bereits bewährte Gegner-KI
   (`turn = g·√(n²−1)/v`, `n` aus Querlage via `1/cos(roll)`, gedeckelt durch verfügbaren Auftrieb
   bei aktueller Geschwindigkeit UND ein neues, per Flugzeug gesetztes strukturelles `gLim`
   — Zero 7.0g, SBD 5.5g, Avenger 3.5g in `torpedo-carrier.html`; P-47 6.5g, Fw190/Bf109 5.5g in
   `thunderbolt-europe.html`, identisch zu den bereits vorhandenen KI-Werten in `aiSpec()`).
   `AC.turn`/`d.turn` bleibt als kleiner Restfaktor erhalten (Tragflächenbelastung u.ä., die
   dieses einfache Modell sonst nicht abbildet), um die bisherige Balance zwischen den
   Flugzeugtypen nicht zu verwerfen.

**Verifiziert, nicht nur geschrieben** (reine Spiellogik, keine Modellgeometrie — dafür reicht
laut Abschnitt 6 der einfachere Zahlen-Test, kein GLTFLoader nötig): Federschwinger-Formel
losgelöst in Node simuliert für alle drei Pazifik-Flugzeuge — Rollen erreicht 63 % des
Zielwinkels jetzt in 0,53–1,08 s (vorher 0,29–0,58 s, reine Verzögerung ohne jedes Überschwingen),
mit 0,4–0,5 % Überschwinger — spürbar behäbiger, ohne zu schwimmen. Kurvenraten-Formel geprüft:
bei fester Querlage (60°) sinkt die Drehrate jetzt korrekt mit steigender Geschwindigkeit
(0,42 rad/s bei 40 m/s → 0,11 rad/s bei 160 m/s) statt wie vorher zu steigen; bei fester
Geschwindigkeit steigt sie mit der Querlage und wird oberhalb des gesetzten `gLim` korrekt
gedeckelt (bei 85° Querlage/70 m/s: auf den 7g-Wert begrenzt, nicht auf den geometrisch daraus
folgenden, unrealistisch hohen Wert). Clamp-Verhalten am Winkel-Limit separat simuliert (Ziel
jenseits des Limits, z. B. volles Ruder + maximaler Schadens-Bias auf der Avenger): Winkel bleibt
sauber am Limit stehen, Geschwindigkeit wird beim Anschlag auf 0 gesetzt, kein Aufschaukeln.
Beide Dateien zusätzlich mit `node --check`-äquivalentem Parse-Test (`new Function(...)` auf
jedem `<script>`-Block) geprüft — beide fehlerfrei.

**Offen:** Nur numerisch/Node-seitig geprüft, nicht auf dem echten iPad geflogen — wie bei jeder
Änderung in diesem Projekt braucht es Oliver, um zu bestätigen, dass es sich auch tatsächlich
„schwerer" anfühlt und nicht zu träge geworden ist. `ζ=0.85` ist ein erster, konservativer Wert
(kaum sichtbares Überschwingen) — falls es sich immer noch zu leicht/schnell anfühlt, ist der
nächste Hebel ein kleineres `ζ` (mehr Schwingen/Momentum) oder kleinere `pitchRate`/`rollRate`
(langsamere Grundreaktion), nicht ein Rückfall auf ratenkommandiertes Rollen (siehe oben).
Grafik-Verbesserungen sind vom Nutzer als nächstes, separates Thema angekündigt — nicht Teil
dieser Änderung.

Code: `torpedo-carrier.html` und `thunderbolt-europe.html`, Funktion `updateFlight()`, Suche nach
„Real rotational inertia" / „Real inertia" bzw. „bank-to-turn: real coordinated-turn physics".

### 4.11 Grafik-Verbesserung, Runde 1: drei konkrete Bugs — BEHOBEN in BUILD 105 / EU BUILD 26

Nutzer-Feedback zum nächsten großen Thema (Grafik): Avenger hat schönes Sonnenlicht, Dauntless
nicht; manche Schiffe (Merchant/Zerstörer) erscheinen als generierte statt echte 3D-Modelle;
Thunderbolt-Terrain wirkt schwach, Häuser/Hecken wirken teils „über dem Abgrund". Auf Wunsch des
Nutzers zuerst diese drei konkreten, eingrenzbaren Ursachen untersucht und behoben, bevor die
größere Terrain-Erneuerung angegangen wird (siehe 4.12 für den Ausblick).

**1) Dauntless-Materialien — nicht geraten, sondern mit Node+echtem GLTFLoader die Material-
Eigenschaften beider Modelle direkt verglichen:** Die Avenger hat auf JEDEM Material explizit
`roughness=0.6, metalness=0` gesetzt. Die Dauntless hat zwei Rumpf-Materialien, bei denen der
Export `roughness`/`metalness` nie gesetzt hat UND die Grundfarbe `#000000` (schwarz) ohne
Textur ist — ein schwarzes, unbeleuchtetes Material zeigt so gut wie kein Sonnenlicht, egal wie
die Szenenbeleuchtung aussieht. Das ist keine Lichter-/Code-Ursache, sondern eine Lücke im
Modell-Export selbst. Fix in `loadSBDModel()`: beim Materialdurchlauf werden fehlende
roughness/metalness auf 0.6/0 gesetzt (Avenger-Wert) und ein schwarzes Material ohne Textur auf
ein neutrales Aluminium-Grau (`0x9aa3a8`) umgefärbt. Zero (`zero.glb`) separat geprüft — dort ist
alles unauffällig (ein einziges Material, weiß, texturiert, roughness/metalness korrekt
gesetzt), kein Fix nötig. **Verifiziert auf Datenebene** (Node, echtes GLTFLoader): vor dem Fix
`color=#000000, roughness=undefined, metalness=undefined` auf beiden betroffenen Materialien,
nach dem Fix `color=#9aa3a8, roughness=0.6, metalness=0` — exakt wie beabsichtigt. Ein
visueller Render-Vergleich war bei diesen beiden (kleinen, aus dem gewählten Blickwinkel kaum
sichtbaren) Meshes im Headless-Testaufbau nicht aussagekräftig (Textur-Uploads scheitern dort an
echten Bilddaten) — deshalb hier bewusst auf dem Datenniveau verifiziert statt eine irreführende
Bildaussage zu behaupten.

**2) Schiffe als generierte Platzhalter statt echtes Modell — Lade-Wettlauf, kein fehlendes
Modell.** `merchant_ship.glb`/`samidare_destroyer.glb`/`ijn cruiser.glb` werden alle korrekt
geladen (`loadFreighterModel()`/`loadDestroyerModel()`/`loadCruiserModel()`, alle drei bereits
beim Seitenstart aufgerufen) und `spawnShip()` nutzt sie bereits, WENN das jeweilige Template zum
Zeitpunkt des Missionsstarts schon fertig geladen ist. Genau das war die Lücke: keines der drei
hatte einen Nachlade-Pfad wie ihn die SBD-Begleitflugzeuge längst haben (`wingmenPendingT`) — war
das Template beim Missionsstart noch nicht da (großes .glb, langsame Verbindung, frühe Mission
nach Seitenstart), blieb dieses Schiff für die GANZE Mission auf dem prozeduralen Platzhalter
hängen, auch wenn das echte Modell Sekunden später fertig war. Erklärt das „manche Schiffe"
aus der Beschreibung: je nachdem, wie früh eine Mission relativ zum Laden gestartet wird, trifft
es unterschiedliche Missionen unterschiedlich. **Fix:** jeder Schiff-Eintrag trägt jetzt
`usedFallback` (true nur für den prozeduralen Zweig); eine neue `upgradeShipsToTemplate(type,
template)` wird am Ende jedes der drei Loader aufgerufen und tauscht bei allen noch lebenden,
noch auf dem Platzhalter stehenden Schiffen dieses Typs die Kindobjekte gegen einen frischen
Klon des jetzt geladenen Templates — Position, Rotation, HP, Trefferradius bleiben unangetastet.
**Verifiziert** mit einer eigenständigen Simulation (echtes `THREE.Group`/`Mesh`, vier Fälle:
Platzhalter+lebendig → wird aufgerüstet; bereits echtes Modell → unangetastet; versenkt →
unangetastet; falscher Schiffstyp → unangetastet) — alle vier Fälle verhalten sich exakt wie
vorgesehen.

**3) Thunderbolt: Häuser/Hecken „über dem Abgrund" — quantifiziert, nicht nur vermutet.** Das
gerenderte Gelände-Mesh setzt die Höhe NUR an seinen Gitterpunkten (`SEG=384` über `WORLD=64000`
→ 167 m pro Kachel) exakt auf `terrainH(x,z)`; dazwischen interpoliert die GPU linear über das
Dreieck. `buildSettlement()` hat Häuser und Hecken aber mit der rohen analytischen `terrainH(x,z)`
platziert — an jeder Stelle, an der sich die Funktion zwischen zwei Gitterpunkten stark ändert
(am stärksten am steilen Flusstal-Rand), weicht dieser Wert von der tatsächlich gerenderten
Dreiecksfläche ab, und das Objekt schwebt über einer Lücke oder versinkt im Boden. Mit einer
eigenständigen Simulation der Geländefunktion (Node, ohne GLTFLoader nötig — reine Zahlenlogik,
siehe Abschnitt 6) **gemessen, nicht geschätzt**: am Flusstal-Rand bis zu **55 m** Abweichung
zwischen `terrainH()` und der tatsächlich gerenderten Fläche; selbst auf offenem Ackerland
abseits von Fluss/Straße/Schiene noch bis zu ~11,5 m. **Fix:** neue Funktion `groundYRender(x,z)`
(bilineare Interpolation über dieselben Gitterpunkt-Höhen, die das Mesh selbst benutzt — exakt
an Gitterpunkten, korrekt interpoliert dazwischen), verwendet in `buildSettlement()` für die
tatsächliche Platzierungshöhe von Häusern und Hecken. `groundY()`/`terrainH()` selbst (Flugphysik,
Kollision, KI-Höhe) bewusst NICHT angefasst — dort spielen ein paar Meter Unterschied zwischen
Gitterpunkten keine Rolle, und der Eingriff hätte unnötig viele Systeme berührt. **Verifiziert**:
`groundYRender` stimmt exakt (Differenz 0,000000) mit `terrainH` an echten Gitterpunkten überein
(Sanity-Check für korrekte Interpolation) und beseitigt die gemessene 55-m/11,5-m-Abweichung per
Konstruktion.

Code: `torpedo-carrier.html` — Suche nach „loadSBDModel" (Material-Fix), „usedFallback" und
`upgradeShipsToTemplate` (Schiffs-Fix). `thunderbolt-europe.html` — Suche nach `groundYRender`
und die zwei Aufrufstellen in `buildSettlement()`.

### 4.12 Grafik-Verbesserung, Runde 2: Terrain-Erneuerung — erste Runde in BUILD 106/EU BUILD 27, siehe 4.14

Nutzer will eine **deutlich realistischere** Terrain-Grafik für Thunderbolt-Europe, mit
Performance ausdrücklich zweitrangig (iPad-Ruckler als akzeptables Risiko explizit in Kauf
genommen). Ursprünglich als „noch nicht begonnen" markiert — 4.14 dokumentiert die erste
Umsetzungsrunde (feineres Höhengitter, Laubbäume, rundere Hecken, Häuser mit Farbvarianz).
Korrektur zum vorherigen Stand: die Hecken waren KEINE reinen Textur-Linien ohne 3D-Form,
sondern schon immer echte (nur schlicht rechteckige) `BoxGeometry`-Instanzen — das war eine
Verwechslung mit den rein kosmetischen Feldgrenz-Strichen in `makeGroundTexture()`s Canvas.

### 4.13 Inseln in torpedo-carrier.html verbessert — BUILD 106

Nutzer bat direkt darum, auch die Pazifik-Inseln zu verbessern (Teil der „Grafik"-Serie). Erst
gerendert, um zu sehen statt zu raten, was schwach wirkt (`buildIsland()` extrahiert, gegen einen
echten headless-WebGL-Renderer ausgeführt — Ergebnis siehe unten): der „Dschungel" bestand aus
Kegel-Bäumen (wie Weihnachtsbäume) statt Palmen, und die Insel-Textur (`TS=160`) wirkte bei
niedrigem Überflug sichtbar blockig/pixelig, mit hartem Farbsprung an jeder Höhen-Bandgrenze
(Sand→Gras→Gestrüpp).

**Drei Änderungen in `buildIsland()`:**
1. **Palmen statt Kegel-Wald.** Der Dschungel bestand aus einem einzigen instanced Kegel
   (`ConeGeometry`), für eine Pazifikinsel falsch. Ersetzt durch echte Palmen — Stamm + 5
   strahlenförmige Wedel-Kegel, dieselbe Form, die `addPalm()` für die Strandlinie schon baute.
   `addPalm()` selbst PRO Baum aufzurufen (6 einzelne Meshes je Baum) hätte bei ~18 Inseln
   Tausende einzelner Draw-Calls bedeutet — ein echtes Performance-Risiko auf einem iPad.
   Stattdessen zwei `InstancedMesh`es (alle Stämme, alle Wedel — 5 pro Baum), damit es bei der
   gleichen Draw-Call-Klasse wie der alte Kegel-Wald bleibt (2 statt vorher 1 pro Insel).
2. **Textur-Auflösung `TS` 160→384.** Nutzer hat „Performance zweitrangig" für dieses Thema
   explizit freigegeben; ~18 Inseln × 384² RGBA sind überschaubare ~10 MB Texturspeicher.
3. **Sanfte Farbübergänge an den Höhen-Bandgrenzen** (Sand/Gras/Gestrüpp/Dschungel) statt eines
   harten if/else-Sprungs — behoben mit einer kleinen Überblend-Zone (±0,6 Höheneinheiten) um
   jede Schwelle. Die HANGneigungs-basierten Grenzen (Klippe, Vulkan-Basalt) bewusst NICHT
   geglättet — das sind im echten Gelände tatsächlich scharfe Kanten, keine Bandbreiten-Artefakte.

**Verifiziert, nicht nur geschrieben:** Ein eigenständiges Testskript mit der VOLLSTÄNDIGEN,
per Klammerzählung extrahierten `buildIsland()`-Logik (plus `isl_hash`/`isl_noise`/`isl_fbm`/
`addPalm`) gegen einen echten headless-WebGL-Renderer (`gl` + `xvfb-run`) ausgeführt, für alle
drei Inseltypen (normal/Vulkan/Atoll). Ergebnis: Palmen-Wald und Terrain-Geometrie rendern
korrekt, keine Laufzeitfehler, Bäume sitzen an den erwarteten Positionen/Höhen. Die
Textur-EINFÄRBUNG selbst konnte in diesem zweiten (aus der echten Datei extrahierten) Testlauf
nicht visuell bestätigt werden — Node hat keinen echten Canvas-2D-Backend, `CanvasTexture` bekam
dadurch keine echten Pixel und die Terrain-Fläche blieb im Screenshot schwarz (dieselbe
Einschränkung wie beim SBD-Material-Test in 4.11, kein Bug im Spielcode). Die Farb-Überblend-
Formel selbst wurde separat, unabhängig von `CanvasTexture`, mit einer direkten
`THREE.DataTexture` aus denselben Pixel-Daten gerendert und sichtbar bestätigt (deutlich
glattere Farbübergänge, keine Pixel-Art-Kante mehr) — bevor sie identisch in die echte Datei
übertragen wurde.

**Offen:** Nur am Prüfstand gerendert, nicht auf dem echten iPad geflogen. Ein vorbestehendes,
nicht durch diese Änderung verursachtes Detail (auch im alten Kegel-Wald schon vorhanden, nur an
der Baum-Platzierungslogik selbst hängend, die nicht angefasst wurde): auf Atollen wachsen
vereinzelt Bäume bis dicht an den inneren Lagunenrand — kosmetisch, nicht Teil dieses Fixes.

Code: `torpedo-carrier.html`, Funktion `buildIsland()`, Suche nach „Real palm trees instead" und
„The three height bands below".

### 4.14 Thunderbolt-Terrain, Runde 1 — BUILD 106 / EU BUILD 27

Nutzer bat direkt darum, mit der in 4.12 angekündigten Terrain-Erneuerung anzufangen, und hat
für diese und künftige Pushes explizit auf den Bestätigungsschritt vor dem Mergen verzichtet
(„machen, kontrollieren, pushen" — siehe Abschnitt 7).

**Vier Änderungen, alle in `thunderbolt-europe.html`:**
1. **Höhengitter `SEG` 384→640** (167 m → 100 m pro Kachel). Performance war vom Nutzer explizit
   als zweitrangig freigegeben; einfache, risikoarme Änderung mit direkter Wirkung auf jede
   Hügelkante im Spiel.
2. **Hecken: runde statt rechteckige Form.** Ein flacher `BoxGeometry`-Quader sah aus wie eine
   Mauer, nicht wie eine Hecke. Ersetzt durch einen Halbzylinder (`CylinderGeometry` mit
   `thetaLength=Math.PI`), einmalig mit `rotateZ(Math.PI/2)` so gedreht, dass die flache Seite
   am Boden liegt und sich die Rundung nach oben wölbt — geprüft mit einer Bounding-Box-Probe
   VOR dem Einbau (Länge liegt danach auf lokal X, Wölbung auf lokal Y, Breite auf lokal Z,
   exakt dieselbe Platzierungs-Konvention wie beim alten Quader, siehe Code-Kommentar). Dazu
   etwas Höhen-/Breiten-Streuung pro Hecke statt eines starren Fixwerts.
3. **Häuser: Farbvarianz statt eine einzige Wand-/Dachfarbe für jedes Gebäude im Spiel.**
   `instanceColor` auf beiden `InstancedMesh`es (Wände, Dächer), aus je 5 plausiblen Ton-Paletten
   zyklisch zugewiesen — gleicher Draw-Call, kein Mehraufwand.
4. **Wald: Laubbäume neben den Nadelbäumen**, nicht als Ersatz — anders als bei den
   Pazifik-Inseln (dort waren Kegel-„Nadelbäume" für einen tropischen Dschungel schlicht falsch)
   sind Nadelbäume für ein mitteleuropäisches Hochland/Waldgebiet real plausibel und blieben
   daher. Unterhalb von 700 Höhenmetern (dieselbe Schwelle, die `buildTerrain()` schon für
   „raues Weideland" benutzt) wird ein Baum jetzt zu 65 % ein Laubbaum (Stamm-Zylinder +
   Ikosaeder-Krone, zwei zusätzliche `InstancedMesh`es), oberhalb bleibt es beim Nadelbaum-Kegel
   — spiegelt die reale Höhenzonierung (Mischwald im Tal, Nadelwald im Hochland).

**Verifiziert, nicht nur geschrieben:** `buildForests()`, `buildSettlement()` und ihre komplette
Abhängigkeitskette (`terrainH`, `groundYRender`, `riverX`/`roadZ`/`railZ` usw.) wortwörtlich per
Klammerzählung aus der echten Datei extrahiert und gegen einen echten headless-WebGL-Renderer
ausgeführt — lief fehlerfrei durch (4018 Nadelbäume, 4182 Laubbäume, 381 Gebäude, 4600 Hecken
bei einem Testlauf), keine NaN-Positionen, keine invertierte Geometrie. Die tatsächlich
platzierten Gebäude-Koordinaten wurden aus der laufenden `InstancedMesh` ausgelesen (nicht
geraten), um die Kamera in einem echten Weiler zu positionieren — dort sichtbar bestätigt:
Häuser mit unterschiedlichen Wand-/Dachfarben, ein Laubbaum mit Stamm+Krone. Die Hecken-Form
zusätzlich separat in einem Mock-up mit identischem Geometrie-Code gerendert und bestätigt
(deutlich rundlicher als der alte Quader).

**Offen:** Nur am Prüfstand gerendert, nicht auf dem echten iPad geflogen — insbesondere die
Framerate-Auswirkung von `SEG=640` und den zwei neuen Laubbaum-`InstancedMesh`es ist ungeprüft;
der Nutzer hat Ruckler als Risiko akzeptiert, aber ob es tatsächlich noch flüssig genug ist,
kann nur er auf seinem iPad beurteilen. Häuser haben weiterhin keine Fenster/Details — nur
Farbvarianz. Größere, noch offene Schritte aus 4.12 (echte 3D-Gebäudeformen, Hecken mit
Lücken/Toren, weiteres Feintuning der Wald-Dichte) sind nicht Teil dieser Runde.

Code: `thunderbolt-europe.html`, Suche nach „Used to be a plain box" (Hecken), „Every wall/roof
used to share one flat colour" (Häuser), „Used to be conifer cones everywhere" (Wald).

---

### 4.15 Fanghaken (Arrestor Hook) bekommt einen echten Ein/Ausfahr-Mechanismus — BUILD 107

Nutzerfrage: „Haben die Träger Flugzeuge auch einen Button um den Fanghaken zu bewegen?" —
Antwort war nein: der Haken war in allen drei Konstruktionen (Platzhalter-Rumpf, echtes
Avenger-Modell, echtes SBD-Modell) eine rein dekorative, starre Stange in fester Ausgefahren-
Stellung. Der Nutzer wollte das eingebaut haben.

**Umsetzung**, exakt nach dem Muster von `P.gearTgt`/`gearBtn` und `P.flapTgt`/`flapBtn`:
- Neuer Button `hookBtn` (HTML/CSS, direkt unter `diveBtn`) mit `P.hook`/`P.hookTgt` (0=einge-
  fahren, 1=ausgefahren), Standardwert **ausgefahren** (`P.hook=1; P.hookTgt=1` beim Sortie-
  Start) — das entspricht exakt dem Aussehen, das der Haken vorher immer hatte, damit sich für
  niemanden, der den Button nie anfasst, irgendetwas ändert. Interpolation läuft mit derselben
  Formel wie `P.gear`/`P.flap` (`P.hook += (Ziel-P.hook)*min(1,3*dt)`).
- Jede der drei Haken-Konstruktionen (Platzhalter, `loadSBDModel()`, `loadPlaneModel()` für den
  Avenger) trägt jetzt `userData.hookAxis`/`hookDownAngle`/`hookUpAngle` — nötig, weil (exakt wie
  bei den Klappen in 4.9) „ausgefahren" bei jedem Modell eine andere Rotationsachse und ein
  anderes Vorzeichen ist (Platzhalter/SBD um lokal X, das echte Avenger-Modell um Z, wegen der in
  4.9 gemessenen X/Z-Vertauschung dieses Modells). Eine gemeinsame Zeile im `animate()`-Update
  liest diese userData generisch aus und schwenkt den Haken zwischen den beiden Winkeln — dieselbe
  Technik wie `userData.flapSign` bei den Klappen.
- Neue globale Variablen `hookMesh`/`sbdHookMesh`, exakt analog zu `flapL`/`sbdFlapL`: der Avenger-
  Haken überschreibt `hookMesh` direkt (einziges Avenger-Modell im Spiel), der SBD-Haken wird nach
  jedem `sbdTemplate.clone(true)` per `getObjectByName('sbdHook')` neu geholt (Klone behalten Namen,
  aber keine Referenzen — exakt derselbe Grund, warum `sbdFlapL` genauso funktioniert).
- **Gameplay-Kopplung:** In der Landepunkt-Prüfung, direkt neben der bereits vorhandenen
  `if(P.gear<0.6){ crash("WHEELS UP",...) }`-Zeile, jetzt zusätzlich
  `if(P.hook<0.6){ bolter("HOOK UP — BOLTER"); return; }` — Landen mit eingefahrenem Haken fängt
  keinen Draht, sondern rollt über die Fangseile hinweg (Bolter, exakt wie bei zu schnell/zu lang/
  zu kurz). Zusätzlich eine `LOWER HOOK`-Erinnerung im Endanflug, analog zu `LOWER GEAR`
  (`P.hookWarnT`, gleicher 1100-m-Radius um das Schiff).

**Verifiziert** (reine Zustandsmaschine, kein Modell-Laden nötig — Abschnitt 6, zweiter Teil):
Node-Simulation der exakt aus der Datei übernommenen Interpolationsformel bestätigt Konvergenz
gegen 0 bzw. 1 innerhalb von 2 Sekunden bei 60 fps; die Bolter-Schwelle (`<0.6`) verhält sich wie
erwartet (ausgefahren=kein Bolter, eingefahren=Bolter, halb ausgefahren=Bolter); die Rotationsformel
pro Haken-Mesh liefert bei `P.hook=1`/`P.hook=0` exakt die konstruierten `hookDownAngle`/
`hookUpAngle`-Werte für alle drei Varianten (Platzhalter, SBD, Avenger).

**Offen:** Nicht auf dem echten iPad geflogen — insbesondere, ob der Haken beim Einfahren durchs
Heck/Rumpf clippt (die Animation ist eine reine Rotation um den festen Anbringungspunkt, ohne
Kollisionsprüfung, wie bei Klappen/Fahrwerk auch). Kein visuelles Cover für den eingefahrenen
Zustand (anders als Propeller/Fahrwerk gibt es hier keine verschweißte Geometrie, die abgedeckt
werden müsste — der Haken ist ein eigenständiges, unabhängig bewegliches Objekt in allen drei
Fällen, daher reicht reine Rotation).

Code: `torpedo-carrier.html`, Suche nach „hookMesh, sbdHookMesh" (Deklaration), „arrestor hook: same
swing-toward-target" (Animation), „HOOK UP — BOLTER" (Gameplay-Kopplung).

---

### 4.16 Flugverhalten: Federschwinger zu träge — nachjustiert in BUILD 107 / EU BUILD 28

Reales Nutzer-Feedback nach dem Fliegen von BUILD 104/EU BUILD 25 (4.10): „Das Flugverhalten der
Flugzeuge ist viel zu träge." Genau die Gegenrichtung von dem, was in 4.10 als nächster
Stellhebel notiert war — nicht weniger Trägheit befürchtet, sondern zu viel geliefert.

Nachgemessen (dieselbe Node-Simulation wie in 4.10, jetzt mit den tatsächlich verbauten
Konstanten): Bei `rate×1.0, ζ=0.85` (BUILD 104/EU BUILD 25) brauchte das trägste Flugzeug
(Avenger, Nicken) 3,4 s bis 95 % des Zielwinkels erreicht waren — spürbar behäbig, nicht nur
„etwas träge". Selbst das agilste Flugzeug/Achse (Fw190, Rollen) brauchte noch 0,83 s.

**Fix:** `pitchRate`/`rollRate`-Multiplikator von `1.5`/`2.4` auf `3.0`/`4.8` verdoppelt (die
Eigenfrequenz des Federschwingers direkt erhöht — das ist der Hebel, der die Ansprechzeit
verkürzt, ohne die relative Charakteristik zwischen den Flugzeugen zu verändern, da alle
weiterhin über `pitchAuth`/`rollAuth` bzw. `AC.pitch`/`AC.roll` skalieren). Zusätzlich
`ζ` leicht von 0,85 auf 0,80 gesenkt. Numerisch geprüft: bei `ζ=0.80` sinkt die Einschwingzeit
UND das Überschwingen bleibt niedrig, weil die Verdopplung der Rate den Effekt der etwas
geringeren Dämpfung überkompensiert — Avenger-Nicken jetzt 1,55 s statt 3,4 s bis 95 %, mit
1,3 % Überschwingen statt 0,5 % (verglichen mit einer Zwischenstufe bei nur ×1,6/ζ=0,78, die
1,6–1,8 % Überschwingen ergeben hätte — ×2,0/ζ=0,80 war in der Simulation strikt besser auf
beiden Achsen). Identische Änderung in beiden Spielen (`torpedo-carrier.html` und
`thunderbolt-europe.html`), da beide dieselbe Formel und denselben ursprünglichen Kommentar
teilen.

**Verifiziert:** Node-Simulation des exakt aus beiden Dateien übernommenen Federschwingers für
alle 6 Flugzeugtypen (Avenger/SBD/Zero, P-47/Fw190/Bf109) bestätigt: Einschwingzeiten (95 %)
jetzt zwischen 0,37 s (Fw190 Rollen) und 1,55 s (Avenger Nicken), gegenüber vorher 0,83–3,4 s.
Überschwingen bleibt in allen Fällen unter 1,3 %.

**Offen:** Nicht auf dem echten iPad geflogen. Falls „zu träge" mit den neuen Werten immer noch
zutrifft, ist der nächste Schritt eine weitere Erhöhung der Rate-Multiplikatoren (nicht des
`ζ`-Werts allein) — siehe 4.10s ursprüngliche Warnung, kein Rückfall auf ratenkommandiertes
Rollen.

Code: beide Dateien, Funktion `updateFlight()`, Suche nach „much too sluggish".

---

### 4.17 Thunderbolt: Fahrwerk „wirkt künstlich" + Sporn-/Heckrad hängt zu tief — BEHOBEN in EU BUILD 28

Zwei Nutzer-Beobachtungen in einer Nachricht: „Das gear der Thunderbolt sieht immer noch zu
künstlich aus. Sportrad hängt viel zu weit unten." Der zweite Punkt widerspricht direkt 4.3, wo
genau dieser Bug für EU BUILD 24 als behoben und am echten Modell nachgewiesen dokumentiert
wurde — also frisch und skeptisch neu am echten `p47new.glb` gerendert, statt der alten
Dokumentation zu vertrauen (Lektion 1).

**Tailwheel-Bug — echte, neue Ursache, nicht dieselbe wie in 4.3:** Ein Render mit echtem
`GLTFLoader`/`p47new.glb` zeigte das Heckrad tatsächlich mit sichtbarem Spalt zur Rumpfunterseite
hängend, trotz EU BUILD 24s `localFloor()`. Direkt am Modell nachgemessen: `localFloor()` (misst
den tiefsten Vertex innerhalb eines Radius `r` um die Ziel-x/z-Position) fand für die Heckrad-
Position (`tailZ`, Radius `span*0.08` ≈ 1 m) einen Wert von y=−0,714 — aber ein Scan mit engerem
Radius zeigte: die echte Rumpfhaut an genau dieser Stelle liegt bei y=−0,112, deutlich höher.
Der abweichende, tiefere Wert stammt von einer echten, aber 0,73 m entfernten Vertex — dem
modellierten Spornrad-Schacht (einer echten Vertiefung im Mesh, vermutlich für ein eingebautes,
aber vom „own gear"-Filter nicht erkanntes Rad), die noch innerhalb des 1-m-Suchradius liegt und
dessen Minimum gewinnt. Exakt derselbe Fehlerklasse wie beim Propeller in 4.1 („ein echter, aber
falscher Punkt gewinnt, weil der Suchradius zu groß ist"), nur diesmal in `localFloor()` statt
`findPropDisc()`, und ein anderer Auslöser als der in 4.3 behobene globale-Anker-Bug.

**Fix:** `localFloor()` sucht jetzt zweistufig — zuerst mit einem engen Kernradius (`min(r,0.28)`,
klein genug, dass ein 0,7 m entfernter Schacht nicht mehr gewinnen kann), nur bei Fehlschlag
(quantisiertes Mesh, Stride-Sampling trifft zufällig nichts in der Nähe) schrittweise breiter bis
zum ursprünglich übergebenen `r`. Kein Aufrufer musste geändert werden — `localFloor()` wird nur
von `buildGear()` für Haupt- und Heckfahrwerk verwendet (geprüft, keine weiteren Aufrufer in
dieser Datei oder in `torpedo-carrier.html`).

**„Wirkt künstlich":** Das alte Fahrwerksbein war ein einzelner, einfarbiger Zylinder — von jedem
Blickwinkel ein bloßer grauer Stock. Neu: zweifarbiges Bein (dunkler fester Zylinder oben, hellerer
metallischer „Kolben" unten — derselbe Zweiton-Trick, den ein echtes Ölbein-Fahrwerk optisch
nutzt), plus eine diagonale Strebe vom oberen Drehpunkt zur Achse (jedes echte Jäger-Fahrwerk hat
eine solche Strebe; ein reiner Vertikalstab ohne sie ist genau das, was als Platzhalter wirkt),
plus eine kleine Nabenkappe auf jedem Rad. Neue Hilfsfunktion `strutBetween(p1,p2,radius,mat)`
baut einen korrekt orientierten Zylinder zwischen zwei beliebigen Punkten (Quaternion aus
`setFromUnitVectors`) — für die diagonale Strebe, robuster als eine von Hand ausgerechnete
`rotation.z`.

**Nachgewiesen am echten Modell** (wortwörtlich aus der Datei extrahiert — `localFloor`,
`findPropDisc`, `cutBlades`, `strutBetween`, `buildGear`, `rigModel` — gegen echtes `p47new.glb`
und `fw190.glb` mit echtem `GLTFLoader` r128 und echtem headless-WebGL-Renderer ausgeführt):
Heckrad sitzt jetzt bündig an der Rumpfunterseite am Heckkonus, kein sichtbarer Spalt mehr
(vorher: deutlich sichtbarer Abstand zwischen Rumpfhaut und Beinoberkante). Hauptfahrwerk an
P-47, Fw190 und B-17 (Regressionscheck) weiterhin bündig am Rumpf/an der Tragfläche montiert,
keine Verschlechterung durch die geänderte `localFloor()`-Suche. Die B-17 zeigt weiterhin das in
4.4 dokumentierte, separate Doppel-Fahrwerk-Problem (unverändert, nicht Teil dieses Fixes).

**Offen:** Nicht auf dem echten iPad geflogen. „Künstlich wirkend" ist eine subjektive Einschätzung
— die jetzige Verbesserung (Zweiton-Bein, Diagonalstrebe, Nabenkappe) ist ein gezielter, aber
begrenzter Schritt; ein Fahrwerksschacht-Deckel-Mechanismus (offene Klappen beim Ein-/Ausfahren,
wie bei echten Flugzeugen) wäre der nächste, deutlich größere Schritt, falls das nicht ausreicht.

Code: `thunderbolt-europe.html`, Funktionen `localFloor()` (Suche nach „Two-tier"), `strutBetween()`
(neu, direkt vor `buildGear`), `buildGear()` (Suche nach „oleo strut").

---

### 4.18 Thunderbolt: Propeller als reglose dunkle Scheibe + Bf 109 fast schwarz — BEHOBEN in EU BUILD 29

Zwei neue Nutzer-Beobachtungen: „Die Propeller in den Thunderbolt Missionen sind dunkle Scheiben,
keine drehenden Propeller. Me-109 ist fast schwarz, sehr schlecht Grafik." Zwei getrennte
Ursachen, beide verifiziert (nicht geraten).

**1) Bf 109 fast schwarz — echtes, dokumentiertes Three.js/iOS-Problem, kein Modellfehler.**
Alle Flugzeug-GLBs in dieser Datei (`bf109new.glb`, `fw190.glb`, `p47new.glb`, vermutlich auch
`b17.glb`/`b24.glb`) sind Sketchfab-Standardexporte mit der veralteten
`KHR_materials_pbrSpecularGlossiness`-Extension statt des modernen Metallic-Roughness-Workflows
— jedes Material hat eine eigene Diffuse- UND eine eigene Specular/Glossiness-Textur (bis zu
22 eingebettete Bilder bei der Bf 109, deutlich mehr als Fw190 mit 10 oder P-47 mit 16 — direkt
aus der GLB-JSON ausgezählt). GLTFLoader r128 wählt automatisch `THREE.ImageBitmapLoader` für
den Textur-Ladepfad, sobald der Browser `createImageBitmap` unterstützt UND es nicht Firefox
ist (`GLTFLoader.js`, Zeile ~1743) — exakt der Fall für iOS Safari. Das three.js-Forum
dokumentiert seit Jahren genau dieses Symptom unter dem Titel „Textures in gLTF sometimes
display black, but only on iOS": `createImageBitmap` liefert auf iOS gelegentlich ein
vollständig schwarzes Bitmap zurück, und zwar **umso öfter, je mehr Texturen gleichzeitig
laden** — passt exakt zur Beobachtung, dass ausgerechnet die Bf 109 (mit Abstand die meisten
Texturen) am schlimmsten betroffen ist, während P-47/Fw190 (weniger Texturen) bisher nicht
gemeldet wurden.

**Fix:** `delete window.createImageBitmap` einmalig ganz oben im Skript, vor jeder
`GLTFLoader`-Nutzung — dadurch fällt der Loader auf seinen einfachen, Image-Element-basierten
`TextureLoader`-Pfad zurück, der diesen Bug nicht hat (exakt die im three.js-Forum genannte
Umgehung). Dieselbe defensive Änderung auch in `torpedo-carrier.html` ergänzt, obwohl dort noch
kein Fehler gemeldet wurde — gleicher GLTFLoader, gleiches iOS-Ziel, gleicher Mechanismus, also
lieber vorbeugend behoben als auf den nächsten Bug-Report zu warten.

**Verifiziert:** Die exakte Bedingung aus der GLTFLoader-Quelle
(`typeof createImageBitmap!=='undefined' && !/Firefox/.test(navigator.userAgent)`) in Node mit
einer simulierten iOS-Safari-`userAgent`-Zeichenkette nachgebaut — liefert `true` (würde
ImageBitmapLoader nehmen) vor dem Fix, `false` (nimmt TextureLoader) exakt nach Anwendung der
einen Zeile. Ein echter Vorher/Nachher-Bildvergleich war nicht möglich: Node hat kein
`createImageBitmap`, das Kern-Symptom ist also im Headless-Prüfstand ohnehin nie reproduzierbar
— das ist eine iOS-Safari-spezifische Eigenheit, keine reine Programmlogik, die sich in Node
nachstellen lässt. Fix stattdessen auf Mechanismus-Ebene bestätigt (Bedingung schaltet nachweis-
lich um), nicht durch einen irreführenden Screenshot, der so oder so nur den bereits im
Headless-Test funktionierenden Pfad gezeigt hätte.

**2) Propeller wirkt wie eine reglose dunkle Scheibe — unabhängiger Kontrast-Bug, eigene Ursache.**
`rigModel()`s Propeller-Deckscheibe (siehe 3.1 — der Propeller ist ins Rumpf-Mesh eingeschweißt,
daher eine deckende Scheibe statt echter Blätter) hatte Flächenfarbe `0x24241d` und
„Blattstreifen"-Farbe `0x14140f` — zwei nahezu identische, fast schwarze Töne. Eine Scheibe, die
sich dreht, aber deren Streifen sich farblich kaum vom Untergrund abheben, sieht bei jedem
Drehwinkel praktisch gleich aus — die Rotation selbst war nie das Problem (bereits in 4.8
geprüft: alle Rotationsaufrufe sind verdrahtet), sondern dass sie unter fast gleichfarbigen
Flächen unsichtbar blieb. Mit einem eigenständigen Rendertest (identische Scheiben-Geometrie,
zwei Drehwinkel verglichen) bestätigt: mit den alten Farben bleibt die Scheibe bei jeder Drehung
ein fast einheitlicher dunkler Fleck; mit saniert helleren, leicht metallischen Streifenfarben
(`0xcac2a8` auf `0x38362f`-Fläche, `MeshStandardMaterial` statt `MeshLambertMaterial` für echte
Hochlicht-Reaktion) läuft ein sichtbarer Glanzlicht-Reflex mit über die Blattstreifen, sobald sich
die Scheibe dreht — das ist optisch der auffälligste Hinweis auf Rotation, den ein flaches
Lambert-Material grundsätzlich gar nicht liefern kann. Rand-Ring und Spinner-Kegel ebenfalls
aufgehellt (`0xd9d2b8`→`0xf0e8cc`, `0x2b2b22`→`0x403e34`), aus demselben Grund.

**Verifiziert am echten Modell:** `rigModel()` (inkl. aller Abhängigkeiten) wortwörtlich aus der
Datei extrahiert, gegen echtes `fw190.glb` mit echtem `GLTFLoader` r128 und echtem
headless-WebGL-Renderer ausgeführt, Propellerscheibe bei zwei Drehwinkeln fotografiert — helle
Streifen deutlich sichtbar, Glanzlicht wandert sichtbar zwischen den Aufnahmen.

**Offen:** Nicht auf dem echten iPad geflogen. Fix 1 (ImageBitmapLoader) ist auf Mechanismus-
Ebene, nicht per Sichtprüfung bestätigt — sollte „fast schwarz" nach diesem Build noch auftreten,
ist der nächste Schritt, die Materialien komplett von der veralteten
`KHR_materials_pbrSpecularGlossiness`-Extension weg auf ein einfaches, robustes
`MeshStandardMaterial` mit nur der Diffuse-Textur umzustellen (halbiert die Textur-Last pro
Material und entfernt den eigenen, fehleranfälligeren Shader-Patch dieser Extension ganz) —
bewusst noch nicht gemacht, um die Änderung in diesem Schritt klein zu halten.

Code: beide Dateien, Suche nach „Textures in gLTF sometimes display black" (ImageBitmap-Fix,
ganz am Anfang des Skripts). `thunderbolt-europe.html` zusätzlich `rigModel()`, Suche nach
„dark discs, no spinning propeller visible" (Propeller-Kontrast).

---

### 4.19 Vollkreis dauert ewig / Querneigung limitiert — BEHOBEN in BUILD 109 / EU BUILD 30

Nutzer: „Um einen Vollkreis zu machen brauchen die Flugzeuge ewig. Hier liegt das größte Problem
bei der Steuerung. Auch die Querneigung ist limitiert." Beides dieselbe Ursache, nicht zwei
getrennte Bugs.

**Ursache, nachgerechnet statt geraten:** `rollLim` (der maximale Querneigungswinkel, den der
Steuerknüppel überhaupt kommandieren kann) lag in beiden Spielen bei ca. 41–60°. Die
Kurvenraten-Physik aus 4.10 (`turn = g·√(n²−1)/v`, `n = 1/cos(Querneigung)`, gedeckelt durch das
strukturelle `gLim` jedes Flugzeugs — Avenger 3,5 g bis Zero/P-47 6,5–7,0 g) braucht aber selbst
für das SCHWÄCHSTE `gLim` (Avenger, 3,5 g) etwa 73° Querneigung, bevor `gLim` statt des
Querneigungswinkels zur echten Grenze wird — bei 6,5–7,0 g (P-47/Zero) sogar ~81–82°. Mit einem
bei 41–60° gedeckelten Knüppel konnte kein einziges Flugzeug jemals so weit in die Kurve legen,
dass sein eigenes strukturelles Limit überhaupt zum Tragen kam — die Querneigungsgrenze selbst
war der Flaschenhals, nicht `gLim`, und zwar bei alle sechs Flugzeugen beider Spiele.

Mit einer eigenständigen Simulation der exakt verbauten Formel (Abschnitt 6, reine Zahlenlogik)
gemessen, wie lange ein voller 360°-Kreis bei typischer Kampfgeschwindigkeit dauerte: **28–91
Sekunden** je nach Flugzeug (Avenger 91,3 s, P-47 79,6 s, SBD 52,9 s, Bf109 33,9 s, Fw190 37,3 s,
Zero 28,3 s) — das deckt sich exakt mit „dauert ewig".

**Fix:** `rollLim` je Flugzeug so angehoben, dass jedes Flugzeug seine eigene `gLim`-Grenze
tatsächlich erreichen (P-47/Zero/Fw190/Bf109/SBD) oder ihr zumindest nahekommen kann (Avenger,
absichtlich etwas knapper gehalten, da spürbar schwerer als die anderen fünf) — die
Kurvenrate wird jetzt wieder von `gLim` begrenzt, nicht von der Querneigung selbst, exakt wie in
4.10 ursprünglich beabsichtigt. `pitchRate`/`rollRate` (wie SCHNELL der Knüppel dorthin kommt,
siehe 4.16) bleiben unverändert — das war schon in Ordnung, das Problem war ausschließlich, WIE
WEIT der Knüppel kommandieren durfte, nicht wie schnell.

| Flugzeug | rollLim vorher | rollLim nachher | Vollkreis vorher | Vollkreis nachher |
|---|---|---|---|---|
| P-47 (EU) | 0,78 rad (45°) | 1,42 rad (81°) | 79,6 s | 13,8 s |
| Fw190 (EU) | 1,05 rad (60°) | 1,40 rad (80°) | 37,3 s | 12,0 s |
| Bf109 (EU) | 1,02 rad (58°) | 1,40 rad (80°) | 33,9 s | 10,2 s |
| Zero (TC) | 1,05 rad (60°) | 1,43 rad (82°) | 28,3 s | 7,1 s |
| SBD (TC) | 0,88 rad (50°) | 1,40 rad (80°) | 52,9 s | 11,8 s |
| Avenger (TC) | 0,72 rad (41°) | 1,30 rad (74°) | 91,3 s | 23,9 s |

(TC = torpedo-carrier.html, EU = thunderbolt-europe.html — Vollkreis-Zeiten bei geschätzter
typischer Kampfgeschwindigkeit je Flugzeug, siehe Testskript.)

**Verifiziert:** Node-Simulation der exakt aus beiden Dateien übernommenen Kurvenraten-Formel
bestätigt für alle sechs Flugzeuge: die neue `rollLim` reicht in jedem Fall aus, dass
`1/cos(rollLim) ≥ gLim` gilt (die Kurve sättigt jetzt am strukturellen Limit, nicht am
Knüppelanschlag) — geprüft als expliziter Boolean je Flugzeug, nicht nur die Endzeit verglichen.
Keine Kollision mit anderen, von `P.roll` abhängigen Stellen gefunden (z. B. „WINGS LEVEL TO
DROP"/`wOk` in `torpedo-carrier.html` prüfen nur auf nahezu Level, nicht auf einen Maximalwert —
von der höheren Obergrenze unberührt).

**Offen:** Nicht auf dem echten iPad geflogen. Avenger bleibt mit 23,9 s bewusst der langsamste
Kreisflieger (schwerer Torpedobomber) — falls das immer noch zu behäbig wirkt, ist der nächste
Hebel `gLim` selbst anzuheben (aktuell 3,5 g), nicht `rollLim` weiter zu öffnen, da `rollLim`
für alle sechs Flugzeuge jetzt bereits über dem Punkt liegt, an dem `gLim` limitierend wird.

Code: `torpedo-carrier.html` und `thunderbolt-europe.html`, Suche nach „Vollkreis dauert ewig"
(torpedo-carrier.html) bzw. die `rollLim`-Kommentare im `AC`-Objekt (thunderbolt-europe.html).

---

### 4.20 Kurvenrate, Pitch, Propeller-Optik, Insel-Optik — BUILD 110 / EU BUILD 31

Deutliches, berechtigtes Nutzer-Feedback nach BUILD 109: „Die Propeller sind graue, sich nicht
drehende Scheiben bei Dauntless, Me109 und P47. Die Kurvenrate ist viel zu gering, das Flugzeug
neigt sich zwar zur Seite, es kommt aber fast keine Drehrate zustande. Man fliegt trotz 50 Grad
Querlage fast geradeaus. Die Pitch-Bewegungen sind jedoch zu aggressiv. Die Südsee-Inseln sehen
jetzt aus wie aus einem Comic für Kinder."

Alle vier Punkte waren echte, selbst verursachte Regressionen aus 4.10/4.16/4.19 bzw. 4.13.

#### 1) Kurvenrate — die eigentliche Ursache, nicht das, was 4.19 vermutet hatte

4.19 hatte `rollLim` angehoben und dabei nur den Bereich ÜBER 70° Querlage verbessert. Der
Nutzer fliegt aber bei ~50°. Dort nachgerechnet (P-47, 105 m/s Reisefahrt, Formel wortwörtlich
aus der Datei):

| Querlage | vor BUILD 104 (Arcade) | BUILD 104–109 (Physik) | jetzt |
|---|---|---|---|
| 30° | 6,9 s | 137 s | 18,5 s |
| 50° | 4,5 s | **66 s** | **12,1 s** |
| 70° | 3,7 s | 29 s | 9,8 s |

**Meine BUILD-104-Umstellung auf die Lehrbuchformel `turn = g·√(n²−1)/v` hat die Kurve bei
normaler Querlage um Faktor 15 verlangsamt.** Die Formel ist korrekt — ein echtes Flugzeug ist
bei 50° Querlage wirklich so träge (bei 50° liegen nur 1,56 g an). Aber ein Spiel, das mit zwei
Daumen auf einem Tablet geflogen wird, kann das nicht sein. Das war eine Fehlentscheidung von
mir, kein Geschmacksthema, und 4.19 hat sie nur kaschiert statt behoben.

**Fix:** neue Funktion `bankTurnRate(roll, spd, gLim, turnFactor)` — eine **bewusst deklarierte
Gameplay-Kurve**, ausdrücklich kein Physik-Anspruch mehr:
- `sin(Querlage)` statt `√(n²−1)`: beißt früh und beißt weiter, statt bis 70° fast nichts zu tun
  und dann steil hochzuschießen
- fällt weiterhin mit steigender Geschwindigkeit — das ist das Einzige, was die alte
  Arcade-Formel vor BUILD 104 falsch herum hatte, und das bleibt korrekt
- `TURN_VREF` als Untergrenze: unterhalb davon wird die Kurve nicht weiter enger, damit langsames
  Fliegen keine absurden Raten erzeugt
- das strukturelle `gLim` deckelt weiterhin — das ist es, was Avenger, Thunderbolt und Zero
  weiterhin unterscheidbar hält

Konstanten `TURN_K=1.05, TURN_VREF=80, TURN_CEIL=1.8`, per Rastersuche gegen harte Zielvorgaben
bestimmt, nicht geraten.

**Wichtig: dieselbe Funktion gilt jetzt auch für die Gegner-KI** (`flyAI()`). Hätte ich nur den
Spieler beschleunigt, wäre jeder Gegner zum Abschuss freigegeben gewesen. Geprüft: die KI-Bf109
dreht weiterhin 1,35× so schnell wie der Spieler-P-47.

**Verifiziert am ausgelieferten Code** (Funktion und Konstanten per Klammerzählung aus
`thunderbolt-europe.html` extrahiert, `rollLim`-Werte aus beiden Dateien gelesen): für alle sechs
Flugzeuge steigt die Drehrate monoton mit der Querlage, fällt in jedem Fall bei höherer
Geschwindigkeit, und der Avenger bleibt mit Faktor 1,83 deutlich der schlechteste Kurvenflieger.
Vollkreis bei 50° Querlage jetzt 7,5–12,2 s statt 41–67 s.

#### 2) Pitch zu aggressiv

In 4.16 hatte ich den Federschwinger-Multiplikator für Nick UND Roll gemeinsam von 1,5/2,4 auf
3,0/4,8 verdoppelt. Für Roll war das richtig, für Nick zu viel. Nick allein auf **2,0** gesenkt
(Einschwingzeit 1,30–2,17 s statt 0,87–1,43 s), Roll bleibt bei 4,8 — die Beschwerde war die
Kurvenrate, nicht die Rollgeschwindigkeit. Numerisch mit den tatsächlich verbauten Konstanten
geprüft, Überschwingen bleibt überall unter 1,3 %.

#### 3) Propeller „graue, sich nicht drehende Scheiben" — die Rotation war nie das Problem

In 4.8 und 4.18 hatte ich zweimal geprüft, dass die Rotation verdrahtet ist (ist sie, in beiden
Spielen), und in 4.18 nur die FARBEN aufgehellt. Das war die falsche Stellschraube. Das
tatsächliche Problem, diesmal gemessen statt betrachtet: die Scheibe bestand aus **drei Balken
über den vollen Durchmesser im 60°-Abstand — ein SECHSFACH symmetrisches Muster.** Gerendert und
pixelweise verglichen: dreht man die Scheibe um 60°, 120° bzw. 180°, beträgt die mittlere
Pixeldifferenz 0,25 / 0,25 / **0,00** — das exakt identische Bild. Keine Drehgeschwindigkeit der
Welt lässt eine Form, die sich alle 60° wiederholt, wie eine Drehung aussehen.

**Fix in beiden Spielen:** drei weiche Blatt-Schlieren (das, wozu ein echter Dreiblattpropeller
verschmiert) plus fünf unregelmäßige Glanzlichter, deren Winkel keinen gemeinsamen Teiler haben.
Am echten `p47new.glb` mit dem ausgelieferten `rigModel()` nachgemessen: schlechtester Fall der
Selbstähnlichkeit über eine volle Umdrehung **0,00 → 12,31** — es gibt keinen Winkel mehr, bei
dem sich das Bild wiederholt. Die Scheibe bleibt vollständig deckend, deckt also die in den Rumpf
eingeschweißten Blätter weiterhin ab (3.1).

Zwei Zwischenentwürfe wurden verworfen, weil sie zwar gut maßen, aber wie ein Ventilator bzw.
ein Speichenrad aussahen — beide gerendert und angesehen, nicht nur an Zahlen beurteilt.

#### 4) Inseln „wie aus einem Comic für Kinder"

Per `git show` nachgesehen, was BUILD 106 tatsächlich geändert hatte, statt zu raten: der alte
Wald war **ein dunkler Kegel, 2,8 Einheiten hoch, in `0x1c4718`**. Ich hatte ihn durch einen
9 Einheiten hohen Stamm in hellem `0x6b4a2a` mit fünf identischen, flach abstehenden Wedeln in
kräftigem `0x2f7a3a` ersetzt — also **dreimal so hoch und in HSL-Helligkeit fast doppelt so hell**
(0,33 statt 0,19). Dreimal so groß und doppelt so hell ist exakt, wie ein Spielzeug aussieht. Die
Farbpalette des Geländes selbst hatte ich nicht angefasst; die Comic-Optik kam allein von den
Bäumen.

Palmen bleiben (für den Pazifik richtig), aber gedämpft: Stamm 5,0 statt 9,0 Einheiten in
`0x4a3a28`, Wedel `0x255220`, abgeflacht statt fette Kegel, **hängend statt flach abstehend**, mit
5 oder 6 Wedeln in zufälliger Ausrichtung statt fünf identischer Speichen. Dieselbe Behandlung
für `addPalm()` (die Strandpalmen) — deren Werte waren die Vorlage, die ich in BUILD 106 auf den
ganzen Dschungel kopiert hatte, und sie stehen genau dort, wo man im Tiefflug vorbeikommt; nur
den Wald zu korrigieren hätte die halbe Insel grell gelassen.

**Offen:** Die Geländefarbe selbst konnte im Prüfstand nicht beurteilt werden — Node hat kein
echtes Canvas-2D-Backend, `CanvasTexture` bekommt dort keine Pixel und der Boden bleibt im
Screenshot schwarz (bekannte Grenze, siehe 4.11/4.13, kein Spielfehler). Sollte die Insel-Optik
nach diesem Build immer noch zu bunt wirken, sind die nächsten Stellschrauben die Bandfarben
`low`/`up`/`jun` in `buildIsland()` — die sind unverändert seit vor BUILD 106.

**Offen, generell:** Nichts davon ist auf dem echten iPad geflogen. Falls die Kurvenrate jetzt zu
schnell wirkt, ist die eine Stellschraube `TURN_K`; falls immer noch zu langsam, ebenfalls `TURN_K`
(zusammen mit `TURN_CEIL`, sonst deckelt das g-Limit). `rollLim` NICHT weiter öffnen — das liegt
seit 4.19 bereits über dem Punkt, an dem `gLim` limitiert.

Code: beide Dateien, Suche nach „bankTurnRate" (Kurvenrate), „viel zu sluggish"/`pitchRate`
(Pitch), „SIX-fold symmetric"/„SECHSfach" (Propeller); `torpedo-carrier.html` zusätzlich
`addPalm()` und `buildIsland()`, Suche nach „Comic für Kinder".

---

### 4.21 Echte Propeller statt Deckscheibe, Avenger-Fahrwerk, schwebende Hecken — BUILD 111 / EU BUILD 32

Nutzer nach BUILD 110, zu Recht deutlich: „Die Propeller sind immer noch Scheiben, bei der Avenger
sind bei gear up nun weiße Pylone unter dem Flugzeug zu sehen. Bei Terrain hängen immer noch Hecken
in der Schlucht. Sonst nimm den Propeller der Avenger, der ja funktioniert, und wende das System auf
die anderen Flugzeuge an. Mach es endlich richtig anstatt zu pfuschen."

**Der Hinweis auf die Avenger war der Schlüssel** — und er hat eine Annahme widerlegt, die seit
Abschnitt 3.1 als gesichert galt.

#### 1) „Geometrie-Chirurgie ist unmöglich" war falsch — es gibt einen vierten Weg

3.1 und der alte `cutBlades`-Kommentar sagten: Propellerblätter sind ins Rumpf-Mesh eingeschweißt
und nicht entfernbar. Begründet mit drei gescheiterten Versuchen — alle drei bewegen oder bauen
**Positionen** neu: Buffer neu aufbauen (Quantisierung verloren), Einzelvertices kollabieren
(Dreiecke verzerrt), Dreiecke durch Verschieben ihrer Ecken kollabieren (indizierte Meshes teilen
Ecken, Nachbarn kamen mit).

Am echten Modell nachgemessen: **alle fünf GLBs sind INDIZIERT.** Damit gibt es einen vierten Weg,
den nie jemand probiert hat: die drei **Indizes** eines Blattdreiecks auf denselben Wert setzen.
Das Dreieck hat null Fläche und rastert nichts mehr — und es wird **keine einzige Position
angefasst**, also ist Quantisierung irrelevant, nichts kann verzerren, und jedes Nachbardreieck
behält seine eigenen Indizes und seine eigenen Ecken. Alle drei dokumentierten Fehlermodi sind
konstruktionsbedingt ausgeschlossen.

**Nachgewiesen:** P-47 1082, Fw 190 716, SBD 730, Bf 109 197 Blattdreiecke entartet; danach am
ausgelieferten Code nachgezählt: **0 Dreiecke** bleiben im Schnittbereich übrig, bei allen vier.

#### 2) `findPropDisc` hat für den P-47 nie funktioniert

Beim Debuggen aufgefallen: `findPropDisc(root)` liefert für `p47new.glb` **null**. Das Spiel ist
also seit jeher auf die Notfall-Scheibe `S.x*0.30` zurückgefallen — eine geratene Größe an einer
geratenen Stelle. Ersetzt durch `findProp()`, das den Propeller wirklich vermisst:

- Achse über iterative Zentrierung auf den **dichten Kern** (die Haube ist ein Rotationskörper; ein
  einfacher Mittelwert würde von den Blättern aus der Mitte gezogen)
- Haubenradius über **Flächendichte pro Kreisring**, nicht über ein Vertex-Perzentil — die Haube ist
  dicht, die Blätter sind dünn, und das gilt unabhängig davon, wie das Modell in Meshes aufgeteilt
  ist. Ein Perzentil wird vom vertexreichsten Mesh dominiert und ist bei zwei von fünf Flugzeugen
  gescheitert.
- **Zwei Durchgänge:** eine feste Frontscheibe funktioniert beim P-47 (Blätter sind das Vorderste),
  verfehlt die Dauntless aber komplett, deren langer Spinner die Blattwurzeln eine ganze Einheit
  weiter hinten sitzen lässt. Also erst das Blattmaterial finden, dann den Schnitt darum legen.

Gemessene Durchmesser gegen die realen Vorbilder: P-47 3,9 m (real 3,71), Bf 109 3,1 (3,00),
Fw 190 3,3 (3,30), SBD 3,2 (3,28). Die 8–12 % Überschuss sind die Modellgeometrie selbst.

#### 3) Echte, drehende Propeller

`makeProp()` baut nun einen richtigen Propeller — verjüngte, verwundene Blätter mit hellen
Blattspitzen und einem Spinner — statt einer Deckscheibe. Blattzahlen sind historische Fakten,
keine Messung: P-47D vier, alles andere drei. Die Avenger bleibt bei ihrem eigenen `propPivot`
(`fitPropeller` gibt für sie bewusst `null` zurück, Achse 0,97 aus der Mitte) — genau wie vom
Nutzer vorgeschlagen: das eine System, das funktioniert hat, bleibt unangetastet.

#### 4) Avenger: weiße Pylone bei eingefahrenem Fahrwerk

Das waren meine Bein-Abdeckungen aus BUILD 101 — graue Zylinder, die bei „gear up" erschienen, weil
die Beine als nicht entfernbar galten. Mit der Index-Technik sind sie es doch. Am Modell gemessen:
Flügelhaut bei y −0,40…−0,75, eingeschweißtes Bein −0,88…−1,88, darunter das Radmesh. 1475 Dreiecke
entartet, dazu echte Beine (Zweiton-Ölbein plus Diagonalstrebe), die jetzt **mit** dem Fahrwerk
erscheinen statt ohne. Gerendert: Bauch bei „gear up" sauber, nur der Radschacht bleibt sichtbar;
bei „gear down" hängen Räder und Beine zusammen.

#### 5) Hecken hängen in der Schlucht — Ursache endlich gefunden

BUILD 105 hatte mit `groundYRender()` die Höhe an einem **Punkt** korrigiert. Das war richtig und
hat das Problem nicht gelöst, weil eine Hecke 70–220 m lang ist, das Geländegitter aber 100 m pro
Kachel misst: die Platzierung nahm **eine** Stichprobe in der Heckenmitte und wusste nichts darüber,
wo die beiden **Enden** landen. Über 4600 Platzierungen gemessen: **58 % der Hecken schwebten mehr
als 3 m über dem Boden, die schlimmste 137 m.**

Fix: entlang der ganzen Hecke abtasten, zu steile Stellen verwerfen (eine Hecke läuft keine
Schluchtwand hinunter), und auf den **Tiefpunkt** setzen, den sie überspannt, mit etwas Zusatzhöhe,
damit das eingegrabene Ende noch sichtbar bleibt. Gebäude bekamen dieselbe Behandlung über ihre
eigene Grundfläche. **Am ausgelieferten Code nachgemessen (Schleife wortwörtlich aus der Datei
extrahiert und ausgeführt): 0,0 % schwebend, schlimmster Fall 0,00 m.**

#### 6) Mehr Querlage

`rollLim` weiter angehoben: P-47/Zero 87°, Fw190/Bf109/SBD 86°, Avenger 81° (vorher 74–82°).

**Offen:** Nichts davon ist auf dem echten iPad geflogen. Der Schnitt ist nicht rückgängig zu machen
— er passiert einmal beim Modellaufbau, also betrifft er alle Klone. Falls ein Modell dazukommt,
dessen Propeller `findProp` nicht findet, bleibt es unverändert (kein Notbehelf mehr).

Code: `thunderbolt-europe.html` und `torpedo-carrier.html`, Suche nach `findProp`, `cutBlades`,
`makeProp`; `torpedo-carrier.html` zusätzlich „moulded gear-leg triangles"; `thunderbolt-europe.html`
zusätzlich die Hecken-Schleife in `buildSettlement()`.

---

### 4.22 Blattwurzeln, Kurvenrate bei echter Geschwindigkeit, Bf 109 dunkel — BUILD 112 / EU BUILD 33

Nutzer nach BUILD 111: „Kurvenrate bei Thunderbolt Spiel immer noch zu gering. Auch sind noch
starre Spitzen von Propellern zu sehen. Wie auch auf den Bildern, die du geschickt hast. Aber die
Propeller drehen sich mittlerweile. Fahrwerke sind auch besser. Me109 immer noch viel zu dunkel."

Drei Punkte, alle drei mit einem konkreten Messfehler auf meiner Seite.

#### 1) Starre Blattwurzeln — meine Haubenerkennung war schlicht falsch

Der Nutzer hat es an MEINEN eigenen Bildern gesehen, ich hatte die weißen Paddel bei 12 und 6 Uhr
vorschnell als Antennenmast abgetan. Per Raycast durch genau diesen Bildpunkt geprüft: die Paddel
sitzen bei **Radius 0,54–0,75**, mein Schnitt begann aber erst bei 0,95. Es waren die
**Blattwurzeln** zwischen Spinner und Haube.

Ursache: `findProp` bestimmte den Haubenradius über die **Flächendichte pro Kreisring** und kam
beim P-47 auf 0,90. Eine Messung der **Winkelbelegung** zeigt den wahren Wert: bis r=0,64 sind
33–36 von 36 Winkelsektoren belegt (ein Rotationskörper — Spinner und Motor füllen jeden Sektor),
ab r=0,74 nur noch 8–18 (ein Blatt füllt nur wenige). **Der Übergang IST die Blattwurzel**, und er
ist eindeutig; die Dichte-Heuristik ist es nicht. Haubenradius jetzt über Winkelbelegung:
P-47 0,70 statt 0,90, Bf 109 0,55, Fw 190 0,67, SBD 0,81.

Zusätzlich war der Schnitt zu dünn: eine feste Scheibendicke passt nicht auf alle Modelle (die
gemessene Blattdicke der Bf 109 ist 0,18 bei 1,57 Blattradius). `cutBlades` weitet die Scheibe
jetzt selbstregelnd auf, bis der Blattring frei ist, mit einer Untergrenze von `tipR*0,22` — ein
verwundenes Blatt erstreckt sich immer über einen nennenswerten Teil seines eigenen Radius.

**Nachgewiesen:** P-47 7312 statt 1082 Dreiecke entfernt; gerendert sind die Paddel weg.
**Ehrliche Einschränkung:** die Restzahlen hängen stark davon ab, wie weit man das Prüffenster
zieht (bei der Bf 109 lagen die vermeintlichen „Reste" 1,4 Einheiten HINTER der Propellerebene —
das war die Motorhaube, kein Blatt). Deshalb ist der Nachweis hier das Rendering, nicht eine Zahl.

#### 2) Kurvenrate — ich hatte gegen die falsche Geschwindigkeit getunt

Der entscheidende Fehler: ich habe mit 105 m/s Reisefahrt gerechnet. Der Screenshot des Nutzers
zeigt **375 mph = 167 m/s**. Die Kurve fällt mit 1/v — was ich als 12-Sekunden-Kreis gemessen
hatte, war in der Luft, in der er tatsächlich fliegt, ein 19-Sekunden-Kreis.

Neu getunt bei den Geschwindigkeiten, die geflogen werden (`TURN_K` 1,05 → 1,90, `TURN_CEIL`
1,8 → 2,4, nur in `thunderbolt-europe.html`; das Trägerspiel wurde nicht kritisiert und bleibt):

| | 50° Querlage @167 m/s | volle Querlage |
|---|---|---|
| P-47 vorher | 19,2 s | 14,7 s |
| P-47 jetzt | **10,6 s** | **8,1 s** |
| Bf 109 jetzt | 7,9 s | 7,9 s |

Am ausgelieferten Code geprüft: monoton in der Querlage, fällt weiterhin mit steigender
Geschwindigkeit, und die Gegner-KI bleibt mit Faktor 1,03 mindestens gleichauf.

#### 3) Bf 109 zu dunkel — weg von KHR_materials_pbrSpecularGlossiness

Die `createImageBitmap`-Umgehung aus EU BUILD 29 hat nicht gereicht. Alle Flugzeuge hier sind
Sketchfab-Exporte mit dieser veralteten Extension, die GLTFLoader durch **Patchen des
Standard-Shaders zur Compile-Zeit** umsetzt und die pro Material eine ZWEITE Textur lädt (die
Bf 109 trägt so 22 eingebettete Bilder, mit Abstand die meisten). Alle Materialien werden beim
Laden auf ein einfaches `MeshStandardMaterial` mit nur der Diffuse-Textur umgestellt: der
gepatchte Shader entfällt komplett, die Texturlast pro Material halbiert sich.

**Ehrliche Einschränkung:** Das iOS-Safari-Verhalten ist im Prüfstand nicht reproduzierbar
(headless-GL lädt die eingebetteten Texturen gar nicht erst, beide Varianten kommen schwarz
heraus) — es gibt also KEINEN Vorher/Nachher-Screenshot. Die Begründung stützt sich darauf, dass
ein Render, der exakt so gebaut war (einfaches Standardmaterial + dekodierte Diffuse-Textur),
korrekt hell und farbig herauskam, während der Extension-Pfad das nicht tut. Sollte die Bf 109
danach immer noch dunkel sein, ist der nächste Schritt, die Szenenbeleuchtung des Europa-Spiels
selbst zu prüfen statt weiter am Material.

Code: beide Dateien, Suche nach „ANGULAR OCCUPANCY" (Blattwurzel), „A real propeller blade is
twisted" (Scheibendicke); `thunderbolt-europe.html` zusätzlich `TURN_K` und „Get off
KHR_materials_pbrSpecularGlossiness".

---

### 4.23 Pause-Menü, Brücke unauffindbar, Ziele schwer erkennbar, Rookie zu hart, Flugverhalten — EU BUILD 34

Nutzer-Sammelanfrage: „Terrain und mehr Feinschliff bei den Missionen. Kein Button um zurück ins
Menü zu kommen, bei Pause läuft der Ton weiter. Auch im Rookie Modus sehr schwer zu überleben,
Ziele zum Teil sehr schwer zu erkennen oder gar nicht vorhanden (Bridge Buster: keine Brücke
auffindbar), Flak-Stellungen und Panzer schwer erkennbar. Flugverhalten an Torpedo Bomber
angleichen, mehr Pitch und Bank." Nur `thunderbolt-europe.html` betroffen — `torpedo-carrier.html`
wurde in diesem Build nicht angefasst, BUILD-Nummer dort bleibt 112.

#### 1) Kein Menü-Button, Ton läuft bei Pause weiter — behoben

`togglePause()` hat vorher nur `state` umgeschaltet — kein Overlay, keine Audio-Aktion. `animate()`
hört zwar auf, `updateAudio()` aufzurufen, sobald pausiert ist, aber die Engine-Oszillatoren laufen
als echte WebAudio-Knoten auf der Hardware-Uhr, unabhängig von `requestAnimationFrame` — ohne
etwas, das die Lautstärke gegen 0 fährt, brummen sie einfach mit dem zuletzt gesetzten Pegel
weiter. Neues `#pauseMenu`-Overlay (gleiches Muster wie `#menu`/`#result`) mit „Resume"/„Back to
Menu"; `togglePause()` fährt jetzt zusätzlich `eng.master.gain` (der eine Gain-Knoten, durch den
schon jeder Motor-/Waffen-/Explosionssound läuft) per `setTargetAtTime` gegen 0 bzw. zurück auf
0.85. Neue `exitToMenuFromPause()` nach dem Vorbild von `torpedo-carrier.html`s `exitToMenu()`.
**Verifiziert** mit einer isolierten Node-Simulation (Mocks für `show`, `eng.master.gain`,
`actx.currentTime`, `buildMenu`): Pause dämpft, Resume stellt wieder her, Exit-to-Menu setzt
State/Overlays korrekt und dämpft ebenfalls. `torpedo-carrier.html` hat denselben zugrunde
liegenden Bug (auch dort verlässt `animate()` bei `ST.PAUSED` früh) — dort aber nicht gemeldet,
daher bewusst nicht angefasst (Scope-Disziplin).

#### 2) Bridge Buster: keine Brücke auffindbar — Ursache gefunden und behoben, aufwendigster Teil dieses Builds

**Root Cause, nicht geraten:** `buildRoads()` pflastert die Straße unabhängig von jeder Mission
durchgehend über den Fluss — `baseHRoad()`s „road stays up on the bridge"-Blend hält die Straße
absichtlich eben auf Brückenhöhe. Das eigentliche `bridge`-Missionsziel (`makeBridge()`, 17 m
breite Deckplatte) saß dabei nur 2 Einheiten über UND schmaler als diese immer vorhandene, 44 m
breite Straßen-Ribbon (plus Bankette) — von oben betrachtet verschluckt die immer vorhandene
Straße das eigentliche Bombenziel praktisch vollständig. Zusätzlich: `killTarget('bridge')`
hat nur die eigene, kleine Gruppe abgedunkelt/fallen lassen — die durchgehende Straße blieb
unangetastet, „Brücke zerstört" hatte also nie eine sichtbare Wirkung auf die Straße selbst.

**Fix — die Brücke ist jetzt permanentes Weltobjekt, kein Pro-Mission-Requisit:**
- Neue `findBridgeCrossing()` (deterministisch, keine Zufallszahl — dieselbe Straßen-/Fluss-Kurve
  jedes Mal) liefert den Kreuzungspunkt; `buildTerrain()` berechnet ihn zuerst (läuft vor
  `buildRoads()` im Start-Ablauf), `buildRoads()` nutzt denselben, bereits berechneten Wert.
- `makeWorldBridge()` baut eine echte, straßenbreite (48 m statt 17 m), 520 m lange Fachwerkbrücke
  **einmalig** in `buildRoads()` — permanentes Weltobjekt, in jeder Mission sichtbar, nicht nur
  in „Bridge Buster". Die Straßen-/Bankett-Ribbons bekommen an genau dieser Stelle eine echte
  Lücke (zwei separate Ribbon-Segmente statt einem durchgehenden).
- `spawnTarget('bridge',...)` hängt HP/Treffer-Erkennung jetzt an dieses **selbe** permanente
  Objekt statt eine eigene Kopie zu bauen; `clearWorld()` überspringt es beim Aufräumen
  ausdrücklich (sonst wäre es nach der ersten Bridge-Buster-Mission für immer aus der Szene
  verschwunden); `resetWorldBridge()` stellt Transformation/Material beim erneuten Missionsstart
  zurück auf intakt. Zerstören der Brücke wirkt jetzt tatsächlich auf die einzige, echte
  Brückenstruktur — die Straße zeigt sichtbar Schaden, nicht nur ein Nebengebilde.

**Drei Folgefehler, jeder erst durch echtes Rendern entdeckt, nicht durch Nachrechnen (Lektion 1):**
1. *Deck zu kurz für die geschnittene Lücke.* Erste Fassung: 360 m Länge. Gemessen: die
   geschnittenen Ribbon-Enden liegen (durch 100-m-Sampling plus `BRIDGE_GAP`) bis zu ~250 m vom
   Kreuzungspunkt entfernt — bei einer Fahrbahnneigung von bis zu 22° reichte 360 m nicht bis an
   beide Enden. Auf 520 m verlängert (deckt auch den ungünstigsten Neigungsfall mit Marge).
2. *Gelände sticht durch die Deckplatte.* Ein isolierter Headless-Render der Brücke allein war
   pixelsauber; im vollen Szenen-Render zeigte sich ein „zerrissenes" Deck. Ursache, per
   Elimination gefunden (Terrain raus → Riss weg, wieder rein → Riss wieder da): das Flusstal
   steigt binnen 100-150 m um 200+ Höhen-Einheiten an, und `dR`/`dRo`-Abstand-zur-Kurve-Checks
   waren dafür ungeeignet — abseits der exakten Kreuzungshöhe `z` laufen Fluss-/Straßenkurve vom
   festen, geraden Brücken-Footprint weg. Ersetzt durch eine echte Rechteck-Prüfung im lokalen
   Koordinatensystem der Brücke (`nearBridge()`, feste Länge/Breite statt Abstand-zur-Kurve) —
   robust unabhängig davon, wie die Kurven sich in der Nähe verhalten. **Nachgewiesen:** Feinraster-
   Scan sowohl der analytischen Höhe als auch der tatsächlichen Mesh-Grid-Vertices streng
   innerhalb des Brücken-Rechtecks ergibt exakt 46,0 überall, keine einzige Ausnahme.
3. *Fachwerk-Streben überlappten sich selbst (Z-Fighting).* Diagonal- und Vertikalstrebe saßen
   exakt am selben Mittelpunkt (zwei fast deckungsgleiche Boxen) — bei flachem Blickwinkel ein
   flackerndes Muster. Vertikalstrebe entfernt (reines Warren-Fachwerk, nur Diagonalen, dicker
   und mit weniger Elementen — liest sich aus der Luft genauso gut, kann sich aber nicht mehr
   überlappen). Zusätzlich: Pfeiler-Oberkante lag exakt auf Deck-Unterkante (Z-Fighting-Naht) —
   Pfeiler jetzt 1,5 m in die Deckplatte eingebettet statt nur berührend.

**Nebenfund, ebenfalls behoben:** `buildSettlement()`s Dorf-Platzierung (entlang der Straße
gestreut) konnte einen Weiler direkt auf die Kreuzung setzen — einzelne Häuser landeten dabei am
steilen Hang direkt neben der jetzt eingeebneten Brücke und wurden in wild unterschiedlichen
Höhen gerendert (sichtbar als chaotischer Häuserstapel in der Nähe der Brücke). Fix: dieselbe
`nearBridge()`-Prüfung wie beim Gelände, als Ausschlusszone analog zum bereits vorhandenen
Flugplatz-Ausschluss.

**Nachgewiesen, Methode:** Der komplette Ablauf (`buildTerrain(); buildRoads(); buildForests();
buildSettlement(); buildAirfield(); startMission(4);`) wortwörtlich aus der Datei extrahiert,
mit echtem `GLTFLoader`-freiem Headless-WebGL-Renderer (`gl`+`xvfb-run`) tatsächlich gerendert —
mehrere Kamerawinkel (Übersicht, Nahaufnahme, Anflug), dazwischen jeweils Zwischenbilder
angesehen, nicht nur Zahlen verglichen. Zusätzlich eine vollständige Lebenszyklus-Prüfung
(Node, keine Grafik nötig): Missionsstart → Ziel existiert und zeigt auf das permanente Objekt →
Treffer → sichtbar zerstört + `sortieKills.bridge` hochgezählt → Missionswechsel →
`clearWorld()` lässt das permanente Objekt in der Szene → erneuter Bridge-Buster-Start →
Ziel und Optik vollständig zurückgesetzt. Alle Prüfungen bestanden.

**Offen:** Nicht auf dem echten iPad geflogen. Aus einer extrem flachen, wasserspiegelnahen
Testkamera (deutlich tiefer als jede reale Anflughöhe) blieb ein leichtes perspektivisches
„Einschnüren" der Deckkontur sichtbar, das sich beim isolierten Brücken-Objekt (identische
Kamera, keine Umgebung) NICHT zeigt — vermutlich reine Parallaxe zwischen der jetzt flachen
Brücke und dem unmittelbar dahinter noch immer steil aufragenden, im Headless-Test texturlosen
(schwarzen) Hang, kein Geometriefehler. Aus den realistischeren Übersichts-/Anflug-Kamerawinkeln
war das nicht sichtbar. Sollte die Brücke im echten Spiel aus bestimmten Blickwinkeln noch immer
seltsam wirken, ist der nächste Schritt, denselben `nearBridge()`-Ausschluss probeweise noch
breiter zu ziehen — die aktuelle Breite (90 Einheiten Halbbreite) ist bereits deutlich über der
Deckbreite selbst.

Code: `thunderbolt-europe.html`, Suche nach `findBridgeCrossing`, `makeWorldBridge`, `nearBridge`,
`BRIDGE_GAP`, `BRIDGE_ROAD_FLAT`.

#### 3) Flak-Stellungen und Panzer schwer erkennbar — behoben

Dieselbe Erkenntnis wie beim Propeller-Kontrast-Fix (EU BUILD 29, siehe 4.18): realistische,
fast schwarze Tarnfarben lesen sich aus der Luft als formloser Fleck, egal wie korrekt die Form
darunter ist. Grundfarben von Panzer, Flak (leicht/schwer) und LKW spürbar aufgehellt (weiterhin
glaubwürdiges Oliv/Khaki, keine Comic-Farben), dazu je ein kleiner, echt glänzender Akzent
(Panzer-Luke, Geschützmündung) mit `MeshStandardMaterial` statt der sonst überall verwendeten
`MeshLambertMaterial` — nur eine Hochglanz-Fläche kann tatsächlich Sonnenlicht reflektieren, eine
noch so helle Lambert-Fläche nicht. **Verifiziert** mit einem Headless-Render aller vier
Fahrzeugtypen vor olivgrünem Testhintergrund — deutlich sichtbarer Kontrast gegenüber den alten,
fast schwarzen Tönen.

**Offen:** Nur gegen einen synthetischen Testhintergrund geprüft, nicht gegen die echte
Geländetextur (Node hat kein Canvas-2D-Backend, siehe 4.11/4.13/4.20 — dieselbe Einschränkung
wie immer). Falls die Ziele auf dem echten iPad immer noch zu dunkel wirken, ist der nächste
Hebel eine weitere Aufhellung derselben Farbwerte.

Code: `thunderbolt-europe.html`, Suche nach `function glint`.

#### 4) Rookie-Modus zu schwer — Ursache: EU-Schwierigkeitstabelle stimmte nicht mit der eigenen Behauptung überein

Der Code-Kommentar über `DIFFS` behauptete seit jeher „same three tiers as the carrier game" —
stimmte aber nicht: EU Rookie hatte `flak:0.55, dmg:0.6`, `torpedo-carrier.html`s Rookie hat
`flak:0.45, dmg:0.5` — EU-Rookie nahm 20-22 % mehr Schaden pro Treffer als das als Vorbild
genannte Original. Dieselbe Abweichung bei Veteran (1.0/1.0 vs. 0.80/0.8) und Ace (1.45/1.5 vs.
1.00/1.0) — EU war auf JEDER Stufe härter als sein eigenes erklärtes Vorbild. `flak`/`dmg` jetzt
exakt an `torpedo-carrier.html`s `DIFFS` angeglichen; `aim` (EU-eigenes Feld, kein Gegenstück im
Trägerspiel) und `fuel` (andere Verbrauchsformel, nicht Teil der Beschwerde) unverändert.
**Verifiziert:** Werte direkt aus beiden Dateien gegenübergestellt, `flak`/`dmg` jetzt
identisch. `damagePlayer()` wird über den gemeinsamen `updateTracers()`-Pfad sowohl von
Flak-Treffern als auch von Jäger-MG-Feuer aufgerufen (beide landen im selben `tracers[]`-Array)
— die Korrektur wirkt also auf beide Schadensquellen, nicht nur auf Flak-Direkttreffer.

Code: `thunderbolt-europe.html`, Suche nach `const DIFFS`.

#### 5) Flugverhalten an Torpedo Bomber angleichen, mehr Pitch/Bank — größtenteils bereits deckungsgleich, Grenzen angehoben

Zeile für Zeile mit `torpedo-carrier.html`s `updateFlight()` verglichen: Federschwinger-Formel,
`pitchRate`/`rollRate`-Multiplikatoren (2,0/4,8) und `zeta` (0,80) sind bereits identisch, beide
Dateien verweisen im Kommentar bereits aufeinander. Verbleibende Unterschiede sind bewusst und
begründet, keine Bugs: `TURN_K`/`TURN_CEIL` unterscheiden sich (EU auf die tatsächlich geflogene
Geschwindigkeit von 167 m/s getunt statt der Trägerspiel-typischen 105 m/s, siehe 4.22 — bei einer
1/v-Formel ein Faktor 1,6, nicht weglassbar) und das Pitch-Ziel (EU: `inputPitch*pitchLim*0.92`
statt der Trägerspiel-Konstante 0,55) — ausdrücklich damit begründet, dass ein Erdkampfflugzeug
nach einem Tiefangriff steil hochziehen muss, während das Trägerspiel absichtlich einen sanfteren
Anflug betont.

Für „mehr Pitch und Bank": `rollLim` lag mit 1,50-1,52 rad bereits so weit über dem Punkt, an dem
`gLim` die Kurvenrate begrenzt (`1/cos(rollLim)` ≈ 19-20, das 3-4-fache jedes `gLim`-Werts hier),
dass ein Anheben NICHTS an der Kurvenrate ändert — `gLim` bleibt die eigentliche Grenze (exakt die
in 4.19/4.20 dokumentierte Lektion: nicht `rollLim` öffnen, wenn `gLim` längst greift). Trotzdem
angehoben (auf 1,56 rad ≈ 89°, praktisch beliebig, da folgenlos für die Balance) — die Beschwerde
war die MÖGLICHE Querlage, nicht die Kurvenrate. `pitchLim` dagegen ist eine reine
Gameplay-Entscheidung ohne physikalische Kopplung an `gLim` und war mit 55-62° spürbar knapper als
das Trägerspiel-Vorbild (SBD 73°) — auf 66-72° angehoben, je nach Baumuster weiterhin
unterschiedlich (P-47 am knappsten, Bf 109 am großzügigsten, spiegelt die bisherige relative
Charakteristik).

**Verifiziert:** Node-Simulation mit den tatsächlich verbauten `AC`-Werten bestätigt für alle drei
Baumuster: `1/cos(rollLim)` bleibt weit über `gLim` (rollLim also weiterhin folgenlos für die
Kurvenrate), Vollkreis-Zeit bei 167 m/s unverändert bei 8,1-8,2 s (keine Regression durch die
`rollLim`-Anhebung).

**Offen:** Nicht auf dem echten iPad geflogen. Falls sich „mehr Bank" trotzdem nicht spürbar
anfühlt, liegt das daran, dass `rollLim` schon vorher nicht der limitierende Faktor war — der
tatsächlich spürbare Hebel für „aggressiver kurven" wäre `gLim` selbst anzuheben, nicht `rollLim`.

Code: `thunderbolt-europe.html`, Suche nach `rollLim:` im `AC`-Objekt.

---

### 4.24 Carrier-Pause-Ton, B-17-Fahrwerk, echte Gebäudeformen, Atoll-Bäume — BUILD 113 / EU BUILD 35

Nutzer: „Bugs und Grafik zuerst bitte", aus einer zuvor selbst vorgeschlagenen Liste offener
Punkte. Vier Themen, zwei Dateien.

#### 1) `torpedo-carrier.html`: derselbe Pause-Ton-Bug wie EU BUILD 34 — behoben

Exakt dieselbe Ursache wie beim Thunderbolt-Fix (siehe 4.23/1): `animate()` verlässt sich bei
`ST.PAUSED` früh und erreicht `updateAudio()` nie, aber die Engine-Oszillatoren laufen auf der
WebAudio-Hardware-Uhr weiter. Anders als bei EU gab es hier schon ein echtes Pause-Overlay
(`showOverlay('pause')`/`resumeGame()`/`exitToMenu()`) — nur die Ton-Dämpfung fehlte. Dieselbe
`eng.master.gain.setTargetAtTime(...)`-Technik in `togglePause()`, `resumeGame()` und
`exitToMenu()` ergänzt. **Verifiziert** mit einer isolierten Node-Simulation (die drei Funktionen
per Klammerzählung extrahiert, `eng`/`actx`/`ST` gemockt): Pause dämpft auf ~0, Resume und
Exit-to-Menu stellen 0,85 wieder her.

Code: `torpedo-carrier.html`, `togglePause()`, `resumeGame()`, `exitToMenu()`.

#### 2) B-17-Fahrwerk — Ursache neu vermessen, echte Ursache war etwas anderes als 4.4 vermutete

**Erster eigener Fehler bei der Untersuchung, gleich selbst gefunden:** ein erster Messversuch
mit `o.localToWorld(v); root.worldToLocal(v)` (derselbe Umweg wie in `cutBlades`, das ihn
braucht, weil `prop` root-lokal gemessen wird) lieferte für die B-17 nur 6 statt der tatsächlichen
867 Vertices unter der Bodenlinie — `whole`/`floor` in `rigModel()` sind aber, wie die bereits
vorhandene Objekt-Klassifizierung direkt daneben, in WELTKOORDINATEN. Der zusätzliche
`worldToLocal`-Schritt hat beides vermischt (exakt Lektion 2). Nach der Korrektur (reines
`localToWorld`, konsistent mit dem Rest der Funktion) fand die Messung die drei echten Räder.

**Tatsächlicher Befund am echten `b17.glb`:** wie beim Propeller sind die Räder in dieselbe
riesige Rumpf/Flügel-Mesh eingeschweißt wie der Rest des Flugzeugs (nur 7 Meshes insgesamt für
das ganze Modell) — die Objekt-Größenklassifizierung verwirft dieses Mesh zurecht (seine eigene
Bounding-Box ist das ganze Flugzeug). Neue, generische Funktion `findGearClusters()` (nach dem
Vorbild von `findProp`): Vertices unter der Bodenlinie bilden 5 räumlich getrennte Klumpen, nicht
3 — zwei davon (455 und 277 Punkte) sind die Kugelturmhalterung und eine Heckstruktur, keine
Räder, und liegen bei ähnlichem Radius wie die echten Räder (62/57/12 Punkte), Radius allein
trennt sie also nicht. Die PUNKTZAHL trennt sauber: ein Rad ist eine einfache Scheibe an einer
Strebe, ein Geschützturm hat Kanzel-/Waffen-Detailgeometrie und damit weit höhere Dichte für
einen ähnlich großen Klumpen. Grenze bei `n<=100` gesetzt — deutlich über den echten Rädern,
deutlich unter dem Turm. Gefundene, vertrauenswürdige Klumpen (2-5, symmetrisch/plausibel
verteilt) werden per `cutGearClusters()` entfernt — dieselbe Index-Degenerierungs-Technik wie
`cutBlades`, mit iterativ wachsendem Radius und einer „stillThere"-Abbruchprüfung, weil ein
Rad-an-Strebe keine glatte Scheibe ist und ein einzelner Radius-Durchlauf beim Fw190-Test (siehe
unten) nur einen Bruchteil traf.

**Wichtige Korrektur zur ursprünglichen 4.4-Diagnose:** „doppeltes Fahrwerk sichtbar" war so nie
ganz richtig. `gr.visible=false` wird für JEDES KI-Flugzeug direkt nach dem Bauen gesetzt (die
B-17 fliegt nur als KI/Bomber-Ziel, nie spielbar) — das synthetische `buildGear()`-Fahrwerk war
also im Spiel nie sichtbar. Sichtbar war stattdessen NUR das echte, eingeschweißte Fahrwerk,
UNVERÄNDERLICH ausgefahren — die B-17 flog immer mit sichtbar heruntergelassenen Rädern, auch im
Reiseflug. Nach dem Fix hängt das echte Fahrwerk (jetzt aus der Mesh geschnitten) an der `gear`-
Gruppe, die dieselbe `gr.visible=false`-Logik korrekt greifen lässt.

**Nebenfund, damals nicht angefasst, seit EU BUILD 36 behoben:** derselbe Test an P-47 und
Fw190 zeigte, dass auch DIESE spielbaren Flugzeuge ihr eigentliches, eingeschweißtes Fahrwerk
permanent sichtbar hatten, zusätzlich zum synthetischen (beim Spieler-eigenen Flugzeug wird nur
die synthetische Gruppe per `P.gear` ein-/ausgeblendet — das echte Fahrwerk blieb beim Einfahren
sichtbar). Die vertexdichte-basierte Erkennung aus diesem Build war dafür zu unsicher (siehe
4.25) — der Fix, der P-47 und Fw190 tatsächlich abdeckt, ist dort beschrieben.

**Regressionscheck:** B-24 nutzt bereits erfolgreich den bestehenden „own gear"-Pfad (eigenes
Fahrwerk als trennbares Objekt gefunden) — mein neuer Code läuft für sie gar nicht erst.
Bf 109 ebenso (schon vorher „own gear"). P-47/Fw190 werden vom neuen Code geprüft, aber die
Klumpen-Erkennung liefert dort zu viele/zu große Klumpen und bleibt (korrekt) untätig — bestätigt
per Vorher/Nachher-Vergleich der `rig`-Log-Zeile, unverändert „built gear" ohne Schnitt.

**Nachgewiesen am echten Modell:** `readVert`, `findProp`, `cutBlades`, `buildGear`,
`findGearClusters`, `cutGearClusters`, `rigModel` wortwörtlich aus der Datei extrahiert, gegen
echtes `b17.glb` mit echtem `GLTFLoader` r128 und echtem headless-WebGL-Renderer ausgeführt.
Vorher: Räder an beiden Triebwerksgondeln UND am Heck deutlich sichtbar (Nahaufnahme-Screenshot).
Nachher: dieselbe Nahaufnahme zeigt eine saubere Gondel-Unterseite ohne jedes Rad; eine
Gesamtansicht der Unterseite zeigt keinen einzigen der drei Radpositionen mehr. Der Kugelturm
(absichtlich nicht geschnitten) bleibt sichtbar, mit einigen dünnen, degenerierten Restdreiecken
in seiner Nähe (vermutlich ein teilweise geschnittener Heckrad-Strebenrest) — nur bei extremer
Nahaufnahme auf dem Bauch sichtbar, aus normaler Flughöhe nicht relevant.

**Offen:** Nicht auf dem echten iPad geflogen. Der P-47/Fw190-Nebenfund (oben) ist ein
eigenständiges, noch offenes Thema.

Code: `thunderbolt-europe.html`, Suche nach `findGearClusters`, `cutGearClusters`, `rigModel`.

#### 3) Echte Gebäudeformen statt reiner Boxen — ein erster Schritt

Aus 4.12/4.14 als „nächster, größerer Schritt" offen gelassen. Jedes Haus bestand aus genau zwei
Boxen (Wand-Quader, Dach-Prisma) — nichts, was ein Haus von einem Container unterscheidet. Zwei
weitere `InstancedMesh`es (Kamin, Tür) ergänzt — bei Tausenden Häusern weiterhin nur vier
Draw-Calls insgesamt für die ganze Siedlung, nicht vier pro Haus. Kamin und Tür werden im
LOKALEN Koordinatensystem jedes Hauses platziert (`toWorld()`-Hilfsfunktion, dieselbe
Rotationsmatrix, die Wand und Dach schon verwenden) und dann in Weltkoordinaten umgerechnet,
statt die zufällige Rotation jedes Hauses zu ignorieren.

**Ein eigener Messfehler unterwegs, durch Rendern gefunden statt geraten:** die erste Kamin-Höhe
(`h*0.55` bis `h*0.85`, also 55-85 % der GESAMTEN Haushöhe) ergab beim Rendern Kamine, die höher
als das Haus selbst waren — wie Getreidesilos, nicht wie Kamine. Korrigiert auf eine feste,
kleine Höhe (1,0-2,4 Einheiten, unabhängig von der Haushöhe) — ein echter Kamin überragt den
First um ein bis zwei Meter, nicht um einen Großteil der Firsthöhe.

**Nachgewiesen:** Headless-Render eines echten, aus `buildTerrain()+buildRoads()+
buildSettlement()` erzeugten Hauses aus mehreren Blickwinkeln — Kamin sitzt jetzt maßstäblich
neben dem First, Tür sitzt flach auf einer Wandfläche.

**Offen:** Nicht auf dem echten iPad geflogen. Fensterreihen, echte L-förmige Grundrisse oder
unterschiedliche Dachformen sind größere, hier nicht angegangene Schritte.

Code: `thunderbolt-europe.html`, `buildSettlement()`, Suche nach „two boxes - a wall block".

#### 4) Atoll-Bäume zu nah am Lagunenrand — Ursache gefunden, behoben

Aus 4.13 als kosmetischer, seit vor BUILD 106 bestehender Nebenfund offen gelassen. Ursache
nachgerechnet, nicht geraten: die Atoll-Höhenfunktion ist ein Gaußsches Riff-Band um `dd≈0,78`
(Bruchteil des Inselradius) mit einem harten Sprung an der Lagunengrenze `dd=0,72`. Die
Baum-Platzierung prüfte nur absolute Höhe (`h` zwischen 3,2 und `peak*0.8`) und lokale Steigung
an zwei Abtastpunkten (+3 Einheiten in x/z) — durchgerechnet reicht der gültige Höhenbereich
aber bis `dd≈0,42` hinunter, weit auf die Lagunenseite, und die Steigungsprüfung erkennt den
harten Sprung an der exakten Grenze nicht zuverlässig, weil ihre beiden Abtastpunkte ihn nicht
zwangsläufig einschließen. Fix: eine explizite Mindestdistanz zur Lagunengrenze
(`dd<0,72+0,06` → verwerfen), nur für `atoll`-Inseln.

**Nachgewiesen:** `buildIsland()` wortwörtlich extrahiert, gegen eine echte Atoll-Insel
(Radius 175, wie in `buildIslands()` tatsächlich verwendet) ausgeführt, alle 240 platzierten
Baum-Positionen aus der `InstancedMesh` zurückgelesen. Vorher (durchgerechnet, nicht separat
gerendert): gültiger Bereich reicht bis `dd≈0,42`. Nachher: minimaler gemessener Abstand unter
allen 240 Bäumen `dd=0,7807` — kein einziger Baum unter der 0,78-Grenze, keiner in der Lagune.
Zusätzlich ein Übersichts-Render bestätigt einen sauberen Baumring um das Riff, ohne Bäume in
der Lagunenmitte.

**Offen:** Nicht auf dem echten iPad geflogen. Nur die zweite verwendete Atoll-Größe (Radius 150)
nicht separat gerendert, aber derselbe Code, keine größenabhängige Fallunterscheidung.

Code: `torpedo-carrier.html`, `buildIsland()`, Suche nach „grew right up to the atoll's inner
lagoon edge".

---

### 4.25 P-47/Fw190: echtes Fahrwerk bleibt beim Einfahren sichtbar — EU BUILD 36

Nutzer: „Ok, verbessere weiter" — Fortsetzung des in 4.24/2 als Nebenfund notierten, damals
bewusst nicht angefassten Punkts: P-47 und Fw190 haben (wie die B-17) ihr echtes Fahrwerk in die
Rumpf/Flügel-Mesh eingeschweißt, aber anders als die B-17 wird ihr synthetisches Fahrwerk beim
Spieler-eigenen Flugzeug tatsächlich per `P.gear` sichtbar geschaltet — das eingeschweißte,
echte Fahrwerk bleibt beim Einfahren aber trotzdem sichtbar, weil nichts es je der `gear`-Gruppe
zugeordnet hat.

**Erster Ansatz (die vertexdichte-basierte Erkennung aus EU BUILD 35) hat nicht funktioniert —
neu vermessen statt nachgebessert:** Der `n<=100`-Schwellenwert war an der B-17 kalibriert. Am
echten `p47new.glb`/`fw190.glb` neu gemessen: deren Räder haben selbst MEHR Vertices (232/226
bzw. 89/89) als die B-17-Turmstruktur, die der Schwellenwert eigentlich ausschließen sollte —
der gleiche Wert schloss also entweder die echten Räder mit aus oder ließ, gelockert, Kühlerklappen-
und Kanonenschacht-Klumpen mit rein. Radius half ebensowenig — Rad- und Störklumpen liegen in
derselben Größenordnung.

**Tatsächlich robustes Signal: seitliche Spiegelsymmetrie.** Das Hauptfahrwerk ist an jedem
dieser Flugzeuge ein Paar — zwei Klumpen, die in y, z, Radius UND Punktzahl übereinstimmen und
sich nur im Vorzeichen von x unterscheiden. Dass zwei Kandidaten in fünf Zahlen gleichzeitig
übereinstimmen, ist praktisch nie Zufall — kein Modell-spezifischer Schwellenwert nötig.
`findGearClusters()` sucht jetzt genau dieses Spiegelpaar (`a.cx*b.cx<0`, |x|-Differenz klein,
z/y innerhalb einer Toleranz) statt über Punktzahl zu filtern. Ein einzelnes Bug-/Spornrad wird
bewusst NICHT gesucht — jeder Versuch, einen dritten, mittig sitzenden Klumpen dazuzunehmen, traf
auf denselben Flugzeugen auch echte Rumpfdetails (Lüftungsschächte, Kanonenschacht, Mastfuß) statt
nur das Rad. Verzichtet, statt zu raten — das Hauptfahrwerk ist ohnehin die optisch dominante
Komponente.

**Ein eigener Debugging-Umweg, aus Gründlichkeit dokumentiert:** Ein Zwischenstand zeigte für die
B-17 auf einmal `cutN=0` — kein Regressionsverdacht bestätigte sich beim Nachmessen: Der Propeller
dieses vierblütigen Bombers sitzt (anders als bei einem Einmotorer) an EINEM der Flügelmotoren, in
unmittelbarer Nähe des Hauptfahrwerks in derselben Gondel. `cutBlades()`s eigener, mehrstufig
aufweitender Schnitt (bis zum 2,2-fachen Radius) hatte die Radgeometrie dort bereits als
Kollateralschaden mitentfernt, bevor der Fahrwerk-Schnitt überhaupt lief — `cutGearClusters()`
fand deshalb zu Recht nichts mehr zu tun (bereits entartete Dreiecke werden übersprungen, damit
kein doppelter Schnitt zählt). Am Rendering bestätigt: die B-17 zeigt weiterhin keine Räder, nur
eben durch einen anderen Mechanismus als beabsichtigt. Kein Fix nötig, aber der Fund zeigt: auf
mehrmotorigen Flugzeugen können Propeller- und Fahrwerksschnitt sich überschneiden — bei einem
zukünftigen Modell, bei dem das nicht der Fall ist, greift jetzt trotzdem `findGearClusters()`
selbst.

**Nachgewiesen am echten Modell:** `readVert`, `findProp`, `cutBlades`, `makeProp`,
`findGearClusters`, `cutGearClusters`, `rigModel` wortwörtlich extrahiert, gegen echte
`p47new.glb`/`fw190new.glb`/`b17.glb` mit echtem `GLTFLoader` r128 und echtem headless-WebGL-
Renderer ausgeführt, `gear`-Gruppe wie im echten Spiel unsichtbar geschaltet. P-47: 37 Dreiecke
geschnitten, Seitenansicht vorher/nachher zeigt das Rad verschwunden. Fw190: 2812 Dreiecke
geschnitten, gleiches Ergebnis. **Regressionscheck:** B-24 und Bf 109 laufen weiterhin über den
bereits erfolgreichen „own gear"-Pfad und erreichen den neuen Code gar nicht; an beiden real
gegengeprüft, dass `findGearClusters()` zwar (harmlos) ein Klumpenpaar findet, dieser Codepfad in
`rigModel()` aber nie aufgerufen wird, weil die Objekt-Klassifizierung vorher schon greift.

**Offen:** Nicht auf dem echten iPad geflogen. Bug-/Spornrad bleibt bei allen drei betroffenen
Baumustern weiterhin sichtbar (bewusste Entscheidung, siehe oben) — deutlich kleiner und weniger
auffällig als die jetzt entfernten Hauptfahrwerksräder.

Code: `thunderbolt-europe.html`, `findGearClusters()`, Suche nach „laterally MIRRORED PAIR".

---

### 4.26 Thunderbolt: Wolken hinzugefügt, dabei ein schwerer, alter Bug gefunden — Straße/Schiene/Ufer waren nie sichtbar — EU BUILD 37

Nutzer: „Mach weiter, diesmal mit der Grafik des Spiels. Und eventuell kannst du die Missionen
verbessern?" Grafik zuerst angegangen. `torpedo-carrier.html` diente als Vorlage-Vergleich
(Wolken, Himmelskuppel) — dabei aufgefallen: `thunderbolt-europe.html` hatte **überhaupt keine
Wolken**, ein auffälliger, leerer Himmel in einem Flugspiel. Beim Verifizieren des Wolken-Ports
per Rendertest wurde daraus ein deutlich größerer Fund.

#### 1) Wolken — neu eingebaut, nach dem bewährten Vorbild aus `torpedo-carrier.html`

`buildClouds()`/`updateClouds()` 1:1 nach dem Muster von `torpedo-carrier.html`s gleichnamigen
Funktionen übernommen: Billboard-Sprites mit weicher Radial-Gradient-Textur (`makeSoftSprite()`),
mehrere Sprites pro Wolkengruppe, ein fester Pool (40 Wolken), der um die Spielerposition
gekachelt wird (`updateClouds()`, ±5000 Einheiten Toleranzfenster). Neu gegenüber der Vorlage:
`applyWeather()` blendet nur einen Teil des Pools ein (`clear`:16, `haze`:26, `rain`:34,
`storm`:40) und färbt die restlichen um (heller bei Klarwetter, dunkler/grauer bei Sturm) statt
bei jedem Wetterwechsel neu zu bauen — passend zu diesem Spiel, das (anders als das Trägerspiel)
bereits ein Wettersystem mit mehreren Stufen hat.

**Verifiziert:** `buildClouds`/`updateClouds`/`applyWeather` wortwörtlich extrahiert, mit echtem
`GLTFLoader`-freiem Headless-WebGL-Renderer ausgeführt: 40 Wolken gebaut, `storm` zeigt 40
sichtbar, `clear` zeigt 16 sichtbar (exakt die konfigurierten Werte), Sprite-Gruppen rendern an
den erwarteten Positionen. Die volle Aufbaukette (`buildTerrain(); buildRoads(); buildForests();
buildSettlement(); buildAirfield(); buildRain(); buildClouds(); applyWeather();`) läuft
fehlerfrei durch.

#### 2) Der eigentliche Fund: Straße, Schiene, Bankette und Fluss waren nie sichtbar — falsche Dreiecks-Wicklung

Beim isolierten Rendertest des Fluss-Ufers (derselbe Nachweis-Standard wie immer: Objekt allein
in einer Szene, mehrere Kamerawinkel, greller Kontrast-Hintergrund) zeigte sich: **nichts**
zeichnete sich, aus keinem Winkel, keiner Entfernung, auch nicht direkt von oben mit sattem
Magenta dahinter. Das widerlegte sofort die erste Vermutung (Material/Beleuchtung) — bei einem
Renderfehler dieser Art (komplett unsichtbar, unabhängig vom Blickwinkel) ist die nächste Frage
immer: wird das Objekt überhaupt gezeichnet, nicht: sieht man es schlecht.

`geometry.boundingSphere` war tatsächlich `null` (nie berechnet — `computeBoundingSphere()` wird
von Three.js nur lazy in `raycast()` aufgerufen, nie fürs Rendern), das allein erklärte aber nicht
die Unsichtbarkeit aus JEDEM Winkel inklusive direkt von oben mit riesigem `frustumCulled=false`.
Der eigentliche Befund kam aus dem Messen der Flächennormalen (`computeVertexNormals()`s
Ausgabe): **konsequent −Y, überall auf dem Ufer-Mesh** — jede Dreiecksfläche zeigt nach unten,
weg von jeder Kamera, die (wie in diesem Spiel immer) über dem Wasser fliegt. Bei einem
Standard-Material (`side: THREE.FrontSide`, das Three.js-Standardverhalten, hier nirgends
überschrieben) wird eine Fläche, deren Normale von der Kamera weg zeigt, grundsätzlich nie
gezeichnet — unabhängig von Blickwinkel oder Abstand, weil das Kriterium nicht „wie schräg schaut
man drauf", sondern „auf welcher Seite der Fläche steht die Kamera" ist. Die Kamera steht in
diesem Spiel nie unter dem Wasserspiegel.

**Nachgerechnet, welche Dreiecks-Wicklung das ergibt:** Sowohl `buildWater()`s eigene
Index-Konstruktion als auch die von `roadMesh`/`railMesh`/den Banketten geteilte `ribbon()`-
Hilfsfunktion bauen ihre Dreiecke identisch: `idx.push(a,a+1,a+2, a+1,a+3,a+2)` über einen Pfad,
der stur in eine Richtung durchnummeriert wird (Fluss: `z` von `-WORLD/2` aufwärts; Straße: `x`
von `-WORLD/2` aufwärts). Handrechnung mit konkreten Testpunkten (einmal Pfadrichtung +Z, einmal
+X) ergab in BEIDEN Fällen dieselbe Kreuzprodukt-Normale: `(0,-200,0)` — die Wicklung ist so
gebaut, dass sie unabhängig von der tatsächlichen Pfadrichtung immer nach unten zeigt. Das
bedeutet: **nicht nur der Fluss** — auch Straße, Bankette UND Bahnlinie, die alle über dieselbe
`ribbon()`-Funktion laufen, haben exakt dieselbe falsche Wicklung. Am ausgelieferten Code
gemessen (nicht nur hergeleitet): Fluss-Normale `(0,1,0)*-1`, Straßen-Normale `(−0.05,−0.998,
−0.02)`, Schienen-Normale `(−0.16,−0.986,0.03)` — alle drei nahezu exakt −Y.

**Tragweite:** Straße, Bahnlinie, Bankette und Fluss — praktisch die gesamte „Infrastruktur"-
Ebene des Geländes — waren seit es `ribbon()`/`buildWater()` in dieser Form gibt, in JEDER
Mission, aus JEDEM Kamerawinkel unsichtbar, unabhängig vom iPad, unabhängig vom Wetter. Das
erklärt einen Teil der in 4.11 vage beschriebenen „Terrain wirkt schwach" — dort wurde nach
Materialglanz gesucht, aber ein komplett fehlendes Straßennetz wäre die naheliegendere Erklärung
gewesen, wurde aber nie gerendert und daher nie bemerkt (Lektion 1: kein Test zählt, der nicht
wirklich rendert).

**Fix:** Wicklung in `ribbon()` UND in `buildWater()`s eigener Kopie von `a,a+1,a+2, a+1,a+3,a+2`
auf `a,a+2,a+1, a+1,a+2,a+3` gedreht (jedes Dreieck einmal umgekehrt bestückt) — kehrt die
Normale nach +Y, ohne eine einzige Position zu verändern. `waterMesh.frustumCulled=false` (die
`boundingSphere`-Absicherung) bleibt zusätzlich bestehen, als günstige, unabhängige Absicherung.

**Nachgewiesen, vorher/nachher:** Normalen-Messung am ausgelieferten Code vor dem Fix (−Y bei
Fluss, Straße, Schiene) und danach (+Y bei allen dreien, exakt `(0,1,0)` beim Fluss). Isolierter
Rendertest des Wasser-Meshes: vorher 0 von 480.000 Pixeln nicht-Magenta bei drei verschiedenen
Kamera-Setups (nah, weit, senkrecht von oben); nachher 112.281–240.130 Pixel nicht-Magenta bei
denselben drei Setups — das Ufer füllt jetzt einen plausiblen Teil des Bildausschnitts. Isolierter
Rendertest der Straße (senkrecht von oben, echte Terrain-/Straßengeometrie): vorher 0, nachher
12.475 nicht-Magenta-Pixel mit einer erkennbar straßenfarbenen Fläche. Die komplette
Aufbau-Kette (`buildTerrain(); buildRoads(); buildForests(); buildSettlement(); buildAirfield();
buildRain(); buildClouds(); applyWeather();`) läuft danach weiterhin fehlerfrei durch, keine
Regression an den bereits bestehenden Meshes.

**Offen:** Nicht auf dem echten iPad geflogen. Die Farbgebung selbst (wie hell Straße/Wasser unter
der tatsächlichen Spiel-Beleuchtung wirken) konnte im Prüfstand nur mit einer vereinfachten
Test-Beleuchtung bestätigt werden, nicht mit der echten Szenen-Beleuchtung aus `init()` — das ist
aber ein rein kosmetisches Folgethema, kein Sichtbarkeits-Bug mehr. Die Himmelskuppel aus
`torpedo-carrier.html` (`buildSky()`) wurde in dieser Runde nicht portiert — zurückgestellt
zugunsten des Wolken- und Sichtbarkeits-Fixes; falls der Himmel im Vergleich zum Trägerspiel
weiterhin schlicht wirkt, ist das der nächste Schritt. Missionen (vom Nutzer als „eventuell"
zweitrangig genannt) sind nicht Teil dieser Runde.

Code: `thunderbolt-europe.html`, Suche nach `buildClouds`, `updateClouds` (neu); `ribbon()` und
`buildWater()`, Suche nach „Wound so the face normal points +Y".

---

### 4.27 Torpedo Carrier: Missionen falsch nummeriert (7 → 9 → 10 → 8) — BUILD 114

Nach dem Grafik-Fund (4.26) auf Wunsch des Nutzers weiter zum „eventuell"-Nebenpunkt Missionen:
`MISSIONS`-Array in beiden Dateien durchgesehen. `thunderbolt-europe.html`s zehn Sorties sind in
Array- und Anzeige-Reihenfolge bereits durchgehend 1–10. `torpedo-carrier.html` nicht: die letzten
drei Einträge im Array trugen die Titel „Sortie 9", „Sortie 10", „Sortie 8" — in genau dieser
Reihenfolge. Jeder andere Missionstitel im Array stimmt exakt mit seiner Array-Position überein;
dieses Trio war die einzige Ausnahme.

**Tragweite, nicht nur kosmetisch:** Die Missionsauswahl-Chips (`setupUIButtons()`) werden per
`MISSIONS.forEach((m,i)=>...)` in exakter Array-Reihenfolge gebaut, und `missionTag(m)` liest die
angezeigte Nummer direkt per Regex aus `m.title` — die Chips zeigten also sichtbar „…7, 9, 10, 8".
Schwerwiegender: bei einem Sieg springt `resultBtn.onclick` per `startMission(mission+1)` strikt
zur nächsten ARRAY-Position, nicht zur nächsten Nummer — wer „Sortie 7" gewann, landete direkt in
der als „Sortie 9" beschrifteten Mission, „Sortie 8" kam danach zuletzt.

**Ursache der Verwechslung geklärt, nicht nur der Reihenfolge nach behoben:** Zwei mögliche Fixes
standen zur Wahl — das letzte Array-Element (Titel „Sortie 8", `defend:true, raiders:6`,
„The Last Stand") an seine nummerisch korrekte Position VOR die beiden SBD-Missionen verschieben,
oder alle drei Titel umnummerieren und die Array-Reihenfolge unangetastet lassen. Gegen das
Verschieben spricht der Fließtext dieser Mission selbst („this is what the whole cruise comes
down to") UND der Code: `const last=mission>=MISSIONS.length-1;` behandelt exakt das letzte
Array-Element als Ende des Kriegseinsatzes (nach einem Sieg dort beginnt die Kampagne wieder bei
Sortie 1). Beides zusammen macht klar: die Array-Position (ganz am Ende) war immer richtig
gemeint, nur die Zahl im Titel war es nicht. Fix: die drei Titel korrekt durchnummeriert
(„Sortie 9"→„Sortie 8", „Sortie 10"→„Sortie 9", „Sortie 8"→„Sortie 10") — Array-Reihenfolge,
Schwierigkeitskurve und welche Mission tatsächlich gespielt wird bleiben komplett unverändert,
nur die angezeigte/gedruckte Nummer stimmt jetzt mit der Spielreihenfolge überein. Ein alter
Code-Kommentar an anderer Stelle (`startMission()`, Ladeout-Reihenfolge-Fix), der die beiden
SBD-Missionen noch bei ihren alten Nummern („sortie 9"/„Sortie 10") nannte, wurde mit umformuliert
(neutral „the first/next SBD sortie" statt einer Nummer), damit er nicht erneut veraltet.

**Verifiziert:** `MISSIONS`/`missionTag` wortwörtlich aus der Datei extrahiert und ausgeführt
(Node, keine Grafik nötig — reine Datenstruktur/Logik-Prüfung nach Abschnitt 6, unterer Teil):
Anzeige-Reihenfolge jetzt lückenlos `FF, Q, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10`, `MISSIONS.length-1`
zeigt weiterhin auf „Sortie 10 · The Last Stand" (den beabsichtigten Kampagnen-Abschluss).
`localStorage`-Kompatibilität geprüft: `bestScore()`/`saveBest()` hängen an einem einzigen
festen Schlüssel `tc_best`, nicht an Missionstiteln — bestehende Spielstände sind von der
Umbenennung nicht betroffen.

**Offen:** Nicht auf dem echten iPad gespielt.

Code: `torpedo-carrier.html`, `const MISSIONS = [...]`, die letzten drei Einträge (Suche nach
„These last three used to be titled 9, 10, 8").

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
8. **Eine Unmöglichkeits-Behauptung im eigenen Kommentar ist eine Hypothese, keine Tatsache.**
   „Der Propeller ist eingeschweißt und bleibt eingeschweißt" stand drei Sitzungen lang als
   gesichert im Code und in 3.1 — begründet mit drei Fehlschlägen, die alle POSITIONEN anfassten.
   Niemand hatte den Index-Buffer probiert: drei gleiche Indizes ergeben ein Dreieck ohne Fläche,
   ganz ohne Positionen anzurühren. **Wenn eine Sperre auf „X ist unmöglich" lautet, prüfe, welche
   Annahme alle gescheiterten Versuche geteilt haben** — hier: „entfernen heißt Punkte bewegen".
9. **Wenn eine Reparatur wiederholt fehlschlägt, das Vorgehen wechseln, nicht die Parameter.**
   Der Propeller-Fall brauchte drei grundverschiedene Ansätze (Objekt suchen → Geometrie
   schneiden → Geometrie zudecken), bevor einer ohne Nebenwirkungen funktionierte.
10. **„Physikalisch korrekt" ist kein Qualitätsnachweis — das Spiel muss spielbar bleiben.**
   BUILD 104 ersetzte die Arcade-Kurvenformel durch die Lehrbuchformel. Die Formel war richtig,
   die Zahlen stimmten, die Verifikation „bestand" — und die Kurve wurde bei normaler Querlage
   15× langsamer, ein Vollkreis dauerte 66 statt 4,5 Sekunden. Drei Builds lang wurde an
   `rollLim`, `pitchRate` und `ζ` geschraubt, ohne die eigentliche Ursache zu treffen.
   **Vor jeder Änderung am Flugmodell die spürbare Größe ausrechnen, nicht nur die Formel:**
   Wie lange dauert ein Vollkreis? Wie schnell reagiert der Knüppel? Diese Zahlen mit dem
   VORHERIGEN Zustand vergleichen — eine Größenordnung Unterschied ist ein Alarmsignal,
   auch wenn die neue Formel „richtiger" ist.
11. **Symmetrie messen, nicht ansehen.** Der „drehende sich nicht"-Propeller wurde zweimal als
   Farbproblem fehldiagnostiziert. Die Ursache war ein sechsfach symmetrisches Muster: bei 60°
   Drehung ein pixelweise IDENTISCHES Bild (Differenz 0,00). Bei „bewegt sich nicht"-Berichten
   das Objekt bei mehreren Drehwinkeln rendern und die Bilder subtrahieren — Symmetrie ist
   messbar, mit bloßem Auge auf einem Standbild aber unsichtbar.
12. **Bei Optik-Kritik zuerst `git show` auf die eigene Änderung, dann urteilen.** „Inseln sehen
   aus wie ein Kindercomic" war nicht die Farbpalette (unverändert) und nicht die Textur — es
   waren die Bäume, die ich dreimal so hoch und fast doppelt so hell gemacht hatte. Der Diff
   beantwortete das in einer Minute; Raten hätte an der falschen Stelle angesetzt.
14. **Gegen die Geschwindigkeit tunen, die tatsächlich geflogen wird.** Die Kurvenrate wurde
   zweimal zu schwach ausgeliefert, weil ich gegen eine angenommene Reisefahrt von 105 m/s
   gerechnet habe — der Screenshot zeigte 167 m/s. Bei einer Formel mit 1/v ist das Faktor 1,6.
   **Vor jedem Flugmodell-Tuning die Geschwindigkeit aus einem echten Screenshot/HUD ablesen**,
   nicht aus dem Datenblatt schätzen.
15. **Ein Rotationskörper füllt jeden Winkelsektor, ein Blatt nur wenige.** Die Haubenerkennung
   über Vertexdichte lag beim P-47 um 30 % daneben und ließ die Blattwurzeln stehen. Die
   Winkelbelegung pro Radiusschale trennt Spinner/Haube von Blatt eindeutig und modellunabhängig.
   Allgemein: **bei rotationssymmetrischen Teilen über die Winkelverteilung messen, nicht über
   die Dichte.**
16. **Eine Restzahl ohne festes Prüffenster ist keine Aussage.** „105 Dreiecke übrig" kippte je
   nach gewähltem z-Fenster auf 0 oder auf 644 — bei der Bf 109 lagen die vermeintlichen Reste
   1,4 Einheiten hinter der Propellerebene und waren die Motorhaube. Wenn eine Metrik vom frei
   gewählten Fenster abhängt, ist das Rendering der Nachweis, nicht die Zahl.
13. **Ein Objekt sitzt nicht dort, wo sein Mittelpunkt sitzt.** Die Hecken hingen in der Schlucht,
   obwohl BUILD 105 die Bodenhöhe an ihrer Position korrekt bestimmte — sie sind nur 70–220 m
   lang bei 100 m Gitterweite, und die ENDEN wusste niemand. Bei allem, was länger oder breiter
   als eine Geländekachel ist, die Höhe über die ganze Ausdehnung abtasten und auf den Tiefpunkt
   setzen. Gemessen: 58 % schwebten, der schlimmste 137 m.
17. **Wenn ein Objekt aus JEDEM Kamerawinkel unsichtbar ist, ist die erste Frage „wird es
   überhaupt gezeichnet", nicht „warum sieht man es schlecht".** Straße, Schiene, Bankette und
   Fluss in `thunderbolt-europe.html` waren nicht dunkel, nicht falsch belichtet, nicht zu dünn —
   sie waren komplett unsichtbar, aus jedem Winkel inklusive senkrecht von oben, weil ihre
   Dreiecks-Wicklung die Flächennormale nach unten zeigen ließ, weg von einer Kamera, die nie
   unter der Wasser-/Straßenebene steht. Ein Material-/Beleuchtungsfehler ist blickwinkel-
   abhängig (aus manchen Winkeln sieht man trotzdem etwas); ein Culling-/Wicklungsfehler ist es
   nicht — bei „nichts zu sehen, aus wirklich jedem getesteten Winkel" zuerst die
   Flächennormalen messen (`computeVertexNormals()`s Ausgabe), nicht am Material schrauben.

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
- **Seit BUILD 106/EU BUILD 27: kein Rückfrage-Schritt mehr vor dem Mergen/Pushen nach `main`.**
  Der Nutzer hat das explizit so gewünscht ("machen, kontrollieren, pushen") — vorher wurde vor
  jedem Merge auf den `main`-Branch einmal nachgefragt. Weiterhin gilt: auf dem Feature-Branch
  entwickeln, dann direkt nach `main` mergen und pushen, ohne zu fragen — aber nur nachdem
  Syntax UND die Kernannahme verifiziert wurden (siehe oben).

---

*Erstellt aus dem Code von BUILD 99 / EU BUILD 23. Wenn du Fortschritte machst, aktualisiere
diese Datei — insbesondere Abschnitt 4 — damit die nächste Sitzung (menschlich oder KI)
nicht wieder bei null anfängt.*
