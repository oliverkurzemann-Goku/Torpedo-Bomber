'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');
require('../../sortie-features.js');
const html=fs.readFileSync(path.resolve(__dirname,'../../remagen-mission.html'),'utf8');
const a=html.indexOf('function relaunch(){'),b=html.indexOf('function startMission(i){',a);
assert(a>0&&b>a,'real mission launch found');
const P={pos:new THREE.Vector3(),ac:'me163',gear:1,gearTgt:1,flap:0,flapTgt:0};
const ctx=vm.createContext({P,THREE,AF_X:23600,AF_Z:25725,RWY_LEN:900,RTILE:4000,RGRID_W:7,RGRID_H:8,ST:{FLIGHT:3},
 terrain:{getHeight:()=>180},groundY:()=>180,setThrottleUI:v=>{P.throttle=v;}});
vm.runInContext(html.slice(a,b),ctx);ctx.relaunch();
assert.equal(P.onGround,false,'Me 163 starts airborne after trolley release');
assert.equal(P.gearTgt,0,'no takeoff wheels follow the Komet into the air');
assert(P.pos.y>800&&P.spd>140&&P.throttle>.5,'intercept has an initial powered climb');
assert(P.pos.x<23600&&P.pos.z<25725,'trolley release is already inland of the German field');
assert(Math.sin(P.heading)<0&&Math.cos(P.heading)<0,'Komet faces southwest into the interception area');
// Straight flight at maximum rocket speed must leave time for the first attack.
for(let seconds=0;seconds<=90;seconds++){
 const x=P.pos.x+Math.sin(P.heading)*238*seconds,z=P.pos.z+Math.cos(P.heading)*238*seconds;
 assert(Math.min(x,28000-x,z,32000-z)>5000,'first ninety seconds stay five kilometres from every edge');
}

const first=html.indexOf('  const stallSpd=STALL_SPD+P.gear*2-P.flap*4;',html.indexOf('function updateFlight(dt){'));
const last=html.indexOf('  // ---- attitude:',first);
assert(first>0&&last>first);
const speed=vm.runInNewContext('(function(P,dt,STALL_SPD,THR_MIN_SPD,MAX_SPD){'+html.slice(first,last)+'})',{SortieFeatures:global.SortieFeatures});
P.fuel=0;P.throttle=0;P.pitch=0;P.gear=1;P.spd=155;
for(let i=0;i<200;i++)speed(P,.05,51,33,238);
assert(P.spd<140&&P.spd>65,'spent rocket glides and gradually slows instead of receiving idle jet thrust');
const level=P.spd;
P.spd=155;P.pitch=-.11;
for(let i=0;i<200;i++)speed(P,.05,51,33,238);
assert(P.spd>level+5,'shallow descent trades altitude for energy on the glide home');
P.fuel=65;P.throttle=1;const before=P.spd;
for(let i=0;i<20;i++)speed(P,.05,51,33,238);
assert(P.spd>before,'powered Komet accelerates when fuel remains');
console.log('Me 163 starts airborne with stowed skid, then powers the intercept and glides home');
