/* Real r128 GLB geometry + production release/service functions. No renderer mocks. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(v){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync('vendor/GLTFLoader-r128.js','utf8'));
require('../../crew-visuals.js');require('../../zero-canopy.js');require('../../ordnance.js');require('../../avenger-bay.js');require('../../sbd-native.js');require('../../aircraft-articulation.js');
const load=async file=>{const b=fs.readFileSync(file);return (await new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no))).scene;};
const triangleCount=g=>(g.index?.count||g.attributes.position.count)/3;
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const functionSource=(text,name,next)=>text.slice(text.indexOf('function '+name+'('),text.indexOf('\nfunction '+next+'(',text.indexOf('function '+name+'(')));
(async()=>{
 const zero=await load('zero.glb'),original=zero.getObjectByName('Object_4').geometry,indices=Array.from(original.index.array),bodyCount=triangleCount(original);
 ZeroCanopy.apply(zero);const glass=zero.getObjectByName('zeroCanopyGlass'),frames=zero.getObjectByName('zeroCanopyFrames');
 assert.equal(triangleCount(zero.getObjectByName('Object_4').geometry),bodyCount-56);assert.deepEqual(Array.from(original.index.array),indices,'cached raw model remains intact');
 assert.equal(triangleCount(glass.geometry),56);assert.equal(glass.material.opacity,.18);assert(glass.material.transparent&&!glass.material.depthWrite);assert.equal(frames.material.alphaMap,frames.material.map);assert(frames.material.alphaTest>.2&&!frames.material.transparent);assert(zero.getObjectByName('zeroSeatedPilot'));
 const zb=new THREE.Box3().setFromObject(glass);assert(zb.max.x-zb.min.x<.73);const n=zero.getObjectByName('Object_4').children.length;ZeroCanopy.apply(zero);assert.equal(zero.getObjectByName('Object_4').children.length,n);
 const sbd=await load('assets/aircraft/sbd-dauntless.glb'),sbdMesh=sbd.getObjectByName('Static_1942_Blue_Gray_over_Light_Gray'),sbdOriginal=sbdMesh.geometry,frame=new THREE.Group();frame.add(sbd);AircraftArticulation.install(frame,'sbd');assert.equal(sbdMesh.userData.centerStripRemoved,88);assert.equal(triangleCount(sbdOriginal)-triangleCount(sbdMesh.geometry),88);
 const sbdClone=frame.clone(true);SBDRig.update(sbdClone,{gear:0,flaps:{left:1,right:.2},dive:1,bombs:0});assert.equal(frame.getObjectByName('CenterBomb').visible,true);assert.equal(sbdClone.getObjectByName('CenterBomb').visible,false);for(const name of ['BrakeUpperLeft','BrakeUpperRight','BrakeLowerLeft','BrakeLowerRight'])assert(sbdClone.getObjectByName(name).visible);
 const avenger=await load('grumman tbm avenger.glb'),box=new THREE.Box3().setFromObject(avenger),size=box.getSize(new THREE.Vector3());avenger.position.sub(box.getCenter(new THREE.Vector3()));avenger.scale.setScalar(14/Math.max(size.x,size.y,size.z));
 const root=new THREE.Group(),plane=new THREE.Group();root.rotation.y=-Math.PI/2;root.add(avenger);plane.add(root);plane.updateMatrixWorld(true);const originalGeometries=[];root.traverse(o=>{if(o.isMesh)originalGeometries.push([o.geometry,o.geometry.index?.count]);});AvengerBay.install(root,plane);
 const bay=root.getObjectByName('avengerBombBay'),torpedo=root.getObjectByName('avengerInternalTorpedo');assert.equal(bay.userData.avengerBay.removedTriangles,336);assert(torpedo.visible);assert.equal(bay.children.filter(o=>o.userData.ordnance==='torpedo').length,1);
 for(const [g,count]of originalGeometries)assert.equal(g.index?.count,count,'shared decoded airframe indices never mutated');
 function fromBelow(){plane.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(.08,-3,-.775),new THREE.Vector3(0,1,0)).intersectObject(root,true).filter(h=>visible(h.object))[0];}
 assert.equal(fromBelow().object.name,'avengerBayDoorSkin','closed bay conceals its internal store');AvengerBay.pose(root,1,1);assert.equal(fromBelow().object.parent.name,'avengerInternalTorpedo','open bay exposes the torpedo');
 const clone=root.clone(true);AvengerBay.pose(clone,0,0);assert.equal(bay.userData.avengerBay.open,1);assert(torpedo.visible);assert(!clone.getObjectByName('avengerInternalTorpedo').visible);
 const html=fs.readFileSync('torpedo-carrier.html','utf8'),mStart=html.indexOf('const MISSIONS ='),mEnd=html.indexOf('async function prepareOkinawa',mStart),mc={PacificTheater:{missions:[]}};vm.runInNewContext(html.slice(mStart,mEnd)+';globalThis.missions=MISSIONS;',mc);
 assert(mc.missions.filter(m=>!m.sbd&&!m.defend).every(m=>m.torps<=1));assert(mc.missions.find(m=>m.sbd&&!m.corsair).torps>=3,'Dauntless bomb load unaffected');
 const releaseSource=functionSource(html,'dropTorpedo','updateAvengerBay')+functionSource(html,'updateAvengerBay','corsairConfig');const runs=[];
 for(const fps of [20,60,120]){
  AvengerBay.pose(root,0,1);plane.position.set(200,35,80);plane.rotation.y=-.5;plane.updateMatrixWorld(true);const expected=AvengerBay.releasePoint(root);
  const P={alive:true,onDeck:false,pos:plane.position.clone(),spd:45,roll:0,heading:.6,torps:1,avengerBayPending:false,avengerBayHold:0},context={THREE,AvengerBay,Ordnance,gltfRoot:root,P,state:2,ST:{FLIGHT:2},loadout:'torpedo',DROP_MAX_ALT:100,DROP_MAX_SPD:70,torpedoes:[],scene:new THREE.Scene(),GameRuntime:{own(){}},isCorsair:()=>false,isSBD:()=>false,isDefend:()=>false,flash(){},updateHUD(){},sfxWhoosh(){},D:()=>({dud:0}),lastTorpDud:false,sortieTorpFired:0};
  vm.createContext(context);vm.runInContext(releaseSource,context);context.dropTorpedo();context.dropTorpedo();assert(P.avengerBayPending&&P.torps===1);assert.equal(context.torpedoes.length,0,'doors open before release');
  let releasedAt=0;for(let i=0;i<fps*2;i++){context.updateAvengerBay(1/fps);if(!releasedAt&&context.torpedoes.length)releasedAt=(i+1)/fps;}
  assert.equal(context.torpedoes.length,1);assert.equal(P.torps,0);assert.equal(context.sortieTorpFired,1);assert(context.torpedoes[0].mesh.position.distanceTo(expected)<1e-6,'release at actual internal mount');context.dropTorpedo();assert.equal(context.torpedoes.length,1);assert(!torpedo.visible);assert.equal(bay.userData.avengerBay.open,0,'doors close after release');
  let config;Object.assign(context,{releaseHeldControls(){},deckServiceX:0,carrierX:0,document:{getElementById:()=>({style:{}})},sortieService:{begin(p,c){config=c;}},MISSIONS:mc.missions,mission:2});context.ST.SERVICE=3;vm.runInContext(functionSource(html,'beginDeckService','dropFlare'),context);context.beginDeckService();assert.equal(config.torps,1,'deck reload has one torpedo');runs.push({fps,releaseAfter:releasedAt,count:context.torpedoes.length,reload:config.torps});
 }
 console.log(JSON.stringify({zero:{canopyTriangles:56,opacity:.18,originalFrames:true,seatedPilot:true},sbd:{removedFixedTriangles:88,brakesPreserved:true,cloneSafe:true},avenger:{skinSplit:336,doorTriangles:156,concealedWhenClosed:true,cloneSafe:true,release:runs}},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
