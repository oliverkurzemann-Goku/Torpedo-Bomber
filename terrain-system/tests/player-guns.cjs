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
// Bf 109 F-2: three guns with their own magazines and rates from the reference PDF
// (2x MG 17 500 rounds for 25-26 s, hub MG 151 200 rounds for ~15 s), independent of frame rate.
const AC=vm.runInNewContext(html.slice(html.indexOf('const AC={'),html.indexOf('function acDef()'))+'\nAC');
const bf=AC.bf109;
assert.equal(bf.name,'Bf 109F-2');assert.equal(bf.guns.length,3);
assert.equal(JSON.stringify(bf.guns.map(g=>g.rounds)),'[500,500,200]');assert.equal(bf.ammo,1200);
assert(Math.abs(bf.guns.reduce((n,g)=>n+g.rounds*g.dmg*bf.gunDmg,0)-1500*.25*1.35)<1e-9,'full load keeps the old total damage');
for(const fps of [20,60,120]){
 const ctx=vm.createContext({THREE,CombatFX,GameRuntime,Math,scene:new THREE.Scene(),planeGroup:new THREE.Group(),combatFX:null,
  P:{ac:'bf109',alive:true,pos:new THREE.Vector3(100,500,300),pitch:.21,heading:.8,roll:.65},
  state:1,ST:{FLIGHT:1},JET_KINDS:['me262','me163'],gunT:0,gunVolley:0,bullets:[],
  noseDir:()=>new THREE.Vector3(Math.sin(.8)*Math.cos(.21),Math.sin(.21),Math.cos(.8)*Math.cos(.21)),
  acDef:()=>bf,sfxGun(){},updateGunUI(){}});
 vm.runInContext(code,ctx);ctx.armGuns();
 assert.equal(ctx.P.ammo,1200);assert.equal(ctx.gunCount(),'1000/200');
 const counts=[0,0,0],ports=ctx.gunMuzzles();let t=0,cannonDry=null,mgDry=null;
 assert(ports[2].distanceTo(new THREE.Vector3(0,0,4.47))<1e-9,'hub cannon fires from the spinner');
 while(t<30){
  ctx.fireGuns(1/fps);t+=1/fps;
  for(const b of ctx.bullets){counts[b.mesh.userData.roundBarrel]++;
   assert.equal(b.dmg,bf.gunDmg*bf.guns[b.mesh.userData.roundBarrel].dmg);GameRuntime.release(b.mesh);}
  ctx.bullets=[];
  if(cannonDry===null&&ctx.P.gunAmmo[2]===0)cannonDry=t;
  if(mgDry===null&&ctx.P.gunAmmo[0]===0)mgDry=t;
  if(Math.abs(t-10)<.5/fps){
   assert(Math.abs(counts[0]-10/bf.guns[0].interval)<=1.5&&Math.abs(counts[2]-10/bf.guns[2].interval)<=1.5,fps+' FPS rates: '+counts);
  }
 }
 assert.equal(JSON.stringify(counts),'[500,500,200]');assert.equal(ctx.P.ammo,0);assert.equal(ctx.gunCount(),'0/0');
 assert(Math.abs(cannonDry-15)<.1&&Math.abs(mgDry-25.5)<.1,fps+' FPS: cannon dry '+cannonDry+'s, MG dry '+mgDry+'s');
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
console.log('Player guns: Bf 109 F-2 2x MG 17 + MG 151 own magazines/rates at 20/60/120 FPS (cannon dry 15 s, MGs 25.5 s); all 8 P-47 / 4 fighter / 2 Komet muzzles, mixed foreign fire, bank/pitch attachment, ammo limits; sustained-fire pool stays fixed, 75% fewer distant round draws.');
