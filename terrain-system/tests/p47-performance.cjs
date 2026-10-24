'use strict';
const assert=require('node:assert/strict'),perf=require('../../p47-performance.js');
const MPH=.44704,FT=.3048,FPM=.00508;
// Independently transcribed AAF 6-Oct-1944 envelope, not computed from module constants.
for(const [feet,mph,fpm] of [[0,345,3180],[10000,383,2920],[20000,417,2470],[32000,435,1100]]){
 assert(Math.abs(perf.maximum(feet*FT)/MPH-mph)<1e-9);assert(Math.abs(perf.climb(feet*FT)/FPM-fpm)<1e-9);
 const v=perf.trueSpeed(170*MPH,feet*FT),rate=fpm*FPM;
 assert(Math.abs(perf.acceleration({pos:{y:feet*FT},spd:v,pitch:Math.asin(rate/v),throttle:1,gear:0}))<1e-8,'anchor climb balances energy');
 assert(Math.abs(perf.acceleration({pos:{y:feet*FT},spd:mph*MPH,pitch:0,throttle:1,gear:0}))<1e-8,'level anchor balances energy');
}
const clean={pos:{y:0},spd:90,pitch:0,throttle:1,gear:0};
assert(perf.acceleration(clean)>0);assert(perf.acceleration({...clean,pitch:.45})<0,'zoom spends speed');
assert(perf.acceleration(clean,{loadRatio:1.2})<perf.acceleration(clean));assert(perf.acceleration({...clean,gear:1},{flaps:1})<perf.acceleration(clean));
const full=perf.speeds(clean,1,1),up=perf.speeds(clean,0,1),heavy=perf.speeds(clean,1,1.2);assert(full.stall<up.stall);assert(heavy.stall>full.stall);assert(full.reference/full.stall>1.3);
assert(Math.abs(full.referenceIAS/MPH-130)<.001);assert(Math.abs(full.stallIAS/MPH-98*Math.sqrt(12731/13230))<.001);
assert(Math.abs(perf.indicated(perf.trueSpeed(60,8000),8000)-60)<1e-9);
for(const fps of [20,60,120]){
 let p={...clean,pos:{y:0},spd:80};for(let i=0;i<400*fps;i++)p.spd+=perf.acceleration(p)/fps;assert(Math.abs(p.spd-345*MPH)<.1,'steady sea-level speed at '+fps+' fps');
}
assert(perf.gameplayAcceleration(clean,{loadRatio:1.24})>perf.acceleration(clean,{loadRatio:1.24})+1);assert.equal(perf.gameplayAcceleration({...clean,throttle:0}),perf.acceleration({...clean,throttle:0}),'no idle/glide assistance');
assert.equal(perf.gameplayAcceleration({...clean,spd:perf.maximum(0)}),perf.acceleration({...clean,spd:perf.maximum(0)}),'boost fades at original maximum');
console.log('P-47 historical anchors, steady energy, load/flaps, IAS/TAS and 20/60/120 FPS passed');
