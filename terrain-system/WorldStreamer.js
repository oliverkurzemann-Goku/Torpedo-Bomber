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
      loaded++;
    }

    // ---- 4) tessellation LOD + geomorph for whatever is actually loaded (Step 3, unchanged) ----
    this.terrain.updateLOD(focusX, focusZ, dt);

    return { wantedCount: wanted.size, loadedThisFrame: loaded, unloadedThisFrame: unloads, pendingLoads: missing.length - loaded };
  }
}
