/* Actual r128 GLTFLoader + exported geometry + production rig/ground code; no GPU claims. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub(),createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:[60,60,60,255]})})})};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
assert(html.includes("p47:   ['assets/aircraft/p47-weathered.glb','p47new.glb'"),'native model first, original fallback retained');
assert(html.includes("'assets/aircraft/p47-weathered.glb': {yaw:0}"));
const start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\n  root.updateMatrixWorld(true);',start);
vm.runInThisContext(html.slice(start,end)+'\nthrow Error("native rig fell through to destructive legacy path");}');
function load(file){const b=fs.readFileSync(path.join(root,file));return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no));}
function triangles(frame){let n=0;frame.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;}
function trueBounds(frame){const box=new THREE.Box3(),v=new THREE.Vector3();frame.updateMatrixWorld(true);frame.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)box.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return box;}
(async()=>{
 const g=await load('assets/aircraft/p47-weathered.glb'),raw=g.scene,frame=new THREE.Group();frame.add(raw);
 const before=triangles(frame),size=trueBounds(frame).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.42)<.001);assert(Math.abs(size.z-11.02)<.001);
 let meshCount=0;frame.traverse(o=>{if(o.isMesh)meshCount++;});assert(meshCount<=40,'gear stays material-batched');
 assert.match(rigModel(frame,'p47'),/native weathered/);AircraftArticulation.install(frame,'p47');
 assert.equal(triangles(frame),before,'no duplicate or removed airframe triangles');assert.equal(frame.getObjectByName('gear').children.length,3);assert.equal(frame.getObjectByName('flightFlaps').children.length,2);
 const tyres=[];frame.traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});assert.equal(tyres.length,3);
 for(const tyre of tyres){const p=tyre.geometry.attributes.position;tyre.geometry.computeBoundingBox();const box=tyre.geometry.boundingBox,size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());assert(Math.abs(size.y-size.z)<.001,'round tyre, not stretched');assert(size.x<size.y*.40);let maxR=0;for(let i=0;i<p.count;i++)maxR=Math.max(maxR,Math.hypot(p.getY(i)-c.y,p.getZ(i)-c.z));assert(Math.abs(maxR-(tyre.name==='TyreTail'?.165:.44))<.001);}
 const left=frame.getObjectByName('GearLeft'),right=frame.getObjectByName('GearRight'),rotor=frame.getObjectByName('prop');assert(rotor&&triangles(rotor)===1976,'all original rotor parts rotate together');assert(left.position.z>1.8&&right.position.z>1.8);
 const geometry=rotor.geometry.attributes.position,v=new THREE.Vector3().fromBufferAttribute(geometry,0);rotor.updateMatrixWorld(true);const a=v.clone().applyMatrix4(rotor.matrixWorld);rotor.rotation.z=.31;rotor.updateMatrixWorld(true);assert(a.distanceTo(v.clone().applyMatrix4(rotor.matrixWorld))>.01);
 AircraftArticulation.pose(frame,.5,{left:.8,right:.2});assert(Math.abs(left.rotation.z-.74)<1e-6);assert(Math.abs(right.rotation.z+.74)<1e-6);assert(frame.getObjectByName('FlapLeft').rotation.x<frame.getObjectByName('FlapRight').rotation.x);
 AircraftArticulation.controls(frame,.6,-.5);assert(frame.getObjectByName('AileronLeft').rotation.x>0&&frame.getObjectByName('AileronRight').rotation.x<0);assert(frame.getObjectByName('ElevatorLeft').rotation.x>0);
 AircraftArticulation.pose(frame,0,{left:0,right:0});assert.equal(frame.getObjectByName('gear').visible,false);AircraftArticulation.pose(frame,1,{left:0,right:0});assert.equal(frame.getObjectByName('gear').visible,true);
 const ground=[];for(const height of [()=>0,(x,z)=>.03*x+.018*z]){delete frame.userData.groundSupports;const fit=AircraftGround.fit(frame,'p47',0,0,.35,height),gaps=fit.contacts.map(p=>fit.y+p.y-height(p.x,p.z));assert(gaps.every(g=>Math.abs(g)<1e-5));ground.push(gaps);}
 const clone=frame.clone(true),other=clone.getObjectByName('GearLeft');AircraftArticulation.pose(clone,.25,{left:1,right:0});assert.notEqual(other.rotation.z,left.rotation.z);assert.equal(left.rotation.z,0,'AI clone cannot retract player gear');
 const material=frame.getObjectByName('Airframe').material;assert(material.map&&material.normalMap&&material.metalnessMap&&material.roughnessMap,'wear PBR textures decoded by real loader');
 assert(g.animations.length===4);console.log(JSON.stringify({nativeP47:true,triangles:before,meshCount,span:size.x,length:size.z,roundTyres:tyres.length,originalRotorFaces:triangles(rotor),ground,cloneSafe:true,visualQA:'unverified: managed browser lacks WebGL'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
