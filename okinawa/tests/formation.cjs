/* Run with NODE_PATH pointing to three@0.128.0. Exercise the shipped wingman AI. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');
require('../../game-runtime.js');require('../../flight-support.js');const {GameRuntime,FlightSupport}=global;
const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
function source(name,next){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a+1);
 assert.ok(a>0&&b>a);return html.slice(a,b);}
const P={pos:new THREE.Vector3(0,180,0),heading:0,pitch:0,spd:80};
const w={alive:true,mode:'form',cool:999,pos:new THREE.Vector3(-26,177,-30),
 slotPos:new THREE.Vector3(-26,177,-30),heading:Math.PI/2,pitch:0,roll:0,
 vel:new THREE.Vector3(80,0,0),mesh:new THREE.Group(),disc:null,side:-1};
const ctx=vm.createContext({GameRuntime,FlightSupport,THREE,Math,P,ships:[],wingmen:[w],PROP_STEP:.3,isDefend:()=>false});
vm.runInContext(source('playerLateral','spawnWingman')+'\n'+source('updateWingmen','updateWingShots')+
 '\n'+source('noseDir','loadPlaneModel'),ctx);
let moved=0;
for(let i=0;i<1200;i++){
 if(i>=90)P.heading=Math.min(Math.PI/2,(i-90)*Math.PI/360);
 const before=w.pos.clone(),old=w.heading,oldRate=w.yawRate||0;
 ctx.updateWingmen(1/60);
 assert.ok(Math.abs(w.heading-old)<=.25/60+1e-7,'wingman cannot rotate in place');
 assert.ok(Math.abs((w.yawRate||0)-oldRate)<=.18/60+1e-7,'wingman yaw rate must not snap');
 moved+=before.distanceTo(w.pos);
 P.pos.addScaledVector(ctx.noseDir(),P.spd/60);
}
assert.ok(moved>150,'wingman travels forward through the manoeuvre');
assert.ok(Number.isFinite(w.roll)&&Math.abs(w.roll)<.7,'bank remains physically bounded');
assert.ok(Math.abs(w.heading)<.5,'aircraft eventually follows a smooth 90-degree turn');
assert.ok(w.pos.distanceTo(P.pos)<160,'wingman rejoins formation instead of wandering away');
console.log('Formation: aligned launch, bounded bank/yaw, and continuous travel through a leader reversal');

// Close formation is particularly sensitive to speed floors, lateral sliding
// and frame-rate-dependent corrections. Run the shipped controller, not a copy.
function simulation(fps,speed=65/1.94384){
 const leader={pos:new THREE.Vector3(0,300,0),heading:0,pitch:0,spd:speed,vSpeed:0};
 const escorts=[-1,1].map(side=>({alive:true,mode:'form',cool:999,side,
  pos:new THREE.Vector3(-32-(side>0?8:0),298,side*34),
  heading:Math.PI/2,pitch:0,roll:0,spd:speed,vel:new THREE.Vector3(speed,0,0),mesh:new THREE.Group()}));
 const c=vm.createContext({GameRuntime,FlightSupport,THREE,Math,P:leader,ships:[],wingmen:escorts,PROP_STEP:.3,isDefend:()=>false,
  DROP_MAX_SPD:62,DROP_MAX_ALT:55,windZ:0,windGust:0,radioSay:()=>{},NavalAssets:{label:()=> 'FREIGHTER'}});
 vm.runInContext(source('playerLateral','spawnWingman')+'\n'+source('updateWingmen','updateWingShots')+'\n'+source('noseDir','loadPlaneModel'),c);
 const dt=1/fps,stats={yaw:0,bank:0,pitch:0,acceleration:0,minClearance:Infinity,maxGap:0};
 function step(){
  leader.pos.add(new THREE.Vector3(Math.cos(leader.heading)*leader.spd,leader.vSpeed,Math.sin(leader.heading)*leader.spd).multiplyScalar(dt));
  const before=escorts.map(e=>({pos:e.pos.clone(),vel:e.vel.clone(),heading:e.heading,pitch:e.pitch,roll:e.roll}));
  c.updateWingmen(dt);
  escorts.forEach((e,i)=>{
   const b=before[i],yaw=Math.abs(Math.atan2(Math.sin(e.heading-b.heading),Math.cos(e.heading-b.heading)))/dt;
   const bank=Math.abs(e.roll-b.roll)/dt,pitch=Math.abs(e.pitch-b.pitch)/dt,acceleration=e.vel.distanceTo(b.vel)/dt;
   assert(yaw<=.25001&&bank<=.50001&&pitch<=.22001,'no attitude snap');
   assert(acceleration<26,'bounded actual flight-path acceleration');
   assert(e.pos.distanceTo(b.pos)<115*dt,'no position jump');
   const forward=new THREE.Vector3(0,0,1).applyQuaternion(e.mesh.quaternion);
   assert(forward.dot(e.vel.clone().normalize())>1-1e-10,'rendered nose matches actual travel, including climb');
   stats.yaw=Math.max(stats.yaw,yaw);stats.bank=Math.max(stats.bank,bank);stats.pitch=Math.max(stats.pitch,pitch);
   stats.acceleration=Math.max(stats.acceleration,acceleration);
   stats.minClearance=Math.min(stats.minClearance,e.pos.distanceTo(leader.pos));stats.maxGap=Math.max(stats.maxGap,e.pos.distanceTo(leader.pos));
  });
 }
 return {leader,escorts,c,dt,stats,step};
}
const outcomes=[];
for(const fps of [20,60,120]){
 const s=simulation(fps);
 for(let i=0;i<fps*30;i++)s.step();
 assert(s.stats.maxGap<55&&s.stats.minClearance>40,'65kt escorts hold their slots without passing the leader');
 for(const e of s.escorts)assert(Math.abs(e.spd-s.leader.spd)<.02,'matches 65kt instead of forcing 82kt');
 // Gentle course reversals, climb and descent while remaining near the leader.
 for(let i=0;i<fps*60;i++){
  const t=i/fps;s.leader.heading=t<10?t*.1:t<20?1-(t-10)*.12:-.2;
  s.leader.vSpeed=t<12?3:t<24?-2:0;s.step();
 }
 assert(s.stats.minClearance>22&&s.stats.maxGap<160,'safe spacing through reversals and vertical changes');
 assert(s.escorts.every(e=>e.pos.distanceTo(s.leader.pos)<60),'settles back into formation');
 outcomes.push({fps,positions:s.escorts.map(e=>e.pos.clone().sub(s.leader.pos)),...s.stats});
 // Start a wingman closer than its normal slot: separation should grow gently.
 const near=simulation(fps,60),e=near.escorts[0];e.pos.copy(near.leader.pos).add(new THREE.Vector3(-12,-2,-22));
 for(let i=0;i<fps*15;i++)near.step();
 assert(near.stats.minClearance>23&&e.pos.distanceTo(near.leader.pos)>40,'close escort eases outward without crossing the leader');
 // Attack, release, egress and rejoin keep the same continuous motion.
 const attack=simulation(fps,55),target={alive:true,def:{type:'freighter'},group:new THREE.Group()};
 target.group.position.set(550,0,-34);attack.leader.pos.y=55;for(const e of attack.escorts)e.pos.y=55;
 attack.c.ships.push(target);attack.escorts[0].cool=0;let releases=0;attack.c.spawnWingShot=()=>{releases++;target.alive=false;};
 for(let i=0;i<fps*18;i++)attack.step();
 assert(releases>=1,'continuous manoeuvres still release a torpedo');
 assert(attack.escorts.every(e=>e.pos.y>=28),'pull-out stays clear of the sea');
 assert(attack.escorts[0].mode==='form','attack returns to formation');
}
for(let i=1;i<outcomes.length;i++)for(let j=0;j<2;j++)
 assert(outcomes[i].positions[j].distanceTo(outcomes[0].positions[j])<1,'close formation agrees within one metre at 20/60/120 FPS');
console.log('Close formation, 65kt, reversals/climb/descent, safe separation and real attack/egress/rejoin at 20/60/120 FPS:',outcomes);
