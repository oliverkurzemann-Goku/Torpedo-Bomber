# Period models and their missions (Builds 246 to 253)

## Build 252/253: the flyable Catalina — Storch feedback — people

**Catalina (Build 252).** The revised PBY-5A (rig class `amphibian-twin`) is a player aircraft in the Rhine game: Allied side, take-off from the Beaufort strip or from the Rhine (hull, floats out), data sheet
`SOURCES.pby` (35 420 lb, 179 mph, 610 ft/min), core only, hull 150, no forward guns (bow gun and two waist blisters fire by themselves), no flaps. Water handling (`WATER` in `remagen-mission.html`) is a
set of estimates (C): hydrodynamic drag with a hump, floats out below 46 m/s, wheels must be up, nose attitude −8…+23° on touch-down, sink 4.5 m/s fine, 6.5 m/s stoves the hull in. Measured in the real game:
lift-off from the strip after 26.9 s / 577 m, from the water after 30.1 s / 619 m, 6.4 m/s climb at 133 km/h. Two sorties (Rhine indices 32–33): Bonus Dumbo (alight on the river, taxi to the dinghy, hatch, +600) and
Bonus Black Cat (night strike on the ferry, two bombs, flares, +1 100). Hangar and free flight know the type (`custom-sortie.js`, Rhine only, kits `guns`/`bombs`; Black Cat paint = second template `pbyn`).

**Storch feedback (Build 253).** The pickup sorties no longer show the landing place: the map shows a search area of 1 150 m radius (briefing: distance and course) and the arrow leads to its middle.
Wind drift is a fraction of the weather's wind (`windK` .3 Storch, .6 Catalina; the cap is 7 m/s). Take-off pitch is limited by airspeed above the stall speed. Rookie gets two hunters. No red sight for
aircraft without a fixed gun. The persons at the pickup are the shared `CrewVisuals` figure for now.

**People pack (ordered from ChatGPT, not delivered yet).** One GLB `crew-pack-own.glb`: rigid, named joints with the pivots of `CrewVisuals` (shoulder ±0.235/1.39, hip ±0.11/0.82), eight persons (agent, observer
standing and seated at a MG 15, pilot seated and standing, courier officer, airman in a dinghy, airman standing), plus `SeatPilot`/`SeatObserver` nodes in the Storch. Budget 3 500 triangles per person,
one 2048² texture, validator 0/0. The game side only needs the file name and the joint names to swap it in for the `stsMakeFigure` figure and to seat the crew in the Storch.

## Build 250/251: the Storch lands in a meadow without wrecking — three more Storch sorties — the revised Catalina

**Meadow landing (Build 250).** Measured in the real game with human-style flares (24 approaches): the Storch bleeds speed fast with full flap, touches down *at* the stall speed (14.4 m/s) and the
wing mushes: the path sags and the nose drops to −13…−27° at 3–7 m/s sink. `resolveGround` (field landing, every type) wanted sink < 4.5 m/s, |pitch| < 12.6° and speed < reference + 8 m/s:
11 of 24 approaches were "CRASHED: Hit the ground away from the strip"; 7 more rolled past the 150 m pickup radius around the meadow's middle. Now `AC.fi156.field={sink:6.2,pitch:.46,speed:12}`
(a rugged long-stroke type; every other type unchanged), the pickup zone sits around the waiting pilot (`STS.stop` 280 m), trees go on a 230 m disc, the pilot runs 9 m/s (at most 20 s).
23 of 24 approaches now survive and start the pickup. Test: `storch-flight-browser.cjs` section 2a.

**Sorties 4–6 (Build 251, Rhine indices 29–31, German side, solo, no checkpoint, deterministic places per sortie id).** They share the pickup machine of the Rescue Run (`stsPickup`):
land near the marker, the figure runs to the aeroplane, boards, take off again. Each has its own twist:
- *Bonus Courier* ("Dispatch Under the Overcast", `courier:true`): weather `lowcloud` (base about 850 ft), the command post is 11 km behind the line (orange smoke). Allied fighters sit **above the
  cloud base**: more than 260 m AGL for 7 s and two P-47 dive on you (two waves at most, `escapeThreat`: they never hold up the return). Handover 6 s, +600.
- *Bonus Rock Landing* ("The Observer on the Ridge", `rock:true`): `siteSpot(..., high:true)` over six tries, the highest dry gentle clearing (measured: 81 m above the strip, 1.5 % slope, 8.6 km out),
  tree disc 120 m; stop within 90 m of the observer = **+300 precision bonus**; a fighter pair nine seconds after he is aboard.
- *Bonus Moonlight Pickup* ("Three Lanterns in the Dark", `moon:true`, `night:true`): no smoke; three flickering additive lantern sprites beside the agent, moonlight only, four flares (L); night
  intruders six seconds after he boards.
Test: `storch-flight-browser.cjs` section 2b (wind-aware final approach: windZ blows along +x).

**Catalina (Build 251).** `assets/aircraft/pby5a-own.glb` (day, blue-grey over light grey, number 27) and `pby5a-blackcat-own.glb` (matt black), delivered as `Catalina_PBY-5A_Torpedo_Carrier.zip`:
14 666 triangles, 37 meshes, 2 materials, one 2048² atlas, 31.699 × 19.456 × 6.147 m, validator 0/0, rig contract class **`amphibian-twin`** (new in `aircraft-contract.js`: two rotors, retractable main
legs and nose wheel, wing-tip floats that fold up, blister hatches; gear and floats are stored extended at 0 — `inverse` in the class spec). The model water line is Y=0 (`waterlineY`), the keel
−0.877 m, the tyres −1.607 m; markers: `WaterContactBow/Step/Stern`, `SprayLeft/Right`, `StoreLeft/Right`, `SearchLight` (8° down), `RescueHatch`, `SeatPilot/Copilot/Observer`.
Test `okinawa/tests/catalina-model.cjs` (pinned SHA-256 of both paints, same geometry, drives, markers). The Build 246 model is archived in `assets/aircraft/source/pby5a-v1/` (not in the app).
The delivered `check.cjs`, generator and the stand-alone free flight (`catalina.html`, `catalina-flight*.js`: its own toy physics) were **not** run or taken over; README and test log are under
`scripts/own-models/pby5a-catalina-v2/`. In the game the new model flies the AI rescue (`pby-rescue.js`: placed by the design water line, the right blister hatch opens while the crew boards).
**Open:** the Catalina is not yet a player aircraft (water take-off/landing, data sheet, sorties).

## Build 249: the Storch you fly — three sorties — and a night fighter that flies and can be seen

**Player model.** `assets/aircraft/fi156c2-player.glb` (delivered as `Fieseler_Storch_C2_Torpedo_Bomber.zip`, SHA-256 pinned in `okinawa/tests/storch-c2-model.cjs`): Fi 156 C-2, 14 484 triangles,
validator 0/0, rig contract class `tailwheel-light` (fixed legs, two-blade propeller read from the rig, no muzzle: the observer's gun is placed by the game). The delivered `check.cjs` /
generator were **not** run (foreign code); they are kept under `scripts/own-models/fi156c2-player/`. The scripted Build 248 model (`fi156c-own.glb`) stays for the liaison flights.

**Flown on the manual's numbers** (L.Dv.T. 2601/1 Annex 3, solved in `flight-core.js`): stall 62 km/h clean / 51 km/h full flap, 175 km/h at sea level, 4.6 m/s climb with 10 deg flap
(reproduced exactly by the test). The Storch is `CORE_ONLY` (always on the flight core). Measured in the real game (`okinawa/tests/storch-flight-browser.cjs`, ARCADE law): off the grass
after **6.5 s / 65 m**, 8 m/s climb at 72 km/h (the arcade law gives every type more climb than the data sheet), **174 km/h** level at full power (130 km/h at half power), idle glide
65 km/h at 2.3 m/s sink, 45 deg bank = **14.4 deg/s** (radius ~110 m), stall below 56 km/h without dropping out of the sky. Hull 60 (a P-47 has 100), 450 rounds for the **automatic
observer**: he fires by himself at hostile aircraft inside a rear cone (620 m, 24 deg), short bursts, wide scatter, light rounds - a deterrent, not a weapon (`updateStorchGunner`, `GUNNER`).

**Three Rhine bonus sorties** (indices 26-28, appended; German side, solo; `STORCH SORTIES` block in `remagen-mission.html`; places are deterministic per sortie id, the bandits are
`escapeThreat` and never hold up the return):
- *Bonus Rescue Run*: land in the meadow behind the line (yellow smoke, dry, flat <= 3 %, trees taken out), stop within 150 m of the smoke; the pilot runs to the aircraft (6.5 m/s), boards
  in 6 s while you hold still (+600), two fighters arrive after 5 s, take off again from the meadow (measured: touchdown 60 km/h, roll 48 m, aboard after 13-25 s, off after 55 m).
- *Bonus Spotter*: three observation zones 4.7 / 7.5 / 10.8 km from the strip; hold 25-280 m AGL, below 42 m/s, inside the 520 m circle for 12 s; the barrage lands 9 s later (+300, damage
  to a pilot still in the circle: measured -46 hull for one who stayed), fighters come after the second zone.
- *Bonus Rat Flight*: airborne 13.5 km behind the line at 60 m AGL; three fighters hunt the slow aircraft from 22 s, a second pair waits near the strip. Measured with a simple bot
  (75 m AGL, terrain look-ahead, 140 s): flying straight costs ~32 of 60 hull, turning into the bandits 0-14 - survivable, not trivial (strengths are estimates).
Not built yet: courier under the cloud ceiling, rock landing, moonlight flight.

**Night Hunt (Rhine index 25) reworked.** Measured before: the Bf 110 flew at a fixed heading rate and set the roll from the heading step - roll rate **241 deg/s** (-40 to +28 deg in 0.1 s),
a 28 s attack cycle like a metronome; and you could not see them (minimap showed them within 2.6 km, the model is dark). Now: a **coordinated turn** (heading follows the roll, bank <= 63 deg,
roll rate <= 66 deg/s, pitch rate <= 23 deg/s, speed as energy 46-172 m/s, terrain look-ahead), a **rear approach** (he flies for a point behind you, passes wide when head-on, turns round,
comes up from behind), one fixed escape heading when he breaks away. What you see: **ground-control scope** on the minimap out to 9 km (diamonds with heading), a radio call with bearing, height and
range every 13 s ("GROUND CONTROL - BANDIT 5 O'CLOCK LOW, 1.2 MI"), a **diamond mark** on the screen inside 2.4 mi, the **glow of their exhausts** from 4.3 mi. Task text: "shoot down all three".
Test: `okinawa/tests/schraege-browser.cjs` (profile limits and the visibility rules).

**Found on the way:** enemy fighters were spawned without `maxhp` (since Build 177), so `hp/maxhp` was NaN: the damage rig bent their wings to NaN vertices and the smoke of a damaged
fighter never came. Fixed in `spawnEnemyAir` / `damageEnemyAir` (damaged fighters now smoke below 45 % hp).

**Limits:** no iPad test, no GPU measurement; the Storch sorties' strengths (hunter count, barrage damage, zone times), the Night Hunt speeds / bank limit / ranges and the glow size are game
decisions to be tuned; the observer is automatic (no aiming by the player); the flyable Catalina waits for its model; the Rhine board has 29 cards (eight columns at short landscape,
the takeoff-briefing test covers all of them).

## Build 248: night fighter, Storch, Betty, oiler, Yamato — and five missions

Five more generated GLBs (delivered as a package with the Bf 110 G-4, Fi 156 C, G4M1, fleet oiler and Yamato; same rules as below: generators in
`scripts/own-models/<id>/`, the delivered `check.cjs` / generator scripts were **not** executed here, `okinawa/tests/period-models.cjs` pins their SHA-256
and re-checks sizes, nodes and markers; license status `project-own`; physical iPad test pending).

| Model | File | Triangles | Bytes | Size X × Y × Z (m) | Used in |
| --- | --- | --- | --- | --- | --- |
| Messerschmitt Bf 110 G-4 night fighter | `assets/aircraft/bf110g4-own.glb` | 9 766 | 977 400 | 16.25 × 4.16 × 12.65 | Rhine "Bonus Night Hunt" (scripted, not flyable) |
| Fieseler Fi 156 C Storch | `assets/aircraft/fi156c-own.glb` | 6 968 | 791 852 | 14.25 × 3.05 × 9.9 | Rhine "Bonus Stork" (scripted, not flyable) |
| Mitsubishi G4M1 Betty | `assets/aircraft/g4m1-own.glb` | 12 224 | 1 201 584 | 24.89 × 4.9 × 19.97 | Pacific Sortie 22 and the second wave of Sortie 19 (raiders) |
| Fleet oiler | `assets/ships/fleet-oiler-own.glb` | 14 424 | 1 302 024 | 17.68 × 36.08 × 143.5 | Pacific Sortie 21; optional target in Sorties 2 and 4 |
| Battleship Yamato, April 1945 | `assets/ships/yamato-1945-own.glb` | 27 294 | 2 339 668 | 38.8 × 59.56 × 263 | Pacific Sortie 23 "Ten-Go" |

The aircraft are **not** flyable: `aircraft-contract.js` only knows the `tailwheel-fighter` class, and these are scripted NPC aircraft (no FlightCore
data, no flight physics, no checkpoint of their flight state). All balance values below (ranges, strengths, timings) are category C: game decisions to tune.

### Pacific Sortie 21 "Tanker Trap" (`pacific-theater.js`, `torpedo-carrier.html`, `okinawa/tests/tanker-trap-browser.cjs`)
Two fleet oilers under two destroyers, all four required except the destroyers. One oiler rides **deep** (`loaded:true`, `deepBy:1.6`), the other high.
A loaded oiler that sinks spreads burning oil (`OIL_FIRE`: 40 s, radius 35 → 125 m, flames to 45 m, 7 hull/s for a low flyer inside, **blinds the escorts'
guns (×2.6 slower) and slows them for 32 s** inside 1 800 m). The empty one only sinks. One internal torpedo per sortie (Build 220 rule). Sorties 2 and 4 carry
a loaded oiler as an **optional** target. The fire is not saved in a checkpoint.

### Pacific Sortie 22 "Betty Alarm" (`betty:true`, `spawnBettyRaider`, `BETTY`)
Corsair, guns only. Bettys come in at 30 m, one torpedo each (scripted kinematics, 32 m floor like the other raiders). The **flight leader** carries yellow
caps on fin and wingtips: shoot him down and the rest **drop early** (2 700 m instead of 620 m, their fish run out of range). A Betty that blows up
(5 hp, wing tanks burn below 2 hp) hurts everything within 150 m, the Bettys beside it and the player (10 hull). Three Bettys, then four from the
opposite bearing; Sortie 19 swaps its second wave for two Bettys. Checkpoint: the entity state of a Betty is restored; the leader marks are rebuilt.

### Pacific Sortie 23 "Ten-Go" (`yamato-aa.js`, `pacific-theater.js`, `updateYamatoAA` in `torpedo-carrier.html`, `okinawa/tests/tengo-browser.cjs`)
The Yamato (263 m, 3 hits, 5 000 points, optional destroyer on each side, Avenger with one internal torpedo). Her 62 anti-aircraft stands are the model's own
gun-mount markers (`asset.extras.markers`: 12 × 127 mm twin, 50 × 25 mm triple; the test compares the table with the file). Every stand sits on a flank, so
its field of fire is derived from its position: abeam, leaning ahead at the bow end and astern at the stern end, ±58° (25 mm) / ±85° (127 mm); nothing fires
across the ship. Result: the beams carry 25 light stands per side, the aft quarter ~13, the stern none, the **bow no light stand at all**. The bow belongs to
the main battery: inside 35° of the bow, 900–3 500 m, 20–1 200 m above the sea, she fires **Type 3 "Sanshiki" scatter shells** every ~3.2 s at the point reached by
holding course (flash and "MAIN BATTERY FIRING — BREAK" as the warning; burst after range / 700 m/s; radius 90 m; 10 hull at the centre; a weave or a turn after
the flash escapes). Light stands fire a three-round volley each ~5 s per stand in the field (damage 2.6 per tracer hit, ×difficulty); the 127 mm stands fire
airbursts only at a flyer above 40 m (as every other ship's heavy AA). **A hit silences the stands within 38 m of it on its own flank** (radio call), so a
first hit on the quarter opens a lane. Captain combing uses the existing `cruiser` parameters (slowest turn rate). Measured in the real game (veteran,
30 m, 3 000 m run at 65 m/s): straight along the bow axis −84/−87/−86 hull; a 52° weave −30/−46/−28. State (`s.aa`) is plain data. Not done: no
hits by the model's own turrets, no ship-to-ship fire, no reaction of the destroyers to a silenced flank.

### Rhine "Bonus Stork" (index 24, `storch:true`, `okinawa/tests/storch-browser.cjs`)
A staff officer's Storch flies at tree height along the mapped road; two liaison flights (medevac / mail, 150 points per hit, 600 for a kill) cross his path.
When he sees you (1 700 m, you below 450 m AGL) he lands on the road and the crew runs to a waiting Opel truck. Stop the aircraft or the truck. Shot down in the
air: bonus 500. Gun passes only.

### Rhine "Bonus Night Hunt" (index 25, `schraege:true`, `okinawa/tests/schraege-browser.cjs`)
Night. Three scripted Bf 110 night fighters orbit east of the strip and hunt with ground radar: below 400 ft AGL you are off their screen, up to 2 000 ft they
find you at ~2 mi, above that at ~5 mi, their own set inside 1 000 ft. They approach from **below** and fire upward guns (Schräge Musik): the radio calls
BANDIT BELOW first (2.6 / 2.0 / 1.4 s on Rookie / Veteran / Ace), a jink or a speed change makes the burst miss. **WINDOW** (key J, button next to FLARE, three
bundles) jams the radar for 15 s. An optional Würzburg radar vectors them: destroy it and they search blind for 90 s. Four flares as in "Moonlight Works".
Not saved in a checkpoint: the hunters and their flights restart with the plan.

### Open (Build 248)
No iPad test and no GPU measurement; all strengths and timings above are estimates; scripted aircraft have no flight physics; Betty and Bf 110 are
scripted raiders, not `FlightCore` types; the Yamato's AA plan has no field-of-fire masking by the pagoda or funnel beyond the flank rule; five new
missions appended last (Rhine indices 24 and 25, Pacific Sorties 21–23; the Okinawa free flight moves again, saved mission indices of the Pacific
campaign after it shift by one).

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
