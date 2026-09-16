# Remagen terrain handoff

Companion to `CLAUDE.md`. Read both files before changing `remagen-mission.html`, `terrain-system/OSMManager.js`, terrain LOD, real-world placement, buildings or vegetation.

## Scope

Remagen is the terrain laboratory for the project. Terrain experiments should be proved here first. Do not copy them into `torpedo-carrier.html` or `thunderbolt-europe.html` until the Remagen version is visually accepted on the real iPad and its performance is known.

The flight model, weapons and mission logic are not part of a terrain pass unless a terrain change demonstrably breaks them.

## Current pipeline

`terrain-system/real/config.json` defines the 7x8, 4 km tile grid. `terrain-system/real/data/dem/` contains the height tiles. `terrain-system/real/data/osm/` contains converted real-world roads, rails, water, farmland, forest rings and simplified building records. `terrain-system/real/data/historical/` contains the bridge, flak, airfield/factory-style historical objects.

`remagen-mission.html` deliberately loads all DEM heights first, then terrain meshes, then OSM/historical content. This is different from the streaming demos because gameplay needs synchronous terrain-height queries at arbitrary positions.

`OSMManager.js` renders roads/rails/rivers/lakes/farmland as merged infrastructure meshes. Infrastructure must remain visible across tile boundaries. Expensive buildings and vegetation live in each tile's `farGroup`; only that subgroup is distance-culled.

The current Overture conversion stores buildings as `{x,z,w,d,rotY}` only. It does NOT currently preserve a reliable historical height, storey count, roof type or complete footprint polygon. Never describe procedurally inferred building height/roof as source-data truth.

## Terrain pass 1 — ChatGPT branch `chatgpt/remagen-terrain-pass-1`

Changed `terrain-system/OSMManager.js` only; flight and mission code are untouched.

### Vegetation

Previous behaviour created two InstancedMeshes (trunk + identical cone canopy) for every individual forest polygon. Real map data may contain many polygons in one tile, so draw calls scaled with source-polygon count and the result looked repetitive.

Pass 1 collects all forest placements for a tile first and then renders a maximum of four vegetation instance buckets per tile:

- one shared trunk bucket,
- conifers,
- deciduous trees,
- shrubs.

Source-polygon overlap is de-duplicated on a small world-space cell. Scale and rotation are deterministic from world coordinates, so reloads do not reshuffle the landscape. Tree trunks are embedded into the ground slightly to hide small rendered-height changes caused by terrain LOD.

This is deliberately still a lightweight procedural representation. The existing `treepack.glb` is a candidate for a later pass, but should only replace these shapes after its load cost and iPad memory impact are measured.

### Buildings

Previous behaviour sampled ground height only at the building centre and placed every building as a near-identical box with a thin box roof. On sloped terrain, a real footprint can span several metres of relief, so centre-only placement can visibly float at one corner or cut into the uphill side.

Pass 1 samples the centre plus all four ROTATED footprint corners. The wall/foundation extends below the lowest sample and the roof datum is placed above the highest sample. This intentionally favours "never visibly floating" over a mathematically thin wall box.

Buildings now use deterministic bounded height variation based on footprint size, two wall palettes, and two roof families: a low-cost hipped roof for ordinary/smaller buildings and a flat roof for large/industrial footprints. Exact height/roof type remains visual inference because the current tile JSON does not contain authoritative values.

Generated instance meshes have stable debug names such as `osmForestConifers`, `osmBuildingWallsWarm` and `osmBuildingRoofsPitched` so browser/Playwright checks can inspect them without relying on child order.

### Shared geometry disposal

`unloadTile()` now keeps every constructor-owned shared geometry alive rather than only the old box/trunk/cone trio. This matters for demos that unload/reload tiles; disposing a shared roof or canopy geometry on the first unload would silently break later tiles.

## Regression rules — do not skip

1. **Placement must be checked against loaded terrain, not a centre approximation.** Large buildings/objects need footprint or extent samples. Long roads/bridges need samples along their span.
2. **Never mix coordinate spaces.** `geometry.boundingBox`, object-local coordinates, tile-local coordinates and world coordinates are different. Convert explicitly.
3. **Tile-edge queries must be safe.** Jittered vegetation or rotated building corners can cross a tile boundary by a few metres. A test page may not have the neighbour loaded even if Remagen does.
4. **LOD can move the rendered surface.** A placement that matched LOD0 can float at coarse LOD. Infrastructure already has rebake logic in `remagen-mission.html`; trees/buildings currently rely on embedded bases plus near-distance culling. If visible floating remains, add an explicit instance-height rebake rather than random offsets.
5. **Do not cull infrastructure by whole tile.** Rivers/roads/rails must not terminate at the content visibility radius. Only `farGroup` is intended for distance culling.
6. **Polygon holes matter.** The real Overture forest incident proved that dropping holes can turn a huge polygon into false full-tile forest coverage. Never assume a clipped exterior ring represents valid occupancy everywhere inside it.
7. **Keep trees away from roads/buildings/water by data or an explicit exclusion system, not visual hope.** This remains a planned improvement; pass 1 only removes duplicate overlap between forest polygons.
8. **Triangle winding must be verified from above.** A mesh that is invisible from every expected camera angle may simply face downward. Do not "fix" it by changing colour/lighting first.
9. **Measure draw calls/mesh count before and after visual detail changes.** The iPad target makes thousands of small Mesh objects unacceptable even when triangle count is modest. Prefer a bounded number of `InstancedMesh`/merged meshes per tile.
10. **Do not claim iPad verification unless it was actually flown on the real device.** Headless/browser tests prove logic and geometry invariants, not final feel or thermal performance.

## Automated regression test

Run:

```bash
node terrain-system/tests/osmmanager-regression.js
```

It intentionally has no npm dependency. A small THREE stub executes the real `OSMManager.js` and checks:

- multiple forest polygons still create at most four vegetation instance buckets per tile,
- no generated instance matrix contains NaN/Infinity,
- building creation remains bounded to at most four instance buckets per tile,
- sloped footprints produce a non-zero sampled terrain range,
- building walls remain finite and tall enough after foundation compensation.

This is a structural regression test, not a rendering test. Before shipping a terrain build, also run the project's real-browser/Playwright path when available and then test the result on the real iPad.

## Next terrain priorities

1. Build a fast exclusion mask/spatial index so forest placement leaves believable clear corridors around roads, rails, water, airfields and building footprints without O(trees × features) startup cost.
2. Test replacing procedural tree canopies with instanced geometry extracted from the existing `treepack.glb`. Measure load time, memory, draw calls and frame time on iPad before adopting it.
3. Improve ground materials: farmland should not be one universal yellow/olive patch. Add deterministic field-tone variation and, later, texture/detail mapping that does not explode texture memory.
4. Preserve richer building attributes in `fetch_overture.py` when the source actually provides them (height/storeys/subtype). Use those before procedural guesses. Consider footprint geometry only after measuring the cost versus the current minimum-rotated-rectangle representation.
5. If buildings/trees visibly move relative to terrain during LOD transitions, implement an explicit per-tile instance-height rebake keyed to actual LOD changes. Do not continuously rebake every frame.
6. Only after the above is stable: near-camera detail LOD for buildings (chimneys, gables, facade hints) while keeping distant buildings in cheap instanced buckets.

## Handoff procedure for future ChatGPT / Claude sessions

Before editing terrain:

- read `CLAUDE.md`, especially the Remagen history and lessons,
- read this `TERRAIN.md`,
- inspect the current branch/commit instead of assuming an earlier build number,
- reproduce or measure the reported defect before changing code,
- work on a branch,
- run `node terrain-system/tests/osmmanager-regression.js`,
- document what changed, what was measured, what was not tested, and the exact next risk.

Do not merge a visual terrain experiment into `main` merely because it is syntactically valid.
