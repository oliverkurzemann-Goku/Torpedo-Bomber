# Opel Blitz 3 t — Cargo

`opel-blitz-cargo-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

This variant uses the same cab, chassis, wheels, seed and atlas as the Tanker. The cargo body has a stretched canvas roof, painted fold wear, sideboards and a rear tailgate. The wreck has a bare bent frame and flattened tyres.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Measurement | Requested, m | Measured, m |
|---|---:|---:|
| Span / width, X | 2.27 | 2.2 |
| Height, Y | 2.90 | 2.9 |
| Length, Z | 6.00 | 6 |
| Cab roof height | 2.20 | 2.2 |

The DISG vehicle measures 6.00 m long and 2.20 m wide. The 2.20 m source width supersedes the requested 2.27 m.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 2,396 | 5,000 |
| Mesh nodes, including hidden geometry | 8 | 14 |
| Materials | 1 | 5 |
| Embedded albedo atlas | 1 PNG, 1024 × 1024 px | 1 atlas |
| File size | 266,632 bytes | 900,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The hidden wreck uses 292 triangles (13.9% of the intact mesh). Wreck nodes load at scale [0, 0, 0] and carry `extras.visible = false`. Restore unit scale to show them.

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `3601944`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `opel-blitz-cargo-own` | — | — |
| `Intact` | — | — |
| `Chassis` | Yes | — |
| `RoadWheelsAndSpare` | Yes | — |
| `CabShell` | Yes | — |
| `CabGlazing` | Yes | — |
| `CabFendersAndLights` | Yes | — |
| `StretchedCanvasCover` | Yes | — |
| `LoadBed` | Yes | — |
| `Wreck` | Yes | Hidden wreck |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [Opel Blitz, DISG Fahrzeugmuseum](https://www.disg-ev.de/fahrzeugsammlung/opel-blitz) | Museum text and photos, no open reuse license displayed | 2026-11-11 | 6.00 m overall length, 2.20 m width and comparison of the cab silhouette. |

## estimated

- Cab height, bed dimensions, wheelbase, tyre size and roof-bow spacing.
- Width and location of olive stripes, mud, paint abrasion, fictitious fender number 47 and damage geometry.
