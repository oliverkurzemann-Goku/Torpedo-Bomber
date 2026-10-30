'use strict';
const validator=require('gltf-validator'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));require('../../corsair-native.js');require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const bytes=fs.readFileSync(path.join(root,'assets/aircraft/corsair-f4u1d-own.glb'));
(async()=>{
 const v=await validator.validateBytes(new Uint8Array(bytes));assert.equal(v.issues.numErrors,0);assert.equal(v.issues.numWarnings,0);
 const gl=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no));
 const model=new THREE.Group();model.add(gl.scene);let before=0;model.traverse(o=>{if(o.isMesh)before+=o.geometry.index.count/3});
 const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.4968)<1e-4);assert(Math.abs(size.z-10.16)<.02);assert.equal(gl.animations.length,7);
 const hood=model.getObjectByName('BubbleCanopyGlass'),service=model.getObjectByName('ServicePanels'),cooler=model.getObjectByName('CoolerIntakes');
 assert(hood&&service&&cooler,'refined canopy and maintenance details exist');
 const hoodSize=new THREE.Box3().setFromObject(hood).getSize(new THREE.Vector3());
 assert(hoodSize.x>.62&&hoodSize.x<.78,'late Corsair bubble hood correctly narrow');
 assert(hoodSize.y>.45&&hoodSize.y<.60,'late Corsair hood height proportion');
 assert(hoodSize.z>1.2&&hoodSize.z<1.4,'late Corsair hood length');
 assert(hood.material.transparent&&hood.material.opacity!==0,'clear cockpit glazing');

 const source=model.getObjectByName('CorsairF4U1D_Original');assert.deepEqual(source.userData.provenance.thirdPartyMeshes,[]);assert.deepEqual(source.userData.provenance.thirdPartyTextures,[]);
 AircraftArticulation.install(model,'corsair');assert(model.userData.nativeCorsair);AircraftArticulation.install(model,'corsair');assert(!model.getObjectByName('flightFlaps'));
 CorsairRig.update(model,{gear:0,dive:1,flaps:{left:1,right:.2},roll:.8,pitch:.5,bombs:2,rockets:8});
 assert(model.getObjectByName('sbdGear').visible);assert.equal(model.getObjectByName('GearLeft').rotation.x,0);assert.equal(model.getObjectByName('TailGear').visible,false);
 for(const section of ['Inner','Middle','Outer'])assert(Math.abs(model.getObjectByName(section+'FlapLeft').quaternion.angleTo(new THREE.Quaternion())-50*Math.PI/180)<1e-6);
 const q=model.getObjectByName('AileronLeft').quaternion.clone();assert(q.angleTo(new THREE.Quaternion())>.19);
 const clone=model.clone(true);CorsairRig.update(clone,{gear:1,flaps:{left:0,right:0},bombs:1,rockets:7});assert(model.getObjectByName('AileronLeft').quaternion.equals(q));assert(clone.getObjectByName('TailGear').visible);
 assert(!clone.getObjectByName('BombRight').visible);assert(clone.getObjectByName('BombLeft').visible);assert(!clone.getObjectByName('Rocket7').visible);assert(model.getObjectByName('Rocket7').visible);assert.equal(CorsairRig.muzzles(model,model).length,6);
 CorsairRig.update(model,{gear:0,dive:0});assert(!model.getObjectByName('sbdGear').visible);CorsairRig.update(model,{gear:.5});assert(Math.abs(model.getObjectByName('GearLeft').rotation.x-Math.PI/4)<1e-10);
 CorsairRig.update(model,{gear:1});let after=0;model.traverse(o=>{if(o.isMesh)after+=o.geometry.index.count/3});assert.equal(after,before);
 const ground=[];for(const h of [()=>0,(x,z)=>.03*x+.018*z]){delete model.userData.groundSupports;const fit=AircraftGround.fit(model,'carrier',0,0,.35,h),gaps=fit.contacts.map(p=>fit.y+p.y-h(p.x,p.z));assert.equal(gaps.length,3);assert(gaps.every(g=>Math.abs(g)<.003));ground.push(gaps);}
 console.log(JSON.stringify({nativeCorsair:true,triangles:before,size,ground,cloneSafe:true,clips:gl.animations.map(c=>c.name),validation:{errors:v.issues.numErrors,warnings:v.issues.numWarnings}},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
