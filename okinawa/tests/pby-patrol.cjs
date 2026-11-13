/* Build 258: the pure parts of the Pacific Catalina (pby-patrol.js): water rules, search-ring placement, sight ranges, the submarine's dive, the four sorties. */
'use strict';
const assert=require('node:assert/strict'),P=require('../../pby-patrol.js');
// ---- water rules: REALISTIC strict (the Rhine Build 252 figures), ARCADE forgiving ----
const strict=P.rules(true),easy=P.rules(false);
assert.equal(strict.over,14);assert.equal(strict.ok,4.5);assert.equal(strict.hard,6.5);assert.ok(Math.abs(strict.roll-.3)<1e-9);
assert.ok(easy.over>strict.over&&easy.ok>strict.ok&&easy.hard>strict.hard&&easy.roll>strict.roll&&easy.pitchMin<strict.pitchMin&&easy.pitchMax>strict.pitchMax,'ARCADE allows more on every axis');
const ref=40,base={speed:ref+5,reference:ref,pitch:.05,roll:0,sink:1.5};
assert.equal(P.touchdown(base,strict),null,'a clean alighting is fine in both modes');
assert.equal(P.touchdown(base,easy),null);
const t=(o,r)=>P.touchdown({...base,...o},r);
assert.equal(t({speed:ref+16},strict).crash,'TOO FAST');assert.equal(t({speed:ref+16},easy),null,'+16 m/s is allowed in ARCADE');assert.equal(t({speed:ref+30},easy).crash,'TOO FAST');
assert.equal(t({pitch:-.2},strict).crash,'NOSE FIRST');assert.equal(t({pitch:-.2},easy),null);
assert.equal(t({pitch:.45},strict).crash,'TAIL FIRST');assert.equal(t({pitch:.45},easy),null);assert.equal(t({pitch:.6},easy).crash,'TAIL FIRST');
assert.equal(t({roll:.4},strict).crash,'FLOAT DUG IN');assert.equal(t({roll:.4},easy),null);
assert.equal(t({sink:7},strict).crash,'HARD LANDING');
const firm=t({sink:5},strict);assert.ok(firm.damage>0,'between ok and hard the hull is damaged, not lost');
assert.equal(t({sink:5},easy),null,'5 m/s is fine in ARCADE');
assert.ok(t({sink:7.5},easy).damage>0&&t({sink:10},easy).crash==='HARD LANDING');
assert.equal(P.alightingDamage(3,strict),0);assert.ok(P.alightingDamage(6,strict)>P.alightingDamage(5,strict),'damage grows with the sink rate');
// the hump: the resistance peaks at about half the lift-off speed and falls on both sides
assert.ok(P.mu(.5)>P.mu(.1)&&P.mu(.5)>P.mu(.95));assert.ok(Math.abs(P.mu(0)-P.WATER.mu.base)<.01);
// ---- compass text and clock positions (north = +Z, east = +X) ----
assert.equal(P.cardinal(P.compass(0,1)),'N');assert.equal(P.cardinal(P.compass(1,0)),'E');assert.equal(P.cardinal(P.compass(-1,0)),'W');assert.equal(P.cardinal(P.compass(0,-1)),'S');
assert.equal(P.describe({x:0,z:0},{x:-8000,z:6000}),'about 10 km NW of the fleet, course 305','a rounded distance, a point of the compass and a course in 5-degree steps');
assert.equal(P.describe({x:0,z:0},{x:-12000,z:-1000}),'about 12 km W of the fleet, course 265');
for(const [pt,h] of [[{x:1000,z:0},12],[{x:0,z:1000},3],[{x:-1000,z:0},6],[{x:0,z:-1000},9]])assert.equal(P.clock({x:0,z:0},0,pt),h,'clock position '+JSON.stringify(pt));
assert.equal(P.clock({x:0,z:0},Math.PI/2,{x:0,z:1000}),12,'the heading turns the clock');
// ---- the search ring: the hidden point lies inside it, never at its centre, always on open water ----
const sea=(x,z)=>x<2000;       // the Okinawa coast starts east of x = 2000
let minOff=9,maxOff=0,count=0;
for(let seed=1;seed<=300;seed++){
 const r=P.mulberry32(seed),p=P.place({random:r,origin:{x:-8000,z:-210},dist:[11000,15000],bearing:[Math.PI*.62,Math.PI*1.38],radius:4200,water:sea});
 assert.ok(p,'a ring is found for seed '+seed);count++;
 const off=Math.hypot(p.point.x-p.ring.x,p.point.z-p.ring.z)/p.ring.r;minOff=Math.min(minOff,off);maxOff=Math.max(maxOff,off);
 assert.ok(off>=.179&&off<=.621,'the hidden point is '+off.toFixed(2)+' of the radius from the centre');
 assert.ok(P.openWater(sea,p.point.x,p.point.z,700),'the hidden point has open water around it');
 const d=Math.hypot(p.ring.x+8000,p.ring.z+210);assert.ok(d>=10990&&d<=15010,'the ring lies 11-15 km from the fleet');
 assert.ok(p.ring.x<-2000,'the ring lies west of the fleet');
}
assert.ok(minOff<.3&&maxOff>.5,'the offset spreads over the allowed range ('+minOff.toFixed(2)+'..'+maxOff.toFixed(2)+')');
const again=P.place({random:P.mulberry32(77),origin:{x:0,z:0},dist:[5000,6000],bearing:[0,6.2],radius:1500,water:()=>true}),again2=P.place({random:P.mulberry32(77),origin:{x:0,z:0},dist:[5000,6000],bearing:[0,6.2],radius:1500,water:()=>true});
assert.deepEqual(again,again2,'the same seed gives the same search ring');
assert.equal(P.place({random:P.mulberry32(1),origin:{x:0,z:0},dist:[5000,6000],bearing:[0,6.2],radius:1500,water:()=>false}),null,'no ring on dry land');
// ---- the lookout: the dye shows before the raft, night and rain shorten it, rookies see further, radar ignores the light ----
const S=(k,o)=>P.sightRange(k,o);
assert.ok(S('dye')>S('raft')&&S('flare')>S('dye'),'dye is seen before the raft, a flare before the dye');
assert.ok(S('raft',{time:'night'})<S('raft')*.4&&S('raft',{weather:'rain'})<S('raft')*.5,'night and rain shorten the lookout');
assert.ok(S('sub',{diff:'rookie'})>S('sub')&&S('sub',{diff:'ace'})<S('sub'));
assert.ok(S('raft',{altitude:20})<S('raft')&&S('raft',{altitude:3000})<S('raft'),'seen worst from the deck and from very high');
assert.equal(S('radar',{time:'night',weather:'storm'}),P.SIGHT.radar,'radar does not care for the light');
assert.ok(P.sees('raft',1800)&&!P.sees('raft',2100)&&P.sees('convoy',6000)&&!P.sees('convoy',7000));
// ---- the submarine: crash-dive 22 s, stays down 170 s, comes up once, stays down after the second dive ----
const sub={state:'surfaced',t:0,dives:0,x:0,z:0,heading:0};
const run=(secs,o)=>{for(let i=0;i<secs*10;i++)P.stepSub(sub,.1,o);};
run(30,{});assert.equal(sub.state,'surfaced','she does not dive unless she has seen you');
P.stepSub(sub,.1,{spotted:true});assert.equal(sub.state,'diving');
run(10,{});assert.equal(sub.state,'diving');assert.ok(sub.dive>.4&&sub.dive<.5,'half way down after about 10 s');
run(13,{});assert.equal(sub.state,'submerged');assert.equal(sub.dive,1);
run(150,{});assert.equal(sub.state,'submerged','under for 170 s');run(30,{});assert.equal(sub.state,'surfaced','up again after 170 s');
P.stepSub(sub,.1,{spotted:true});assert.equal(sub.state,'diving');assert.equal(sub.dives,2);
run(25,{});run(400,{});assert.equal(sub.state,'submerged','after the second dive she stays down for good (the bubble trail still shows where)');
assert.ok(sub.x>0,'she keeps moving');
// lethal radii: a depth charge must land close; a diving boat is as easy as a surfaced one, a deep one only inside 26 m
const t0={state:'surfaced',x:0,z:0};assert.ok(P.inReach(t0,14,0)&&!P.inReach(t0,16,0));
assert.ok(P.inReach({state:'diving',x:0,z:0},14,0));
assert.ok(P.inReach({state:'submerged',x:0,z:0},25,0)&&!P.inReach({state:'submerged',x:0,z:0},27,0));
assert.ok(!P.inReach({state:'sunk',x:0,z:0},0,0)&&!P.inReach(null,0,0));
// ---- the sorties ----
assert.equal(P.missions.length,4);
assert.deepEqual(Array.from(P.missions,m=>m.pby.kind),['dumbo','sub','shadow','blackcat']);
for(const m of P.missions){
 assert.equal(m.theater,'patrol');assert.deepEqual(m.targets,[],'no exact target position for '+m.sub);assert.equal(m.pby.bearing[0],Math.PI*.62);
 assert.ok(m.pby.radius>=4000&&m.pby.radius<=6000&&m.pby.dist[0]>=10000,'a wide ring far out: '+m.sub);
 assert.match(m.body,/search ring|inside the ring|somewhere inside/i,'the briefing talks about an area, not a position: '+m.sub);
 assert.ok(!/\d{4,5}\s*,\s*\d{4,5}/.test(m.body),'no coordinates in the briefing');
}
assert.equal(P.missions[3].time,'night');assert.equal(P.missions[3].pby.radar,15000);assert.equal(P.missions[1].torps,4);assert.equal(P.missions[0].torps,0);
assert.equal(P.FORMATION.shadow.filter(f=>f.type==='freighter').length,3);assert.equal(P.FORMATION.blackcat.filter(f=>f.type==='freighter').length,2);
assert.ok(P.FORMATION.blackcat.some(f=>f.optional&&f.type==='destroyer'),'the Black Cat destroyer is optional');
console.log('PBY patrol: water rules, search rings ('+count+' seeds), lookout, submarine dive and sorties OK');
// ---- Build 264: a rough sea, light at night, what drifts, the things that are not them, the survivors' radio ----
{
 // sea 1 (or no sea at all) is exactly the calm-water boat; every unit of sea above 1 takes a little from every margin
 for(const strictMode of [true,false]){
  const calm=P.rules(strictMode),one=P.rules(strictMode,1);
  assert.deepEqual(one,calm,'seaState 1 changes nothing');assert.deepEqual(P.rules(strictMode,.8),calm,'a sea below 1 is not calmer than calm');
  const rain=P.rules(strictMode,1.55),storm=P.rules(strictMode,2.09);
  for(const key of ['ok','hard','pitchMax','roll','over'])assert.ok(storm[key]<rain[key]&&rain[key]<calm[key],key+' shrinks with the sea ('+strictMode+')');
  assert.ok(storm.ok>3&&storm.hard>4.5&&storm.over>10,'but a storm does not make alighting impossible');
 }
 // a sink rate that is fine on a flat sea is a firm alighting in a storm
 const calmR=P.rules(true,1),roughR=P.rules(true,2.09);
 assert.equal(P.touchdown({speed:45,reference:40,pitch:.05,roll:0,sink:4.2},calmR),null);
 assert.ok(P.touchdown({speed:45,reference:40,pitch:.05,roll:0,sink:4.2},roughR).damage>0,'4.2 m/s hurts in a storm');
 // the lookout: a flare shows further in the dark, something inside the light of a parachute flare is seen as at dusk
 assert.ok(S('flare',{time:'night'})>S('flare')&&S('flare',{time:'night'})>S('flare',{time:'dusk'}),'a flare is brightest at night');
 assert.ok(S('raft',{time:'night',lit:true})>S('raft',{time:'night'})*2,'a lit raft is seen far better at night');
 assert.ok(Math.abs(S('raft',{time:'night',lit:true})-S('raft',{time:'dusk'}))<S('raft')*.1,'lit = about dusk');
 assert.equal(S('raft',{time:'day',lit:true}),S('raft'),'light changes nothing by day');
 assert.ok(S('raft',{weather:'fog'})<S('raft',{weather:'haze'})&&S('raft',{weather:'squall'})<S('raft',{weather:'rain'}),'fog and squalls shorten the sight, under the game\'s own weather names');
 assert.ok(S('raft',{weather:'lowcloud'})<S('raft',{weather:'broken'}));
 // drift: deterministic per seed, faster in worse weather, a unit direction scaled by the speed (north = +Z)
 const dr=(w,seed)=>P.drift(P.mulberry32(seed),w);
 assert.deepEqual(dr('rain',5),dr('rain',5));
 for(let s=1;s<=200;s++){const d=dr('squall',s);assert.ok(Math.abs(Math.hypot(d.x,d.z)-d.speed)<1e-9&&Math.abs(d.x-Math.sin(d.bearing)*d.speed)<1e-9&&Math.abs(d.z-Math.cos(d.bearing)*d.speed)<1e-9);}
 let sumClear=0,sumStorm=0;for(let s=1;s<=200;s++){sumClear+=dr('clear',s).speed;sumStorm+=dr('storm',s).speed;}
 assert.ok(sumStorm>sumClear*2,'a storm moves a raft more than twice as fast as a calm');
 assert.ok(dr('storm',1).speed*1500<2200&&dr('clear',1).speed*1500>400,'25 minutes of drift is a few hundred metres to two kilometres');
 // the false contacts
 const water=(x,z)=>x<2000;
 for(let seed=1;seed<=200;seed++){
  const place=P.place({random:P.mulberry32(seed),origin:{x:-8000,z:-210},dist:[11000,15000],bearing:[Math.PI*.62,Math.PI*1.38],radius:4200,water}),
        list=P.decoys({ring:place.ring,point:place.point,count:3,random:P.mulberry32(seed+999),water,clear:300});
  assert.ok(list.length>=2,'seed '+seed+': at least two decoys fit');
  for(const [i,d] of list.entries()){
   const q=Math.hypot(d.x-place.ring.x,d.z-place.ring.z)/place.ring.r;
   assert.ok(q>=.149&&q<=.901,'inside the ring, '+q.toFixed(2));
   assert.ok(Math.hypot(d.x-place.point.x,d.z-place.point.z)>=1100,'never on top of the real raft');
   assert.ok(P.openWater(water,d.x,d.z,300),'open water');
   assert.ok(P.CONTACTS[d.kind],'a known kind '+d.kind);
   for(const o of list.slice(i+1))assert.ok(Math.hypot(d.x-o.x,d.z-o.z)>=900,'decoys keep apart');
  }
 }
 assert.deepEqual(P.decoys({ring:{x:0,z:0,r:3000},point:{x:100,z:0},count:3,random:P.mulberry32(4),water:()=>true}),P.decoys({ring:{x:0,z:0,r:3000},point:{x:100,z:0},count:3,random:P.mulberry32(4),water:()=>true}),'deterministic');
 assert.deepEqual(P.decoys({ring:{x:0,z:0,r:3000},point:{x:0,z:0},count:3,random:P.mulberry32(4),water:()=>false}),[],'no decoys on dry land');
 assert.ok(P.decoys({ring:{x:0,z:0,r:3000},point:{x:0,z:0},count:5,random:P.mulberry32(8),water:()=>true,kinds:['whale']}).every(d=>d.kind==='whale'),'the kinds can be limited');
 for(const k of ['wreck','whale','sampan','raft'])assert.ok(P.CONTACTS[k].text.length>20&&/[A-Z]/.test(P.CONTACTS[k].text),k+' has words for the lookout');
 assert.ok(P.CONTACTS.whale.speed>0&&P.CONTACTS.sampan.speed>P.CONTACTS.whale.speed&&P.CONTACTS.wreck.drifts&&P.CONTACTS.raft.drifts);
 assert.ok(P.IDENTIFY<S('raft')&&P.IDENTIFY>=500,'you must come closer than you first saw it');
 // the survivors' radio: noisy, worse with range, unbiased, two fixes from two places cross near the raft
 const set={x:-20000,z:3000};
 const stats=(from)=>{const r=P.mulberry32(11),e=[];for(let i=0;i<4000;i++){const f=P.bearingFix(from,set,r),truth=P.compass(set.x-from.x,set.z-from.z);let d=f.bearing-truth;d=((d+540)%360)-180;e.push(d);}
  const mean=e.reduce((a,b)=>a+b,0)/e.length,sd=Math.sqrt(e.reduce((a,b)=>a+(b-mean)**2,0)/e.length);return {mean,sd,max:Math.max(...e.map(Math.abs)),f:P.bearingFix(from,set,P.mulberry32(1))};};
 const near=stats({x:-18000,z:3000}),far=stats({x:-4000,z:3000});
 assert.ok(Math.abs(near.mean)<.3&&Math.abs(far.mean)<.5,'no bias');
 assert.ok(far.sd>near.sd*1.6,'the error grows with the range ('+near.sd.toFixed(1)+' -> '+far.sd.toFixed(1)+' degrees)');
 assert.ok(near.sd>3&&far.sd<14,'a few degrees close in, ten and a bit far out');
 assert.ok(far.max<=2*far.f.error+.01&&near.max<=2*near.f.error+.01,'never more than two sigma');
 assert.ok(far.f.bearing>=0&&far.f.bearing<360&&Math.abs(far.f.range-16000)<1e-6);
 // two bearings from two places: the lines cross near the set. 14 km out they cross within the ring's own radius about 6 times in 10 (a hint, not a fix);
 // from 6 km they cross within 2.5 km in nearly every try, so a pilot who closes in and takes a second line is led onto the dye
 const cross=(a,fa,b,fb)=>{const da={x:Math.sin(fa*Math.PI/180),z:Math.cos(fa*Math.PI/180)},db={x:Math.sin(fb*Math.PI/180),z:Math.cos(fb*Math.PI/180)},den=da.x*db.z-da.z*db.x;if(Math.abs(den)<1e-3)return null;
  const t=((b.x-a.x)*db.z-(b.z-a.z)*db.x)/den;return {x:a.x+da.x*t,z:a.z+da.z*t};};
 const crossErr=(A,B)=>{const rr=P.mulberry32(21),e=[];for(let i=0;i<1500;i++){const x=cross(A,P.bearingFix(A,set,rr).bearing,B,P.bearingFix(B,set,rr).bearing);if(x)e.push(Math.hypot(x.x-set.x,x.z-set.z));}
  e.sort((p,q)=>p-q);return {n:e.length,median:e[e.length>>1],under:r=>e.filter(v=>v<r).length/e.length};};
 const farX=crossErr({x:-6000,z:-4000},{x:-6000,z:9000}),nearX=crossErr({x:-14000,z:-1500},{x:-14000,z:7500});
 assert.ok(farX.n>1300&&nearX.n>1300);
 assert.ok(farX.under(4200)>.5&&farX.median<4200,'far out the crossing is a hint inside the ring radius ('+Math.round(farX.median)+' m median)');
 assert.ok(nearX.under(2500)>.9&&nearX.median<1500,'close in the crossing is good ('+Math.round(nearX.median)+' m median)');
 assert.ok(nearX.median<farX.median/2,'closing in pays');
 assert.equal(P.DF.keep,4);assert.ok(P.DF.interval>=20&&P.DF.range>=20000);
}
console.log('pby-patrol: Build 264 checks passed');
