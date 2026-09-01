// ============================================================
//  WaterRoadManager — one deterministic road curve and one deterministic
//  river curve spanning the ENTIRE world (no fixed WORLD-size bound, unlike
//  thunderbolt-europe.html's own roadZ()/riverX(), which only ever needs to
//  cover its fixed 64x64km WORLD) — exactly the "roads as simplified LINES,
//  rivers as simplified AREAS" requirement from the landscape spec: no
//  attempt at real road geometry here, a smooth low-frequency curve standing
//  in for it until Step 6 replaces this with real imported OSM paths.
//
//  Per tile, only the LOCAL segment of each curve that actually crosses that
//  tile's bounds is built, as a flat ribbon strip that follows the ground
//  height — same idea as thunderbolt-europe.html's own ribbon()/buildWater(),
//  reimplemented self-contained per this module set's own convention (see
//  HeightProvider.js's file header). thunderbolt-europe.html's CLAUDE.md
//  history (4.26) documents a real, previously-shipped bug where this exact
//  kind of ribbon geometry had its winding backwards and was invisible from
//  every angle — rather than risk the same mistake by hand-deriving winding
//  again, each ribbon triangle here picks whichever orientation actually
//  faces +Y (same self-correcting technique TerrainTile.js's skirt uses).
// ============================================================

function roadZ(x){
  return Math.sin(x*0.00013)*900 + Math.sin(x*0.00041+1.7)*260;
}
function riverX(z){
  return Math.sin(z*0.00011+0.6)*1100 + Math.sin(z*0.00037+2.3)*300;
}
// Exclusion helpers for other content managers (VegetationManager) so trees
// don't spawn inside the road/river ribbons.
function distanceToRoad(x,z){ return Math.abs(z - roadZ(x)); }
function distanceToRiver(x,z){ return Math.abs(x - riverX(z)); }

const WATERROAD_ROAD_WIDTH = 12;
const WATERROAD_RIVER_WIDTH = 40;
const WATERROAD_SAMPLE_STEP = 200;   // metres between ribbon cross-sections

class WaterRoadManager {
  constructor(scene, tileSize, terrainManager){
    this.scene = scene;
    this.tileSize = tileSize;
    this.terrain = terrainManager;
    this.roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
    this.riverMat = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.35, metalness: 0.1 });
    this.tiles = new Map();   // "tx,tz" -> {road: Mesh|null, river: Mesh|null}
  }

  _key(tx, tz){ return tx + ',' + tz; }

  loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return;
    const ox = tx * this.tileSize, oz = tz * this.tileSize;
    const road = this._buildRibbon(ox, oz, 'road');
    const river = this._buildRibbon(ox, oz, 'river');
    if(road) this.scene.add(road);
    if(river) this.scene.add(river);
    this.tiles.set(key, { road, river });
  }

  unloadTile(tx, tz){
    const key = this._key(tx, tz);
    const m = this.tiles.get(key);
    if(!m) return;
    if(m.road){ this.scene.remove(m.road); m.road.geometry.dispose(); }
    if(m.river){ this.scene.remove(m.river); m.river.geometry.dispose(); }
    this.tiles.delete(key);
  }

  // Builds the ribbon segment of a curve that falls within tile
  // [ox,ox+tileSize] x [oz,oz+tileSize] — a road is sampled along x (curve
  // z=roadZ(x)), a river along z (curve x=riverX(z)).
  _buildRibbon(ox, oz, kind){
    const isRoad = kind === 'road';
    const width = isRoad ? WATERROAD_ROAD_WIDTH : WATERROAD_RIVER_WIDTH;
    const mat = isRoad ? this.roadMat : this.riverMat;
    const margin = WATERROAD_SAMPLE_STEP;
    // `pts` samples a bit WIDER than this tile so the tangent/direction at
    // the tile's own boundary vertices still comes from a real neighbouring
    // sample, not a clamp — but only points strictly inside [ox,ox+tileSize]
    // (closed both ends, no margin) actually become rendered geometry below.
    // An earlier version rendered the full +/-margin window from EVERY tile:
    // since tileSize is an exact multiple of the sample step, two
    // neighbouring tiles' margin bands sample the identical curve points and
    // both drew the identical overlapping triangles there — classic GPU
    // z-fighting between two separate draw calls of the same geometry, which
    // is what turned out to be causing the road/river to render as a
    // speckled dashed line rather than a coverage gap (verified: dense
    // sampling of the curve showed every point already had SOME tile's
    // geometry covering it, live and in isolation, before this fix).
    // Closed on both ends here means tiles share exactly one boundary VERTEX
    // POSITION with their neighbour — a touching seam, not an overlapping
    // area, which is not enough for z-fighting.
    const pts = [];
    if(isRoad){
      for(let x = ox - margin; x <= ox + this.tileSize + margin; x += WATERROAD_SAMPLE_STEP) pts.push([x, roadZ(x)]);
    } else {
      for(let z = oz - margin; z <= oz + this.tileSize + margin; z += WATERROAD_SAMPLE_STEP) pts.push([riverX(z), z]);
    }
    // BOTH axes must match this tile's own cell — not just the curve's own
    // parametrization axis. A road is iterated by x, but its z can still
    // wander into a different tile ROW partway across this tile's own
    // x-span (the curve's z-amplitude is bigger than one tile), so an x-only
    // check would make every tile in a whole column falsely claim ownership
    // of points that actually belong to a different row.
    const isOwnTile = (p) => p[0] >= ox && p[0] <= ox + this.tileSize && p[1] >= oz && p[1] <= oz + this.tileSize;
    const keepIdx = [];
    for(let i = 0; i < pts.length; i++) if(isOwnTile(pts[i])) keepIdx.push(i);
    if(keepIdx.length < 2) return null;

    const positions = [];
    for(const i of keepIdx){
      const [x, z] = pts[i];
      const [px, pz] = pts[Math.max(0, i-1)];
      const [nx, nz] = pts[Math.min(pts.length-1, i+1)];
      let dx = nx - px, dz = nz - pz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const perpX = -dz * width/2, perpZ = dx * width/2;
      // getRenderedHeight(), not getHeight() — see TerrainManager.js's own
      // comment: a ribbon needs to sit on what the terrain mesh actually
      // shows there, not the exact-but-possibly-off-mesh true height. The
      // offset above that surface needs to be generous, not just "above
      // zero": a 0.05-0.15m gap looked fine in isolation but z-fought
      // visibly against the terrain underneath once actually rendered at
      // real camera distances (confirmed by raycasting the built mesh
      // directly — 98%+ hit rate along the curve even where the RENDER
      // showed a dashed line, proving the geometry was there and it was a
      // depth-buffer precision fight with the terrain, not a coverage gap).
      const y = this.terrain.getRenderedHeight(x, z) + (isRoad ? 1.4 : 2.2);
      positions.push(x+perpX, y, z+perpZ,  x-perpX, y, z-perpZ);   // left_i, right_i
    }

    const indices = [];
    for(let i = 1; i < keepIdx.length; i++){
      const l0 = (i-1)*2, r0 = l0+1, l1 = i*2, r1 = l1+1;
      addUpwardTri(indices, positions, l0, r0, l1);
      addUpwardTri(indices, positions, r0, r1, l1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = true;
    return mesh;
  }

  dispose(){
    for(const key of Array.from(this.tiles.keys())){
      const [tx, tz] = key.split(',').map(Number);
      this.unloadTile(tx, tz);
    }
  }
}

// Same self-correcting winding check as TerrainTile.js's addOutwardTri, aimed
// at +Y here instead of an outward XZ direction (a ground-following ribbon
// should always face up, toward the sky, never down toward the earth it's
// sitting on).
function addUpwardTri(indices, positions, a, b, c){
  const pa = [positions[a*3], positions[a*3+1], positions[a*3+2]];
  const pb = [positions[b*3], positions[b*3+1], positions[b*3+2]];
  const pc = [positions[c*3], positions[c*3+1], positions[c*3+2]];
  const e1 = [pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]];
  const e2 = [pc[0]-pa[0], pc[1]-pa[1], pc[2]-pa[2]];
  const ny = e1[2]*e2[0] - e1[0]*e2[2];
  if(ny >= 0) indices.push(a, b, c);
  else indices.push(a, c, b);
}
