# Konzept: Flugphysik, Start/Landung und Gegner-KI aus einem Guss

**Status:** Konzept, 29.10.2026, Stand Build 215 (Branch `claude/dauntless-propeller-edit-uwy3eg`).
**Nichts davon ist umgesetzt.** Alle Zahlen in den Abnahmetabellen sind Vorschläge, keine Messungen.
Ziel dieses Dokuments: Du kannst entscheiden, ob, in welcher Reihenfolge und mit welchem Realismusgrad gebaut wird,
und jede Stufe hat ein Abnahmekriterium, das sich ohne Gefühl prüfen lässt.

## 1. Warum neu aufbauen

Build 215 hat die Abstimmung verbessert (Datenblatt, Kurvenrate, Rollrate, Leerlaufbremse), aber an der Struktur nichts geändert.
Was heute der Grund für „fühlt sich je Flugzeug nur ungefähr richtig an“ ist:

| Bereich | Heute | Folge |
|---|---|---|
| Flugmodell | Drei Fassungen von `updateFlight` (Pazifik, Rhein, altes Europa). Geteilt sind nur Teilstücke (`flight-dynamics.js`, `flight-envelope.js`, `flight-support.js`). | Jede Korrektur muss mehrfach gemacht werden; Abweichungen schleichen sich ein. |
| Bewegung | Geschwindigkeit ist ein Skalar (`P.spd`), die Kurve eine Formel aus Querlage, Nick und Roll folgen einer Feder zum Zielwinkel. | Energie stimmt nur dort, wo extra eine Formel dafür steht (Steigen/Sinken, Leerlaufbremse, Induktivwiderstand). |
| Schub | Eigenes Gesetz mit Faktor λ ≈ 2,3–3,5 über dem realen Schub (Build 211). | Dauerkurvenleistung, Steigen und Höchstfahrt sind nur in der Größenordnung vergleichbar. |
| Start | `GroundRun.step`: skalare Beschleunigung mit festen Konstanten (5,5 m/s² Propeller, 6,8 Jet, 9,5 Träger), skriptierte Freigabe nach Fahrt (`Handling.departure`). | Rotation, Abheben und Steigen sind Regeln, keine Folgen von Kräften. |
| Landung | `GroundRun.landing` und Sonderpfade: Rhein `beginLandingRoll`/`updateLandingRoll`, Pazifik `trap`, `bolter`, `updateArrestRun`, `resolveGroundAndDeck`. | Dieselbe Landung wird in zwei Spielen unterschiedlich gelöst. |
| Gegner-KI | `flyAI` (Rhein), `updateEnemyAir`, `updateBomber`, `guideWingman` (Rottenflieger), `updateZeros`/`updateRaiders`/`updateJapaneseRaider` (Pazifik). | Gegner fliegen mit eigener Kinematik und halten dieselben Grenzen wie der Spieler nur zufällig ein. |
| Kopplung | 51 verschiedene `P.*`-Felder allein im Pazifik-Spiel; HUD, Kamera, Ton, Schaden, Checkpoints lesen sie direkt. | Jeder Umbau muss einen Adapter mitbringen. |

## 2. Ziele und Nicht-Ziele

**Ziele**
1. Ein Flugkern, den Spieler, Gegner, Rottenflieger und Tests gleichermaßen benutzen.
2. Unterschiede zwischen den zehn Typen entstehen aus Datenblatt-Werten (Masse, Fläche, Leistung, Widerstand, Auftrieb), nicht aus Faktoren pro Typ im Code.
3. Start, Landung und Trägerbetrieb folgen aus Kräften und Kontakten, nicht aus Skripten.
4. Gegner steuern über dieselben Befehle wie der Spieler und haben dieselben Grenzen.
5. Jede Stufe ist über Kennzahlen prüfbar (Abschnitt 8), bei 20/60/120 FPS gleich.

**Nicht-Ziele**
- Kein volles 6-DoF mit aerodynamischen Momenten. Auf dem Touchscreen gibt es kein Trimmen und keine Rückmeldung; das wäre kaum steuerbar.
- Keine Motorführung (Gemisch, Drehzahlverstellung, Überhitzung).
- Kein neues Schadensmodell, keine neue Ballistik, keine neuen Flugzeugmodelle.
- Kein Mehrspieler.
- Das alte Europa (`thunderbolt-europe.html`) wird nicht migriert, sondern eingefroren (siehe Abschnitt 10).

## 3. Zielarchitektur im Überblick

```
Stick / Gas / Klappen / Fahrwerk          KI-Pilot (Entscheidung → Führung)
            │                                         │
            └────────────►  Steuergesetz  ◄───────────┘
                     (Befehl: n, Rollrate, Gas, Konfiguration)
                                   │
                                   ▼
        FlightCore (reine Funktion, fester Schritt, deterministisch)
        Kräfte: Auftrieb, Widerstand, Schub, Schwerkraft, Wind
        Boden: Radkontakt, Bremsen, Deck, Katapult, Fangseil
                                   │
                                   ▼
        Adapter → P.pos, P.spd, P.vSpeed, P.pitch, P.roll, P.hull … (HUD, Kamera, Ton, Schaden, Checkpoint)
```

Dateien (Vorschlag, alle ohne DOM und ohne THREE, damit sie in Node testbar sind):

| Datei | Aufgabe |
|---|---|
| `flight-core.js` | Zustand, Integrator, Kräfte. |
| `flight-sheet.js` | Datenblätter der zehn Typen (wächst aus `flight-envelope.js`). |
| `flight-control.js` | Steuergesetz, Hüllenschutz. |
| `flight-ground.js` | Radkontakt, Bremsen, Katapult, Fangseil, Wasser. |
| `flight-pilot.js` | KI-Piloten. |
| `flight-adapter.js` | Abbildung Kernzustand ↔ `P.*`, Checkpoint-Schema. |

## 4. Der Flugkern

**Schritt:** fester Schritt 1/120 s mit Akkumulator; Rendern interpoliert. Das macht das Verhalten bildratenunabhängig und deterministisch.
Obergrenze: höchstens 8 Teilschritte pro Frame, sonst Zeit abschneiden (kein Todesspirale-Effekt auf dem iPad).

**Zustand je Flugzeug:** Ort `x`, Geschwindigkeit `v` (gegenüber dem Boden), Orientierung `q`, Drehraten `ω`, Masse `m` (Rumpf + Kraftstoff + Außenlasten),
Konfiguration (Klappen, Fahrwerk, Haken, Sturzflugbremse, Gas), Wind `w` aus der Umgebung. Luftgeschwindigkeit `va = v − w`.

**Kräfte (Windachsen):**

| Kraft | Modell |
|---|---|
| Auftrieb | `L = ½ρ·V²·S·CL`. `CL(α)` linear bis `α_s`, dann weicher Abfall (Überziehen). `CLmax` hängt von der Klappenstellung ab. |
| Widerstand | `D = ½ρ·V²·S·(CD0(Konfig) + k·CL²)` mit `k = 1/(π·AR·e)`. Plus Wellenwiderstand ab `Mcrit` (P-47-Sturzflug, Me 262, Komet). |
| Schub (Propeller) | `T = min(η(V)·P(h)/V, T_stat)` mit Leistung über Höhe (Lader), Propellerwirkungsgrad `η`. Leerlauf: windmühlender Propeller `½ρV²·A_Scheibe·C` (aus Build 215). |
| Schub (Jet) | `T(h, M)` mit Dichteabnahme und langsamem Hochlauf (Me 262: 2,6 s, bleibt). |
| Schub (Rakete) | Konstant bis Brennschluss, Masse sinkt mit dem Verbrauch (Komet). |
| Schwerkraft, Wind | Standard; Böen kommen aus dem bestehenden Wettersystem. |
| Bodeneffekt | Widerstand sinkt, Auftrieb steigt unter etwa einer halben Spannweite Höhe. |

**Lasten:** Das Steuergesetz gibt ein Lastvielfaches `n_cmd` vor. Der Kern löst `CL = n·m·g / (q·S)` auf. Ist `CL > CLmax`, begrenzt der Kern auf `CLmax`
(beschleunigtes Überziehen: wer hart zieht, verliert Auftrieb und schmiert über die Fläche ab, das ist der Unterschied zwischen P-47 und Bf 109 bei niedriger Fahrt).
Beim Überziehen: Schütteln, dann Abkippen über den Flügel mit geringerem Auftrieb (bei Schaden einseitig). Immer wieder abfangbar.

**Kurvenrate ergibt sich:** `ω = g·√(n²−1)/V`. Die heutige Formel mit `ARC.turn` bleibt als **einziger, offen deklarierter Arcade-Faktor** auf dem Lastvielfachen
(nicht auf der Kurvenrate), damit Energieverlust in der Kurve konsistent mit dem Widerstand bleibt.

**Rollen:** Rollrate `p` folgt dem Befehl `p_cmd` erster Ordnung mit Zeitkonstante aus dem Datenblatt; Obergrenze `p_max(V)` ist die heutige Kurve (Anstieg ∝ V^0,8, Abfall durch Steuerkraft).
**Gieren:** automatisch koordiniert; Schiebewinkel nur bei Schaden, Seitenwind, Bodenlauf und Propellerdrehmoment bei Startgas (kleiner, deklarierter Effekt).

## 5. Datenblatt (Erweiterung von `flight-envelope.js`)

Je Typ, jeder Wert mit Quelle und Vertrauensstufe A/B/C (wie bisher; „assumed“ bleibt ausdrücklich so beschriftet):

| Gruppe | Felder |
|---|---|
| Masse | Leermasse, Kraftstoff (intern/extern, Dichte), Lasten (Bomben, Raketen, Torpedo), Schwerpunktverschiebung wird **nicht** modelliert. |
| Fläche | Spannweite, Fläche, Streckung, Oswald-Faktor `e`, Auftriebsanstieg, `CLmax` sauber/Landeklappen. |
| Widerstand | `CD0` sauber, Fahrwerk, Klappen je Stufe, Haken, Sturzflugbremse, Außenlast; `Mcrit` und Wellenwiderstand. |
| Antrieb | Leistung über Höhe (Ladergang), Propellerdurchmesser, Blattzahl, `η(V)`; Jet-Schubkurve; Raketenschub und Brenndauer. |
| Grenzen | Strukturlast, `Vne`, Rollrate (veröffentlicht), Steuerkraft-Abfall. |
| Boden | Spurweite, Radstand, Reifenradius, Federweg, Bremswirkung, Spornrad/Bugrad. |
| Träger | Hakenabstand, Katapult-Endgeschwindigkeit (US) bzw. Startlauf (japanisch), zulässige Fangseil-Kraft. |

**Kalibrierskript (`scripts/flight-fit.cjs`):** passt `CD0` und einen Leistungs-Skalierer je Typ an veröffentlichte Eckwerte an
(Höchstfahrt auf Meereshöhe und Höhe, Anfangssteigrate, Überziehgeschwindigkeit) und druckt eine Fehlertabelle. Wer neue Daten findet, ändert nur das Blatt.

**Arcade-Anteil an einer Stelle:** `ARC` in `flight-sheet.js` (Lastvielfaches-Gewicht, Rollverstärkung, Nickverstärkung) plus ein deklarierter
Beschleunigungsgewinn für die Spielhilfe, der den heutigen Faktor λ ersetzt, sobald das Leistungsmodell trägt. Nie pro Typ.

## 6. Steuergesetz

Der Kern kennt weder Stick noch Touch. Das Steuergesetz übersetzt in physikalische Befehle und schützt die Hülle.

| Modus | Eingabe → Befehl |
|---|---|
| Normal | Stick-X → Zielquerlage (bis ~85°), Stick-Y → Zielnicklage; das Gesetz erzeugt daraus `p_cmd` und `n_cmd` (Winkel halten, Loslassen richtet auf, wie heute). Koordinierte Kurve hält das Lastvielfache `1/cos φ` und gleicht Höhenverlust aus. |
| AERO | Stick-X → Rollratenbefehl, Stick-Y → Lastvielfaches `n_cmd`. Kein Aufrichten. Loops bis zum Ende möglich, wenn die Einflugfahrt reicht (Mindestfahrt aus dem Datenblatt, wie `aeroGate`). |
| Hüllenschutz | `n_max = min(Struktur, CLmax·q·S/(m·g))`, weicher Anstellwinkelbegrenzer, Warnung vor dem Überziehen, Mach-Grenze. |
| Schaden | Beschädigte Querruder, Höhenruder oder Klappen wirken als Verschiebung von `p_cmd` und verkleinerte Autorität (das bestehende System wird abgebildet). |
| Hilfen | Rookie: Lenkhilfe am Boden und Fluglagehalten; Ace: keine. Als Schwierigkeit sichtbar, nie versteckt. |

## 7. Boden, Start, Landung, Träger

**Radkontakt:** Je Rad ein Feder-Dämpfer-Kontakt am gerenderten Boden (die Reifen-/Kufenpunkte liefert `AircraftGround` schon).
Roll-Reibung nach Untergrund (Piste, Gras, Erde, Deck), Bremse mit Differenzbremsung, Bug-/Spornradlenkung, Windfahne bei Seitenwind.
Kufe und Bauchlandung: Gleitreibung statt Rad (ersetzt das Sonderpaar `skid` in `GroundRun.landing`).

**Start:** Aus Schub minus Widerstand minus Rollreibung. Abheben, wenn Auftrieb das Gewicht trägt; Rotation per Stick, wirksam mit `q`.
Die skriptierte Freigabe (`Handling.departure`) entfällt; was bleibt, ist der Hüllenschutz. Rookie-Hilfe hält die Bahnrichtung.
Zielwert je Typ: Rollstrecke bis Rotation entspricht dem heutigen Spielwert (damit die Pisten passen), danach wird zum Datenblatt hin geprüft.

**Träger:**
- Das Deck ist ein bewegtes Bezugssystem (Fahrt, Wind über Deck, leichte Nick-/Rollbewegung).
- Katapult (US): Kraftprofil `F(t)` bis zur Endgeschwindigkeit des Typs; Deckstart (japanisch und Rest): Schub plus Wind über Deck.
- Fangseil: Haken-Punkt gegen Seilposition; trifft er, wirkt eine Kraft-Weg-Kurve mit Dämpfer (Bremsweg ergibt sich aus Masse und Auftreffgeschwindigkeit), Seil gibt nach und fährt zurück.
- Bolter: kein Seilkontakt, Kontakt am Deck bleibt, Gas durch den Spieler. Haken oben → kein Fangen (Verhalten wie heute).

**Landung:** Anflugreferenz aus dem Datenblatt (1,3·Vs je Konfiguration, wie heute gespielt). Abfangen entsteht aus Bodeneffekt und Nicksteuerung.
Kontaktlösung liefert Aufsetzgeschwindigkeit, Sinkrate, Querlage, Versatz; daraus die heutige Bewertung (`CarrierRecovery.landing`) und Schadensgrenzen (Fahrwerksbruch → Bauchlandung).
Wasser (Notwasserung): Aufprallzustand kommt aus dem Kern, die bestehenden Regeln (`canDitch`, Rettungsablauf) bleiben.

## 8. Gegner-KI

Piloten sind keine Kinematik, sondern vier Schichten:

1. **Wahrnehmung:** Kennt Ziele mit Verzögerung und Messfehler je Schwierigkeit (Reaktionszeit, Zielfehler). Sehweite nach Tageszeit/Wetter (die Kapitäne-Logik aus Build 202 bleibt als Vorbild).
2. **Entscheidung:** Zustandsautomat je Aufgabe: Patrouille, Abfangen, Angriff, Ausweichen, Lösen, Rückflug, Formationsflug, Bombenanflug, Torpedoanflug, Landung.
3. **Führung:** Verfolgungskurve (Reinverfolgung weit weg, Vorhalt in Schussentfernung, Nachlauf bei Überschuss); einfache Energieregel je Typ
   (Kurvenkampf für Zero und Bf 109, Sturzangriff mit Steigflug für P-47 und Fw 190, Durchbruch für Me 262); Ausweichen bei Beschuss mit Rollen und Abtauchen.
4. **Steuerung:** Dieselben Befehle wie der Spieler, durch dasselbe Steuergesetz. **Schwierigkeit verändert Entscheidungsqualität (Reaktion, Zielen, Energiebewusstsein), nie Flugleistung.**

Sonderfälle: Bomber fliegen Formation mit Plätzen und festen Lastgrenzen (heutige Bordwaffenlogik bleibt). Rottenflieger behalten `guideWingman` als Führungsschicht;
ihre Ratenbegrenzungen folgen künftig aus dem Kern. Pazifik-Raider fliegen Angriffsprofile (Höhe, Fahrt, Abwurffenster).

**Rechenzeit:** Nahe Gegner mit 60 Hz, entfernte mit 30 Hz, sehr ferne mit vereinfachter Fortschreibung desselben Zustands. Obergrenze aktiver Piloten wird beim Start gemessen und festgelegt.
**Wiederholbarkeit:** Zufallsentscheidungen kommen aus einem je Einsatz gesetzten Startwert; so lassen sich Luftkämpfe in Tests wiederholen.

## 9. Abnahme (Kennzahlen, bevor irgendetwas gefühlt wird)

Toleranzen sind Vorschläge; die Datenlage ist überwiegend Sekundärquelle (B/C), daher bewusst weit.

| Prüfung | Toleranz (Vorschlag) |
|---|---|
| Höchstfahrt auf Meereshöhe und Höhe, je Typ | ±5 % vom Datenblatt |
| Anfangssteigrate | ±10 % |
| Überziehgeschwindigkeit sauber / Landekonfiguration | ±5 % |
| Momentane Kurvenrate bei Eckgeschwindigkeit | ±10 % |
| Rollratenkurve bei 45/70/90 % Vmax | ±15 % |
| Leerlauf-Verzögerung bei 50/75 % Vmax | nicht schlechter als Build 215 |
| Gleitzahl bei Leerlauf | ±10 % |
| Energieerhaltung (Schub 0, Widerstand 0) | Gesamtenergie driftet < 0,1 % in 60 s |
| Bildratenunabhängigkeit 20/60/120 FPS | Position nach 60 s Flug < 2 m Unterschied, Zeit bis Rotation < 0,05 s |
| Determinismus | Gleicher Startwert → gleicher Hash des Zustands nach 120 s |
| Loops aus Einflugfahrt (AERO), Kamera hinter der Nase | alle zehn Typen, 0 % der Frames vor der Nase (Bestand) |
| Start | Rollstrecke bis Rotation je Typ innerhalb ±10 % des heutigen Spielwerts; Baumfreiheit 4/8 s weiter (Bestand) |
| Landung | Anflugreferenz, Bewertung, Fangen/Bolter wie `carrier-recovery`/`field-landing` (Bestand) |
| Luftkampf | Gleiche Paarungen im Kampfsimulator: Gewinnrate Zero↔P-47, Bf 109↔P-47 im plausiblen Bereich (Zero im Kurvenkampf, P-47 im Sturz), keine Gegnerflugleistung über Spielerniveau |
| Rechenzeit | Kern + 12 Piloten < 2 ms je Frame im Node-Test (iPad nicht gemessen) |

Bestehende Tests, die erhalten bleiben und angepasst werden: `flight-envelope.cjs`, `flight-envelope-browser.cjs`, `fleet-flight-browser.cjs`, `pitch-response.cjs`,
`handling-quality*.cjs`, `carrier-start-browser.cjs`, `carrier-recovery*.cjs`, `field-landing*.cjs`, `formation.cjs`, `ditch-formation-browser.cjs`, `komet-recovery.cjs`,
`aero-camera.js`, `aerobatics.js`, `flight-controls.js`. Neu: ein Test, der das Datenblatt gegen alle Kennzahlen prüft, ein Energie-/Determinismus-Test und ein Luftkampf-Simulator ohne Grafik.

## 10. Meilensteine

Aufwand ist eine grobe Schätzung in Arbeitstagen, nicht zugesagt. Jeder Meilenstein ist einzeln lieferbar und hat einen Rückfall.

| M | Inhalt | Abnahme | Aufwand | Rückfall |
|---|---|---|---|---|
| M0 | Absichern: Kennzahlen des heutigen Verhaltens als Test festschreiben (Vollkreis, Rollrate, Start, Landung, Bildraten), Kennzahlen-Skript. | Alle grün auf Build 215. | 1–2 | – |
| M1 | `flight-sheet.js`, `flight-fit.cjs`, Fehlertabelle. Noch kein Spiel berührt. | Fehlertabelle zeigt, wo das Datenblatt noch nicht trägt. | 2 | nicht nötig |
| M2 | `flight-core.js` + `flight-control.js` für den Spieler im Pazifik hinter Schalter `?core=1`. | Abschnitt 9 für Flug (ohne Boden), Spielgefühl von dir auf dem iPad bewertet. | 4–6 | Schalter aus |
| M3 | Rhein auf den Kern, die beiden anderen `updateFlight`-Kopien löschen. | Beide Spiele laufen mit demselben Kern; alte Flugtests grün. | 2–3 | Schalter aus |
| M4 | `flight-ground.js`: Radkontakt, Start, Landung, Bremsen, Bauchlandung. | Start- und Landetests aller zehn Typen bei 20/60/120 FPS. | 4–5 | alter `GroundRun` per Schalter |
| M5 | Träger: Katapult, Fangseil, Bolter, bewegtes Deck. | `carrier-start`, `carrier-recovery`, `ship-contact` grün; neue Seilkraft-Tests. | 4–5 | alter Trägerpfad per Schalter |
| M6 | KI-Piloten: Wahrnehmung, Entscheidung, Führung, Steuerung; Rottenflieger, Bomber, Raider. | Luftkampf-Simulator, `formation`, Missionstests; kein Gegner über Spielerniveau. | 5–7 | alte KI per Schalter |
| M7 | Feinabstimmung nach Spielgefühl, Altlasten löschen (Schalter, Doppelcode), Doku. | Du bestätigst auf dem iPad. | laufend | – |

Reihenfolge-Empfehlung: M0 → M1 → M2 und dann **stoppen**, damit du auf dem iPad prüfst, ob sich das Fliegen besser anfühlt, bevor Boden und KI angefasst werden.

## 11. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Spielgefühl kippt (bisher mehrfach „zu träge“ ↔ „zu aggressiv“). | M0-Kennzahlen vorher/nachher, Normal-Modus bekommt dasselbe Aufricht- und Haltegefühl wie heute, du testest nach M2 und M4. |
| Datenlage ist dünn (Sekundärquellen, `assumed`). | Weite Toleranzen, Quellen am Wert, Fehlertabelle. Das Modell wird konsistenter, nicht automatisch „wahr“. |
| Leistungsmodell ändert Höchstfahrt und Steigen spürbar, weil λ entfällt. | Deklarierter Beschleunigungsgewinn, eingestellt über M1-Tabelle, nie versteckt. |
| Checkpoints (`sortie-checkpoint.js`, Schema 1/196) enthalten `P.*`-Zustand. | Adapter + neue Kompatibilitätsstufe; alte Stände werden erkannt und auf Bauchlandung/Flugzeug am Boden zurückgesetzt, nicht stillschweigend geladen. |
| HUD, Kamera, Ton, Schaden hängen an `P.*`. | Adapter hält die Felder; erst nach M7 werden sie schrittweise entfernt. |
| iPad-Rechenzeit (feste 120 Hz plus KI). | Schrittbegrenzung, KI-LOD, Messung im Node-Test; echte Messung nur durch dich. |
| Zwei Pfade parallel (alt/neu) werden zum Dauerzustand. | Schalter nur bis M7; Löschung ist Teil des Meilensteins. |

## 12. Entscheidungen, die du treffen musst

Empfehlung jeweils zuerst.

1. **Realismusgrad:** Arcade mit ehrlicher Energie (empfohlen) statt volle Flugsimulation oder weiter wie bisher.
2. **Steuergefühl:** Normal-Modus soll so bleiben wie heute (empfohlen); der Kern muss es nachbilden, nicht ändern.
3. **Hilfen:** Start- und Landehilfe als Rookie-Stufe sichtbar (empfohlen) statt allgemein an oder aus.
4. **Erst Pazifik, dann Rhein** (empfohlen): Im Pazifik sind Träger- und Bodenfälle am anspruchsvollsten, dort zeigt sich früh, ob der Ansatz trägt.
5. **Altes Europa einfrieren** (empfohlen): `thunderbolt-europe.html` bleibt unverändert als Classic.
6. **λ ersetzen:** Ehrliches Leistungsmodell mit deklariertem Gewinn (empfohlen) oder λ vorerst als Fremdkörper im Kern belassen und später lösen.

## 13. Was dieses Dokument nicht behauptet

- Keine der Toleranzen ist gemessen, keine Aufwandszahl ist zugesagt.
- Kein Wert aus dem Datenblatt ist eine Messung am Flugzeug; Roll-, Stall- und Lastgrenzen bleiben Größenordnungen (±30 %), solange nicht bessere Quellen vorliegen.
- Es gibt keinen iPad-Test des Konzepts; iPad-Rechenzeit und Spielgefühl kann nur dein Gerät zeigen.
- Es ist nicht entschieden, ob und wann M2 gebaut wird.
