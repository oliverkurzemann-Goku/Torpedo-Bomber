/* Build 296: target-intel.js - what the pilot knows about the targets at each difficulty. */
'use strict';
const assert=require('node:assert/strict');
require('../../target-intel.js');
const T=globalThis.TargetIntel;

// 1. Rookie marks everything, Veteran/Ace give areas that contain the target but never centre on it
const pts=()=>[
 {ref:'a',kind:'truck',pos:{x:1000,z:2000},size:'small',moving:true,label:'column'},
 {ref:'b',kind:'truck',pos:{x:1080,z:2050},size:'small',moving:true,label:'column'},
 {ref:'f',kind:'flak',pos:{x:9000,z:9000},size:'medium',label:'flak'},
 {ref:'o',kind:'radar',pos:{x:5000,z:5000},size:'medium',optional:true,label:'radar'}];
const rookie=T.create({level:'rookie',seed:7}).setup(pts());
assert.equal(rookie.mode,'marked');assert.equal(rookie.areas().length,0);
assert.equal(rookie.known('a'),'live');assert.equal(rookie.known('o'),false,'optional targets are found, never marked');
for(const level of ['vet','veteran','ace']){
 let worst=Infinity,best=0;
 for(let seed=1;seed<400;seed++){
  const it=T.create({level,seed}).setup(pts());
  const areas=it.areas();assert.equal(areas.length,2,'one area per group (the two trucks share one), none for the optional radar');
  assert.equal(it.known('a'),false);assert.equal(it.known('f'),false);
  for(const e of it.entries().filter(e=>!e.optional)){
   const a=areas.find(a=>a.key===e.group),d=Math.hypot(e.pos.x-a.x,e.pos.z-a.z);
   assert.ok(d<=a.r,'inside its area '+level+' '+seed+' '+d+' > '+a.r);
   worst=Math.min(worst,d/a.r);best=Math.max(best,d/a.r);
  }
 }
 const lv=T.levelFor(level);
 assert.ok(worst>=lv.offset[0]*.95-.06,'never at the centre: '+worst);
 console.log(level,'target offset in the area',worst.toFixed(2),'..',best.toFixed(2),'radius',lv.area);
}
assert.ok(T.levelFor('ace').area>T.levelFor('vet').area&&T.levelFor('ace').sight<T.levelFor('vet').sight,'Ace: bigger areas, shorter sight');

// 2. the briefing plan and the sortie agree (same seed, same keys, same rings)
{
 const brief=T.planAreas(pts().map(p=>({kind:p.kind,x:p.pos.x,z:p.pos.z,optional:p.optional})),'vet',1234);
 const live=T.create({level:'vet',seed:1234}).setup(pts()).areas();
 assert.deepEqual(brief.map(a=>[a.key,Math.round(a.x),Math.round(a.z),Math.round(a.r)]),live.map(a=>[a.key,Math.round(a.x),Math.round(a.z),Math.round(a.r)]));
 const preset=[{key:'flak#0',x:1,z:2,r:3}],it=T.create({level:'vet',seed:9}).setup(pts(),preset);
 assert.deepEqual(it.areas().find(a=>a.key==='flak#0'),{key:'flak#0',kind:'flak',x:1,z:2,r:3,label:'flak',moving:false,issued:0},'a preset area is used as planned');
}

// 3. spotting: in range and in the clear; a hill hides it; haze and height shorten the range; frame-rate independent
for(const fps of [20,60,120]){
 const it=T.create({level:'vet',seed:3}).setup(pts());
 const run=(o,sec,extra)=>{const ev=[];for(let i=0;i<Math.round(sec*fps);i++)ev.push(...it.update(1/fps,{observer:o,agl:300,vis:1,...extra}));return ev;};
 assert.equal(run({x:1000,y:300,z:2000+2500},2).length,0,'2.5 km: a vehicle is not seen ('+fps+' fps)');
 assert.equal(run({x:1000,y:300,z:2000+1200},2,{los:()=>false}).length,0,'behind a hill: not seen');
 const ev=run({x:1000,y:300,z:2000+1200},2);
 assert.equal(ev.filter(e=>e.type==='spotted').length,2,'both trucks spotted at 1.2 km ('+fps+' fps)');
 assert.equal(it.known('a'),'live');assert.equal(it.areas().length,1,'their area is gone, the flak area stays');
 assert.equal(ev.find(e=>e.ref==='a').dir,'S','bearing word (the column is south of the observer)');
 assert.ok(it.reveal('f'),'a gun that opens fire gives itself away');assert.equal(it.areas().length,1,'(area clears on the next check)');
 run({x:0,y:300,z:0},.5);assert.equal(it.areas().length,0);
}
{
 const e={size:'small'},lv=T.levelFor('vet');
 const clear=T.sightRange(e,lv,{vis:1,agl:300}),haze=T.sightRange(e,lv,{vis:.6,agl:300}),high=T.sightRange(e,lv,{vis:1,agl:3000}),low=T.sightRange(e,lv,{vis:1,agl:10});
 assert.ok(haze<clear&&high<clear&&low<clear,'haze, height and skimming the ground all shorten the range');
 console.log('vehicle sight (m) clear',Math.round(clear),'haze',Math.round(haze),'3 km up',Math.round(high),'10 m up',Math.round(low),
  '| bridge',Math.round(T.sightRange({size:'huge'},lv,{vis:1,agl:300})),'| Ace vehicle',Math.round(T.sightRange(e,T.levelFor('ace'),{vis:1,agl:300})));
}

// 4. Ace: a moving target out of sight for a while shows where it was last seen; seen again it is live
{
 const mover={x:0,z:0},it=T.create({level:'ace',seed:5}).setup([{ref:'m',kind:'train',pos:mover,size:'large',moving:true,label:'train'}]);
 const step=(o,sec)=>{const ev=[];for(let i=0;i<sec*60;i++)ev.push(...it.update(1/60,{observer:o,agl:400,vis:1}));return ev;};
 step({x:0,y:400,z:1500},1);assert.equal(it.known('m'),'live');
 mover.z=-9000;const lost=step({x:0,y:400,z:1500},16);
 assert.equal(it.known('m'),'last');assert.ok(lost.some(e=>e.type==='lost'));assert.deepEqual(it.markPos('m'),{x:0,z:0,y:undefined},'last seen spot');
 mover.z=500;step({x:0,y:400,z:1500},1);assert.equal(it.known('m'),'live');
 const vet=T.create({level:'vet',seed:5}).setup([{ref:'m',kind:'train',pos:{x:0,z:0},size:'large',moving:true}]);
 for(let i=0;i<60;i++)vet.update(1/60,{observer:{x:0,y:400,z:1500},vis:1});
 vet.entries()[0].pos.z=-9000;for(let i=0;i<60*30;i++)vet.update(1/60,{observer:{x:0,y:400,z:1500},vis:1});
 assert.equal(vet.known('m'),'live','Veteran keeps tracking what it has found');
}

// 5. a moving group that leaves its area gets an updated report and a new area around it
{
 const mover={x:0,z:0},it=T.create({level:'vet',seed:11}).setup([{ref:'c',kind:'truck',pos:mover,size:'small',moving:true,label:'column'}]);
 const a0=it.areas()[0];mover.x=a0.x+a0.r*1.5;mover.z=a0.z;
 let ev=[];for(let i=0;i<60*130;i++)ev.push(...it.update(1/60,{observer:{x:-30000,y:300,z:0},vis:1}));
 const rep=ev.filter(e=>e.type==='report');assert.equal(rep.length,1,'one report');
 const a1=it.areas()[0];assert.ok(Math.hypot(mover.x-a1.x,mover.z-a1.z)<=a1.r,'the column is inside the new area');
 console.log('report after',rep.length,'moved',Math.round(rep[0].moved),'m');
}

// 6. checkpoint
{
 const a=T.create({level:'ace',seed:2}).setup(pts());a.reveal('f');
 const saved=JSON.parse(JSON.stringify(a.checkpoint())),b=T.create({level:'ace',seed:99}).setup(pts());b.restore(saved);
 assert.equal(b.known('f'),'live');assert.equal(b.known('a'),false);assert.deepEqual(b.allAreas().map(x=>x.x),a.allAreas().map(x=>x.x));
}
console.log('target-intel: ok');
