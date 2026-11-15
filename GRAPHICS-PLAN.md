# Grafik- und Performance-Plan

Stand: 15.11.2026, Build 272. Zielgerät des Nutzers: **iPad Pro mit M1**.
Auftrag: „Bestmögliche Grafik und bestmögliche Performance", als Plan – gebaut ist davon bisher nur
die P-47-Texturreduktion (Build 272). Jede Phase unten wird erst nach Freigabe des Nutzers gebaut.

Dieser Plan gilt für **alle Sitzungen** (auch andere KI-Sitzungen, die an der Rhein-Kulisse arbeiten):
wer Grafik ändert, hält die Budgets in Abschnitt 3 ein und trägt Messwerte hier nach.

---

## 1. Ausgangslage (gemessen, nicht geschätzt)

Gemessen im echten Spiel in Chromium (Zählwerte sind geräteunabhängig; Zeiten wären es nicht und stehen
deshalb nicht hier). Messskripte: Arbeitsordner der Sitzung, Muster in `CLAUDE.md` (Eintrag 15.11.2026).

| | Rhein | Pazifik |
|---|---|---|
| Dreiecke pro Bild | 4,7–5,3 Mio. | 3,1–3,2 Mio. (mit Schattenpass) |
| Draw-Calls | 470–580 | 290–590 |
| Texturen im Grafikspeicher | 300 MB → **104 MB** (Build 272) | ≈ 90 MB |
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
- **Diagnose-Einblendung** (abschaltbar, im Menü unter „More Options"): Bilder/s (Mittel und schlechtestes 1 %),
  Bildzeit, Dreiecke, Draw-Calls, Pixelverhältnis, Qualitätsstufe, Bildwiederholrate (60 oder 120 Hz).
- **Budget-Test** für CI (Zählwerte aus Abschnitt 3).
- Abnahme: der Nutzer liest auf dem M1 Zahlen für Rhein-Start, Tiefflug Remagen, Pazifik-Trägerstart ab.
  Diese Zahlen entscheiden, wie viel Phase 1 wirklich nötig ist und wie weit High gehen darf.

### Phase 1 – Geschenkte Qualität und freies Budget (3–4 Builds, kein Stilwechsel)
| Maßnahme | Wirkung | Risiko |
|---|---|---|
| P-47-Texturen 4096 → 2048 | −192 MB, Datei 9,2 → 4,7 MB, Bild gleich | **erledigt, Build 272** |
| Anisotrope Filterung 8× für Flugzeuge, Gelände, Piste | schärfere Flächen bei flachem Blick | gering |
| Pixelverhältnis 2,0 statt 1,5, wenn das Gerät Reserve hat | 78 % mehr Bildpunkte, sichtbar schärfer | gering, mit Regelung |
| Bäume in 1-km-Zellen statt 4-km-Kacheln | −60 bis −75 % Baumdreiecke, Bild gleich | mittel (Draw-Calls steigen, geschätzt um 100–250) |
| Baum-Detailstufen: nah voll, 1,5–3 km vereinfacht, weiter als 3 km Flächen | Rhein ≈ 1 Mio. Dreiecke | mittel (Übergänge dürfen nicht „ploppen") |
| Vereinfachte Flugzeuge für geparkte und ferne Maschinen (P-47 hat 89 500 Dreiecke) | −0,2 bis −0,4 Mio. | gering |
| Grafikmenü Auto / Low / Medium / High, Regelung erweitert (Baumweite, Schatten, Auflösung; Ziel 45 statt 38 FPS als Eingriffsschwelle) | Nutzer wählt Obergrenze | gering |

### Phase 2 – Licht und Atmosphäre (4–6 Builds, der größte sichtbare Sprung)
Zuerst als **Probeszene**: Rhein, Flugplatz und Brücke von Remagen, Mittag, klares Wetter, umschaltbar
„Grafik: Neu / Klassisch". Erst wenn der Nutzer diese Szene auf dem iPad gut findet, wird ausgerollt.

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
| Rhein-Kulisse | Classic | Detailed reduziert | Detailed |

**Auto** ist der Standard: startet auf Medium, hebt nach 15 s mit Reserve an, senkt bei Bildzeit über 22 ms,
später zusätzlich bei Wärmewarnung aus der App. Die gewählte Stufe ist die Obergrenze.

**Maßstab für Texturgrößen (gemessen, Build 272):** P-47 auf dem größten iPad bei Pixelverhältnis 2. Gegen 4096 px
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
- Bildzeiten, Wärmeverhalten und Speichergrenze auf dem iPad Pro M1 (Phase 0 und 6).
- Ob auf dem M1 die Dreiecke oder die Bildpunkte zuerst begrenzen.
- Kosten der Schatten und des Glühens auf dem Gerät (Probeszene).
- 120 Hz in Safari und in der App.
