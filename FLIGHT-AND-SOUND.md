# Fleet handling and engine audio — Build 211

Ten playable aircraft now use finite acceleration, engine response and speed-dependent
control authority. The assisted stick, self-levelling, difficulty choices, weapons and
mission rules remain. This is an arcade balance pass, not a certified flight simulator.

| Aircraft | Intended handling | Engine sound |
| --- | --- | --- |
| P-47D | Heavy, stable, good coasting; deliberate low-speed acceleration | Deep R-2800, 18-cylinder radial, four-blade propeller |
| Bf 109F-2 | Light response, stronger low-speed acceleration/climb, tighter ordinary turns; controls stiffen at speed | Smoother DB 601 V12 exhaust |
| Fw 190A-8 | Faster roll response to its commanded bank; hard turns shed more energy | Rougher BMW 801, 14-cylinder radial |
| Ju 87B-2 | Deliberate roll, modest climb, strong dive-brake drag | Lower Jumo 211 V12 |
| Me 262 | Slow engine spool, highest sustained speed, wider turns | Continuous turbine/airflow sound |
| Me 163 | Strong rocket acceleration, then an unpowered energy-limited glide | Separate rocket roar; silent combustion at cutoff |
| TBM Avenger | Heavy inertia, slow acceleration, stable approach | Low R-2600, 14-cylinder radial |
| SBD Dauntless | More responsive than the Avenger, steady dive and recovery | Distinct R-1820, nine-cylinder radial |
| F4U Corsair | Strong power, faster flight, more inertia than the Zero | R-2800 with its distinct three-blade propeller component |
| A6M Zero | Tight low-speed turns, fast response; reduced high-speed roll authority | Lighter Sakae, 14-cylinder radial |

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

`audio/aircraft-engine.js` builds original, deterministic seven-second loop buffers from
soft combustion pulses, firing harmonics, propeller pressure, resonant body components and
filtered turbulence. Cylinder count, propeller blade count, RPM band and timbre differ.
A whole-second overlap joins the loop without a noise seam. Runtime power/RPM changes are
smoothed; engine load changes tone and weight instead of simply making a sawtooth louder.
The old detuned sawtooth pair and deep periodic gain modulation are removed from all three
pages. Eight piston buffers are lazy and cached (about 5.4 MB total if all are selected).

Jets and the rocket use the existing separately synthesized `audio/jet-engine.js` voices;
the legacy Europe page now uses those voices too. All sound remains under the existing
master gain, so pause/mute/resume routing and effects mixing continue to work. Piston fuel
exhaustion leaves only quiet windmilling; the rocket cuts off. No recordings or third-party
audio samples were introduced. Engine specifications inform the family, not a claimed
acoustic reconstruction. There has been no listening test through physical iPad speakers.
`engine-preview.html` lets the user audition every engine with throttle and volume controls.

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
- Exact measurements and final check results: `app/release/fleet-validation.json`.

Browser checks use Chromium/SwiftShader and real Web Audio. They establish functional
behaviour, not iPad frame rate, Safari hardware behaviour or subjective audio quality.
