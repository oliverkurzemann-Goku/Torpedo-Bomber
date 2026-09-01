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
//  environment, so — same as convert_osm_tile.js — this authors ONE small,
//  clearly hand-made sample: an airfield, a flak position, a factory, and a
//  bridge, placed to sit sensibly alongside the SAME sample OSM tile
//  (0,0) already produced (the flak position guards the hand-made road; the
//  factory sits near the rail line; the bridge crosses the sample river).
//  A real conversion would replace these hand-placed entries with an actual
//  target list; the JSON shape and everything downstream does not change.
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

function buildTile(tx, tz){
  const data = {
    airfields: [
      { x: 3200, z: 1000, rotY: 0.15, length: 900, width: 40 },
    ],
    flak: [
      { x: 1750, z: 3150 }, // guarding the sample road at roughly (1800,3100)
      { x: 2500, z: 2900 },
    ],
    factories: [
      { x: 1500, z: 550, rotY: -0.1 }, // near the sample rail line
    ],
    bridges: [
      // crosses the sample river (river passes near x=2900-3200 for z~1900-2900)
      { x1: 2760, z1: 2350, x2: 3260, z2: 2350, width: 14 },
    ],
    ports: [],
  };

  const outDir = path.join(__dirname, '..', 'data', 'historical');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${tx}_${tz}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
  return outPath;
}

buildTile(0, 0);
