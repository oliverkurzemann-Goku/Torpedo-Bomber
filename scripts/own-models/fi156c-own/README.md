# Fieseler Fi 156 C Storch

`fi156c-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

A high-wing liaison aircraft with full-span fixed slats, an inboard flap and outboard aileron on each wing, fixed long main gear, a two-bladed propeller and framed blue-tinted glazing. The flexible rear gun is a cosmetic mesh with a yaw pivot and an effect marker.

Geometry, UVs, stencils and wear were generated in code. The linked references supplied measurements and visual context. Dimensions below are from the exported Float32 positions after applying the GLB transforms.

## Dimensions

| Measurement | Brief, m | Measured, m |
|---|---:|---:|
| Span, X | 14.25 | 14.25 |
| Height, Y | 3.05 | 3.05 |
| Length, Z | 9.9 | 9.9 |
| Propeller swept diameter | — | 2.60001 |

The Fi 156 C sources agree on the overall dimensions. The Argus AS 10 is an inverted V-8. Each main wheel is modeled with a 0.50 m tyre diameter, and the main wheel centers are 3.38 m apart.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles | 6,968 | 20,000 |
| Mesh nodes | 24 | 32 |
| Materials | 2 | 8 |
| Embedded albedo | One 2048 × 2048 PNG | One atlas |
| File size | 791,852 bytes | 4,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and atlas loaded through Three.js r128 GLTFLoader in Node. The current checkout's aircraft controller registers the tailwheel-fighter class. In-game use of the four aircraft classes in this package requires adding their class profiles and drive mappings. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |
| Tinted glazing | 0.00 | 0.76 | BLEND |

## Rebuild and check

From this model folder, use Node.js 24.22.1. The generator uses the standard library and fixed seed `1561943`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument selects the output or input GLB. The checker reads the binary and tests the Float32 vertex bounds, triangle winding, atlas and budgets, node hierarchy, rest pose and marker axes. The four orthographic PNGs use the delivered GLB and a camera-calibrated 1 m scale. The manifest hashes every other file in this folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `fi156c-own` | — | — |
| `Fuselage` | Yes | — |
| `Canopy` | — | `canopy` about `[0, 0, 1]`, 0 to 0.92 rad |
| `CanopyGlazing` | Yes | — |
| `CanopyFrames` | Yes | — |
| `flightFlaps` | — | — |
| `FlapLeft` | Yes | `flapLeft` about `[1, 0, 0]`, 0 to -0.9 rad |
| `AileronLeft` | Yes | `roll` about `[1, 0, 0]`, gain 0.35 |
| `ElevatorLeft` | Yes | `pitch` about `[1, 0, 0]`, gain 0.39 |
| `FlapRight` | Yes | `flapRight` about `[1, 0, 0]`, 0 to -0.9 rad |
| `AileronRight` | Yes | `roll` about `[1, 0, 0]`, gain -0.35 |
| `ElevatorRight` | Yes | `pitch` about `[1, 0, 0]`, gain 0.39 |
| `MainWing` | Yes | — |
| `Tailplane` | Yes | — |
| `FixedLeadingEdgeSlats` | Yes | — |
| `Rudder` | Yes | `yaw` about `[0, 1, 0]`, gain 0.41 |
| `VerticalStabilizer` | Yes | — |
| `ArgusCowlingDetails` | Yes | — |
| `Propeller` | Yes | `prop` about `[0, 0, 1]`, 2 blades |
| `gear` | — | — |
| `GearLeft` | Yes | `gear` about `[1, 0, 0]`, 0 to 0 rad |
| `MainWheelLeft` | Yes | Ground contact |
| `TailGear` | Yes | `gear` about `[1, 0, 0]`, 0 to 0 rad |
| `TailWheel` | Yes | Ground contact |
| `GearRight` | Yes | `gear` about `[1, 0, 0]`, 0 to 0 rad |
| `MainWheelRight` | Yes | Ground contact |
| `WingLiftStrutsAndSteps` | Yes | — |
| `RearGun` | Yes | `yaw` about `[0, 1, 0]`, gain 0.49 |
| `MuzzleRear` | — | Empty effect marker |

## Sources

| Title and URL | Rights or license | Accessed | Use |
|---|---|---|---|
| [Fieseler Fi 156 Storch, Profile Publications 228](https://www.gruppofalchi.com/files/Profile-Publications-Aircraft-228---Fieseler-Fi-156-Storch.pdf) | Published reference, copyright retained | 2026-11-11 | Fi 156 C family outline, Argus inverted V-8, fixed slats, and 2.60 m propeller. |
| [Fieseler Fi 156 Storch, Flugzeuginfo](https://www.flugzeuginfo.net/acdata_php/acdata_fi156_dt.php) | Copyrighted page and photographs | 2026-11-11 | Fi 156 C-2 overall dimensions of 14.25 × 9.90 × 3.05 m. |

## estimated

- The fuselage and wing cross sections, fuselage stations, glazings and remaining individual exterior fittings.
- The game hinge angles, neutral flap and aileron seam, cabin opening pose and flexible rear gun placement.
- The fictional G7 identifier, camouflage boundaries and degree of wear.
