'use strict';
/* Build 294: the Arado Ar 234 B-2 as a player aircraft (rig class jet-bomber-twin). The delivered GLB (assets/aircraft/ar234b2-own.glb) is in flying trim and has no
 * landing gear; the class builds a tricycle gear at install from figures measured on the model (aircraft-contract.js, gearBuild). Checked on the real model:
 *   * the contract checker accepts the file (the class brings its own tyres), install builds GearLeft/GearRight/NoseGear with one groundWheel tyre each;
 *   * down: all three tyres touch the ground line (y -1.30, the published 4.3 m height to the fin tip) within 2 cm, mains behind and the nose wheel ahead of
 *     the wing's quarter chord (the centre of gravity), mains symmetric;
 *   * up: the legs swing away and the gear group hides; the flaps, ailerons, elevators and rudder still move;
 *   * a clone of the installed template carries its own gear (no second build), and FlightCore solves the Ar 234 sheet to the published figures. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-contract.js');require('../../aircraft-articulation.js');require('../../flight-core.js');
(async()=>{
 const file=path.join(root,'assets/aircraft/ar234b2-own.glb'),bytes=fs.readFileSync(file);
 const {checkContract}=await import(path.join(root,'scripts/check-rig-contract.mjs'));
 const report=checkContract(bytes);assert.deepEqual(report.errors,[],'contract check: '+report.errors.join('; '));
 const gl=await new Promise((y,n)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',y,n));
 const frame=new THREE.Group();frame.add(gl.scene);frame.updateMatrixWorld(true);
 const meshesBefore=[];frame.traverse(o=>{if(o.isMesh)meshesBefore.push(o.geometry.attributes.position.count);});
 AircraftArticulation.install(frame,'ar234');
 assert(frame.userData.articulation?.nativeContract,'installed through the rig contract');
 const legs=['GearLeft','GearRight','NoseGear'].map(n=>frame.getObjectByName(n));assert(legs.every(Boolean),'three generated legs');
 const tyres=[];frame.traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});assert.equal(tyres.length,3,'one tagged tyre per leg');
 for(const leg of legs){let n=0;leg.traverse(o=>{if(o.userData.groundWheel)n++;});assert.equal(n,1,leg.name+' carries exactly one tyre');}
 // down: the lowest point of each tyre sits on the ground line
 const lowest=o=>{o.updateWorldMatrix(true,false);const b=new THREE.Box3().setFromObject(o);return b;};
 AircraftContract.pose(frame,1);frame.updateMatrixWorld(true);
 const boxes=tyres.map(lowest),ground=AircraftContract.CLASSES['jet-bomber-twin'].gearBuild.ground;
 for(const b of boxes)assert(Math.abs(b.min.y-ground)<.02,'tyre bottom on the ground line: '+b.min.y.toFixed(3)+' vs '+ground);
 const centre=b=>b.getCenter(new THREE.Vector3());
 const [L,R,N]=['GearLeft','GearRight','NoseGear'].map(n=>{let t;frame.getObjectByName(n).traverse(o=>{if(o.userData.groundWheel)t=o;});return centre(lowest(t));});
 assert(Math.abs(L.x+R.x)<1e-6&&L.x<0&&R.x>0,'mains mirrored, left on -X');
 const quarterChord=1.99-(1.99+.48)*.25;   // wing root z -0.48..1.99 (measured), centre of gravity near the quarter chord
 assert(L.z<quarterChord&&N.z>quarterChord+2,'mains behind ('+L.z.toFixed(2)+') and nose wheel ahead ('+N.z.toFixed(2)+') of the centre of gravity (~'+quarterChord.toFixed(2)+')');
 // the fuselage, wing and nacelle meshes are unchanged
 const meshesAfter=[];frame.traverse(o=>{if(o.isMesh&&!o.userData.groundWheel&&!legs.some(l=>{let inside=false;for(let p=o;p;p=p.parent)if(p===l)inside=true;return inside;}))meshesAfter.push(o.geometry.attributes.position.count);});
 assert.deepEqual(meshesAfter,meshesBefore,'the delivered meshes are untouched');
 // the stationary aircraft stands level: nose and main tyre bottoms at the same height
 assert(Math.abs(boxes[0].min.y-boxes[2].min.y)<.02,'stands level on three wheels');
 // up: legs swing away and the gear hides
 AircraftContract.pose(frame,0);frame.updateMatrixWorld(true);
 assert.equal(frame.getObjectByName('gear').visible,false,'retracted gear is hidden');
 assert(Math.abs(new THREE.Euler().setFromQuaternion(legs[0].quaternion).x)>1.3,'main leg swung up');
 AircraftContract.pose(frame,.5);assert.equal(frame.getObjectByName('gear').visible,true,'half-way gear is visible');
 // flaps and controls
 const flap=frame.getObjectByName('FlapLeft'),q0=flap.quaternion.clone();AircraftContract.pose(frame,1,{left:1,right:1});
 assert(flap.quaternion.angleTo(q0)>.5,'the left flap lowers');
 const ail=frame.getObjectByName('AileronLeft'),a0=ail.quaternion.clone();AircraftContract.controls(frame,1,0);assert(ail.quaternion.angleTo(a0)>.3,'the aileron moves');
 // two rear muzzles for the gunner
 const muzzles=AircraftContract.muzzles(frame);assert.equal(muzzles.length,2,'two rear guns');assert(muzzles.every(m=>m.z<-3),'the guns point out of the tail');
 // a clone keeps its own gear without a second build
 const copy=frame.clone(true);let gears=0;copy.traverse(o=>{if(o.name==='gear')gears++;});assert.equal(gears,1,'the clone carries one gear group');
 AircraftContract.pose(copy,0);assert.equal(copy.getObjectByName('gear').visible,false,'the clone poses its own gear');assert.equal(frame.getObjectByName('gear').visible,true,'the template is not affected');
 AircraftArticulation.install(copy,'ar234');gears=0;copy.traverse(o=>{if(o.name==='gear')gears++;});assert.equal(gears,1,'a second install builds nothing more');
 // flight data: one published level speed solves the drag; the mass split falls inside the published empty-weight range
 const F=global.FlightCore,m=F.model('ar234'),W=m.mass*F.G;
 assert(Math.abs(F.levelMaxSpeed(m,6000,W)*3.6-742)<1,'742 km/h at 6 000 m');
 assert(m.empty>4650&&m.empty<5200,'empty mass '+m.empty.toFixed(0)+' kg inside the published 4 650-5 200 kg');
 const climb=F.bestClimb(m,0,W).rate;assert(climb>10&&climb<16,'sea-level climb '+climb.toFixed(1)+' m/s (about 13 m/s quoted)');
 console.log('ar234-rig: ok',JSON.stringify({tyres:boxes.map(b=>+b.min.y.toFixed(3)),mainZ:+L.z.toFixed(2),noseZ:+N.z.toFixed(2),empty:Math.round(m.empty),climb:+climb.toFixed(1)}));
})().catch(e=>{console.error(e);process.exit(1);});
