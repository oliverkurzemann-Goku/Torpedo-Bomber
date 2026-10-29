/* Actual configured campaign startup, stores, flight, reload and checkpoint roundtrip. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright'),C=require('../../custom-sortie.js');
const root=path.resolve(__dirname,'../..'),executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Custom sortie browser: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results=[];
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];page.setDefaultTimeout(180000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.stack);});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE:',m.text());});await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const cases=[
   {theatre:'europe',task:'bridge',ac:'p47',kit:'bombs',start:'air',fuel:75,time:'night',weather:'rain',enemies:0},
   {theatre:'europe',task:'fighter',ac:'bf109',kit:'range',start:'ground',fuel:50,enemies:1},
   {theatre:'europe',task:'intercept',ac:'me163',kit:'guns',start:'air',enemies:1},
   {theatre:'pacific',task:'torpedo',ac:'avenger',kit:'torpedo',start:'air',fuel:75,enemies:0},
   {theatre:'pacific',task:'ships',ac:'corsair',kit:'mixed',start:'ground',enemies:0},
   {theatre:'pacific',task:'free',ac:'zero',kit:'guns',start:'air',enemies:0}
  ];
  for(const input of cases){
   const cfg=C.normalize({...C.defaults(input.theatre),...input});console.log('CASE',cfg);await page.goto(base+'/'+C.url(cfg));const pac=cfg.theatre==='pacific';
   try{await page.waitForFunction(p=>p?state===ST.BRIEF:realWorldReady&&state===ST.BRIEF,pac,{polling:200,timeout:90000});}catch(e){console.error('STARTUP STATE',await page.evaluate(()=>({state:typeof state==='undefined'?null:state,loading:document.querySelector('#loadingText')?.textContent,body:document.body.innerText.slice(-2500)})));throw e;}
   assert.equal(await page.locator(pac?'#briefTitle':'#brTitle').textContent(),'Custom Sortie');
   await page.locator(pac?'#launchBtn':'#brGo').click();await page.waitForFunction(()=>state===ST.FLIGHT||state===ST.LAUNCH,null,{polling:100});
   const row=await page.evaluate(({cfg,pac})=>{
    const m=MISSIONS[mission],s=CustomSortie.stores(cfg);if(mission!==0||m.customId!==CustomSortie.fingerprint(cfg))throw Error('Wrong configured mission');
    if(weather!==cfg.weather)throw Error('Weather override ignored');if((pac?timeMode==='night':!!m.night)!==(cfg.time==='night'))throw Error('Time mismatch');
    if(!pac){if(P.ac!==cfg.ac||P.bombs!==s.bombs||P.rockets!==s.rockets||P.tankAttached!==(s.tank>0))throw Error('Rhine stores/type mismatch');if(P.fuel!==cfg.fuel)throw Error('Rhine fuel mismatch');}
    else {if(P.torps!==(s.torpedoes||s.bombs)||P.rockets!==s.rockets||P.fuel!==cfg.fuel)throw Error('Pacific stores/fuel mismatch');if(cfg.ac==='zero'&&raiders.length)throw Error('Raiders in free flight');}
    const air=cfg.start==='air';if(air&&(P.onGround||P.onDeck||P.gear!==0||P.spd<40))throw Error('Airborne state invalid');
    if(air&&(pac?carrierIntro:launchIntro))throw Error('Ground cinematic during air start');
    if(!air){if(pac){finishCarrierIntro();hideOverlays();}else finishLaunchIntro(false);}
    const originalCount=pac?P.torps:P.bombs;
    if(pac)beginDeckService();else beginFieldService();
    P.fuel=20;if(pac)P.torps=0;else {P.bombs=0;P.rockets=0;}sortieService.update(13);
    if((pac?P.torps:P.bombs)!==originalCount||P.rockets!==s.rockets)throw Error('Service changed configured weapons');sortieService.clear();
    P.onGround=P.onDeck=false;P.deckRun=P.arrestRun=P.landingRoll=null;P.pos.y=(pac?0:groundY(P.pos.x,P.pos.z))+1500;P.spd=Math.max(95,P.spd);P.throttle=.75;P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.departureAge=null;P.touchResolved=false;
    state=ST.FLIGHT;inputPitch=inputRoll=0;for(let i=0;i<180;i++)updateFlight(1/60);
    if(!P.alive||![P.spd,...P.pos.toArray()].every(Number.isFinite))throw Error('Configured flight failed');
    const saved=sortieCheckpoint.save();if(!saved.ok)throw Error('Checkpoint failed '+saved.reason);
    return {ac:cfg.ac,task:cfg.task,kit:cfg.kit,start:cfg.start,checkpoint:true,stores:s};
   },{cfg,pac});
   // Restore through the real adapter, including custom identity, loaded models and active mission.
   await page.evaluate(async()=>{await sortieCheckpoint.flush();await sortieCheckpoint.resume();});assert(await page.evaluate(()=>MISSIONS[mission].customId===CustomSortie.fingerprint(MISSIONS[mission].custom)));
   if(cfg.theatre==='europe'&&cfg.ac==='p47'){
    await page.evaluate(()=>localStorage.removeItem('custom-sortie-v1-europe'));
    await page.goto(base+'/remagen-mission.html?v=221');await page.waitForFunction(()=>realWorldReady&&state===ST.MENU,null,{polling:200});
    await page.evaluate(async()=>{await sortieCheckpoint.resume();});
    assert.deepEqual(await page.evaluate(()=>MISSIONS[mission].custom),cfg);assert(await page.evaluate(()=>selectedMission===mission));row.selfContainedRestore=true;
   }
   console.log('PASS',row);results.push(row);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({configuredCampaigns:results,errors},null,2));fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/hangar-gameplay.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
