# Convoys, depot, hospital ship and Catalina (Build 246)

Eight generated GLBs delivered as `Torpedo_Bomber_8_Modelle.zip`. As with the earlier packages, all geometry and paint come from the generators
under `scripts/own-models/<id>/` (numeric geometry, procedural pigments, fixed seed). The delivered GLBs are the reference; the delivered
`check.cjs` / generator scripts were **not** executed in this repository (their checks are reproduced by `okinawa/tests/period-models.cjs`
against pinned SHA-256 values). License status in the register: `project-own`; published dimensions, reconstructed details, no tolerance
established. A physical iPad test is still pending.

| Model | File | Triangles | Bytes | Size X × Y × Z (m) | Used in the game |
| --- | --- | --- | --- | --- | --- |
| Opel Blitz 3 t cargo truck | `assets/ground-vehicles/opel-blitz-cargo-own.glb` | 2 396 | 266 632 | 2.2 × 2.9 × 6.0 | German convoys, truck targets |
| Opel Blitz 3 t fuel truck (Tankwagen) | `assets/ground-vehicles/opel-blitz-tanker-own.glb` | 2 818 | 300 564 | 2.2 × 2.5 × 6.0 | convoys; destroyed: fireball + chain |
| Panzer IV Ausf. H | `assets/ground-vehicles/panzer4h-own.glb` | 6 372 | 578 608 | 3.33 × 2.68 × 7.02 | armoured convoy target (double hp, 400 points) |
| Sd.Kfz. 251/1 Ausf. D | `assets/ground-vehicles/sdkfz251d-own.glb` | 4 130 | 399 156 | 2.1 × 1.75 × 5.98 | convoy target |
| Flakvierling platform wagon ("flakwagen") | `assets/ground-vehicles/flakwagen-own.glb` | 4 744 | 449 364 | 3.0 × 3.4 × 12.0 | wagon coupled to the train, shoots at the player |
| Depot kit (tanks, drums, crates, net, huts, berms) | `assets/remagen/sites/depot-kit-own.glb` | 2 228 | 254 544 | 18.2 × 3.98 × 22.0 | "Bonus Depot Raid" sortie |
| Pacific hospital ship (Hikawa-Maru class, 1942) | `assets/ships/hospital-ship-own.glb` | 7 510 | 696 404 | 20.12 × 45.65 × 163.3 | neutral ship in Pacific sorties 2 and 4 |
| Consolidated PBY-5A Catalina | `assets/aircraft/pby5a-own.glb` | 9 510 | 936 380 | 31.7 × 6.15 × 19.46 | rescue plane for far-out ditchings |

## What was checked before anything was built in

SHA-256 of all eight files matches the delivered manifest; glTF validator 0 errors / 0 warnings; one embedded texture each (≤ 2048 px);
triangle / node / material / byte budgets; size within 2 cm of the published values; ground at Y = 0, +Z forward, −X left. Vehicles: `Intact`
plus a hidden `Wreck` node (scale 0, never widening the bounds). Depot kit: six independent roots `DrumStack, CrateStack, FuelTank, CamoNet, Berm,
Hut`, each with `<Root>_Intact` and `<Root>_Wreck`. Hospital ship: `funnel-exhaust-1` (`shipExhaust`), `shipVisualOnly` decor, twelve lifeboats,
keel 9.23 m under the waterline, +Z bow. PBY: rig drives for roll / pitch / yaw, `prop` (three blades), `gear`, `floatLeft` / `floatRight`,
`groundWheel` tyres, no flaps. `okinawa/tests/period-models.cjs` runs this against the files in the repository.

## In the game

### Rhine (`remagen-mission.html`, `terrain-system/WorldVehicles.js`, `LivingWorld.js`)

* **German convoys** (convoy sorties): three fixed column compositions (`LivingWorld.GERMAN_CONVOYS`) now use the delivered vehicles next to the
  earlier Tiger / Jagdpanther: Panzer IV, half-track, Opel Blitz cargo, Opel Blitz fuel truck. The merged `Intact` mesh is drawn with one call;
  a destroyed vehicle swaps in the model's own `Wreck`. The delivered vehicles are static meshes: no turret turning, no muzzle effects, and the
  Panzer IV / Sd.Kfz. 251 do not shoot back.
* **Fuel truck blast** (`FUEL_BLAST`): a destroyed Opel Blitz fuel truck goes up with a bigger fireball; every vehicle of the column within 36 m takes
  3 damage (soft vehicles die, armour is shaken, a second fuel truck follows), a fast low aeroplane within 95 m (below 140 m AGL) takes up to 15
  damage with a radio call, and the player is paid a bonus of 100 for a safe kill.
* **Flak wagon on the train** (`flakcar`): an optional target (light flak, 5 hp, 500 points) coupled 19.1 m behind the locomotive's tender (same route,
  same speed, never on its own). It fires like the other light flak, at a player within its range who is above 15 m AGL. Destroying it does not stop the
  train. The train objective is unchanged.
* **Mission "Bonus Depot Raid"** (index 23, appended; older indices unchanged): a fictional fuel and ammunition dump placed deterministically per
  mission id near the German side (dry, level, clear of buildings and the airfields). Objective: six of the eight stores (two fuel tanks, three drum
  stacks, three crate stacks) — they are primary targets and part of a checkpoint. Camouflage net, two huts and two earth berms are optional scenery
  targets (points only; berms ignore gun fire). Destroying a tank, drums or crates sets off everything within 46 / 24 / 30 m after a short delay
  (`DEPOT_CHAIN`, one after the other, ~0.3 s + distance / 40 m/s), the fireball hurts a low aeroplane above it, and one hit on a tank can complete the sortie.
  Chains in flight and the optional parts are not saved in a checkpoint (the parts come back intact after "Continue").

### Pacific (`torpedo-carrier.html`, `naval-assets.js`, `pby-rescue.js`)

* **Hospital ship** (sorties 2 "Escorted Convoy" and 4 "Merchant Convoy", last entry of `targets`): a neutral white ship with red crosses, speed 3.4,
  4 hp, `neutral:true` + `optional:true`, so she is in no objective count, no HUD count, no wingman list. She is hit by every weapon through the
  normal hit paths: shells −3 each (one radio warning), bombs / rockets / torpedoes −600 per hit with a radio call, the fourth hit sinks her
  (−2 500, "YOU SUNK A HOSPITAL SHIP"). A sunk hospital ship is not a kill; the real targets still complete the sortie. The debrief names the hits.
  She is white on the minimap, "NEUTRAL" in the contact list and "do not attack" on the briefing map. Her funnel makes smoke through the model's exhaust outlet.
* **PBY-5A rescue** (`pby-rescue.js`, same coordinator shape as `PilotRescue.createCrew`): a survivor who ditched more than 2 200 m from the
  carrier on the Allied side is picked up by the Catalina. A scripted flight, no flight physics: she glides in from 950 m out at 75 m height on a
  line from the carrier side (floats deployed on the final, wheels up), settles hull-first (tail low in the flare), brakes to a stop 30 m from the
  survivor, waits 3.2 s (pickup), taxis to a second survivor up to 380 m away (stops 25 m short, waits again), and takes off. Pickup of the first
  survivor ≈ 27 s after the call, "done" 2.5 s later (the motor launch needs ~8 s). A survivor she cannot serve (more than 380 m from the first, or
  after she started to take off) and everyone near the carrier or on the Japanese side gets the motor launch.

## Ground fit of vehicles and rural details (found on the iPad, Build 242 screenshot)

* **Vehicles half in the road.** OSMManager draws road ribbons 1.4 m and rail ribbons 1.2 m above the terrain mesh; the vehicles stood at terrain +0.18 m, so
  every wheel base sat 1.2–1.3 m inside the road (measured in the real game by raycasting the topmost rendered surface under all four wheel positions).
  `LivingWorld._placeEntity` now puts an entity on that surface (`LivingWorld.ROAD_LIFT` 1.4 / `RAIL_LIFT` 1.2, to be kept in step with OSMManager) and leans
  it with the slope under its four wheel positions (pitch and roll, smoothed so terrain triangle edges do not snap it). Ferries keep their water level.
  Measured afterwards: every vehicle within 0.15 m of the surface (before 1.3–1.7 m).
* **Telegraph poles in the air.** Poles, crossbars, insulators, wires, hedges, orchards, haystacks, cattle and farm yards were placed once with the terrain height of the
  moment. Far tiles start coarse; when the tile refined as the player approached, poles stood up to 55 m above or below the ground (measured: 21 of 180 poles more
  than 1 m off after flying to the road column). `LivingWorld._regroundDetails` re-reads the rendered terrain for all of them whenever a tile changed (checked twice a
  second via a tile-revision signature, ≈ 2 ms per run). After refinement no pole is more than 0.5 m above the ground (`convoy-browser`, section 5).
* A handful of poles (2 of 180) stand on a road ribbon of another route and are therefore 1.4 m inside its surface; they are not floating and were left alone.

## Not done / limits

* The Sd.Kfz. 251 "brings infantry" and Panzer IV / half-track firing are not implemented (static models).
* The delivered Opel Blitz looks different from the airfield-scenery Opel Blitz that another session added; both exist.
* The PBY is not a flyable aircraft: the repository's `aircraft-contract.js` does not know the class `amphibian-twin`, there is no flight model.
* Depot placement uses a seeded search near the German side; if no spot is found the sortie starts without a dump (not reproduced in tests).
* Effect strengths (blast radii and damage, chain delays, penalties −600 / −2 500 / −3, PBY timings and distances) are game-balance estimates to be tuned by playing.
* No iPad test, no GPU measurement: the three new Rhine models and the hospital ship add draws (one per merged vehicle; ship 22 meshes).
