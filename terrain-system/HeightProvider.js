// ============================================================
//  HeightProvider — pluggable height-data source for terrain tiles.
//
//  Everything above this file (TerrainTile, TerrainManager) only ever asks a
//  provider "what is the ground height in metres at this world position", via
//  getHeight(worldX, worldZ). That is the entire contract. Swapping procedural
//  noise for real DEM data later (Step 6) means writing a new class that
//  implements this one method — nothing in TerrainTile/TerrainManager changes.
//
//  Coordinate convention for this whole module: 1 Three.js world unit = 1 metre,
//  X/Z are horizontal, Y is height — matching thunderbolt-europe.html's own
//  convention, so the eventual integration (Step 4+) is a drop-in, not a
//  coordinate-system rewrite.
//
//  This file has zero dependency on thunderbolt-europe.html or torpedo-carrier.html
//  and does not read or write anything from them. It only needs THREE to be loaded
//  as a global, for THREE.Vector3 usage elsewhere in this module set — this file
//  itself does not even need that much.
// ============================================================

class ProceduralHeightProvider {
  constructor(seed = 1){
    this.seed = seed;
  }

  // Self-contained coherent value noise (deliberately NOT shared with
  // thunderbolt-europe.html's own nHash/nNoise/nFbm — this module must work
  // standalone, see file header).
  _hash(x, z){
    const s = Math.sin(x * 127.1 + z * 311.7 + this.seed * 74.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  _noise(x, z){
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = this._hash(xi, zi),     b = this._hash(xi + 1, zi);
    const c = this._hash(xi, zi + 1), d = this._hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // Octave frequencies step up by an irrational factor (2.03, not 2.0) so the
  // octaves never lock into a shared period — the same safeguard
  // thunderbolt-europe.html's own terrain noise uses (see its CLAUDE.md 4.32),
  // independently reimplemented here rather than shared (see file header).
  _fbm(x, z, octaves, lacunarity = 2.03, gain = 0.5){
    let sum = 0, amp = 0.5, freq = 1;
    for(let i = 0; i < octaves; i++){
      sum += this._noise(x * freq, z * freq) * amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum;
  }

  // Rolling hill-country shape: a broad, slow base rise plus ridged detail on
  // top. This is a Step-1 PLACEHOLDER shape (there is no real terrain data yet)
  // — its only job is to prove the tile/LOD machinery works with real height
  // variation, not to look like a specific real place.
  getHeight(worldX, worldZ){
    const base   = this._fbm(worldX * 0.00015, worldZ * 0.00015, 5) * 260;
    const ridgeN = this._fbm(worldX * 0.0007,  worldZ * 0.0007,  4);
    const ridge  = (1 - Math.abs(ridgeN * 2 - 1)) * 90;
    const detail = this._fbm(worldX * 0.004,   worldZ * 0.004,   3) * 18;
    return Math.max(0, base + ridge + detail);
  }
}

// Step 6: real, working implementation — reads the binary tile format
// tools/convert_dem_tile.js produces (see that file's own header for the
// exact byte layout). Fetching is asynchronous (a real DEM tile is a network
// request), but getHeight(worldX,worldZ) itself stays SYNCHRONOUS — the same
// one-method contract as ProceduralHeightProvider — by requiring the tile to
// already be loaded via loadTile() first. That split is deliberate and
// honestly incomplete on purpose: TerrainTile._buildGeometry() calls
// getHeight() synchronously inside a per-vertex loop, and making THAT async
// (so a coarse LOD tile can appear the instant its DEM data lands, mid-frame)
// is real surgery to the Step 1-4 streaming/LOD/morph system this class
// intentionally does not attempt yet — the loader/parser/format is proven
// end to end (see demo-dem-osm.html), the "swap it in for
// ProceduralHeightProvider on every tile automatically" integration is next.
class DEMHeightProvider {
  constructor(tileSize, baseUrl = 'data/dem/'){
    this.tileSize = tileSize;
    this.baseUrl = baseUrl;
    this.tiles = new Map();   // "tx,tz" -> {gridSize, metresPerSample, heights: Float32Array}
  }

  _key(tx, tz){ return tx + ',' + tz; }

  // Fetches and parses one DEM tile. Must be awaited before getHeight() is
  // called for any point inside that tile. Safe to call repeatedly for the
  // same tile (returns the cached tile after the first successful load).
  async loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return this.tiles.get(key);

    const res = await fetch(`${this.baseUrl}${tx}_${tz}.bin`);
    if(!res.ok) throw new Error(`DEMHeightProvider: failed to fetch tile ${key} (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    const view = new DataView(buf);

    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if(magic !== 'DEM1') throw new Error(`DEMHeightProvider: tile ${key} has bad magic "${magic}", expected "DEM1"`);
    const gridSize = view.getUint16(4, true);
    const metresPerSample = view.getFloat32(6, true);
    const expectedBytes = 16 + gridSize * gridSize * 4;
    if(buf.byteLength !== expectedBytes){
      throw new Error(`DEMHeightProvider: tile ${key} is ${buf.byteLength} bytes, expected ${expectedBytes} for a ${gridSize}x${gridSize} grid`);
    }
    const heights = new Float32Array(buf.slice(16));

    const tile = { gridSize, metresPerSample, heights };
    this.tiles.set(key, tile);
    return tile;
  }

  hasTile(tx, tz){ return this.tiles.has(this._key(tx, tz)); }

  // Synchronous, bilinear — throws (loudly, not a silent wrong answer) if
  // the covering tile hasn't been loadTile()'d yet, rather than guessing 0.
  getHeight(worldX, worldZ){
    // A point sitting EXACTLY on a tile boundary floor()s into whichever
    // tile happens to START there — and a tile's own base grid legitimately
    // samples its own far edge at exactly tileOrigin+tileSize (TerrainTile.js's
    // PlaneGeometry includes both endpoints), which is just as much the
    // PREVIOUS tile's edge too. Each axis needs this checked independently:
    // a vertex can sit on its tile's far edge in x while sitting on its
    // NEAR edge in z at the very same time (worldZ=0 needs no adjustment,
    // even though worldX=tileOrigin+tileSize does) — a single shared
    // "shift both axes together" fallback gets that combination wrong, so
    // each axis gets its own small candidate list, tried in every
    // combination, primary (no shift) first.
    let tile = null, tx, tz;
    outer:
    for(const cx of tileAxisCandidates(worldX, this.tileSize)){
      for(const cz of tileAxisCandidates(worldZ, this.tileSize)){
        const t = this.tiles.get(this._key(cx, cz));
        if(t){ tile = t; tx = cx; tz = cz; break outer; }
      }
    }
    if(!tile){
      const pTx = Math.floor(worldX/this.tileSize), pTz = Math.floor(worldZ/this.tileSize);
      throw new Error(`DEMHeightProvider: no DEM data loaded for tile (${pTx},${pTz}) — call loadTile(${pTx},${pTz}) first`);
    }

    const localX = worldX - tx * this.tileSize, localZ = worldZ - tz * this.tileSize;
    const { gridSize, metresPerSample, heights } = tile;
    const fx = Math.min(gridSize - 1.0001, Math.max(0, localX / metresPerSample));
    const fz = Math.min(gridSize - 1.0001, Math.max(0, localZ / metresPerSample));
    const ix0 = Math.floor(fx), iz0 = Math.floor(fz);
    const tX = fx - ix0, tZ = fz - iz0;
    const h00 = heights[ix0   + gridSize*iz0];
    const h10 = heights[ix0+1 + gridSize*iz0];
    const h01 = heights[ix0   + gridSize*(iz0+1)];
    const h11 = heights[ix0+1 + gridSize*(iz0+1)];
    const h0 = h00 + (h10-h00)*tX;
    const h1 = h01 + (h11-h01)*tX;
    return h0 + (h1-h0)*tZ;
  }
}

// Which tile INDEX (along one axis) a coordinate could belong to: normally
// just floor(coord/tileSize), plus the PREVIOUS index too when coord sits
// right on that tile's own lower edge (remainder ~0) — the same point is
// then also that previous tile's upper edge. Order matters: primary first,
// so an interior point (the overwhelmingly common case) never even looks at
// the fallback.
function tileAxisCandidates(coord, tileSize){
  const primary = Math.floor(coord / tileSize);
  const remainder = coord - primary * tileSize;
  return remainder < 1e-6 ? [primary, primary - 1] : [primary];
}
