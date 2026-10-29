# Analytic flight envelope — Build 215

Every ordinary flight-handling number of the ten playable aircraft is **derived from a data sheet of
real aircraft figures** (`flight-envelope.js`, table below). The game then applies a few declared
arcade gains **to the whole fleet alike** — never a per-type fudge — so the differences between a
Bf 109, a P-47 or a Zero are the real ones, just scaled for two thumbs on a tablet.

This replaces the hand-typed numbers of Builds 104–214 (`rollAuth`, `pitchAuth`, `turn`, `gLim`,
`TURN_K/TURN_CEIL`, the AERO `1.6·g·(gLim−1)/v` pull). It is a gameplay model, **not** a flight
simulator and not a claim of reproducing any performance chart. Thrust, drag at full power, climb,
stall/approach references, take-off and landing are unchanged (Builds 204–214).

## What changed for the player

| Complaint | Cause found by measurement | Now |
| --- | --- | --- |
| Bf 109 / Zero too aggressive | Full stick rolled every type at 94–195 deg/s regardless of speed; 360° turns in 5 s (≈ 8–10 g) | Roll rate follows the published curve of each type and **falls with speed** (Zero 167 → 88 deg/s from 85 → 150 m/s); turn rate is the load factor the wing can really pull × one fleet gain |
| P-47 too sluggish | The P-47 uses its realistic clean stall (51.9 m/s) while the others used arcade stalls of 29–39 m/s, so its lift-limited turn at 87 m/s took 12.6 s against 5 s for the others | One physical lift model for all ten types (P-47 87 m/s: 9.4 s, 136 m/s: 6.0 s); spread P-47 : Bf 109 at 80 m/s 1.35 instead of 2.5 |
| No loop in AERO, "I see the aircraft from the front" | The chase camera followed the *heading* with a compressed pitch; past vertical it ended in front of the nose (measured: 6–21 % of the frames of every loop, camera 180° round) | Camera follows the aircraft's own nose and wing axis; 0 % of frames in front of the nose; AERO entry gate derived per type |
| Aircraft barely slow down when power is cut | Clean fighters coast (P-47 0.7–1.0 m/s² at idle); no propeller drag was modelled | Windmilling-propeller drag (disc area / mass): P-47 1.6 / 2.9 m/s² at 50 / 75 % of top speed, others 2.0–3.7 |

## Data sheet

Confidence tags — **A**: published specification, several agreeing sources; **B**: one secondary or
test-derived figure; **C**: assumed class value (no figure found). Everything tagged C is a
declared assumption and is listed in `flight-envelope.js`.

| Type | m (kg) | S (m²) | b (m) | Power | Prop Ø (m) | Clean stall | n limit | Roll (peak deg/s @ m/s, fall exponent) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-47D-28 | 5 775 A | 27.87 A | 12.42 | 1 939 kW (2 600 bhp WEP) A | 3.99 | 51.9 m/s (116 mph) **A** | 7.0 C | 95 @ 130, 0.8 (B) |
| Bf 109F-2 | 2 890 A | 16.1 A | 9.92 | 750 kW (1 020 PS) A | 3.0 | 45 m/s (154–171 km/h IAS) B | 6.5 C | 100 @ 95, 1.7 (B) |
| Fw 190A-8 | 4 270 A | 18.3 A | 10.5 | 1 273 kW (1 730 PS) A | 3.3 | CLmax 1.4 → 51.7 C | 6.5 C | 150 @ 115, 0.55 (B) |
| Ju 87B-2 | 4 250 A | 31.9 A | 13.8 | 883 kW (1 200 PS) A | 3.3 | CLmax 1.5 → 37.7 C | 6.0 C | 55 @ 70, 1.0 (C) |
| Me 262A-1a | 6 473 A | 21.7 A | 12.65 | 2 × 8.8 kN A | — | CLmax 1.4 → 58.4 C | 5.5 C | 80 @ 120, 1.6 (C) |
| Me 163B | 4 110 B | 19.6 B | 9.3 | 14.7–16.7 kN B | — | CLmax 1.1 → 55.3 C | 6.0 C | 100 @ 120, 1.2 (C) |
| TBM-3 Avenger | 6 800 A | 45.52 A | 16.51 | 1 417 kW (1 900 hp) A | 4.01 | CLmax 1.4 → 41.3 C | 4.5 C | 50 @ 85, 1.0 (C) |
| SBD-3 Dauntless | 4 717 A | 30.19 A | 12.66 | 746 kW (1 000 hp) A | 3.5 | CLmax 1.4 → 42.3 C | 5.5 C | 70 @ 85, 1.0 (C) |
| F4U-1D Corsair | 5 461 A | 29.17 A | 12.5 | 1 491 kW (2 000 hp) A | 4.06 | CLmax 1.35 → 47.1 C | 7.0 C | 100 @ 130, 0.8 (B) |
| A6M2 Zero | 2 410 A | 22.44 A | 12.0 | 700 kW (940 hp) A | 2.9 | CLmax 1.4 → 35.1 C | 6.0 C | 115 @ 85, 1.5 (B) |

Reference weights are the game's reference loading (half internal tank, no external stores);
`SortieFeatures.Handling.sample()` still scales stall speed with the live load.

Sources consulted (28–29 October 2026; Wikipedia and Flying Magazine were not reachable from the build
environment, so no figure is taken from them):

- P-47D: USAAF 6 Oct 1944 comparison and Flight Test Engineering Branch report Eng-47-1774-A, see
  `assets/aircraft/P47-PERFORMANCE.md` (stall 116 mph clean at 13,230 lb, 12,731 lb reference).
- Bf 109F-4: [IL-2 museum page](https://il2sturmovik.com/museum/fighters/bf-109-f-4/) (stall 154–171 km/h IAS,
  climb 19.5 m/s); weight, wing area, power from the supplied Bf 109 reference PDF (see `CLAUDE.md`, Build 203).
- Fw 190A-8: [Eduard A-8/R2 sheet](https://archive.aeroscale.net/www.eduard.com/store/out/media/8428.pdf)
  (4 272 kg take-off, 17.5 m/s climb) and [Luftwaffe Resource Center](https://warbirdsresourcegroup.org/LRG/luftwaffe_focke_wulf_fw190_specifications_fw190a.html)
  (18.3 m², 1 730 PS take-off).
- A6M2: [HistoryNet](https://historynet.com/mitsubishi-a6m2/) (5 313 lb loaded, 241.5 ft², 940 hp, 3 100 ft/min);
  [Smithsonian](https://www.airandspace.si.edu/stories/editorial/mitsubishi-a6m-zero-fighter) (24.3 lb/ft²).
- TBM-3: [Hobby Master data](https://hobbymasterarchive.org/HA1220/) (490 ft², 17 893 lb max, R-2600-20 1 900 hp).
- SBD-3: [US Navy museum](https://history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/s/sbd-dauntless--sunken-treasure-.html)
  (10 400 lb gross), [migflug](https://migflug.com/afterburner/aircraft/sbd-dauntless/) (30.19 m², R-1820-52 1 000 hp).
- Ju 87B-2: [aeropedia](https://aeropedia.com.au/content/junkers-ju-87/), [airpages](https://airpages.ru/eng/lw/ju87b2.shtml)
  (31.9 m², 4 250 kg, Jumo 211Da 1 200 PS).
- Me 262: [Luftwaffe Resource Center](https://warbirdsresourcegroup.org/LRG/luftwaffe_messerschmitt_me262_specifications.html)
  (21.7 m², 2 × 8.8 kN, 6 473 kg).
- Me 163B: [aeropedia](https://aeropedia.com.au/content/messerschmitt-me-163-komet),
  [aerocorner](https://aerocorner.com/aircraft/messerschmitt-me-163-komet/) (4 110–4 309 kg, 19.6 / 18.5 m²).
- F4U-1D: compiled specification figures (12 039 lb normal take-off, R-2800-8W 2 250 hp, 3 120 ft/min).
- Roll rate: Corsair 90 deg/s at 290 mph IAS (graph truncated) from *America's Hundred Thousand* via
  [forum compilation](https://warbirdinformationexchange.org/phpBB3/viewtopic.php?p=47071); Fw 190A ≈ 150 deg/s near
  300 mph TAS ([compilation](https://warbirdinformationexchange.org/phpBB3/viewtopic.php?p=46878),
  [RAE measurement thread](https://forum.il2sturmovik.com/topic/6207-roll-measurements-fw-190-rae-1231));
  Zero 110–120 deg/s up to 200 mph with the ailerons stiffening above 200 kt (Navy Akutan tests, [US Navy history](https://usnhistory.navylive.dodlive.mil/Recent/Article-View/Article/2686500/platformsmatter-adding-a-zero-to-navy-know-how-equals-victory));
  Bf 109F-2 34 deg/s at 780 km/h TAS (DVL, 1944, secondary); P-47 71 deg/s maximum for an early D (Perkins & Hage via a secondary summary) against 103 deg/s quoted for the P-47N, so 95 deg/s is used. **These are secondary compilations of NACA/RAE/USN test data; treat each as ± 30 %.**
  They fix the order and the speed dependence, not an exact figure.
- Stick-force criterion behind the fall-off above the peak: NACA used 30 lb as the practical upper limit
  for high-speed aileron forces ([NTRS](https://ntrs.nasa.gov/api/citations/19930092942/downloads/19930092942.pdf)).

## Derivation

Notation: `V` true airspeed, `Vs` clean power-off stall, `n` load factor, `WL = m/S`.

1. **Stall and corner speed.** `CLmax = 2·m·g/(ρ·S·Vs²)` where the stall is documented (P-47, Bf 109),
   otherwise `Vs` follows from an assumed class `CLmax` (1.1 – 1.5). Corner speed `Vc = Vs·√n_limit`
   (Zero: 86 m/s = 310 km/h, in line with the ≈ 300 km/h quoted for the type).
2. **Load factor available** `n(V) = min(n_limit·cfg, (V/Vs_live)²)`; `Vs_live` carries load (√mass ratio),
   flap CLmax gain (−15.5 % stall speed at full flaps, from the documented P-47 98/116 mph) and damage penalties; `cfg` is the existing gear/flap derating.
3. **Turn.** Heading rate `ω = G_turn · g·√(n_used²−1)/V`, `n_used = 1 + (n−1)·f(bank)`, with `n ≥ 1.15` as an arcade assist so the wings can always be banked a little,
   `f = sin(bank)/sin(55°)` clipped to 1 — the stick selects 0…100 % of what the airframe can deliver.
   Above the corner speed the rate falls like `g/V` (all fighters turn alike), below it the wing loading and CLmax decide.
4. **Roll.** `p(V) = p_peak·min(V/V_pk, (V_pk/V)^k)`: helix-angle-limited rise (`(V/V_pk)^0.8`, matching the Perkins & Hage ratio of roughly 0.5 at 87 kt) then
   stick-force/wing-twist fall-off. The game rate is `100·(p/100)^0.65·1.5` deg/s (compression towards the fleet
   mean + gain). The attitude spring's natural frequency is solved so its **peak rate equals this value**
   (`handling()`; spring peak `exp(−ζ·atan(√(1−ζ²)/ζ)/√(1−ζ²))`, 0.424 at ζ = 0.8).
5. **Pitch.** Spring frequency scales `pitchClass·(190/WL)^¼` (short-period frequency falls with wing loading
   and length). A cap `q ≤ G_pitch·g·(n − cos θ)/V` (never below 0.25 rad/s so take-off and trap keep their
   assisted authority) keeps the wing from out-pitching its lift. AERO pull uses the same cap.
6. **Closed-throttle braking.** `a = ½ρV²·A_disc·C_wm/m` (windmilling propeller, `C_wm = 0.07`), fading to zero by
   30 % power; jets none. Full-throttle speed is untouched.
7. **Energy.** The load factor actually flown (turn or pull, with the pitch gain removed) feeds the induced
   drag term as `1 + 0.30·(WL/190)·(n²−1)` instead of the old bank proxy.
8. **AERO entry.** `aeroGate = max(1.5·Vs, simulated minimum loop entry × 1.08)`; the simulation runs the shipped
   pull law and `FlightDynamics.step` and requires the aircraft to stay above its stall over the top.

## Arcade gains (the only knobs)

`ARC` in `flight-envelope.js`: `turn 2.2`, `pitch 2.6`, `pitchFloor 0.25 rad/s`, `rollGain 1.5`, `rollGamma 0.65`
(1 = realistic spread, 0 = every aircraft rolls alike), `bankSat 55°`, `windmill 0.07`, `inducedBleed 0.30`.
Per-type numbers are never edited — change the data sheet if a figure turns out wrong.

## Verification

`scripts/flight-envelope-report.cjs` prints/exports the derived table (`app/release/flight-envelope.json`).
`okinawa/tests/flight-envelope.cjs` (model properties, fleet ordering, braking, energy cost, AERO gate) and
`okinawa/tests/flight-envelope-browser.cjs` (shipped `updateFlight`/`updateCamera` in both campaigns: roll, turn,
pitch, closed-throttle braking, loop from the gate speed with the camera never ahead of the nose, 20/60/120 FPS).
Measurements before/after: `app/release/flight-envelope-validation.json`.

These are Chromium/SwiftShader functional measurements. They do not establish how the model feels on an iPad;
the arcade gains exist precisely so that can be tuned after a real test.
