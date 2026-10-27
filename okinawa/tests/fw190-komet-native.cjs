'use strict';
// Real delivered bytes, native clone mechanics, dimensions, contacts and muzzle origins.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');
global.ProgressEvent=class ProgressEvent{constructor(type,p={}){this.type=type;Object.assign(this,p);}};
global.self=global;global.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
vm.runInThisContext(fs.readFileSync(path.join(root,'node_modules/three/examples/js/loaders/GLTFLoader.js'),'utf8'));
require('../../aircraft-contract.js');require('../../me163-native.js');require('../../aircraft-articulation.js');
vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8')+'\nglobalThis.AircraftGround=AircraftGround;');
const load=b=>new Promise((ok,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',ok,no));
(async()=>{
 const {khronos,checkContract}=await import('../../scripts/check-rig-contract.mjs');
 for(const [kind,file,span,length,ports]of [['fw190','fw190a8',10.5,8.95,6],['me163','me163b',9.32,5.69,2]]){
  const bytes=fs.readFileSync(path.join(root,'assets/aircraft',file+'-own.glb')),validation=await khronos(bytes);assert.equal(validation.errors,0,JSON.stringify(validation));assert.equal(validation.warnings,0,JSON.stringify(validation));
  if(kind==='fw190')assert.deepEqual(checkContract(bytes).errors,[]);
  const gltf=await load(bytes),frame=gltf.scene,copy=frame.clone(true);AircraftArticulation.install(frame,kind);AircraftArticulation.install(copy,kind);
  const before=frame.getObjectByName(kind==='fw190'?'GearLeft':'LandingSkid').position.clone();
  const size=new THREE.Box3().setFromObject(frame).getSize(new THREE.Vector3());assert(Math.abs(size.x-span)<.01);assert(Math.abs(size.z-length)<.01);
  const points=kind==='fw190'?AircraftContract.muzzles(frame,frame):Me163Rig.muzzles(frame,frame);assert.equal(points.length,ports);
  for(const gradient of [0,.06]){const fit=AircraftGround.fit(frame,kind,0,0,0,(x,z)=>gradient*(x+z));assert.equal(fit.contacts.length,3);for(const p of fit.contacts)assert(Math.abs(fit.y+p.y-gradient*(p.x+p.z))<.002,'all contacts meet the rendered surface');}
  AircraftArticulation.pose(copy,0,{left:1,right:.25});AircraftArticulation.controls(copy,.4,.3);
  if(kind==='fw190'){
   assert(Math.abs(frame.getObjectByName('GearLeft').rotation.z)<1e-9);assert(Math.abs(copy.getObjectByName('GearLeft').rotation.z)>1.5);
   assert(copy.getObjectByName('FlapLeft').quaternion.angleTo(copy.getObjectByName('FlapRight').quaternion)>.1);
  }else{
   assert(!frame.getObjectByName('Tailplane'));assert(!frame.getObjectByName('Propeller'));assert(!frame.getObjectByName('Object_9'));
   assert.equal(copy.getObjectByName('LandingSkid').position.y,.24);assert(frame.getObjectByName('LandingSkid').position.equals(before));
   Me163Rig.controls(copy,0,.5);assert(Math.abs(copy.getObjectByName('ElevonLeft').rotation.x-copy.getObjectByName('ElevonRight').rotation.x)<.01);
   Me163Rig.controls(copy,.5,0);assert(copy.getObjectByName('ElevonLeft').rotation.x*copy.getObjectByName('ElevonRight').rotation.x<0);
  }
  console.log(JSON.stringify({kind,bytes:bytes.length,size:size.toArray(),ports,validation,clips:gltf.animations.map(a=>a.name),cloneIndependent:true,contacts:'flat and sloped'}));
 }
 const app=fs.readFileSync(path.join(root,'scripts/build-app.mjs'),'utf8'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
 assert(!/const rootModels=[\s\S]*?['"](?:fw190|me163)\.glb['"][\s\S]*?;/.test(app));
 for(const [kind,file]of [['fw190','fw190a8'],['me163','me163b']])assert(html.includes(kind+": ['assets/aircraft/"+file+"-own.glb']"));
})().catch(e=>{console.error(e);process.exitCode=1;});
