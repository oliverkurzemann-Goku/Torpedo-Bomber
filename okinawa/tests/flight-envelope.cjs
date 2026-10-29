/* Analytic flight envelope: data sheet -> derived quantities -> control laws, for all ten aircraft. */
'use strict';
const assert=require('node:assert/strict');
require('../../p47-performance');require('../../me262-performance');
const E=require('../../flight-envelope');const F=require('../../flight-dynamics');
const kinds=Object.keys(E.SHEETS),G=9.81,DEG=Math.PI/180;
assert.deepEqual(kinds.sort(),['avenger','bf109','corsair','fw190','ju87','me163','me262','p47','sbd','zero'].sort(),'sheet covers the ten playable aircraft');
for(const kind of kinds)assert(F.profiles[kind],kind+' has an energy profile');

// ---- the data sheet reproduces the documented anchors --------------------------------------
const d=E.derived;
assert(Math.abs(d.p47.vs-51.86)<.01,'P-47 clean stall from the USAAF flight test (116 mph)');
assert(Math.abs(d.p47.clmax-1.23)<.03,'P-47 CLmax implied by that stall speed');
assert(Math.abs(d.zero.wl-107.4)<1,'Zero wing loading 107 kg/m2');
assert(Math.abs(d.bf109.wl-179.5)<1.5,'Bf 109F wing loading 180 kg/m2 (PDF table)');
assert(d.zero.corner*3.6>290&&d.zero.corner*3.6<330,'Zero corner speed near 300 km/h');
assert(d.zero.vs<d.bf109.vs&&d.bf109.vs<d.p47.vs,'stall speed rises with wing loading');
for(const kind of kinds){
 const q=d[kind];
 assert(q.vs>30&&q.vs<65,kind+' clean stall in a plausible range');
 assert(q.clmax>1&&q.clmax<1.6,kind+' CLmax plausible');
 assert(q.corner>q.vs&&Math.abs(q.corner-q.vs*Math.sqrt(q.nLimit))<1e-9,kind+' corner speed = Vs*sqrt(n)');
}

// ---- load factor and turn ---------------------------------------------------------------------
for(const kind of kinds){
 let previous=1;
 for(let v=30;v<=260;v+=10){
  const n=E.loadLimit(kind,v);
  assert(n>=previous-1e-9,kind+' available load factor never falls with speed');previous=n;
  assert(n<=d[kind].nLimit+1e-9,kind+' never exceeds the structure');
 }
 assert.equal(E.turn(kind,0,100).rate,0,kind+' wings level = no turn');
 let last=0;
 for(let bank=.1;bank<=1.5;bank+=.1){
  const t=E.turn(kind,bank,100).rate;assert(t>=last-1e-12,kind+' turn rate rises with bank');last=t;
 }
 assert(Math.abs(E.turn(kind,-.9,100).rate-E.turn(kind,.9,100).rate)<1e-12,kind+' left/right symmetric');
 // never above the airframe's own capability times the single arcade gain
 for(const v of [50,80,120,180]){
  const n=E.loadLimit(kind,v),cap=E.ARC.turn*G*Math.sqrt(n*n-1)/Math.max(30,v);
  assert(E.turn(kind,1.4,v).rate<=cap+1e-9,kind+' turn stays inside lift/structure limits at '+v);
 }
 // above the corner speed the rate falls with speed (g/V)
 const vc=d[kind].corner*1.05;
 assert(E.turn(kind,1.4,vc*1.5).rate<E.turn(kind,1.4,vc).rate,kind+' turn rate falls above the corner speed');
}
// Fleet grading at 80 m/s (below every corner speed): wing loading and CLmax decide
const t360=(kind,v)=>2*Math.PI/E.turn(kind,1.3,v).rate;
assert(t360('zero',80)<t360('bf109',80)&&t360('bf109',80)<t360('p47',80),'Zero < Bf 109 < P-47 for a 360 degree turn at 80 m/s');
assert(t360('p47',80)/t360('bf109',80)<1.7,'the Jug is slower, not helpless: spread below 1.7x (was 2.5x)');
assert(t360('avenger',90)>t360('zero',90)*1.2,'the Avenger turns clearly worse than the Zero');
assert(Math.abs(t360('p47',150)/t360('bf109',150)-1)<.25,'above the corner speed the structure limits both fighters alike');

// ---- roll -----------------------------------------------------------------------------------------
for(const kind of kinds){
 const peak=E.rollPeak(kind),at=E.SHEETS[kind].roll.at;
 assert(Math.abs(E.rollRate(kind,at)-peak)<1e-9,kind+' peak at its published speed');
 assert(E.rollRate(kind,at*.6)<peak&&E.rollRate(kind,at*1.6)<peak,kind+' rises with aileron power, falls with stick force');
 assert(peak>40*DEG&&peak<230*DEG,kind+' game peak roll rate in range');
}
const rollAt=(kind,v)=>E.rollRate(kind,v)/DEG;
assert(rollAt('fw190',130)>rollAt('corsair',130)&&rollAt('corsair',130)>rollAt('p47',130),'roll ranking at 130 m/s: Fw 190 > Corsair > P-47');
assert(rollAt('p47',130)>rollAt('bf109',130),'the Bf 109 stiffens at 130 m/s IAS and no longer out-rolls the Jug');
assert(rollAt('zero',130)<rollAt('zero',85)*.7,'the Zero\'s ailerons stiffen with speed');
assert(rollAt('avenger',85)<rollAt('p47',85)*.95&&rollAt('avenger',85)<rollAt('zero',85)*.6,'the torpedo bomber rolls clearly slower than the fighters');
assert(rollAt('fw190',170)>rollAt('bf109',170)*2,'at 170 m/s the Fw 190 rolls at least twice as fast as the 109');
// spring inversion: peak rate of the attitude spring equals the published peak
for(const kind of kinds){
 const z=.8,h=E.handling(kind,{rollLim:1.5,zeta:z}),peak=E.springPeak(z)*(h.rollAuth*4.8)*(1.5*.86);
 assert(Math.abs(peak-E.rollPeak(kind))<1e-9,kind+' attitude spring reproduces the target roll rate');
}
assert(Math.abs(E.springPeak(.8)-.424)<.002,'damped spring velocity peak');

// ---- pitch --------------------------------------------------------------------------------------------
for(const kind of kinds){
 assert(E.pitchRateLimit(kind,70,0)>=E.ARC.pitchFloor-1e-12,kind+' assisted pitch keeps its floor');
 assert(E.pitchRateLimit(kind,110,0)>=E.pitchRateLimit(kind,60,0),kind+' more pitch rate with more lift');
 assert(E.pitchRateLimit(kind,100,1.2)>E.pitchRateLimit(kind,100,0),kind+' a steep attitude leaves more lift for rotating (less weight component)');
}
assert(E.pitchRateLimit('zero',70,0)>E.pitchRateLimit('p47',70,0)*1.4,'the light Zero can pitch much faster than the Jug at 70 m/s');

// ---- closed-throttle drag ------------------------------------------------------------------------
for(const kind of kinds){
 const jet=!E.SHEETS[kind].propD;
 assert.equal(E.idleDrag(kind,120,.3)<1e-12,true,kind+' windmill fades out by 30% power');
 if(jet){assert.equal(E.idleDrag(kind,120,0),0,kind+' no propeller drag');continue;}
 assert(E.idleDrag(kind,120,0)>E.idleDrag(kind,120,.15),kind+' fades with throttle');
 assert(E.idleDrag(kind,150,0)>E.idleDrag(kind,100,0)*2,kind+' grows with speed squared');
}
function idleDecel(kind,v0,seconds=6,throttle=0){
 const p={ac:kind,spd:v0,throttle,groundPower:throttle,pitch:0,roll:0,gear:0,flap:0,fuel:100,pos:{y:300}};
 for(let i=0;i<seconds*120;i++)F.step(p,1/120,{bank:0,loadRatio:1,power:1,n:1});
 return (v0-p.spd)/seconds;
}
const rows={};
for(const kind of kinds){
 if(kind==='me262'||kind==='me163')continue;
 const vmax=F.profiles[kind].max,a50=idleDecel(kind,vmax*.5),a75=idleDecel(kind,vmax*.75);
 rows[kind]={idle50:+a50.toFixed(2),idle75:+a75.toFixed(2)};
 assert(a50>1.3,kind+' closed throttle brakes noticeably at half speed: '+a50.toFixed(2));
 assert(a75>2.2,kind+' closed throttle brakes strongly at 3/4 speed: '+a75.toFixed(2));
 assert(a75>a50,kind+' more braking at higher speed');
 // the windmill must not touch the top speed
 const p={ac:kind,spd:vmax*.6,throttle:1,groundPower:1,pitch:0,roll:0,gear:0,flap:0,fuel:100,pos:{y:300}};
 for(let i=0;i<120*120;i++)F.step(p,1/120,{bank:0,loadRatio:1,power:1,n:1});
 const top=kind==='p47'?F.profile('p47').max:vmax;
 assert(p.spd>top*.8&&p.spd<=top*1.01,kind+' full-throttle speed unaffected by the closed-throttle drag: '+p.spd.toFixed(0));
}
// the Jug used to coast almost indefinitely (0.7-1.0 m/s2); now it brakes like the others
assert(idleDecel('p47',146)>2.3,'P-47 at 146 m/s brakes with at least 2.3 m/s2 (was 1.0)');

// ---- load factor feeds the energy model ----------------------------------------------------------
for(const kind of ['bf109','zero','fw190','sbd']){
 const run=n=>{const p={ac:kind,spd:F.profiles[kind].max*.6,throttle:1,groundPower:1,pitch:0,roll:0,gear:0,flap:0,fuel:100,pos:{y:300}};
  for(let i=0;i<120*4;i++)F.step(p,1/120,{bank:0,loadRatio:1,power:1,n});return p.spd;};
 assert(run(1)>run(3)+1&&run(3)>run(6),kind+' hard pulls cost speed (n=1 > n=3 > n=6)');
}
assert(E.flownLoad('zero',1,0,0,100)===1,'level flight flies 1 g');
assert(E.flownLoad('zero',3,0,0,100)===3,'a coordinated turn flies its turn load');
assert(E.flownLoad('zero',1,0,2,100)>1&&E.flownLoad('zero',1,0,2,100)<=E.SHEETS.zero.nLimit,'a pull-up flies more than 1 g, never beyond the structure');
// the induced-drag growth is heavier for the heavier wing loading
assert(E.inducedFactor('p47',5)>E.inducedFactor('zero',5),'a higher wing loading pays more induced drag at the same load factor');

// ---- AERO gate -------------------------------------------------------------------------------------------
for(const kind of kinds){
 const gate=E.aeroGate(kind);
 assert(gate>=1.5*d[kind].vs-1e-9,kind+' AERO gate is at least 1.5 x the clean stall');
 assert(gate<F.profiles[kind].max*.62,kind+' AERO gate is reachable: '+gate.toFixed(0)+' vs vmax '+F.profiles[kind].max);
 assert(E.aeroEntry(kind)>=d[kind].vs,kind+' entry speed above the stall');
}
console.log('Flight envelope: data sheet, derived limits, turn/roll/pitch laws, closed-throttle braking, energy cost, AERO gate',JSON.stringify(rows));
