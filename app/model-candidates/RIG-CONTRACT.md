# Rig contract v1 for replacement aircraft

Every replacement aircraft, whether built in this repository, commissioned or bought, is
delivered to this contract. A model that passes needs no propeller, gear or flap search in the
game and is never cut at runtime (`findProp`, `cutBlades`, `findGearClusters`, `coverGearCut`
and the generic articulation probes all stay off). Machine-readable definition:
`aircraft-contract.js` (shared by the game and the checker).

Check a delivery: `npm run app:rig -- path/to/model.glb` (contract plus the Khronos glTF
validator). Check its shape: `node scripts/silhouette-gate.mjs model.glb references/<id>/reference.json --out dir`.

## Frame and units

- glTF 2.0 binary (`.glb`), metres, **X span, +Y up, +Z nose**, origin anywhere near the centre.
- Rest pose as stored = **gear down, flaps up, controls neutral, canopy closed** (as drawn on
  a three-view).
- `…Left` names the **−X** side and `…Right` the **+X** side, as in the existing native P-47
  and SBD rigs. With +Z nose and +Y up, −X is the aircraft's starboard side: the names follow a
  front view, not the pilot.
- Span and length of the vertex bounds within **±1 %** of `dimensions` (below); centred on X.

## Root node

Exactly one node carries `extras.rigContract = 1` and is the parent of everything else:

| key | content |
|---|---|
| `class` | `tailwheel-fighter` (only class in v1) |
| `nativeAircraft` | lowercase id, e.g. `bf109g6-own-1` |
| `kind` | game type, e.g. `bf109` |
| `title`, `author`, `license`, `source`, `provenance` | non-empty strings |
| `references` | list of `{title, url or file, license, role, sha256}`: every drawing, manual or photo used |
| `dimensions` | `{span, length[, height]}` in metres, from the cited manual/drawing |

No third-party 3D model may be used as a template or reference.

## Named parts

| node | under | `extras.rig` |
|---|---|---|
| `Propeller` | root | `{drive:'prop', axis:[0,0,1], blades:n}`; node unrotated, game spins `rotation.z` |
| `gear` | root | group |
| `GearLeft`, `GearRight`, `TailGear` | `gear` | `{drive:'gear', axis, range:[angle at up, angle at down]}` |
| `flightFlaps` | root | group |
| `FlapLeft` / `FlapRight` | `flightFlaps` | `{drive:'flapLeft'/'flapRight', axis, range:[up, down]}` |
| `AileronLeft`, `AileronRight` | root | `{drive:'roll', axis, gain}`; left +gain, right −gain about +X (P-47 convention) |
| `ElevatorLeft`, `ElevatorRight` | root | `{drive:'pitch', axis, gain}` |
| `Rudder` | root | `{drive:'yaw', axis, gain}` (the game feeds it the roll input) |
| optional `Canopy`, `GearDoorLeft/Right`, `RadiatorFlapLeft/Right` | | `canopy` / `gear` / `radiator` range drives |
| `Muzzle…` (≥ 1) | anywhere | empty node at each barrel exit |

Each moving node's origin is its hinge point. The applied rotation is
`rest quaternion × axis-angle(axis, angle)`, with `axis` a unit vector in the node's local
frame. Range drives map 0..1 linearly onto `range`, gain drives map −1..1 onto `±gain`
(|gain| ≤ 0.8 rad). Every node name is unique.

Exactly one mesh with `extras.groundWheel = true` hangs under each of `GearLeft`, `GearRight`
and `TailGear`: the game's ground contact uses those tyre vertices directly.

## Materials and budget (class `tailwheel-fighter`)

- Metallic-roughness PBR only. Forbidden: `KHR_materials_pbrSpecularGlossiness`,
  `KHR_mesh_quantization`, Draco, meshopt, Basis. Float32 positions keep every CPU reader exact.
- Embedded images only, at most 2048 px per side; normal-mapped meshes carry TANGENT.
- ≤ 75,000 triangles, ≤ 48 mesh nodes, ≤ 16 materials, ≤ 8 images, ≤ 12 MiB.

## Acceptance

All of these, independently of the builder and of the reviewer's impression:

1. `npm run app:rig` passes: contract plus Khronos validator with **0 errors and 0 warnings**.
2. Silhouette gate against public-domain reference drawings, per view (side, top, front):
   IoU ≥ 0.94, 95th-percentile boundary deviation ≤ 1.0 % of the view's largest extent, maximum
   ≤ 4.0 % (thin wires and pitot tubes are allowed to differ). Thresholds live in
   `scripts/silhouette-gate.mjs` and are not tuned per model.
3. Span and length ±1 % against the cited manual (checked by item 1).
4. Licence document and dated evidence for every reference (`references[]`, sha256 of the file).
5. The existing browser tests pass with the model and without any heuristic rig path.
6. An iPad test by the owner. Nothing here replaces it.

## References directory

`app/model-candidates/references/<id>/reference.json` describes each drawing view:

```json
{
  "title": "Bf 109 G-6 three-view",
  "views": {
    "side": {"file": "side.png", "mode": "lines", "close": 1, "crop": [x0, y0, x1, y1],
             "calibration": {"u": [[px, metres], [px, metres]], "v": [[py, metres], [py, metres]]}},
    "top":   {"…": "…"},
    "front": {"…": "…"}
  },
  "sources": [{"title": "…", "url": "…", "license": "…", "sha256": "…", "retrieved": "YYYY-MM-DD"}]
}
```

`u` is the drawing's horizontal model axis (side: z, top/front: x), `v` its vertical one
(side/front: y, top: z). Two known points per axis calibrate scale and offset; the gate refuses
calibrations whose two scales differ by more than 2 % (a distorted scan). `mode: lines` treats
the outline as ink and fills everything the outside cannot reach; `filled` reads dark pixels as
airframe (silhouette charts, hand-traced masks). `node scripts/silhouette-gate.mjs --trace
reference.json` prints the measured outlines in metres for building the station table.
