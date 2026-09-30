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
const bounded=PilotRescue.create(THREE,scene,new THREE.Vector3(1,100,1),()=>100,{water:false,waterAt:()=>false,bounds:{minX:0,minZ:0,maxX:30,maxZ:30}});
for(let i=0;i<160;i++){bounded.update(.05);assert(bounded.group.position.x>=0&&bounded.group.position.z>=0);}
bounded.dispose();
console.log('Pickup: boat/dinghy, land search party, river masks, terrain bounds, eight-second finish and idempotent resource cleanup');
