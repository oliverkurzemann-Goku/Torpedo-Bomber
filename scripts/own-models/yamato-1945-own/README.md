# Battleship Yamato — April 1945

`yamato-1945-own.glb` · Torpedo-Bomber project · project-own (original mesh and paint)

April 1945 exterior with superfiring main turrets forward, a third main turret aft, two secondary turrets, a stepped pagoda bridge, a raked funnel, stern catapult structures and a crane. The hull bulge is geometry and the belt is part of the albedo. Decorative ropes, rails, aerials, blast covers and crane carry shipVisualOnly.

Geometry, UVs, stencils and wear were generated in code. The linked references supplied measurements and visual context. Dimensions below are from the exported Float32 positions after applying the GLB transforms.

## Dimensions

| Measurement | Brief, m | Measured, m |
|---|---:|---:|
| Hull beam, X | 38.9 | 38.8 |
| Keel depth below Y = 0 | 10.4 | 10.4 |
| Overall hull length, Z | 263 | 263 |
| Funnel rim above waterline | — | 31.8 |
| Mast or director top above waterline | — | 49.16 |

The U.S. Naval Technical Mission gives 263.0 m overall length and 38.8 m maximum beam. The 10.4 m value is trial draft, which matches the brief. The same report gives 10.86 m at full load. Tamiya lists an alternative 38.9 m beam. Skulski and Draminski give 50 triple 25 mm stands in April 1945, replacing the approximate 24 in the brief. The model includes those 50 stands and twelve twin 127 mm stands. The book's six single mounts are outside the requested twin/triple marker format and are omitted.

The exported asset has 62 unique gun-mount markers. +Z is forward and −X is starboard.

## Export verification

| Metric | Measured | Limit |
|---|---:|---:|
| Triangles | 27,294 | 55,000 |
| Mesh nodes | 36 | 40 |
| Materials | 1 | 12 |
| Embedded albedo | One 2048 × 1024 PNG | One atlas |
| File size | 2,339,668 bytes | 6,000,000 bytes |
| Khronos glTF Validator errors / warnings | 0 / 0 | 0 / 0 |

The GLB and atlas loaded through Three.js r128 GLTFLoader in Node. A physical iPad Safari test is pending.

| Material | Metallic | Roughness | Alpha |
|---|---:|---:|---|
| Painted exterior atlas | 0.04 | 0.82 | OPAQUE |

## Rebuild and check

From this model folder, use Node.js 24.22.1. The generator uses the standard library and fixed seed `19450407`.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

An optional path argument selects the output or input GLB. The checker reads the binary and tests the Float32 vertex bounds, triangle winding, atlas and budgets, node hierarchy, rest pose and marker axes. The four orthographic PNGs use the delivered GLB and a camera-calibrated 1 m scale. The manifest hashes every other file in this folder.

## Named nodes

| Name | Mesh | Role or rig |
|---|---|---|
| `yamato-1945-own` | — | — |
| `Hull` | Yes | — |
| `WeatherDeck` | Yes | — |
| `CitadelAndLowerSuperstructure` | Yes | — |
| `PagodaBridge` | Yes | — |
| `RangefinderAndDirector` | Yes | Visual only |
| `Funnel` | Yes | — |
| `funnel-exhaust-1` | — | Funnel effect origin |
| `AftDirectorAndFunnelUptake` | Yes | — |
| `TurretA` | Yes | `yaw` about `[0, 1, 0]` |
| `GunsA` | Yes | `pitch` about `[1, 0, 0]` |
| `CanvasBlastCoversA` | Yes | Visual only |
| `MuzzleA1` | — | Empty effect marker |
| `MuzzleA2` | — | Empty effect marker |
| `MuzzleA3` | — | Empty effect marker |
| `TurretB` | Yes | `yaw` about `[0, 1, 0]` |
| `GunsB` | Yes | `pitch` about `[1, 0, 0]` |
| `CanvasBlastCoversB` | Yes | Visual only |
| `MuzzleB1` | — | Empty effect marker |
| `MuzzleB2` | — | Empty effect marker |
| `MuzzleB3` | — | Empty effect marker |
| `TurretC` | Yes | `yaw` about `[0, 1, 0]` |
| `GunsC` | Yes | `pitch` about `[1, 0, 0]` |
| `CanvasBlastCoversC` | Yes | Visual only |
| `MuzzleC1` | — | Empty effect marker |
| `MuzzleC2` | — | Empty effect marker |
| `MuzzleC3` | — | Empty effect marker |
| `TurretSecondaryFore` | Yes | `yaw` about `[0, 1, 0]` |
| `GunsSecondaryFore` | Yes | `pitch` about `[1, 0, 0]` |
| `CanvasBlastCoversSecondaryFore` | Yes | Visual only |
| `MuzzleSecondaryFore1` | — | Empty effect marker |
| `MuzzleSecondaryFore2` | — | Empty effect marker |
| `MuzzleSecondaryFore3` | — | Empty effect marker |
| `TurretSecondaryAft` | Yes | `yaw` about `[0, 1, 0]` |
| `GunsSecondaryAft` | Yes | `pitch` about `[1, 0, 0]` |
| `CanvasBlastCoversSecondaryAft` | Yes | Visual only |
| `MuzzleSecondaryAft1` | — | Empty effect marker |
| `MuzzleSecondaryAft2` | — | Empty effect marker |
| `MuzzleSecondaryAft3` | — | Empty effect marker |
| `TurretBarbettes` | Yes | — |
| `HeavyAAGalleries` | Yes | — |
| `LightAAClusters` | Yes | — |
| `AircraftDeckAndCatapults` | Yes | — |
| `CatapultAndTrolleyRails` | Yes | Visual only |
| `SternAircraftCrane` | Yes | Visual only |
| `AftTripodMast` | Yes | Visual only |
| `AntennaSpars` | Yes | Visual only |
| `MastAndCraneRigging` | Yes | Visual only |
| `DeckFittings` | Yes | — |
| `AnchorChains` | Yes | Visual only |
| `BoatsAndDavits` | Yes | Visual only |
| `DeckEdgeRailings` | Yes | Visual only |
| `ScrewsAndShafts` | Yes | Visual only |

## Sources

| Title and URL | Rights or license | Accessed | Use |
|---|---|---|---|
| [U.S. Naval Technical Mission to Japan, Report S-06-2](https://www.fischer-tropsch.org/primary_documents/gvt_reports/USNAVY/USNTMJ%20Reports/USNTMJ-200H-0745-0786%20Report%20S-06-2.pdf) | U.S. government report, public domain in the United States | 2026-11-11 | Yamato 263 m overall, 38.8 m maximum beam and 10.4 m trial draft. |
| [Janusz Skulski and Stefan Draminski, Battleships Yamato and Musashi](https://api.pageplace.de/preview/DT0400.9781472832221_A35506816/preview-9781472832221_A35506816.pdf) | Copyrighted book excerpt, reference only | 2026-11-11 | April 1945 fit and armament groups, turret and silhouette comparison. |
| [Tamiya, Japanese Battleship Yamato, specifications](https://cdn.simba-dickie-group.de/downloads/300078030/300078030_Yamato.pdf) | Tamiya copyrighted historical notes | 2026-11-11 | Cross-check of 38.9 m alternate beam and 10.4 m normal draft. |

## estimated

- Hull stations, bulb profile, freeboard, details of the superstructure, mast height, the weathered Kure-gray shades and deck pattern.
- Exact mount, turret ring, effect marker, catapult and crane positions within the sourced general arrangement.
- Visible main barrels extend 21 m forward of their pivot in the game model. This is a cosmetic target dimension.
