# Torpedo-Bomber

Standalone WW2 flight-sim browser games, plus the real-terrain data pipeline behind two of
them. The two active games run directly from locally bundled Three.js r128 and loaders,
without a web build step or external CDN dependency. Deployed via GitHub Pages; target
device is iPad/iPhone Safari. `npm run build:app` also prepares a self-contained Capacitor
iPad payload and `ios/` contains the native Xcode project. See [APP-DEVELOPMENT.md](APP-DEVELOPMENT.md).

| File | Game |
|---|---|
| `index.html` | Landing page — only Torpedo Squadron and Thunderbolt Squadron (real Rhine terrain) |
| `torpedo-carrier.html` | Torpedo Squadron — Pacific, carrier operations + the mapped Okinawa coast |
| `remagen-mission.html` | Thunderbolt Squadron — Europe, real terrain (Copernicus DEM + Overture Maps) |
| `thunderbolt-europe.html` | Classic Europe (synthetic terrain) — superseded by `remagen-mission.html`, kept reachable by direct URL |
| `torpedo-carrier-open-sea.html` | Classic Pacific (pre-Okinawa) — kept reachable by direct URL |
| `okinawa-preview.html` | Standalone viewer for the `okinawa/` coastal module, full vegetation density |
| `model-check.html` | Internal tool: calibrate a new aircraft model's alignment/scale |

The two Classic games remain reachable by direct URL for testing, but must not be
reintroduced as cards on the public landing page. `okinawa/tests/campaign.cjs`
checks that exactly the two current campaigns are linked there.

`okinawa/` holds the Okinawa coastal terrain module (`data.js`, `world.js`, own
`tests/*.cjs`) shared between `torpedo-carrier.html` and `okinawa-preview.html`; see
`okinawa/README.md` for its scope, coordinate system and data provenance.

Current build numbers are shown in-game (bottom of the HUD) and tracked in `CLAUDE.md`'s
"Stand bei Übergabe" line, which is the source of truth — this README doesn't repeat them
so it doesn't go stale.

### Pacific operations

Both current campaigns sample fuel and remaining stores continuously: heavier
sorties accelerate/climb/turn more slowly and show higher live stall/landing
references. Individual aileron/elevator damage and jammed left/right flaps affect
handling, announce a persistent CTRL warning, and are cleared by repair or restart.
Stick conventions, normal self-centering and AERO controls are retained.

All twelve active aircraft models have visible landing flaps and mechanical
landing-gear rigs. The P47 keeps its proven rig, Ju87 its fixed fairings and Me163
its landing skid; B24/Me262 use nose wheels. Left/right flap damage drives each
visible surface independently. Original GLB assets are unchanged. Landing
configuration softens controls, and each playable type builds speed and climbs
more gradually after rotation. Ground stance follows actual tyre vertices while
the tail rises and the pilot rotates. These are calibrated gameplay curves.

Initial climb now opens with airspeed alone and has enough immediate climb for
departure clearance. Waiting or gaining altitude does not unlock it. More speed
provides more climb reserve without a sudden boost toward cruise speed.

Rhine finals use separate full-flap references for all six playable types, in
MPH, adjusted for fuel, stores and actual flaps. Approach references are distinct
from touchdown speed. Flaps buy low-speed lift instead of triggering the former
large APP-based sink penalty; actual slow-flight sinking remains.

After Rhine touchdown, keep straight and bring power to idle: the aircraft rolls
and brakes to a stop before the debrief, circuit credit or ground service. Wheel
and skid contact follow the rendered terrain, and the tail settles gradually.
Power and back-stick allow a touch-and-go; a late touchdown can overrun the strip.
Both resting and caught carrier arresting wires are black.

Aircraft now collide with the actual hull and superstructure of visible Pacific
ships and Rhine vessels, using shared decoded meshes and swept probes. Carrier
qualification holds the stopped aircraft for deck service and a player-selected
relaunch. Mechanical gear updates precede deck contact and follow the rolling hull.

Rhine woodland boundaries have small inward irregularities and softer baked ground
transitions. Existing texture dimensions, shaders and draw budgets are retained;
the trees and rendering work decrease in the native comparison view.

Both gun sights follow the actual muzzle centroid and shot direction through
the current camera, with a speed-dependent sighting distance and short display
smoothing. Existing dispersion is retained without automatic target lead.

Carrier departure power and missed-wire rotation are supplied by the pilot.
Safe early touchdowns roll to the wires; they do not launch the aircraft back into
the air. Recovery shows a live green speed band and red TOO SLOW cue above stall.
Target, system and weather status panels stack without covering each other.

Both campaigns keep a stable bomb-impact pipper: cached ballistic samples travel
with the aircraft between updates, and only their screen presentation is filtered.
The cue is subdued in cruise, brighter during a dive, and fades at the viewport
edge. RELEASE turns green only with a valid, settled cue; bomb physics is unchanged.

Pacific weather includes anchored CB towers/anvils, rain showers and sea-fog banks.
Amber cells appear on the briefing/radar and sustained CB penetration causes
turbulence/damage. Small point droplets replace long rain cylinders; cloud/rain
effects use bounded instancing and keep the carrier recovery area clear of CBs.

Touch devices automatically lower and recover rendering quality after sustained
slow/fast frames. Only pixel resolution and decorative smoke/cloud/rain budgets
change; physics, fog/visibility, weapons, smoke screens, objectives and HTML controls
do not. `flightQuality.report()` exposes the current tier; this is not an iPad
hardware benchmark. Loading coefficients are declared gameplay curves, not
certified historical aircraft weights.

The appended sorties preserve the earlier combat indices:

- **17 · Harbor Supply Denial (SBD):** two moored merchants and two fuel depots;
  optional departing ship, escort and warehouse. Cranes, trucks and a coastal bluff
  give the attack a recognizable setting. Port scenery is batched, not one draw per box.
- **18 · Convoy Safe Passage (Corsair):** both allied transports must actually reach
  the island anchorage, survive bombing and clear both small raids. Killing aircraft
  alone is insufficient. Blue radar contacts identify the ships being protected.
- **19 · Fleet Alarm (Corsair):** US carrier defense against Japanese A6M bomb carriers,
  using the existing Japanese aircraft asset (not fictitious heavy-bomber models).
  A damaged returning Corsair is optional; normal carrier recovery finishes the sortie.
- **20 · Fuel Reserve (SBD):** one required merchant, an optional destroyer, 42% starting
  fuel and rain on the return. A solo sortie with no additional raid.

Deck crew walk with planted feet, raised swing steps and articulated knees. Aircraft depart
under engine power with a full deck run; launch text and effects describe a piston-era takeoff.

Carrier recovery uses headwind along the moving deck. The existing speed instrument
shows **REF 78 KT** for recovery and turns red before the current flap-dependent stall
speed. A missed wire leads to a powered deck run without a position or speed jump.
The wire catches visibly and slows the aircraft over a short grounded rollout before
the debrief; marginal deck alignment calls for a bolter. Dive-bomb missions show the
predicted impact point using the real bomb trajectory. Thunderbolt displays each
aircraft's landing reference in MPH and a flap-dependent pre-stall speed warning.
Landing grades use recorded touchdown speed, sink, offset and bank; medals also count
bomb precision and the delivered transports' condition. Engine, rudder and deck damage
affect ship speed, turning and AA independently of hull HP and objective credit.

There are no coordinated mixed-flight strikes or extra command controls. Advanced hostile
ships spot approaching aircraft, turn with bounded rates, lay escort smoke and lose speed
after damage. Moored ships stay still.

Successful recovery after the harbor raid reduces later second waves by one aircraft.
Delivering both convoy transports adds Fletcher AA to Fleet Alarm. These device-local
effects persist across reloads but do not stack on replay. **More options & credits →
Reset harbor / convoy campaign effects** restores the baseline without erasing mission
progress or the pilot logbook. Failures do not award these consequences.

## Running it

No server-side code or build step is needed for the browser version. To play locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

(`file://` won't work for `remagen-mission.html` — it fetches real terrain data with
`fetch()`, which Chromium/Safari block under `file://`.)

## Testing

```bash
npm install
npm test          # syntax-check every game HTML file + terrain-system + okinawa regression tests
npm run test:syntax    # just the syntax check
npm run test:terrain   # just terrain-system/tests/*.js
npm run test:okinawa   # just okinawa/tests/*.cjs
```

The regression checks run in plain Node and run in CI on every push
(`.github/workflows/ci.yml`). They catch parse errors and terrain-data/geometry
regressions — they do **not** replace visually checking a change in a real browser.
`CLAUDE.md` Abschnitt 6 documents the project's stricter verification standard for
anything that touches 3D models or rendering (real `GLTFLoader`, real headless-WebGL or
Playwright render, not just these Node-level checks).

The Okinawa suite also runs a real Chrome/WebGL smoke test in CI (both campaigns,
iPad-sized viewport, keyboard release, automatic pause and GPU context recovery).
Locally this test is skipped if Chrome is absent; set `GAME_TEST_CHROME` to its
executable path to enable it. `runtime-safety.cjs` checks swept gun hits at 20–120 FPS,
blocked storage, owned-resource disposal, propeller timing and optional flight hints.
The browser check holds the fire button in both Zero and both Dauntless sorties
past 15 simulated seconds. `carrier-fire.cjs` checks 60 seconds of sustained fire
using the original GLBs and actual gun/FX/model routines. `pacific-assets.cjs`
decodes native model images and verifies texture limits, shared ship resources
and mission-specific preflight loading. CPU rendering is reduced in browser CI;
these checks do not establish iPad/Safari performance or hardware stability.

## Project documentation

- **`CLAUDE.md`** — the actual project handbook: architecture facts, every bug fixed (and
  why the fix looked plausible but wasn't, the first time), open issues, and the testing/
  workflow rules this project runs on. Read this before changing any game file.
- **`TERRAIN.md`** — technical handoff for the `terrain-system/` real-DEM/OSM pipeline.
- **`ASSET-CREDITS.md`** — sources and licenses for third-party models used at runtime
  (including CC BY-NC and unresolved upstream game-asset rights; license labels are not blanket clearance).

- **[iPad installation, German](app/release/IPAD-INSTALLATION-DE.md)** — own-device installation using an Apple Personal Team, no paid membership required.
- **[Asset rights review](APP-ASSET-AUDIT.md)** — exact-file register, source evidence and prepared permission enquiries.

## License

No license is currently granted for this repository's own code (`package.json` license:
`UNLICENSED`) — this hasn't been decided yet, not a statement that it never will be.
Third-party runtime assets keep their own licenses; see `ASSET-CREDITS.md`.

Build 158 fits the Zero's compact landing gear to the measured wing underside and tail belly; browser checks use the real gear lever and save extended/retracted renders. The confirmed Build 157 controls, stable wind heading and mission-specific armament remain in place, along with intercept radio calls and automatic parachute rescue.
