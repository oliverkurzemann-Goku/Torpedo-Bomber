# Fleet handling and engine audio — Build 215

## Build 215 — analytic flight envelope (29 October 2026)

Roll, pitch, turn, closed-throttle braking and the AERO loop are no longer hand-typed per aircraft.
They are derived from a data sheet of real figures (mass, wing area, power, propeller size, clean
stall, load limit, published roll rates) and scaled by a few fleet-wide arcade gains. Derivation,
sources, confidence tags and measurements: [`FLIGHT-ENVELOPE.md`](FLIGHT-ENVELOPE.md). The AERO chase
camera now follows the aircraft's own nose and wing axis (it used to follow the heading and ended up in
front of the nose over the top of a loop). Thrust, drag at full power, take-off and landing references
are unchanged from Build 214.

## Build 214 and earlier (kept for reference)


## Build 214 — loaded radial sound (28 October 2026)

P-47 uses a new 25-second onboard flying R-2800 recording from Pole Position
Production's Grumman F8F Bearcat selection in the free SONNISS GameAudioGDC 2017
bundle. The onboard microphone travels with the aircraft, avoiding an exterior
pass-by Doppler sweep. The P-47 exhaust installation is adapted; source RPM and
manifold pressure are unmeasured. This is not a calibrated 2,700-RPM P-47 take.

Fw 190 and Avenger use an explicitly composite loaded game voice: airborne R-2800
exhaust texture retimed at 14/18, mixed with low-band R-2600 texture from the B-25
exterior startup/idle recording. This is not an original BMW 801 or Avenger
full-power take, and is not a physical firing-order reconstruction. Existing
idle recordings are retained. Separate power playback rate and an earlier
idle/load crossfade make throttle affect timbre as well as level.

Sources: [free GDC collection](https://sonniss.com/gameaudiogdc/),
[Bearcat](https://sonniss.com/sound-effects/grumman-f8f-bearcat/),
[B-25](https://pole.se/product/north-american-b-25-mitchell/),
[SONNISS GDC Bundle License](https://sonniss.com/gdc-bundle-license/), v2.0 effective
27 August 2026, acquired 28 October 2026. The selected free bundle recordings permit
incorporation and modification in commercial/noncommercial games and interactive
projects; attribution is not required. No standalone sound/sample-library
redistribution or AI training. Only edited game loops are included here; raw
source WAVs remain outside the public checkout and app payload.

Exact source identities, archive ranges, SHA-256 values, cuts, transformations and
output hashes are in `audio/engines/loaded-provenance.json`. Rebuild with
`scripts/engine-audio/build-loaded-radials.py --source-dir <external-source-dir>`;
`scripts/engine-audio/fetch-loaded-sources.py --dest <external-source-dir>` acquires
only the two used free bundle files. Seven other aircraft voices remain as in
Build 213. Actual Web Audio tests cover 60-second sustain and timed idle/full/idle
transitions; numerical results do not establish subjective iPad listening quality.
The reported P-47 lift-off difficulty is still open; no flight tuning in this build.

Ten playable aircraft now use finite acceleration, engine response and speed-dependent
control authority. The assisted stick, self-levelling, difficulty choices, weapons and
mission rules remain. This is an arcade balance pass, not a certified flight simulator.

| Aircraft | Intended handling | Engine sound |
| --- | --- | --- |
| P-47D | Heavy, stable, good coasting; deliberate low-speed acceleration | Deep R-2800, 18-cylinder radial, four-blade propeller |
| Bf 109F-2 | Light response, stronger low-speed acceleration/climb, tighter ordinary turns; controls stiffen at speed | Smoother DB 601 V12 exhaust |
| Fw 190A-8 | Faster roll response to its commanded bank; hard turns shed more energy | Rougher BMW 801, 14-cylinder radial |
| Ju 87B-2 | Deliberate roll, modest climb, strong dive-brake drag | Stuka-labelled archival film effect |
| Me 262 | Slow engine spool, highest sustained speed, wider turns | Continuous turbine/airflow sound |
| Me 163 | Strong rocket acceleration, then an unpowered energy-limited glide | Separate rocket roar; silent combustion at cutoff |
| TBM Avenger | Heavy inertia, slow acceleration, stable approach | Adapted recorded BMW 14-cylinder radial; not R-2600 audio |
| SBD Dauntless | More responsive than the Avenger, steady dive and recovery | Single radial recording adapted as a game voice; not R-1820 audio |
| F4U Corsair | Strong power, faster flight, more inertia than the Zero | R-2800 family recording adapted from P-47 |
| A6M Zero | Tight low-speed turns, fast response; reduced high-speed roll authority | Adapted recorded BMW 14-cylinder radial; not Sakae audio |

## Flight implementation

`flight-dynamics.js` is shared by both current campaigns and the older European page.
Ordinary propeller aircraft use power/speed thrust, quadratic drag and an induced-drag
term that increases with load and bank. Gear, flaps, external tank, dive brakes and damage
cost performance. Pitch trades speed for height. There is no instantaneous spring toward
a throttle-derived target speed and no minimum thrust when fuel is exhausted.

The existing P-47 historical envelope and declared arcade acceleration assistance are
retained in `p47-performance.js`; the Me 262 retains `me262-performance.js`. The fleet
wrapper gives the P-47 progressive power and reserves acceleration during loaded departure
by limiting the initial nose-up command to available power. It does not add free energy.
The Komet retains its verified rocket-off glide/recovery model, with gradual flap drag.
Coefficients and transient response for the other types are gameplay estimates. No
claims are made about reproducing a complete historical performance chart.

Acceleration integrates in at most 1/120-second steps. Existing attitude controllers retain
progressive touch input and self-levelling. Control authority now falls near the stall and
at different high-speed thresholds for each aircraft. The old special Bf 109 turn penalty
is removed. Extreme-bank structural/available-lift caps still apply: the 109 need not win
at every bank and speed. The Fw's faster roll is measured as progress toward its commanded
bank; its gentle centre-stick shaping remains.

Carrier types have distinct clean stall / approach gameplay references (m/s):
Avenger 31/40, SBD 32/40, Corsair 36/45, Zero 29/37. Fuel, stores and flap state modify the
live envelope. The same envelope feeds the HUD, recovery checks and takeoff rotation.
Ground acceleration also varies by type. Carrier mission resets clear the prior engine
power and departure state; checkpoints still capture/restore the complete player state.

## Sound implementation and provenance

Build 213 responds to the user's listening feedback: P-47/Fw 190 powered flyby loops
were recognisable every 2–3 seconds; the TBF/B-17 archive drones did not sound convincing.
The accepted ground/initial piston timbre is now used throughout the powered voice.
P-47 uses a 14.5 s ground warm-up loop; Fw 190 a 12.5 s low-speed ground/taxi loop.
There is no pitch-warped flyby layer. Existing idle buffers and the accepted DB 601
voice are retained byte-for-byte. Jet/rocket code and sound are untouched.

Avenger and Zero now use the recorded BMW 14-cylinder radial as explicitly adapted
game voices. SBD uses the single R-2800 radial ground recording. This prioritises
recorded radial timbre over the rejected drone effects; it does **not** claim these
are original R-2600/Sakae/R-1820 recordings or exact firing-order reconstructions.
Their RPM/tonal differences are deliberate arcade sound choices. Exact engine-specific
source correspondence remains an approximation. No newly found file was added:
Texan was rejected as another flyby; generic archive revs lacked engine identification.

Existing Fight2FlyPhoto CC BY 3.0 notices apply. `audio/engines/CREDITS.md` and
`provenance.json` identify source cuts, hashes, active bank mappings and retired loops.
The TBF/B-17 drone WAVs remain historical repository assets but are omitted from the
offline app and runtime selection. `scripts/engine-audio/build-recorded-loops.py`
builds the files; `--steady-only` preserves unchanged sample bytes and regenerates the
two powered layers. Source MP3s are development evidence, excluded from the app.

The sampler retains idle/power crossfades, small playback-rate changes, shared master,
pause/mute handling, cache, stale-selection protection and explicit load-error state.
Changed banks use versioned sample URLs to refresh cached audio on existing devices.
A full-power 60-second audition button and elapsed timer are added to the soundcheck.
The extended audio check renders one minute at full power for all six affected aircraft,
measures bounded output, and compares the Bf 109 rendering to its accepted Build 212
measurement. Technical checks do not prove subjective quality on iPad speakers.

Build 212 pitch response remains: normal controller frequency 2.9 in Europe and 4.2 in
Pacific, about 31%/24% shorter 90%-response times at the documented test condition.
These are arcade response choices, not historical pitch-rate claims. No flight tuning
is changed in Build 213.

Historical family references consulted (not sources of audio or flight coefficients):

- [USAF Museum, Republic P-47](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/858869/republic-p-47/) — R-2800 engine family.
- [Smithsonian, BMW 801 radial 14](https://airandspace.si.edu/collection-objects/engine-bmw-801-radial-14/nasm_A19670113000) — Fw 190 engine family/cylinder count.
- [National WWII Museum, F4U Corsair](https://www.nationalww2museum.org/war/articles/wwii-aircraft-f4u-corsair) — 18-cylinder R-2800.
- [US Navy, TBM Avenger](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/t/tbm-avenger.html) — R-2600 family.
- [US Navy, SBD Dauntless](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/s/sbd-dauntless--sunken-treasure-.html) — R-1820 radial family.
- [Messerschmitt Museum, Bf 109 history](https://flugmuseum-messerschmitt.com/AIRCRAFT-AND-CREW/Bf-Me-109-G4%20FACTS/index.php) — DB 601 / DB 605 families; F-2 variant evidence remains in the existing Bf 109 source record.

## Verification

- `okinawa/tests/fleet-dynamics.cjs`: ten types, throttle/climb/dive/turn energy,
  load, damage, configuration, zero-fuel glide and 20/60/120 FPS consistency.
- `okinawa/tests/fleet-flight-browser.cjs`: actual loaded campaigns, ten aircraft at
  three frame rates, live acceleration/coasting/attitude/turn response, self-levelling,
  real start-button audio activation and correct engine selection.
- `okinawa/tests/fleet-audio-browser.cjs`: real OfflineAudioContext rendering for ten
  engines, distinct spectra, audible output, clipping headroom, stop silence and UI switching.
- Existing loaded takeoff, handling/damage, carrier recovery, Komet mission and control
  regressions. Older HUD tests now compare P-47 IAS references to IAS rather than TAS.
- Build 211 evidence: `app/release/fleet-validation.json`. Build 212 pitch and recorded audio: `app/release/engine-pitch-validation.json`.

Browser checks use Chromium/SwiftShader and real Web Audio. They establish functional
behaviour, not iPad frame rate, Safari hardware behaviour or subjective audio quality.
