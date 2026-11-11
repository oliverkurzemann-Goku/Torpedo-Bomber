'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createCanvas,Image}=require('@napi-rs/canvas');
const vm=require('node:vm');
global.THREE=require('three');global.window=global;
global.document={createElement:()=>createCanvas(1,1),createElementNS(){
 const image=new Image(),listeners={};
 image.addEventListener=(name,fn)=>listeners[name]=fn;image.removeEventListener=()=>{};
 image.onload=()=>listeners.load?.call(image);image.onerror=e=>listeners.error?.(e);
 const native=Object.getOwnPropertyDescriptor(Image.prototype,'src');
 Object.defineProperty(image,'src',{set(url){native.set.call(image,Buffer.from(url.split(',')[1],'base64'));}});
 return image;
}};
global.WorldVehicles=vm.runInThisContext(fs.readFileSync(require.resolve('../../terrain-system/WorldVehicles.js'),'utf8')+'\nWorldVehicles;');
global.AirfieldActivity=vm.runInThisContext(fs.readFileSync(require.resolve('../../terrain-system/AirfieldActivity.js'),'utf8')+'\nAirfieldActivity;');

require('../data.js');
require('../world.js');
require('../coastal-templates.js');
const api=require('../coastal-scenery.js');
const specs=require('../../scripts/lib/okinawa-scenery/specs.cjs');

(async()=>{
 assert.equal(THREE.REVISION,'128');
 const options={vegetationDensity:.38,airfieldActivity:true};
 const baseline=await new OkinawaWorld(OKINAWA_DATA,{...options,coastal:false}).build();
 const start=baseline.objectCount;
 const groundSamples=[[-4500,-1000],[-3100,2100],[-5150,-4740],[-5400,-6200]];
 const heights=groundSamples.map(p=>baseline.getSurfaceHeight(...p));
 baseline.dispose();
 const world=await new OkinawaWorld(OKINAWA_DATA,{...options,coastal:{carrierDeparture:true}}).build();
 const coast=world.coastalScenery,map=coast.root.children[0].material.map;
 assert.equal(map.image.width,512);assert.equal(map.image.height,512);assert.equal(map.flipY,false);
 const added=coast.placements.length;
 assert.equal(start+added,world.objectCount);assert(world.objectCount<=api.limits.instances);
 assert.deepEqual(groundSamples.map(p=>world.getSurfaceHeight(...p)),heights);
 const kinds=new Set([...coast.placements.map(p=>p.kind),...coast.active.filter(e=>e.sites.length).map(e=>e.kind)]);
 assert.deepEqual(kinds,new Set(specs.map(s=>s.shape)));
 for(const p of coast.placements){
  const d=world.shoreDistance(p.x,p.z);
  if(p.kind==='fishing-jetty'){
   assert(world.shoreDistance(p.x+10*Math.sin(p.yaw),p.z+10*Math.cos(p.yaw))<-3);
   assert(world.shoreDistance(p.x-10*Math.sin(p.yaw),p.z-10*Math.cos(p.yaw))>-.9);
  }else if(['limestone-stack','sabani','reef-foam'].includes(p.kind))assert(d<0);
  else assert(d>0&&!world.nearHouse(p.x,p.z)&&!world.nearRoad(p.x,p.z));
 }
 assert(coast.patches.every(p=>p.triangles<=api.limits.trianglesPerZone));
 const material=new Set(coast.root.children.map(m=>m.material));
 assert.equal(material.size,1);assert.equal([...material][0].map,map);
 let peak={calls:0,triangles:0};
 for(let x=-5800;x<-2600;x+=150)for(let z=-6600;z<2600;z+=150){
  coast.update(.26,x,z,65);
  let calls=0,tris=0;
  for(const m of coast.root.children)if(m.visible){
   const triangles=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;
   calls++;tris+=triangles*(m.isInstancedMesh?m.count:1);
  }
  peak={calls:Math.max(peak.calls,calls),triangles:Math.max(peak.triangles,tris)};
 }
 assert(peak.calls<=api.limits.zones+7);assert(peak.triangles<43000);
 coast.update(.26,-25000,0,1000);
 assert(coast.root.children.every(m=>!m.visible));
 const dolphin=coast.active.find(e=>e.kind==='dolphin');
 coast.update(.26,-9600,-370,50);
 assert(dolphin.pieces[0].batch.visible);
 const matrix=new THREE.Matrix4();dolphin.pieces[0].batch.getMatrixAt(0,matrix);
 const a=matrix.elements.slice();
 coast.update(.26,-9600,-370,50);
 dolphin.pieces[0].batch.getMatrixAt(0,matrix);
 assert.notDeepEqual(a,matrix.elements);
 let disposed=0;map.addEventListener('dispose',()=>disposed++);
 const scene=new THREE.Scene();scene.add(world.root);world.dispose();
 assert.equal(disposed,1);assert.equal(world.root.parent,null);
 const payload=fs.statSync(require.resolve('../coastal-templates.js')).size+fs.statSync(require.resolve('../coastal-scenery.js')).size;
 assert(payload<100*1024,'total runtime additions exceed 100 KiB');
 console.log(JSON.stringify({types:kinds.size,staticPlacements:added,terrainInstances:world.objectCount,peak,payload}));
})().catch(e=>{console.error(e);process.exitCode=1;});
