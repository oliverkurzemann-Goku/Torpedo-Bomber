/* Real r128 loader, production rig, mesh vertices and ground solver. No GPU/device claim. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
assert(html.includes("p47:   ['assets/aircraft/p47-independent.glb']"));assert(!html.match(/p47:\s*\[[^\]]*(?:p47new|war_thunder|p47-weathered)/));
const start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\n  root.updateMatrixWorld(true);',start);
vm.runInThisContext(html.slice(start,end)+'\nthrow Error("native rig fell through to destructive legacy path");}');
function load(file){const b=fs.readFileSync(path.join(root,file));return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no));}
function triangles(frame){let n=0;frame.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;}
function trueBounds(frame){const box=new THREE.Box3(),v=new THREE.Vector3();frame.updateMatrixWorld(true);frame.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)box.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return box;}
(async()=>{
 const file='assets/aircraft/p47-independent.glb',g=await load(file),raw=g.scene,frame=new THREE.Group();frame.add(raw);
 const before=triangles(frame),size=trueBounds(frame).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.42)<.002);assert(Math.abs(size.z-10.9982)/10.9982<.01);
 let meshCount=0;frame.traverse(o=>{if(o.isMesh)meshCount++;});assert(meshCount<=40);assert(before<=100000);assert(fs.statSync(path.join(root,file)).size<12*1024*1024);
 assert.match(rigModel(frame,'p47'),/native independent/);AircraftArticulation.install(frame,'p47');assert.equal(triangles(frame),before,'no duplicate/removal by runtime rig');
 assert.equal(frame.getObjectByName('gear').children.length,3);assert.equal(frame.getObjectByName('flightFlaps').children.length,2);
 const tyres=[];frame.traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});assert.equal(tyres.length,3);
 const tyreSizes=tyres.map(tyre=>{const s=trueBounds(tyre).getSize(new THREE.Vector3());assert(s.x<s.y*.45);assert(Math.abs(s.y-s.z)/Math.max(s.y,s.z)<.035,'original tyre circular sections preserved');return s.toArray();});
 const left=frame.getObjectByName('GearLeft'),right=frame.getObjectByName('GearRight'),rotor=frame.getObjectByName('prop');assert(rotor&&triangles(rotor)>6000);const rotorFaces=triangles(rotor);
 let tip=null,maxRadius=0;rotor.updateMatrixWorld(true);rotor.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i);const r=Math.hypot(v.x,v.y);if(r>maxRadius){maxRadius=r;tip={m,i};}}});assert(maxRadius>1.9&&maxRadius<2.1);
 const point=()=>tip.m.localToWorld(new THREE.Vector3().fromBufferAttribute(tip.m.geometry.attributes.position,tip.i));const at=point();const shaft=new THREE.Vector3(0,0,1).applyQuaternion(rotor.quaternion);rotor.rotation.z+=.4;frame.updateMatrixWorld(true);const after=point();assert(at.distanceTo(after)>.65);assert(Math.abs(after.clone().sub(at).dot(shaft))<.0001,'tip rotates in actual shaft plane');
 AircraftArticulation.pose(frame,.5,{left:.8,right:.2});assert(Math.abs(left.rotation.z-.74)<1e-6);assert(Math.abs(right.rotation.z+.74)<1e-6);assert(frame.getObjectByName('FlapLeft').rotation.x<frame.getObjectByName('FlapRight').rotation.x);
 AircraftArticulation.controls(frame,.6,-.5);assert(frame.getObjectByName('AileronLeft').rotation.x>0&&frame.getObjectByName('AileronRight').rotation.x<0);assert(frame.getObjectByName('ElevatorLeft').rotation.x>0);
 AircraftArticulation.pose(frame,0,{left:0,right:0});assert.equal(frame.getObjectByName('gear').visible,false);AircraftArticulation.pose(frame,1,{left:0,right:0});
 const supports=AircraftGround.supports(frame,'p47');assert.equal(supports.length,3);
 let groundHeight=null,propellerEnvelopeHeight=null,finHeight=null;const ground=[];for(const height of [()=>0,(x,z)=>.03*x+.018*z]){delete frame.userData.groundSupports;const fit=AircraftGround.fit(frame,'p47',0,0,.35,height),gaps=fit.contacts.map(p=>fit.y+p.y-height(p.x,p.z));assert(gaps.every(g=>Math.abs(g)<.005));ground.push(gaps);if(groundHeight===null){let top=-Infinity;frame.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).applyQuaternion(fit.quaternion);top=Math.max(top,fit.y+p.y);}});groundHeight=top;const centre=rotor.getWorldPosition(new THREE.Vector3()).applyQuaternion(fit.quaternion);const worldShaft=shaft.clone().applyQuaternion(fit.quaternion);propellerEnvelopeHeight=fit.y+centre.y+maxRadius*Math.sqrt(1-worldShaft.y**2);}}
 const clone=frame.clone(true);AircraftArticulation.pose(clone,.25,{left:1,right:0});assert.notEqual(clone.getObjectByName('GearLeft').rotation.z,left.rotation.z);assert.equal(left.rotation.z,0,'AI clone cannot retract player gear');
 const ports=['Left','Right'].flatMap(s=>[1,2,3,4].map(i=>frame.getObjectByName('GunMuzzle'+s+i)));assert(ports.every(Boolean));assert.equal(new Set(ports).size,8);const muzzlePositions=ports.map(p=>frame.worldToLocal(p.getWorldPosition(new THREE.Vector3())).toArray());assert(muzzlePositions.every(p=>Math.abs(p[0])>2.7&&Math.abs(p[0])<3.3&&p[2]>2.5));
 const paint=[];frame.traverse(m=>{if(m.isMesh&&m.material.name.startsWith('Own P-47'))paint.push(m.material);});assert(paint.every(m=>m.map&&m.metalnessMap&&m.roughnessMap&&!m.normalMap));
 assert.equal(g.animations.length,4);const clean=await load(file),mixer=new THREE.AnimationMixer(clean.scene);for(const clip of clean.animations){mixer.clipAction(clip).play();mixer.update(.25);clean.scene.traverse(o=>assert(o.quaternion.toArray().every(Number.isFinite)));mixer.stopAllAction();}
 const report={nativeP47:true,triangles:before,meshCount,bytes:fs.statSync(path.join(root,file)).size,span:size.x,length:size.z,roundTyres:tyreSizes,parkedHighestVertexMetres:groundHeight,parkedPropellerEnvelopeHeightMetres:propellerEnvelopeHeight,originalRotorFaces:rotorFaces,propellerRadius:maxRadius,shaftPlaneDriftMetres:Math.abs(after.clone().sub(at).dot(shaft)),ground,cloneSafe:true,muzzlePositions,clips:g.animations.map(c=>c.name),scope:'Node geometry/production-rig test; no physical iPad or historical-cross-section approval'};
 fs.writeFileSync(path.join(root,'app/release/model-review/p47/geometry-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
