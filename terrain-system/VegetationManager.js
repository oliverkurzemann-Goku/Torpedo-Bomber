// ============================================================
//  VegetationManager — procedural forest trees, per tile, on the same
//  load/unload lifecycle as terrain tiles themselves (WorldStreamer calls
//  loadTile/unloadTile alongside TerrainManager.ensureTile/removeTile — see
//  WorldStreamer.js's contentManagers option). This is placeholder
//  PROCEDURAL content, standing in for what a real OSM import
//  (natural=wood / landuse=forest polygons, Step 6) will eventually drive —
//  same per-tile shape, same InstancedMesh rendering technique; only the
//  SOURCE of "where is forest" changes later.
//
//  Two InstancedMeshes per tile (trunk, canopy) — not one mesh for the whole
//  world and not one mesh per tree, matching this project's own established
//  "InstancedMesh per repeated part" convention (see thunderbolt-europe.html
//  buildForests()/buildSettlement()). Trees stay entirely a per-tile concern:
//  when a tile unloads, its two InstancedMeshes are disposed with it.
//
//  Requires WaterRoadManager.js to be loaded first (uses its distanceToRoad/
//  distanceToRiver so trees don't spawn on top of a road or in a river).
// ============================================================

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const VEG_MAX_TREES_PER_TILE = 150;
const VEG_CANDIDATE_GRID = 14;      // candidates sampled per tile edge -> up to 196, capped by VEG_MAX_TREES_PER_TILE
const VEG_COVERAGE_THRESHOLD = 0.55;

function vegHash(x, z, salt){
  const s = Math.sin(x*0.0913 + z*0.1277 + salt*7.13) * 43758.5453;
  return s - Math.floor(s);
}
// Smooth low-frequency coverage field — values above VEG_COVERAGE_THRESHOLD
// are "forest", producing patches rather than a uniform scatter. Deliberately
// its own simple function, not TerrainTile.js's biomeColor() or
// HeightProvider.js's _fbm — self-contained per this module set's own
// convention (see HeightProvider.js's file header).
function vegCoverage(x, z){
  const a = Math.sin(x*0.00021 + 1.1) * Math.cos(z*0.00019 - 0.4);
  const b = Math.sin(x*0.00057 - 2.2 + z*0.00031) * 0.4;
  return (a + b + 1.4) / 2.8;   // roughly 0..1
}

class VegetationManager {
  constructor(scene, tileSize, terrainManager){
    this.scene = scene;
    this.tileSize = tileSize;
    this.terrain = terrainManager;
    this.trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4, 6);
    this.canopyGeo = new THREE.ConeGeometry(2.6, 6, 7);
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
    this.canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 1 });
    this.tiles = new Map();   // "tx,tz" -> {trunk, canopy, count} | null (no trees this tile)
  }

  _key(tx, tz){ return tx + ',' + tz; }

  loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return;
    const ox = tx * this.tileSize, oz = tz * this.tileSize;
    const step = this.tileSize / VEG_CANDIDATE_GRID;

    const placements = [];
    outer:
    for(let iz = 0; iz < VEG_CANDIDATE_GRID; iz++){
      for(let ix = 0; ix < VEG_CANDIDATE_GRID; ix++){
        if(placements.length >= VEG_MAX_TREES_PER_TILE) break outer;
        const jx = vegHash(tx*1000+ix, tz*1000+iz, 1) - 0.5;
        const jz = vegHash(tx*1000+ix, tz*1000+iz, 2) - 0.5;
        const x = ox + (ix + 0.5 + jx) * step;
        const z = oz + (iz + 0.5 + jz) * step;
        if(vegCoverage(x, z) < VEG_COVERAGE_THRESHOLD) continue;
        if(vegHash(x, z, 3) > 0.5) continue;             // thin a qualifying patch out, not every candidate becomes a tree
        if(distanceToRoad(x, z) < 30) continue;
        if(distanceToRiver(x, z) < 60) continue;
        // getRenderedHeight(), not getHeight() -- see TerrainManager.js and
        // WaterRoadManager.js: a tree needs to sit on what the terrain mesh
        // actually shows there, not the exact-but-possibly-off-mesh height
        // (otherwise it can float above or sink into a coarse LOD tile).
        const y = this.terrain.getRenderedHeight(x, z);
        const scale = 0.8 + vegHash(x, z, 4) * 0.5;
        const rot = vegHash(x, z, 5) * Math.PI * 2;
        placements.push({ x, y, z, scale, rot });
      }
    }

    if(placements.length === 0){ this.tiles.set(key, null); return; }

    const trunk = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, placements.length);
    const canopy = new THREE.InstancedMesh(this.canopyGeo, this.canopyMat, placements.length);
    // InstancedMesh defaults frustumCulled=false (verified against the r128
    // source) — its per-object culling test only ever checks the SHARED base
    // geometry's bounding sphere at the mesh's own origin, not a sphere
    // covering all the scattered instances, so turning it on here without a
    // hand-built whole-tile bounding sphere would incorrectly cull every tree
    // in the tile whenever that unrelated point falls outside the frustum.
    // Left at the library's own default instead of risking that.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for(let i = 0; i < placements.length; i++){
      const p = placements[i];
      q.setFromAxisAngle(UP_AXIS, p.rot);
      m.compose(new THREE.Vector3(p.x, p.y + 2*p.scale, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, p.y + 4.5*p.scale, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
      canopy.setMatrixAt(i, m);
    }
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    this.scene.add(trunk);
    this.scene.add(canopy);
    this.tiles.set(key, { trunk, canopy, count: placements.length });
  }

  unloadTile(tx, tz){
    const key = this._key(tx, tz);
    const t = this.tiles.get(key);
    if(t){
      this.scene.remove(t.trunk);
      this.scene.remove(t.canopy);
      t.trunk.dispose();    // frees the per-instance matrix buffer (InstancedMesh.dispose() only fires the
      t.canopy.dispose();   // 'dispose' event the renderer listens to — verified it does NOT touch the
    }                        // shared trunkGeo/canopyGeo/trunkMat/canopyMat, so other tiles are unaffected
    this.tiles.delete(key);
  }

  get treeCount(){
    let n = 0;
    for(const t of this.tiles.values()) if(t) n += t.count;
    return n;
  }

  dispose(){
    for(const key of Array.from(this.tiles.keys())){
      const [tx, tz] = key.split(',').map(Number);
      this.unloadTile(tx, tz);
    }
    this.trunkGeo.dispose();
    this.canopyGeo.dispose();
  }
}
