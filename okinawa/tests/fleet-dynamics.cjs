'use strict';
const assert=require('node:assert/strict');
require('../../p47-performance');require('../../me262-performance');
const F=require('../../flight-dynamics');
function run(kind,{pitch=0,roll=0,throttle=1,fuel=100,seconds=10,gear=0,flaps=0,mass=1,start=85,fps=60,power=1}={}){
 const p={ac:kind,spd:start,throttle,pitch,roll,gear,flap:flaps,fuel,pos:{y:1000}};
 for(let i=0;i<Math.round(seconds*fps);i++)F.step(p,1/fps,{bank:roll,flaps,loadRatio:mass,power});
 return p.spd;
}
const rows={};
for(const kind of Object.keys(F.profiles)){
 const straight=run(kind),turn=run(kind,{roll:1.1}),climb=run(kind,{pitch:.20}),dive=run(kind,{pitch:-.20}),idle=run(kind,{throttle:0});
 assert(run(kind,{fuel:0,throttle:1})<85,kind+' cannot generate thrust from an empty tank');
 assert(straight>turn&&straight>climb&&dive>straight&&idle<85,kind+' exchanges energy rather than snapping to target speed');
 assert(run(kind,{mass:1.2})<run(kind,{mass:.92}),kind+' external load has a cost');
 assert(run(kind,{power:.5})<straight,kind+' engine damage has a cost');
 assert(run(kind,{flaps:1,gear:1})<straight,kind+' configuration has a cost');
 const speeds=[20,60,120].map(fps=>run(kind,{fps,roll:.7,pitch:.08}));
 assert(Math.max(...speeds)-Math.min(...speeds)<.07,kind+' 20/60/120 FPS consistency');
 rows[kind]={straight,turn,climb,dive,idle,fpsSpread:Math.max(...speeds)-Math.min(...speeds)};
}
assert(rows.bf109.climb>rows.p47.climb+10,'109 has stronger low-speed climb response than the heavy Jug');
assert(rows.p47.idle>rows.bf109.idle+5,'Jug coasts longer');
assert(rows.me163.straight>rows.me262.straight+40,'Komet has immediate rocket acceleration');
assert(run('me262',{seconds:90,start:150})>run('bf109',{seconds:90,start:150})+40,'jet wins at sustained high speed');
assert(rows.zero.turn>rows.avenger.turn+15,'Zero retains more energy in low-speed turns');
assert(rows.corsair.climb>rows.avenger.climb+15,'Corsair has a stronger climb than Avenger');
assert(F.authority('zero',185,29).roll<F.authority('corsair',185,36).roll*.7,'Zero controls stiffen at high speed');
assert(run('me163',{fuel:0,throttle:1})<85,'empty rocket cannot make thrust');
console.log('Fleet power, energy, role separation, configuration, damage and FPS:',JSON.stringify(rows));
