'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(v){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS(){return new ImageStub();}};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));require('../../b17-native.js');require('../../aircraft-articulation.js');
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\nfunction ',start+10);vm.runInThisContext(html.slice(start,end));
function triangles(o){let n=0;o.traverse(m=>{if(m.isMesh)n+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});return n;}
(async()=>{
 const b=fs.readFileSync(path.join(root,'assets/aircraft/b17-helijah.glb'));
 const gltf=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no));
 assert.equal(gltf.animations.length,7);const mixer=new THREE.AnimationMixer(gltf.scene);
 for(const clip of gltf.animations){const action=mixer.clipAction(clip);action.play();mixer.update(.25);gltf.scene.traverse(o=>assert(o.quaternion.toArray().every(Number.isFinite)));mixer.stopAllAction();}
 const frame=new THREE.Group();frame.add(gltf.scene);const before=triangles(frame),size=new THREE.Box3().setFromObject(frame).getSize(new THREE.Vector3());
 assert(Math.abs(size.x-31.62)<.002);assert(size.z>22&&size.z<24);assert.equal(before,71535);assert(b.length<7*1024*1024);
 assert.match(rigModel(frame,'b17'),/across 4 engines/);AircraftArticulation.install(frame,'b17');assert.equal(triangles(frame),before);
 const prop=frame.getObjectByName('prop');assert.equal(prop.children.length,4);assert.equal(frame.getObjectByName('gear').children.length,3);
 const centers=[];
 for(const rotor of prop.children){
  centers.push(rotor.getWorldPosition(new THREE.Vector3()).x);let tip=null,radius=0;
  rotor.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=rotor.worldToLocal(m.localToWorld(new THREE.Vector3().fromBufferAttribute(a,i))),r=Math.hypot(v.x,v.y);if(r>radius){radius=r;tip={m,i};}}});
  assert(radius>1.6&&radius<1.9);const position=()=>tip.m.localToWorld(new THREE.Vector3().fromBufferAttribute(tip.m.geometry.attributes.position,tip.i));rotor.updateMatrixWorld(true);const a=position();rotor.rotation.z=.31;rotor.updateMatrixWorld(true);assert(a.distanceTo(position())>.4);rotor.rotation.z=0;
 }
 assert.equal(new Set(centers.map(x=>x.toFixed(2))).size,4);
 AircraftArticulation.pose(frame,.5,{left:.8,right:.2});assert(frame.getObjectByName('GearLeft').rotation.x>.7);assert(frame.getObjectByName('FlapLeft').rotation.x<frame.getObjectByName('FlapRight').rotation.x);
 AircraftArticulation.controls(frame,.6,-.5);assert(frame.getObjectByName('AileronLeft').rotation.x>0);assert(frame.getObjectByName('AileronRight').rotation.x<0);
 const clone=frame.clone(true);AircraftArticulation.pose(clone,0,{left:0,right:0});assert(!clone.getObjectByName('gear').visible);assert(frame.getObjectByName('gear').visible);
 const stations=B17Rig.stations(clone);assert.equal(stations.length,6);const beforeYaw=frame.getObjectByName('Turret_Dorsal_Yaw').rotation.y;B17Rig.track(clone,new THREE.Vector3(200,100,200),.5);assert.notEqual(clone.getObjectByName('Turret_Dorsal_Yaw').rotation.y,beforeYaw);assert.equal(frame.getObjectByName('Turret_Dorsal_Yaw').rotation.y,beforeYaw);
 for(const s of stations){const p=B17Rig.muzzle(clone,s,0);assert(p.toArray().every(Number.isFinite));assert(p.length()>1);if(s.nodes.length===2)assert(p.distanceTo(B17Rig.muzzle(clone,s,1))>.1);}
 console.log({nativeB17:true,bytes:b.length,triangles:before,span:size.x,rotors:4,gearGroups:3,gunStations:6,cloneSafe:true,clips:gltf.animations.map(c=>c.name)});
})().catch(e=>{console.error(e);process.exitCode=1;});
