'use strict';
// Build 280: the frame-rate setting. "60 FPS" lowers the render resolution in
// steps until the frames fit, never swings back and forth faster than its
// back-off allows, keeps shadows/detail, and only then lets Auto change tier.
// "30 FPS" draws every second 60-Hz frame. Automated browsers stay 'free'.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../../graphics-quality.js'),'utf8');
function load({query='',stored={},webdriver=false}={}){
  const store=new Map(Object.entries(stored));
  const win={location:{search:query},navigator:{maxTouchPoints:5,webdriver},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
    addEventListener(){},URLSearchParams,console};
  win.window=win;vm.runInNewContext(source,win);
  return {GQ:win.GraphicsQuality,store};
}
// A 60-Hz display: a frame that misses 16.7 ms is shown after 33.3 ms.
const vsync=ms=>Math.ceil(ms/16.667-1e-6)*16.667;
// GPU model of the iPad report: fixed part plus a part that scales with pixels.
const gpu=(fixed,perPixel)=>ratio=>fixed+perPixel*ratio*ratio;
function fly(q,max,cost,seconds){
  let ratio=q.pixelRatio(max),t=0;const ratios=[];let changes=0;
  q.onResolution(()=>{ratio=q.pixelRatio(max);ratios.push(ratio);changes++;});
  while(t<seconds){const ms=vsync(cost(ratio));t+=ms/1000;q.sample(ms/1000,true);}
  return {ratio,ratios,changes};
}

{ // Fixed High on the iPad: 2x costs ~30 ms (shown as 30 FPS), 1.5x fits.
  const {GQ}=load({stored:{graphicsQuality:'high'}});const q=GQ.create();
  assert.equal(q.frameMode,'hold60','60 FPS is the default');
  assert.equal(q.pixelRatio(2),2,'starts at the full resolution of the tier');
  const shadows=q.settings.shadows,bloom=q.settings.bloom;
  const r=fly(q,2,gpu(6,6),600);
  assert.equal(r.ratio,1.3,'settles on the highest step that fits (model: 1.5x = 19.5 ms, 1.3x = 16.1 ms): '+r.ratio);
  assert(vsync(gpu(6,6)(r.ratio))<=16.7,'and that resolution fits 60 FPS');
  assert(r.changes<=14,'tries upward only with a growing back-off over 10 minutes: '+r.changes+' '+r.ratios);
  assert.equal(q.tier,'high','a fixed tier never changes');
  assert.equal(q.settings.shadows,shadows);assert.equal(q.settings.bloom,bloom,'shadows and glow stay');
  // Second half of the flight: few or no further steps (back-off doubles).
  const later=fly(q,2,gpu(6,6),300);
  assert(later.changes<=2,'at most one try in 5 minutes once settled: '+later.changes);
}
{ // A device that manages 2x easily never loses resolution.
  const {GQ}=load({stored:{graphicsQuality:'high'}});const q=GQ.create();
  const r=fly(q,2,gpu(4,2),120);
  assert.equal(r.ratio,2);assert.equal(r.changes,0);
}
{ // Even 1x too slow: resolution stops at 1x (the floor), the fixed tier stays.
  const {GQ}=load({stored:{graphicsQuality:'high'}});const q=GQ.create();
  const r=fly(q,2,gpu(25,2),120);
  assert.equal(r.ratio,1,'floor is 1x');assert.equal(q.tier,'high');
}
{ // Auto: the resolution goes down first, the tier only at the floor.
  const {GQ}=load();const q=GQ.create();q.set('high',false);q.set('auto',false);
  assert.equal(q.tier,'medium');
  let max=q.settings.pixelRatio,ratio=q.pixelRatio(max),t=0,firstTier=null;const seen=[];
  q.onResolution(()=>{ratio=q.pixelRatio(max);seen.push(ratio);});
  q.onChange(()=>{max=q.settings.pixelRatio;ratio=q.pixelRatio(max);});
  while(t<120){const ms=vsync(14+6*ratio*ratio);t+=ms/1000;if(q.sample(ms/1000,true)&&!firstTier)firstTier={tier:q.tier,seen:[...seen]};}
  assert(firstTier,'Auto steps down once nothing else helps');
  assert.equal(firstTier.tier,'low');
  assert.equal(firstTier.seen.at(-1),1,'only after the resolution reached its floor: '+firstTier.seen);
}
{ // 30 FPS: every second 60-Hz frame is drawn; a 33-ms frame is "on target".
  const {GQ}=load({query:'?framerate=cap30',stored:{graphicsQuality:'high'}});const q=GQ.create();
  assert.equal(q.frameMode,'cap30');
  let drawn=0;for(let i=0;i<120;i++)if(q.frameDue(i*16.667))drawn++;
  assert.equal(drawn,60,'60 of 120 display frames at 60 Hz');
  drawn=0;for(let i=0;i<240;i++)if(q.frameDue(10000+i*8.333))drawn++;
  assert(drawn>=59&&drawn<=61,'30 FPS on a 120-Hz display too: '+drawn);
  const r=fly(q,2,gpu(6,6),120);
  assert.equal(r.ratio,2,'30 ms frames meet a 30-FPS target at full resolution');
  assert.match(q.label(),/· 30$/);
}
{ // Unlimited: no resolution steps, every frame drawn, label unchanged.
  const {GQ}=load({query:'?framerate=free',stored:{graphicsQuality:'high'}});const q=GQ.create();
  const r=fly(q,2,gpu(6,6),120);assert.equal(r.changes,0);assert.equal(r.ratio,2);
  assert.equal(q.frameDue(0),true);assert.equal(q.frameDue(1),true);assert.equal(q.label(),'High');
}
{ // The choice is remembered; automated test browsers default to 'free'.
  const {GQ,store}=load();const q=GQ.create();q.setFrameMode('cap30');
  assert.equal(store.get('graphicsFrameRate'),'cap30');
  assert.equal(load({stored:{graphicsFrameRate:'cap30'}}).GQ.create().frameMode,'cap30');
  assert.equal(load({webdriver:true}).GQ.create().frameMode,'free');
  assert.equal(load({webdriver:true,query:'?framerate=hold60'}).GQ.create().frameMode,'hold60');
}
console.log('graphics-framerate: ok');
{ // CPU-bound (the script alone takes 25 ms): fewer pixels would not help.
  const {GQ}=load({stored:{graphicsQuality:'high'}});const q=GQ.create();
  q.pixelRatio(2);let changes=0;q.onResolution(()=>changes++);
  for(let t=0;t<30;t+=1/30)q.sample(1/30,true,.025);
  assert.equal(changes,0,'resolution stays when the script is the bottleneck');
  for(let t=0;t<30;t+=1/30)q.sample(1/30,true,.006);
  assert(changes>0,'and drops once the frames are GPU-bound');
}
console.log('graphics-framerate: cpu guard ok');
