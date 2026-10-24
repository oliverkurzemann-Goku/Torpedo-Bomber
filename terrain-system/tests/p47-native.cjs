/* Independent P-47: actual r128 decoder, production rig, mesh identity and tyre contact. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub(),createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:[60,60,60,255]})})})};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const urls=html.match(/p47:\s*(\[[\s\S]*?\]),/)[1];assert.deepEqual(JSON.parse(urls.replaceAll("'",'"')),['assets/aircraft/p47-independent.glb']);
const start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\n  root.updateMatrixWorld(true);',start);
vm.runInThisContext(html.slice(start,end)+'\nthrow Error("native rig fell through to destructive legacy path");}');
function load(file){const b=fs.readFileSync(path.join(root,file));return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no));}
function triangles(frame){let n=0;frame.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;}
function bounds(frame){const box=new THREE.Box3(),v=new THREE.Vector3();frame.updateMatrixWorld(true);frame.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)box.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return box;}
(async()=>{
 const g=await load('assets/aircraft/p47-independent.glb'),frame=new THREE.Group();frame.add(g.scene);
 const before=triangles(frame),size=bounds(frame).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.42)<.001);assert(Math.abs(size.z-11.004575)<.002);
 let meshCount=0;frame.traverse(o=>{if(o.isMesh)meshCount++;});assert(meshCount<=45);assert(before<95000);
 assert.match(rigModel(frame,'p47'),/native weathered/);AircraftArticulation.install(frame,'p47');
 assert.equal(triangles(frame),before,'native integration never cuts or duplicates skin');assert.equal(frame.getObjectByName('gear').children.length,3);assert.equal(frame.getObjectByName('flightFlaps').children.length,2);
 const tyres=[];frame.traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});assert.equal(tyres.length,3);
 for(const tyre of tyres){const b=bounds(tyre),s=b.getSize(new THREE.Vector3());assert(Math.abs(s.y-s.z)<.016,'round tyre retained');assert(s.x<s.y*.4);}
 const left=frame.getObjectByName('GearLeft'),right=frame.getObjectByName('GearRight'),rotor=frame.getObjectByName('prop');assert(rotor&&triangles(rotor)>9000,'original four-blade assembly retained');assert(left.position.z>2.3&&right.position.z>2.3);
 const blade=rotor.children.find(o=>o.isMesh),v=new THREE.Vector3().fromBufferAttribute(blade.geometry.attributes.position,0);frame.updateMatrixWorld(true);const a=blade.localToWorld(v.clone());rotor.rotation.z+=.31;frame.updateMatrixWorld(true);assert(a.distanceTo(blade.localToWorld(v.clone()))>.01);
 AircraftArticulation.pose(frame,.5,{left:.8,right:.2});assert(Math.abs(left.rotation.z-.74)<1e-6);assert(Math.abs(right.rotation.z+.74)<1e-6);assert(frame.getObjectByName('TailGear').rotation.x<-.7);assert(frame.getObjectByName('FlapLeft').rotation.x<frame.getObjectByName('FlapRight').rotation.x);
 AircraftArticulation.controls(frame,.6,-.5);assert(frame.getObjectByName('AileronLeft').rotation.x>0&&frame.getObjectByName('AileronRight').rotation.x<0);assert(frame.getObjectByName('ElevatorLeft').rotation.x>0);
 const points=AircraftArticulation.p47Muzzles(frame);assert.equal(points.length,8);assert(points.every(p=>Math.abs(p.x)>1.8&&p.z>2));
 const braces=['GearLeft','GearRight'].map(name=>frame.getObjectByName(name+'_original_outer_brace'));assert(braces.every(Boolean),'both original outer rods are articulated');assert(braces.every((o,i)=>o.parent.name===['GearLeft','GearRight'][i]));
 AircraftArticulation.pose(frame,0,{left:0,right:0});assert(braces.every(o=>{for(let p=o;p;p=p.parent)if(!p.visible)return true;return false;}),'no fixed struts left under retracted wings');assert.equal(frame.getObjectByName('gear').visible,false);AircraftArticulation.pose(frame,1,{left:0,right:0});assert.equal(frame.getObjectByName('gear').visible,true);
 AircraftArticulation.controls(frame,0,0);
 const ground=[];for(const height of [()=>0,(x,z)=>.03*x+.018*z]){delete frame.userData.groundSupports;const fit=AircraftGround.fit(frame,'p47',0,0,.35,height),gaps=fit.contacts.map(p=>fit.y+p.y-height(p.x,p.z));assert(gaps.every(g=>Math.abs(g)<1e-5));ground.push(gaps);}
 const fit=AircraftGround.fit(frame,'p47',0,0,0,()=>0);let aftClearance=Infinity;frame.updateMatrixWorld(true);frame.traverse(o=>{if(!o.isMesh||/Gear/.test(o.name))return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(v.z<-4)aftClearance=Math.min(aftClearance,v.applyQuaternion(fit.quaternion).y+fit.y);}});assert(aftClearance>.4,'extended tailwheel keeps tail clear of ground');
 const clone=frame.clone(true),other=clone.getObjectByName('GearLeft');AircraftArticulation.pose(clone,.25,{left:1,right:0});assert.notEqual(other.rotation.z,left.rotation.z);assert.equal(left.rotation.z,0,'AI clone cannot retract player gear');
 let pbr=false;frame.traverse(o=>{if(o.isMesh&&o.material.map&&o.material.normalMap&&o.material.metalnessMap&&o.material.roughnessMap)pbr=true;});assert(pbr,'all original wear PBR layers decoded');assert.equal(g.animations.length,4);
 console.log(JSON.stringify({nativeP47:true,triangles:before,meshCount,span:size.x,length:size.z,roundTyres:tyres.length,originalRotorFaces:triangles(rotor),ground,aftClearance,cloneSafe:true,muzzles:points.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
