/* Actual GLTFLoader, decoded original textures, terrain placement and reuse. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),{Image,createCanvas}=require('@napi-rs/canvas');
global.THREE=THREE;global.window=global;global.self=global;global.createImageBitmap=undefined;
global.document={createElement:()=>createCanvas(1,1),createElementNS(){
 const image=new Image(),listeners={};image.addEventListener=(n,f)=>listeners[n]=f;image.removeEventListener=()=>{};
 image.onload=()=>listeners.load?.call(image);image.onerror=e=>listeners.error?.call(image,e);
 const native=Object.getOwnPropertyDescriptor(Image.prototype,'src');Object.defineProperty(image,'src',{set(url){fetch(url).then(r=>r.arrayBuffer()).then(b=>native.set.call(image,Buffer.from(b))).catch(e=>listeners.error?.(e));}});return image;
}};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));
const root=path.resolve(__dirname,'../..'),loads=[];
THREE.GLTFLoader.prototype.load=function(url,yes,_progress,no){loads.push(url);const b=fs.readFileSync(path.join(root,url.split('?')[0]));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no);};
require('../../fortification-assets.js');require('../data.js');require('../world.js');
for(const name of ['WorldVehicles','AirfieldActivity']){
 vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
}
(async()=>{
 for(const [kind,spec] of Object.entries(FortificationAssets.specs)){
  const [model,repeated]=await Promise.all([FortificationAssets.load(kind),FortificationAssets.load(kind)]);assert.equal(model,repeated);assert.equal(loads.filter(u=>u.includes(kind)).length,1);
  const bounds=new THREE.Box3(),v=new THREE.Vector3();let tris=0,textures=0;model.updateMatrixWorld(true);
  model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;tris+=(o.geometry.index?.count||p.count)/3;
   for(let i=0;i<p.count;i++)bounds.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));
   for(const m of [].concat(o.material))if(m.map){assert(m.map.image.width<=512&&m.map.image.height<=512);assert(m.map.image.width>1);textures++;}
  });
  const size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());
  assert(Math.abs(bounds.min.y)<.001&&Math.abs(centre.x)<.001&&Math.abs(centre.z)<.001,'exporter offsets removed from actual vertices');
  assert(Math.abs(Math.max(size.x,size.z)-spec.length)<.001);assert(size.y>1&&size.y<8,'upright, plausible height');
  assert(tris>0&&tris<1500);assert.equal(textures,1,'one embedded texture and mesh');
  const cloned=model.clone(true);let originalMesh,cloneMesh;model.traverse(o=>{if(o.isMesh&&!originalMesh)originalMesh=o;});cloned.traverse(o=>{if(o.isMesh&&!cloneMesh)cloneMesh=o;});assert.equal(originalMesh.geometry,cloneMesh.geometry);assert.equal(originalMesh.material,cloneMesh.material);
  console.log(kind,{metres:size.toArray(),triangles:tris,textureMeshes:textures});
 }
 const world=await new OkinawaWorld(OKINAWA_DATA,{airfieldActivity:true}).build();assert.equal(world.fortifications.length,4);
 await world.airfieldReady;
 const apron=world.airfieldActivity;
 assert.equal(apron.service,'ijn');
 assert(apron.trucks.every(e=>e.model.userData.sharedVehicle),'both Isuzu GLBs load through GLTFLoader');
 for(const service of ['usaaf','luftwaffe']){
  const apronInEurope=new AirfieldActivity({getRenderedHeight:()=>0},0,0,{service});
  await apronInEurope.loadVehicleModels();
  assert(apronInEurope.trucks.every(e=>e.model.userData.sharedVehicle),service+' models load through GLTFLoader');
  apronInEurope.dispose();
 }
 assert(apron.payload.name==='serviceCrate');
 for(const name of ['Airfield coral gravel','Airfield tyre tracks']){
  const track=world.root.getObjectByName(name),positions=track.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
   const x=positions.getX(i),z=positions.getZ(i),surface=world.getSurfaceHeight(x,z);
   assert(world.shoreDistance(x,z)>40);
   assert(Math.abs(positions.getY(i)-surface)<.06);
   assert(z<-1094,'apron geometry intersects target area');
  }
 }
 const contacts=apron.trucks.map(e=>e.model.position.clone());
 for(let t=0;t<460;t+=.25){
  world.update(.25,apron.x,apron.z,100);
  for(const [i,{model}] of apron.trucks.entries()){
   assert(model.position.distanceTo(contacts[i])<1.2,'truck teleported across a turn or at the lap boundary');
   contacts[i].copy(model.position);
   const {x,y,z}=model.position;
   assert(z<=-48+.001,'truck enters the landing strip');
   assert(Math.abs(y-world.getSurfaceHeight(apron.x+x,apron.z+z)-.08)<.0001);
  }
  assert(contacts[0].distanceTo(contacts[1])>12,'service traffic collides');
 }
 const time=apron.time;world.update(1,apron.x,apron.z,600);
 assert.equal(apron.time,time);assert(!apron.group.visible);
 world.update(1,apron.x+2000,apron.z,90);assert(!apron.group.visible);
 let truckReleased=0;
 const truck=apron.trucks[0].model;
 truck.traverse(o=>o.geometry?.addEventListener('dispose',()=>truckReleased++));
 for(const e of world.fortifications){const box=new THREE.Box3(),vertex=new THREE.Vector3();e.group.updateMatrixWorld(true);e.model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)box.expandByPoint(vertex.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});
  assert(Math.abs(box.min.y-e.y)<.001,'foundation sits at highest terrain footprint sample');assert(world.shoreDistance(e.x,e.z)>85);assert(world.biome(e.x,e.z)[2]<=.2,'runway clear');
  world.updateFortifications(e.x,e.z);assert(e.model.visible);assert(world.fortifications.filter(f=>f.kind==='bunker'&&f.model.visible).length<=1);assert(world.fortifications.filter(f=>f.kind==='observation-post'&&f.model.visible).length<=2);
 }
 const matrix=new THREE.Matrix4(),pos=new THREE.Vector3();for(const mesh of world.decorations)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);
  assert(world.fortifications.every(e=>Math.hypot(pos.x-e.x,pos.z-e.z)>Math.hypot(e.w,e.d)/2+12),'vegetation kept outside fortifications');
 }
 world.updateFortifications(30000,30000);assert(world.fortifications.every(e=>!e.group.visible));
 let released=0;for(const kind of Object.keys(FortificationAssets.specs))FortificationAssets.get(kind).traverse(o=>{o.geometry?.addEventListener('dispose',()=>released++);for(const m of [].concat(o.material||[]))m.addEventListener('dispose',()=>released++);});
 console.log('Coastal sites:',world.fortifications.map(e=>({kind:e.kind,x:e.x,z:e.z,height:e.y})));
 world.dispose();assert.equal(released,0,'world teardown preserves cached assets for next sortie');assert.equal(loads.length,8);assert.equal(truckReleased,0,'teardown preserves shared truck templates');console.log('Fortification and airfield models, continuous traffic and scenery placement passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
