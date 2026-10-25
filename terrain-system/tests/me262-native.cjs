/* Independent P-47: actual r128 decoder, production rig, mesh identity and tyre contact. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=1;this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>{this.listeners.load?.();this.onload?.();});}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub(),createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:[60,60,60,255]})})})};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../me262-native.js');require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const urls=html.match(/me262:\s*(\[[^\]]*\])/)[1];assert.deepEqual(JSON.parse(urls.replaceAll("'",'"')),['assets/aircraft/me262-noel.glb']);
const start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\n  root.updateMatrixWorld(true);',start);
vm.runInThisContext(html.slice(start,end)+'\nthrow Error("native rig fell through to destructive legacy path");}');
function load(file){const b=fs.readFileSync(path.join(root,file));return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no));}
function triangles(frame){let n=0;frame.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;}
function bounds(frame){const box=new THREE.Box3(),v=new THREE.Vector3();frame.updateMatrixWorld(true);frame.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)box.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return box;}
(async()=>{
 const g=await load('assets/aircraft/me262-noel.glb'),frame=new THREE.Group();frame.add(g.scene);
 const before=triangles(frame),size=bounds(frame).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.5)<.005);assert(Math.abs(size.z-10.6)<.005);
 assert.match(rigModel(frame,'me262'),/native Me 262/);AircraftArticulation.install(frame,'me262');
 assert.equal(triangles(frame),before);assert.equal(frame.getObjectByName('gear').children.length,3);assert.equal(frame.getObjectByName('flightFlaps').children.length,2);assert.equal(g.animations.length,5);
 const ink=[];frame.traverse(o=>{if(o.userData.lettering==='Noel')ink.push(o);});assert.equal(ink.length,2);for(const o of ink){assert.equal(o.userData.widthMetres,.62);assert.equal(o.material.color.getHex(),0);}
 AircraftArticulation.pose(frame,0,{left:1,right:.2});assert.equal(frame.getObjectByName('gear').visible,false);assert.equal(frame.getObjectByName('FlapLeft').rotation.x,.7);
 AircraftArticulation.pose(frame,1);AircraftArticulation.controls(frame,.8,-.5);assert(frame.getObjectByName('AileronLeft').rotation.x>0);assert(frame.getObjectByName('ElevatorLeft').rotation.x>0);
 const clone=frame.clone(true);AircraftArticulation.pose(clone,0);assert.equal(frame.getObjectByName('GearLeft').rotation.z,0);assert(clone.getObjectByName('GearLeft').rotation.z>1);
 const ground=[];for(const height of [()=>0,(x,z)=>.03*x+.018*z]){delete frame.userData.groundSupports;const fit=AircraftGround.fit(frame,'me262',0,0,.35,height),gaps=fit.contacts.map(p=>fit.y+p.y-height(p.x,p.z));assert.equal(gaps.length,3);assert(gaps.every(g=>Math.abs(g)<.003));ground.push(gaps);}
 assert.equal(Me262Rig.exhaust(frame).length,2);console.log(JSON.stringify({nativeMe262:true,triangles:before,size,ground,cloneSafe:true,blackNoel:ink.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
