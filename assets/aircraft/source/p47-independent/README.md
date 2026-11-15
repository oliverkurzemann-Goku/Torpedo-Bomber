# Editable P-47 source

`P47D-Independent-v2.blend` is the packed editable model accepted by Oliver.
It includes original paint and detail script snapshots and provenance text blocks.
The rest pose is in metres and is not the rendered parking attitude.

Reproduce the original procedural v2 from the retained independent v1 input:

```
python -m pip install numpy scipy pillow
python repaint.py
blender -b --threads 8 --python finish-model.py
```

Requires Blender 4.5.x and DejaVu Sans at the script's documented font path.
Outputs are placed in `v2/`. The runtime GLB then receives only the asset-level
provenance fields, not any geometry or image change. `review-v1.glb` is the
previous independent preparation, never a War Thunder asset. `original-cc0.glb`
is the creator-hosted compressed original, matched to SOURCE.json.

`p47-independent-4096.glb` is the runtime model as shipped from Build 204 to 271,
with the three 4096 px textures. Since Build 276 the game loads
`assets/aircraft/p47-independent.glb` with those textures halved to 2048 px:

```
node scripts/reduce-p47-textures.cjs
```

Only the three images change (2x2 box filter = the GPU's own mip level 1, written
as lossless RGB PNG); `terrain-system/tests/p47-native.cjs` checks that every other
buffer view and all nodes, meshes, materials and clips are identical. Measured in the
real game (largest iPad, pixel ratio 2): no visible difference at any camera the game
has; graphics memory 256 MB -> 64 MB. Keep the 4096 file: it is the input for any
later compressed (ASTC/KTX2) high-quality tier.

None of this directory is copied into the offline app package.
