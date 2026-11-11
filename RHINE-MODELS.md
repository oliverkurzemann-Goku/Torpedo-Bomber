# Rhine ground sites, V-1 and Ar 234 (Build 243)

Five generated GLBs delivered as `Torpedo_Bomber_5_Modelle.zip`. All geometry and paint are produced by the generators under
`scripts/own-models/<id>/` (numeric geometry, procedural pigments, fixed seed; Node standard library only). The delivered GLBs in
`assets/` are the reference; a rebuild is not required to be byte-identical (the delivered `check.cjs` / `generator` scripts were **not**
executed in this repository, their results were reproduced with `okinawa/tests/rhine-models.cjs`). License status in the register:
`project-own` (reference images were used only to compare proportions and appearance). Dimensions are published figures; details are
reconstructed from photographs and drawings, with no tolerance established.

| Model | File | Triangles | Bytes | Size (m) | Used in the game |
| --- | --- | --- | --- | --- | --- |
| Arado Ar 234 B-2 Blitz | `assets/aircraft/ar234b2-own.glb` | 11 816 | 1 156 496 | 14.40 × 4.30 × 12.64 | **not yet** (see below) |
| Fieseler Fi 103 (V-1) | `assets/aircraft/fi103-own.glb` | 2 244 | 185 840 | 5.37 × 1.42 × 8.32 | flying bombs of the V-1 sortie |
| Fi 103 launch ramp | `assets/remagen/sites/fi103-ramp-own.glb` | 2 136 | 212 384 | 8.28 × 6.50 × 48.0 | target of the V-1 sortie |
| Würzburg-Riese FuMG 65 | `assets/remagen/sites/wuerzburg-riese-own.glb` | 3 292 | 311 316 | 7.5 × 9.0 × 6.0 | optional radar, factory sortie and night sortie |
| 150 cm Flakscheinwerfer | `assets/remagen/sites/flak-searchlight-own.glb` | 2 708 | 268 460 | 3.44 × 2.83 × 3.6 | three optional searchlights, night sortie |

## What was checked before anything was built in

All five SHA-256 values match the delivered manifest; glTF validator 0 errors / 0 warnings; one embedded texture each (≤ 2048 px), no
vertex colours, no double-sided materials, no forbidden extensions, unique node names, triangle / node / material / byte budgets, size
within 2 cm of the published dimensions. Ground sites: a hidden `Wreck` node (scale 0, ≤ 40 % of the model, never widening the bounds),
`LaunchPoint` (ramp), `Dish` (yaw) + `Elevation` (pitch) (radar), `Mount` (yaw) + `Projector` (pitch) + `BeamOrigin` (searchlight).
Aircraft: `rigContract` extras, +Z nose, −X left. `okinawa/tests/rhine-models.cjs` runs all of this against the files in the repository.

## In the game (`remagen-mission.html`, block "SITES")

* **Placement.** Sites are placed deterministically per mission id (a seeded generator hashed from the id), so a restored checkpoint finds
  the same spots. A spot is dry, free of building footprints within the site's radius + 6 m, level enough (ramp: ≤ 6 m height difference
  along the rail) and fitted to the terrain. The ramp points at the Allied strip.
* **Radar** (factory sortie): optional (`optionalSite`), never named in the briefing objective, not part of a checkpoint. While it lives
  it sharpens the fire control of the **heavy** flak (reload time ×0.8, aiming error ×0.85); the dish turns. Destroying it swaps in the
  model's wreck, calls "RADAR DOWN — HEAVY FLAK FIRE CONTROL DEGRADED" and pays a bonus.
* **Searchlights** (night sortie, three of them ≥ 300 m apart, plus the radar): each sweeps and tracks a player who is above 25 m AGL and
  within 3 600 m. While one holds the player in its beam (axis within 0.05 rad) every gun on the map fires faster (reload time ×0.72) and aims better
  (aiming error ×0.62). Shot out, the lamp goes dark and the beam disappears.
* **V-1 sortie "Bonus Buzz Bombs"** (mission index 22, appended; older indices unchanged): the ramp is the primary target (checkpointed
  like any primary target; a destroyed ramp is restored as its wreck). It launches flying bombs from the rear end of the rail (first one after
  40 / 24 / 15 s on Rookie / Veteran / Ace, then every 70 / 42 / 28 s; never more than three in the air, at most ten per sortie). A V-1 flies straight at 175 m/s on the rail heading, climbs after
  the launch and never below 150 m above the ground; guns bring it down with four hits (+250, radio call, "V-1 DOWN n" in the objective
  line); one that nobody stops leaves the area ("THROUGH TO THE ALLIED LINES"). Destroying the ramp ends the launches and completes the
  objective; the operation then calls return to base.

## Not done / limits

* **Ar 234:** the model is delivered, validated and stored, but the game has no rig class, flight model or AI for it. It is excluded from
  the offline app payload (`scripts/build-app.mjs`) until it is flown.
* The V-1 has no engine sound and no collision with the player's aircraft; a V-1 that gets through has no consequence beyond the radio call.
* Effect sizes (radar ×0.8 / ×0.85, searchlight ×0.72 / ×0.62, ranges, launch gap, ramp placement) are game-balance estimates to be tuned
  by playing (the radar and searchlight effects are not scaled by difficulty, the V-1 timing is).
* Optional sites are not saved in a checkpoint: they are placed again, so a destroyed radar or searchlight is back after "Continue".
* Measured in Chromium with SwiftShader (no GPU); not tested on an iPad.

Tests: `okinawa/tests/rhine-models.cjs` (files), `okinawa/tests/sites-browser.cjs` (real game: radar, searchlights, ramp, flying bombs,
checkpoint round trip → `app/release/sites-browser.json`).
