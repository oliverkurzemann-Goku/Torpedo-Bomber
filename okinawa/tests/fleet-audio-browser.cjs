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
  await page.waitForFunction(()=>ctx.state==='running'&&piston.state.kind==='p47'&&piston.state.load>.1);
  await page.getByRole('button',{name:'Bf 109',exact:true}).click();await page.waitForFunction(()=>piston.state.kind==='bf109');
  await page.getByRole('button',{name:'Me 262',exact:true}).click();await page.waitForFunction(()=>piston.state.kind===null);
  await page.getByRole('button',{name:'Stop engine',exact:true}).click();assert.equal(await page.locator('#status').textContent(),' · Stopped');
  const result=await page.evaluate(async()=>{
   const result={};
   for(const kind of Object.keys(FlightDynamics.profiles)){
    const rate=24000,offline=new OfflineAudioContext(1,rate*7,rate),node=AircraftEngine.profiles[kind]?AircraftEngine.create(offline,offline.destination):JetEngine.create(offline,offline.destination,{rocket:kind==='me163'});
    const update=(on,throttle)=>{for(let i=0;i<240;i++){if(AircraftEngine.profiles[kind])node.update(1/60,kind,throttle,on);else node.update(1/60,throttle,on);}};
    update(true,1);
    const paused=offline.suspend(4).then(()=>{update(false,0);return offline.resume();});
    const buffer=await offline.startRendering();await paused;const a=buffer.getChannelData(0);
    function rms(from,to){let sum=0;for(let i=from*rate;i<to*rate;i++)sum+=a[i]*a[i];return Math.sqrt(sum/((to-from)*rate));}
    let peak=0;for(const v of a){if(!Number.isFinite(v))throw Error('Nonfinite audio '+kind);peak=Math.max(peak,Math.abs(v));}
    // Fixed-frequency energy bands discriminate piston firing/blade components.
    const spectrum=[];for(const hz of [80,100,130,180,240,280,360,500,1000,2000]){let re=0,im=0;for(let i=rate*2;i<rate*3;i++){re+=a[i]*Math.cos(2*Math.PI*hz*i/rate);im+=a[i]*Math.sin(2*Math.PI*hz*i/rate);}spectrum.push(Math.hypot(re,im)/rate);}
    result[kind]={rms:rms(2,3),muted:rms(6,7),peak,spectrum};
   }
   return result;
  });
  for(const [kind,s] of Object.entries(result)){assert(s.rms>.015&&s.rms<.40,kind+' usable audible level');assert(s.peak<.95,kind+' clipping headroom');assert(s.muted<.00001,kind+' silence after stop');}
  for(const a of Object.keys(result))for(const b of Object.keys(result))if(a<b){const distance=Math.hypot(...result[a].spectrum.map((v,i)=>v-result[b].spectrum[i]));assert(distance>.0001,a+'/'+b+' distinct rendered spectrum');}
  assert.deepEqual(errors,[]);fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build211-audio.json'),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(root,'test-visuals/build211-engine-preview.png'),fullPage:true});
  console.log('Ten real Web Audio renders, levels/headroom, ten distinct spectra, stop silence, gesture and type crossfade:',JSON.stringify(result));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
