'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const THREE=require('three');global.THREE=THREE;require('../../game-runtime.js');require('../../ordnance.js');
for(const kind of ['bomb','torpedo']){
 const scene=new THREE.Scene(),a=Ordnance.create(kind),b=Ordnance.create(kind);scene.add(a,b);
 assert.equal(a.getObjectByName('ogiveBody').geometry,b.getObjectByName('ogiveBody').geometry);
 assert.equal(a.children.filter(c=>c.name==='tailFin').length,4);
 const box=new THREE.Box3().setFromObject(a),size=box.getSize(new THREE.Vector3());
 assert(size.z>size.x*1.6,'long axis is +Z');
 const fins=a.children.filter(c=>c.name==='tailFin');
 for(const f of fins){const bb=new THREE.Box3().setFromObject(f);assert(bb.max.z<0,'fins behind centre');}
 let disposed=0;a.traverse(c=>{if(c.geometry)c.geometry.addEventListener('dispose',()=>disposed++);});
 for(let i=0;i<100;i++){const m=Ordnance.create(kind);scene.add(m);GameRuntime.own(m);GameRuntime.release(m);}
 GameRuntime.own(a);GameRuntime.release(a);assert.equal(disposed,0,'releases preserve shared ordnance resources');assert.equal(b.parent,scene);
 const v=new THREE.Vector3(40,-32,18).normalize();b.lookAt(b.position.clone().add(v));b.updateMatrixWorld(true);
 assert(new THREE.Vector3(0,0,1).transformDirection(b.matrixWorld).dot(v)>.99999,'rounded nose follows velocity');
 let triangles=0;b.traverse(c=>{if(c.isMesh)triangles+=(c.geometry.index?.count||c.geometry.attributes.position.count)/3;});
 assert(triangles<450,'small geometry budget for iPad');
 console.log(kind+': four tail fins, nose aligned to velocity, '+triangles+' triangles, shared resources survive 100 drops');
}
const html=fs.readFileSync(require.resolve('../../torpedo-carrier.html'),'utf8');
const start=html.indexOf('function dropTorpedo('),end=html.indexOf('function updateTorpedoes(');
const scene=new THREE.Scene(),P={alive:true,torps:2,pos:new THREE.Vector3(0,50,0),pitch:-.5,heading:.3,roll:0,spd:70};
const ctx=vm.createContext({THREE,Ordnance,GameRuntime,P,scene,state:3,ST:{FLIGHT:3},loadout:'torpedo',
 DROP_MAX_ALT:80,DROP_MAX_SPD:90,torpedoes:[],bombs:[],sortieTorpFired:0,lastTorpDud:false,D:()=>({dud:0}),updateHUD(){},sfxWhoosh(){},flash(){},
 noseDir:()=>new THREE.Vector3(Math.cos(P.pitch)*Math.cos(P.heading),Math.sin(P.pitch),Math.cos(P.pitch)*Math.sin(P.heading)),
 shoreHeight:()=>0,shoreTargets:[],ships:[],spawnSplash(){},sfxBoom(){}});
vm.runInContext(html.slice(start,end),ctx);ctx.dropTorpedo();assert.equal(ctx.torpedoes[0].mesh.userData.ordnance,'torpedo');
ctx.torpedoes[0].mesh.updateMatrixWorld(true);assert(new THREE.Vector3(0,0,1).transformDirection(ctx.torpedoes[0].mesh.matrixWorld).dot(ctx.torpedoes[0].dir)>.999);
ctx.loadout='divebomb';ctx.dropTorpedo();assert.equal(ctx.bombs[0].mesh.userData.ordnance,'bomb');ctx.updateBombs(.02);
ctx.bombs[0].mesh.updateMatrixWorld(true);assert(new THREE.Vector3(0,0,1).transformDirection(ctx.bombs[0].mesh.matrixWorld).dot(ctx.bombs[0].vel.clone().normalize())>.999);
console.log('Actual Pacific release button paths: bomb and torpedo use shaped models, nose follows travel.');
