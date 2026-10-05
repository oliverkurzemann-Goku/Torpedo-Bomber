'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');global.THREE=require('three');
vm.runInThisContext(fs.readFileSync('terrain-system/OSMManager.js','utf8'));
const records=fs.readdirSync('terrain-system/real/data/osm').sort().map(name=>{const [tx,tz]=name.split('.')[0].split('_').map(Number);return {tx,tz,data:JSON.parse(fs.readFileSync('terrain-system/real/data/osm/'+name))}});
const water=JSON.parse(fs.readFileSync('terrain-system/real/data/waterways.json'));for(const r of records)Object.assign(r.data,water.tiles[r.tx+','+r.tz]);
const index=makeOSMWaterIndex(records,4000),stats=pruneOSMRoadSpurs(records,4000);assert(stats.removed>500&&stats.retained>20000);
let triangles=0;
for(const {tx,tz,data} of records){
 const positions=[],indices=[];
 for(const line of data.roads){const pairs=osmRibbonPairs(line,tx*4000,tz*4000,6),base=positions.length/3;
  for(const pair of pairs)for(const [x,z] of pair)positions.push(x,0,z);
  for(let j=1;j<pairs.length;j++)indices.push(base+(j-1)*2,base+(j-1)*2+1,base+j*2,base+(j-1)*2+1,base+j*2+1,base+j*2);
 }
 const dry=osmSubtractWater(positions,indices,index);
 for(let i=0;i<dry.length;i+=9){
  const x=(dry[i]+dry[i+3]+dry[i+6])/3,z=(dry[i+2]+dry[i+5]+dry[i+8])/3;
  const features=index.cells.get(Math.floor(x/128)+','+Math.floor(z/128))||[];
  assert(!features.some(f=>pointInPolygon(x,z,f.ring)),`asphalt in water at ${x},${z}`);triangles++;
 }
}
// A connected short junction link and a cross-tile continuation survive;
// an isolated spur must disappear. Filtering does not round or move source lines.
const fixture={tx:0,tz:0,data:{roads:[[[100,100],[200,100]],[[200,100],[600,100]],[[100,100],[100,500]],[[0,500],[100,500]],[[700,700],[750,700]]]}};
pruneOSMRoadSpurs([fixture],4000);
assert(fixture.data.roads.some(l=>l[0][0]===0),'cross-tile continuation survives');
assert(fixture.data.roads.some(l=>l[0][0]===100&&l[1][0]===200),'short junction link survives');
assert(!fixture.data.roads.some(l=>l[0][0]===700),'isolated spur removed');
console.log(JSON.stringify({...stats,checkedDryTriangles:triangles}));
