/* Functional limits and time-step checks; visual/WebGL evidence lives in the browser test. */
'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
const GroundRun=require('../../ground-run.js'),Indicators=require('../../flight-indicators.js'),Wakes=require('../../ship-wakes.js');
require('../../crew-visuals.js');const Deck=require('../../deck-activity.js'),Runway=require('../../runway-lights.js');
for(const [kind,vr,minTime,maxTime,maxDistance] of [['prop',44.8,9,14,450],['jet',57.12,18,25,730],['carrier',44,6,11,250]]){
 const results=[];
 for(const fps of [20,60,120]){
  const p={spd:0,throttle:1};let t=0,distance=0,twoSeconds;
  while(t<60&&(kind==='carrier'?distance<218:p.spd<vr)){
   GroundRun.step(p,1/fps,{jet:kind==='jet',carrier:kind==='carrier',limit:kind==='carrier'?48:90});distance+=p.spd/fps;t+=1/fps;if(t>=2&&!twoSeconds)twoSeconds=p.spd;
  }
  assert(twoSeconds<vr*.3,kind+' cannot rotate after two seconds');assert(t>minTime&&t<maxTime,kind+' usable delayed acceleration');assert(distance<maxDistance,kind+' rotates before runway end');
  results.push({t,distance});p.throttle=0;for(let i=0;i<15*fps;i++)GroundRun.step(p,1/fps);assert.equal(p.spd,0,'closed throttle brakes to rest');
 }
 assert(Math.max(...results.map(r=>r.t))-Math.min(...results.map(r=>r.t))<.15,kind+' frame-rate independence');console.log(kind+' takeoff',results);
}
let p={fuel:100,hull:100,systemDamage:{maxHull:100,engine:1,fuelLeak:0,gearLock:null}};assert(Indicators.states(p).every(s=>s.level===0));
p.systemDamage.engine=.72;p.systemDamage.fuelLeak=.1;p.systemDamage.gearLock=0;p.hull=20;
assert.deepEqual(Indicators.states(p).map(s=>s.level),[2,1,2,2]);p.systemDamage={maxHull:100,engine:1,fuelLeak:0,gearLock:null};p.hull=100;p.fuel=8;assert.deepEqual(Indicators.states(p).map(s=>s.level),[0,2,0,0]);p.fuel=100;assert(Indicators.states(p).every(s=>s.level===0),'repair extinguishes all lamps');
for(const fps of [20,60,120]){
 const scene=new THREE.Scene(),wake=Wakes.create(THREE,scene,{height:(x,z)=>Math.sin(x*.01)*.2}),key={},position=new THREE.Vector3();
 for(let i=0;i<30*fps;i++){const heading=i/fps*.055,f={x:Math.sin(heading),z:Math.cos(heading)};position.x+=f.x*6/fps;position.z+=f.z*6/fps;wake.track(key,position,f,100,16,6,1/fps);wake.update(1/fps);}
 const points=wake.tracks.get(key).points;assert(points.length>40&&points.length<=80);assert(points.at(-1).fx-points[0].fx>.5,'course change persists in the historical trail');
 assert(wake.stats.vertices>500);const a=wake.mesh.geometry.attributes.position;for(let i=0;i<a.count&&i<wake.stats.vertices;i++)assert(Math.abs(a.getY(i)-(Math.sin(a.getX(i)*.01)*.2+.14))<.00001,'foam sits on actual water');
 const count=points.length;for(let i=0;i<fps;i++){wake.track(key,position,{x:1,z:0},100,16,0,1/fps);wake.update(1/fps);}assert(wake.tracks.get(key).points.length<=count,'stopped ship emits no new trail');
 for(let i=0;i<40*fps;i++)wake.update(1/fps);assert.equal(wake.stats.ships,0);assert.equal(wake.stats.vertices,0,'old wake fades and expires');
 for(let i=0;i<40;i++)wake.track({},position,{x:1,z:0},100,16,8,1);assert.equal(wake.stats.ships,24,'fixed ship budget');wake.clear();assert.equal(wake.stats.ships,0);assert.equal(wake.mesh.geometry.drawRange.count,0);wake.dispose();assert.equal(scene.children.length,0);
}
const scene=new THREE.Scene(),deck=Deck.create(THREE,scene,{deckY:14});assert.equal(deck.crew.length,8);assert.equal(deck.group.children.filter(o=>o.isInstancedMesh).length,6);
const marshal=deck.group.children[4],before=marshal.instanceMatrix.array.slice();deck.update(.3,{launching:true});assert(before.some((v,i)=>v!==marshal.instanceMatrix.array[i]),'marshaller signals actual launch');
for(let i=0;i<120;i++){deck.update(.05,{servicing:true});assert(deck.crew.every(c=>Math.abs(c.z)>=10),'walking/repair stays outside landing path');}deck.reset();assert.equal(deck.time,0);deck.dispose();assert.equal(scene.children.length,0);
const lights=Runway.create(THREE,scene,(x,z)=>x*.01+z*.02);lights.setActive(true,1000,2000);assert.equal(lights.positions.length,52);assert.equal(lights.group.children.length,3);assert(!scene.children.some(o=>o.isLight),'runway adds no GPU light slots');
const m=new THREE.Matrix4(),v=new THREE.Vector3();for(let i=0;i<52;i++){lights.group.children[1].getMatrixAt(i,m);v.setFromMatrixPosition(m);const [x,z]=lights.positions[i];assert(Math.abs(v.y-((1000+x)*.01+(2000+z)*.02+.48))<.00001);}
lights.setActive(false,3000,4000);assert.equal(lights.group.visible,false);lights.dispose();assert.equal(scene.children.length,0);
console.log('Warnings, curved/stopped/wave-height wakes, resource ceilings, deck signals and runway marker placement: passed');
