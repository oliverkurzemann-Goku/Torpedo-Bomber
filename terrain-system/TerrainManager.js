// ============================================================
//  TerrainManager — owns a grid of TerrainTiles, assigns each one a LOD based
//  on distance from a focus point (the aircraft, once wired in via Step 4),
//  and keeps the Three.js scene graph in sync.
//
//  The grid bookkeeping here already supported an arbitrary sparse set from
//  Step 1 on — Step 2 ("multiple tiles") turned out to be less about this
//  class (ensureTile/removeTile/updateLOD already handled any tile count) and
//  more about what happens at the seam BETWEEN tiles once neighbours can be
//  at different LOD: see TerrainTile.js's skirt for that. Step 4 ("world
//  streaming") is what will actually call ensureTile/removeTile every frame
//  from an aircraft position instead of demo.html's fixed startup grid.
// ============================================================

// Distance bands (metres) at which a tile drops to a coarser LOD. A tile
// within TERRAIN_LOD_DISTANCES[0] of the focus point gets LOD 0 (highest
// detail); within [0]..[1] gets LOD 1; beyond that, the coarsest LOD.
// Placeholder values for the Step 1 prototype — tune once flying over this
// with the real aircraft (Step 4) shows what actually needs to be sharp.
const TERRAIN_LOD_DISTANCES = [2200, 6000];

class TerrainManager {
  constructor(scene, tileSize, heightProvider){
    this.scene = scene;
    this.tileSize = tileSize;
    this.heightProvider = heightProvider;
    // flatShading:false + real vertex normals from TerrainTile reads as rolling
    // ground, not faceted low-poly — matches what a LOD system needs to look
    // acceptable even at the coarsest tesselation.
    this.material = new THREE.MeshStandardMaterial({ color: 0x5a6b3e, roughness: 1.0, metalness: 0 });
    this.tiles = new Map();   // "tx,tz" -> TerrainTile
  }

  _key(tx, tz){ return tx + ',' + tz; }

  // Which tile-grid cell a world position falls in.
  worldToTileCoord(x, z){
    return { tx: Math.floor(x / this.tileSize), tz: Math.floor(z / this.tileSize) };
  }

  // Ensures a tile exists at the given tile-grid coordinate, builds it at LOD0
  // if it's new, adds its mesh to the scene, and returns it. Idempotent — safe
  // to call every frame for the same coordinate.
  ensureTile(tx, tz){
    const key = this._key(tx, tz);
    let tile = this.tiles.get(key);
    if(!tile){
      tile = new TerrainTile(tx, tz, this.tileSize, this.heightProvider);
      tile.setLOD(0, this.material);
      this.scene.add(tile.mesh);
      this.tiles.set(key, tile);
    }
    return tile;
  }

  removeTile(tx, tz){
    const key = this._key(tx, tz);
    const tile = this.tiles.get(key);
    if(!tile) return;
    this.scene.remove(tile.mesh);
    tile.dispose();
    this.tiles.delete(key);
  }

  hasTile(tx, tz){
    return this.tiles.has(this._key(tx, tz));
  }

  // Re-picks LOD for every currently-loaded tile based on distance to
  // (focusX, focusZ). Call once per frame (Step 4 will throttle/stagger this
  // across frames once tile counts get large enough that rebuilding several
  // geometries in one frame would show up as a stutter).
  updateLOD(focusX, focusZ){
    for(const tile of this.tiles.values()){
      const d = tile.distanceTo(focusX, focusZ);
      let lod = TERRAIN_LOD_DISTANCES.length;   // coarsest by default
      for(let i = 0; i < TERRAIN_LOD_DISTANCES.length; i++){
        if(d < TERRAIN_LOD_DISTANCES[i]){ lod = i; break; }
      }
      if(lod !== tile.lod) tile.setLOD(lod, this.material);
    }
  }

  // World-space height query, independent of tiling — works whether or not a
  // tile is currently loaded at (x,z), because it goes straight to the height
  // provider. Same one-argument-pair shape as thunderbolt-europe.html's own
  // groundY(x,z), deliberately: wiring this system into the live game later
  // means pointing the EXISTING groundY() calls at this method, not rewriting
  // every caller (flight-floor clamp, AI altitude, mission placement, ...).
  getHeight(x, z){
    return this.heightProvider.getHeight(x, z);
  }

  get tileCount(){ return this.tiles.size; }

  dispose(){
    for(const tile of this.tiles.values()){
      this.scene.remove(tile.mesh);
      tile.dispose();
    }
    this.tiles.clear();
    this.material.dispose();
  }
}
