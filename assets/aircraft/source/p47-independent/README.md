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

None of this directory is copied into the offline app package.
