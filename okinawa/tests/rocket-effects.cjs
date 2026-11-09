'use strict';
/* Build 235: Corsair rockets must be seen. A 1.7 m x 13 cm rocket at 350 m/s is below one pixel from the chase camera, so the
 * rocket carries a motor flame + glow (shared geometry), leaves a smoke trail, flashes at launch and its ground impact is a
 * real blast (rocket 2.6, bomb 3.4 - a bomb is the bigger one). The pool rules keep a trail from starving a blast. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const THREE=require('three');global.THREE=THREE;global.window=global;global.self=global;
require('../../game-runtime.js');require('../../ordnance.js');require('../../combat-fx.js');
const {GameRuntime,Ordnance,CombatFX}=global;

// 1) the rocket model: flame + glow exist, are shared between rockets and survive a release
{
 const scene=new THREE.Scene(),a=Ordnance.create('rocket'),b=Ordnance.create('rocket');scene.add(a,b);
 const flame=a.userData.flame;assert(flame&&flame.name==='rocketFlame','rocket has a flame group');
 assert(flame.getObjectByName('flameOuter')&&flame.getObjectByName('flameCore')&&flame.getObjectByName('flameGlow'),'outer cone, hot core and glow');
 assert.equal(flame.getObjectByName('flameOuter').geometry,b.userData.flame.getObjectByName('flameOuter').geometry,'flame geometry is shared');
 assert.equal(flame.getObjectByName('flameGlow').material,b.userData.flame.getObjectByName('flameGlow').material,'glow material is shared');
 a.updateMatrixWorld(true);const out=new THREE.Box3().setFromObject(flame.getObjectByName('flameOuter')).getCenter(new THREE.Vector3());assert(out.z<-1,'the flame trails behind the rocket (-Z): '+out.z);
 let disposed=0;a.traverse(c=>{if(c.geometry)c.geometry.addEventListener('dispose',()=>disposed++);if(c.material&&c.material.addEventListener)c.material.addEventListener('dispose',()=>disposed++);});
 GameRuntime.own(a);GameRuntime.release(a);assert.equal(disposed,0,'releasing a rocket keeps the shared flame resources');
 assert(!Ordnance.create('bomb').userData.flame&&!Ordnance.create('torpedo').userData.flame,'only rockets burn');
}

// 2) CombatFX: trail yields to the pool, blast always gets the headroom, blast has a smoke column and embers
{
 const scene=new THREE.Scene(),fx=CombatFX.create(scene);
 for(let i=0;i<400;i++)fx.trail(new THREE.Vector3(i,50,0));
 const trailOnly=fx.count;assert(trailOnly>0&&trailOnly<=240,'trail puffs stop at the trail limit: '+trailOnly);
 fx.blast(0,10,0,2.6,10);const withBlast=fx.count;assert(withBlast>trailOnly+30,'a blast still finds room after a full trail: '+trailOnly+' -> '+withBlast);assert(withBlast<=300,'shared limit holds: '+withBlast);
 fx.clear();assert.equal(fx.count,0);
 const before=fx.count;fx.blast(0,10,0,1.2,10);const small=fx.count-before;fx.clear();fx.blast(0,10,0,2.6,10);const rocket=fx.count;
 assert(small>=45,'every ground blast now carries column + embers: '+small);assert.equal(rocket,small,'scale changes the size, not the puff count');
 const tallest=[...scene.children].filter(o=>o.isSprite).reduce((m,o)=>Math.max(m,o.position.y),0);assert(tallest>25,'smoke column rises well above the ground: '+tallest);
 fx.clear();fx.launch(new THREE.Vector3(0,100,0),new THREE.Vector3(1,0,0));assert(fx.count>=4,'launch flash + smoke: '+fx.count);
 for(let i=0;i<400;i++)fx.update(1/60);assert.equal(fx.count,0,'everything expires');
}

// 3) the shipped game code: release -> flame, trail spacing and window, restored rockets, ground blast sizes
{
 const html=fs.readFileSync(require.resolve('../../torpedo-carrier.html'),'utf8');
 const rel=html.slice(html.indexOf('function releaseCorsairRocket('),html.indexOf('function releaseBomb(')),upd=html.slice(html.indexOf('function updateBombs('),html.indexOf('const torpPrev='));
 const scene=new THREE.Scene(),calls={trail:[],launch:[],explosions:[],booms:[]},P={alive:true,rockets:8,rocketCooldown:0,pos:new THREE.Vector3(0,400,0),pitch:-.35,heading:.2,roll:0,spd:95};
 let ground=0;
 const ctx=vm.createContext({THREE,Ordnance,GameRuntime,P,scene,Math,bombs:[],sortieBombFired:0,sortieBombHit:0,renderer:{},
  CorsairRig:{position:()=>new THREE.Vector3(2,400,0),stores(){}},playerSBD:{},corsairConfig:()=>({bombScale:1}),updateHUD(){},sfxWhoosh(){},flash(){},
  noseDir:()=>new THREE.Vector3(Math.cos(P.pitch)*Math.cos(P.heading),Math.sin(P.pitch),Math.cos(P.pitch)*Math.sin(P.heading)),
  combatFX:{trail:p=>calls.trail.push(p.clone()),launch:(p,d)=>calls.launch.push({p:p.clone(),d:d.clone()})},
  shoreHeight:()=>ground,shoreTargets:[],ships:[],spawnSplash(){},hitShip(){},hitShoreTarget(){},
  spawnExplosion:(x,y,z,s)=>calls.explosions.push({x,y,z,s}),sfxBoom:l=>calls.booms.push(l)});
 vm.runInContext(rel+'\n'+upd,ctx);
 ctx.releaseCorsairRocket();assert.equal(calls.launch.length,1,'launch flash on release');assert.equal(ctx.bombs.length,1);
 const shot=ctx.bombs[0];assert(shot.rocket&&shot.mesh.userData.flame,'projectile carries the motor flame');
 // fly it through open air; trail points must be >= 13 m apart and only appear in the first 2.6 s (life 6 -> 3.4)
 let t=0;for(let i=0;i<60*5&&ctx.bombs.length;i++){ctx.updateBombs(1/60);t+=1/60;}
 assert(calls.trail.length>=8,'a trail is laid: '+calls.trail.length);
 for(let i=1;i<calls.trail.length;i++)assert(calls.trail[i].distanceTo(calls.trail[i-1])>12,'trail spacing '+calls.trail[i].distanceTo(calls.trail[i-1]));
 const span=calls.trail[0].distanceTo(calls.trail.at(-1));assert(span<355*2.7,'trail stops after 2.6 s of flight: '+span);
 // flame flickers
 const e=[];for(let i=0;i<20;i++){ctx.P.rocketCooldown=0;ctx.releaseCorsairRocket();ctx.updateBombs(1/60);e.push(ctx.bombs.at(-1).mesh.userData.flame.scale.z);}assert(new Set(e.map(v=>v.toFixed(3))).size>5,'flame flickers');
 // a rocket restored from a checkpoint has no counters and must not turn into NaN
 ctx.bombs.length=0;const restored={mesh:Ordnance.create('rocket'),vel:new THREE.Vector3(300,-20,0),life:5.5,rocket:true};restored.mesh.position.set(0,300,0);scene.add(restored.mesh);ctx.bombs.push(restored);
 assert.doesNotThrow(()=>{for(let i=0;i<30;i++)ctx.updateBombs(1/60);});assert(Number.isFinite(restored.mesh.position.x)&&Number.isFinite(restored.travel),'checkpoint rocket stays finite');
 // ground blast sizes: rocket 2.6, bomb 3.4 (the bomb is bigger), both far above the old 1.2
 ground=20;calls.explosions.length=0;calls.booms.length=0;ctx.bombs.length=0;
 const aim=(rocket)=>{const m=Ordnance.create(rocket?'rocket':'bomb');m.position.set(0,24,0);scene.add(m);ctx.bombs.push({mesh:m,vel:new THREE.Vector3(0,-60,0),life:5,rocket});};
 aim(true);aim(false);for(let i=0;i<120&&ctx.bombs.length;i++)ctx.updateBombs(1/60);
 assert.equal(calls.explosions.length,2,'both strike the ground');const sizes=calls.explosions.map(e=>e.s).sort((x,y)=>x-y);assert.deepEqual(sizes,[2.6,3.4],'rocket 2.6, bomb 3.4 (the loop runs backwards, so compare sorted)');assert(sizes[0]>1.2,'far above the old 1.2');
 assert.deepEqual(calls.booms.slice().sort((x,y)=>x-y),[.9,1],'the bomb is not quieter than a rocket');
}
console.log('Rocket effects: shared motor flame + glow, 13 m smoke trail for 2.6 s, pool priority, launch flash, rocket blast 2.6 / bomb blast 3.4 with smoke column and embers.');
