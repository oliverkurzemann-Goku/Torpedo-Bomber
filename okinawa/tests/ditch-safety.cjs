'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
require('../../flight-support.js');const Bailout=require('../../pilot-bailout.js');
const safe={alive:true,hull:30,gear:0,hook:0,throttle:.15,spd:45,vSpeed:-2,pitch:.04,roll:.03};
assert(FlightSupport.canDitch(safe,38,42));
for(const bad of [{gear:.6},{hook:1},{throttle:1},{spd:80},{spd:12},{vSpeed:-6},{vSpeed:5},{pitch:-.3},{pitch:.5},{roll:.4},{alive:false},{hull:0}])
 assert(!FlightSupport.canDitch({...safe,...bad},38,42),'unsafe impact rejected: '+JSON.stringify(bad));
for(const water of [false,true]){
 const scene=new THREE.Scene(),chute=Bailout.create(THREE,scene,new THREE.Vector3(0,100,0),0,60,()=>0);
 const pilot=chute.group.getObjectByName('pilot');
 assert(pilot.userData.arms.every(a=>a.rotation.z===0),'free fall starts with neutral arms');
 for(let i=0;i<60;i++)chute.update(1/60);assert(chute.deployed);
 assert(pilot.userData.arms.every(a=>Math.abs(a.rotation.z)>2),'hanging pilot holds the risers');
 chute.settle(water);assert(pilot.userData.arms.every(a=>a.rotation.z===0),'landed pilot lowers arms');
 if(water)assert(pilot.userData.legs.every(a=>a.rotation.x<-.9),'survivor sits in dinghy');
 chute.settle(water);assert.equal(chute.group.children.filter(o=>o.name==='pilotDinghy').length,water?1:0,'settle is idempotent');
 chute.dispose();assert.equal(scene.children.length,0);
}
for(const fps of [20,60,120]){
 const scene=new THREE.Scene(),survivor=Bailout.create(THREE,scene,new THREE.Vector3(0,.9,0),0,0,()=>0,{landed:true});
 for(let i=0;i<fps*10;i++)assert.deepEqual(survivor.update(1/fps,8),{landed:true,safe:true});
 assert(!survivor.deployed);assert.equal(survivor.position.y,.9);survivor.dispose();
}
console.log('Ditch eligibility rejects unsafe speed/sink/bank/gear/power; deployed, landed and seated survivor poses; no phantom chute, drift or duplicate raft at 20/60/120 FPS');
