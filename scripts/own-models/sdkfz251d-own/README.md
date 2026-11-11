# Sd.Kfz. 251/1 Ausf. D

`sdkfz251d-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

The roofless fighting compartment includes benches and exterior stowage. The road wheels alternate inboard and outboard. `Gun` pitches about local +X. `Muzzle2` faces aft. The wreck has its own lowered hull and running gear.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Measurement | Requested, m | Measured, m |
|---|---:|---:|
| Span / width, X | 2.10 | 2.1 |
| Height, Y | 1.75 | 1.75 |
| Length, Z | 6.00 | 5.98 |

The reference dimensions are 5.98 × 2.10 × 1.75 m (length, width, height).

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 4,130 | 6,500 |
| Mesh nodes, including hidden geometry | 7 | 18 |
| Materials | 1 | 5 |
| Embedded albedo atlas | 1 PNG, 1024 × 1024 px | 1 atlas |
| File size | 399,156 bytes | 1,100,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The hidden wreck uses 524 triangles (14.5% of the intact mesh). Wreck nodes load at scale [0, 0, 0] and carry `extras.visible = false`. Restore unit scale to show them.

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `2511944`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `sdkfz251d-own` | — | — |
| `Intact` | — | — |
| `LowerHull` | Yes | — |
| `OpenSlopedArmorAndBonnet` | Yes | — |
| `WheelsAndInterleavedTracks` | Yes | — |
| `BenchesStowageAndFenders` | Yes | — |
| `Gun` | Yes | `pitch` about `[1, 0, 0]` |
| `Muzzle1` | — | Empty effect marker |
| `RearGun` | Yes | — |
| `Muzzle2` | — | Empty effect marker |
| `Wreck` | Yes | Hidden wreck |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [Sd.Kfz. 251/1 Ausf. D, Quartermaster Section](https://www.quartermastersection.com/german/afvs/525/SdKfz2511AusfD) | Reference text and photograph, no open reuse license used | 2026-11-11 | Dimensions, angled stern, wheels and hull profile. |

## estimated

- Interior layout, stowage placement, barrel silhouettes and simplified track and road-wheel spacing.
- Weathering, Zeltbahn-style colour distribution, fictitious side number 317 and damage geometry.
