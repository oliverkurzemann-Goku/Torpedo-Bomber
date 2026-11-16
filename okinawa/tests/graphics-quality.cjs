'use strict';
// Build 278: the Auto graphics setting must not swing between two tiers (each
// step was a hitch on the iPad), and an Auto step must never toggle shadows or
// texture filtering (shader recompile / texture re-upload).
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../../graphics-quality.js'),'utf8');
function load({touch=true,query='',stored=null}={}){
  const store=new Map(stored?[['graphicsQuality',stored]]:[]),events=new Map();
  const win={location:{search:query},navigator:{maxTouchPoints:touch?5:0},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
    addEventListener:(name,fn)=>events.set(name,fn),URLSearchParams,console};
  win.window=win;vm.runInNewContext(source,win);
  return {GQ:win.GraphicsQuality,events};
}
// Feed `seconds` of frames of `ms` each; returns the tier changes seen.
function feed(q,ms,seconds,changes){
  for(let t=0;t<seconds;t+=ms/1000)if(q.sample(ms/1000,true))changes.push(q.tier);
}

{ // A device that manages ~40 FPS on Medium and 60 FPS on Low.
  const {GQ}=load();const q=GQ.create(),changes=[],seen=[];
  q.onChange(()=>seen.push({tier:q.tier,auto:q.automatic,shadows:q.settings.shadows,aniso:q.settings.anisotropy}));
  assert.equal(q.tier,'medium','Auto starts at Medium on touch devices');
  const start=q.settings;
  for(let minute=0;minute<5;minute++){feed(q,q.tier==='medium'?25:16.6,60,changes);}
  assert.deepEqual(changes,['low'],'one step down, then it stays (no Medium/Low swinging): '+changes);
  assert.deepEqual([...q.failed],['medium']);
  assert(seen.every(s=>s.auto),'the step is reported as automatic');
  assert.equal(q.settings.shadows,start.shadows,'Auto keeps the starting shadow setting (no shader recompile)');
  assert.equal(q.settings.shadowSize,start.shadowSize);
  assert.equal(q.settings.anisotropy,start.anisotropy,'Auto keeps the starting texture filtering (no re-upload)');
  assert.equal(q.settings.pixelRatio,1,'the resolution is what Auto changes');
  // The player can still pick a tier; then everything follows it.
  q.set('high',false);
  assert.equal(q.settings.shadowSize,2048);assert.equal(q.settings.anisotropy,8);assert.deepEqual([...q.failed],[]);
  q.set('low',false);assert.equal(q.settings.shadows,false,'a fixed Low has no shadows');
}
{ // A fast device climbs to High and stays.
  const {GQ}=load();const q=GQ.create(),changes=[];
  feed(q,16,120,changes);
  assert.deepEqual(changes,['high'],'one step up after a comfortable stretch: '+changes);
  assert.equal(q.settings.pixelRatio,2);assert.equal(q.settings.bloom,true);
  assert.equal(q.settings.shadowSize,1024,'Auto keeps Medium shadows even on High');
}
{ // Short spikes (a terrain tile, a model load) do not lower the tier.
  const {GQ}=load();const q=GQ.create(),changes=[];
  for(let k=0;k<40;k++){feed(q,40,.5,changes);feed(q,16,4,changes);}
  assert.deepEqual(changes.filter(t=>t==='low'),[],'isolated slow half-seconds do not drop a tier: '+changes);
}
{ // High that later becomes too slow (heat) falls to Medium and does not go back.
  const {GQ}=load({touch:false});const q=GQ.create(),changes=[];
  assert.equal(q.tier,'high');
  feed(q,30,10,changes);feed(q,16,300,changes);
  assert.deepEqual(changes,['medium'],'High is not retried: '+changes);
}
{ // Fixed choices ignore frame times; thermal warnings cap the tier.
  const {GQ,events}=load({stored:'high'});const q=GQ.create(),changes=[];
  feed(q,40,30,changes);assert.deepEqual(changes,[]);assert.equal(q.tier,'high');
  events.get('graphicsdevicehealth')({detail:{thermal:2}});assert.equal(q.tier,'medium');
  events.get('graphicsdevicehealth')({detail:{thermal:0}});assert.equal(q.tier,'high');
}
console.log('graphics-quality: Auto steps once, keeps shadows/filtering, fixed tiers unchanged');
