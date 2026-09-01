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
//  authors ONE small, clearly hand-made sample tile: a short road, a lake,
//  a forest patch, a farmland patch, and a handful of buildings, tagged
//  exactly the way a real converter would classify real OSM tags:
//    highway=*              -> roads   (polyline)
//    railway=*              -> rails   (polyline)
//    waterway=*             -> rivers  (polyline)
//    natural=water          -> lakes   (polygon)
//    natural=wood / landuse=forest -> forests (polygon, trees scattered inside)
//    landuse=farmland       -> farmland (polygon, tinted)
//    building=*             -> buildings (point + footprint size + rotation)
//    aeroway=aerodrome      -> airfields (polygon)
//  Swapping in a real OSM parser later means replacing the hand-authored
//  arrays below with real tag-filtered, coordinate-projected geometry from
//  an actual .osm.pbf; the JSON SHAPE, and everything downstream that reads
//  it, does not change.
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

const TILE_SIZE = 4000;

function buildTile(tx, tz){
  const data = {
    roads: [
      [[200, 3800], [900, 3400], [1800, 3100], [2600, 2950], [3900, 2900]],
    ],
    rails: [
      // kept strictly inside (0,tileSize) on every axis, not touching the
      // boundary -- a point exactly AT x=tileSize resolves (floor(x/tileSize))
      // to the NEXT tile over, which this single-sample-tile prototype never
      // loads, and DEMHeightProvider.getHeight() throws rather than silently
      // guessing for an unloaded tile (see HeightProvider.js) -- so this
      // stays a data authoring rule, not something the loader needs to hide.
      [[20, 500], [1200, 650], [2400, 500], [3980, 700]],
    ],
    rivers: [
      [[3200, 20], [3050, 900], [2900, 1900], [3100, 2900], [3400, 3980]],
    ],
    lakes: [
      [[600, 1600], [1100, 1500], [1300, 1900], [1050, 2300], [550, 2200], [400, 1850], [600, 1600]],
    ],
    forests: [
      [[2200, 3200], [3100, 3300], [3300, 3900], [2400, 3950], [2000, 3600], [2200, 3200]],
    ],
    farmland: [
      [[100, 100], [1600, 150], [1700, 1300], [200, 1200], [100, 100]],
    ],
    airfields: [],
    buildings: [
      { x: 750, z: 3550, w: 22, d: 14, rotY: 0.35 },
      { x: 820, z: 3610, w: 16, d: 12, rotY: 0.35 },
      { x: 680, z: 3480, w: 18, d: 18, rotY: -0.2 },
      { x: 900, z: 3520, w: 30, d: 16, rotY: 0.1 },
    ],
  };

  const outDir = path.join(__dirname, '..', 'data', 'osm');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${tx}_${tz}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
  return outPath;
}

buildTile(0, 0);
