'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
require('../../sortie-features.js');require('../../game-runtime.js');
const {Handling,Damage}=SortieFeatures;global.innerWidth=1194;global.innerHeight=660;
for(const kind of ['p47','bf109','fw190','ju87','me262','me163','avenger','sbd','corsair','zero']){
 const p={ac:kind,spd:48,throttle:1,flap:0,gear:kind==='ju87'?1:0,pos:new THREE.Vector3(0,4,0),alive:true,hull:100};Handling.configure(p,kind);Damage.reset(p);
 const clean=Handling.configuration(p,40);p.gear=p.flap=1;const landing=Handling.configuration(p,40);
 assert(landing.authority<clean.authority&&landing.bank<clean.bank&&landing.gFactor<clean.gFactor&&landing.climb<clean.climb,'landing response is gently bounded: '+kind);
 assert(landing.authority>.65&&landing.gFactor>.7,'landing control stays usable');
 p.spd=40*1.12;Handling.beginDeparture(p);let early;
 for(let i=0;i<120;i++){const d=Handling.departure(p,1/60,40);if(i===0)early=d;assert.equal(d.release,0);p.pos.y+=20;}
 assert(Number.isFinite(early.rate)&&early.rate>4&&early.rate<30,'type-specific initial climb, including rocket exception');
 for(let i=0;i<60*30;i++)assert.equal(Handling.departure(p,1/60,40).release,0,'time or height cannot release the departure envelope');
 p.spd=230;Handling.departure(p,1/60,40);
 assert.equal(p.departureAge,null,'airspeed releases the initial envelope');
 assert.equal(Handling.departure(p,1/60,40).release,1);
}
const camera=new THREE.PerspectiveCamera(60,1194/660,.1,30000);
const position=new THREE.Vector3(0,150,0),ports=[new THREE.Vector3(-3,-1,2),new THREE.Vector3(3,-1,2)];
for(const pitch of [-.6,0,.4])for(const roll of [-1,0,1])for(const speed of [50,100,180]){
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch,.7,-roll,'YXZ'));
 const direction=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch,.7,0,'YXZ')));
 camera.position.copy(position).addScaledVector(direction,-28).add(new THREE.Vector3(0,8,0));camera.up.set(0,1,0);camera.lookAt(position.clone().addScaledVector(direction,35));
 const aim=GameRuntime.gunAim(camera,position,q,ports,direction,speed,760);
 const centres=ports.map(port=>port.clone().applyQuaternion(q).add(position).addScaledVector(direction,aim.range));
 const actual=centres[0].add(centres[1]).multiplyScalar(.5).project(camera);
 assert(Math.hypot(aim.x-(actual.x*.5+.5)*1194,aim.y-(-actual.y*.5+.5)*660)<1e-8,'sight follows the actual muzzle-centred trajectories, not a fixed pixel offset');
 assert(aim.range>=220&&aim.range<=430&&aim.visible);
}
const near=GameRuntime.gunAim(camera,position,new THREE.Quaternion(),ports,new THREE.Vector3(0,0,1),50,650),fast=GameRuntime.gunAim(camera,position,new THREE.Quaternion(),ports,new THREE.Vector3(0,0,1),180,650);
assert(fast.range>near.range,'speed changes the bounded bore-sight reference distance');
console.log('Ten type-specific departure envelopes release smoothly; landing controls remain usable; muzzle-based sights follow pitch/bank/speed without target input.');
