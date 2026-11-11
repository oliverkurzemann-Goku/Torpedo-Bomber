# Messerschmitt Bf 110 G-4 (Lichtenstein SN-2)

`bf110g4-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

A night-fighter exterior with two DB 605 nacelles, flame-damper silhouettes, four H-shaped nose antenna clusters, framed glazing and twin rudders. The forward and upward nodes are empty effect markers. The main legs fold rearward about their local X axes.

Geometry, UVs, stencils and wear were generated in code. The linked references supplied measurements and visual context. Dimensions below are from the exported Float32 positions after applying the GLB transforms.

## Dimensions

| Measurement | Brief, m | Measured, m |
|---|---:|---:|
| Span, X | 16.25 | 16.25 |
| Height, Y | 4.2 | 4.16 |
| Length, Z | 12.6 | 12.65 |
| PropellerLeft swept diameter | — | 3.50001 |
| PropellerRight swept diameter | — | 3.50001 |

The Australian War Memorial G-4/R3 dimensions provide the 16.25 m span and 12.65 m reference length. The modeled overall envelope includes the nose aerial tips. Revell's technical table gives a height of 4.16 m. Antenna lengths and fit vary by aircraft.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles | 9,766 | 36,000 |
| Mesh nodes | 26 | 44 |
| Materials | 2 | 12 |
| Embedded albedo | One 2048 × 2048 PNG | One atlas |
| File size | 977,400 bytes | 6,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and atlas loaded through Three.js r128 GLTFLoader in Node. The current checkout's aircraft controller registers the tailwheel-fighter class. In-game use of the four aircraft classes in this package requires adding their class profiles and drive mappings. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |
| Tinted glazing | 0.00 | 0.76 | BLEND |

## Rebuild and check

From this model folder, use Node.js 24.22.1. The generator uses the standard library and fixed seed `1101944`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument selects the output or input GLB. The checker reads the binary and tests the Float32 vertex bounds, triangle winding, atlas and budgets, node hierarchy, rest pose and marker axes. The four orthographic PNGs use the delivered GLB and a camera-calibrated 1 m scale. The manifest hashes every other file in this folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `bf110g4-own` | — | — |
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
| `RudderLeft` | Yes | `yaw` about `[0, 1, 0]`, gain 0.41 |
| `RudderRight` | Yes | `yaw` about `[0, 1, 0]`, gain 0.41 |
| `TwinVerticalStabilizers` | Yes | — |
| `EngineNacelleLeft` | Yes | — |
| `PropellerLeft` | Yes | `prop` about `[0, 0, 1]`, 3 blades |
| `EngineNacelleRight` | Yes | — |
| `PropellerRight` | Yes | `prop` about `[0, 0, 1]`, 3 blades |
| `gear` | — | — |
| `GearLeft` | Yes | `gear` about `[1, 0, 0]`, 0 to 1.42 rad |
| `MainWheelLeft` | Yes | Ground contact |
| `TailGear` | Yes | `gear` about `[1, 0, 0]`, 0 to -0.8 rad |
| `TailWheel` | Yes | Ground contact |
| `GearRight` | Yes | `gear` about `[1, 0, 0]`, 0 to 1.42 rad |
| `MainWheelRight` | Yes | Ground contact |
| `LichtensteinSN2AntennaArray` | Yes | — |
| `Muzzle1` | — | Empty effect marker |
| `Muzzle2` | — | Empty effect marker |
| `Muzzle3` | — | Empty effect marker |
| `Muzzle4` | — | Empty effect marker |
| `MuzzleUp1` | — | Empty effect marker |
| `MuzzleUp2` | — | Empty effect marker |
| `NoseAndDorsalGunSilhouettes` | Yes | — |

## Sources

| Title and URL | Rights or license | Accessed | Use |
|---|---|---|---|
| [Striking by Night: Messerschmitt Bf 110, Australian War Memorial](https://www.awm.gov.au/visit/exhibitions/striking/planes/german/bf110) | AWM reference page, copyrighted text and reference photograph | 2026-11-11 | 16.25 m span, 12.65 m length and G-4 exterior. |
| [Messerschmitt Bf 110G-4 technical data, Revell](https://downloads.revell.de/Manuals-Modelkits/CM_04857.pdf) | Revell copyright | 2026-11-11 | 4.16 m height and SN-2 appearance comparison. |
| [Messerschmitt Bf 110G-4, Royal Air Force Museum](https://www.rafmuseum.org.uk/research/collections/messerschmitt-bf-110g-2/) | RAF Museum copyright | 2026-11-11 | External antenna array and survivor silhouette. |

## estimated

- The two 3.50 m propeller diameters are the game target from the brief. The figure remains a game estimate pending a configuration-specific historical source.
- Nose and tail cross sections, canopy stations, antenna proportions and mounting positions.
- Retraction angles and hinge placements, the N4 marking and the RLM 75 mottling distribution.
