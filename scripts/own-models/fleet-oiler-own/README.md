# Fleet Oiler Nagisa (1942)

`fleet-oiler-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

A fictional 1942 oiler with a midships bridge, aft machinery house, a raised walkover, tank hatches, a cargo pipe layout and the painted bow name NAGISA. Deck edge rails, cargo pipes, catwalk rails, derricks and rigging are visual-only.

Geometry, UVs, stencils and wear were generated in code. The linked references supplied measurements and visual context. Dimensions below are from the exported Float32 positions after applying the GLB transforms.

## Dimensions

| Measurement | Brief, m | Measured, m |
|---|---:|---:|
| Hull beam, X | 18.5 | 17.68 |
| Keel depth below Y = 0 | 8 | 8.08 |
| Overall hull length, Z | 140 | 143.5 |
| Funnel rim above waterline | — | 19.47 |
| Mast or director top above waterline | 28 | 28 |

The Notoro proportions anchor the hull. The U.S. War Department lists 470¾ ft overall, which converts to 143.4846 m and is rounded to 143.50 m here. The Pacific War Online Encyclopedia gives 17.68 m beam and 8.08 m draft. The fictional topworks and two twin 25 mm stands follow the game brief.

The exported asset has 2 unique gun-mount markers. +Z is forward and −X is starboard.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles | 14,424 | 18,000 |
| Mesh nodes | 19 | 24 |
| Materials | 1 | 8 |
| Embedded albedo | One 2048 × 1024 PNG | One atlas |
| File size | 1,302,024 bytes | 4,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and atlas loaded through Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

From this model folder, use Node.js 24.22.1. The generator uses the standard library and fixed seed `1942140`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument selects the output or input GLB. The checker reads the binary and tests the Float32 vertex bounds, triangle winding, atlas and budgets, node hierarchy, rest pose and marker axes. The four orthographic PNGs use the delivered GLB and a camera-calibrated 1 m scale. The manifest hashes every other file in this folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `fleet-oiler-own` | — | — |
| `Hull` | Yes | — |
| `WeatherDeck` | Yes | — |
| `AmidshipsBridgeAndQuarters` | Yes | — |
| `PoopAndEngineHouse` | Yes | — |
| `Forecastle` | Yes | — |
| `Funnel` | Yes | — |
| `funnel-exhaust-1` | — | Funnel effect origin |
| `TankAccessHatchesAndValvePlatforms` | Yes | — |
| `TankDomes` | Yes | — |
| `RaisedCatwalk` | Yes | — |
| `CatwalkRailings` | Yes | Visual only |
| `CargoPipesAndValves` | Yes | Visual only |
| `ForeAndAftCargoMasts` | Yes | Visual only |
| `CargoDerricks` | Yes | Visual only |
| `AntennaeAndDerrickRigging` | Yes | Visual only |
| `TwinAAMounts` | Yes | — |
| `AnchorsMooringsAndWinches` | Yes | Visual only |
| `BoatsAndDavits` | Yes | Visual only |
| `DeckEdgeRailings` | Yes | Visual only |
| `ScrewsAndShafts` | Yes | Visual only |

## Sources

| Title and URL | Rights or license | Accessed | Use |
|---|---|---|---|
| [Identification of Japanese Naval Vessels, U.S. War Department FM 30-58](https://patcosta.com/wp-content/uploads/2024/07/FM-30-58-Military-Intelligence-Identification-of-Japanese-Naval-Vessels-Dec-1941.pdf) | U.S. government publication, public domain in the United States | 2026-11-11 | Notoro overall length reported as 470¾ ft. |
| [Notoro class, Pacific War Online Encyclopedia](https://www.pwencycl.kgbudge.com/N/o/Notoro_class.htm) | Reference text and diagrams, copyrighted | 2026-11-11 | 17.68 m beam, 8.08 m draft, original oiler and late-1942 tanker context. |
| [IJN Oiler/Seaplane Tender NOTORO, CombinedFleet](https://www.combinedfleet.com/Notoro_t.htm) | Copyrighted reference text and images | 2026-11-11 | Historical design context. The model is a fictional 1942 fleet oiler. |

## estimated

- The 28 m mast height, hull stations and outlines above water, placement of the bridge and engine housing, cargo handling features and markings.
- The appearance and positions of the two 25 mm twin stands, hull wear, deck tone and funnel band.
