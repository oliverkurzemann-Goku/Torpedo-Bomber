/* Run with NODE_PATH pointing to three@0.128.0. Exercise the shipped wingman AI. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');
const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
function source(name,next){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a+1);
 assert.ok(a>0&&b>a);return html.slice(a,b);}
const P={pos:new THREE.Vector3(0,180,0),heading:0,pitch:0,spd:80};
const w={alive:true,mode:'form',cool:999,pos:new THREE.Vector3(-26,177,-30),
 slotPos:new THREE.Vector3(-26,177,-30),heading:Math.PI/2,pitch:0,roll:0,
 vel:new THREE.Vector3(80,0,0),mesh:new THREE.Group(),disc:null,side:-1};
const ctx=vm.createContext({THREE,Math,P,ships:[],wingmen:[w],PROP_STEP:.3,isDefend:()=>false});
vm.runInContext(source('playerLateral','spawnWingman')+'\n'+source('updateWingmen','updateWingShots')+
 '\n'+source('noseDir','loadPlaneModel'),ctx);
let moved=0;
for(let i=0;i<240;i++){
 if(i===60)P.heading=Math.PI;
 const before=w.pos.clone(),old=w.heading;
 ctx.updateWingmen(1/60);
 assert.ok(Math.abs(w.heading-old)<=.32/60+1e-7,'wingman cannot rotate in place');
 moved+=before.distanceTo(w.pos);
 P.pos.addScaledVector(ctx.noseDir(),P.spd/60);
}
assert.ok(moved>150,'wingman travels forward through the manoeuvre');
assert.ok(Number.isFinite(w.roll)&&Math.abs(w.roll)<.7,'bank remains physically bounded');
assert.ok(Math.abs(w.heading-Math.PI/2)>.05,'aircraft eventually turns with its flight path');
console.log('Formation: aligned launch, bounded bank/yaw, and continuous travel through a leader reversal');
