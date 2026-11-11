# Arado Ar 234 B-2 Blitz

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
| Span X | 14.41 m | 14.40 m | 14.400 m |
| Length Z | 12.64 m | 12.64 m | 12.640 m |
| Height Y, visible envelope | 4.30 m | 4.30 m | 4.300 m |
| Nacelle length Z | ≈3.9 m | 3.90 m | 3.900 m |
| Nacelle diameter X | ≈0.8 m | 0.80 m | 0.800 m |
| Bomb length Z × diameter X | ≈1.6 × 0.37 m | 1.60 × 0.37 m | 1.600 × 0.370 m |

Axes are X lateral, +Y up and +Z forward, in metres. Left parts lie on −X. Visible vertex box (X, Y, Z) is [-7.200, -1.285, -6.320] to [7.200, 3.015, 6.320].

Smithsonian lists a 14.40 m span, a rounded 12.6 m length and a 4.30 m ground-to-fin height. The declassified dimensions table gives the more precise 12.64 m length and agrees on span and height. The source span is 0.01 m below the brief. The orthographic reference was used to compare wing, nacelle, tail and nose proportions. The preserved aircraft informed the canopy framing, reddish intake lip and RLM 81/82 over 76 scheme.

The B-2 had retractable tricycle landing gear. In this airborne game pose the underbody is closed and has three fixed fairings as requested. The visual height is fitted to the brief's 4.30 m overall envelope, measured with the external store present. That matches the published **number** for the ground configuration, which is a different pose.

The closed glazing has its own tinted material. Rear-facing muzzle markers are visual scene anchors. The gear group, gear legs, propeller and movable canopy are omitted. The four aileron/elevator pivots, rudder and flap pivots are authored in their neutral poses. The Balkenkreuz between the two code groups reads as the separator in the fictional F1+XX identity.

## Render budget

| Metric | Limit | Measured |
| --- | --- | --- |
| Triangles, all mesh nodes | 28,000 | 11,816 |
| Mesh nodes | 36 | 23 |
| Materials | 8 | 2 |
| Embedded albedo | One 2048 × 2048 | One 2048 × 2048 PNG |
| GLB size | 6,000,000 bytes | 1,156,496 bytes |
| Khronos glTF Validator | 0 errors, 0 warnings | 0 errors, 0 warnings |

| Material | Roughness | Metallic | Alpha mode |
| --- | --- | --- | --- |
| Painted exterior atlas | 0.82 | 0.04 | OPAQUE |
| Closed cockpit glazing | 0.75 | 0.00 | BLEND |

## Named nodes

| Node | Type | Rig or marker |
| --- | --- | --- |
| `ar234b2-own` | Empty / group | — |
| `FuselageShell` | Mesh | — |
| `NoseGlazing` | Mesh | — |
| `GlazingFrames` | Mesh | — |
| `CockpitInterior` | Mesh | — |
| `RearViewPeriscope` | Mesh | — |
| `flightFlaps` | Empty / group | — |
| `WingLeft` | Mesh | — |
| `FlapLeft` | Mesh | flapLeft · axis [1, 0, 0] · range [0, -0.66] |
| `AileronLeft` | Mesh | roll · axis [1, 0, 0] · gain 0.48 |
| `WingRight` | Mesh | — |
| `FlapRight` | Mesh | flapRight · axis [1, 0, 0] · range [0, -0.66] |
| `AileronRight` | Mesh | roll · axis [1, 0, 0] · gain -0.48 |
| `TailplaneLeft` | Mesh | — |
| `ElevatorLeft` | Mesh | pitch · axis [1, 0, 0] · gain 0.44 |
| `TailplaneRight` | Mesh | — |
| `ElevatorRight` | Mesh | pitch · axis [1, 0, 0] · gain 0.44 |
| `VerticalFin` | Mesh | — |
| `Rudder` | Mesh | yaw · axis [0, 1, 0] · gain 0.49 |
| `NacelleLeft` | Mesh | — |
| `ExhaustLeft` | Empty / group | radius 0.33 m · direction [0, 0, -1] |
| `NacelleRight` | Mesh | — |
| `ExhaustRight` | Empty / group | radius 0.33 m · direction [0, 0, -1] |
| `RetractedSkidFairings` | Mesh | — |
| `Bomb` | Mesh | — |
| `ExternalStoreRack` | Mesh | — |
| `MuzzleRear1` | Empty / group | marker · local translation [-0.27, -0.58, -3.43] |
| `MuzzleRear2` | Empty / group | marker · local translation [0.27, -0.58, -3.43] |
| `RearGunFairings` | Mesh | — |

## Sources

| Title | URL | License or rights label | Accessed | Use |
| --- | --- | --- | --- | --- |
| Arado Ar 234 B-2 Blitz (Lightning), NASM A19600312000 | [Source](https://www.si.edu/object/nasm_A19600312000) | CC0 catalog record; media-specific terms apply | 2026-11-11 | Published span and ground height. |
| Arado Ar 234 B-2 Blitz museum gallery | [Source](https://airandspace.si.edu/collection-objects/arado-ar-234-b-2-blitz-lightning/nasm_A19600312000) | Mixed museum media terms; comparison only | 2026-11-11 | Restored exterior, cockpit, camouflage and rear armament exhibit. |
| Arado Ar 234 B 3-view, Joy Cohn | [Source](https://commons.wikimedia.org/wiki/File:Arado_Ar_234_B_3-view.svg) | CC BY-SA 4.0 or alternatives on file page | 2026-11-11 | Orthographic silhouette and relative station comparison. |
| AR-234 B-2 Jet Propelled Bomber, declassified report | [Source](https://www.cia.gov/readingroom/docs/CIA-RDP78-02646R000400190001-3.pdf) | Public release; no explicit reuse license on the scan | 2026-11-11 | More precise published length, corroborating span and height. |

## estimated

- Fuselage stations, section heights and cockpit frame shapes inferred from relative silhouettes and museum views. The orthographic plate is a comparison reference, not a surveyed loft.
- Engine locations, open-looking cowl recesses, fixed skid fairings and lower-store rack are visual approximations. The pylon is included in the nacelle mesh and inflates its Y box.
- Rear fairing and empty muzzle positions approximate the twin rear-facing installation. No claim is made that the preserved airframe carried this fit at Remagen.
- Fin vertical extent and external-store offset preserve the requested game envelope. The store exterior, exact control hinge stations and travel ranges are art and animation estimates.
- RLM colour hexes are digital approximations. The camouflage boundaries, F1+XX code and wear are authored for this asset and depict no identified aircraft.

## Previews and integrity

The four PNGs were rendered in Blender from ar234b2-own.glb in its intact rest pose. Each view uses an orthographic camera and a calibrated 1 m scale bar. MANIFEST.json gives the SHA-256 and byte size of each other file in this folder. A separate digest of the manifest is excluded to avoid self-reference.
