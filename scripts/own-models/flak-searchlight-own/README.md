# 150 cm Flakscheinwerfer

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
| Reflector diameter (local X/Y) | 1.5 m | 1.50 m | 1.500 × 1.500 m |
| Length Z with trailer | ≈3.6 m | 3.60 m | 3.600 m |
| Trailer width X including hubs | ≈2.0 m | ≈2.0 m | 2.086 m |
| Deployed height Y | ≈2.8 m | ≈2.8 m | 2.830 m |
| Overall X with generator | Accessory outside trailer width | 3.443 m | 3.443 m |
| Projector rest elevation | 60° | 60° | 60.000° |

Axes are X lateral, +Y up and +Z forward, in metres. Left parts lie on −X. Visible vertex box (X, Y, Z) is [-2.400, 0.000, -1.800] to [1.043, 2.830, 1.800].

The museum references agree on a 1.50 m reflector. The Gatow comparison shows the carriage and removable transport assemblies. The brief supplies the envelope targets for the staged trailer and generator; it is not a survey of the museum carriage.

Mount yaws on the circular race. Projector pitches at the trunnions and its local +Z is tilted upward 60° at rest. BeamOrigin is an empty child at the glass centre. The bluish reflector face is opaque baked paint. The generator and flat cable sit beside the trailer, with the object origin on the trailer centreline. The separate generator increases the overall group width.

## Render budget

| Metric | Limit | Measured |
| --- | --- | --- |
| Triangles, all mesh nodes | 3,000 | 2,708 |
| Mesh nodes | 10 | 6 |
| Materials | 3 | 1 |
| Embedded albedo | One 1024 × 1024 | One 1024 × 1024 PNG |
| GLB size | 600,000 bytes | 268,460 bytes |
| Khronos glTF Validator | 0 errors, 0 warnings | 0 errors, 0 warnings |

Wreck has 276 triangles, or 11.3% of the intact model. The GLB stores it with zero scale and extras.visible set to false. To swap states in Three.js r128, hide Intact, restore Wreck scale to 1 on all three axes and set Wreck visibility to true.

| Material | Roughness | Metallic | Alpha mode |
| --- | --- | --- | --- |
| Painted exterior atlas | 0.82 | 0.04 | OPAQUE |

## Named nodes

| Node | Type | Rig or marker |
| --- | --- | --- |
| `flak-searchlight-own` | Empty / group | — |
| `Intact` | Empty / group | — |
| `TwoAxleTrailer` | Mesh | — |
| `Mount` | Empty / group | yaw · axis [0, 1, 0] |
| `ForkYoke` | Mesh | — |
| `Projector` | Empty / group | pitch · axis [1, 0, 0] |
| `ProjectorHousing` | Mesh | — |
| `PaintedReflector` | Mesh | — |
| `BeamOrigin` | Empty / group | marker · local translation [0, 0, 0.475] |
| `GeneratorAndCable` | Mesh | — |
| `Wreck` | Mesh | — |

## Sources

| Title | URL | License or rights label | Accessed | Use |
| --- | --- | --- | --- | --- |
| WWII American and German Anti-Aircraft Searchlights, Artillery Museum | [Source](https://www.artillerymuseum.com/wwii-flakscheinwerfer) | Museum copyright; no open reuse license displayed | 2026-11-11 | 150 cm reflector and separate generator. |
| Airforce Museum Berlin-Gatow 301, RosarioVanTulpe | [Source](https://commons.wikimedia.org/wiki/File:Airforce_Museum_Berlin-Gatow_301.JPG) | Public-domain dedication by photographer | 2026-11-11 | Sonderanhänger 104 outline, removable axle assemblies and yoke. |

## estimated

- The 3.60 m trailer length, 2 m nominal width, 2.8 m deployed height, hub projections, yoke geometry and optical-body depth are approximations from the brief and exterior views.
- The 1.2 × 0.8 × 1.0 m generator body and cable placement, 60° default pose, paint, lens rings and L32 number are authored for the game.

## Previews and integrity

The four PNGs were rendered in Blender from flak-searchlight-own.glb in its intact rest pose. Each view uses an orthographic camera and a calibrated 1 m scale bar. MANIFEST.json gives the SHA-256 and byte size of each other file in this folder. A separate digest of the manifest is excluded to avoid self-reference.
