'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
global.window=global;require('../../sortie-fuel.js');require('../../operation-plans.js');
const html=fs.readFileSync(path.join(__dirname,'../../remagen-mission.html'),'utf8');
const missions=vm.runInNewContext(html.slice(html.indexOf('const MISSIONS=['),html.indexOf('function M()'))+'\nMISSIONS');
for(const ac of ['p47','bf109','fw190','ju87','me262','me163']){
 const p={ac,throttle:1};SortieFuel.reset(p,100,true);
 assert.equal(p.tankAttached,['p47','bf109','fw190'].includes(ac));
 const total=SortieFuel.total(p);SortieFuel.consume(p,10,1);
 assert(Math.abs(SortieFuel.total(p)-(total-10*SortieFuel.rate(p)))<1e-8);
 if(p.tankAttached){
  assert.equal(p.fuel,100,'external tank drains before internal fuel');
  const before=p.fuel,ext=p.tankFuel;assert.equal(SortieFuel.jettison(p),ext);assert.equal(p.fuel,before);
  assert.equal(SortieFuel.jettison(p),0,'second tap cannot create or discard more fuel');
 }
 SortieFuel.consume(p,10000,1.3);assert.equal(SortieFuel.total(p),0,'depletion clamps at zero');
 SortieFuel.reset(p,0,false);assert.equal(p.fuel,0);assert(!p.tankAttached,'practice launches without extra tank');
}
let checked=0;
for(const [i,m] of missions.entries()){
 const plan=FlightPlans.europe[i];if(m.free||m.circuits||m.ac==='me163')continue;
 for(const difficulty of [.7,1,1.3]){
  const p={ac:m.ac||'p47',throttle:1};SortieFuel.reset(p,plan.fuel??100,true);
  const duration=(plan.deadline||600)+120;
  for(let sec=0;sec<duration;sec++)SortieFuel.consume(p,1,difficulty);
  assert(SortieFuel.total(p)>0,m.id+' must cover its objective window plus two minutes RTB, even at full throttle');
  checked++;
 }
}
const komet={ac:'me163',throttle:1};SortieFuel.reset(komet,65,true);
assert.equal(SortieFuel.rate(komet),.46,'Komet keeps limited rocket endurance');komet.throttle=0;assert.equal(SortieFuel.rate(komet),0,'rocket-off glide uses no fuel');
console.log('Fuel: '+checked+' combat/difficulty endurance cases, reserve-first transfer, jettison, reset, depletion and Komet glide pass');
