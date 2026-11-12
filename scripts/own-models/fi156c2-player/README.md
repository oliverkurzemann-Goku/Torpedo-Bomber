# Fieseler Fi 156 C-2 Storch

`fi156c-own.glb` is an original procedural model and albedo atlas made for Torpedo-Bomber. The 30 June 1940 C-2 type plate supplied dimensions and contour stations. The package includes no scan, photograph, borrowed texture, or third-party geometry.

## Dimensions

| Quantity | Original requirement | 1940 manual | Measured GLB |
| --- | --- | --- | --- |
| Span, X | 14.25 m | 14.25 m, Annex 3 | 14.25 m |
| Length, Z, fuselage level | 9.90 m quoted without attitude | 9.670 m, Annex 2 | 9.670 m |
| Height, Y, fuselage level | 3.05 m quoted without attitude | 3.810 m, Annex 2 | 3.810 m |
| Length, on main tyres and skid | 9.90 m | 9.90 m, Annex 3 | 9.842 m |
| Height, on main tyres and skid | 3.05 m | 3.05 m, Annex 3. Annex 2 shows 3.20 m to the mast. | 3.422 m including the stationary blade at its preview angle |
| Main wheel track | — | 3.40 m | 3.40 m |
| Tailplane span | — | 4.750 m | 4.750 m |
| Propeller diameter | — | 2.60 m | 2.6022 m |

The GLB default uses the level-fuselage datum. The static ground-fit angle calculated from the model's supports is 13.228°. The parked full vertex box exceeds 3.05 m. Propeller phase, the radio mast, and suspension compression affect the parked envelope. The original 9.90 m and 3.05 m values are retained above as the manual's ground-attitude figures.

## Budgets

| Metric | Measured | Limit |
| --- | ---: | ---: |
| Triangles | 14,484 | 20,000 |
| Mesh nodes | 22 | 32 |
| Materials | 3 | 8 |
| Embedded albedo PNG | 1, 2048 × 2048 | 1, 2048 × 2048 |
| GLB bytes | 974,840 | 4,000,000 |

Materials are Painted steel and fabric, Rubber, wood and fittings, Glazing. Only glazing uses blending or renders both sides. The model uses Float32 positions, +Y up and +Z forward. The four PNG views render the GLB with a 1 m bar.

## Controls and nodes

The 40° flaps, ailerons, elevators, rudder, opening left cabin door, and two-blade propeller have named pivots and rig metadata. The fixed legs and the sprung tail skid provide three vertex-based contacts. The forward slats are fixed. This unarmed player configuration has no rear gun or muzzle node.

`Storch`, `gear`, `flightFlaps`, `Canopy`, `TailGear`, `GearLeft`, `GearRight`, `Propeller`, `TailSkid`, `Rudder`, `MainStrutsLeft`, `WheelLeft`, `FlapLeft`, `AileronLeft`, `ElevatorLeft`, `MainStrutsRight`, `WheelRight`, `FlapRight`, `AileronRight`, `ElevatorRight`, `Airframe`, `Fittings`, `CabinGlazing`, `FramesAndBraces`, `DoorGlazing`, `DoorFrame`, `Wings`, `FixedTail`, `SkidLinkage`

## Build and test

Run the Node.js generator and checker from this folder. No npm dependencies are required for the generator or checker.

```sh
node generator/build.cjs
node check.cjs
```

The atlas uses seed 1561940. The included validator report is the unfiltered Khronos result. MANIFEST.json lists each other file's SHA-256. A manifest cannot contain its own final SHA-256.

## Game integration

Apply the included patch on a clean checkout based on `7374419` (Build 248). From that checkout, run `git apply --check /path/to/game-integration.patch` followed by `git apply /path/to/game-integration.patch`. Select **Hangar → Europe → Free flight → Fieseler Fi 156 C-2 Storch**. The runway and airborne start modes use the player variant. The existing Bonus Stork mission retains its original model.

Annex 3 anchors the in-game flight profile at 1,260 kg, 26 m² wing area, and 240 PS. The level-speed and climb fit reproduces 175 km/h and 4.6 m/s with 10° of flap in the calibration. The clean/full-flap minimum speeds are 62/51 km/h. The final full-flap IAS reference uses the manual's 70 km/h prescribed minimum. The game offers 0°, 15°, and 40° flap settings.

`node okinawa/tests/storch-flight.cjs` loads and decodes the new binary with the actual Three.js r128 loader and exercises the runtime joints, the three ground contacts, the take-off and landing routines on a level synthetic runway, and the airborne flight controller. The simulated ground roll was 55.4 m at lift-off. The manual lists 75 m in still air with full flap. The controlled touchdown test at 70 km/h rolled 61.0 m, compared with the manual's 26 m braked-roll figure under its landing procedure. These game distances were not fitted to the historical ground figures. Browser startup was blocked by the host socket policy. iPad Safari has not been tested.

## Sources

| Title | URL | Licence | Accessed | Use |
| --- | --- | --- | --- | --- |
| Fi 156 Flugzeughandbuch L.Dv.T. 2601/1, 30 June 1940 | [Scan](https://drive.google.com/file/d/1W0K-B4_2USPFG5wsZDeOR4NMF924dtz4/view) | Historical reference, rights not asserted | 2026-11-12 | Annex 2 C-2 type plate (PDF p. 246), Annex 3 dimensions and performance (pp. 247–248), Annex 10 controls (pp. 269–270), main gear/skid (p. 11) |
| Museum Alkmaar ’40–’45 technical manual catalogue | [Catalogue](https://sites.google.com/museumalkmaar40-45.nl/museumalkmaar40-45/voorschriften-manuals/l-dv-l-dv-g-l-dv-t/l-dv-t-2150-l-dv-t-9000) | Museum reference, rights retained | 2026-11-12 | Manual identity and issue date |
| Fieseler Fi 156 Storch, Ladislav Rejthar, HyperScale | [Article](https://www.hyperscale.com/features/2000/fi156storchlr_1.htm) | Copyright retained | 2026-11-12 | Secondary reference for the RLM 70/71 paint family |
| Fieseler Storch, Aero 2/1992 | [Scan](https://bc.pollub.pl/Content/14136/Aero%202%201992.pdf) | Copyright retained | 2026-11-12 | Secondary reference for RLM 65 undersides and green upper surfaces |

## Estimated

Contour stations without dimension lines were measured from the scan and interpolated. Internal profiles, local cross-sections, tyre crown, cabin fittings, strut section details, hinge offsets, door travel, static suspension stance, and parked propeller phase are approximations. The symmetric stick mapping simplifies the asymmetric control stops. The visual camouflage uses RLM 70, 71 and 65 approximations based on the specified RGB swatches. The pattern, fictional codes, wear, and baked occlusion were authored for the game. Flight-controller roll rate, structural limit, flap drag, grip, ground roll, and assistance are simulator parameters. The existing Bf 109 audio is a placeholder for the Argus As 10C/3.
