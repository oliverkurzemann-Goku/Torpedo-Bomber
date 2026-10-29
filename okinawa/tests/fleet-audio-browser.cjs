/* Real Web Audio rendering, UI gesture and engine transitions. No audio-node stubs. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Fleet Web Audio: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(err,s)=>{if(err||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':'application/javascript'});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/engine-preview.html');
  await page.getByRole('button',{name:'Start engine',exact:true}).click();
  await page.waitForFunction(()=>ctx.state==='running'&&piston.state.kind==='p47'&&piston.state.loaded&&piston.state.load>.1);
  await page.getByRole('button',{name:'Bf 109',exact:true}).click();await page.waitForFunction(()=>piston.state.kind==='bf109'&&piston.state.loaded);
  await page.getByRole('button',{name:'Me 262',exact:true}).click();await page.waitForFunction(()=>piston.state.kind===null);
  await page.getByRole('button',{name:'Stop engine',exact:true}).click();assert.equal(await page.locator('#status').textContent(),' · Stopped');
  const result=await page.evaluate(async()=>{
   const result={};
   for(const kind of Object.keys(FlightDynamics.profiles)){
    const rate=24000,offline=new OfflineAudioContext(1,rate*7,rate),node=AircraftEngine.profiles[kind]?AircraftEngine.create(offline,offline.destination):JetEngine.create(offline,offline.destination,{rocket:kind==='me163'});
    const update=(on,throttle)=>{for(let i=0;i<240;i++){if(AircraftEngine.profiles[kind])node.update(1/60,kind,throttle,on);else node.update(1/60,throttle,on);}};
    if(AircraftEngine.profiles[kind]){await node.ready(kind);node.select(kind);await Promise.resolve();}
    update(true,1);
    const paused=offline.suspend(4).then(()=>{update(false,0);return offline.resume();});
    const buffer=await offline.startRendering();await paused;const a=buffer.getChannelData(0);
    function rms(from,to){let sum=0;for(let i=from*rate;i<to*rate;i++)sum+=a[i]*a[i];return Math.sqrt(sum/((to-from)*rate));}
    let peak=0;for(const v of a){if(!Number.isFinite(v))throw Error('Nonfinite audio '+kind);peak=Math.max(peak,Math.abs(v));}
    // Fixed-frequency energy bands discriminate actual rendered engine voices.
    const spectrum=[];for(const hz of [80,100,130,180,240,280,360,500,1000,2000]){let re=0,im=0;for(let i=rate*2;i<rate*3;i++){re+=a[i]*Math.cos(2*Math.PI*hz*i/rate);im+=a[i]*Math.sin(2*Math.PI*hz*i/rate);}spectrum.push(Math.hypot(re,im)/rate);}
    result[kind]={rms:rms(2,3),muted:rms(6,7),peak,spectrum};
   }
   // Idle and part-power renders use the same real decoded files and graph.
   for(const kind of Object.keys(AircraftEngine.profiles)){
    result[kind].levels=[];
    for(const throttle of [0,.25,.5,.75]){
     const rate=24000,offline=new OfflineAudioContext(1,rate*3,rate),node=AircraftEngine.create(offline,offline.destination);
     await node.ready(kind);node.select(kind);await Promise.resolve();
     for(let i=0;i<300;i++)node.update(1/60,kind,throttle,true);
     const rendered=(await offline.startRendering()).getChannelData(0);let sum=0,peak=0;
     for(let i=rate;i<rendered.length;i++){sum+=rendered[i]**2;peak=Math.max(peak,Math.abs(rendered[i]));}
     result[kind].levels.push({throttle,rms:Math.sqrt(sum/(rendered.length-rate)),peak});
    }
   }
   // A full minute at constant power covers the former short flyby loop many times.
   for(const kind of ['p47','fw190','avenger','zero','sbd','bf109','corsair']){
    const rate=24000,offline=new OfflineAudioContext(1,rate*60,rate),node=AircraftEngine.create(offline,offline.destination);
    await node.ready(kind);node.select(kind);await Promise.resolve();
    for(let i=0;i<360;i++)node.update(1/60,kind,1,true);
    const data=(await offline.startRendering()).getChannelData(0),windows=[];let peak=0;
    for(let sec=3;sec<60;sec++){let sum=0;for(let i=sec*rate;i<(sec+1)*rate;i++){sum+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));}windows.push(Math.sqrt(sum/rate));}
    const quarters=[];for(let i=rate*3;i<data.length-rate/4;i+=rate/4){let sum=0;for(let j=i;j<i+rate/4;j++)sum+=data[j]**2;quarters.push(Math.sqrt(sum/(rate/4)));}
    result[kind].sustain={seconds:60,minRms:Math.min(...windows),maxRms:Math.max(...windows),quarterRangeDb:20*Math.log10(Math.max(...quarters)/Math.min(...quarters)),peak};
   }
   // Real scheduled throttle changes, including the return to idle and mute.
   for(const kind of ['p47','fw190','avenger','sbd','zero','bf109','corsair']){
    const rate=24000,offline=new OfflineAudioContext(1,rate*30,rate),node=AircraftEngine.create(offline,offline.destination);
    await node.ready(kind);node.select(kind);await Promise.resolve();node.update(.5,kind,0,true);
    const pauses=[];for(let t=.5;t<30;t+=.5)pauses.push(offline.suspend(t).then(()=>{node.update(.5,kind,t>=3&&t<20?1:0,t<27);return offline.resume();}));
    const data=(await offline.startRendering()).getChannelData(0);await Promise.all(pauses);
    function metrics(from,to){let sum=0,diff=0,peak=0;for(let i=from*rate;i<to*rate;i++){sum+=data[i]**2;diff+=(data[i]-data[Math.max(0,i-1)])**2;peak=Math.max(peak,Math.abs(data[i]));}return {rms:Math.sqrt(sum/((to-from)*rate)),differenceEnergy:sum?diff/sum:0,peak};}
    result[kind].transition={idle:metrics(1,2),full:metrics(10,15),returned:metrics(24,26),muted:metrics(29,30)};
   }
   // Same-bank Corsair must still load its own ground power buffer after P47.
   const originalFetch=window.fetch,urls=[];try{window.fetch=(url,...args)=>{urls.push(String(url));return originalFetch(url,...args);};const offline=new OfflineAudioContext(1,24000,24000),node=AircraftEngine.create(offline,offline.destination);await node.ready('p47');await node.ready('corsair');if(!urls.some(u=>/r2800-power\.wav/.test(u)))throw Error('P47 powered buffer leaked to Corsair');}finally{window.fetch=originalFetch;}
   // Missing files surface an error; there is no silent synthesized fallback.
   const oldFetch=window.fetch;let failure;
   try{
    window.fetch=async()=>({ok:false,status:404});
    const offline=new OfflineAudioContext(1,24000,24000),node=AircraftEngine.create(offline,offline.destination);
    node.select('fw190');await new Promise(r=>setTimeout(r,50));failure=node.state;
   }finally{window.fetch=oldFetch;}
   if(!failure.error||failure.loaded)throw Error('Missing recording is not reported');
   return result;
  });
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build217-audio.json'),JSON.stringify(result,null,2));
  for(const kind of ['p47','fw190','avenger','sbd','zero','bf109','corsair']){const s=result[kind],levels=[...s.levels.map(x=>x.rms),s.rms];for(let i=1;i<levels.length;i++)assert(levels[i]>levels[i-1]*1.02,kind+' measured volume rises at every power step');assert(s.rms>s.levels.at(-1).rms*1.12,kind+' audible upper-power gain');assert(s.sustain.quarterRangeDb<(kind==='corsair'?2:1.8),kind+' no short steady-power seam drop');}
  for(const [kind,s] of Object.entries(result)){assert(s.rms>.015&&s.rms<.40,kind+' usable audible level');assert(s.peak<.95,kind+' clipping headroom');assert(s.muted<.00001,kind+' silence after stop');if(s.levels){assert(s.rms>s.levels[0].rms*1.4,kind+' load adds weight');for(const x of s.levels)assert(x.rms>.035&&x.peak<.95,kind+' idle/mid levels');}}
  for(const a of Object.keys(result))for(const b of Object.keys(result))if(a<b){const distance=Math.hypot(...result[a].spectrum.map((v,i)=>v-result[b].spectrum[i]));assert(distance>.0001,a+'/'+b+' distinct rendered spectrum');}
  for(const [kind,s] of Object.entries(result))if(s.sustain){assert(s.sustain.minRms>.1&&s.sustain.peak<.95,kind+' sustained audible without overload');assert(s.sustain.maxRms/s.sustain.minRms<1.6,kind+' no recurring pass-by fade');}
  const accepted214=JSON.parse(fs.readFileSync(path.join(root,'app/release/loaded-engine-validation.json'),'utf8')).audio;
  for(const kind of ['corsair'])assert(Math.abs(result[kind].levels[0].rms-accepted214[kind].levels[0].rms)<1e-7,kind+' existing idle unchanged');
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'app/release/steady-engine-validation.json'),'utf8')).audio;
  for(const kind of ['ju87','me262','me163'])for(const metric of ['rms','peak'])assert(Math.abs(result[kind][metric]-baseline[kind][metric])<1e-7,kind+' accepted voice unchanged');
  for(const kind of ['p47','fw190','avenger','sbd','zero','bf109','corsair']){const t=result[kind].transition;assert(t.full.rms>t.idle.rms*1.4,kind+' loaded sound level');assert(t.full.differenceEnergy>0&&Number.isFinite(t.full.differenceEnergy),kind+' finite recorded load texture');assert(t.returned.rms<t.full.rms*.7,kind+' returns to idle');assert(t.muted.rms<.00001,kind+' scheduled mute');}
  const provenance=JSON.parse(fs.readFileSync(path.join(root,'audio/engines/provenance.json'),'utf8'));
  for(const bank of ['r2800','bmw801']){const record=provenance.loops.find(r=>r.path==='audio/engines/'+bank+'-power.wav');assert(record.seconds>=12&&!/fly/.test(record.source)&&!record.dopplerRidge,bank+' long ground source');}
  await page.getByRole('button',{name:'P-47 Thunderbolt',exact:true}).click();
  await page.evaluate(async()=>{
   const original=performance.now.bind(performance);let time=original();
   Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
   try{await document.getElementById('sustain').onclick();tick();if(!playing||+get('throttle').value!==100)throw Error('Sustained audition does not start at full power');time+=59900;tick();if(!playing)throw Error('Audition ends early');time+=200;tick();if(playing||get('start').textContent!=='Start engine'||get('elapsed').textContent!=='01:00')throw Error('Audition does not end after 60 seconds');}finally{delete performance.now;}
  });
  await page.evaluate(async()=>{const original=performance.now.bind(performance);let time=original();Object.defineProperty(performance,'now',{configurable:true,value:()=>time});try{await get('sweep').onclick();tick();if(!playing||+get('throttle').value!==0)throw Error('Sweep must start idle');time+=4000;tick();if(+get('throttle').value!==100)throw Error('Sweep must reach full power');time+=17000;tick();if(+get('throttle').value!==0)throw Error('Sweep must return idle');time+=10000;tick();if(playing||get('elapsed').textContent!=='00:30')throw Error('Sweep must stop at 30 seconds');}finally{delete performance.now;}});
  assert.deepEqual(errors,[]);fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build217-audio.json'),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(root,'test-visuals/build217-engine-preview.png'),fullPage:true});
  console.log('Ten real Web Audio renders, levels/headroom, ten distinct spectra, stop silence, gesture and type crossfade:',JSON.stringify(result));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
