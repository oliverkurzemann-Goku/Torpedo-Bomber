# Flakvierling Platform Wagon

`flakwagen-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

`Turret` pivots about local +Y. Its child `Gun` pivots about local +X and carries four empty game markers. The wagon has separate front and rear bogie meshes and a centered footprint at railhead level.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Measurement | Requested, m | Measured, m |
|---|---:|---:|
| Span / width, X | 3.00 | 3 |
| Height, Y | 3.40 | 3.4 |
| Length, Z | 12.00 | 12 |
| Track gauge | 1.435 | 1.435 |

The Bundesarchiv image establishes period appearance. The wagon’s 12 × 3 × 3.4 m envelope is the game target. The 1.435 m gauge uses the ERA reference.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 4,744 | 7,000 |
| Mesh nodes, including hidden geometry | 9 | 18 |
| Materials | 1 | 6 |
| Embedded albedo atlas | 1 PNG, 1024 × 1024 px | 1 atlas |
| File size | 449,364 bytes | 1,200,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The hidden wreck uses 456 triangles (10.6% of the intact mesh). Wreck nodes load at scale [0, 0, 0] and carry `extras.visible = false`. Restore unit scale to show them.

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `38021944`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `flakwagen-own` | — | — |
| `Intact` | — | — |
| `WagonFrame` | Yes | — |
| `BogieFront` | Yes | — |
| `BogieRear` | Yes | — |
| `PanelArmour` | Yes | — |
| `StowageAndBrake` | Yes | — |
| `Turntable` | Yes | — |
| `Turret` | — | `yaw` about `[0, 1, 0]` |
| `MountAndSeats` | Yes | — |
| `Gun` | Yes | `pitch` about `[1, 0, 0]` |
| `Muzzle1` | — | Empty effect marker |
| `Muzzle2` | — | Empty effect marker |
| `Muzzle3` | — | Empty effect marker |
| `Muzzle4` | — | Empty effect marker |
| `Wreck` | Yes | Hidden wreck |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [Vierlingsflak auf Eisenbahn, Bundesarchiv Bild 101I-621-2944-26A](https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-621-2944-26A,_Vierlingsflak_auf_Eisenbahn.jpg) | CC BY-SA 3.0 DE photograph | 2026-11-11 | Period exterior context for an open railway AA platform. |
| [Rail track gauge, European Union Agency for Railways](https://www.era.europa.eu/era-railway-terminology-collection/railtrackgauge/term/eu_policy) | Public reference page, no open reuse license used | 2026-11-11 | Nominal 1,435 mm standard track gauge. |

## estimated

- Carbody construction, bogie spacing and wheel sizes, armour panels, shield silhouette and pivot placements.
- Paint, painted foliage, stowage and fictitious wagon number 428.
