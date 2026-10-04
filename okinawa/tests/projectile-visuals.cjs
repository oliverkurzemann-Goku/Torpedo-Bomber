'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
global.THREE=THREE;require('../../combat-fx.js');require('../../game-runtime.js');
const {CombatFX,GameRuntime}=global;
const html=fs.readFileSync('torpedo-carrier.html','utf8');
const extract=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
function aligned(mesh,direction){
 mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3());
 const axis=size.x>size.y&&size.x>size.z?new THREE.Vector3(1,0,0):size.y>size.z?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
 assert(Math.abs(axis.applyQuaternion(mesh.quaternion).dot(direction))>.99999,'the geometric long axis follows the actual shot direction');
}
// Exercise the actual ship AA routine, including different deck/target bearings.
const ctx=vm.createContext({THREE,CombatFX,GameRuntime,Math,scene:new THREE.Scene(),ships:[],tracers:[],raiders:[],wingmen:[],
 P:{pos:new THREE.Vector3(),alive:true,spd:65},isDefend:()=>false,noseDir:()=>new THREE.Vector3(1,0,0),sfxPop(){},spawnFlakBurst(){}});
vm.runInContext(extract('function updateFlak(dt){','// Four deck-edge'),ctx);
for(const target of [new THREE.Vector3(650,35,0),new THREE.Vector3(0,35,650),new THREE.Vector3(-650,35,-650)]){
 ctx.P.pos.copy(target);ctx.ships=[{alive:true,flak:true,flakTimer:0,group:new THREE.Group()}];ctx.tracers=[];
 ctx.updateFlak(.01);assert.equal(ctx.tracers.length,3);ctx.tracers.forEach(t=>aligned(t.mesh,t.dir));
}
// Shared resources survive thousands of shots and mixed lit/dark rounds stay physical.
const geometries=new Set(),materials=new Set(),colors=new Set();let disposed=0;
for(const kind of ['rifle','cannon','aa'])for(let i=0;i<1000;i++){
 const m=CombatFX.round(kind);geometries.add(m.geometry);materials.add(m.material);colors.add(m.material.color.getHex());
 const dir=new THREE.Vector3(Math.sin(i*.31),Math.sin(i*.07)*.35,Math.cos(i*.31)).normalize();
 m.position.set(20,100,40);m.lookAt(m.position.clone().add(dir));aligned(m,dir);
 const scene=new THREE.Scene();scene.add(m);GameRuntime.release(m);assert.equal(m.parent,null);
}
for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
for(const m of materials)m.addEventListener('dispose',()=>disposed++);
const sample=CombatFX.round();GameRuntime.release(sample);assert.equal(disposed,0,'cleanup preserves cached round resources');
assert.equal(geometries.size,3);assert.equal(materials.size,6);assert.equal(colors.size,2);
console.log('Projectiles: actual ship AA, 3,000 varied shot directions aligned to velocity, mixed dark/lit rounds, fixed shared resource count.');
