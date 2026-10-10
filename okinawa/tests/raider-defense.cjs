'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),THREE=require('three');
const html=fs.readFileSync('torpedo-carrier.html','utf8');
const moduleCode=fs.readFileSync('sortie-features.js','utf8');
function extract(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));}
function context(){
 const ctx={THREE,Math,raiders:[],tracers:[],ships:[],wingmen:[],gltfRoot:null,
   carrierX:0,CARRIER_SPD:5,carrierHP:100,STERN_X:-115,BOW_X:115,DECK_Y:18,DECK_HALF_W:16,
   P:{pos:new THREE.Vector3(0,100,300),hull:100,alive:true},D:()=>({dmg:1}),
   scene:new THREE.Scene(),combatFX:null,GameRuntime:{own:()=>{},release:m=>m?.parent?.remove(m),rotorStep:()=>.2},PROP_STEP:.2,
   isDefend:()=>true,spawnSmoke:()=>{},spawnSparks:()=>{},spawnFlakBurst:()=>{},sfxPop:()=>{},spawnEnemyTorp:()=>{ctx.drops++;},
   drops:0,fleetKills:0,killRaider:r=>{r.alive=false;ctx.fleetKills++;}};
 vm.createContext(ctx);vm.runInContext(moduleCode,ctx);
 vm.runInContext(fs.readFileSync('combat-fx.js','utf8'),ctx);
 vm.runInContext(extract('function updateRaiders(dt){','function spawnEnemyTorp'),ctx);
 vm.runInContext(extract('let carrierGunTimers=','function spawnFlakBurst'),ctx);
 vm.runInContext(extract('function updateFlak(dt){','// Four deck-edge'),ctx);
 return ctx;
}
function raider(x,z){const pos=new THREE.Vector3(x,240,z),heading=Math.atan2(-x,-z);
 return {pos,heading,pitch:0,roll:0,spd:72,vel:new THREE.Vector3(Math.sin(heading),0,Math.cos(heading)).multiplyScalar(72),
 mesh:new THREE.Group(),alive:true,fromModel:true,hp:4,dropped:false,runIn:false};}
for(const fps of [20,60,120]){
 const c=context(),r=raider(1700,2400);c.raiders.push(r);let release=null,minSpeed=Infinity,maxTurn=0;
 for(let i=0;i<fps*150;i++){
  const old=r.heading;c.updateRaiders(1/fps);minSpeed=Math.min(minSpeed,r.spd);
  maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(r.heading-old),Math.cos(r.heading-old)))*fps);
  if(r.dropped&&!release)release={time:i/fps,heading:r.heading,pos:r.pos.clone(),dir:r.egressDir.clone()};
  if(release&&i/fps-release.time>9.9&&i/fps-release.time<10.1){
   assert(Math.abs(r.heading-release.heading)<.04,'straight egress for ten seconds');
   assert(r.pos.clone().sub(release.pos).dot(release.dir)>650,'keeps flying forward, not a pivot');
  }
 }
 assert(release,'attack produces a valid torpedo release at '+fps+'fps');
 assert(minSpeed>65,'never stops to reverse');assert(maxTurn<.2,'airspeed-bounded turning');
}
const c=context();const r=raider(350,800);r.pos.y=70;c.raiders.push(r);
for(let i=0;i<600;i++)c.updateFlak(1/60);
assert(c.tracers.some(t=>t.fleet),'carrier fires visible friendly AA');
assert(c.tracers.every(t=>new THREE.Vector3(0,0,1).applyQuaternion(t.mesh.quaternion).dot(t.dir)>.99999),'carrier rounds point along their flight path, not upright');
assert(c.tracers.length<=45,'bounded active tracer count');assert.equal(c.P.hull,100,'no friendly fire against Zero');
assert(r.hp<4,'physical AA rounds damage hostile Avengers');
const before=c.tracers.length;c.carrierHP=0;c.updateCarrierDefense(2);assert.equal(c.tracers.length,before,'lost carrier stops firing');
const friendly=context();friendly.isDefend=()=>false;friendly.raiders.push(raider(350,800));
for(let i=0;i<600;i++)friendly.updateCarrierDefense(1/60);
assert.equal(friendly.tracers.length,0,'Avenger/Dauntless sorties never activate the home-carrier enemy-Avenger batteries');
const blocked=context(),blockedRaider=raider(350,800);blocked.raiders.push(blockedRaider);
blocked.P.pos.copy(blockedRaider.pos);blockedRaider.vel.set(0,0,0);blocked.updateCarrierDefense(.1);
assert.equal(blocked.tracers.length,0,'carrier withholds fire when the friendly player blocks its shot');
blockedRaider.team='friendly';blocked.P.pos.set(0,200,-100);blocked.updateCarrierDefense(5);
assert.equal(blocked.tracers.length,0,'friendly aircraft cannot become a carrier target');
assert(c.SortieFeatures.segmentDistance(new THREE.Vector3(),new THREE.Vector3(0,0,30),new THREE.Vector3(0,0,15))===0,'swept hit does not tunnel');
console.log('Raider flight: 20/60/120fps, forward egress, bounded speed/turn. Carrier AA: visible, physical, bounded, no friendly fire.');
