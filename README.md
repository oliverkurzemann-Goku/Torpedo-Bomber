# Torpedo-Bomber

Standalone WW2 flight-sim browser games, plus the real-terrain data pipeline behind two of
them. No build step — Three.js r128 loaded from a CDN, everything runs directly in the
browser. Deployed via GitHub Pages, target device is iPad/iPhone Safari.

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

## Running it

No server-side code, no build step. To play locally:

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
  (Sketchfab CC BY 4.0 / CC0 assets, with the exact runtime modifications made to each).

## License

No license is currently granted for this repository's own code (`package.json` license:
`UNLICENSED`) — this hasn't been decided yet, not a statement that it never will be.
Third-party runtime assets keep their own licenses; see `ASSET-CREDITS.md`.

Build 156: supplementary radio calls give target MSL altitude and a leading intercept course; urgent chatter has priority. Safe parachute landings end with a brief, pausable boat or ground-party pickup. No wingman commands; navigation arrows, aircraft models and flight physics unchanged.
