'use strict';
const assert=require('node:assert/strict'),jet=require('../../me262-performance.js');
function run(hz,options={},patch={}){const p={spd:140,throttle:1,groundPower:1,pitch:0,gear:0,...patch};for(let i=0;i<hz*30;i++)jet.step(p,1/hz,options);return p.spd;}
const speeds=[20,60,120].map(h=>run(h));assert(Math.max(...speeds)-Math.min(...speeds)<.05);
assert(run(60,{bank:1})<run(60));assert(run(60,{flaps:1},{gear:1})<run(60));assert(run(60,{}, {pitch:.2})<run(60));assert(run(60,{power:.5})<run(60));
let p={spd:240,throttle:1,groundPower:1,pitch:0,gear:0};for(let i=0;i<60*300;i++)jet.step(p,1/60);assert(Math.abs(p.spd-242)<.001);console.log('Me 262 gameplay energy and FPS checks passed',speeds);

// Build 232: step() was refactored onto dragOf()/thrustOf() - it must stay bit-identical to the Build 231 formula.
function oldStep(p,dt,options={}){
 const throttle=Math.max(0,Math.min(1,p.throttle||0));
 p.groundPower=(p.groundPower||0)+(throttle-(p.groundPower||0))*(1-Math.exp(-dt/jet.data.spoolSeconds));
 const mass=Math.max(.8,options.loadRatio||1),speed=Math.max(0,p.spd||0);
 const thrust=jet.data.thrust*p.groundPower*Math.max(0,options.power??1)/mass;
 const bank=Math.abs(Math.sin(options.bank||0));
 const drag=jet.data.thrust*(speed/jet.data.maxSpeed)**2+bank*bank*.8+(p.gear||0)*.7+(options.flaps||0)*1.2+(options.drag||0)*.15;
 p.spd=Math.max(6,speed+(thrust-drag-9.81*Math.sin(p.pitch||0))*dt);
 return p.spd;
}
for(const [patch,o] of [[{},{}],[{gear:1,pitch:.3},{flaps:.5,loadRatio:1.2}],[{throttle:.2,spd:90,pitch:-.2},{bank:.9,drag:2,power:.6}],[{spd:3},{}],[{spd:230,pitch:.05},{loadRatio:.9}]]){
 const a={spd:120,throttle:1,groundPower:.4,pitch:.1,gear:0,...patch},b={...a};
 for(let i=0;i<600;i++){assert.equal(jet.step(a,1/60,o),oldStep(b,1/60,o));assert.equal(a.groundPower,b.groundPower);}
}

// Build 232: the pitch ceiling of the ARCADE Me 262. Loaded jet (ratio 1.1), stall speed 52 m/s, the game's nose limit 1.058 rad.
const deg=r=>r*180/Math.PI,stall=52,limit=1.058,base={loadRatio:1.1,stall,limit};
const at=(spd,patch={},o={})=>jet.pitchCeiling({gear:0,groundPower:1,spd,...patch},{...base,...o});
// 1. it lifts the old slow-speed cap (14.8 deg at 60 m/s, 12 deg at 80, 10.6 at 100) by a wide margin
const old=v=>Math.asin(Math.min(.65,(15+Math.max(0,v-55)*.075)/v));
for(const v of [60,65,75,85,100])assert.ok(at(v)>old(v)+.15,'the ceiling at '+v+' m/s ('+deg(at(v)).toFixed(1)+') is well above the old cap ('+deg(old(v)).toFixed(1)+')');
assert.ok(deg(at(65))>=22&&deg(at(65))<=30,'clean, full power, 65 m/s: about the 25 deg the engines sustain ('+deg(at(65)).toFixed(1)+')');
// 2. configuration, load, bank and thrust cost climb angle
assert.ok(at(65,{gear:1},{flaps:.5})<at(65)-.1,'gear and flaps lower the ceiling');
assert.ok(at(65,{},{loadRatio:1.24})<at(65),'a heavier aircraft climbs less steeply');
assert.ok(at(65,{},{bank:1})<at(65),'a banked turn costs climb angle');
assert.ok(at(65,{groundPower:.5})<at(65),'less thrust, lower ceiling');
// 3. never below the floor (landing flare, idle pull-up), never above the limit; the floor equals the old cap at 55-65 m/s
for(const v of [40,55,60,65,70])assert.ok(at(v,{groundPower:0})>=jet.climb.floor-1e-9&&at(v,{groundPower:0})<=jet.climb.floor+.05,'idle at '+v+' m/s keeps the floor '+deg(at(v,{groundPower:0})).toFixed(1));
assert.ok(deg(jet.climb.floor)>=deg(old(65))-.5,'the floor is at least the old cap at 65 m/s');
assert.equal(at(200),limit,'fast and light: the game limit');assert.equal(at(65,{},{limit:.3}),.3,'options.limit is respected');
assert.ok(at(100)>at(75)&&at(75)>at(65),'more speed to spend, steeper ceiling');
// 4. without a stall speed there is no speed term - only what the engines sustain
assert.ok(at(150,{},{stall:0})<at(150),'no stall reference, no zoom budget');
// 5. holding the nose AT the ceiling never lets the speed fall into the stall (all start speeds, clean and dirty, any frame rate)
const finals=[];
for(const hz of [20,60,120])for(const [v0,gear,flaps] of [[140,0,0],[100,0,0],[80,0,0],[65,0,0],[65,1,.5]]){
 const q={spd:v0,throttle:1,groundPower:1,gear,pitch:0};let minV=v0;
 for(let i=0;i<hz*60;i++){const o={...base,flaps};q.pitch=jet.pitchCeiling(q,o);jet.step(q,1/hz,o);minV=Math.min(minV,q.spd);assert.ok(Number.isFinite(q.spd));}
 assert.ok(minV>=1.14*stall,hz+' Hz from '+v0+' m/s gear '+gear+': the speed stays above 1.14 x stall ('+(minV/stall).toFixed(2)+')');
 if(v0===100&&!gear)finals.push(q.pitch);
}
assert.ok(Math.max(...finals)-Math.min(...finals)<.01,'frame rate does not change where the nose settles');
// 6. the one deliberate exception: the floor. Gear down, full flaps, 60 m/s sustains only ~13 deg, the floor (and the old cap) is 14.9 -
// so the ceiling may sit above the sustainable angle there (about 2 deg), exactly as the old cap did, and never below the floor.
{const q={gear:1,groundPower:1,spd:60},o={...base,flaps:1},sustainable=Math.asin((jet.thrustOf(q,o)-jet.dragOf(q,60,o))/9.81);
 assert.ok(sustainable<jet.climb.floor-.02&&jet.pitchCeiling(q,o)===jet.climb.floor,'landing configuration at 60 m/s: the ceiling is the floor ('+deg(sustainable).toFixed(1)+' deg sustainable)');}
console.log('Me 262 pitch ceiling checks passed: 65 m/s '+deg(at(65)).toFixed(1)+' deg, 85 m/s '+deg(at(85)).toFixed(1)+', 100 m/s '+deg(at(100)).toFixed(1)+', dirty 65 m/s '+deg(at(65,{gear:1},{flaps:.5})).toFixed(1)+', idle '+deg(at(65,{groundPower:0})).toFixed(1));

// Build 232: the pitch-rate cap. The sheet leaves the jet 0.25 rad/s below 80 m/s; ARCADE lifts it to 0.40 while the wing flies.
{const cap=jet.pitchRateCap;
 assert.equal(cap(.25,65,50),jet.climb.minRate,'a flying wing at 65 m/s (1.3 x stall): the raised cap');
 assert.equal(cap(.62,65,50),.62,'a higher envelope cap (fast flight) is never lowered');
 assert.equal(cap(.25,50,50),.25,'at the stall speed the extra rate is gone');
 assert.equal(cap(.25,40,50),.25,'below it too');
 assert.ok(cap(.25,55,50)>.25&&cap(.25,55,50)<jet.climb.minRate,'it fades in between 1.0 and 1.15 x stall');
 assert.equal(cap(.25,65,0),.25,'without a stall speed nothing changes');
 let last=0;for(let v=48;v<=60;v+=.5){const c=cap(.25,v,50);assert.ok(c>=last-1e-12,'monotonic in speed');last=c;}
 console.log('Me 262 pitch-rate cap checks passed:',[50,55,58,65].map(v=>v+' m/s '+(cap(.25,v,50)*180/Math.PI).toFixed(1)+' deg/s').join(', '));}
