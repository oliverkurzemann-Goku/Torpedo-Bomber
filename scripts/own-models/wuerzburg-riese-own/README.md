# Würzburg-Riese FuMG 65

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
| Aperture diameter (local X/Y) | 7.5 m | 7.50 m | 7.500 × 7.500 m |
| Overall deployed height Y | ≈9 m | 9.00 m | 9.003 m |
| Foundation X × Z | ≈6 × 6 m | 6 × 6 m | 6.000 × 6.000 m |
| Overall length Z (rest) | — | 6.00 m | 6.000 m |
| Reflector rest elevation | 35° | 35° | 35.000° |

Axes are X lateral, +Y up and +Z forward, in metres. Left parts lie on −X. Visible vertex box (X, Y, Z) is [-3.750, 0.000, -3.000] to [3.750, 9.003, 3.000].

The selected Douvres museum reference publishes a 7.50 m nominal aperture. The Gatow exhibit description instead lists 7.40 m and 10.20 m overall height for its installation; the latter has a different base and pose. The model uses the Douvres aperture and the brief's 9 m deployed height and 6 × 6 m ground pad. The aperture is circular in its local X–Y plane and is foreshortened to an ellipse from the front in its 35° resting pose.

Dish is the yaw parent on the turntable. Elevation is its pitch child at the trunnion axis, with local +Z directed up and forward at rest. The feed, four front braces, rear bracing and reflector follow Elevation. The reflector is an opaque, thin two-surface shell with a baked grid and no cutout texture.

## Render budget

| Metric | Limit | Measured |
| --- | --- | --- |
| Triangles, all mesh nodes | 5,000 | 3,292 |
| Mesh nodes | 14 | 7 |
| Materials | 4 | 1 |
| Embedded albedo | One 1024 × 1024 | One 1024 × 1024 PNG |
| GLB size | 900,000 bytes | 311,316 bytes |
| Khronos glTF Validator | 0 errors, 0 warnings | 0 errors, 0 warnings |

Wreck has 240 triangles, or 7.9% of the intact model. The GLB stores it with zero scale and extras.visible set to false. To swap states in Three.js r128, hide Intact, restore Wreck scale to 1 on all three axes and set Wreck visibility to true.

| Material | Roughness | Metallic | Alpha mode |
| --- | --- | --- | --- |
| Painted exterior atlas | 0.82 | 0.04 | OPAQUE |

## Named nodes

| Node | Type | Rig or marker |
| --- | --- | --- |
| `wuerzburg-riese-own` | Empty / group | — |
| `Intact` | Empty / group | — |
| `FoundationAndRace` | Mesh | — |
| `ControlHutAndLadder` | Mesh | — |
| `Dish` | Empty / group | yaw · axis [0, 1, 0] |
| `SlewYoke` | Mesh | — |
| `Elevation` | Empty / group | pitch · axis [1, 0, 0] |
| `ReflectorShell` | Mesh | — |
| `ReflectorBracing` | Mesh | — |
| `FeedDipole` | Mesh | — |
| `Wreck` | Mesh | — |

## Sources

| Title | URL | License or rights label | Accessed | Use |
| --- | --- | --- | --- | --- |
| Station Radar 44, Musée Franco-Allemand, Douvres-la-Délivrande | [Source](https://www.caenlamer-tourisme.fr/affaires-patrimoine-culturel/station-radar-44-musee-franco-allemand/) | Museum tourism page; no reuse license displayed | 2026-11-11 | Exterior and nominal 7.50 m aperture. |
| Telefunken FuMG 65 Würzburg Riese, Gatow exhibit | [Source](https://www.flugzeug-lexikon.de/Luftwaffenmuseum/Waffensysteme/Telefunken_FuMG_65/telefunken_fumg_65.html) | No open reuse license displayed | 2026-11-11 | Comparison against an installation listed with different dimensions. |

## estimated

- The parabola depth, external dipole and frame, yoke stand-off, cabin position and service ladder are inferred visual proportions.
- The foundation and overall deployed height are game targets. The proposed default elevation is an animation setting, not a measurement of the exhibit.
- Dunkelgelb and green are colour approximations from the brief. The R47 number, rust and mud pattern are fictional.

## Previews and integrity

The four PNGs were rendered in Blender from wuerzburg-riese-own.glb in its intact rest pose. Each view uses an orthographic camera and a calibrated 1 m scale bar. MANIFEST.json gives the SHA-256 and byte size of each other file in this folder. A separate digest of the manifest is excluded to avoid self-reference.
