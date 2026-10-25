#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const T=require('three');global.THREE=T;
const C=require('../corsair-native.js');
const model=C.create();
assert(C.isNative(model),'original Corsair recognized');
const racks=model.getObjectByName('Corsair stores');
assert.equal(racks.children.filter(n=>n.name==='HVAR').length,8);
assert.equal(racks.children.filter(n=>n.name==='1000lb center-section bomb').length,2);
for(const name of ['AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','GearLeft','GearRight','TailGear','sbdGear','sbdRotorBlade','sbdHook']){
 assert(model.getObjectByName(name),name+' missing');
}
const bounds=new T.Box3().setFromObject(model),span=bounds.max.x-bounds.min.x;
assert(span>12.45&&span<12.65,'Corsair span 12.5m; got '+span);
const ports=C.frontMuzzles(model,model);
assert.equal(ports.length,4,'four 20mm cannon ports');
for(const p of ports)assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
const clone=model.clone(true); // Object3D userData must be clone-safe.
assert(C.isNative(clone));
C.configure(clone,'mixed');
const stores=clone.getObjectByName('Corsair stores'),
 rockets=stores.children.filter(n=>n.name==='HVAR'),
 bombs=stores.children.filter(n=>n.name==='1000lb center-section bomb');
assert.equal(rockets.filter(n=>n.visible).length,8);
assert.equal(bombs.filter(n=>n.visible).length,2);
assert(bombs.every(n=>n.scale.x<.8),'mixed stores use smaller bombs');
C.consume(clone,'rocket',7);
assert.equal(rockets.filter(n=>n.visible).length,7);
assert(!rockets[0].visible,'first launch left wing');
C.consume(clone,'rocket',6);
assert(!rockets[4].visible,'second launch right wing');
C.consume(clone,'bomb',1);
assert.equal(bombs.filter(n=>n.visible).length,1);
C.pose(clone,0,{left:1,right:.5},.75,.4,1);
assert.equal(clone.getObjectByName('sbdGear').visible,false);
assert(Math.abs(clone.getObjectByName('AileronLeft').rotation.x)>0);
assert(Math.abs(clone.getObjectByName('AileronRight').rotation.x)>0);
assert(Math.abs(clone.getObjectByName('sbdHook').rotation.x)>.8);
C.configure(clone,'guns');
assert.equal(rockets.filter(n=>n.visible).length,0);
assert.equal(bombs.filter(n=>n.visible).length,0);
console.log('Corsair: dimensions, clone, controls, cannon stations, bombs and rockets PASS');
