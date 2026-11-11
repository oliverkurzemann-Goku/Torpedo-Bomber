# Pacific Hospital Ship (1942)

`hospital-ship-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

This fictional Pacific hospital ship has one funnel, two masts and six boats per side. +Z is the bow and −X is starboard. The hull crosses sit on white fields and the green band spans the hull sides. The foredeck, aft deck and funnel carry painted crosses. Decorative rigging, masts, rails, boats and davits have `shipVisualOnly: true`. The gun-mount marker list is empty.

The mesh, UVs, markings and surface weathering were made in code. References supplied measurements and visual context. Dimensions below were calculated from the exported Float32 vertices after applying the node transforms.

## Dimensions

| Measurement | Requested, m | Measured, m |
|---|---:|---:|
| Length over all, Z | 160 | 163.3 |
| Hull beam, X | 20 | 20.12 |
| Draft from Y = 0 | 8.5 | 9.23 |
| Funnel rim above waterline | 30 | 30 |
| Mast top above waterline | — | 36.42287 |

NYK documents an overall length of 163.30 m and a beam of 20.12 m. The Japan Maritime Daily archive gives a full-load draft of 9.23 m. These dimensions supersede the approximate brief. The 30 m funnel rim is a game dimension measured from the Y = 0 waterline.

The broadside distance render uses a 1,500 m camera, 7° elevation, a 76° vertical field of view and a 1,920 × 1,200 viewport. The projected scale at the target is 0.512 px/m. A 10 m hull field projects to about 5.1 px. The white hull, green line and red center are visible in this render. Legibility varies with view direction and render resolution. The preview includes the full frame and a pixel-enlarged inset.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles, including hidden geometry | 7,510 | 24,000 |
| Mesh nodes, including hidden geometry | 22 | 30 |
| Materials | 1 | 10 |
| Embedded albedo atlas | 1 PNG, 2048 × 1024 px | 1 atlas |
| File size | 696,404 bytes | 5,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and its embedded PNG were decoded with Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

Run from this folder with Node.js 24.22.1. The generator uses the standard library and fixed seed `19421930`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument to either script selects the output or input GLB. The checker reads the exported binary and verifies vertex bounds, triangle winding, the atlas, material limits, budgets, rig axes and required nodes. The four orthographic PNGs were rendered from this GLB. Each has a 1 m scale bar based on its orthographic camera. The manifest hashes every other file in this model folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `hospital-ship-own` | — | — |
| `Hull` | Yes | — |
| `WeatherDeck` | Yes | — |
| `PromenadeAndPassengerDecks` | Yes | — |
| `BridgeHouse` | Yes | — |
| `HatchesAndWinches` | Yes | — |
| `SingleFunnel` | Yes | — |
| `funnel-exhaust-1` | — | Funnel effect origin |
| `MastsAndCargoDerricks` | Yes | Visual only |
| `AerialsAndDerrickRigging` | Yes | Visual only |
| `DeckRailings` | Yes | Visual only |
| `LifeboatStarboard1` | Yes | Visual only |
| `LifeboatStarboard2` | Yes | Visual only |
| `LifeboatStarboard3` | Yes | Visual only |
| `LifeboatStarboard4` | Yes | Visual only |
| `LifeboatStarboard5` | Yes | Visual only |
| `LifeboatStarboard6` | Yes | Visual only |
| `LifeboatPort1` | Yes | Visual only |
| `LifeboatPort2` | Yes | Visual only |
| `LifeboatPort3` | Yes | Visual only |
| `LifeboatPort4` | Yes | Visual only |
| `LifeboatPort5` | Yes | Visual only |
| `LifeboatPort6` | Yes | Visual only |
| `LifeboatDavitsAndFalls` | Yes | Visual only |

## Sources

| Title and URL | License or rights status | Accessed (UTC) | Use |
|---|---|---|---|
| [Hikawa Maru history, NYK Line](https://hikawamaru.nyk.com/en/history.html) | NYK Line reference text and photographs, no open reuse license used | 2026-11-11 | Overall length and breadth, silhouette, 1941 hospital conversion and colours. |
| [Hikawa Maru archive, Japan Maritime Daily](https://www.jmd.co.jp/article.php?no=110379) | Japan Maritime Daily reference article, no open reuse license used | 2026-11-11 | Full-load 9.23 m draft. |

## estimated

- Hull station profiles and deck, bridge, funnel and boat proportions. The model represents a fictional ship.
- Funnel rim height and the white fields on deck. The funnel fields fit the smaller funnel surface.
- Wear intensity, material swatches and stripe position.
