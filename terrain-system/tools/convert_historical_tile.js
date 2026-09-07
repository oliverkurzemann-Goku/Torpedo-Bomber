#!/usr/bin/env node
// ============================================================
//  convert_historical_tile.js — OFFLINE conversion tool (Node, never loaded
//  by the browser). The historical/WW2 layer is DELIBERATELY SEPARATE from
//  the real-world OSM layer (tools/convert_osm_tile.js) per the landscape
//  spec: a bridge or airfield's WARTIME role (a mission target, a defended
//  position) is not something OpenStreetMap knows about, so it never belongs
//  mixed into that data — it is its own file, its own manager
//  (HistoricalObjectManager.js), addable on top of whatever base layer
//  (procedural OR real DEM/OSM) happens to be running, or left off entirely
//  with zero effect on either of those (verified in
//  terrain_step8_independence.js — see that test for how).
//
//  No real orders-of-battle/target-list source is available in this
//  environment, so — same as convert_osm_tile.js — this authors hand-made
//  sample entries: an airfield, flak positions, a factory, and a bridge.
//
//  Was originally ONE tile at (0,0), holding everything, with the bridge's
//  span HAND-FIT to that one tile's own hand-placed river points ("river
//  passes near x=2900-3200 for z~1900-2900" per the old comment). That fit
//  is meaningless now that convert_dem_tile.js/convert_osm_tile.js generate
//  a whole grid with the river as ONE continuous curve (riverCenterZ) --
//  spread across a FEW of that grid's tiles instead (most tiles, same as
//  real mission-target density, have no historical file at all), and the
//  bridge is computed FROM riverCenterZ() at its chosen tile's own world
//  position rather than a second, easily-out-of-sync hand guess.
//
//  JSON FORMAT, one file per terrain tile, local tile metres:
//  {
//    airfields: [ {x, z, rotY, length, width} ],
//    flak:      [ {x, z} ],
//    factories: [ {x, z, rotY} ],
//    bridges:   [ {x1, z1, x2, z2, width} ],   // spans between two points (e.g. across a river)
//    ports:     [ {x, z, rotY, length} ],
//  }
// ============================================================

const fs = require('fs');
const path = require('path');
const { TILE_SIZE } = require('./convert_dem_tile.js');
const { roadCenterZ, railCenterZ } = require('./convert_osm_tile.js');
const { riverCenterZ } = require('./convert_dem_tile.js');

function buildTile(tx, tz, data){
  const outDir = path.join(__dirname, '..', 'data', 'historical');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${tx}_${tz}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
  return outPath;
}

// ---- Airfield: tile (-2,1), away from the river/road/rail band (all three
// sit at world Z roughly 0-2000 across the grid; this tile's south end is
// clear of that) -- a real airfield is sited on flat, uncluttered ground. ----
buildTile(-2, 1, {
  airfields: [ { x: 1600, z: 3200, rotY: 0.15, length: 900, width: 40 } ],
  flak: [], factories: [], bridges: [], ports: [],
});

// ---- Flak + factory: both in tile (-1,0) -- a guarded factory reads fine
// narratively, and (-1,0) is independently confirmed (checked directly
// against the generated OSM data, not re-guessed) to be the tile with both
// the longest ROAD segment AND the longest, most stable RAIL segment across
// the whole grid, so both placements land verifiably in-bounds.
//
// First attempt hand-picked tiles/world-X points without checking the
// curves' actual ranges there and found two real, structurally identical
// bugs this way: flak in tile (0,0) with sample points 1500m apart put one
// position at local z=4858 (road curve moves enough over that span to
// leave the tile's own 0-4000 Z range entirely); factory in tile (1,-1)
// landed at local z=4478 the same way. Fixed by picking a tile+points pair
// where the curve's range was actually measured first, not assumed. ----
{
  const tx = -1, tz = 0;
  const wx1 = -3500, wx2 = -1000;   // flak sample points, 2500m apart, well inside this tile
  const wxFactory = -2000;
  buildTile(tx, tz, {
    airfields: [],
    flak: [
      { x: wx1 - tx*TILE_SIZE, z: roadCenterZ(wx1) - tz*TILE_SIZE - 60 },
      { x: wx2 - tx*TILE_SIZE, z: roadCenterZ(wx2) - tz*TILE_SIZE + 80 },
    ],
    factories: [ { x: wxFactory - tx*TILE_SIZE, z: railCenterZ(wxFactory) - tz*TILE_SIZE - 250, rotY: -0.1 } ],
    bridges: [], ports: [],
  });
}

// ---- Bridge: tile (0,0), spanning the river at the point it actually
// crosses this tile (computed from riverCenterZ, replacing the old
// hand-fit numbers -- see file header). Span runs perpendicular-ish to the
// river's local direction, matching the original's own "crosses the
// river" framing.
//
// First attempt used tile (0,1) at wx=2000 -- assumed, not checked, that
// the river would still be somewhere inside a NEIGHBOURING tz row. Measured
// riverCenterZ() across the whole grid's X range instead of guessing: the
// river's world Z only ever runs -73.8..4073.8, i.e. it never leaves tz=0
// AT ALL, for any tx in this grid. Tile (0,1) has no river in it to bridge
// -- the -428 out-of-bounds Z wasn't a wrong offset, it was the whole
// premise (wrong tile) being wrong. Picked wx=300 in tile (0,0) instead:
// checked over the tile's safely-inside-the-edges X range (300..3700, a
// 300m margin from both x=0/x=4000) for the point closest to the tile's
// Z mid-line, landing on local (300, 2392.6) -- 2392.6m from the z=0 edge
// and 1607.4m from z=4000, comfortably clear of the +-250 span and the
// bridge deck's own width in every direction. ----
{
  const tx = 0, tz = 0;
  const wx = 300;
  const riverLocalZ = riverCenterZ(wx) - tz*TILE_SIZE;
  buildTile(tx, tz, {
    airfields: [], flak: [], factories: [],
    bridges: [ { x1: wx - 70, z1: riverLocalZ - 250, x2: wx + 70, z2: riverLocalZ + 250, width: 14 } ],
    ports: [],
  });
}

console.log('3 historical tiles written (of the 25-tile grid) -- the rest deliberately have none.');
