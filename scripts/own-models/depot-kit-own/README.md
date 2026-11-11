# Fuel and Ammunition Depot Scenery Kit

`depot-kit-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

The six scene roots are reusable assets. Each has a centered local footprint, a Y = 0 contact plane and its own hidden Wreck. Reset a root’s scene translation when placing it in the game. The atlas uses a cutout only on `CamoNet_Cloth`.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Independent root | Requested envelope, m | Measured X × Y × Z, m | Triangles incl. wreck | Maximum |
|---|---|---|---:|---:|
| `DrumStack` | 1.20 × 1.00 pallet; 1.00 stack height | 2.4 × 1 × 2 | 576 | 700 |
| `CrateStack` | 2.00 × 1.40 × 1.50 | 2 × 1.4 × 1.5 | 276 | 500 |
| `FuelTank` | 3.00 diameter × 12.00 length | 3 × 3.98 × 12 | 684 | 1200 |
| `CamoNet` | 6.00 × 3.00 × 8.00 | 6 × 3 × 8 | 248 | 800 |
| `Berm` | 3.00 × 1.50 × 10.00 | 3 × 1.5 × 10 | 270 | 600 |
| `Hut` | 4.00 × 3.00 × 8.00 | 4 × 3 × 8 | 174 | 900 |

Twelve 0.57 m drums arranged 4 × 3 require at least 2.28 × 1.71 m. Four 1.20 × 1.00 m pallets preserve the drum count, measured drum size and 1.00 m stack height. The assembled base is 2.40 × 2.00 m. The pallet dimensions are a modern nominal size reference.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 2,228 | 6,000 |
| Mesh nodes, including hidden geometry | 13 | 20 |
| Materials | 2 | 6 |
| Embedded albedo atlas | 1 PNG, 1024 × 1024 px | 1 atlas |
| File size | 254,544 bytes | 1,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

Wreck nodes load at scale [0, 0, 0] and carry `extras.visible = false`. Restore unit scale to show them.

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |
| Cutout camouflage cloth | 0.04 | 0.82 | MASK |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `194422`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `DrumStack` | — | — |
| `DrumStack_Intact` | Yes | — |
| `DrumStack_Wreck` | Yes | Hidden wreck |
| `CrateStack` | — | — |
| `CrateStack_Intact` | Yes | — |
| `CrateStack_Wreck` | Yes | Hidden wreck |
| `FuelTank` | — | — |
| `FuelTank_Intact` | Yes | — |
| `FuelTank_Wreck` | Yes | Hidden wreck |
| `CamoNet` | — | — |
| `CamoNet_Intact` | Yes | — |
| `CamoNet_Cloth` | Yes | — |
| `CamoNet_Wreck` | Yes | Hidden wreck |
| `Berm` | — | — |
| `Berm_Intact` | Yes | — |
| `Berm_Wreck` | Yes | Hidden wreck |
| `Hut` | — | — |
| `Hut_Intact` | Yes | — |
| `Hut_Wreck` | Yes | Hidden wreck |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [200 Liter Stahlfass mit Deckel, Leka Trading](https://lekatrading.com/at/product/fasser/200-liter-stahlfass-mit-deckel-schwarz-vs007/) | Product specifications, no open reuse license used | 2026-11-11 | Nominal drum dimensions 570 × 880 mm. |
| [EPAL product sheets](https://www.epal-pallets.org/eu-en/media-centre/product-sheets) | Manufacturer reference material, no open reuse license used | 2026-11-11 | Nominal 1200 × 1000 mm pallet envelope. |
| [Nissen Huts, National Trust Heritage Records](https://heritagerecords.nationaltrust.org.uk/HBSMR/MonRecord.aspx?skin=printerfriendly&uid=MNA180774) | Heritage record, no open reuse license used | 2026-11-11 | Corrugated half-round hut profile. |

## estimated

- Pallet thickness and board profiles, individual crate sizes and layout, fuel tank support geometry and 3.98 m overall height.
- Camouflage-net sag, embankment profile, sandbags, and the hut’s doors and windows.
- All colours, wear, wreck damage and module staging offsets.
