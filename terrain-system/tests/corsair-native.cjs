'use strict';
/* F4U-1D Corsair (v3, supplied model finalised by scripts/finalize-corsair-v3.cjs, Build 233):
 * glTF validity, native-rig contract, the rig against the GLB's own clips, tyre contacts, stores, muzzles. */
const validator=require('gltf-validator'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));require('../../corsair-native.js');require('../../aircraft-articulation.js');vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const bytes=fs.readFileSync(path.join(root,'assets/aircraft/corsair-f4u1d-own.glb'));
const rawPath=path.join(root,'assets/aircraft/source/corsair-f4u1d-v3/Corsair_F4U1D_Review.glb');
const deg=r=>r*180/Math.PI;
(async()=>{
 const v=await validator.validateBytes(new Uint8Array(bytes));assert.equal(v.issues.numErrors,0,'validator errors: '+JSON.stringify(v.issues.messages.filter(m=>m.severity===0).slice(0,3)));assert.equal(v.issues.numWarnings,0);
 const gl=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no));
 // provenance: the shipped file names the unmodified source it was made from, and that source is in the repository
 const asset=gl.parser.json.asset.extras;assert.equal(asset.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex'),'source hash');assert.equal(asset.source,'assets/aircraft/source/corsair-f4u1d-v3/Corsair_F4U1D_Review.glb');assert(!/^project-own/i.test(asset.license),'rights must not be claimed as project-own');
 assert(/TEXCOORD_0/.test(asset.modifications[0])&&/groundWheel/.test(asset.modifications[1])&&/Rocket/.test(asset.modifications[2]));
 const model=new THREE.Group();model.add(gl.scene);let before=0;model.traverse(o=>{if(o.isMesh)before+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3});
 const source=model.getObjectByName('CorsairF4U1D_Original');assert.equal(source.userData.nativeAircraft,'corsair-f4u1d-original-v3');
 assert(CorsairRig.isNative(model),'native contract');
 const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());assert(Math.abs(size.x-12.4968)<1e-3,'span '+size.x);assert(Math.abs(size.z-10.058)<.02,'length '+size.z);
 const names=gl.animations.map(c=>c.name).sort();assert.deepEqual(names,['Ailerons_Right','Canopy_Open','Elevator_Up','Flaps_Down','Gear_Retract','Hook_Down','Propeller_Spin','Rudder_Right','Wings_Fold']);
 // named parts the game and the rig rely on
 for(const n of ['LandingGear','GearLeft','GearRight','WheelAxleLeft','WheelAxleRight','TailGear','ArrestorHook','Propeller','BubbleCanopyGlass','CanopySlide','Rudder','ElevatorLeft','ElevatorRight','AileronLeft','AileronRight','BombLeft','BombRight',
  ...['Inner','Middle','Outer'].flatMap(s=>['Left','Right'].map(k=>s+'Flap'+k)),...[1,2,3].flatMap(i=>['Left','Right'].map(k=>'Muzzle'+k+i)),...[0,1,2,3,4,5,6,7].map(i=>'Rocket'+i)])assert(model.getObjectByName(n),'missing '+n);
 const hood=model.getObjectByName('BubbleCanopyGlass');assert(hood.material.transparent&&hood.material.opacity<.5,'clear cockpit glazing');
 const hoodSize=new THREE.Box3().setFromObject(hood).getSize(new THREE.Vector3());assert(hoodSize.x>.55&&hoodSize.x<1.0&&hoodSize.y>.35&&hoodSize.y<.8&&hoodSize.z>1.0&&hoodSize.z<2.0,'bubble hood proportions '+hoodSize.toArray());
 // every textured mesh has UVs (the supplied file lacked them on three primitives)
 model.traverse(o=>{if(o.isMesh&&o.material.map)assert(o.geometry.attributes.uv,'UV missing on '+o.name);});

 AircraftArticulation.install(model,'corsair');assert(model.userData.nativeCorsair);AircraftArticulation.install(model,'corsair');assert(!model.getObjectByName('flightFlaps'));
 // the rig must agree with the clips the model itself ships: compare the last keyframe of each track with the rig's pose
 const finalQ=(clip,node)=>{const t=clip.tracks.find(t=>t.name===node+'.quaternion');assert(t,clip.name+' has no track for '+node);return new THREE.Quaternion().fromArray(t.values,t.values.length-4);};
 const clip=n=>gl.animations.find(c=>c.name===n),rest=new THREE.Quaternion();
 CorsairRig.update(model,{gear:0,flaps:{left:1,right:1},hook:1,roll:0,pitch:0,bombs:2,rockets:8});
 for(const [clipName,node]of [['Gear_Retract','GearLeft'],['Gear_Retract','GearRight'],['Gear_Retract','WheelAxleLeft'],['Gear_Retract','WheelAxleRight'],['Gear_Retract','TailGear'],['Hook_Down','sbdHook'],
  ...['Inner','Middle','Outer'].flatMap(s=>['Left','Right'].map(k=>['Flaps_Down',s+'Flap'+k]))]){
  const want=finalQ(clip(clipName),node==='sbdHook'?'ArrestorHook':node),got=model.getObjectByName(node).quaternion;
  assert(got.angleTo(want)<.03,clipName+' / '+node+': rig differs from the shipped clip by '+deg(got.angleTo(want)).toFixed(2)+' deg');
 }
 // control surfaces: full deflection direction and size
 const turn=(node,roll,pitch)=>{CorsairRig.update(model,{gear:1,roll,pitch});return model.getObjectByName(node).quaternion.clone();};
 const rollQ=finalQ(clip('Ailerons_Right'),'AileronLeft'),pullQ=finalQ(clip('Elevator_Up'),'ElevatorLeft'),rudQ=finalQ(clip('Rudder_Right'),'Rudder');
 assert(turn('AileronLeft',1,0).angleTo(rollQ)<.04&&turn('AileronRight',1,0).angleTo(finalQ(clip('Ailerons_Right'),'AileronRight'))<.04,'aileron direction/size');
 assert(turn('ElevatorLeft',0,-1).angleTo(pullQ)<.04,'elevator direction/size (stick back = trailing edge up)');
 assert(turn('Rudder',1,0).angleTo(rudQ)<.04,'rudder direction/size');

 const tyres=[];model.traverse(o=>{if(o.isMesh&&o.userData.groundWheel)tyres.push(o.name);});assert.deepEqual(tyres.sort(),['Main_wheel_Left_tyre','Main_wheel_Right_tyre','Tailwheel_tyre']);   // GLTFLoader turns spaces in node names into underscores

 // stores: eight rockets alternate port/starboard, inner pair first; bombs sit under the inner wing
 CorsairRig.update(model,{gear:1,bombs:2,rockets:8});model.updateMatrixWorld(true);
 const at=n=>CorsairRig.position(model,n),xs=[0,1,2,3,4,5,6,7].map(i=>at('Rocket'+i).x);
 xs.forEach((x,i)=>assert(i%2?x>0:x<0,'Rocket'+i+' on the wrong wing: '+x));
 for(let k=0;k<4;k++){assert(Math.abs(xs[2*k]+xs[2*k+1])<.02,'pair '+k+' not symmetric');if(k)assert(Math.abs(xs[2*k])>Math.abs(xs[2*k-2])+.2,'pairs not ordered inner to outer');}
 assert(at('BombLeft').x<0&&at('BombRight').x>0&&Math.abs(at('BombLeft').x)<Math.abs(xs[0]));
 // clone safety, store visibility, gear pose, triangle count constant
 CorsairRig.update(model,{gear:0,dive:1,flaps:{left:1,right:.2},roll:.8,pitch:.5,bombs:2,rockets:8});
 assert(model.getObjectByName('sbdGear').visible);assert.equal(model.getObjectByName('GearLeft').rotation.x,0);assert.equal(model.getObjectByName('TailGear').visible,false);
 for(const section of ['Inner','Middle','Outer'])assert(Math.abs(model.getObjectByName(section+'FlapLeft').quaternion.angleTo(new THREE.Quaternion())-50*Math.PI/180)<1e-6);
 const q=model.getObjectByName('AileronLeft').quaternion.clone();assert(q.angleTo(new THREE.Quaternion())>.19);
 const clone=model.clone(true);CorsairRig.update(clone,{gear:1,flaps:{left:0,right:0},bombs:1,rockets:7});assert(model.getObjectByName('AileronLeft').quaternion.equals(q));assert(clone.getObjectByName('TailGear').visible);
 assert(!clone.getObjectByName('BombRight').visible);assert(clone.getObjectByName('BombLeft').visible);assert(!clone.getObjectByName('Rocket7').visible);assert(model.getObjectByName('Rocket7').visible);
 const muz=CorsairRig.muzzles(model,model);assert.equal(muz.length,6);
 muz.slice(0,3).forEach((m,i)=>{const r=muz[3+i];assert(Math.abs(m.x+r.x)<.01&&Math.abs(m.y-r.y)<.01&&Math.abs(m.z-r.z)<.01,'muzzles not mirrored');assert(m.x<-2&&m.z>1&&m.z<2,'muzzle position '+m.toArray());});
 CorsairRig.update(model,{gear:0,dive:0});assert(!model.getObjectByName('sbdGear').visible);CorsairRig.update(model,{gear:.5});assert(Math.abs(model.getObjectByName('GearLeft').rotation.x-Math.PI/4)<1e-10);
 CorsairRig.update(model,{gear:1});let after=0;model.traverse(o=>{if(o.isMesh)after+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3});assert.equal(after,before);
 // tyre contacts: three real tyres sit on a flat and on an inclined deck
 const ground=[];for(const h of [()=>0,(x,z)=>.03*x+.018*z]){delete model.userData.groundSupports;const fit=AircraftGround.fit(model,'carrier',0,0,.35,h),gaps=fit.contacts.map(p=>fit.y+p.y-h(p.x,p.z));assert.equal(gaps.length,3);assert(gaps.every(g=>Math.abs(g)<.003),'tyre gaps '+gaps);ground.push(gaps);}
 delete model.userData.groundSupports;const flat=AircraftGround.fit(model,'carrier',0,0,0,()=>0);
 console.log(JSON.stringify({nativeCorsair:true,version:source.userData.nativeAircraft,triangles:before,size,hood:hoodSize,rocketX:xs.map(x=>+x.toFixed(2)),muzzles:muz.map(m=>m.toArray().map(x=>+x.toFixed(2))),ground,deckPitchDeg:flat.pitch!=null?+deg(flat.pitch).toFixed(2):null,fit:Object.keys(flat),clips:gl.animations.map(c=>c.name),validation:{errors:v.issues.numErrors,warnings:v.issues.numWarnings}},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
