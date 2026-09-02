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
//  Step 2 added SKIRTS: a neighbouring tile at a different LOD samples height
//  at different points along the SAME shared edge, so the two edges don't
//  line up — a classic T-junction crack that would show sky/void through the
//  ground. Measured (not guessed) against this module's own height function,
//  17x17 tiles, every edge: the worst gap between a coarse (seg=4) tile's
//  straight edge and the true terrain height at points along it is ~48m. Each
//  tile's mesh therefore carries a vertical wall hanging down from its four
//  edges, well past that measured worst case, so a mismatched neighbour's
//  edge always finds opaque ground behind it instead of a gap.
//
//  Step 3 adds GEOMORPHING: that same ~48m figure is also exactly how far a
//  tile's OWN surface can jump in a single frame when ITS OWN LOD changes
//  (e.g. the aircraft crosses a distance threshold) — an instant geometry
//  swap would show as a visible "pop". TERRAIN_LOD_SEGMENTS is deliberately a
//  4x-per-step progression (64, 16, 4), so every coarser grid's vertices are
//  an EXACT subset of every finer grid's vertices at the same tile (same
//  world positions, not just similar) — instead of swapping geometry
//  instantly, a tile blends per-vertex height from where it is now toward
//  the new LOD's height over TERRAIN_MORPH_DURATION seconds. Upgrading
//  (going finer) fades newly-appearing detail in from what the coarser mesh
//  already implied there (bilinear across the coarse quad); downgrading
//  fades it back out the same way before the actual vertex-count swap
//  happens — by then every point already sits exactly on the coarser
//  target's plane, so the swap itself is invisible.
// ============================================================

const TERRAIN_LOD_SEGMENTS = [64, 16, 4];

// Measured worst-case LOD-mismatch edge gap was ~48m (see header comment) —
// this is set well above that, not tightly fit to it, the same generous-
// margin approach the rest of this project uses for safety margins.
const TERRAIN_SKIRT_DEPTH = 120;

// How long a tile takes to blend from its old height to its new LOD's height.
const TERRAIN_MORPH_DURATION = 0.6;

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
    this.lod = -1;             // -1 = not built yet. The LOGICAL/target lod —
                                // updates immediately when a morph starts, even
                                // before the visual blend finishes.
    this.mesh = null;
    this._renderSeg = -1;      // segment count of whatever geometry is actually live right now
    this._material = null;
    this.morphing = false;
    this.morphT = 0;
    this._morphFromMain = null;
    this._morphToMain = null;
    this._skirtTopOf = null;   // per skirt vertex: which main-surface vertex index it hangs from
    this._pendingFinalLod = null;
  }

  get centerX(){ return this.worldOriginX + this.tileSize / 2; }
  get centerZ(){ return this.worldOriginZ + this.tileSize / 2; }

  // Requests a LOD. Safe to call every frame with the same value (no-op once
  // that target is already active or being morphed toward). A change starts
  // a geomorph rather than an instant swap — call updateMorph(dt) afterwards
  // (TerrainManager.updateLOD does this) to actually advance it.
  setLOD(lodIndex, material){
    lodIndex = Math.max(0, Math.min(TERRAIN_LOD_SEGMENTS.length - 1, lodIndex));
    if(lodIndex === this.lod) return this.mesh;

    this._material = material;
    const targetSeg = TERRAIN_LOD_SEGMENTS[lodIndex];

    if(!this.mesh){
      // First build ever: nothing to blend from.
      this._buildGeometry(targetSeg, targetSeg, null, material);
      this.lod = lodIndex;
      this._renderSeg = targetSeg;
      return this.mesh;
    }

    const currentSeg = this._renderSeg;
    const renderSeg = Math.max(targetSeg, currentSeg);
    const upgrade = targetSeg > currentSeg;

    this._buildGeometry(renderSeg, targetSeg, { fromSeg: currentSeg, upgrade }, material);
    this.lod = lodIndex;
    this._renderSeg = renderSeg;
    // A downgrade renders at the still-finer currentSeg during the blend; once
    // it finishes we still owe the actual swap down to the smaller target mesh.
    this._pendingFinalLod = (renderSeg === targetSeg) ? null : lodIndex;
    return this.mesh;
  }

  // Advances an in-progress geomorph by dt seconds. No-op if not morphing.
  updateMorph(dt){
    if(!this.morphing) return;
    this.morphT = Math.min(1, this.morphT + dt / TERRAIN_MORPH_DURATION);
    const pos = this.mesh.geometry.attributes.position;
    const n = this._morphFromMain.length;
    for(let i = 0; i < n; i++){
      pos.setY(i, this._morphFromMain[i] + (this._morphToMain[i] - this._morphFromMain[i]) * this.morphT);
    }
    for(let s = 0; s < this._skirtTopOf.length; s++){
      const skirtIdx = n + s;
      pos.setY(skirtIdx, pos.getY(this._skirtTopOf[s]) - TERRAIN_SKIRT_DEPTH);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();

    if(this.morphT >= 1){
      this.morphing = false;
      if(this._pendingFinalLod != null){
        const finalLod = this._pendingFinalLod;
        this._pendingFinalLod = null;
        const finalSeg = TERRAIN_LOD_SEGMENTS[finalLod];
        // Instant, but safe: every vertex the smaller mesh needs already sits
        // exactly on this plane (that's what the blend just finished doing).
        this._buildGeometry(finalSeg, finalSeg, null, this._material);
        this._renderSeg = finalSeg;
      }
    }
  }

  // Builds this tile's mesh at `renderSeg` resolution. If `morphSpec` is set
  // ({fromSeg, upgrade}), the mesh starts at the blend's FROM state (not the
  // final target) and records morphFrom/morphTo arrays for updateMorph() to
  // animate; `targetSeg` is only used to compute the downgrade's coarse
  // target heights (renderSeg === targetSeg already in the upgrade case).
  _buildGeometry(renderSeg, targetSeg, morphSpec, material){
    const gridN = renderSeg + 1;   // vertices per row/column — matches PlaneGeometry's own layout, verified against the r128 source (row-major, k = ix + gridN*iy)
    const geo = new THREE.PlaneGeometry(this.tileSize, this.tileSize, renderSeg, renderSeg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = this.centerX, cz = this.centerZ;
    const mainCount = pos.count;

    for(let i = 0; i < mainCount; i++){
      const wx = cx + pos.getX(i), wz = cz + pos.getZ(i);
      pos.setY(i, this.heightProvider.getHeight(wx, wz));
    }

    let morphFromMain = null, morphToMain = null;
    if(morphSpec){
      morphFromMain = new Float32Array(mainCount);
      morphToMain = new Float32Array(mainCount);
      const oldPos = this.mesh.geometry.attributes.position;   // whatever is live right now
      const ratio = morphSpec.upgrade ? renderSeg / morphSpec.fromSeg : 1;
      const oldGridN = morphSpec.upgrade ? morphSpec.fromSeg + 1 : 0;

      for(let iy = 0; iy < gridN; iy++){
        for(let ix = 0; ix < gridN; ix++){
          const i = ix + gridN * iy;
          const localX = pos.getX(i), localZ = pos.getZ(i);
          if(morphSpec.upgrade){
            morphToMain[i] = pos.getY(i);   // true height, already sampled above
            if(ix % ratio === 0 && iy % ratio === 0){
              const oldIdx = (ix / ratio) + oldGridN * (iy / ratio);
              morphFromMain[i] = oldPos.getY(oldIdx);   // exact carry-over — this vertex already existed
            } else {
              morphFromMain[i] = coarseInterpHeight(this.heightProvider, this.tileSize, cx, cz, morphSpec.fromSeg, localX, localZ);
            }
          } else {
            // Downgrade: renderSeg === currentSeg, so the live buffer lines up 1:1.
            morphFromMain[i] = oldPos.getY(i);
            morphToMain[i] = coarseInterpHeight(this.heightProvider, this.tileSize, cx, cz, targetSeg, localX, localZ);
          }
          pos.setY(i, morphFromMain[i]);   // start the visible mesh at the FROM state
        }
      }
    }

    // ---- skirt: hang a wall down from each of the 4 edges, see file header ----
    const positions = Array.from(pos.array);
    const indices    = Array.from(geo.index.array);
    const skirtTopOf = [];

    const edges = [
      { top: Array.from({length:gridN}, (_,ix) => ix) },                          // south, iy=0
      { top: Array.from({length:gridN}, (_,ix) => ix + gridN*renderSeg) },        // north, iy=seg
      { top: Array.from({length:gridN}, (_,iy) => gridN*iy) },                    // west,  ix=0
      { top: Array.from({length:gridN}, (_,iy) => renderSeg + gridN*iy) },        // east,  ix=seg
    ];
    for(const edge of edges){
      const bottom = [];
      for(const ti of edge.top){
        const tx = positions[ti*3], ty = positions[ti*3+1], tz = positions[ti*3+2];
        bottom.push(positions.length / 3);
        skirtTopOf.push(ti);
        positions.push(tx, ty - TERRAIN_SKIRT_DEPTH, tz);
      }
      const midTop = edge.top[Math.floor(edge.top.length/2)];
      const outward = new THREE.Vector2(positions[midTop*3], positions[midTop*3+2]).normalize();
      for(let s = 0; s < renderSeg; s++){
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
    if(this.mesh.material !== material) this.mesh.material = material;

    this.morphing = !!morphSpec;
    this.morphT = 0;
    this._morphFromMain = morphFromMain;
    this._morphToMain = morphToMain;
    this._skirtTopOf = skirtTopOf;
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
    this._renderSeg = -1;
    this.morphing = false;
  }
}

// What a COARSER grid (given segment count) would show at a LOCAL (x,z) point
// via its own flat bilinear interpolation across the quad containing that
// point — i.e. "what the eye currently sees there" on a tile still built at
// that coarser resolution. Used both to fade newly-appearing detail IN
// (upgrade) and to fade it back OUT before a downgrade's actual vertex-count
// swap (see file header). Exact at the coarser grid's own vertex positions
// (bilinear interpolation at t=0 returns the corner value exactly), which is
// what makes the eventual instant swap after a completed downgrade invisible.
function coarseInterpHeight(heightProvider, tileSize, cx, cz, coarseSeg, localX, localZ){
  const half = tileSize / 2;
  const segLen = tileSize / coarseSeg;
  const fx = (localX + half) / segLen, fz = (localZ + half) / segLen;
  const ix0 = Math.min(coarseSeg - 1, Math.max(0, Math.floor(fx)));
  const iz0 = Math.min(coarseSeg - 1, Math.max(0, Math.floor(fz)));
  const tx = fx - ix0, tz = fz - iz0;
  const wx = i => cx - half + i * segLen;
  const wz = i => cz - half + i * segLen;
  const h00 = heightProvider.getHeight(wx(ix0),   wz(iz0));
  const h10 = heightProvider.getHeight(wx(ix0+1), wz(iz0));
  const h01 = heightProvider.getHeight(wx(ix0),   wz(iz0+1));
  const h11 = heightProvider.getHeight(wx(ix0+1), wz(iz0+1));
  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;
  return h0 + (h1 - h0) * tz;
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
  const nx = e1[1]*e2[2]-e1[2]*e2[1];
  const nz = e1[0]*e2[1]-e1[1]*e2[0];
  const dot = nx*outward2.x + nz*outward2.y;
  if(dot >= 0) indices.push(a, b, c);
  else indices.push(a, c, b);
}
