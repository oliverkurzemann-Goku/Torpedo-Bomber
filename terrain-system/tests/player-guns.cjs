'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
global.THREE=THREE;require('../../combat-fx.js');require('../../game-runtime.js');
const html=fs.readFileSync('remagen-mission.html','utf8');
const code=html.slice(html.indexOf('function gunMuzzles(){'),html.indexOf('function updateGunUI(){'));
for(const [ac,count] of [['p47',8],['bf109',4],['fw190',4],['me262',4],['me163',2],['ju87',4]]){
 const ctx=vm.createContext({THREE,CombatFX,GameRuntime,Math,scene:new THREE.Scene(),planeGroup:new THREE.Group(),combatFX:null,
  P:{ac,alive:true,ammo:10000,pos:new THREE.Vector3(100,500,300),pitch:.21,heading:.8,roll:.65},
  state:1,ST:{FLIGHT:1},JET_KINDS:['me262','me163'],gunT:0,gunVolley:0,bullets:[],
  noseDir:()=>new THREE.Vector3(Math.sin(.8)*Math.cos(.21),Math.sin(.21),Math.cos(.8)*Math.cos(.21)),
  acDef:()=>({gunRate:.1,gunDmg:8}),sfxGun(){},updateGunUI(){}});
 vm.runInContext(code,ctx);
 // Other aircraft/AA advance the global tracer counter between player volleys.
 for(let volley=0;volley<40;volley++){
  const foreign=CombatFX.round();GameRuntime.release(foreign);
  ctx.gunT=0;ctx.fireGuns(.01);
  assert.equal(ctx.bullets.length,count);
  assert.equal(ctx.P.ammo,10000-(volley+1)*count);
  assert.equal(ctx.bullets.filter(b=>b.mesh.userData.litTracer).length,volley%4===0?count:0,ac+' must light every barrel together');
  assert.equal(new Set(ctx.bullets.map(b=>b.mesh.userData.roundBarrel)).size,count);
  const ports=ctx.gunMuzzles(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.21,.8,-.65,'YXZ'));
  ctx.bullets.forEach((b,i)=>{
   assert(b.mesh.position.distanceTo(ports[i].clone().applyQuaternion(q).add(ctx.P.pos))<1e-8,'muzzles follow bank and pitch');
   assert.equal(b.speed,['me262','me163'].includes(ac)?540:760);
   GameRuntime.release(b.mesh);
  });ctx.bullets=[];
 }
 ctx.P.ammo=count-1;ctx.gunT=0;ctx.fireGuns(.1);
 assert.equal(ctx.bullets.length,count-1);assert.equal(ctx.P.ammo,0);
 ctx.bullets.forEach(b=>GameRuntime.release(b.mesh));ctx.bullets=[];
 ctx.gunT=0;ctx.fireGuns(.1);assert.equal(ctx.bullets.length,0);
}
// Sustained fire reuses warm meshes, including after scene cleanup and pauses.
const warm=Array.from({length:192},(_,i)=>CombatFX.round('rifle',i));warm.forEach(GameRuntime.release);
const allocated=CombatFX.roundStats.allocated;
for(let burst=0;burst<40;burst++){
 const scene=new THREE.Scene(),shots=Array.from({length:192},(_,i)=>({mesh:CombatFX.round('rifle',i)}));
 shots.forEach(s=>{s.mesh.position.set(0,0,-300);scene.add(s.mesh);});
 CombatFX.updateRounds(shots,new THREE.PerspectiveCamera(62,1,.1,5000),{domElement:{clientHeight:768}});
 assert.equal(shots.filter(s=>s.mesh.visible).length,48,'far dark rounds use no draw calls');
 assert(shots.every(s=>s.mesh.position.z===-300),'render culling cannot move physical rounds');
 shots.forEach(s=>GameRuntime.release(s.mesh));assert.equal(scene.children.length,0);
}
assert.equal(CombatFX.roundStats.allocated,allocated,'no new meshes after sustained-fire warmup');
assert(CombatFX.roundStats.pooled<=512);
console.log('Player guns: all 8 P-47 / 4 fighter / 2 Komet muzzles, mixed foreign fire, bank/pitch attachment, ammo limits; sustained-fire pool stays fixed, 75% fewer distant round draws.');
