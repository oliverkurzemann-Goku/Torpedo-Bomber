#!/usr/bin/env node
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require(process.env.THREE_R128||'three');
vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/OSMManager.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root,'sortie-systems.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const start=html.indexOf('function makeSoftSprite()'),end=html.indexOf('const CLOUD_SPAN',start);
vm.runInThisContext(html.slice(start,end));
const cloud=makeSoftSprite();assert(cloud.isDataTexture);assert.equal(cloud.generateMipmaps,false);
const pixels=cloud.image.data;let transparent=0,opaque=0;
for(let i=0;i<pixels.length;i+=4){
  assert.equal(pixels[i],255);assert.equal(pixels[i+1],255);assert.equal(pixels[i+2],255);
  if(pixels[i+3]===0)transparent++;if(pixels[i+3]>200)opaque++;
}
assert(transparent>1000&&opaque>100,'cloud alpha falloff missing');
const water=makeOSMWaterTexture();assert(water.isDataTexture);
let waterMin=255,waterMax=0,waterDelta=0,waterEdges=0;
for(let y=0;y<water.image.height;y++)for(let x=0;x<water.image.width;x++){
  const i=(y*water.image.width+x)*4,v=water.image.data[i];
  assert.equal(v,water.image.data[i+1]);assert.equal(v,water.image.data[i+2]);assert.equal(water.image.data[i+3],255);
  waterMin=Math.min(waterMin,v);waterMax=Math.max(waterMax,v);
  if(x){waterDelta+=Math.abs(v-water.image.data[i-4]);waterEdges++;}
  if(y){waterDelta+=Math.abs(v-water.image.data[i-water.image.width*4]);waterEdges++;}
}
assert.equal(water.image.width,128);assert(waterMax-waterMin<=10,'water texture contrast is too harsh');
assert(waterDelta/waterEdges<.5,'water texture contains high-frequency screen pattern');
// BUILD 18's rain mesh followed the player without changing a single vertex,
// so its grey lines appeared glued to the screen. Execute the actual weather
// functions and prove a rain frame changes the drop positions.
const weatherStart=html.indexOf('let rainMesh=null'),weatherEnd=html.indexOf('//  CONTROL UI',weatherStart);
const weatherContext=vm.createContext({THREE,FlightOps,wxTime:0,baseWind:2,clouds:[],state:0,ST:{FLIGHT:1},scene:new THREE.Scene(),weather:'rain',
  P:{pos:new THREE.Vector3(100,500,200),spd:150,heading:.8},windZ:2,
  document:{getElementById(){return {style:{opacity:'0'}};}},sfxBoom(){},setTimeout(){}});
vm.runInContext(html.slice(weatherStart,weatherEnd)+'\nglobalThis.buildRain=buildRain;globalThis.updateWeatherFx=updateWeatherFx;globalThis.getRain=()=>rainMesh;',weatherContext);
weatherContext.buildRain();const rain=weatherContext.getRain(),rainBefore=rain.geometry.attributes.position.array.slice();
assert.equal(rain.userData.dropCount,900);weatherContext.updateWeatherFx(.1);
const rainAfter=rain.geometry.attributes.position.array;
let moved=0;for(let i=0;i<rainAfter.length;i++)if(Math.abs(rainAfter[i]-rainBefore[i])>.001)moved++;
assert(moved>rainAfter.length*.8,'rain streak vertices are still static');assert(rain.visible);
weatherContext.weather='clear';weatherContext.updateWeatherFx(.1);assert(!rain.visible);
// Taper actual isolated ends, keep seams full-width and preserve all source bends.
const capped=osmWaterPairs([[0,0],[100,0]],0,0,12,[true,true]);
const open=osmWaterPairs([[0,0],[100,0]],0,0,12,[false,false]);
const width=p=>Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]);
assert(width(capped[0])<1&&width(capped.at(-1))<1);
assert(width(open[0])>10&&width(open.at(-1))>10);
const data=JSON.parse(fs.readFileSync(path.join(root,'terrain-system/real/data/waterways.json')));
assert.equal(Object.keys(data.tiles).length,56);assert(data.counts.stream>4000);
let pieces=0;const streamSegments=[],oldEnds=new Map();
for(const [key,tile] of Object.entries(data.tiles)){
  const [tx,tz]=key.split(',').map(Number);
  assert.equal(tile.rivers.length,tile.riverWidths.length);assert.equal(tile.rivers.length,tile.riverEnds.length);
  for(let i=0;i<tile.rivers.length;i++){
    const line=tile.rivers[i];assert(line.length>=2);pieces++;
    assert([2.4,6,12].includes(tile.riverWidths[i]));
    for(const [x,z]of line)assert(x>=-.01&&x<=4000.01&&z>=-.01&&z<=4000.01);
    if(tile.riverWidths[i]===2.4)for(let j=1;j<line.length;j++)
      streamSegments.push([line[j-1],line[j]].map(([x,z])=>[x+tx*4000,z+tz*4000]));
  }
  const old=JSON.parse(fs.readFileSync(path.join(root,`terrain-system/real/data/osm/${tx}_${tz}.json`)));
  for(const line of old.rivers)for(const [x,z]of [line[0],line.at(-1)]){
    const p=[x+tx*4000,z+tz*4000],k=p.map(v=>v.toFixed(3)).join(',');
    const item=oldEnds.get(k)||{p,n:0};item.n++;oldEnds.set(k,item);
  }
}
// Independent distance oracle: formerly dangling river/canal endpoints that
// now meet a sourced stream, including the reported area around the airfield.
function distance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
const repaired=[...oldEnds.values()].filter(e=>e.n===1&&streamSegments.some(([a,b])=>distance(e.p,a,b)<.2));
assert(repaired.length>=80,'lost imported stream connections');
assert(repaired.some(e=>Math.hypot(e.p[0]-1558.269,e.p[1]-17952.081)<1),'reported airfield-area canal connection missing');
console.log(JSON.stringify({waterPieces:pieces,sourceStreams:data.counts.stream,reconnectedOldEnds:repaired.length,cloudPixels:pixels.length/4,waterRange:[waterMin,waterMax],waterMeanEdgeDelta:+(waterDelta/waterEdges).toFixed(3),rainDrops:rain.userData.dropCount,rainMovedValues:moved,neutralRGB:true,browserTest:false},null,2));
