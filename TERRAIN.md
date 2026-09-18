# Remagen terrain handoff

Companion to `CLAUDE.md`. Read both files before changing `remagen-mission.html`, `terrain-system/OSMManager.js`, terrain LOD, real-world placement, buildings or vegetation.

## Scope

Remagen is the terrain laboratory for the project. Terrain experiments should be proved here first. Do not copy them into `torpedo-carrier.html` or `thunderbolt-europe.html` until the Remagen version is visually accepted on the real iPad and its performance is known.

The flight model, weapons and mission logic are not part of a terrain pass unless a terrain change demonstrably breaks them.

## Test build versioning

Every Remagen revision handed to Oliver for testing must increment the visible build number in both places in `remagen-mission.html`: the always-visible `#testVersionBannerText` and the in-flight `#buildTag`. Add a short pass label when useful. Never tell Oliver a build is ready until the branch/deployment being tested contains that exact visible version. Current revision: `REMAGEN BUILD 18 · LIVING RHINE`.

The local terrain scripts carry the same version as a `?v=remagen-18` query. `OSMManager.BUILD` and `LivingWorld.BUILD` are checked during startup and the banner gains `MODULE 18` only after both checks succeed. This prevents an updated HTML document from silently running an older Safari-cached terrain module.

## Build 18 — living roads, railway and Rhine

After the settlement/landscape passes, Oliver explicitly asked to implement the remaining agreed
sequence as one larger update: living world first, followed by mission hooks and atmosphere. The
flight model and the five existing practice/combat flows remain unchanged.

`terrain-system/LivingWorld.js` is a new persistent world layer built only after all real OSM and
historical sources are ready. It selects four deterministic routes from the shipped road network,
two from the railway network, and traces a 4.76km navigation line through the rendered Rhine water
mask starting at the real bridge centre. No mission creates or removes routes. Vehicle identities
and traffic are period-inspired fiction; the source proves the road/rail/water footprint, not that
a particular unit used it in March 1945.

- Three four-truck convoys, one steam supply train, two Rhine ferries and six civilian cars/
  horse carts move continuously. Each object follows terrain or water every frame and hides beyond
  3.2–4.2km. The complete moving layer is 108 simple Lambert meshes; only nearby entity groups
  render. The existing high-detail static M16 and Tiger remain separate scenery.
- Eight global instanced buckets add 420 hedge pieces, 77 orchard trees, 46 haystacks, 125
  telegraph poles and 33 cattle across 230 points sampled inside mapped farmland. No instance
  colours are used. Because these instances span the full 28x32km region, their eight aggregate
  meshes deliberately disable object-origin frustum culling; this prevents the whole bucket from
  vanishing when the origin is outside the camera while keeping draw calls bounded.
- Subtle periodic smoke comes from the factory stack and one rail-side activity point only when
  the player is within 2.6km. It reuses the mission's existing pooled smoke system; no permanent
  particle allocation or new audio stream was added.
- Three new sorties attach combat state to those same persistent moving objects: Road
  Interdiction (four trucks), Rail Cut (one supply train), and Rhine Ferry Hunt (one ferry).
  Objectives, HUD/minimap navigation, damage, destruction, RTB logic, score and logbook claims use
  the existing target pipeline. Starting another sortie resets the persistent objects and their
  original shared materials safely.

The real-r128 living-world test confirms road route lengths 1375/884/1348/1291m, rail routes
952/819m, a 4760m Rhine route whose sampled points remain inside water, 12 trucks, one train, two
ferries, six ambient vehicles, 108 moving meshes and exactly eight rural-detail buckets. All
matrices/buffers are finite, every moving material is Lambert, instance colours remain absent,
destroy/reset/culling and smoke emission pass. The pre-existing structural, all-56-tile geometry,
water/cloud, airfield and real-GLTF vehicle suites also pass unchanged: 21,142 buildings, 32,540
roof parts, 139,930 crowns, 398,896 water triangles and maximum drape error 0.00063m. These checks
do not prove iPad appearance or FPS; Oliver's device remains the acceptance test.

## Build 17 — calm Rhine and period village masses

Oliver's Build 16 iPad screenshots exposed two specific visual failures. The water's 64px,
48m repeating diagonal wave texture became an obvious high-frequency checker/moire pattern
across the Rhine. Large current-day OSM minimum rectangles were also rendered almost literally,
leaving conspicuous modern flat-roof blocks among otherwise rural settlements.

- Rhine/lake material colours are darker and less saturated, with roughness 0.82–0.84. The
  water map is now a neutral 128px, eight-level low-contrast texture repeated every 260m. It
  keeps subtle broad tonal variation without the previous screen-door pattern. Water source
  geometry, terrain draping, stream widths and collision masks are unchanged.
- The data still provides only rotated rectangles, not verified 1945 footprints or building
  use. This pass therefore creates a period-inspired visual grammar rather than claiming a
  reconstruction. Suitable rectangles wider than 30m split into two to six inset, staggered
  gabled masses or small courtyard groups. The pieces stay inside the already water-validated
  source footprint. Heights, plaster family and roof tone vary slightly between adjoining
  masses, while barns and inferred churches keep their special silhouettes.
- Ordinary roofs are now steeper (at least 2m, up to 5.4m; church roofs up to 6.5m). Only 58
  very large elongated source structures qualify for a possible industrial flat roof before
  water rejection, about 0.27% of the 21,449 raw building rectangles. No new material or
  draw-call bucket and no instance colours were introduced.

Validation with actual Three.js r128 and all 56 shipped tiles: 21,142 accepted buildings create
32,540 roof parts, 14 church spires and at most ten building buckets per tile. Every rendered
roof remains outside 398,896 rendered water triangles; maximum terrain/water drape error remains
0.00063m. The water texture has range 245–253 and mean adjacent-pixel delta 0.135. Structural,
airfield and water/cloud suites pass. These are CPU/geometry checks, not an iPad visual or FPS
measurement; final acceptance still requires Oliver's device screenshot and fluidity check.

## Build 16 — landmarks, woodland mass and facade variation

Oliver's real-device feedback on Build 15 was specific: church silhouettes disappeared from
normal flying height, mapped woods still read as scattered individual trees, and every facade
carried the same symmetric window grid. The partially considered convoy step was therefore
deferred; Build 16 changes only these three visual systems.

- The same bounded set of 14 visually inferred church landmarks remains. Naves are taller;
  western towers are now 7–10m wide and rise 12m above the nave, with a 10m octagonal spire.
  These are still visual landmarks, not claims about verified 1945 church locations.
- Each mapped forest tile adds one merged, translucent dark woodland floor beneath its trees and
  uses broader canopy geometry. This makes polygon-scale forest masses readable from the air
  without adding tree instances. Water, roads and farmland render above the floor. The forest
  budget is now at most five buckets per tile: floor, trunks, conifers, deciduous and shrubs.
- The four existing wall-material buckets now have four distinct asymmetric window/door atlases.
  This adds texture memory but no building draw calls, no individual window meshes and no
  instance colours. The per-tile building limit remains ten buckets.

Validation on actual shipped data with Three.js r128: all 56 tiles, 21,142 accepted buildings,
23,853 roof parts, 139,930 crowns, 14 church spires, 398,896 water triangles, maximum water-drape
error 0.00063m, maximum five forest and ten building buckets. Roofs and the enlarged 6.8m crown
envelope do not intersect rendered water. The airfield, water/cloud, actual-GLTF vehicle and
dependency-free structural suites pass. These checks do not establish iPad appearance or FPS.
The next device check must confirm that churches read clearly, woods look continuous rather than
painted-on, facade repetition is visibly reduced, and frame rate remains fluid. Only after that
should moving convoys resume.

## Build 15 — settlement silhouettes and coherent forests

Oliver confirmed Build 14 works very well and asked to continue in the agreed order. This revision is deliberately limited to buildings and vegetation. Flight, missions, airfield, water, clouds and vehicles are unchanged except for their cache version.

The source still stores buildings only as a minimum rotated rectangle `{x,z,w,d,rotY}`. Build 15 therefore adds deterministic **visual inference**, not historical claims:

- four neighbourhood-coherent wall families (plaster, stone, ochre, brick), three roof families (tile, slate, dark brown), flat industrial roofs and existing chimneys;
- suitable medium footprints sometimes split into two parts inside their original rectangle, producing an L-shaped house with matching independent gable roofs;
- long medium/large footprints become lower barn/warehouse silhouettes;
- at most 14 region-wide church-like landmarks are selected from plausible footprints in dense building clusters, kept more than 1.9km apart, with a raised stone tower and octagonal spire. They are not assertions that a particular 1945 church stood at that coordinate.

No instance colours are used. Build 11's suspected shared-material/instance-colour path remains withdrawn. All variants use ordinary existing `MeshStandardMaterial` buckets and instanced geometry. The maximum per-tile building bucket count rises from 6 to **10**, bounded independently of building count. Across the 56 tiles, 21,142 accepted source buildings create 23,853 roof parts because some footprints have a second wing; 14 spires are emitted. The existing complete-footprint water rejection still happens before splitting, so every wing stays within an already-validated dry footprint. Foundation heights still use the full source footprint, favouring no visible floating on slopes.

Forest species no longer switch independently at every tree. `osmValueNoise()` creates smoothly varying ~310m stands; a small individual perturbation softens their borders. Shrubs preferentially occupy the first 24m inside a mapped forest boundary. A second ~420m field varies density and produces irregular small glades. Height, width and rotation still vary per tree, but the maximum crown envelope remains below the existing 5m water clearance. Real-data counts fall from 160,662 rendered crowns in Build 14 to **140,196** in Build 15, partly offsetting the extra building buckets.

Validation: the real-r128, all-56-tile test checks 21,142 accepted buildings, 23,853 roof matrices, 14 churches, 140,196 crowns and 398,896 water triangles. Roofs and maximum 4.9m crown discs do not intersect rendered water; maximum drape error remains 0.00063m. The structural test measures 91.1% same-species agreement between nearby non-shrub trees, 53.4% shrub share at forest edges, exactly 14 spaced landmark keys, no building instance colours, bounded 4 forest / 10 building buckets, and a church silhouette. Airfield, water/sky and actual-GLTF vehicle tests also pass. These are CPU geometry checks, not an iPad screenshot or FPS measurement.

Next real-device check: player/roofs/trees still visible, towns show coherent colour blocks rather than confetti, L-shaped roofs remain correctly aligned, churches are plausible and not excessive, forest stands read as patches, forest edges look softer, and frame rate remains fluid. If accepted, the next agreed stage is a living world: moving convoys first, then trains/ships and rural details. Keep those mission/AI changes out of this terrain-only build.

## Build 14 — complete stream layer, neutral clouds, real vehicles

Oliver accepted Build 13. We inspected IMG_0611/0610/0609: multicoloured cloud speckles and wide, abruptly ending water strips. The original importer deliberately omitted streams. Of its 507 clipped line pieces, 464 are canals and 43 rivers; rendering every one 34m wide exaggerated their size and missing connections.

`real/tools/build_waterways.py` fetches the pinned Overture water theme (2026-08-19.0), including streams. `real/data/waterways.json` holds 4,182 stream pieces, 464 canals and 43 river pieces across all 56 tiles. `prepareRegion(coords,waterwaysURL)` replaces only water-line fields BEFORE generating global masks and loading any tile. Missing/mismatched overlays fail explicitly. Original lake/Rhine polygons and all other tile fields remain intact. 83 of the previous 263 unmatched line ends now touch a sourced stream within 0.2m, including seven around the field. This does NOT prove every remaining endpoint is a defect or every source gap is fixed: springs, culverts and the source bbox remain relevant. Do not disguise gaps by inventing lakes.

Widths are visual estimates (stream 2.4m, canal 6m, river 12m), not measured source attributes. `osmWaterPairs()` is shared by rendering and placement masks. It retains source bends, varies width slightly and tapers only unmatched source ends; clipped seams and polygon connections retain full width. The generator tags endpoints globally. Water uses a neutral 64px ripple DataTexture; world UVs are regenerated on redrape. The first implementation subdivided every 8m (630,407 water triangles). Sparse 80m subdivision plus explicit taper points reduces this to **398,896**, versus 182,323 in Build 13. There are no additional water draw-call buckets, but geometry/memory costs rose; unchanged iPad FPS is NOT established.

Clouds now use explicit 128px RGBA data: every RGB channel is 255, including transparent texels; alpha falls smoothly to zero. This replaces the canvas upload path and avoids chromatic filtering fringes. The precise Safari/GPU cause is unproven and the screenshot fix needs real-device confirmation. No new cloud shader or renderer flags.

`WorldVehicles.js` loads existing M16 (approximately 14MB) and Tiger (1.7MB) sequentially after the menu opens. Static M16: (1047,17987.6) beside the field; Tiger: (14350,15870) near Erpel, with a bounded fallback position search. Positions are illustrative, not verified historical unit locations. Select ONLY the Tiger's `TIGER_H1` subtree, preserving ancestor transforms: the source is a kit with separately laid-out crew, heads and weapons. Convert vehicle materials locally to Lambert + existing diffuse maps; never modify aircraft materials. Vehicles hide beyond 1,800m, re-ground on current terrain and reject water, building footprints, nearby trees and steep footprint relief. These are scenery, not new combat targets, traffic AI or suspension physics. Credits and the GLBs' embedded attribution/license metadata are recorded in `ASSET-CREDITS.md`, linked in the menu. No Sketchfab download/account was used.

Validation commands (in addition to existing region/airfield tests):

```bash
THREE_R128=/path/to/three.min.js node terrain-system/tests/remagen-water-sky.js
THREE_R128=/path/to/three.min.js GLTF_LOADER_R128=/path/to/GLTFLoader.js node terrain-system/tests/remagen-vehicles.js
```

Tests confirm 83 stream connections, tile/width arrays, neutral cloud pixels, terminal/seam behavior, and actual GLTFLoader node transforms/materials/placement. M16: 19 meshes/99,911 triangles; selected Tiger: 13/910. All 53 embedded source images separately decoded with Pillow. The loader test supplies image events without a GPU: it is NOT a rendered screenshot. Independent region geometry tests check 21,142 roofs and 160,662 crowns against 398,896 water triangles, maximum drape error 0.00063m. Existing field and dependency-free regression tests pass. The cloud browser has been unable to create WebGL even for confirmed Build 12; no iPad visual/FPS acceptance is claimed.

Source-fetch lesson: fsspec ignored the configured proxy and failed every footer while urllib could reach the public bucket. Set `client_kwargs={"trust_env": True}` in `overture_lib.py`. Successful fetch: 32 files scanned, one matching file, 33,224 candidate rows, 5,682 intersecting water features. An earlier Overpass request returned HTTP 406 and supplied no data. Never overwrite the shipped network with an empty fetch; the overlay builder rejects suspiciously small results.

Next device checks: photographed canal near the field, cloud speckles, M16 at the service area, Tiger near Erpel, and frame rate with the fuller water network. Remaining detail work: richer forest/building silhouettes, additional vehicles/ships, then mission hooks. Build 13 field and player flight remain unchanged.

## Build 13 — isolated forward airfield

Oliver confirmed Build 12 on his iPad: "Ja, passt wieder". He explicitly asked us to continue improving the game instead of stopping after recovery. This revision changes only the fictional start field; it does not restore Build 11's global instance colours, village variants or forest changes.

`terrain-system/AirfieldDetails.js` replaces the old two centre-sampled ribbons and five crude huts. It builds a 900 x 40m earth strip with grass shoulders, two wheel ruts, a parallel service track with three connections, an apron, five timber barracks with pitched roofs/windows/doors/stovepipes, a maintenance shed, crates, barrels, small edge markers and a proportionate windsock. It remains a period-inspired fictional field, not a verified reconstruction of a historical airbase. Aircraft, spawn, flight and missions are unchanged.

Rendering uses **nine ordinary MeshLambert meshes total**: three ground batches and six merged object colour batches. There are no instance colours, new shader defines, added model downloads or changes to shared terrain/aircraft materials. Window frames and supplies merge into the same bounded colour batches. The shader/GPU cause of Build 11 remains unproven.

Ground triangles reuse the established `OSMManager._prepareWaterSurface` / `redrapeWater` grid-clipping algorithm. Despite the water-oriented helper names, only geometry is involved: the field retains its own Lambert materials and ground UVs. `refresh()` regenerates UVs after redraping and runs only after a settled segment-count change on tile 0,4, via `updateContentVisibility`. No ground allocation occurs on unchanged LOD or during morphs. Static object foundations use 15 footprint samples at construction; distant LOD changes do not rebake these objects. Ground may briefly differ during a morph, as with existing water. Keep this limitation explicit.

Tests:

```bash
THREE_R128=/absolute/path/to/three.min.js node terrain-system/tests/remagen-airfield.js
THREE_R128=/absolute/path/to/three.min.js node terrain-system/tests/remagen-real-geometry.js
node terrain-system/tests/osmmanager-regression.js
```

The new test executes the actual mission's `buildAirfield()` with real r128 and shipped DEM: nine meshes, 51 named major parts, 1,362 sampled ground triangles across fine/coarse/fine LOD, maximum drape error 0.000012m. It checks finite/aligned attributes, upward winding, ray hits across runway width including spawn, foundation coverage, no solid details in the active runway, and stable allocations on unchanged LOD. Existing region tests still pass: 21,286 roofs, 162,469 crowns, 182,323 water triangles. **These are CPU geometry tests, not GPU rendering or FPS measurements.** Cloud Chrome could not create a WebGL context for the prior recovery; final iPad appearance of this isolated pass remains unverified. Next real-device check: player visible at spawn/chase, broad runway visible, roofs/trees preserved, rollways and buildings visible, smooth frame rate.

Next work remains village/building variety and forest detail, followed by period vehicles and mission expansion. Keep separate revisions and always increment the visible build. Do not silently stop after a repair: the standing user request is to continue improvements.

## Build 12 — recovery from Build 11 rendering regression

The user's Build 11 iPad screenshots show no player aircraft, roofs, trees or airfield; textured wall boxes and terrain still draw. This is a rendering failure, not established evidence that those objects were absent from the scene. CPU placement/geometry checks were insufficient.

Recovery deliberately restores the entire Build 10 runtime (`655cf1e50f657ab9399d4b8d57c89abac44695fc`), changing only version/cache labels. Build 11's airfield module, instance colours, L-shaped blocks, hipped roofs and chapel additions are withdrawn together. They remain in commit `719857d56cda8ba0d0b57c9062a19efbb3c256a7` and PR #5; this is recoverable history, not lost work.

Do not describe the exact cause as proven. The new instance-colour/material combinations are a suspect, but there is no captured iPad GPU error. The current cloud Chrome test cannot even create a WebGL context (`THREE.WebGLRenderer: Error creating WebGL context.`), so it provides no visual acceptance evidence. Build 12 was verified by runtime comparison to Build 10, syntax and existing real-data geometry tests, and deployment completion. Oliver subsequently confirmed the recovery on his iPad ("Ja, passt wieder").

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
