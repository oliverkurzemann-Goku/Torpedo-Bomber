# Mitsubishi G4M1 Model 11 Betty (1942)

`g4m1-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

Model 11 with two Kasei radial nacelles, a mid-wing, single fin, tinted nose and tail cones, dorsal glazing and side blisters. Torpedo is an independent, partly recessed exterior mesh with its origin at the midpoint.

Geometry, UVs, stencils and wear were generated in code. The linked references supplied measurements and visual context. Dimensions below are from the exported Float32 positions after applying the GLB transforms.

## Dimensions

| Measurement | Brief, m | Measured, m |
|---|---:|---:|
| Span, X | 24.89 | 24.89 |
| Height, Y | 4.5 | 4.9 |
| Length, Z | 19.97 | 19.97 |
| PropellerLeft swept diameter | — | 3.40001 |
| PropellerRight swept diameter | — | 3.40001 |
| Torpedo mesh length | 5.3 | 5.3 |
| Torpedo shell diameter | 0.45 | 0.45 |

The Model 11 technical summary gives 24.89 m span, 19.97 m length and 4.90 m height in horizontal attitude. The model uses the 4.90 m source envelope and a game rest pose with all three wheels on Y = 0. The propeller diameter cross-check is 3.40 m.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles | 12,224 | 38,000 |
| Mesh nodes | 28 | 44 |
| Materials | 2 | 12 |
| Embedded albedo | One 2048 × 2048 PNG | One atlas |
| File size | 1,201,584 bytes | 6,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and atlas loaded through Three.js r128 GLTFLoader in Node. The current checkout's aircraft controller registers the tailwheel-fighter class. In-game use of the four aircraft classes in this package requires adding their class profiles and drive mappings. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |
| Tinted glazing | 0.00 | 0.76 | BLEND |

## Rebuild and check

From this model folder, use Node.js 24.22.1. The generator uses the standard library and fixed seed `4111942`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument selects the output or input GLB. The checker reads the binary and tests the Float32 vertex bounds, triangle winding, atlas and budgets, node hierarchy, rest pose and marker axes. The four orthographic PNGs use the delivered GLB and a camera-calibrated 1 m scale. The manifest hashes every other file in this folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `g4m1-own` | — | — |
| `Fuselage` | Yes | — |
| `Canopy` | — | `canopy` about `[1, 0, 0]`, 0 to 0.54 rad |
| `CanopyGlazing` | Yes | — |
| `CanopyFrames` | Yes | — |
| `flightFlaps` | — | — |
| `FlapLeft` | Yes | `flapLeft` about `[1, 0, 0]`, 0 to -0.66 rad |
| `AileronLeft` | Yes | `roll` about `[1, 0, 0]`, gain 0.35 |
| `ElevatorLeft` | Yes | `pitch` about `[1, 0, 0]`, gain 0.39 |
| `FlapRight` | Yes | `flapRight` about `[1, 0, 0]`, 0 to -0.66 rad |
| `AileronRight` | Yes | `roll` about `[1, 0, 0]`, gain -0.35 |
| `ElevatorRight` | Yes | `pitch` about `[1, 0, 0]`, gain 0.39 |
| `MainWing` | Yes | — |
| `Tailplane` | Yes | — |
| `Rudder` | Yes | `yaw` about `[0, 1, 0]`, gain 0.41 |
| `VerticalStabilizer` | Yes | — |
| `EngineNacelleLeft` | Yes | — |
| `RadialEngineLeft` | Yes | — |
| `PropellerLeft` | Yes | `prop` about `[0, 0, 1]`, 3 blades |
| `EngineNacelleRight` | Yes | — |
| `RadialEngineRight` | Yes | — |
| `PropellerRight` | Yes | `prop` about `[0, 0, 1]`, 3 blades |
| `gear` | — | — |
| `GearLeft` | Yes | `gear` about `[1, 0, 0]`, 0 to 1.42 rad |
| `MainWheelLeft` | Yes | Ground contact |
| `TailGear` | Yes | `gear` about `[1, 0, 0]`, 0 to -0.8 rad |
| `TailWheel` | Yes | Ground contact |
| `GearRight` | Yes | `gear` about `[1, 0, 0]`, 0 to 1.42 rad |
| `MainWheelRight` | Yes | Ground contact |
| `MuzzleBeamLeft` | — | Empty effect marker |
| `MuzzleBeamRight` | — | Empty effect marker |
| `NoseTailAndBlisterGlazing` | Yes | — |
| `GlazingRimsAndTurretBases` | Yes | — |
| `MuzzleTail` | — | Empty effect marker |
| `MuzzleDorsal` | — | Empty effect marker |
| `Torpedo` | Yes | — |

## Sources

| Title and URL | Rights or license | Accessed | Use |
|---|---|---|---|
| [Mitsubishi G4M Betty, Aircraftube technical summary](https://www.aircraftube.com/index.php?fichid=504&lang=en) | Copyrighted reference page | 2026-11-11 | Model 11 dimensions: 24.89 m span, 19.97 m length and 4.90 m height in horizontal attitude. |
| [Mitsubishi G4M Betty, Profile Publications 210](https://www.gruppofalchi.com/files/Profile-Publications-Aircraft-210---Mitsubishi-G4M-Betty.pdf) | Published reference, copyright retained | 2026-11-11 | Model 11 cross-check, crew glazing and exterior profile. |
| [G4M1 Model 11 mod. 1941, community technical summary](https://forum.warthunder.com/t/mitsubishi-g4m1-model-11-mod-1941-betty/260159) | Copyrighted forum text, reference only | 2026-11-11 | 3.40 m propeller diameter cross-check. No game asset, image or drawing incorporated. |

## estimated

- Fuselage stations, glass profiles, nacelle and dorsal fitting sizes, and overall in-game stance.
- Control surface hinges, gear rotation angles and external prop placement.
- The fictional white number 62, yellow bands, roundel positions and wear.
