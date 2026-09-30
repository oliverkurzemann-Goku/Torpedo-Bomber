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
const gunCode=html.slice(html.indexOf('const pacificTracerGeo='),html.indexOf('function updateMinimap('));
const poseCode=html.slice(html.indexOf('function updatePlaneMesh('),html.indexOf('// ---------- FX: explosions'));
async function glb(file){const b=fs.readFileSync(path.join(root,file));return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',g=>yes(g.scene),no));}
(async()=>{
 // Directly covers a detached effect too, e.g. a model switch/dead airframe.
 const scene=new THREE.Scene(),plane=new THREE.Group();scene.add(plane);
 const fx=CombatFX.create(scene);fx.muzzle(plane,[new THREE.Vector3()]);
 plane.remove(plane.children[0]);assert.doesNotThrow(()=>fx.update(.1));assert.equal(fx.count,0);
 for(const [kind,file] of [['zero','zero.glb'],['sbd','sbd dauntless.glb'],['avenger','grumman tbm avenger.glb']]){
  const scene=new THREE.Scene(),planeGroup=new THREE.Group(),aircraft=new THREE.Group();
  aircraft.add(await glb(file));planeGroup.add(aircraft);scene.add(planeGroup);
  // Original model loaded; the propeller is irrelevant to this FX lifecycle
  // check. Existing real-model prop tests independently check its geometry.
  const rotor=new THREE.Group();rotor.name='sbdRotorBlade';aircraft.add(rotor);
  const combatFX=CombatFX.create(scene),P={alive:true,pos:new THREE.Vector3(0,300,0),heading:0,pitch:0,roll:0,throttle:1,gear:0,flap:0,hook:0,torps:2,ammo:5000};
  const ctx=vm.createContext({THREE,GameRuntime,CombatFX,Math,console,P,scene,planeGroup,combatFX,
   state:3,ST:{FLIGHT:3},firing:true,gunCool:0,bullets:[],ships:[],zeros:[],raiders:[],etorps:[],shoreTargets:[],
   isDefend:()=>kind==='zero',isSBD:()=>kind==='sbd',loadout:'divebomb',
   playerZero:kind==='zero'?aircraft:null,playerSBD:kind==='sbd'?aircraft:null,
   sbdRotor:kind==='sbd'?rotor:null,sbdRotorAxis:'z',zeroRotor:null,zeroRotorAxis:null,zeroProp:null,
   planeModelLoaded:kind==='avenger',gltfRoot:kind==='avenger'?aircraft:null,propSpinner:null,propPivot:null,
   gearMesh:[],gearDoors:[],gearWellCovers:[],ordTorp:null,ordBombs:null,planeBody:null,planeGear:null,
   cockpitLight:null,cockpitInterior:null,flapL:null,flapR:null,diveFlapL:null,diveFlapR:null,
   sbdFlapL:null,sbdFlapR:null,sbdDiveFlapL:null,sbdDiveFlapR:null,hookMesh:null,sbdHookMesh:null,
   document:{querySelectorAll:()=>[]},shoreHeight:()=>0,sfxGun(){},updateHUD(){},radioSay(){},
   setSBDGearVisible(){},setZeroGearVisible(){},spawnSparks(){},spawnSmoke(){},addScore(){},spawnSplash(){}
  });ctx.window={__avStash:[]};
  vm.runInContext(extract('noseDir','loadPlaneModel')+'\n'+gunCode+'\n'+poseCode,ctx);
  for(let i=0;i<60*60;i++){
   ctx.updateGuns(1/60);combatFX.update(1/60);ctx.updatePlaneMesh(1/60);
   assert(ctx.bullets.length<30,'live tracers stay bounded during sustained fire');
   assert(combatFX.count<40,'muzzle effects expire and recycle during sustained fire');
   assert.equal(ctx.window.__avStash.length,0,'muzzle sprites never enter the discarded-airframe stash');
  }
  assert(P.ammo<4000,'actual gun routine fires for a minute');ctx.firing=false;
  for(let i=0;i<60;i++){ctx.updateGuns(1/60);combatFX.update(1/60);ctx.updatePlaneMesh(1/60);}
  assert.equal(combatFX.count,0);assert.equal(ctx.bullets.length,0,'all gun effects finish after release');
  console.log('Carrier fire '+kind+': 60 simulated seconds, original GLB, actual frame order, bounded effects and no detached-parent crash');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
