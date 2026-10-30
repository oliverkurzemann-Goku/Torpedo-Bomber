# Berechneter Flugkern — alle Flugzeuge (Build 223, Pilotenverhalten Build 224)

Stand 29.10.2026. Seit Build 223 (auf dem Arbeitszweig „Build 220“ genannt; main hatte 220–222 schon für
Zero-Haube, Avenger-Bombenschacht, Hangar und Custom-Mission-Vorschau vergeben) fliegen **alle zehn spielbaren Typen** (Rhein: P-47, Bf 109, Fw 190,
Ju 87, Me 262, Me 163; Pazifik: Avenger, SBD, Corsair, Zero) **und alle KI-Flugzeuge** (Jäger, Rottenflieger,
Begleiter, Angreifer, B-17/B-24-Pulks) auf demselben berechneten Modell — in der Luft, beim Start, auf dem
Trägerdeck und beim Ausrollen. Die P-47 (Build 219) war der erste Typ; ihr Abschnitt steht unten.

- Daten und Physik: `flight-core.js` (`FlightCore`): `SOURCES` (Quellen, Kennung A/B), `ASSUMED`/`CLASS`
  (ohne Quelle, Kennung C), `GAME` (Spielentscheidungen), `CAPACITY` (was ein Typ physisch tragen kann).
- Steuergesetze: `flight-control.js` (`FlightControl.player` für den Spieler, `FlightControl.ai` für jede KI).
- Nachrechnung aller Typen: `node scripts/flight/derive-fleet.cjs` → `app/release/flight-core-fleet.json`.
- Echte Spiele im Browser: `okinawa/tests/fleet-core-browser.cjs` (Rhein) und `pacific-core-browser.cjs`
  → `app/release/flight-core-fleet-browser.json` / `flight-core-pacific-browser.json`.
- `?core=off` fliegt das alte Modell (Build 215/219), `?core=physics` den Kern ohne Manöver-Verstärkung.
  `?p47core=…` wirkt weiter wie `?core=…`.

## Grundsatz

Kein Kraftbeiwert ist von Hand gesetzt. Das Flugzeug wird nur durch veröffentlichte Zahlen
beschrieben; Widerstand, Propellerwirkungsgrad und Leistungsabfall mit der Höhe werden beim Laden
**aus den gemessenen Flugleistungen gelöst**. Werte ohne Quelle stehen getrennt in `ASSUMED`
(Kennung C), die Entscheidungen des Spiels (wie der Knüppel in eine Last übersetzt wird, eine
Manöver-Verstärkung) getrennt in `GAME`. Es gibt keine Werte pro Typ zum Nachstellen.

## Build 223: Was neu berechnet wird (die Punkte 1–7)

1. **Strömungsabriss, mild:** Der Flügel reißt ab, wenn verlangt wird, was er nicht hat. Zustand steigt mit
   0,25 s, fällt mit 0,6 s; Auftrieb bis −30 %, Widerstand +0,12·Abriss; ein Flügel kippt mit
   `Typ-Heftigkeit × GAME.stallRoll (65°/s)` (Heftigkeit C: Fw 190 0,9 nach Pilotenberichten B4, Corsair 0,7,
   P-47 0,3, Zero 0,15, Bomber 0,1); Buffet-Wackeln ab 88 % des Maximums. **Spielentscheidung:** Der
   Normal-Modus verlangt nie mehr als der Flügel hat (eine zu steile Kurve sinkt dann), nur die 1 g des
   Geradeausflugs — zu langsam reißt er also trotzdem ab. Im AERO-Modus ist Vollausschlag genau die
   Flügelgrenze (Looping am Rand des Abrisses, mit Buffet); zu langsam reißt er ab. Loslassen = Erholung,
   sobald wieder Fahrt da ist. Gemessen im echten Spiel: Abriss nach 3–5 s Hochhalten mit Leerlauf,
   abkippen 0–33°, Erholung 3,3–5,2 s nach dem Loslassen, 36–128 m Höhenverlust.
2. **Rollrate aus veröffentlichten Werten:** unterhalb der Fahrt der Spitzenrate durch den Rollwiderstand
   begrenzt (∝ V), darüber durch die Steuerkraft (∝ (V_peak/V)^fall); Spielrollrate = min(220°/s, 1,53 × real)
   (`GAME.rollGain`, damit die P-47 ihr bisheriges Rollgefühl behält).
3. **Masse im Flug:** Leermasse + Kraftstoff (Füllstand des Spiels) + Lasten bis zur physischen Kapazität
   (`CAPACITY`: z. B. Avenger 1 Torpedo, auch wenn das Spiel „4 Torps“ zählt); Abwurf, Raketen, Zusatztank,
   Treibstoffverbrauch ändern Masse und (über Außenlast-Widerstandsflächen, C) den Widerstand sofort.
4. **Hochgeschwindigkeit:** über `mlimit` Machtrimm (Nase drückt, Höhenruder wird steif), über `vne` (EAS)
   Überfahrt (Höhenruder −60 %); Warnung COMPRESSIBILITY / OVERSPEED.
5. **Motorarten:** Kolben mit Volldruckhöhe (Gagg & Ferrar darüber), Turbolader (linearer Abfall, gelöst),
   Strahl `T0·σ^n` (n gelöst), Rakete mit konstantem Schub und Massenstrom `T0/isp` (die Me 163 wird beim
   Brennen leichter, danach echter Gleitflug).
6. **Start und Landung auf demselben Modell** (`FlightCore.groundAcceleration`): Schub, Widerstand und
   Flügelauftrieb wie in der Luft, Bodenreibung und Radbremse (0,30·Normalkraft, C) auf dem Gewicht, das der
   Flügel noch nicht trägt, Bodeneffekt nach McCormick. Abheben, sobald der rotierte Flügel das Gewicht trägt.
   Träger: dieselben Kräfte bei der Fahrt über Deck (Schiff + Wind).
7. **KI auf demselben Modell** (`FlightControl.ai`): gleiche Kräfte, Lastgrenzen, Rollraten und Verstärkung wie
   der Spieler; der KI-Pilot steuert Querlage (Kurswunsch), Bahnwinkel und Gas (PI-Regler auf Fahrt), setzt bei
   Langsamflug selbst Klappen und entscheidet mindestens 60-mal pro Sekunde (gleicher Weg bei 20/60/120 FPS).

### Quellen und Nachrechnung je Typ

Gelöst (Levenberg–Marquardt) werden je Motorart nur so viele Größen, wie veröffentlichte Werte da sind:
Kolben/Turbo `CD0, η_p (, Höhenabfall)`, Strahl `CD0, n`, Rakete `CD0, Mcrit`. Alles andere ist Quelle (A/B)
oder benannte Annahme (C). Einzelheiten und Quellenzeilen stehen in `SOURCES`/`ASSUMED` in `flight-core.js`.

| Typ | Veröffentlicht (Kennung) | Modell gegen Quelle | Vmax 1 km | Stall clean/Landung IAS | Rollrate Spitze | Vollkreis 70 % | Start (Masse publ.) |
|---|---|---|---|---|---|---|---|
| P-47D-28 | AAF-Vergleich 6.10.1944 (A) | ±1,7 % | 579 km/h | 183/155 | 145°/s | 8,5 s | 385 m |
| Bf 109F-2 | Nutzer-PDF (A), IL-2-Datenblatt (B) | ±2,1 % | 551 | 161/154 | 153 | 6,9 | 299 |
| Fw 190A-8 | IL-2-Datenblatt (B) | Vmax ±0,7 %, Steigen −14/+10 % (Zweigang-Lader nicht nachgebildet) | 579 | 190/176 | 220 | 9,2 | 504 |
| Ju 87B-2 | Betriebsanleitung/Sammlungen (B) | exakt (2 Werte, 2 Größen) | 347 | 141/121 | 84 | 8,8 | 398 |
| Me 262A-1a | Fliegerweb/flugrevue (B) | exakt; **Kontrolle** Startstrecke 1 005 m bei 7 130 kg (B5): Modell 1 064 m (+6 %) | 800 | 209/180 | 122 | 8,0 | 895 |
| Me 163B | migflug/ww2db (B) | exakt (Steigen 2→10 km, 960 km/h) | 955 | 204/190 | 153 | 9,1 | — (Luftstart) |
| TBF-1 Avenger | Fiddler's Green (B), Grumman (A) | exakt | 403 | 153/132 | 77 | 8,9 | 434 |
| SBD-3 | NNAM (A/B), armedconflicts 1 190 ft/min (B3) | exakt | 360 | 146/126 | 107 | 9,4 | 405 |
| F4U-1D | AN 01-45HA-1 (A), Vought-Versuch (B) | exakt | 578 | 161/138 | 153 | 6,8 | 265 |
| A6M2 | j-aircraft/Francillon (B) | exakt | 474 | 126/109 | 176 | 4,8 | 150 |
| B-17G (KI) | Sally B (B) | exakt; η_p 0,52 auffällig (Steigzeit vermutlich unter Volllast geflogen) | 392 | 167/144 | 46 | 11,2 | 1 113 |
| B-24J (KI) | kasselmission (B) | ±0,02 % | 387 | 197/169 | 46 | 15,8 | 1 348 |

„Exakt“ heißt: so viele Werte wie gelöste Größen — eine Bestätigung ist das nicht, nur die Fw 190, P-47,
Bf 109 und B-24 haben überzählige Werte, und die Me 262 die unabhängige Startstrecke.

### Spielentscheidungen und Annahmen (C) dieses Builds

| Was | Wert | Warum |
|---|---|---|
| Startklappen | 50 % des Klappenwegs (Corsair 20°) beim Start aller Typen | Handbücher nennen 10–30°; ohne braucht eine beladene P-47/Fw 190/Me 262 550–800 m |
| Startpunkt Piste | 40 m hinter der Schwelle (vorher 140 m) | 860 m Rollweg auf der 900-m-Piste |
| Abflugschneisen | 1 200 m vor beiden Pistenenden, 60 m halbe Breite, +15 % | Fw 190/Me 262 überflogen das Pistenende in ~20 m — unter den 20–26 m hohen Bäumen |
| Me-262-Starthilfe | zwei RI 502 (2 × 600 kp, 6 s, B6), automatisch bei 60 % der Rotationsfahrt | beladen ~1 000 m Startstrecke (B5) > Piste |
| Startwind Träger | Schiff dampft beim Start auf 15 m/s Wind über Deck | mit 5 m/s kommt eine beladene Avenger auf 214 m Deck nicht hoch |
| Reibung | Piste 0,04, Feld 0,08, Kufe/Bauch 0,35; Radbremse 0,30 | keine Messung |
| Abriss-Schwellen | Abriss ab 100 % des Flügelmaximums, voll bei 110 %; Buffet ab 88 % | keine Messung |
| KI-Formation | Querlage ≤ 0,8 rad, Gierrate ≤ 0,25 rad/s, Roll-/Nickrate kommandiert 0,31/0,135 rad/s (Grenze 0,32/0,14), Gasregler kp 0,5 / ki 0,03 | ruhige Rottenflieger (Build 182), stabil auf dem Kern; die Lage-Integration koppelt ~1 % auf |
| Bomber | 72 m/s, Querlage ≤ 0,48 rad, Kurs ≤ 0,09 rad/s | Pulk wie bisher |

### Im echten Spiel gemessen (Chromium/SwiftShader, `fleet-core-browser`, `pacific-core-browser`)

Rhein, Start mit der Missionslast (P-47: zwei Bomben und Zusatztank) bzw. allen Bomben, die der Typ trägt:

| Typ | Masse | Abheben | Rollstrecke (Rest der Piste) | 40 s danach | Vollkreis 45/70 % Vmax | Loop ab Gate | Abriss: Kippen / Erholung |
|---|---|---|---|---|---|---|---|
| P-47 | 7 080 kg | 19,4 s | 624 m (236 m) | 355 m, 9,6 m/s | 12,6 / 8,7 s | 372 km/h, 10,2 s | 11° / 4,3 s |
| Bf 109 | 3 285 kg | 16,7 s | 498 m (362 m) | 351 m | 10,5 / 7,4 s | 320 km/h, 9,4 s | 9° / 3,9 s |
| Fw 190 | 4 887 kg | 20,6 s | 698 m (162 m) | 331 m | 13,9 / 9,5 s | 394 km/h, 10,9 s | 33° / 4,2 s |
| Ju 87 | 4 250 kg | 18,2 s | 408 m (452 m) | 202 m, 4,4 m/s | 12,9 / 8,3 s | 305 km/h, 6,9 s | 7° / 3,6 s |
| Me 262 | 6 155 kg (2 Bomben: 6 655) | 24,7 s mit RATO | 609 m (2 Bomben: 723 m) | 406 m, 14,6 m/s | 11,6 / 9,4 s | 432 km/h, 10,8 s | 13° / 5,2 s |
| Me 163 | Luftstart | — | — | — | 7,9 / 10,8 s | 388 km/h, 9,1 s | 0° / 3,9 s |

Pazifik, Trägerstart mit der Missionslast (Pilot zieht bei Abhebefahrt):

| Typ | Masse | Abheben nach | Decklauf | Fahrt / Stall | 25 s danach | Vollkreis 45/70 % | Loop |
|---|---|---|---|---|---|---|---|
| Avenger (Torpedo) | 7 214 kg | 13,8 s | 200 m | 155 / 142 km/h | 132 m, 4,9 m/s | 11,4 / 7,7 s | — (kein AERO) |
| SBD | 4 717 kg | 13,4 s | 180 m | 147 / 135 | 121 m | 12,7 / 8,2 s | 321 km/h, 6,7 s |
| Corsair (2 × 1 000 lb + 8 HVAR) | 6 369 kg | 11,9 s | 214 m (Bug) | 181 / 163 | 185 m | 9,9 / 7,6 s | — |
| Zero | 2 410 kg | 6,4 s | 70 m | 136 / 116 | 268 m | 7,0 / 5,1 s | 241 km/h, 6,8 s |

Alle Typen: 8-s-Steigkurve bei 20 und 120 FPS innerhalb 0,4 m/s Fahrt, 0,06 rad Kurs, 6 m Höhe.
KI: Bf 109 kehrt bei 145 m/s in 6,4 s um (vorher 11–32 s, langsamer als der Spieler), hält dabei die Höhe;
Rottenflieger halten bei 80 kt den Platz auf ±1 m (20/60/120 FPS innerhalb 0,1 m).

### Hangar (Build 221) und Bombenschacht (Build 220 auf main)

- Luftstart aus dem Hangar: Anfangsfahrt `max(alter Wert, 1,5 × Abreißfahrt clean bei 1 g)` für die gewählte
  Last in Starthöhe (`coreAirStart` in beiden Spielen) — die alten `d.stall`-Werte sind Spielzahlen.
- Avenger-Torpedo und -Bomben liegen im geschlossenen Schacht: Masse ja, Zusatzwiderstand nein
  (`stores.bombArea:0`, Torpedo ohne Fläche). SBD-„3 Bomben“ des Hangars zählen physisch als eine
  1 000-lb-Bombe (`CAPACITY`).
- Rottenflieger starten mit dem Wind in der Bodengeschwindigkeit (vorher sprang die Fahrt im ersten Bild um
  die Windgeschwindigkeit, gemessen 118 m/s² in einem Bild).

### Was die Tests jetzt anders prüfen (und warum)

Wo alte Browsertests Zahlen des alten Spielmodells festschrieben, prüfen sie auf dem Kern die physikalische
Aussage (Fixture-Begründung jeweils im Test):

- Notwasserung: statt 65 kt (= Landeklappen-Abriss der Avenger auf dem Kern) 1,2 × aktueller Abriss, Gas regelt
  die Fahrt, Knüppel den Gleitpfad; Kontakt ±2 kt / ±20 ft/min, alle 16 Fälle gerettet.
- Komet-Kufenlandung mit 52 m/s (1,3 × Abriss) statt 68 m/s — mit 68 m/s rutscht sie, halb vom Flügel
  entlastet, über das 900-m-Feld hinaus.
- Leerlaufbremse: Avenger/SBD/Ju 87 verzögern bei halber (niedriger) Vmax 1,0–1,1 m/s² (Widerstand +
  Propeller über die echte Masse); Grenze 0,9 bzw. 1,35 m/s² und Anstieg mit der Fahrt.
- Beschleunigung/Ausrollen: Corsair gewinnt doppelt so viel wie die Avenger, Komet 1,6 × die Me 262, P-47
  rollt weiter als die Bf 109 — Verhältnisse statt fester Spielabstände.
- Beladener Steigflug: Ju 87 mit vier Bomben steigt nach dem Abheben 4 m/s (18 m nach 4 s, 34 m nach 8 s);
  verlangt: > 12 m, weiter steigend, nach 8 s über den 20–26-m-Bäumen.
- Durchstarten nach verpasstem Seil und Trägerrückkehr mit Rückkehrlast (Torpedo weg, 30 % Sprit): eine volle
  7,2-t-Avenger, unter ihre 37-m/s-Klappenabrissfahrt gebremst, braucht fast das ganze Deck.
- Looping-Test: Pazifik mit dem berechneten AERO-Gate (`FlightControl.aeroGate`) und der aktuellen 1-g-Abrissfahrt.
- HUD-Referenz: Rhein in IAS (`referenceIAS`), Pazifik in TAS (wie die Fahrtanzeige dort).

### Ehrlich offen

- Kein iPad-Test, kein Spielgefühl-Nachweis.
- Fw-190-Steigwerte ±14 % (Zweigang-Lader nicht modelliert); B-17 mit auffälligem η_p (nur KI).
- Rollraten, Abriss-Heftigkeit, Mcrit/mlimit, Lastgrenzen sind überwiegend Sekundärquellen oder C.
- Formation langsamer als 80 kt geht mit einer Avenger physikalisch nicht mehr (Landeklappen-Stall 65 kt).

## Build 224: wer fliegt wohin (Gegner und Rottenflieger)

Die Flugzeuge selbst ändern sich nicht (Kräfte, Lastgrenzen, Rollrate aus Abschnitt „Build 223“). Neu ist nur, was die
Piloten entscheiden und wie weich sie den Knüppel führen. Alles hier sind Spielentscheidungen (Kennung C), keine Flugzeugdaten.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Jägerpilot `FlightControl.ai(…,{vector:true})` | `flight-control.js` | Auftriebsvektor auf den Zielpunkt rollen (Rate ∝ Winkel, bei Zielwinkel < 4° ausgeblendet), dann ziehen `n = u_y + V·ω·cos φ⁺/(g·Gain)` mit `ω = min(ω_max, ε·Zugverstärkung)`; Ziel knapp unterm Bauch und nahe der Nase wird angedrückt statt gerollt. Looping, Split-S, Wingover. Abriss-Zustand des Kerns bleibt eingeschaltet. |
| Handoptionen | `flight-control.js` | `rollAccel` (rad/s²), `bankTau` (s), `loadRate` (g/s), `powerRate` (1/s) und im Jägerstil `aimTau` (s, Glättung des Zielpunkts), `rollDeadband`, `rollGain`, `pullGain`, `maxTurnRate`: ohne Angabe verhält sich `ai()` wie in Build 223. |
| Gefechtsgehirn | `dogfight-ai.js` | Wahrnehmung mit Verzögerung und Rauschen, Angriffsgeometrie, Versatz-Verfolgung, Nachpass-Entscheidung, Verteidigung, Deckung, Bodenschutz. Liefert Zielrichtung, Wunschgeschwindigkeit, Pilotenoptionen und ein Feuersignal. |
| Rottenflieger | `flight-support.js`, `torpedo-carrier.html` | Folger der Wunschgeschwindigkeit, Handbegrenzungen, Platzkorrektur längs langsam (.12) und quer schneller (.4). |

**Wahrnehmung.** Der Pilot schaut alle `react = (.95 − .8·Können)·(.7…1,3)` s auf das Ziel (Rauschen `(1−Können)·1,4 m` je 100 m
Abstand); dazwischen rechnet er mit der letzten Geschwindigkeit weiter. Deshalb sitzen Zielpunkt und Reaktion nie im Takt.

**Angriff.** Fünf Geometrien mit typabhängigen Gewichten (`STYLE`: `boom` Fw 190/P-47, `mixed` Bf 109, `turn` Zero, `jet`
Me 262/Me 163); die letzten beiden werden abgewertet. Zielpunkt = Abfangpunkt plus Versatz (hoch, seitlich, tief), der mit dem
Abstand ausläuft (`fade = smooth(Abstand, 260, 1400)`, Betrag `.38·Abstand`) — die Bahn ist gekrümmt und endet auf dem Heck.
Unter 900 m geht der Abfangpunkt in die Waffenlösung über (Geschossfahrt 700 m/s, das Geschoss erbt die Fahrt des Schützen
nicht, wie im Spiel). Eine Schlepp-Verfolgung, die nicht aufschließt, endet nach 6–11 s in Zoom oder Flankenwechsel.

**Nach dem Pass** (Abstand < 95 m oder Überflug): reichlich Energie und Höhe → Zoom (Steigflug seitlich vom Schussfeld weg);
hohe Annäherung → High oder Low Yo-Yo; Ziel nah und langsam → Scissors (zum Ziel hineindrehen, bei jedem Seitenwechsel
umkehren); sonst Absetzen mit zufälliger Peilung, wieder Anflug aus einer neuen Richtung.

**Verteidigung.** Zielt die Nase des Ziels auf ihn: Bruch (zu 82 % in den Angreifer), Fassrolle (Helix um die Schusslinie),
Split-S (nur mit `3·R + 300 m` Luft, `R = V²/(2,2·g·4)`), Sturz, Looping (nur mit Energie und 700 m), Steigkurve, Jinking.
Gewichte je Typ, der zuletzt benutzte wird auf ×.3 gesetzt, ein schwacher Pilot wählt manchmal falsch. Frontalpässe: er bricht
erst unter `230 + 470·(1−Angriffslust)·(1,1−.4·Können)` m.

**Boden.** Steilster erlaubter Sturz so, dass der Ausfangweg (`R·(1−cos γ)` plus Zeit, die Flügel zu entrollen, bei der
tatsächlichen Rollrate) mit 40 % Reserve in die Luft unter ihm passt. Reicht es trotzdem nicht, zieht er mit horizontaler
Flügellage durch (`pullout`). Der Kartenrand (`inward`) schlägt jedes Manöver.

**Wiederholbarkeit.** Zufall kommt aus `rng` (im Spiel `Math.random`, im Test ein festes Saatkorn): gleicher Pilot, gleicher Kampf.
`?ai=old` stellt in beiden Spielen die Build-223-Modi wieder her, die alten Tests prüfen sie weiter.

## Erster Typ: P-47 (Build 219, unverändert gültig)

### Quellen (Kennung A = Primärdokument, B = übereinstimmende Sekundärangaben)

| Größe | Wert | Quelle |
|---|---|---|
| Gewicht der Leistungswerte | 12 731 lb (5 775 kg) | A — AAF-Vergleich vom 6.10.1944 |
| Flügelfläche / Spannweite | 300 ft² / 12,42 m | A |
| Leistung | 2 600 bhp WEP (R-2800-59) | A — derselbe Vergleich |
| Höchstgeschwindigkeit TAS | 345 / 383 / 417 mph bei 0 / 10 000 / 20 000 ft | A |
| Steigrate | 3 180 / 2 920 / 2 470 ft/min bei 0 / 10 000 / 20 000 ft | A |
| Stall clean / Landung | 116 / 98 mph IAS bei 13 230 lb, Leerlauf | A — USAAF Eng-47-1774-A, 15.7.1944 |
| Propellerdurchmesser | 3,99 m (13 ft 1–2 in, Curtiss 836) | B |

Die 32 000-ft-Werte fließen nicht ein (im Original geschätzt, über der Spielhöhe von 5 000 m).

### Physik

- Atmosphäre: ISA.
- Widerstand: `D = q·S·(CD0 + k·CL² + ΔCD_Konfiguration + ΔCD_Mach)`, `k = 1/(π·A·e)`,
  `CL = n·W/(q·S)` mit dem tatsächlich geflogenen Lastvielfachen `n` — Kurven und Abfangen kosten
  also echte Energie.
- Schub: ideale Propellerscheibe (Impulssatz) mit einem Profilwirkungsgrad:
  `T·(V+w) = η_p·P`, `T = 2ρ·A_Scheibe·(V+w)·w`. Damit fällt der Schub bei hoher Fahrt und dünner
  Luft physikalisch richtig ab; Standschub ist endlich.
- Wellenleistung: `P(h) = P₀·(1 − c·h)`, `c` gelöst (siehe unten).
- Auftrieb: `n_max = min(Struktur, CLmax·q·S/W)`; `CLmax` clean und mit Klappen aus den Stalltests:
  `CLmax = 2W/(ρ₀·S·Vs²)` → 1,282 / 1,796.
- Auftriebs-Steigung: Helmbold `a = 2πA/(2+√(A²+4))` = 4,41 /rad.
- Bahn: Die Flugbahn folgt der Längslage mit der Bahn-Zeitkonstante `T_θ2 = 2m/(ρ·V·S·a)`
  (Auftriebsreaktion; bei 130 m/s auf Meereshöhe 0,59 s). Die Längslage selbst (Anstellwinkel-
  Schwingung) gilt als schnell dagegen — es gibt keine Trägheitsdaten —, deshalb liefert der Flügel
  das vom Steuergesetz verlangte Lastvielfache sofort, und `T_θ2` begrenzt, wie schnell das
  Nick-Steuergesetz die Bahn drehen darf. Die Flugbahn dreht mit
  `dγ/dt = g/V·(n·cos φ − cos γ)`, `dψ/dt = g/V·n·sin φ/cos γ` — in Vektorform integriert, damit ein
  Looping durch die Senkrechte geht. Fester 120-Hz-Teilschritt: Ergebnis ist von der Bildrate unabhängig.
- Kompressibilität: Lock'sches Gesetz `ΔCD = 20·(M − Mcrit)⁴` über `Mcrit`.

### Gelöst aus den sechs AAF-Werten

Kleinste Quadrate (Levenberg–Marquardt) über die drei Höchstgeschwindigkeiten **und** die drei
Steigraten; die Steigrate ist die beste über alle Fahrten, mit Lift = W·cos γ und der Korrektur für
einen Steigflug bei konstanter IAS (die wahre Fahrt nimmt mit der Höhe zu und kostet Energie).

| Gelöst | Wert |
|---|---|
| CD0 (Nullwiderstand) | 0,0191 (Widerstandsfläche 0,53 m²) |
| η_p (Propeller-Profilwirkungsgrad) | 0,697 |
| Wellenleistung bei 20 000 ft | 0,913 × WEP |

Der Oswald-Faktor `e` lässt sich aus diesen sechs Zahlen **nicht** bestimmen: frei gelassen läuft
er an die Grenze 0,4, weil konstante Propellerverluste den Höhentrend der Steigrate nicht abbilden.
Er kommt deshalb aus Raymers Formel für Geradflügel, `e = 1,78·(1 − 0,045·A^0,68) − 0,64` = 0,884.
CD0 und η_p sind miteinander verknüpft — scharf bestimmt ist vor allem ihr Verhältnis (Widerstand
pro Leistung). Der gelöste Leistungsabfall kann ebenso gut Turbolader wie Propeller zugeschrieben
werden; beide Deutungen ergeben dieselben Kräfte.

### Nachrechnung gegen die Quellen

| Größe | Quelle | Modell | Abweichung |
|---|---|---|---|
| Vmax 0 ft | 345 mph | 351 mph | +1,7 % |
| Vmax 10 000 ft | 383 mph | 380 mph | −0,8 % |
| Vmax 20 000 ft | 417 mph | 413 mph | −0,9 % |
| Steigen 0 ft | 3 180 ft/min | 3 198 ft/min | +0,6 % |
| Steigen 10 000 ft | 2 920 ft/min | 2 870 ft/min | −1,7 % |
| Steigen 20 000 ft | 2 470 ft/min | 2 497 ft/min | +1,1 % |
| Stall clean, 13 230 lb | 116 mph IAS | 116 mph IAS | 0 |

Daraus folgend (keine Quelle zum Vergleich): beste Steiggeschwindigkeit 161 / 154 / 148 mph IAS,
Eckgeschwindigkeit 134,6 m/s auf Meereshöhe.

### Ohne Quelle verwendet (Kennung C)

| Wert | Grund |
|---|---|
| Lastgrenze +7,0 / −3,0 g | keine P-47-Zahl gefunden; +7 aus FLIGHT-ENVELOPE.md |
| inverses CLmax = 0,6 × CLmax | gewölbtes Profil, Klassenwert |
| Mcrit 0,72 | Berichte zu P-47-Sturzflügen nennen etwa Mach 0,7 |
| ΔCD Fahrwerk 0,020, Klappen 0,050, Zusatztank 0,006 | keine Messung gefunden |
| Leerlauf-Propellerbremse 0,07 (Scheibenfläche) | aus FLIGHT-ENVELOPE.md |
| Leistungsaufbau 1,25 s | aus flight-dynamics.js |

Masse im Spiel: 5 775 kg × Beladungsfaktor aus `SortieFeatures.Handling.sample` (Spielwert).

### Was das Spiel festlegt (keine Flugzeugdaten)

- **Manöver-Verstärkung 2,2**: Die Drehung der Flugbahn (Kurven, Hochziehen) läuft 2,2-mal schneller
  als in der Physik, für zwei Daumen am Tablet. Kräfte, Widerstand und Energie werden **nicht**
  verstärkt: Eine harte Kurve kostet pro Sekunde genau die reale Fahrt. `?p47core=physics` schaltet
  auf 1 (reine Physik), `?p47core=off` auf das bisherige Modell.
- **Normal-Modus**: Knüppel quer = Querlage einer Horizontalkurve, deren Kurvenrate dieser Anteil
  der verfügbaren ist (`tan φ = Anteil·√(n_max²−1)`): linear und fein in der Mitte, voller Ausschlag =
  engste Kurve, die der Flügel bei dieser Fahrt halten kann; bei wenig Fahrt automatisch flacher
  (mindestens Anteil × 30°). Die alte Zuordnung über den Lastanteil war in der Mitte zu empfindlich
  (4 % Ausschlag ≈ 37° Querlage). Knüppel längs =
  Bahnwinkel, selbstzentrierend: die unveränderte Lage-Feder aus Build 214/215 (gleiche Ziele,
  Startgrenzen, Dämpfung) erzeugt die Sollbahn; der Flügel fliegt sie, soweit sein Lastvielfaches
  reicht (Vorsteuerung der Sollrate, Rest über `T_θ2`). Innerhalb der Grenzen also das gewohnte
  Nickgefühl, an der Grenze (wenig Fahrt, hohe Last) entscheidet die Physik.
- **AERO**: Ziehen = Lastvielfaches (neutral hält die Bahn, voll = was der Flügel kann),
  Rollen wie bisher.
- Rollrate unverändert aus FLIGHT-ENVELOPE.md (Quelle B, ±30 %).

### Folgen fürs Spiel (aus dem Kern, 1 000 m, Vollgas)

| | Verstärkung 2,2 | reine Physik |
|---|---|---|
| Vollkreis ab 72 m/s (45 % Vmax) | 15,3 s | 37,9 s |
| Vollkreis ab 113 m/s (70 % Vmax) | 8,5 s | 21,1 s |
| Looping ab 140 m/s | 7,1 s, min. 107 m/s | 18,0 s, min. 72 m/s |
| AERO-Freigabe (Loop ohne Unterschreiten der 1-g-Stallfahrt, +8 %) | 93,9 m/s | 132,8 m/s |
| Leerlauf-Verzögerung bei 80 / 121 m/s | 1,24 / 2,13 m/s² | gleich |
| Beschleunigung Vollgas bei 80 / 121 m/s | 1,97 / 0,96 m/s² | gleich |

Energieerhaltung (ohne Schub und Widerstand, 60 s Manöver): Drift 0,005 %.
20 / 60 / 120 FPS: identisches Ergebnis.

### Im echten Spiel gemessen (`p47-core-browser.cjs`, alter Stand mit `?p47core=off`)

| | neu (Kern) | alt (Build 215) |
|---|---|---|
| Abheben (Mission 1, beladen) | 15,4 s / 540 m | gleich (Startlauf unverändert) |
| 60 s nach dem Start | 409 m über Grund, 72,6 m/s, steigt 11,1 m/s | 606 m, 75,1 m/s, 16,2 m/s |
| Vollkreis voller Ausschlag ab 90 m/s, 2 000 m | 11,6 s, Ende 90 m/s, −3 m | 9,0 s, 97 m/s, ±0 |
| Vollkreis ab 130 m/s | 8,4 s, Ende 111 m/s (Fahrt kostet), −8 m | 6,2 s, 133 m/s (keine Fahrt verloren) |
| AERO-Loop ab 150 m/s | 7,3 s, min. 115 m/s | 6,8 s, min. 130 m/s |
| Leerlauf ab 120 m/s, erste Sekunde | −2,0 m/s | −2,17 m/s |
| 8-s-Steigkurve, 20 vs. 120 FPS | Fahrt ±0,07 m/s, Höhe ±0,4 m | ±0,01 m/s, ±1,9 m |

Die P-47 ist damit spürbar ehrlicher und schwerer: Sie steigt nach dem Start langsamer, und eine harte
Kurve kostet Fahrt. Die anderen neun Typen laufen noch auf dem alten Gesetz, dessen Schub laut
Build 211 etwa 2,3–3,5 × real ist — im direkten Vergleich wirkt die P-47 deshalb vorerst schwächer
als Bf 109 / Fw 190 (Beschleunigung von 85 m/s in 10 s: P-47 auf 101 m/s, beide anderen auf 130).

### Bestandstests

Grün mit dem Kern: `handling-quality-browser`, `fleet-flight-browser`, `flight-envelope-browser`,
`p47-integration-browser`, `pitch-response`, Landungsteil von `field-landing-browser` für die P-47
(Endanflug mit Vollklappen 2,3 m/s Sinken, Aufsetzen und Ausrollen bei 20/60/120 FPS), Terrain- und
Okinawa-Knotentests. Rot bleibt in `field-landing-browser` der Touch-and-go-Fall — laut Build 215 schon
auf Build 214 identisch rot, im unveränderten Bodencode. Angepasst (mit Begründung im Test):
Vergleiche mit Sollwerten des alten Kurven-/Roll-Gesetzes gelten nicht für einen Typ auf dem Kern;
dessen Werte prüfen `p47-core-browser` und `derive-p47`.

### Nicht behauptet

- Kein iPad-Test, kein Hörtest, kein Spielgefühl-Nachweis — das entscheidet nur der Flug auf dem Gerät.
- Die P-47 hat keine gemessene Rollrate, kein Trägheitsmoment, keine Klappen-/Fahrwerkswiderstände
  in den verfügbaren Quellen; NACA-Berichte (NTRS) waren aus dieser Umgebung gesperrt.
- Die Steigwerte setzen den Steigflug mit konstanter IAS voraus (übliches Verfahren der Datenblätter).
- Anstellwinkel wird nicht dargestellt (Rumpf zeigt in Flugrichtung), Seitenwind ändert nur die Spur.
