# Consolidated PBY-5A Catalina (1942)

`pby5a-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

The rest pose has extended tricycle gear, deployed tip floats and neutral control surfaces. Each gear leg has one wheel mesh marked `groundWheel`. Both propeller nodes are unrotated with local +Z as the spin axis. Tip floats use independent `floatLeft` and `floatRight` drives. AOPA documents the absence of wing flaps. The glass uses the same atlas as the exterior, and the nose and blisters carry empty effect markers.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Measurement | Requested, m | Measured, m |
|---|---:|---:|
| Span / width, X | 31.70 | 31.6992 |
| Height, Y | 6.15 | 6.1468 |
| Length, Z | 19.46 | 19.4564 |

Pima lists 104 ft span, 63 ft 10 in length and 20 ft 2 in height. The exact conversions are 31.6992 m, 19.4564 m and 6.1468 m. The American Heritage Museum restoration shows the mid-1942 white star with its red center overpainted.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 9,510 | 34,000 |
| Mesh nodes, including hidden geometry | 30 | 40 |
| Materials | 2 | 10 |
| Embedded albedo atlas | 1 PNG, 2048 × 2048 px | 1 atlas |
| File size | 936,380 bytes | 6,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |
| Smoked glazing | 0.00 | 0.76 | BLEND |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `194205`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `pby5a-own` | — | — |
| `SteppedFlyingBoatHull` | Yes | — |
| `WingPylonAndStruts` | Yes | — |
| `NoseTurretAndGlazingFrames` | Yes | — |
| `CanopyAndNoseTurretGlazing` | Yes | — |
| `Muzzle1` | — | Empty effect marker |
| `BlisterLeft` | Yes | — |
| `BlisterFrameLeft` | Yes | — |
| `MuzzleBlisterLeft` | — | Empty effect marker |
| `BlisterRight` | Yes | — |
| `BlisterFrameRight` | Yes | — |
| `MuzzleBlisterRight` | — | Empty effect marker |
| `AileronLeft` | Yes | `roll` about `[1, 0, 0]`, gain 0.37 |
| `ElevatorLeft` | Yes | `pitch` about `[1, 0, 0]`, gain 0.42 |
| `NacelleLeft` | Yes | — |
| `RadialEngineLeft` | Yes | — |
| `PropellerLeft` | Yes | `prop` about `[0, 0, 1]`, 3 blades |
| `FloatLeft` | Yes | `floatLeft` about `[0, 0, 1]`, 0 to -1.5708 rad |
| `AileronRight` | Yes | `roll` about `[1, 0, 0]`, gain -0.37 |
| `ElevatorRight` | Yes | `pitch` about `[1, 0, 0]`, gain 0.42 |
| `NacelleRight` | Yes | — |
| `RadialEngineRight` | Yes | — |
| `PropellerRight` | Yes | `prop` about `[0, 0, 1]`, 3 blades |
| `FloatRight` | Yes | `floatRight` about `[0, 0, 1]`, 0 to 1.5708 rad |
| `ParasolWing` | Yes | — |
| `HorizontalStabilizer` | Yes | — |
| `VerticalStabilizer` | Yes | — |
| `Rudder` | Yes | `yaw` about `[0, 1, 0]`, gain 0.45 |
| `gear` | — | — |
| `GearLeft` | Yes | `gear` about `[0, 0, 1]`, 0 to 1.47 rad |
| `MainWheelLeft` | Yes | Ground contact |
| `GearRight` | Yes | `gear` about `[0, 0, 1]`, 0 to -1.47 rad |
| `MainWheelRight` | Yes | Ground contact |
| `NoseGear` | Yes | `gear` about `[1, 0, 0]`, 0 to -1.37 rad |
| `NoseWheel` | Yes | Ground contact |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [Consolidated PBY-5A, Pima Air & Space Museum](https://pimaair.org/museum-aircraft/consolidated-pby-5a/) | Museum photographs and text, all rights reserved, reference only | 2026-11-11 | Overall length, span, height and R-1830 installation. |
| [Consolidated PBY-5a Catalina: Stand up and salute, AOPA](https://www.aopa.org/news-and-media/all-news/2014/august/pilot/f_pby) | AOPA copyright, reference only | 2026-11-11 | Absence of wing flaps and amphibian configuration. |
| [Consolidated PBY Catalina, American Heritage Museum](https://www.americanheritagemuseum.org/aircrafts/consolidated-pby-catalina/) | Museum copyright, reference only | 2026-11-11 | Pylon, nose and waist glazing, 1942 two-tone livery with overpainted red centre. |

## estimated

- Hull stations, step contour, cockpit framing, small control-surface gaps, gear pivots and angular ranges.
- Exact markings placement and fictional number 27, weathering intensity and paint swatches within the 1942 scheme.
- Tip-float profiles and folding angles. The floats have game rig metadata with no baked keyframe animation.
