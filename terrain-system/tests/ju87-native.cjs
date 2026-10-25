'use strict';
const validator=require('gltf-validator');
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../ju87-native.js');require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const bytes=fs.readFileSync(path.join(root,'assets/aircraft/ju87b2-own.glb'));
(async()=>{
const validation=await validator.validateBytes(new Uint8Array(bytes));assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
const gl=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no));
const model=new THREE.Group();model.add(gl.scene);let before=0;model.traverse(o=>{if(o.isMesh)before+=o.geometry.index.count/3});
const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());assert(Math.abs(size.x-13.8)<1e-4);assert(Math.abs(size.z-11)<.02);assert.equal(gl.animations.length,6);
AircraftArticulation.install(model,'ju87');assert(model.userData.nativeJu87);AircraftArticulation.install(model,'ju87');
assert(model.getObjectByName('prop'));assert.equal(model.getObjectByName('prop').getWorldPosition(new THREE.Vector3()).z,4.84);
AircraftArticulation.pose(model,0,{left:1,right:.2});for(const name of ['Inner','Middle','Outer']){assert.equal(model.getObjectByName(name+'FlapLeft').rotation.x,-.7);assert(Math.abs(model.getObjectByName(name+'FlapRight').rotation.x+.14)<1e-10);}
AircraftArticulation.controls(model,.8,.5);Ju87Rig.dive(model,1);assert.equal(model.getObjectByName('diveBrakeLeft').rotation.x,-Math.PI/2);
const clone=model.clone(true);AircraftArticulation.pose(clone,1);assert.equal(model.getObjectByName('InnerFlapLeft').rotation.x,-.7);assert(Math.abs(clone.getObjectByName('InnerFlapLeft').rotation.x)<1e-10);
let after=0,wheels=0;model.traverse(o=>{if(o.isMesh)after+=o.geometry.index.count/3;if(o.userData.groundWheel){assert(o.visible);wheels++}});assert.equal(after,before);assert.equal(wheels,3);
const ground=[];for(const h of [()=>0,(x,z)=>.03*x+.018*z]){delete model.userData.groundSupports;const fit=AircraftGround.fit(model,'ju87',0,0,.35,h),gaps=fit.contacts.map(p=>fit.y+p.y-h(p.x,p.z));assert.equal(gaps.length,3);assert(gaps.every(g=>Math.abs(g)<.003));ground.push(gaps);}
console.log(JSON.stringify({nativeJu87:true,triangles:before,size,ground,cloneSafe:true,clips:gl.animations.map(c=>c.name),validation:validation.issues},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
