# Fieseler Fi 103

Original Torpedo-Bomber project exterior and paint. The generator builds the GLB from numeric geometry and procedural pigments with a fixed seed. Reference images were used only to compare proportions and appearance. No source image, texture, tracing or model data is embedded.

## Build and check

Run from this model's folder. Node.js 24.22.1 was used to build and reproduce the supplied bytes. The generator uses the Node standard library only.

```sh
node generator/build.cjs
node check.cjs
node check.cjs --json
```

Pass an output filename to `build.cjs` to write elsewhere. The check reads Float32 vertices and index buffers in the exported GLB and applies the node transforms. The Khronos report is `validator-report.json`. The actual Three.js r128 GLTFLoader and a PNG decoder also loaded this file and its atlas in the Node verification harness.

## Dimensions

| Quantity | Brief | Adopted target | Measured in the GLB |
| --- | --- | --- | --- |
| Span X | 5.37 m | 5.37 m | 5.370 m |
| Length Z | 8.32 m | 8.32 m | 8.320 m |
| Height Y | ≈1.40 m | 1.42 m | 1.420 m |
| Fuselage diameter | ≈0.82 m | 0.82 m | 0.820 m |
| Dorsal tube length Z | ≈3.5 m | 3.50 m | 3.500 m |
| Air-log rotor diameter | ≈0.17 m | 0.17 m | 0.170 m |

Axes are X lateral, +Y up and +Z forward, in metres. Left parts lie on −X. Visible vertex box (X, Y, Z) is [-2.685, -0.410, -4.160] to [2.685, 1.010, 4.160].

The standard silhouette source gives 5.37 m span, 8.32 m length and 1.42 m height. The latter supersedes the rounded 1.40 m in the brief. The Smithsonian object was used to compare the exterior and surface colours, not to switch the model to that specimen's separately catalogued 29 ft 4 3/16 in (about 8.94 m) overall measurement. The RAF Museum collection confirms the nose-mounted air-log propeller.

The rotor node is unrotated and contains four small visible blades. The dorsal tube has shallow, closed scenic recesses. The wings and tail are fixed. There is no gear, canopy, moving control surface or cross insignia.

## Render budget

| Metric | Limit | Measured |
| --- | --- | --- |
| Triangles, all mesh nodes | 3,500 | 2,244 |
| Mesh nodes | 8 | 6 |
| Materials | 3 | 1 |
| Embedded albedo | One 512 × 512 | One 512 × 512 PNG |
| GLB size | 400,000 bytes | 185,840 bytes |
| Khronos glTF Validator | 0 errors, 0 warnings | 0 errors, 0 warnings |

| Material | Roughness | Metallic | Alpha mode |
| --- | --- | --- | --- |
| Painted exterior atlas | 0.82 | 0.04 | OPAQUE |

## Named nodes

| Node | Type | Rig or marker |
| --- | --- | --- |
| `fi103-own` | Empty / group | — |
| `Fuselage` | Mesh | — |
| `StraightWings` | Mesh | — |
| `FixedTail` | Mesh | — |
| `DorsalTube` | Mesh | — |
| `DorsalSupports` | Mesh | — |
| `Propeller` | Mesh | prop · axis [0, 0, 1] · blades 4 |
| `ExhaustJet` | Empty / group | radius 0.2 m · direction [0, 0, -1] |

## Sources

| Title | URL | License or rights label | Accessed | Use |
| --- | --- | --- | --- | --- |
| V-1 flying bomb, exterior dimensions table | [Source](https://en.wikipedia.org/wiki/V-1_flying_bomb) | CC BY-SA 4.0 article text; media varies | 2026-11-11 | Standard silhouette dimensions of the chosen game variant. |
| Missile, Cruise, V-1 (Fi 103, FZG 76), NASM A19600341000 | [Source](https://www.si.edu/object/nasm_A19600341000) | CC0 catalog data; see media labels | 2026-11-11 | Exterior shape and period paint observations. |
| Fieseler Fi 103 (V1), RAF Museum collection | [Source](https://www.rafmuseum.org.uk/research/collections/fiesler-fi103-v1/) | Museum copyright; no reuse license displayed | 2026-11-11 | Exterior nose air-log propeller confirmation. |

## estimated

- The .82 m fuselage diameter and 3.50 m visible tube length are nominal game targets, not an exact survey of a specific preserved airframe.
- Radii between fuselage stations, tail proportions, support positions, decorative lip profiles and air-log blade shape are approximations.
- The supplied grey-green colour direction takes precedence over the museum object's coloured nose. Wear, soot and white stencil blocks are original paint. The stencil blocks contain no readable text.

## Previews and integrity

The four PNGs were rendered in Blender from fi103-own.glb in its intact rest pose. Each view uses an orthographic camera and a calibrated 1 m scale bar. MANIFEST.json gives the SHA-256 and byte size of each other file in this folder. A separate digest of the manifest is excluded to avoid self-reference.
