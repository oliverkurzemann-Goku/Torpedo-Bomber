'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(v){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));require('../../sbd-native.js');require('../../aircraft-articulation.js');
vm.runInThisContext(fs.readFileSync('terrain-system/AircraftGround.js','utf8'));
(async()=>{
 const b=fs.readFileSync('assets/aircraft/sbd-dauntless.glb'),gl=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no));
 assert.equal(gl.animations.length,7);const mixer=new THREE.AnimationMixer(gl.scene);
 for(const clip of gl.animations){mixer.clipAction(clip).play();mixer.update(.25);gl.scene.traverse(o=>assert(o.quaternion.toArray().every(Number.isFinite)));mixer.stopAllAction();}
 const frame=new THREE.Group();frame.add(gl.scene);AircraftArticulation.install(frame,'sbd');assert(frame.userData.nativeSBD);
 const size=new THREE.Box3().setFromObject(frame).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.66)<.002);assert(size.z>9.5&&size.z<9.53);
 let triangles=0;frame.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});assert.equal(triangles,73414);assert.equal(b.length,7229376);
 const rotor=frame.getObjectByName('sbdRotorBlade');let tip=null,radius=0;
 rotor.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=rotor.worldToLocal(m.localToWorld(new THREE.Vector3().fromBufferAttribute(a,i))),r=Math.hypot(v.x,v.y);if(r>radius){radius=r;tip={m,i};}}});
 assert(radius>1.6&&radius<1.9);const position=()=>tip.m.localToWorld(new THREE.Vector3().fromBufferAttribute(tip.m.geometry.attributes.position,tip.i));rotor.updateMatrixWorld(true);const at=position();rotor.rotation.z+=.3;rotor.updateMatrixWorld(true);assert(at.distanceTo(position())>.4);
 const clone=frame.clone(true);SBDRig.update(clone,{gear:0,flaps:{left:.8,right:.2},dive:.4,hook:1,bombs:0,roll:.7,pitch:.5});
 assert(Math.abs(frame.getObjectByName('GearLeft').rotation.z+Math.PI/2)<1e-6);assert(Math.abs(clone.getObjectByName('GearLeft').rotation.z)<1e-8);assert(!clone.getObjectByName('CenterBomb').visible);assert(frame.getObjectByName('CenterBomb').visible);
 const rear=SBDRig.rear(clone);assert.equal(rear.ports.length,2);SBDRig.aimRear(clone,new THREE.Vector3(.3,.4,-1).normalize(),.5);assert(rear.pivot.quaternion.angleTo(frame.getObjectByName('RearGun').quaternion)>.1);
 const supports=AircraftGround.supports(frame,'carrier');assert.equal(supports.length,3);const fit=AircraftGround.fit(frame,'carrier',0,0,0,()=>20);assert(fit);
 for(const vertices of supports){let low=Infinity;for(let i=0;i<vertices.length;i+=3)low=Math.min(low,new THREE.Vector3().fromArray(vertices,i).applyQuaternion(fit.quaternion).y);assert(Math.abs(fit.y+low-20)<.003);}
 const wrapper=new THREE.Group();wrapper.add(clone);clone.rotation.y=Math.PI;wrapper.updateMatrixWorld(true);assert(SBDRig.frontMuzzles(clone,wrapper).every(v=>v.z<-4));
 console.log({nativeSBD:true,bytes:b.length,triangles,span:size.x,propellerRadius:radius,gearContacts:supports.length,cloneSafe:true,clips:gl.animations.map(c=>c.name)});
})().catch(e=>{console.error(e);process.exitCode=1;});
