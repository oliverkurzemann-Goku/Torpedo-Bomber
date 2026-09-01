// ============================================================
//  WorldStreamer — loads/unloads TerrainTiles around a moving focus point
//  (the aircraft, once wired into the real game) instead of demo.html's
//  earlier fixed startup grid.
//
//  Two distance scales are deliberately kept separate here, matching the
//  user's own "0-5km high / 5-15km mid / 15-30km low / 30km+ unloaded"
//  description:
//   - TerrainManager's existing TERRAIN_LOD_DISTANCES (2200m/6000m, Step 1-3,
//     already measured/verified) decide which of the 3 tessellation levels an
//     ALREADY-LOADED tile uses — that part is untouched.
//   - WORLD_STREAM_RADIUS below is the NEW, outer boundary: whether a tile
//     exists in the scene AT ALL. Tiles beyond it are removed; tiles that
//     enter it are created. This is what "30km+ minimal/unrendered" means.
//
//  Creating and destroying tiles is real work (measured: a from-scratch LOD0
//  build costs ~7.5ms on this project's software-rendered test setup, LOD1
//  ~0.6ms, LOD2 ~0.1ms — see the commit message for the actual numbers), so
//  this class budgets a small slice of the frame for it instead of loading
//  everything a sudden big camera jump would want in a single frame. Tiles
//  that DO get created start at whatever LOD their real distance calls for
//  (via TerrainManager's own rawLodFor()) rather than always the expensive
//  LOD0, since a tile first entering a 30km streaming radius is essentially
//  never close enough to need full detail immediately — updateLOD()'s own
//  hysteresis/morph logic (Step 3) refines it from there like any other tile.
//
//  Step 5: optional `contentManagers` (VegetationManager, WaterRoadManager,
//  and later BuildingManager/AirfieldManager/HistoricalObjectManager) piggy-
//  back on the exact same per-tile load/unload decisions terrain tiles
//  already make here — each one just needs loadTile(tx,tz)/unloadTile(tx,tz)
//  methods. Content only ever exists where its terrain tile does, and this
//  class doesn't need to know anything about what a content manager actually
//  puts in the world.
//
//  Step 7 — does any of this hold up at >=100x100km, and is a floating
//  origin (rendering everything relative to the aircraft instead of true
//  world coordinates, to dodge float32 precision loss far from the origin)
//  actually needed to get there? Both measured, not assumed:
//
//  - Streaming itself: nothing in TerrainManager/WorldStreamer/HeightProvider
//    has ever been bounded to a fixed world size (tiles live in a sparse Map
//    keyed by tile-grid coordinates, and the height/noise functions are pure
//    functions of world position with no fixed extent) — so this was really
//    a question of whether it still WORKS, not whether it's structurally
//    possible. Tested the streamer at focus points up to 96km from the
//    origin on both axes (including a negative-coordinate corner): full
//    convergence to the exact expected tile count every time, 0 NaN tiles,
//    0 out-of-range tiles, finite/plausible heights, comparable convergence
//    time (26-36 frames) regardless of distance from the origin. Real
//    renders at 95km out show the same terrain character as near the origin
//    (same tile-seam pattern, no jitter, no tearing) — no visible
//    degradation. ProceduralHeightProvider's Math.sin-based hashing was
//    separately checked out to 5,000km (50x the required scale) for the
//    classic "large trig argument loses precision" pitfall: local height
//    variance stayed in the same range the whole way, no flattening.
//
//  - Floating origin: measured the actual float32 quantization step at
//    increasing distance from the origin (the real, GPU-relevant precision
//    limit, regardless of how carefully tile-local vertex data is kept
//    small — a tile's position itself still multiplies into every vertex's
//    final world-space value in the vertex shader, in float32). Result: ~1mm
//    at 30km, ~4mm at 100km, ~8mm at 150-250km. For a flight sim, a few
//    millimetres of positional error at 100km out is not perceptible —
//    nowhere near the multi-metre jitter that actually motivates a floating
//    origin in other engines. CONCLUSION: floating origin is not needed at
//    the required >=100x100km scale, so it has NOT been implemented — doing
//    it anyway would mean reworking how every consumer (camera, aircraft
//    position, mission logic) reads world position for a problem that
//    doesn't measurably exist yet. Revisit this if the world size
//    requirement ever grows into the thousands of km (the float32 step
//    roughly doubles every time distance-from-origin crosses a power of two,
//    so it stays sub-centimetre out to several hundred km).
// ============================================================

const WORLD_STREAM_RADIUS = 30000;   // metres — matches the user's "30km+" example, adjustable
const WORLD_STREAM_LOAD_MS_BUDGET = 2;     // time budget per frame for NEW tile builds
const WORLD_STREAM_MAX_UNLOADS_PER_FRAME = 24;   // unload is cheap (no geometry build) — generous cap mainly against a pathological one-frame jump

class WorldStreamer {
  constructor(terrainManager, opts = {}){
    this.terrain = terrainManager;
    this.streamRadius = opts.streamRadius ?? WORLD_STREAM_RADIUS;
    this.loadMsBudget = opts.loadMsBudget ?? WORLD_STREAM_LOAD_MS_BUDGET;
    this.maxUnloadsPerFrame = opts.maxUnloadsPerFrame ?? WORLD_STREAM_MAX_UNLOADS_PER_FRAME;
    this.contentManagers = opts.contentManagers ?? [];
  }

  // Call once per frame with the aircraft's (or, for the demo, the free-fly
  // camera's) world position. Loads/unloads a budgeted amount of work, then
  // runs the existing per-tile LOD/morph update (Step 3) on whatever is
  // actually loaded.
  update(focusX, focusZ, dt){
    const tileSize = this.terrain.tileSize;
    const { tx: ctx, tz: ctz } = this.terrain.worldToTileCoord(focusX, focusZ);
    // +1 margin: a tile can be within streamRadius of the focus point even
    // if its GRID index is one step outside the naive floor(radius/tileSize)
    // square, since distance is measured to each tile's own centre, not to
    // the focus tile's corner.
    const reach = Math.ceil(this.streamRadius / tileSize) + 1;

    // ---- 1) which tiles SHOULD exist right now (real circular radius, not a square) ----
    const wanted = new Map();   // key -> {tx,tz,d}
    for(let dx = -reach; dx <= reach; dx++){
      for(let dz = -reach; dz <= reach; dz++){
        const tx = ctx + dx, tz = ctz + dz;
        const cx = tx * tileSize + tileSize / 2, cz = tz * tileSize + tileSize / 2;
        const d = Math.hypot(cx - focusX, cz - focusZ);
        if(d <= this.streamRadius) wanted.set(tx + ',' + tz, { tx, tz, d });
      }
    }

    // ---- 2) unload whatever is loaded but no longer wanted ----
    let unloads = 0;
    for(const tile of Array.from(this.terrain.tiles.values())){
      if(unloads >= this.maxUnloadsPerFrame) break;
      const key = tile.tileX + ',' + tile.tileZ;
      if(!wanted.has(key)){
        this.terrain.removeTile(tile.tileX, tile.tileZ);
        for(const cm of this.contentManagers) cm.unloadTile(tile.tileX, tile.tileZ);
        unloads++;
      }
    }

    // ---- 3) load whatever is wanted but missing, nearest first, time-budgeted ----
    const missing = [];
    for(const w of wanted.values()){
      if(!this.terrain.hasTile(w.tx, w.tz)) missing.push(w);
    }
    missing.sort((a, b) => a.d - b.d);
    const loadStart = performance.now();
    let loaded = 0;
    for(const w of missing){
      if(performance.now() - loadStart >= this.loadMsBudget) break;
      this.terrain.ensureTile(w.tx, w.tz, rawLodFor(w.d));
      for(const cm of this.contentManagers) cm.loadTile(w.tx, w.tz);
      loaded++;
    }

    // ---- 4) tessellation LOD + geomorph for whatever is actually loaded (Step 3, unchanged) ----
    this.terrain.updateLOD(focusX, focusZ, dt);

    return { wantedCount: wanted.size, loadedThisFrame: loaded, unloadedThisFrame: unloads, pendingLoads: missing.length - loaded };
  }
}
