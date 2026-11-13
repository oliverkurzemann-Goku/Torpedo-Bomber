'use strict';
const assert=require('node:assert/strict'),T=require('three');
const F=require('../../space-coop-flight.js');
const seed=201133;
const world=F.createWorld(T,seed),otherWorld=F.createWorld(T,seed);
assert.deepEqual(world,otherWorld,'both devices build the same belt from the seed');
assert.notDeepEqual(world.rocks,F.createWorld(T,seed+1).rocks);
const pilots=[F.pilot(T,0),F.pilot(T,1)],step=F.flight(T);
const controls={pitch:1,yaw:0,roll:0,throttle:.5};
for(let i=0;i<115;i++)step(pilots[0],controls,1/60);
assert(pilots[0].position.y>50&&Math.abs(pilots[0].position.z)<10,'free flight can perform a loop');
assert(new T.Vector3(0,0,-1).applyQuaternion(pilots[0].rotation).z>.99,'can point back toward the start');
assert(F.readPilot(pilots[1],F.packPilot(pilots[0])));
assert(pilots[1].position.distanceTo(pilots[0].position)<.001);
assert(!F.readPilot(pilots[1],[Infinity,...F.packPilot(pilots[0]).slice(1)]));
const start=pilots[0].rotation.clone();
for(let i=0;i<44;i++)step(pilots[0],{roll:1,throttle:.5},1/60);
assert(pilots[0].rotation.angleTo(start)>1.5,'roll is independent of steering');
for(let i=0;i<20000;i++)step(pilots[0],{throttle:1},1/60);
assert(pilots[0].position.length()<=F.RADIUS+.0001,'jet remains inside the arena');

const practice={...world,rocks:[]};
const team=[F.pilot(T,0),F.pilot(T,1)],rules=F.mission(T,practice,seed);
const ticks=(rules,team,n)=>{for(let i=0;i<n;i++)rules.step(team,1/60);};
team[0].position.copy(world.shuttle);ticks(rules,team,1);
assert.equal(rules.snapshot().stage,'recover');
team.forEach((p,i)=>p.position.copy(world.cells[i]));ticks(rules,team,1);
assert.deepEqual(rules.snapshot().cells,[true,true]);
team[0].position.copy(world.shuttle);ticks(rules,team,1);
assert.equal(rules.snapshot().stage,'escort');
for(let i=0;i<2400&&rules.snapshot().stage==='escort';i++){
 team[0].position.fromArray(rules.snapshot().shuttle).add(new T.Vector3(0,28,0));
 team[1].position.copy(team[0].position).add(new T.Vector3(0,23,0));
 // Fly a safe escort route while clearing the approaching drones.
 for(const p of team){
  const drones=rules.snapshot().drones;
  if(drones.length){
   const target=new T.Vector3().fromArray(drones[0],1);
   p.rotation.setFromUnitVectors(new T.Vector3(0,0,-1),target.sub(p.position).normalize());p.fire=true;
  }
 }
 ticks(rules,team,1);
}
assert.equal(rules.snapshot().stage,'boss');
const core=world.boss.clone().add(new T.Vector3(0,0,23));
function aimAt(p,target){p.position.copy(target).add(new T.Vector3(0,0,54));p.rotation.identity();p.fire=true;}
aimAt(team[0],core);aimAt(team[1],core);ticks(rules,team,16);
assert.equal(rules.snapshot().core,8,'shield blocks shots until both generators fall');
for(const [i,p] of team.entries())aimAt(p,rules.nodes[i]);
ticks(rules,team,72);
assert.deepEqual(rules.snapshot().generators,[0,0]);
team.forEach(p=>aimAt(p,core));ticks(rules,team,90);
assert.equal(rules.snapshot().stage,'won');
assert.equal(rules.snapshot().core,0);
const rescue=F.mission(T,{...world,rocks:[{position:new T.Vector3(0,0,0),radius:30}]},seed);
const pair=[F.pilot(T,0),F.pilot(T,1)];
pair[0].position.set(0,0,0);pair[1].position.set(350,0,0);ticks(rescue,pair,270);
assert.deepEqual(rescue.snapshot().down,[true,false]);
pair[0].position.set(45,0,0);pair[1].position.set(100,0,0);ticks(rescue,pair,125);
assert.deepEqual(rescue.snapshot().shields,[2,4],'the other pilot can restore a disabled jet');
pair[0].position.set(0,0,0);pair[1].position.set(0,0,0);ticks(rescue,pair,450);
assert.equal(rescue.snapshot().stage,'lost');
console.log('3D co-op: seeded world, loops and roll, remote state, complete escort and boss mission, rescue and loss passed.');
