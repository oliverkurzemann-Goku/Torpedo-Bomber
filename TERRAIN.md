# Remagen terrain handoff

Companion to `CLAUDE.md`. Read both files before changing `remagen-mission.html`, `terrain-system/OSMManager.js`, terrain LOD, real-world placement, buildings or vegetation.

## Scope

Remagen is the terrain laboratory for the project. Terrain experiments should be proved here first. Do not copy them into `torpedo-carrier.html` or `thunderbolt-europe.html` until the Remagen version is visually accepted on the real iPad and its performance is known.

The flight model, weapons and mission logic are not part of a terrain pass unless a terrain change demonstrably breaks them.

## Test build versioning

Every Remagen revision handed to Oliver for testing must increment the visible build number in both places in `remagen-mission.html`: the always-visible `#testVersionBannerText` and the in-flight `#buildTag`. Add a short pass label when useful. Never tell Oliver a build is ready until the branch/deployment being tested contains that exact visible version. Current revision: `REMAGEN BUILD 12 · RENDER RECOVERY`.

The local terrain scripts carry the same version as a `?v=remagen-12` query. `OSMManager.BUILD` is checked during startup and the banner gains `MODULE 12` only after that check succeeds. This prevents an updated HTML document from silently running an older Safari-cached terrain module.

## Build 12 — recovery from Build 11 rendering regression

The user's Build 11 iPad screenshots show no player aircraft, roofs, trees or airfield; textured wall boxes and terrain still draw. This is a rendering failure, not established evidence that those objects were absent from the scene. CPU placement/geometry checks were insufficient.

Recovery deliberately restores the entire Build 10 runtime (`655cf1e50f657ab9399d4b8d57c89abac44695fc`), changing only version/cache labels. Build 11's airfield module, instance colours, L-shaped blocks, hipped roofs and chapel additions are withdrawn together. They remain in commit `719857d56cda8ba0d0b57c9062a19efbb3c256a7` and PR #5; this is recoverable history, not lost work.

Do not describe the exact cause as proven. The new instance-colour/material combinations are a suspect, but there is no captured iPad GPU error. The current cloud Chrome test cannot even create a WebGL context (`THREE.WebGLRenderer: Error creating WebGL context.`), so it provides no visual acceptance evidence. Build 12 is verified by runtime comparison to Build 10, syntax and existing real-data geometry tests, and deployment completion. Actual iPad recovery remains for the user's check.

Before reintroducing the detail pass, obtain a working WebGL test and isolate one change at a time: first instance colours with shared materials, then roofing variants, then the field. Verify actual visible pixels for the player at spawn and in chase view, pitched roofs, forest and runway; inspect browser GPU errors. Never call a matrix/overlap check a render test or an FPS measurement.

## Terrain pass 4 — Remagen Build 10

### Water/object correctness

Build 9 tested nine points of a building against only the water stored in the same source tile. That can miss a thin stream crossing between probes, water from the neighbouring tile and the true footprint of a rotated Three.js instance. The rotation formula used by the test also had the opposite sign from `Matrix4.makeRotationY`.

Build 10 preloads all 56 OSM JSON sources with `OSMManager.prepareRegion()` and builds one region-wide spatial index from the projected triangles that are actually used to render rivers and lake polygons. Buildings are tested as complete rotated roof polygons with a two-metre bank margin. Tree crowns are tested as discs with a five-metre margin. Forest jitter is rechecked against its source polygon after displacement.

Long water triangles previously connected a few terrain samples and could pass through a hill or disappear below coarse LOD terrain. `redrapeWater()` now clips each source water triangle at the owning terrain tile's current grid lines and triangle diagonals, then samples the actual rendered triangle plane. Water is rebuilt only after a settled LOD change; it is not allocated every animation frame. Water meshes preserve their explicit layer offsets rather than trying to infer them from raw DEM heights.

### Buildings and ground detail

Walls use one shared 512px canvas atlas containing weathered plaster, windows, shutters, doors, a cornice and masonry footing. All four façades are mapped; the entrance side uses the door half of the atlas. Roofs use a shared 256px tile pattern, and the gable prism now duplicates vertices at hard edges so roof planes and gables shade as separate surfaces. These remain instanced meshes: texture detail adds no per-building draw calls.

The terrain canvas has stronger fine grain and a shorter repeat scale. Its formerly non-integer cosine frequency was corrected so opposite texture edges really are seamless.

### Regression evidence

`terrain-system/tests/remagen-real-geometry.js` loads the shipped 56 DEM and OSM tiles with actual Three.js r128. It independently intersects the rendered water triangles against every rendered roof footprint and tree-crown disc, verifies water/terrain drape at high and coarse LOD, validates buffers and compares the height query with Three.js raycasting during a morph. Build 10 result: 21,286 buildings, 162,469 crowns and 182,323 water triangles checked; maximum measured water drape error 0.00063m. This is a geometry test, not an iPad WebGL/FPS test; visual acceptance and performance still require Oliver's real device.

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

Buildings now use deterministic bounded height variation based on footprint size, two wall palettes, and two roof families. Pass 1 attempted a four-sided cone as a cheap hipped roof; real iPad screenshots showed that stretching it over rectangular footprints produced implausible pyramid/diagonal silhouettes. Pass 2 replaces it with a real gable-prism geometry. Flat roofs remain for large/industrial footprints. Exact height/roof type remains visual inference because the current tile JSON does not contain authoritative values.

Generated instance meshes have stable debug names such as `osmForestConifers`, `osmBuildingWallsWarm` and `osmBuildingRoofsPitched` so browser/Playwright checks can inspect them without relying on child order.

### Shared geometry disposal

`unloadTile()` now keeps every constructor-owned shared geometry alive rather than only the old box/trunk/cone trio. This matters for demos that unload/reload tiles; disposing a shared roof or canopy geometry on the first unload would silently break later tiles.

## Terrain pass 2 — BUILD 8

Triggered by two real-iPad screenshots of BUILD 7. The screenshots, not a synthetic scene, established three failures: stretched pyramid roofs, trees inside roads, and opaque bright-yellow farmland over a single bright-green terrain sheet.

- **Roofs:** `makeGableRoofGeometry()` creates a six-vertex prism with two sloped planes and triangular gable ends. It is instanced with the building rotation unchanged; there is no `+45°` cone workaround.
- **Tree exclusions:** `_buildForestExclusion()` creates a temporary 64m-cell spatial index per tile from roads, rails, rivers, lakes, airfields and rotated building footprints. `_treeExcluded()` rejects candidates with a canopy/root margin before matrices are created. The index is temporary and does not add render objects or draw calls.
- **Ground:** `TerrainManager` now uses one shared 256px seamless, mipmapped canvas texture with muted olive/earth variation. It replaces the uniform bright-green material without reintroducing the iOS-incompatible vertex-colour path.
- **Farmland:** the real polygons remain as geographic hints but are now a 20%-opacity muted tint over the textured ground instead of opaque yellow sheets. No additional farmland draw-call bucket was added.

The regression harness scans all 56 shipped OSM tiles. At BUILD 8 it generated 231,120 raw forest candidates and retained 169,251 after exclusions, removing 61,869 placements that conflicted with mapped features. It also verifies the six-vertex roof geometry and the bounded transparent farmland material.

## Terrain pass 3 — BUILD 9

Triggered by BUILD 8 iPad screenshots. Performance was reported as very fluid, but the screenshots showed buildings/trees inside rendered water and apparently terminating river shapes.

The primary cause was not only bad placement: `_buildFlatPolygons()` used a centre fan, which is valid only for convex polygons. The real Rhine/lake rings are strongly concave, so fan triangles crossed bends and painted large blue wedges over dry land. BUILD 9 replaces the fan with deterministic ear-clipping triangulation. The regression harness proves all 7,985 shipped lake/farmland/airfield rings produce exactly `n-2` triangles and includes an explicit concave-L test whose triangle centroids remain inside the source polygon.

The feature index now tags its sources. Buildings sample centre, corners and edge midpoints against river/lake features before instancing; BUILD 9 removes 228 of 21,449 source buildings that overlap mapped water and renders 21,221. Trees retain the BUILD 8 road/water/building filtering. Water materials are rougher and less reflective to avoid the electric-blue/white glare seen in the screenshots.

Building detail stays bounded by tile: two roof palettes, one chimney bucket, and one facade-detail bucket containing a door plus two front windows for ordinary houses. The real-Three.js test builds all 56 tiles with at most seven building instance buckets per tile; no individual detail Mesh objects are created.

## Regression rules — do not skip

1. **Placement must be checked against loaded terrain, not a centre approximation.** Large buildings/objects need footprint or extent samples. Long roads/bridges need samples along their span.
2. **Never mix coordinate spaces.** `geometry.boundingBox`, object-local coordinates, tile-local coordinates and world coordinates are different. Convert explicitly.
3. **Tile-edge queries must be safe.** Jittered vegetation or rotated building corners can cross a tile boundary by a few metres. A test page may not have the neighbour loaded even if Remagen does.
4. **LOD can move the rendered surface.** A placement that matched LOD0 can float at coarse LOD. Infrastructure already has rebake logic in `remagen-mission.html`; trees/buildings currently rely on embedded bases plus near-distance culling. If visible floating remains, add an explicit instance-height rebake rather than random offsets.
5. **Do not cull infrastructure by whole tile.** Rivers/roads/rails must not terminate at the content visibility radius. Only `farGroup` is intended for distance culling.
6. **Polygon holes matter.** The real Overture forest incident proved that dropping holes can turn a huge polygon into false full-tile forest coverage. Never assume a clipped exterior ring represents valid occupancy everywhere inside it.
7. **Keep trees away from roads/buildings/water by the explicit exclusion index, not visual hope.** When a new linear or occupied feature is added, add it to `_buildForestExclusion()` and extend the data-backed regression test.
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
- all 56 real OSM tiles emit zero trees inside indexed road/water/building exclusions,
- buildings touching mapped river/lake features are rejected before instancing,
- every shipped concave flat polygon triangulates to `n-2` triangles without a centre fan,
- the roof is a six-vertex gable prism rather than a stretched pyramid,
- farmland remains a low-opacity tint rather than an opaque colour sheet,
- no generated instance matrix contains NaN/Infinity,
- building creation remains bounded to at most seven instance buckets per tile,
- sloped footprints produce a non-zero sampled terrain range,
- building walls remain finite and tall enough after foundation compensation.

This is a structural regression test, not a rendering test. Before shipping a terrain build, also run the project's real-browser/Playwright path when available and then test the result on the real iPad.

## Next terrain priorities

1. Validate BUILD 9's corrected water outlines, river continuity, water exclusions and building-detail cost on the real iPad; distinguish genuine source-data gaps from the removed triangulation wedges.
2. Test replacing procedural tree canopies with instanced geometry extracted from the existing `treepack.glb`. Measure load time, memory, draw calls and frame time on iPad before adopting it.
3. Preserve richer building attributes in `fetch_overture.py` when the source actually provides them (height/storeys/subtype). Use those before procedural guesses. Consider footprint geometry only after measuring the cost versus the current minimum-rotated-rectangle representation.
4. If buildings/trees visibly move relative to terrain during LOD transitions, implement an explicit per-tile instance-height rebake keyed to actual LOD changes. Do not continuously rebake every frame.
5. Only after the above is stable: near-camera detail LOD for buildings (chimneys, gables, facade hints) while keeping distant buildings in cheap instanced buckets.

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
