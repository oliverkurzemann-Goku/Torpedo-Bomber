/* Build 262, real Pacific game: the weather of the sorties - greyer lanes, a swell per weather, grey-green water under cloud, the per-sortie roll (stepped toward worse by difficulty, capped for the Rookie), the met report. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Pacific weather WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/torpedo-carrier.html'){const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const report={};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
  const missing=[];page.on('response',r=>{if(r.status()===404)missing.push(new URL(r.url()).pathname);});
  page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text())||(m.type()==='error'&&!/404/.test(m.text())))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.__wxRoll=true;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=265');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{renderer.setPixelRatio(1);await prepareOkinawa();window.said=[];window.allSaid=[];const say=radioSay;radioSay=t=>{said.push(t);allSaid.push(t);say(t);};
   window.begin=async(title,diff='veteran')=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF=diff;await preparePacificModels(MISSIONS[i]);startMission(i);launch();said.length=0;return i;};});
  const shot=async(name)=>{const url=await page.evaluate(()=>{sea.position.x=P.pos.x;sea.position.z=P.pos.z;for(let i=0;i<30;i++){updateCamera(.1);updateRain(.1);}renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');});
   if(process.env.WX_SHOTS)fs.writeFileSync(path.join(process.env.WX_SHOTS,name+'.png'),Buffer.from(url.split(',')[1],'base64'));};
  const R=await page.evaluate(async()=>{
   const out={},idx=await begin('Sortie 3','veteran'),m=MISSIONS[idx],fair=new Set(['clear','broken','haze']);
   // the roll: Sortie 3's list stepped toward worse by difficulty; the Rookie never sees heavy showers or a storm
   out.dist={};for(const diff of ['rookie','veteran','ace']){DIFF=diff;const c={},n=3000;let f=0;for(let k=0;k<n;k++){const w=rollPacificWeather(['broken','haze'],m);c[w]=(c[w]||0)+1;if(fair.has(w))f++;}out.dist[diff]={counts:c,fair:+(f/n).toFixed(2)};}
   DIFF='ace';out.untouched={free:Array.from({length:60},()=>rollPacificWeather(['clear'],MISSIONS.find(x=>x.free))).every(w=>w==='clear'),qual:Array.from({length:60},()=>rollPacificWeather(['clear'],MISSIONS.find(x=>x.qual))).every(w=>w==='clear'),pby:Array.from({length:400},()=>rollPacificWeather(['clear'],MISSIONS.find(x=>x.pby))).every(w=>WX_RANK[w]<=5)&&Array.from({length:400},()=>rollPacificWeather(['storm'],MISSIONS.find(x=>x.pby))).every(w=>w==='storm'),   // Build 264: the Catalina is rolled too, but a roll never takes it past a heavy shower (a plan that already lists a storm keeps it)
   
    storm:Array.from({length:60},()=>rollPacificWeather(['storm'],m)).every(w=>w==='storm')};
   DIFF='rookie';out.rookieStorm=Array.from({length:60},()=>rollPacificWeather(['storm'],m)).every(w=>w==='storm');
   // the sea and its colours follow the weather
   DIFF='veteran';out.sea={};for(const w of ['clear','broken','haze','lowcloud','fog','rain','squall','storm']){weather=w;applyWeather();out.sea[w]={sea:+seaState.toFixed(2),shallowG:+seaUniforms.uShallow.value.g.toFixed(3),deepG:+seaUniforms.uDeep.value.g.toFixed(3),fogFar:Math.round(scene.fog.far),sun:+sun.intensity.toFixed(2),rain:rainMesh?rainMesh.visible:false};}
   // a met report at the start of a sortie, whatever the roll gave (the draw is forced to the worst: Math.random = .95)
   const real=Math.random;Math.random=()=>.95;DIFF='veteran';const pre=choosePacificPlan(idx);Math.random=real;const orig=choosePacificPlan;choosePacificPlan=()=>pre;
   allSaid.length=0;const i2=await begin('Sortie 3','veteran');choosePacificPlan=orig;out.met={weather,planned:pre.weather,said:allSaid.filter(t=>/MET REPORT/.test(t))};
   // a practice sortie says nothing
   weather='clear';allSaid.length=0;await begin('Free Flight','veteran');out.freeMet=allSaid.filter(t=>/MET REPORT/.test(t)).length;
   return out;});
  report.weather=R;
  console.log(JSON.stringify(R.dist),JSON.stringify(R.sea),JSON.stringify(R.met));
  assert.ok(!R.dist.rookie.counts.squall&&!R.dist.rookie.counts.storm,'the Rookie never rolls heavy showers or a storm: '+JSON.stringify(R.dist.rookie));
  assert.ok(R.dist.rookie.fair>=.55&&R.dist.rookie.fair<=.78&&R.dist.veteran.fair>=.33&&R.dist.veteran.fair<=.52&&R.dist.ace.fair>=.2&&R.dist.ace.fair<=.4&&R.dist.rookie.fair>R.dist.veteran.fair&&R.dist.veteran.fair>R.dist.ace.fair,'fair weather by difficulty (Rookie > Veteran > Ace, about 64 / 41 / 31 %): '+JSON.stringify(R.dist));
  assert.ok(R.untouched.free&&R.untouched.qual&&R.untouched.pby&&R.untouched.storm&&R.rookieStorm,'practice and qualification keep their weather, the Catalina is rolled but never past a heavy shower, a storm stays a storm: '+JSON.stringify(R.untouched));
  const S=R.sea,order=['clear','broken','haze','lowcloud','rain','squall','storm'];
  assert.ok(Math.abs(S.clear.sea-1)<.01&&Math.abs(S.broken.sea-1.08)<.02&&Math.abs(S.lowcloud.sea-1.36)<.02&&Math.abs(S.rain.sea-1.55)<.02&&S.squall.sea>1.85&&S.storm.sea>2.0&&S.fog.sea<1.05,'the swell per weather: '+JSON.stringify(Object.fromEntries(Object.entries(S).map(([k,v])=>[k,v.sea]))));
  assert.ok(order.every((w,k)=>k===0||S[w].sea>=S[order[k-1]].sea-1e-9),'the sea never gets calmer with worse weather: '+order.map(w=>S[w].sea).join(' '));
  assert.ok(S.lowcloud.shallowG<S.clear.shallowG-.03&&S.rain.shallowG<S.clear.shallowG-.03&&S.rain.deepG<S.clear.deepG,'grey-green water under cloud: '+JSON.stringify({clear:S.clear.shallowG,lowcloud:S.lowcloud.shallowG,rain:S.rain.shallowG}));
  assert.ok(S.broken.fogFar===6800&&S.haze.fogFar===4000&&S.lowcloud.fogFar===3300&&S.rain.fogFar===2700&&S.clear.fogFar>=10000&&S.broken.sun<S.clear.sun*.75,'visibility and light follow the weather: '+JSON.stringify(S));
  assert.ok(R.met.weather===R.met.planned&&R.met.said.length===1&&/MET REPORT — /.test(R.met.said[0])&&R.freeMet===0,'one met report at the start of a sortie, none in practice: '+JSON.stringify(R.met)+' '+R.freeMet);
  // eyes on it: the same carrier in every weather (written when WX_SHOTS is set)
  await page.evaluate(async()=>{await begin('Sortie 3','veteran');});
  for(const w of ['clear','broken','haze','lowcloud','rain','squall']){await page.evaluate(w=>{weather=w;applyWeather();},w);await shot('wx-'+w);}
  assert.deepEqual(missing,[],'no missing files: '+missing.join(', '));assert.deepEqual(errors,[],'page errors: '+errors.slice(0,4).join(' | '));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/pacific-weather-browser.json'),JSON.stringify(report,null,1));
  console.log('Pacific weather WebGL: the roll by difficulty, the swell, the water colour and the met report OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
