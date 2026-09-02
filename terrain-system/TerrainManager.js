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

// Step 3: a tile sitting almost exactly on a threshold would otherwise flip
// LOD every frame as the focus point jitters a metre either side of it —
// each flip re-triggers a geomorph (TerrainTile.js) for nothing. Upgrading
// (more detail) is allowed the moment the raw distance calls for it — more
// detail never looks wrong even a little early. Downgrading only happens
// once the distance clears the CURRENT band's own threshold by this factor,
// so retreating has to actually mean it before detail is thrown away.
const TERRAIN_LOD_HYSTERESIS = 1.15;

function rawLodFor(d){
  for(let i = 0; i < TERRAIN_LOD_DISTANCES.length; i++){
    if(d < TERRAIN_LOD_DISTANCES[i]) return i;
  }
  return TERRAIN_LOD_DISTANCES.length;
}

class TerrainManager {
  constructor(scene, tileSize, heightProvider){
    this.scene = scene;
    this.tileSize = tileSize;
    this.heightProvider = heightProvider;
    // flatShading:false + real vertex normals from TerrainTile reads as rolling
    // ground, not faceted low-poly — matches what a LOD system needs to look
    // acceptable even at the coarsest tesselation.
    //
    // Reported (real iPad, not this sandbox's headless SwiftShader renderer):
    // the terrain mesh itself was completely invisible -- pure sky colour
    // where the ground should be -- while every OTHER mesh in this same
    // scene (roads, river, trees, buildings, historical objects, all from
    // OSMManager/VegetationManager/WaterRoadManager/HistoricalObjectManager)
    // rendered correctly, unmoved by camera position or the LEVEL button.
    // Compared every material in this whole module set: this terrain
    // material was the ONLY one with vertexColors:true (all 17 others use a
    // plain solid `color`) -- the one structural difference between the one
    // mesh that fails and everything that doesn't. Cannot reproduce on real
    // iOS hardware from this environment to prove it conclusively, but it's
    // the one real lead the evidence points to, so: dropped the per-vertex
    // biome tint (TerrainTile.js) in favour of a plain solid colour here,
    // removing vertexColors from this material entirely as the most
    // surgical way to test/fix that lead. If this resolves it, the biome
    // tint is worth re-adding later via a baked canvas texture instead (the
    // technique thunderbolt-europe.html's own ground texture already uses
    // successfully on real iPads) rather than per-vertex colours.
    this.material = new THREE.MeshStandardMaterial({ color: 0x527a3c, roughness: 1.0, metalness: 0 });
    this.tiles = new Map();   // "tx,tz" -> TerrainTile
  }

  _key(tx, tz){ return tx + ',' + tz; }

  // Which tile-grid cell a world position falls in.
  worldToTileCoord(x, z){
    return { tx: Math.floor(x / this.tileSize), tz: Math.floor(z / this.tileSize) };
  }

  // Ensures a tile exists at the given tile-grid coordinate, adds its mesh to
  // the scene, and returns it. Idempotent — safe to call every frame for the
  // same coordinate. `initialLod` (default 0) is only used for a brand new
  // tile's first build — WorldStreamer (Step 4) passes in whatever LOD
  // actually matches the tile's real distance, so a tile that first appears
  // near the edge of the streaming radius doesn't pay for full LOD0 detail
  // only to immediately downgrade next frame; updateLOD()'s own hysteresis/
  // morph logic still corrects it on the very next call regardless, so this
  // only needs to be approximately right, not exact.
  ensureTile(tx, tz, initialLod = 0){
    const key = this._key(tx, tz);
    let tile = this.tiles.get(key);
    if(!tile){
      tile = new TerrainTile(tx, tz, this.tileSize, this.heightProvider);
      tile.setLOD(initialLod, this.material);
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
  // (focusX, focusZ), applies hysteresis (see TERRAIN_LOD_HYSTERESIS above),
  // and advances any tile mid-geomorph by dt. Call once per frame (Step 4
  // will throttle/stagger the LOD-selection part once tile counts get large
  // enough that even just the distance checks show up as a cost — the morph
  // update itself is already only ever done for tiles actually transitioning).
  updateLOD(focusX, focusZ, dt){
    for(const tile of this.tiles.values()){
      const d = tile.distanceTo(focusX, focusZ);
      const raw = rawLodFor(d);
      let lod = tile.lod >= 0 ? tile.lod : raw;
      if(raw < lod){
        lod = raw;   // upgrade (more detail): immediate
      } else if(raw > lod){
        const curBoundary = lod < TERRAIN_LOD_DISTANCES.length ? TERRAIN_LOD_DISTANCES[lod] : Infinity;
        if(d >= curBoundary * TERRAIN_LOD_HYSTERESIS) lod = raw;   // downgrade: only once clearly past the band
      }
      if(lod !== tile.lod) tile.setLOD(lod, this.material);
      if(tile.morphing) tile.updateMorph(dt);
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

  // Height as the CURRENTLY RENDERED terrain surface actually shows it at
  // (x,z) — distinct from getHeight() above, which is the true, exact height
  // regardless of tessellation. Step 5 content that rests ON TOP of the
  // terrain (roads, rivers, trees) needs THIS one: placing something at the
  // exact true height can leave it floating above or sunk into a coarser LOD
  // tile's own straight-line interpolation between its sparser sample points
  // — measured in Step 2 at up to ~48m for the coarsest tessellation. That's
  // the same interpolation-gap problem the terrain skirt already solved for
  // tile EDGES; this is the same fix applied to content sitting on a tile's
  // INTERIOR, reusing TerrainTile.js's own coarseInterpHeight() so it matches
  // pixel-for-pixel with what that tile's mesh is actually built from. Falls
  // back to the exact height when no tile is currently loaded at that point
  // (matches getHeight()'s point, no tile) — content wouldn't be visibly
  // resting on unloaded ground anyway.
  getRenderedHeight(x, z){
    const { tx, tz } = this.worldToTileCoord(x, z);
    const tile = this.tiles.get(this._key(tx, tz));
    if(!tile || tile._renderSeg < 0) return this.heightProvider.getHeight(x, z);
    return coarseInterpHeight(this.heightProvider, this.tileSize, tile.centerX, tile.centerZ, tile._renderSeg, x - tile.centerX, z - tile.centerZ);
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
