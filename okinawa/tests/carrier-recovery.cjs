'use strict';
const assert=require('node:assert/strict'),THREE=require('three'),R=require('../../carrier-recovery.js');
for(const base of [-6,-2,0,2,6])for(const gust of [-1,0,1]){
 const w=R.wind(base,gust);assert.equal(w.z,0);assert(w.x<=0,'no tailwind or crosswind on carrier final');
}
for(const flap of [0,.5,1]){
 const limit=31-flap*7;
 assert(R.envelope({flap,spd:limit*1.14}).low,'warning arrives before aerodynamic stall');
 assert(!R.envelope({flap,spd:40}).low);
 assert(R.envelope({flap,spd:limit-.01}).stalled);
}
const clean={speed:40,sink:2.4,offset:1,bank:0,wire:3};
assert.equal(R.landing(clean).grade,'OK-3');
for(const worse of [{speed:51},{sink:7},{offset:12},{bank:.4}])assert.notEqual(R.landing({...clean,...worse}).grade,'OK-3','wire alone cannot erase an unstable touchdown');
const escort={complete:true,transports:[{alive:true,arrived:true,hp:100},{alive:true,arrived:true,hp:100}],hull:100,cleanLanding:true};
assert.equal(R.assessment(escort).medal,'gold','guns-only escort can earn Gold');
assert.equal(R.assessment({...escort,transports:escort.transports.map(t=>({...t,hp:20}))}).medal,'silver','convoy condition matters');
assert.equal(R.assessment({complete:true,hull:100,cleanLanding:true,released:2,hit:2}).medal,'gold','bomb precision counts like torpedo precision');
assert(R.assessment({complete:true,hull:100,cleanLanding:true,released:4,hit:1}).value<R.assessment({complete:true,hull:100,cleanLanding:true,released:4,hit:4}).value);
const p={spd:80,throttle:.5,fuel:30,systemDamage:{fuelLeak:0}},normal=R.reserve(p,8000,6,1),leak=R.reserve({...p,systemDamage:{fuelLeak:.1}},8000,6,1);
assert(leak.margin<normal.margin,'real leak changes return planning');
global.THREE=THREE;const D=require('../../ship-damage.js');
const scene=new THREE.Scene(),group=new THREE.Group();group.add(new THREE.Mesh(new THREE.BoxGeometry(20,16,120),new THREE.MeshBasicMaterial()));scene.add(group);
const ship={group,def:{type:'cruiser'},hp:5,alive:true},damage=D.create(THREE,scene);
group.rotation.y=.9;group.updateMatrixWorld(true);
damage.systemHit(ship,group.localToWorld(new THREE.Vector3(0,1,-55)),'torpedo');
assert(damage.performance(ship).steering<.5);assert.equal(damage.performance(ship).speed,1,'stern hit distinguishes rudder from engine');
damage.systemHit(ship,group.localToWorld(new THREE.Vector3(0,1,0)),'torpedo');assert(damage.performance(ship).speed<.5);
damage.systemHit(ship,group.localToWorld(new THREE.Vector3(0,8,30)),'bomb');assert(damage.performance(ship).aa<1,'carrier deck damage affects operational AA');
assert.equal(ship.hp,5,'system damage never invents a sinking or objective credit');
damage.clear();assert.deepEqual(damage.performance(ship),{speed:1,steering:1,aa:1});damage.dispose();
console.log('Carrier recovery: wind frame, pre-stall warning, measured landing/attack/convoy assessment, fuel reserve and oriented ship systems passed.');
