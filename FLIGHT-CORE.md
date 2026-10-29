# Berechneter Flugkern — erster Typ: P-47D

Stand 29.10.2026, nur im Rheinspiel (`remagen-mission.html`) und nur für die Luftphase der P-47.
Start-Rollstrecke, Landung, Gegner-KI und alle anderen Typen sind unverändert.
Code: `flight-core.js`. Nachrechnung: `node scripts/flight/derive-p47.cjs`
(schreibt `app/release/flight-core-p47.json`). Spieltest im echten Code:
`okinawa/tests/p47-core-browser.cjs` (schreibt `app/release/flight-core-p47-browser.json`).

## Grundsatz

Kein Kraftbeiwert ist von Hand gesetzt. Das Flugzeug wird nur durch veröffentlichte Zahlen
beschrieben; Widerstand, Propellerwirkungsgrad und Leistungsabfall mit der Höhe werden beim Laden
**aus den gemessenen Flugleistungen gelöst**. Werte ohne Quelle stehen getrennt in `ASSUMED`
(Kennung C), die Entscheidungen des Spiels (wie der Knüppel in eine Last übersetzt wird, eine
Manöver-Verstärkung) getrennt in `GAME`. Es gibt keine Werte pro Typ zum Nachstellen.

## Quellen (Kennung A = Primärdokument, B = übereinstimmende Sekundärangaben)

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

## Physik

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

## Gelöst aus den sechs AAF-Werten

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

## Nachrechnung gegen die Quellen

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

## Ohne Quelle verwendet (Kennung C)

| Wert | Grund |
|---|---|
| Lastgrenze +7,0 / −3,0 g | keine P-47-Zahl gefunden; +7 aus FLIGHT-ENVELOPE.md |
| inverses CLmax = 0,6 × CLmax | gewölbtes Profil, Klassenwert |
| Mcrit 0,72 | Berichte zu P-47-Sturzflügen nennen etwa Mach 0,7 |
| ΔCD Fahrwerk 0,020, Klappen 0,050, Zusatztank 0,006 | keine Messung gefunden |
| Leerlauf-Propellerbremse 0,07 (Scheibenfläche) | aus FLIGHT-ENVELOPE.md |
| Leistungsaufbau 1,25 s | aus flight-dynamics.js |

Masse im Spiel: 5 775 kg × Beladungsfaktor aus `SortieFeatures.Handling.sample` (Spielwert).

## Was das Spiel festlegt (keine Flugzeugdaten)

- **Manöver-Verstärkung 2,2**: Die Drehung der Flugbahn (Kurven, Hochziehen) läuft 2,2-mal schneller
  als in der Physik, für zwei Daumen am Tablet. Kräfte, Widerstand und Energie werden **nicht**
  verstärkt: Eine harte Kurve kostet pro Sekunde genau die reale Fahrt. `?p47core=physics` schaltet
  auf 1 (reine Physik), `?p47core=off` auf das bisherige Modell.
- **Normal-Modus**: Knüppel quer = Querlage einer Horizontalkurve mit demselben Anteil der
  verfügbaren Last wie im bisherigen Gesetz (voller Ausschlag = engste Kurve, die der Flügel bei
  dieser Fahrt halten kann; bei wenig Fahrt automatisch flacher, mindestens 30°). Knüppel längs =
  Bahnwinkel, selbstzentrierend: die unveränderte Lage-Feder aus Build 214/215 (gleiche Ziele,
  Startgrenzen, Dämpfung) erzeugt die Sollbahn; der Flügel fliegt sie, soweit sein Lastvielfaches
  reicht (Vorsteuerung der Sollrate, Rest über `T_θ2`). Innerhalb der Grenzen also das gewohnte
  Nickgefühl, an der Grenze (wenig Fahrt, hohe Last) entscheidet die Physik.
- **AERO**: Ziehen = Lastvielfaches (neutral hält die Bahn, voll = was der Flügel kann),
  Rollen wie bisher.
- Rollrate unverändert aus FLIGHT-ENVELOPE.md (Quelle B, ±30 %).

## Folgen fürs Spiel (aus dem Kern, 1 000 m, Vollgas)

| | Verstärkung 2,2 | reine Physik |
|---|---|---|
| Vollkreis ab 72 m/s (45 % Vmax) | 15,3 s | 37,8 s |
| Vollkreis ab 113 m/s (70 % Vmax) | 8,3 s | 20,0 s |
| Looping ab 140 m/s | 7,4 s, min. 108 m/s | 18,9 s, min. 73 m/s |
| AERO-Freigabe (Loop ohne Unterschreiten der 1-g-Stallfahrt, +8 %) | 93,2 m/s | 131,8 m/s |
| Leerlauf-Verzögerung bei 80 / 121 m/s | 1,24 / 2,13 m/s² | gleich |
| Beschleunigung Vollgas bei 80 / 121 m/s | 1,97 / 0,96 m/s² | gleich |

Energieerhaltung (ohne Schub und Widerstand, 60 s Manöver): Drift 0,005 %.
20 / 60 / 120 FPS: identisches Ergebnis.

## Nicht behauptet

- Kein iPad-Test, kein Hörtest, kein Spielgefühl-Nachweis — das entscheidet nur der Flug auf dem Gerät.
- Die P-47 hat keine gemessene Rollrate, kein Trägheitsmoment, keine Klappen-/Fahrwerkswiderstände
  in den verfügbaren Quellen; NACA-Berichte (NTRS) waren aus dieser Umgebung gesperrt.
- Die Steigwerte setzen den Steigflug mit konstanter IAS voraus (übliches Verfahren der Datenblätter).
- Anstellwinkel wird nicht dargestellt (Rumpf zeigt in Flugrichtung), Seitenwind ändert nur die Spur.
