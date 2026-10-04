'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');
const ctx=vm.createContext({THREE,console});ctx.window=ctx;
for(const f of ['sortie-features.js','sortie-systems.js','operation-plans.js','audio/flight-atmosphere.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const {Damage}=ctx.SortieFeatures,{Operation,withPhases}=ctx.FlightOps;
const cfg=withPhases({kills:{flak:2}},{events:[{clear:true,fighters:1,required:true}]}),op=new Operation(cfg);
const s={pos:{x:0,y:500,z:0},located:false,suppressed:false,clear:false,kills:0};
op.tick(10,s);assert.equal(op.phase().id,'locate');
op.tick(2,{...s,located:true});assert.equal(op.phase().id,'suppress');
op.tick(2,s);assert.equal(op.phase().id,'suppress','cannot skip mandatory suppression');
op.tick(2,{...s,suppressed:true});assert.equal(op.phase().id,'strike');
assert(op.tick(1,{...s,clear:true}).some(e=>e.fighters));
assert.equal(op.ready(),false,'a newly spawned wave cannot prematurely finish the strike phase');
op.tick(1,{...s,clear:false});assert.equal(op.ready(),false);
op.tick(1,{...s,clear:true});assert.equal(op.ready(),true,'recovery unlocked only after the real wave is clear');
for(const roll of [.2,.6,.95]){
 const p={alive:true,ac:'p47',hull:100,fuel:100,gear:0,gearTgt:0,spd:50,roll:0,pitch:.04};Damage.reset(p);
 assert.equal(Damage.hit(p,5,'bullet',()=>roll),null);assert.equal(Damage.power(p),1);
 p.hull=70;assert(Damage.hit(p,20,'flak',()=>roll));
 const fuel=p.fuel;Damage.tick(p,5);
 if(roll<.4){assert(p.fuel<fuel);assert.match(Damage.status(p),/FUEL LEAK/);}
 else if(roll<.78)assert(Damage.power(p)<1);
 else{p.gearTgt=1;Damage.tick(p,.05);assert.equal(p.gearTgt,0);assert(Damage.belly(p,2,60));assert(!Damage.belly(p,8,60));}
 Damage.reset(p);assert.equal(Damage.power(p),1);assert.equal(Damage.status(p),'');
}
for(const ac of ['ju87','me163']){const p={ac,alive:true,hull:55,fuel:30,gear:1};Damage.reset(p);Damage.hit(p,40,'flak',()=>.99);assert.equal(p.systemDamage.gearLock,null,'fixed gear / skid is not locked up');}
for(const maxHull of [75,88,95,102,115,130]){
 const p={hull:maxHull};Damage.reset(p,maxHull);assert.equal(Damage.hullPercent(p),100,'every intact original aircraft reads 100%');
 p.hull=maxHull/2;assert.equal(Damage.hullPercent(p),50,'display follows the aircraft\'s actual remaining strength');
 p.hull=-1;assert.equal(Damage.hullPercent(p),0);p.hull=maxHull+40;assert.equal(Damage.hullPercent(p),100);
 p.systemDamage.gearLock=0;assert(Damage.needsBelly(p));assert.match(Damage.status(p),/GEAR JAM UP/);
 p.systemDamage.gearLock=1;assert(!Damage.needsBelly(p)&&Damage.gearLocked(p));assert.match(Damage.status(p),/GEAR JAM DOWN/);
}
const env={SpeechSynthesisUtterance:function(text){this.text=text;},speechSynthesis:{getVoices:()=>[{localService:false,lang:'en-US'},{localService:true,lang:'en-GB'}],speak:u=>env.last=u,cancel:()=>{env.cancelled=true;}},setTimeout:()=>1,clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}}};
const voice=ctx.FlightAtmosphere.voiceRadio(env);assert(!voice.say('before gesture'));
voice.unlock();assert(env.last.voice.localService,'remote speech service never selected');assert(!voice.say('no backlog'));
voice.cancel();assert(env.cancelled&&!voice.speaking,'pause/exit cancels immediately');
env.speechSynthesis.getVoices=()=>[{localService:false,lang:'en-US'}];assert(!voice.say('remote unavailable'),'no remote fallback');
const silent=ctx.FlightAtmosphere.voiceRadio({});assert(!silent.available&&!silent.say('text still works'));
const eu=fs.readFileSync('remagen-mission.html','utf8');
const missions=vm.runInNewContext(eu.slice(eu.indexOf('const MISSIONS=['),eu.indexOf('function M()'))+'\nMISSIONS');
for(const [i,m] of missions.entries()){
 const o=new Operation(withPhases(m,{...ctx.FlightPlans.europe[i],practice:!!(m.free||m.circuits)}));
 if(m.free||m.circuits){assert.equal(o.phase(),null);continue;}
 assert.equal(o.phase().id,'locate');assert(!o.ready());
 if(m.ac==='me163')assert(o.config.phases.some(p=>p.id==='glide'));
}
// Fly the actual wounded-wingman autopilot to the strip, not just a state stub.
const P={alive:true,pos:new THREE.Vector3()},w={kind:'p47',group:new THREE.Group(),pos:new THREE.Vector3(4500,700,18000),vel:new THREE.Vector3(0,0,100),heading:0,pitch:0,roll:0,spd:100,alive:true,hp:2,path:0,cover:0,smokeT:0,landed:false,bonus:false};
const flight=vm.createContext({THREE,Math,P,wingmen:[w],AF_X:787,AF_Z:18087.6,AF_Y:180,RWY_LEN:900,
 AC:{p47:{stall:38,max:175,gLim:6,turn:.8}},groundY:()=>180,GameRuntime:{rotorStep:()=>.2},spawnSmoke:()=>{},radioSay:()=>{},addScore:n=>{flight.score+=n;},flash:()=>{},score:0});
vm.runInContext(eu.slice(eu.indexOf('const AI_G=9.81;'),eu.indexOf('function spawnRecoveryEscort'))+eu.slice(eu.indexOf('function updateRecoveryEscort'),eu.indexOf('function updateEnemyAir')),flight);
for(let i=0;i<60*400&&!w.landed;i++){P.pos.copy(w.pos).add(new THREE.Vector3(80,15,0));flight.updateRecoveryEscort(1/60);assert(w.pos.y>=180,'escort never falls through ground');assert(w.pos.x>0&&w.pos.x<28000&&w.pos.z>0&&w.pos.z<32000,'escort approach stays inside playable terrain');}
assert(w.landed,'damaged wingman flies the approach and lands');assert(w.bonus&&flight.score===500,'optional escort reward paid exactly once');
flight.updateRecoveryEscort(1);assert.equal(flight.score,500);
console.log('Upgrades: real phase/wave gating, three independent damage paths, safe belly recovery, local-only voice lifecycle, 20 mission plans and wounded-wingman landing/reward.');
(async()=>{
 const demContext=vm.createContext({fetch:async url=>{const b=fs.readFileSync(url);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});
 vm.runInContext(fs.readFileSync('terrain-system/HeightProvider.js','utf8'),demContext);
 const dem=vm.runInContext("new DEMHeightProvider(4000,'terrain-system/real/data/dem/')",demContext);
 await Promise.all(Array.from({length:56},(_,i)=>dem.loadTile(i%7,Math.floor(i/7))));
 flight.groundY=(x,z)=>dem.getHeight(x,z);flight.AF_Y=dem.getHeight(flight.AF_X,flight.AF_Z);
 Object.assign(w,{heading:-Math.PI/2,pitch:0,roll:0,spd:100,path:0,landed:false,bonus:false,cover:0});
 w.pos.set(13000,dem.getHeight(13000,21000)+450,21000);flight.score=0;
 for(let i=0;i<60*400&&!w.landed;i++){
  P.pos.copy(w.pos).add(new THREE.Vector3(80,15,0));flight.updateRecoveryEscort(1/60);
  assert(w.pos.y>=dem.getHeight(w.pos.x,w.pos.z),'wounded aircraft clears the actual Rhine DEM');
  assert(w.pos.x>0&&w.pos.x<28000&&w.pos.z>0&&w.pos.z<32000);
 }
 assert(w.landed&&w.bonus,'escort crosses real terrain and lands at the real strip');
 console.log('Wounded-wingman recovery: actual 56-tile DEM, no terrain penetration or map exit, safe landing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
