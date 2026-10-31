/* Build 231: the surprise scheduler (surprises.js) - determinism, budget, spacing, difficulty, frame-rate independence,
 * "nothing happens on the ground / in the pause", active-event limit, trigger events and failed placements. */
'use strict';
const assert=require('node:assert/strict');
const S=require('../../surprises.js');

function events(log,over){
 over=over||{};
 const alive={};
 return ['a','b','c'].map((id,i)=>({id,weight:1+i,max:over.max||2,
  ready:ctx=>over.ready?over.ready(id,ctx):1,
  fire:(ctx,api)=>{log.push({id,t:s.time});if(over.fail&&over.fail(id))return false;
   const h={alive:()=>over.lifetime?s.time-log[log.length-1].t<over.lifetime:false};return h;}}));
}
let s;
const flying={flying:true,hull:1};
function run(level,seed,seconds,dtv,ctx,over){
 const log=[];
 s=S.create({level,seed,events:events(log,over)});
 s.reset(seed,level);
 const dt=dtv||1/60;
 for(let t=0;t<seconds;t+=dt)s.update(dt,ctx||flying);
 return {log,rep:s.report()};
}

// 1. same seed - same sortie; another seed differs somewhere
const A=run('vet',123,900),B=run('vet',123,900),C=run('vet',124,900);
assert.deepEqual(A.rep,B.rep,'same seed, same events');
assert.notDeepEqual(A.rep.fired,C.rep.fired,'a different seed gives a different sortie');

// 2. budget, first event not before the start window, spacing between events, per difficulty
for(const level of ['rookie','vet','ace']){
 const L=S.LEVELS[level];
 for(let seed=1;seed<=40;seed++){
  const {rep}=run(level,seed,1800);
  assert.ok(rep.fired.length<=L.max,level+' seed '+seed+': at most '+L.max+' events ('+rep.fired.length+')');
  if(rep.fired[0])assert.ok(rep.fired[0].t>=L.start[0]-1,level+': nothing before the start window ('+rep.fired[0].t+')');
  for(let i=1;i<rep.fired.length;i++)assert.ok(rep.fired[i].t-rep.fired[i-1].t>=L.gap[0]-1,level+': spacing '+(rep.fired[i].t-rep.fired[i-1].t));
 }
}

// 3. difficulty: Rookie sees fewer events than Ace over a long sortie, and later
function avg(level,key){let n=0,first=0,k=0;for(let seed=1;seed<=60;seed++){const {rep}=run(level,seed,1500);n+=rep.fired.length;if(rep.fired[0]){first+=rep.fired[0].t;k++;}}return key==='n'?n/60:first/Math.max(1,k);}
const rn=avg('rookie','n'),vn=avg('vet','n'),an=avg('ace','n');
assert.ok(rn<vn&&vn<an,'more events with the difficulty: '+rn+' < '+vn+' < '+an);
assert.ok(avg('rookie','first')>avg('ace','first'),'Rookie gets the first event later than Ace');

// 4. frame-rate independence: 20, 60 and 120 FPS give the same events (same seed) - times to the nearest second
const f20=run('vet',77,600,1/20).rep.fired.map(f=>f.id+Math.round(f.t)),f60=run('vet',77,600,1/60).rep.fired.map(f=>f.id+Math.round(f.t)),f120=run('vet',77,600,1/120).rep.fired.map(f=>f.id+Math.round(f.t));
assert.deepEqual(f20,f60,'20 and 60 FPS');assert.deepEqual(f60,f120,'60 and 120 FPS');

// 5. nothing happens while the aircraft is not flying (ground, launch ride, menu) - time does not even advance
const ground=run('ace',5,2000,1/30,{flying:false,hull:1});
assert.equal(ground.rep.fired.length,0,'no events on the ground');assert.equal(ground.rep.time,0,'the clock only runs in flight');

// 6. badly hurt: nothing more is thrown at the player; suppress also blocks (landing, return to base)
const hurt=run('rookie',9,2000,1/30,{flying:true,hull:.3});assert.equal(hurt.rep.fired.length,0,'Rookie: no event below half hull');
const sup=run('ace',9,2000,1/30,{flying:true,hull:1,suppress:true});assert.equal(sup.rep.fired.length,0,'suppressed (landing)');

// 7. an event that is not ready is never picked; an id never repeats beyond its max
const only=run('ace',3,3000,1/30,flying,{ready:id=>id==='b'?1:0,max:3});
assert.ok(only.rep.fired.length>0&&only.rep.fired.every(f=>f.id==='b'),'only the ready event fires');
const cap=run('ace',3,3000,1/30,flying,{ready:id=>id==='b'?1:0,max:1});assert.equal(cap.rep.fired.length,1,'max 1 per id');

// 8. the active limit: with long-lived events Rookie never has two at once
{
 const log=[];s=S.create({level:'rookie',seed:11,events:events(log,{lifetime:400,max:5})});s.reset(11,'rookie');
 for(let t=0;t<1500;t+=1/30)s.update(1/30,flying);
 assert.ok(s.report().fired.length<=1||log[1].t-log[0].t>=400-1,'a second event waits for the first to be over');
}

// 9. a failed placement (no room) does not use up the budget and is retried soon
{
 let attempts=0;const ev=[{id:'x',max:1,ready:()=>1,fire:()=>{attempts++;return attempts>=3;}}];
 s=S.create({level:'ace',seed:2,events:ev});s.reset(2,'ace');
 for(let t=0;t<600;t+=1/30)s.update(1/30,flying);
 assert.ok(attempts>=3&&s.report().fired.length===1,'retried until it worked ('+attempts+' attempts), then counted once');
}

// 10. free (trigger) events: not scheduled, not counted against the budget, bound by their own max
{
 const log=[];
 const ev=[{id:'blast',free:true,max:2,ready:()=>1,fire:()=>{log.push('blast');return true;}},{id:'t',max:1,ready:()=>0,fire:()=>true}];
 s=S.create({level:'rookie',seed:4,events:ev});s.reset(4,'rookie');
 for(let t=0;t<400;t+=1/30)s.update(1/30,flying);
 assert.equal(log.length,0,'a free event is never scheduled');
 assert.equal(s.trigger('blast',flying),true);assert.equal(s.trigger('blast',flying),true);assert.equal(s.trigger('blast',flying),false,'its own max applies');
}

// 11. warnings by difficulty: Rookie at once, Veteran after 2.5 s, Ace never; announcements run on flight time
{
 const said=[];const ev=[{id:'w',max:1,ready:()=>1,fire:(ctx,api)=>{const d=api.warnDelay();if(d!=null)api.say('warn',d);return true;}}];
 for(const [level,expect] of [['rookie',1],['vet',1],['ace',0]]){
  said.length=0;s=S.create({level,seed:8,events:ev,say:m=>said.push(m)});s.reset(8,level);
  s.force('w',flying);
  if(level==='vet'){assert.equal(said.length,0,'Veteran: not yet');for(let t=0;t<3;t+=1/30)s.update(1/30,flying);}
  assert.equal(said.length,expect,level+': '+said.length+' messages');
 }
 // paused: no update() calls - the delayed message waits
 said.length=0;s=S.create({level:'vet',seed:8,events:ev,say:m=>said.push(m)});s.reset(8,'vet');s.force('w',flying);
 for(let i=0;i<1000;i++)s.update(0,{flying:false,hull:1});
 assert.equal(said.length,0,'a delayed warning waits for flight time');
}

// 12. disabled: no event at all; reset starts a new sortie
{
 const log=[];s=S.create({level:'ace',seed:1,events:events(log),enabled:false});s.reset(1,'ace');
 for(let t=0;t<800;t+=1/30)s.update(1/30,flying);assert.equal(log.length,0,'disabled');
 s.setEnabled(true);for(let t=0;t<800;t+=1/30)s.update(1/30,flying);assert.ok(log.length>0,'enabled again');
 s.reset(1,'ace');assert.equal(s.report().fired.length,0,'reset clears the sortie');
}
console.log('Surprises scheduler: OK ('+rn.toFixed(2)+' / '+vn.toFixed(2)+' / '+an.toFixed(2)+' events per 25 min Rookie / Veteran / Ace)');
