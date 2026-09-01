// ============================================================
//  TerrainTile — one square patch of ground, built at a chosen LOD resolution
//  from a HeightProvider.
//
//  This is deliberately the opposite of thunderbolt-europe.html's own
//  buildTerrain(): that function builds ONE PlaneGeometry(WORLD,WORLD,SEG,SEG)
//  covering the entire 64x64 km world (SEG=1024, i.e. over a million vertices,
//  all always in memory and always rendered) — exactly what this project was
//  asked not to repeat at 100x100 km scale. A TerrainTile instead covers one
//  small square (Step 1 default: 4x4 km) and can be built cheaply at a coarse
//  resolution when it is far from the camera, or disposed of entirely when it
//  is out of range (Step 4, WorldStreamer).
// ============================================================

// Segment counts per LOD level. Index 0 = highest detail (closest tile),
// higher indices = coarser meshes. Tunable — Step 3 picks between these by
// distance-to-focus; Step 1's demo exercises all three so the technique is
// visibly proven before anything gets wired to a real aircraft position.
const TERRAIN_LOD_SEGMENTS = [64, 16, 4];

class TerrainTile {
  // tileX/tileZ: integer TILE-GRID coordinates, not metres. Tile (0,0) covers
  // world-space [0,tileSize) x [0,tileSize); tile (-1,0) covers
  // [-tileSize,0) x [0,tileSize); and so on. This mirrors the flat grid a
  // WorldStreamer will index tiles by (Step 4) rather than free-floating
  // world positions, so "which tiles are within N of the aircraft" is cheap
  // integer arithmetic, not a distance check against every tile that exists.
  constructor(tileX, tileZ, tileSize, heightProvider){
    this.tileX = tileX;
    this.tileZ = tileZ;
    this.tileSize = tileSize;
    this.heightProvider = heightProvider;
    this.worldOriginX = tileX * tileSize;
    this.worldOriginZ = tileZ * tileSize;
    this.lod = -1;             // -1 = not built yet
    this.mesh = null;
  }

  get centerX(){ return this.worldOriginX + this.tileSize / 2; }
  get centerZ(){ return this.worldOriginZ + this.tileSize / 2; }

  // Builds (or rebuilds) this tile's mesh at the given LOD index. Safe to call
  // repeatedly with a changing index — the old geometry is disposed first, so
  // switching LOD at runtime (Step 3) never leaks GPU memory. A no-op if the
  // tile is already at the requested LOD.
  setLOD(lodIndex, material){
    lodIndex = Math.max(0, Math.min(TERRAIN_LOD_SEGMENTS.length - 1, lodIndex));
    if(lodIndex === this.lod && this.mesh) return this.mesh;

    const seg = TERRAIN_LOD_SEGMENTS[lodIndex];
    const geo = new THREE.PlaneGeometry(this.tileSize, this.tileSize, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = this.centerX, cz = this.centerZ;
    for(let i = 0; i < pos.count; i++){
      const wx = cx + pos.getX(i), wz = cz + pos.getZ(i);
      pos.setY(i, this.heightProvider.getHeight(wx, wz));
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();     // required for Three.js's own frustum culling to work

    if(this.mesh){
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    } else {
      this.mesh = new THREE.Mesh(geo, material);
      this.mesh.position.set(cx, 0, cz);
      this.mesh.frustumCulled = true;   // Three's built-in per-object culling — no custom code needed
      this.mesh.matrixAutoUpdate = false;
      this.mesh.updateMatrix();
      this.mesh.userData.tile = this;   // lets a picking/debug ray find its way back to this tile
    }
    this.lod = lodIndex;
    return this.mesh;
  }

  distanceTo(x, z){
    return Math.hypot(x - this.centerX, z - this.centerZ);
  }

  // Height query local to this one tile (bounds-unchecked — callers that don't
  // already know (x,z) falls inside this tile should go through
  // TerrainManager.getHeight() instead, which works regardless of tiling).
  getHeight(x, z){
    return this.heightProvider.getHeight(x, z);
  }

  dispose(){
    if(this.mesh){
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.lod = -1;
  }
}
