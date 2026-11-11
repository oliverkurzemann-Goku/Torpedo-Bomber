# Panzerkampfwagen IV Ausf. H

`panzer4h-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

The footprint is centered on the tracks. The gun extends beyond that footprint in the neutral pose. `Turret` yaws and its `Gun` child pitches. The main and bow muzzle markers are empty. There are eight road wheels and four return rollers per side, with spare links and exhaust details.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Measurement | Requested, m | Measured, m |
|---|---:|---:|
| Span / width, X | 3.30 | 3.33 |
| Height, Y | 2.70 | 2.68 |
| Length, Z | 7.00 | 7.02 |

The source gives 7.02 m length, 3.33 m skirt width and 2.68 m height. It identifies the drive sprocket at the front and the idler at the rear. The model uses that arrangement and solid Ausf. H skirt panels.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 6,372 | 12,000 |
| Mesh nodes, including hidden geometry | 9 | 24 |
| Materials | 1 | 6 |
| Embedded albedo atlas | 1 PNG, 1024 × 1024 px | 1 atlas |
| File size | 578,608 bytes | 1,500,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The hidden wreck uses 944 triangles (17.4% of the intact mesh). Wreck nodes load at scale [0, 0, 0] and carry `extras.visible = false`. Restore unit scale to show them.

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `401944`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `panzer4h-own` | — | — |
| `Intact` | — | — |
| `Hull` | Yes | — |
| `BowGunFairing` | Yes | — |
| `Muzzle2` | — | Empty effect marker |
| `TracksAndWheels` | Yes | — |
| `HullSchuerzen` | Yes | — |
| `ToolsSpareLinksAndExhaust` | Yes | — |
| `Turret` | — | `yaw` about `[0, 1, 0]` |
| `TurretShellAndCupola` | Yes | — |
| `TurretSchuerzen` | Yes | — |
| `Gun` | Yes | `pitch` about `[1, 0, 0]` |
| `Muzzle1` | — | Empty effect marker |
| `Wreck` | Yes | Hidden wreck |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [Pz.Kpfw. IV Ausf.H, War Drawings technical data](https://www.wardrawings.be/WW2/Files/1-Vehicles/Axis/1-Germany/02-mPanzers/PzKpfw4/Data/PzKpfw-4H.htm) | Reference text and drawings, no open reuse license used | 2026-11-11 | 7.02 m length, 3.33 m skirt width, 2.68 m height, front drive wheel. |
| [Panzer IV Ausf. H, History of War](https://www.historyofwar.org/Pictures/pictures_panzer_IV_ausf_H.html) | Reference photograph, rights as labeled on page | 2026-11-11 | Exterior comparison and drive sprocket identification. |

## estimated

- Hull and turret cross-sections, damaged skirt layout, surface wear, Zimmerit pattern and cosmetic fittings.
- Fictitious turret number 825 and the specific camouflage distribution.
