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
//
//  Step 2 adds SKIRTS: a neighbouring tile at a different LOD samples height
//  at different points along the SAME shared edge, so the two edges don't
//  line up — a classic T-junction crack that would show sky/void through the
//  ground. Measured (not guessed) against this module's own height function,
//  17x17 tiles, every edge: the worst gap between a coarse (seg=4) tile's
//  straight edge and the true terrain height at points along it is ~48m. Each
//  tile's mesh therefore carries a vertical wall hanging down from its four
//  edges, well past that measured worst case, so a mismatched neighbour's
//  edge always finds opaque ground behind it instead of a gap.
// ============================================================

// Segment counts per LOD level. Index 0 = highest detail (closest tile),
// higher indices = coarser meshes. Tunable — Step 3 picks between these by
// distance-to-focus; Step 1's demo exercises all three so the technique is
// visibly proven before anything gets wired to a real aircraft position.
const TERRAIN_LOD_SEGMENTS = [64, 16, 4];

// Measured worst-case LOD-mismatch edge gap was ~48m (see header comment) —
// this is set well above that, not tightly fit to it, the same generous-
// margin approach the rest of this project uses for safety margins.
const TERRAIN_SKIRT_DEPTH = 120;

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
    const gridN = seg + 1;   // vertices per row/column — matches PlaneGeometry's own layout, verified against the r128 source (row-major, k = ix + gridN*iy)
    const geo = new THREE.PlaneGeometry(this.tileSize, this.tileSize, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = this.centerX, cz = this.centerZ;
    for(let i = 0; i < pos.count; i++){
      const wx = cx + pos.getX(i), wz = cz + pos.getZ(i);
      pos.setY(i, this.heightProvider.getHeight(wx, wz));
    }

    // ---- skirt: hang a wall down from each of the 4 edges, see file header ----
    const positions = Array.from(pos.array);          // grows with the appended skirt verts below
    const indices    = Array.from(geo.index.array);   // grows with the appended skirt tris below

    const edges = [
      { name:'south', top: Array.from({length:gridN}, (_,ix) => ix) },                          // iy=0
      { name:'north', top: Array.from({length:gridN}, (_,ix) => ix + gridN*seg) },               // iy=seg
      { name:'west',  top: Array.from({length:gridN}, (_,iy) => gridN*iy) },                     // ix=0
      { name:'east',  top: Array.from({length:gridN}, (_,iy) => seg + gridN*iy) },                // ix=seg
    ];
    for(const edge of edges){
      const bottom = [];
      for(const ti of edge.top){
        const tx = positions[ti*3], ty = positions[ti*3+1], tz = positions[ti*3+2];
        bottom.push(positions.length / 3);
        positions.push(tx, ty - TERRAIN_SKIRT_DEPTH, tz);
      }
      // Outward direction (local XZ, away from the tile centre) for this edge —
      // used only to pick the winding that makes the wall visible from outside.
      const midTop = edge.top[Math.floor(edge.top.length/2)];
      const outward = new THREE.Vector2(positions[midTop*3], positions[midTop*3+2]).normalize();
      for(let s = 0; s < seg; s++){
        const t0 = edge.top[s], t1 = edge.top[s+1], b0 = bottom[s], b1 = bottom[s+1];
        addSkirtQuad(indices, positions, t0, t1, b0, b1, outward);
      }
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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

// Appends one skirt quad (2 triangles) to indices, connecting top edge
// vertices t0/t1 (existing base-grid indices, reused — not duplicated, so the
// skirt's top rim is pixel-exact with the surface's own edge) to bottom
// vertices b0/b1 (freshly appended, lowered copies). `outward` is the local
// XZ direction this wall should face. Rather than deriving the correct
// winding by hand (an easy way to get a skirt that renders invisible from
// outside — see this project's own CLAUDE.md on winding/normal mistakes),
// each triangle's two possible windings are tried and whichever one actually
// produces a normal with positive dot(outward) is kept — self-checking
// instead of trusted-by-construction.
function addSkirtQuad(indices, positions, t0, t1, b0, b1, outward){
  addOutwardTri(indices, positions, t0, b0, t1, outward);
  addOutwardTri(indices, positions, t1, b0, b1, outward);
}
function addOutwardTri(indices, positions, a, b, c, outward2){
  const pa = [positions[a*3], positions[a*3+1], positions[a*3+2]];
  const pb = [positions[b*3], positions[b*3+1], positions[b*3+2]];
  const pc = [positions[c*3], positions[c*3+1], positions[c*3+2]];
  const e1 = [pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]];
  const e2 = [pc[0]-pa[0], pc[1]-pa[1], pc[2]-pa[2]];
  // cross(e1,e2) — normal for winding (a,b,c) as given
  const nx = e1[1]*e2[2]-e1[2]*e2[1];
  const nz = e1[0]*e2[1]-e1[1]*e2[0];
  const dot = nx*outward2.x + nz*outward2.y;   // only XZ matters, walls are vertical
  if(dot >= 0) indices.push(a, b, c);
  else indices.push(a, c, b);
}
