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

// Step 6 stub. Documents the intended shape of the real data path so
// TerrainTile/TerrainManager can already be written against a stable interface:
// a real DEM tile is a small binary heightmap (e.g. a Float32Array laid out
// row-major, north-to-south, west-to-east) plus a header giving its world-space
// origin and metres-per-sample. This class will fetch/parse that once per tile
// and answer getHeight() by bilinearly sampling the grid — same one-method
// contract as ProceduralHeightProvider above, so nothing else in this module
// set needs to change when this stub gets filled in.
class DEMHeightProvider {
  constructor(/* tileUrl, originX, originZ, metresPerSample */){
    throw new Error('DEMHeightProvider is a Step 6 stub, not implemented yet — use ProceduralHeightProvider for now.');
  }
  getHeight(worldX, worldZ){ return 0; }
}
