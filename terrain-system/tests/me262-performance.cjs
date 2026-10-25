'use strict';
const assert=require('node:assert/strict'),jet=require('../../me262-performance.js');
function run(hz,options={},patch={}){const p={spd:140,throttle:1,groundPower:1,pitch:0,gear:0,...patch};for(let i=0;i<hz*30;i++)jet.step(p,1/hz,options);return p.spd;}
const speeds=[20,60,120].map(h=>run(h));assert(Math.max(...speeds)-Math.min(...speeds)<.05);
assert(run(60,{bank:1})<run(60));assert(run(60,{flaps:1},{gear:1})<run(60));assert(run(60,{}, {pitch:.2})<run(60));assert(run(60,{power:.5})<run(60));
let p={spd:240,throttle:1,groundPower:1,pitch:0,gear:0};for(let i=0;i<60*300;i++)jet.step(p,1/60);assert(Math.abs(p.spd-242)<.001);console.log('Me 262 gameplay energy and FPS checks passed',speeds);
