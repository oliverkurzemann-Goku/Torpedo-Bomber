'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createCanvas,Image}=require('@napi-rs/canvas');
const vm=require('node:vm');
global.THREE=require('three');global.window=global;
require('../../crew-figures.js');
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
 const terrainMap=world.terrain.children[0].material.map;
 assert.equal(terrainMap.image.width,2048);assert.equal(terrainMap.image.height,2048);
 assert(world.terrain.children.every(m=>m.material.map===terrainMap));
 const offsets=world.highlandOffsets,step=31.25;
 let raised=0,preserved=0;
 for(let j=0;j<513;j++)for(let i=0;i<513;i++){
  const x=i*step-8000,z=j*step-8000,offset=offsets[j*513+i];
  if(offset>50)raised++;
  if(world.shoreDistance(x,z)<=160||Math.hypot(x+2860,z+1074)<=770){
   assert.equal(offset,0,'Relief leaves the shoreline, lakes and airfield unchanged');
   preserved++;
  }
 }
 assert(raised>1500&&preserved>90000);
 const pixels=terrainMap.image.getContext('2d').getImageData(0,0,2048,2048).data;
 let forestSamples=0,darkGreen=0;
 for(let z=-5000;z<-2000;z+=50)for(let x=-1700;x<3700;x+=50){
  if(world.rawHeight(x,z)<110||world.shoreDistance(x,z)<470||world.biome(x,z)[1]>.1)continue;
  const texel=v=>Math.round((v+8000)*2047/16000),k=(texel(z)*2048+texel(x))*4;
  forestSamples++;
  if(pixels[k+1]<84&&pixels[k]<65&&pixels[k+1]>pixels[k])darkGreen++;
 }
 assert(forestSamples>800&&darkGreen/forestSamples>.9,'Dark green canopy dominates the inland ridges');
 const farmland=world.land.reduce((sum,land,i)=>sum+(land&&world.biomes[i*4+1]>153&&world.biomes[i*4+2]<20?1:0),0);
 assert(farmland*(16000/world.mapSize)**2>4e6,'Visible farm belts cover more than four square kilometres');
 assert.equal(world.coastalTowns.length,2);
 for(const town of world.coastalTowns){
  assert(town.houses.length>=60&&town.houses.filter(h=>h.style===0).length>town.houses.length/2);
  assert(town.houses.every(h=>world.shoreDistance(h.x,h.z)>28&&!world.nearRoad(h.x,h.z)));
  assert(town.square.every(p=>world.shoreDistance(...p)>28));
  assert(town.link&&town.exits.includes(town.link.path[0]));
  const [x,z]=town.link.path[1];
  assert(world.roadRoutes.some(r=>!r.paintOnly&&r.kind==='road'&&r.path.slice(1).some(([bx,bz],i)=>{
   const [ax,az]=r.path[i],dx=bx-ax,dz=bz-az,t=((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz);
   return t>=0&&t<=1&&Math.hypot(x-(ax+t*dx),z-(az+t*dz))<.001;
  })),'Town street joins an existing road');
 }
 const trees=[],treeCells=new Map(),treeMatrix=new THREE.Matrix4(),treePoint=new THREE.Vector3();
 const cell=(x,z)=>Math.floor(x/25)+','+Math.floor(z/25);
 for(const m of world.decorations.filter(m=>m.name.startsWith('Broadleaf canopy')))for(let i=0;i<m.count;i++){
  m.getMatrixAt(i,treeMatrix);treePoint.setFromMatrixPosition(treeMatrix);
  const {x,z}=treePoint,k=cell(x,z),tree={x,z};
  assert(world.biome(x,z)[1]<=.2&&!world.nearRoad(x,z));
  trees.push(tree);if(!treeCells.has(k))treeCells.set(k,[]);treeCells.get(k).push(tree);
 }
 const grouped=trees.filter(p=>[-25,0,25].some(dx=>[-25,0,25].some(dz=>
  (treeCells.get(cell(p.x+dx,p.z+dz))||[]).some(q=>q!==p&&Math.hypot(q.x-p.x,q.z-p.z)<25))));
 assert(trees.length>5000&&trees.length<9531&&grouped.length/trees.length>.75,'Most trees have a neighbouring crown within 25 m');
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
 console.log(JSON.stringify({types:kinds.size,staticPlacements:added,terrainInstances:world.objectCount,groupedTrees:grouped.length,trees:trees.length,peak,payload}));
})().catch(e=>{console.error(e);process.exitCode=1;});
