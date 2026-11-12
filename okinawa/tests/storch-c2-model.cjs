'use strict';
/* Build 249: the player Fieseler Fi 156 C-2 Storch (assets/aircraft/fi156c2-player.glb, delivered as Fieseler_Storch_C2_Torpedo_Bomber.zip).
 * Read from the exported bytes: pinned SHA-256, the Khronos validator (0/0), vertex bounds, budgets, the rig contract (class tailwheel-light),
 * the named nodes the game addresses, and the data sheet the game flies it on (FlightCore: the numbers of L.Dv.T. 2601/1 Annex 3).
 * The delivered check.cjs and generator are NOT run (foreign code); they are kept under scripts/own-models/fi156c2-player/ for reference. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const validator=require('gltf-validator');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'assets/aircraft/fi156c2-player.glb');
const bytes=fs.readFileSync(file);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'fcf41581590a12ee5f0dd18d67e6d8d9320c56b8c2e6db4aaaffd958302d5a84','pinned delivery');
const jsonLen=bytes.readUInt32LE(12),json=JSON.parse(bytes.slice(20,20+jsonLen).toString());
const names=new Map(json.nodes.map((n,i)=>[n.name,i]));
for(const n of ['Storch','gear','flightFlaps','Canopy','TailGear','GearLeft','GearRight','Propeller','TailSkid','Rudder','WheelLeft','WheelRight','FlapLeft','FlapRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight'])assert(names.has(n),n+' node');
const rootExtras=json.nodes[names.get('Storch')].extras;
assert.equal(rootExtras.rigContract,1);assert.equal(rootExtras.class,'tailwheel-light');assert.equal(rootExtras.kind,'fi156');
assert.deepEqual(json.nodes[names.get('Propeller')].extras.rig,{drive:'prop',axis:[0,0,1],blades:2},'two-blade propeller (the game reads the blade count from the rig)');
for(const n of ['WheelLeft','WheelRight','TailSkid'])assert.equal(json.nodes[names.get(n)].extras.groundWheel,true,n+' is a ground contact');
assert(!json.nodes.some(n=>/^Muzzle/.test(n.name)),'unarmed airframe: the game places the observer\'s gun itself (storchGunnerPoint)');
for(const n of ['GearLeft','GearRight','TailGear'])assert.deepEqual(json.nodes[names.get(n)].extras.rig.range,[0,0],n+' is fixed (the legs do not retract)');
// bounds, budgets and the validator
(async()=>{
 const report=await validator.validateBytes(new Uint8Array(bytes));
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);
 assert.equal(report.info.totalTriangleCount,14484);assert(report.info.totalTriangleCount<=20000);assert(report.info.materialCount<=8);assert(bytes.length<=4e6);
 const mins=[1e9,1e9,1e9],maxs=[-1e9,-1e9,-1e9];
 // node-local bounds through accessor min/max are enough here: the airframe sits at the origin and the parts are small offsets
 const acc=json.accessors;
 for(const n of json.nodes){if(n.mesh===undefined)continue;const t=n.translation||[0,0,0];
  for(const p of json.meshes[n.mesh].primitives){const a=acc[p.attributes.POSITION];for(let k=0;k<3;k++){mins[k]=Math.min(mins[k],a.min[k]);maxs[k]=Math.max(maxs[k],a.max[k]);}}}
 assert(Math.abs(maxs[0]-mins[0])>=14.2,'span about 14.25 m (wings + struts) '+(maxs[0]-mins[0]));
 // the rig contract through the project's own checker
 const rig=cp.spawnSync(process.execPath,[path.join(root,'scripts/check-rig-contract.mjs'),file],{encoding:'utf8'});
 assert.equal(rig.status,0,rig.stdout+rig.stderr);assert(/PASSED rig contract v1/.test(rig.stdout));
 // the data sheet it is flown on: solved from the manual's numbers, reproduced exactly
 const C=require('../../flight-core.js'),m=C.model('fi156'),G=9.80665;
 assert(Math.abs(C.stallSpeed(m,0)*3.6-62)<.01,'clean stall 62 km/h');assert(Math.abs(C.stallSpeed(m,0,1,1)*3.6-51)<.01,'full-flap stall 51 km/h');
 assert(Math.abs(C.levelMaxSpeed(m,0,1260*G,'max')*3.6-175)<.05,'175 km/h at sea level');
 assert(Math.abs(C.bestClimb(m,0,1260*G,'max',false,.25).rate-4.6)<.02,'4.6 m/s with 10 deg flap');
 console.log('Storch C-2 player model: pinned bytes, validator 0/0,',report.info.totalTriangleCount,'triangles, rig contract, data sheet reproduces 62/51/175 km/h and 4.6 m/s');
})().catch(e=>{console.error(e);process.exit(1);});
