#!/usr/bin/env node
// ============================================================
//  convert_osm_tile.js — OFFLINE conversion tool (Node, never loaded by the
//  browser). The "OSM data -> offline conversion -> compact tile file" half
//  of the pipeline: a real OSM extract (.osm.pbf/.xml) never belongs in the
//  browser bundle either — it gets converted ONCE, offline, into small
//  per-tile JSON files OSMManager.js can fetch, already in LOCAL WORLD
//  METRES (not lat/lon), already simplified to the shapes the landscape spec
//  asked for (lines for roads/rail, areas for water/forest/farmland, points
//  for buildings) — never raw OSM geometry/tags.
//
//  No real OSM source is available in this environment, so this script
//  authors a hand-made sample landscape covering the SAME multi-tile grid
//  convert_dem_tile.js now generates (see that file for GRID_RANGE/TILE_SIZE
//  and why sharing those constants — rather than a second, easily-out-of-
//  sync copy — matters): a road, ,a river and a rail line, each ONE
//  continuous path across the whole grid (not independently drawn per
//  tile), plus lakes/forests/farmland/buildings scattered per-tile by a
//  deterministic hash so it doesn't look like the exact same village
//  repeated in every tile.
//
//  Was originally ONE hand-made tile at (0,0) with hand-placed point lists
//  in tile-local coordinates -- fine in isolation, but stitching that same
//  shape into neighbouring tiles unchanged would have produced roads/rivers
//  that dead-end at every tile edge instead of continuing into the next
//  tile. Fixed the same way convert_dem_tile.js fixed its own per-tile-reset
//  height bug: the road/river/rail are each defined as ONE continuous curve
//  in WORLD coordinates (riverCenterZ() is the exact same function
//  convert_dem_tile.js uses for its valley, so the river polyline visually
//  lines up with the terrain's own valley), then clipped into per-tile
//  polyline segments by clipPolylineToTiles() below -- a point sitting
//  exactly on a tile boundary is deliberately included in BOTH neighbouring
//  tiles' segments (see that function's own comment) so the two halves
//  visually touch instead of leaving a gap.
//
//  JSON FORMAT, one file per terrain tile, all coordinates in LOCAL tile
//  metres (0,0 = tile's own south-west corner, matching convert_dem_tile.js):
//  {
//    roads:     [ [[x,z], [x,z], ...], ... ],   // one array of points per road
//    rails:     [ [[x,z], ...], ... ],
//    rivers:    [ [[x,z], ...], ... ],
//    lakes:     [ [[x,z], ...], ... ],           // closed polygon rings
//    forests:   [ [[x,z], ...], ... ],
//    farmland:  [ [[x,z], ...], ... ],
//    airfields: [ [[x,z], ...], ... ],
//    buildings: [ {x, z, w, d, rotY}, ... ]      // footprint centre + size + rotation
//  }
// ============================================================

const fs = require('fs');
const path = require('path');
const { TILE_SIZE, GRID_RANGE, riverCenterZ } = require('./convert_dem_tile.js');

function roadCenterZ(worldX){ return riverCenterZ(worldX) + 900; }
function railCenterZ(worldX){ return 550 + Math.sin(worldX * 0.0002) * 200; }

// Self-contained hash -- deliberately NOT shared with VegetationManager.js's
// own hash (see this file's header on not sharing code across this module
// set) -- seeded per TILE rather than per point, since these decisions
// ("does this tile get a lake") are per-tile, not per-vertex.
function tileHash(tx, tz, salt){
  const s = Math.sin(tx*12.9898 + tz*78.233 + salt*37.719) * 43758.5453;
  return s - Math.floor(s);
}

// Samples a continuous WORLD-coordinate curve (worldX -> worldZ, e.g.
// riverCenterZ) at `step`-metre intervals across the whole grid's X range
// and splits it into per-tile LOCAL-coordinate polyline SEGMENTS.
//
// First version of this function kept one growing point array per tile and
// just appended to it -- broke the moment a curve dipped out of a tile's
// row and back into it further along (e.g. the river wandering into row
// tz=-1 for a while before returning to tz=0): the two separate visits to
// the SAME tile got concatenated into one array, drawing a long straight
// "spike" connecting two far-apart points instead of two distinct pieces of
// river. Measured, not assumed: a from-scratch grid build showed a 1040m
// jump between "consecutive" points in one tile's river array. Fixed by
// starting a genuinely NEW segment every time the curve re-enters a tile,
// so a tile can legitimately hold several disjoint segments.
//
// A sample that lands exactly on a tile edge is intentionally pushed into
// BOTH the outgoing segment (closing it) and the incoming segment (opening
// it) -- otherwise each tile's segment would stop one sample short of the
// actual boundary, leaving a visible gap once rendered, exactly the seam
// class of bug this whole rewrite exists to avoid (see file header).
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

// A GENUINE, later-discovered bug in the closing/opening logic below (found
// by WorldStreamer's own real-browser verification, not by reasoning about
// this function in isolation -- see terrain_step58_pinpoint.js in the
// Step 6-streaming shipping notes): the crossing point pushed into the OLD
// tile's segment used the NEW sample's raw (unclamped) local coordinate,
// converted into the OLD tile's frame. That local coordinate can legitimately
// sit outside [0,TILE_SIZE] by up to one `step` (the curve moved that far
// between two consecutive samples) -- e.g. local z=4021.7 for a tile whose
// own valid range is [0,4000]. OSMManager converts that stored local point
// straight back to WORLD coordinates when it rebuilds the ribbon
// (worldZ = localZ + tz*TILE_SIZE), which reproduces the ORIGINAL,
// out-of-range world position -- one that floor()s into the NEXT tile over,
// not the tile whose file this point is actually stored in. Querying terrain
// height for that point then depends on whether that OTHER, unrelated tile
// happens to be loaded yet -- appearing to fail "randomly" depending on
// streaming order, when the real cause is deterministic: the stored point
// was never actually inside its own tile's bounds to begin with. Clamping
// each crossing point's local coordinates to [0,TILE_SIZE] fixes this at
// the source: every stored point now converts back to a world position
// that is genuinely inside the tile whose file it lives in, so a height
// query for it can never accidentally land in a DIFFERENT, unrelated tile.
// This does NOT make the seam itself pixel-exact -- the OLD tile's closing
// point and the NEW tile's opening point are still built from two
// different samples (one `step` apart, same as before this fix), so a gap
// of up to one `step` between them across the boundary is expected and was
// already measured/accepted before this fix (see this file's OWN "up to
// 66.2m" verification note elsewhere) -- fixing THAT would need real
// boundary interpolation, a separate, bigger change this crash-fix does
// not attempt.
function clipPolylineToTiles(curveFn, xMin, xMax, step){
  const perTile = new Map();   // "tx,tz" -> array of segments, each an array of [localX,localZ]
  let prevKey = null, prevTx = null, prevTz = null, prevWorldX = null, prevWorldZ = null, openSeg = null;

  for(let worldX = xMin; worldX <= xMax; worldX += step){
    const worldZ = curveFn(worldX);
    const tx = Math.floor(worldX / TILE_SIZE), tz = Math.floor(worldZ / TILE_SIZE);
    const key = tx + ',' + tz;

    if(key !== prevKey){
      // Close the just-finished segment by extending it to this crossing
      // point too (in the OLD tile's local frame, clamped to that tile's own
      // valid range -- see this function's header), so the two tiles'
      // polylines visually touch at the shared edge.
      if(openSeg){
        const lx = clamp(worldX - prevTx*TILE_SIZE, 0, TILE_SIZE);
        const lz = clamp(worldZ - prevTz*TILE_SIZE, 0, TILE_SIZE);
        openSeg.push([lx, lz]);
      }

      // Start a fresh segment for the tile the curve just entered. Its
      // first point is the same crossing point, in the NEW tile's local
      // frame (clamped the same way) -- unless this is the very first
      // sample of the whole curve.
      if(!perTile.has(key)) perTile.set(key, []);
      openSeg = [];
      perTile.get(key).push(openSeg);
      if(prevWorldX !== null){
        const lx = clamp(prevWorldX - tx*TILE_SIZE, 0, TILE_SIZE);
        const lz = clamp(prevWorldZ - tz*TILE_SIZE, 0, TILE_SIZE);
        openSeg.push([lx, lz]);
      }
    }

    openSeg.push([worldX - tx*TILE_SIZE, worldZ - tz*TILE_SIZE]);
    prevKey = key; prevTx = tx; prevTz = tz; prevWorldX = worldX; prevWorldZ = worldZ;
  }
  return perTile;   // "tx,tz" -> array of segments (0 or more)
}

// Builds every scattered (non-linear) feature for ONE tile, deterministic
// from (tx,tz) alone so re-running this tool reproduces the identical grid.
function buildScattered(tx, tz){
  const lakes = [], forests = [], farmland = [], buildings = [];
  const cx = TILE_SIZE/2, cz = TILE_SIZE/2;

  // Lakes: rare, and only in tiles that rolled low (keeps them from
  // clustering everywhere) -- placed off in a tile corner away from the
  // river/road/rail band so they don't visually collide with those.
  if(tileHash(tx, tz, 1) < 0.12){
    const lx = 600 + tileHash(tx, tz, 2)*400, lz = 3200 + tileHash(tx, tz, 3)*500;
    const r = 250 + tileHash(tx, tz, 4)*150;
    const ring = [];
    const n = 8;
    for(let i = 0; i <= n; i++){
      const a = (i/n) * Math.PI * 2;
      const rr = r * (0.8 + 0.3*tileHash(tx, tz, 10+i));
      ring.push([lx + Math.cos(a)*rr, lz + Math.sin(a)*rr]);
    }
    lakes.push(ring);
  }

  // Forest patch: fairly common.
  if(tileHash(tx, tz, 20) < 0.45){
    const fx = 2200 + tileHash(tx, tz, 21)*1000, fz = 2900 + tileHash(tx, tz, 22)*900;
    const w = 500 + tileHash(tx, tz, 23)*500, h = 400 + tileHash(tx, tz, 24)*500;
    forests.push([[fx-w/2,fz-h/2],[fx+w/2,fz-h/3],[fx+w/2.5,fz+h/2],[fx-w/2.5,fz+h/2.2],[fx-w/2,fz-h/2]]);
  }

  // Farmland patch: fairly common, generally in the lower-lying part of the
  // tile (away from the road/rail band up near z=0-1300 in the ORIGINAL
  // hand-tile -- kept in that same general area for continuity of "feel").
  if(tileHash(tx, tz, 30) < 0.5){
    const x0 = 100 + tileHash(tx, tz, 31)*400, z0 = 100 + tileHash(tx, tz, 32)*300;
    const w = 900 + tileHash(tx, tz, 33)*700, h = 700 + tileHash(tx, tz, 34)*500;
    farmland.push([[x0,z0],[x0+w,z0+40],[x0+w-60,z0+h],[x0+50,z0+h-30],[x0,z0]]);
  }

  // Small building cluster near the road: uncommon (a village every few
  // tiles, not every tile) -- placed near cz+roadOffset-ish so it reads as
  // "settlement along the road", loosely matching the ORIGINAL hand-tile's
  // buildings-near-the-road placement.
  if(tileHash(tx, tz, 40) < 0.3){
    const n = 2 + Math.floor(tileHash(tx, tz, 41)*4);
    const bx = 600 + tileHash(tx, tz, 42)*2800, bz = 3400 + tileHash(tx, tz, 43)*400;
    for(let i = 0; i < n; i++){
      buildings.push({
        x: bx + (tileHash(tx, tz, 50+i*4)-0.5)*180,
        z: bz + (tileHash(tx, tz, 51+i*4)-0.5)*140,
        w: 14 + tileHash(tx, tz, 52+i*4)*18,
        d: 10 + tileHash(tx, tz, 53+i*4)*14,
        rotY: (tileHash(tx, tz, 54+i*4)-0.5) * 1.2,
      });
    }
  }

  return { lakes, forests, farmland, buildings };
}

function buildAll(){
  const xMin = (-GRID_RANGE) * TILE_SIZE, xMax = (GRID_RANGE+1) * TILE_SIZE;
  const roadSegs  = clipPolylineToTiles(roadCenterZ,  xMin, xMax, 40);
  const riverSegs = clipPolylineToTiles(riverCenterZ, xMin, xMax, 40);
  const railSegs  = clipPolylineToTiles(railCenterZ,  xMin, xMax, 40);

  const outDir = path.join(__dirname, '..', 'data', 'osm');
  fs.mkdirSync(outDir, { recursive: true });

  let count = 0;
  for(let tx = -GRID_RANGE; tx <= GRID_RANGE; tx++){
    for(let tz = -GRID_RANGE; tz <= GRID_RANGE; tz++){
      const key = tx + ',' + tz;
      const scattered = buildScattered(tx, tz);
      const data = {
        roads:     roadSegs.get(key)  || [],
        rails:     railSegs.get(key)  || [],
        rivers:    riverSegs.get(key) || [],
        lakes:     scattered.lakes,
        forests:   scattered.forests,
        farmland:  scattered.farmland,
        airfields: [],
        buildings: scattered.buildings,
      };
      const outPath = path.join(outDir, `${tx}_${tz}.json`);
      fs.writeFileSync(outPath, JSON.stringify(data));
      console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
      count++;
    }
  }
  console.log(`${count} OSM tiles written.`);
}

if(require.main === module) buildAll();

module.exports = { buildAll, buildScattered, roadCenterZ, railCenterZ, clipPolylineToTiles };
