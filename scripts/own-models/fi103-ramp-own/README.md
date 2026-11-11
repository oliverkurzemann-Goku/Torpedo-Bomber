# Fi 103 Ramp — scenery prop

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
| Ramp length Z | 48 m | 48 m | 48.000 m |
| Ramp structural width X | 4 m | 4 m | 4.000 m |
| Forward high point Y | ≈6.5 m | 6.50 m | 6.500 m |
| Rail and LaunchPoint elevation | ≈6° | 6° | 6.000° |
| Hut Z × X × Y | 8 × 4 × 3 m | 8 × 4 × 3 m | 8.000 × 4.000 × 3.000 m |
| Overall X with hut and net | Accessory outside ramp width | 8.28 m | 8.280 m |

Axes are X lateral, +Y up and +Z forward, in metres. Left parts lie on −X. Visible vertex box (X, Y, Z) is [-2.000, 0.000, -24.000] to [6.280, 6.500, 24.000].

The Duxford semi-reproduction provides an exterior shape reference. It does not establish surveyed dimensions for a 1945 Rhine site. The rail envelope is 48 m along Z and its authored pitch is 6°. The truss bays are 6 m on centre. The structural footprint is 4 m wide; the adjoining hut and net bring the visible group to 8.28 m wide. The vehicle origin remains on the ramp's structural centreline at ground level.

LaunchPoint is a scene marker above the rear end with local +Z along the visual slope. The closed lower spine, trusses and cabin are exterior scenery with no operational mechanisms. The cutout net uses the same atlas with an alpha cutoff of 0.5.

## Render budget

| Metric | Limit | Measured |
| --- | --- | --- |
| Triangles, all mesh nodes | 4,500 | 2,136 |
| Mesh nodes | 12 | 7 |
| Materials | 4 | 2 |
| Embedded albedo | One 1024 × 1024 | One 1024 × 1024 PNG |
| GLB size | 800,000 bytes | 212,384 bytes |
| Khronos glTF Validator | 0 errors, 0 warnings | 0 errors, 0 warnings |

Wreck has 396 triangles, or 22.8% of the intact model. The GLB stores it with zero scale and extras.visible set to false. To swap states in Three.js r128, hide Intact, restore Wreck scale to 1 on all three axes and set Wreck visibility to true.

| Material | Roughness | Metallic | Alpha mode |
| --- | --- | --- | --- |
| Painted exterior atlas | 0.82 | 0.04 | OPAQUE |
| Cutout camouflage net | 0.88 | 0.00 | MASK |

## Named nodes

| Node | Type | Rig or marker |
| --- | --- | --- |
| `fi103-ramp-own` | Empty / group | — |
| `Intact` | Empty / group | — |
| `ConcreteFootings` | Mesh | — |
| `SteelBays` | Mesh | — |
| `RailShell` | Mesh | — |
| `ControlHut` | Mesh | — |
| `NetPoles` | Mesh | — |
| `CamouflageNet` | Mesh | — |
| `LaunchPoint` | Empty / group | marker · local translation [0, 1.525775889063386, -23.4] |
| `Wreck` | Mesh | — |

## Sources

| Title | URL | License or rights label | Accessed | Use |
| --- | --- | --- | --- | --- |
| V1 launch ramp IWM Duxford, exterior of the semi-reproduction | [Source](https://commons.wikimedia.org/wiki/File:V1_launch_ramp_IWM_duxford.JPG) | CC BY-SA 4.0 photograph | 2026-11-11 | Silhouette and repeated exterior steel bays. |

## estimated

- The ramp envelope, exact 6 m bay placement, start height and footings are game geometry chosen from the brief and the reference silhouette.
- The 8 × 4 × 3 m control hut, roof net, visual supports, material colours and burn pattern are authored estimates. The hut is an adjoining accessory, with no claim about the historical emplacement layout.

## Previews and integrity

The four PNGs were rendered in Blender from fi103-ramp-own.glb in its intact rest pose. Each view uses an orthographic camera and a calibrated 1 m scale bar. MANIFEST.json gives the SHA-256 and byte size of each other file in this folder. A separate digest of the manifest is excluded to avoid self-reference.
