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
