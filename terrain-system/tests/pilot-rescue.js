'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
const PilotRescue=require('../../pilot-rescue.js'),PilotBailout=require('../../pilot-bailout.js');
for(const water of [false,true]){
 const scene=new THREE.Scene(),floor=water?0:120,groundAt=()=>floor;
 const chute=PilotBailout.create(THREE,scene,new THREE.Vector3(0,floor+100,0),0,0,groundAt);
 for(let i=0;i<1000;i++)if(chute.update(.05).landed)break;
 chute.settle(water);assert(water?chute.group.getObjectByName('pilotDinghy'):chute.group.children[0].scale.y<.1);
 const rescue=PilotRescue.create(THREE,scene,chute.position,groundAt,{water,waterAt:()=>water});
 assert.equal(rescue.group.name,water?'rescueBoat':'rescueParty');
 assert(rescue.group.position.distanceTo(chute.position)>15,'pickup approaches from visible distance');
 const geometries=new Set(),materials=new Set();for(const g of [rescue.group,rescue.marker])g.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
 let gd=0,md=0;for(const g of geometries)g.addEventListener('dispose',()=>gd++);for(const m of materials)m.addEventListener('dispose',()=>md++);
 const before=rescue.group.position.clone();rescue.update(3);assert(rescue.group.position.distanceTo(chute.position)<before.distanceTo(chute.position));
 assert.equal(rescue.update(3).pickup,false);assert.equal(rescue.update(.3).pickup,true);
 assert.equal(rescue.update(1).done,false);assert.equal(rescue.update(1).done,true,'eight-second sequence ends deterministically');
 rescue.dispose();rescue.dispose();assert.equal(gd,geometries.size);assert.equal(md,materials.size,'shared rescue materials are disposed exactly once');
 chute.dispose();assert.equal(scene.children.length,0,'retry leaves no rescue scene behind');
}
// Real river levels need not be sea-level. Routes may not cross the bank.
const scene=new THREE.Scene(),position=new THREE.Vector3(100,51,100),waterAt=(x,z)=>Math.abs(x-100)<5;
const river=PilotRescue.create(THREE,scene,position,()=>50,{water:true,waterAt});
for(let i=0;i<160;i++){river.update(.05);assert(waterAt(river.group.position.x,river.group.position.z));assert(Math.abs(river.group.position.y-50)<.08);}
river.dispose();
const waves=PilotRescue.create(THREE,scene,new THREE.Vector3(0,1,0),()=>0,{water:true,surfaceAt:()=>2.5});
waves.update(.1);assert(Math.abs(waves.group.position.y-2.5)<.08,'boat follows the existing sea surface, not a flat plane');waves.dispose();
const bounded=PilotRescue.create(THREE,scene,new THREE.Vector3(1,100,1),()=>100,{water:false,waterAt:()=>false,bounds:{minX:0,minZ:0,maxX:30,maxZ:30}});
for(let i=0;i<160;i++){bounded.update(.05);assert(bounded.group.position.x>=0&&bounded.group.position.z>=0);}
bounded.dispose();
// Three scattered survivors share one actual launch, including a late arrival.
const crew=PilotRescue.createCrew(THREE,scene,()=>0,{surfaceAt:()=>2.5}),tickets=[crew.add(new THREE.Vector3(0,1,0)),crew.add(new THREE.Vector3(60,1,0))];
const boat=tickets[0].group;assert.equal(tickets[1].group,boat);
let last=boat.position.clone(),boarded=0;
for(let i=0;i<1000;i++){
 crew.update(.05);assert(boat.position.distanceTo(last)<.6,'one launch travels continuously, without teleporting between survivors');last.copy(boat.position);
 assert.equal(scene.children.filter(o=>o.name==='rescueBoat').length,1);assert(Math.abs(boat.position.y-2.5)<.08);
 const count=boat.children.filter(o=>o.name==='rescuedCrew').length;assert(count>=boarded);boarded=count;
 if(tickets.every(t=>t.update().done))break;
}
assert(tickets.every(t=>t.pickup));assert.equal(boarded,2);
tickets.push(crew.add(new THREE.Vector3(-50,1,35)));assert.equal(tickets[2].group,boat,'late survivor uses the existing boat');
for(let i=0;i<1000&&!tickets[2].update().done;i++)crew.update(.05);
assert(tickets[2].pickup);assert.equal(boat.children.filter(o=>o.name==='rescuedCrew').length,3);
const sharedGeometry=new Set(),sharedMaterials=new Set();for(const g of [boat,tickets[0].marker])g.traverse(o=>{if(o.geometry)sharedGeometry.add(o.geometry);if(o.material)for(const m of [].concat(o.material))sharedMaterials.add(m);});
let disposedGeometry=0,disposedMaterials=0;for(const g of sharedGeometry)g.addEventListener('dispose',()=>disposedGeometry++);for(const m of sharedMaterials)m.addEventListener('dispose',()=>disposedMaterials++);
crew.dispose();crew.dispose();assert.equal(disposedGeometry,sharedGeometry.size);assert.equal(disposedMaterials,sharedMaterials.size);assert.equal(scene.children.length,0);
// A shore obstruction forces a detour, and disconnected waters do not teleport.
for(const disconnected of [false,true]){
 const waterAt=disconnected?(x,z)=>Math.hypot(x,z)<10||Math.hypot(x-100,z)<10:(x,z)=>!(x>20&&x<40&&Math.abs(z)<15);
 const squad=PilotRescue.createCrew(THREE,scene,(x,z)=>waterAt(x,z)?0:30,{waterAt});squad.add(new THREE.Vector3(0,1,0));const target=squad.add(new THREE.Vector3(disconnected?100:60,1,0));
 for(let i=0;i<2000&&!target.update().done;i++){squad.update(.05);assert(waterAt(squad.group.position.x,squad.group.position.z),'shared boat never crosses land');}
 assert.equal(target.update().done,true);assert.equal(target.pickup,!disconnected);squad.dispose();
}
console.log('Pickup: boat/dinghy, land search party, river masks, terrain bounds, eight-second finish and idempotent resource cleanup');
console.log('Shared crew rescue: one launch, three visible passengers, late arrivals, continuous travel, coastal detours and cleanup');
