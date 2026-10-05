/* Fire -> FX update -> aircraft cleanup -> FX expiry: the actual frame order,
 * actual r128 GLB models and shipped routines. Covers Zero/SBD and Avenger. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');global.THREE=THREE;global.window=global;global.self=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(e,f){this.listeners[e]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.call(this));}}
global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));
require('../../game-runtime.js');require('../../combat-fx.js');
const {GameRuntime,CombatFX}=global,root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const extract=(from,to)=>html.slice(html.indexOf('function '+from+'('),html.indexOf('\nfunction '+to+'(',html.indexOf('function '+from+'(')+1));
const gunCode=html.slice(html.indexOf('function updateGuns('),html.indexOf('function updateMinimap('));
const poseCode=html.slice(html.indexOf('function pacificGunMuzzles('),html.indexOf('// ---------- FX: explosions'));
async function glb(file){const b=fs.readFileSync(path.join(root,file));return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',g=>yes(g.scene),no));}
(async()=>{
 // Directly covers a detached effect too, e.g. a model switch/dead airframe.
 const scene=new THREE.Scene(),plane=new THREE.Group();scene.add(plane);
 const fx=CombatFX.create(scene);fx.muzzle(plane,[new THREE.Vector3()]);
 plane.remove(plane.children[0]);assert.doesNotThrow(()=>fx.update(.1));assert.equal(fx.count,0);
 for(const [kind,file] of [['zero','zero.glb'],['sbd','sbd dauntless.glb'],['avenger','grumman tbm avenger.glb']]){
  const scene=new THREE.Scene(),planeGroup=new THREE.Group(),aircraft=new THREE.Group();
  const model=await glb(file),bb=new THREE.Box3().setFromObject(model),size=bb.getSize(new THREE.Vector3());
  model.position.sub(bb.getCenter(new THREE.Vector3()));model.scale.setScalar((kind==='zero'?11:kind==='sbd'?12.7:14)/Math.max(size.x,size.y,size.z));
  const holder=new THREE.Group();holder.add(model);holder.rotation.y=kind==='avenger'?-Math.PI/2:Math.PI;
  aircraft.add(holder);planeGroup.add(aircraft);scene.add(planeGroup);
  // Original model loaded; the propeller is irrelevant to this FX lifecycle
  // check. Existing real-model prop tests independently check its geometry.
  const rotor=new THREE.Group();rotor.name='sbdRotorBlade';aircraft.add(rotor);
  const combatFX=CombatFX.create(scene),P={alive:true,pos:new THREE.Vector3(0,300,0),heading:0,pitch:0,roll:0,throttle:1,gear:0,flap:0,hook:0,torps:2,ammo:5000};
  const ctx=vm.createContext({THREE,GameRuntime,CombatFX,Math,console,P,scene,planeGroup,combatFX,
   state:3,ST:{FLIGHT:3},firing:true,gunCool:0,bullets:[],ships:[],zeros:[],raiders:[],etorps:[],shoreTargets:[],
   isDefend:()=>kind==='zero',isSBD:()=>kind==='sbd',loadout:'divebomb',
   zeroTemplate:null,fitCarrierAircraft(){},playerZero:kind==='zero'?aircraft:null,playerSBD:kind==='sbd'?aircraft:null,
   sbdRotor:kind==='sbd'?rotor:null,sbdRotorAxis:'z',zeroRotor:null,zeroRotorAxis:null,zeroProp:null,
   planeModelLoaded:kind==='avenger',gltfRoot:kind==='avenger'?aircraft:null,propSpinner:null,propPivot:null,
   gearMesh:[],gearDoors:[],gearWellCovers:[],ordTorp:null,ordBombs:null,planeBody:null,planeGear:null,
   cockpitLight:null,cockpitInterior:null,flapL:null,flapR:null,diveFlapL:null,diveFlapR:null,
   sbdFlapL:null,sbdFlapR:null,sbdDiveFlapL:null,sbdDiveFlapR:null,hookMesh:null,sbdHookMesh:null,
   document:{querySelectorAll:()=>[]},shoreHeight:()=>0,sfxGun(){},updateHUD(){},radioSay(){},
   setSBDGearVisible(){},setZeroGearVisible(){},spawnSparks(){},spawnSmoke(){},addScore(){},spawnSplash(){}
  });ctx.window={__avStash:[]};
  vm.runInContext(extract('noseDir','loadPlaneModel')+'\n'+gunCode+'\n'+poseCode,ctx);
  planeGroup.updateMatrixWorld(true);
  const ports=ctx.pacificGunMuzzles(),nearest=ports.map(()=>Infinity),tri=new THREE.Triangle(),point=new THREE.Vector3();
  function vert(attr,i){const v=new THREE.Vector3().fromBufferAttribute(attr,i);if(attr.normalized){const d=attr.array instanceof Int16Array?32767:attr.array instanceof Uint16Array?65535:1;v.multiplyScalar(1/d);}return v;}
  model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,idx=o.geometry.index;
   for(let i=0;i<(idx?.count||p.count);i+=3){
    tri.set(...[0,1,2].map(j=>vert(p,idx?idx.getX(i+j):i+j).applyMatrix4(o.matrixWorld)));
    ports.forEach((p,j)=>{tri.closestPointToPoint(p,point);nearest[j]=Math.min(nearest[j],point.distanceTo(p));});
   }
  });
  assert(nearest.every(d=>d<.13),'gun ports sit on original airframe surface: '+nearest);
  console.log(kind+' muzzle-to-GLB distances: '+nearest.map(d=>d.toFixed(3)).join(', ')+' m');
  for(let i=0;i<60*60;i++){
   P.roll=Math.sin(i/45)*1.15;P.pitch=Math.sin(i/70)*.35;P.heading+=.002;
   P.pos.x+=.8;P.pos.z+=.3;
   ctx.updateGuns(1/60);ctx.updatePlaneMesh(1/60);planeGroup.updateMatrixWorld(true);
   const ports=ctx.pacificGunMuzzles().map(p=>planeGroup.localToWorld(p.clone()));
   for(const f of aircraft.children.filter(o=>o.isGroup&&o.children.some(c=>c.geometry?.type==='ConeGeometry'))){
    const at=f.getWorldPosition(new THREE.Vector3());
    assert(ports.some(p=>at.distanceTo(p)<1e-6),'frame '+i+' '+at.toArray()+' versus '+ports.map(p=>p.toArray()).join(' / ')+' flash stays on a muzzle while banking and pitching');
    const dir=new THREE.Vector3(0,0,1).transformDirection(f.matrixWorld);
    assert(dir.dot(ctx.noseDir())>.99999,'muzzle flame follows the aircraft nose');
   }
   combatFX.update(1/60);
   assert(ctx.bullets.every(b=>new THREE.Vector3(0,0,1).applyQuaternion(b.mesh.quaternion).dot(b.dir)>.99999),'rounds follow their actual velocity while banking and pitching');
   const litSides=new Set(ctx.bullets.filter(b=>b.mesh.userData.litTracer).map(b=>b.mesh.userData.roundSide));
   if(litSides.size)assert(litSides.has(-1)&&litSides.has(1),'actual '+kind+' firing must show tracers on both sides');
   assert(ctx.bullets.length<30,'live tracers stay bounded during sustained fire');
   assert(combatFX.count<40,'muzzle effects expire and recycle during sustained fire');
   assert.equal(ctx.window.__avStash.length,0,'muzzle sprites never enter the discarded-airframe stash');
  }
  assert(P.ammo<4000,'actual gun routine fires for a minute');ctx.firing=false;
  for(let i=0;i<60;i++){P.roll=Math.sin(i/45)*1.15;P.pitch=Math.sin(i/70)*.35;P.heading+=.002;
   P.pos.x+=.8;P.pos.z+=.3;
   ctx.updateGuns(1/60);ctx.updatePlaneMesh(1/60);planeGroup.updateMatrixWorld(true);
   const ports=ctx.pacificGunMuzzles().map(p=>planeGroup.localToWorld(p.clone()));
   for(const f of aircraft.children.filter(o=>o.isGroup&&o.children.some(c=>c.geometry?.type==='ConeGeometry'))){
    const at=f.getWorldPosition(new THREE.Vector3());
    assert(ports.some(p=>at.distanceTo(p)<1e-6),'frame '+i+' '+at.toArray()+' versus '+ports.map(p=>p.toArray()).join(' / ')+' flash stays on a muzzle while banking and pitching');
    const dir=new THREE.Vector3(0,0,1).transformDirection(f.matrixWorld);
    assert(dir.dot(ctx.noseDir())>.99999,'muzzle flame follows the aircraft nose');
   }
   combatFX.update(1/60);}
  assert.equal(combatFX.count,0);assert.equal(ctx.bullets.length,0,'all gun effects finish after release');
  console.log('Carrier fire '+kind+': 60 simulated seconds, original GLB, banking/pitching muzzle attachment and direction, bounded effects and no detached-parent crash');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
