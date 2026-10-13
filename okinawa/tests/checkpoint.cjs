'use strict';
const assert=require('node:assert/strict');
global.THREE=require('three');
const values=new Map(),listeners={};
global.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
global.addEventListener=(name,fn)=>listeners[name]=fn;
const C=require('../../sortie-checkpoint.js');
const pos=new THREE.Vector3(10,200,30),q=new THREE.Quaternion(),fired=new Set([0,2]);
const packed=C.capture({pos,q,fired,gear:.5,mesh:new THREE.Group()});
const restored=C.restore({pos:new THREE.Vector3(),fired:new Set()},JSON.parse(JSON.stringify(packed)));
assert.deepEqual(restored.pos.toArray(),pos.toArray());assert.deepEqual([...restored.fired],[0,2]);assert(!packed.mesh);
let safe=true,score=12,loads=0;
const create=campaign=>C.create({campaign,identity:i=>i===2?'lone':null,canSave:()=>safe,
 snapshot:()=>({mission:2,identity:'lone',label:'Lone Merchant',player:C.capture({pos,alive:true,spd:80}),score}),
 load:async s=>{assert.equal(s.score,score);loads++;}}).mount();
(async()=>{
 const session=create('pacific');await session.initialized;
 assert(session.save().persistent);score=42;session.save();
 assert.equal(session.read().data.score,42);
 // Tear/corrupt the most recent slot. Earlier valid state remains usable.
 const key='sortie-v1-pacific.'+(session.read().sequence%2?'b':'a');values.set(key,'{"schema":1');
 const reloaded=create('pacific');await reloaded.initialized;
 assert.equal(reloaded.read().data.score,12);score=12;await reloaded.resume();assert.equal(loads,1);
 const other=create('europeRhine');await other.initialized;other.save();
 safe=false;assert.equal(session.save().ok,false);assert.equal(session.read().data.score,42);
 session.clear();assert(!session.read());assert(other.read(),'campaign slots independent');
 safe=true;global.localStorage.setItem=()=>{throw Error('quota');};
 assert.equal(other.save().persistent,false);assert(other.read(),'session fallback without claiming durable storage');
 // Native hydration chooses newest valid slot; all queued writes/clear remain ordered.
 const native=new Map(),writes=[];global.SquadronNative={get:async k=>native.get(k)||null,set:async(k,v)=>{native.set(k,v);writes.push('set');},remove:async k=>{native.delete(k);writes.push('remove');}};
 const app=create('native');await app.initialized;assert(app.save().persistent);await app.flush();
 const envelope=app.read();values.clear();const recovered=create('native');await recovered.initialized;
 assert.equal(recovered.read().sequence,envelope.sequence);assert.equal(recovered.read().data.score,12);
 recovered.save();recovered.clear();await recovered.flush();assert.equal(native.size,0);assert.equal(writes.at(-1),'remove');
 const changed=C.create({campaign:'europeRhine',identity:()=> 'different',canSave:()=>true,snapshot:()=>{},load:()=>{}});assert(!changed.read(),'changed mission cannot load');
 console.log('Checkpoint codec, checksum, interrupted write, independent campaigns, blocked storage, native hydration/queue and compatibility passed.');
})().catch(error=>{console.error(error);process.exit(1);});
