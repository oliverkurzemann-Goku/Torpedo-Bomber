/* Real GLBs, unmodified shipped dependency URLs, reload, actual Continue/Resume buttons. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(process.env.GAME_TEST_ROOT||path.join(__dirname,'../..'));
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Checkpoint WebGL: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},hasTouch:true}),errors=[],remote=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(!route.request().url().startsWith(origin)&&!route.request().url().startsWith('data:')&&!route.request().url().startsWith('blob:')){remote.push(route.request().url());return route.abort();}return route.continue();});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const campaign of ['pacific','zero','rhine']){
   const pac=campaign!=='rhine';
   await page.goto(origin+'/'+(pac?'torpedo-carrier.html':'remagen-mission.html')+'?v=196');
   await page.waitForFunction(pac=>state===ST.MENU&&window.sortieCheckpoint?.ready&&(pac||realWorldReady),pac,{polling:200});
   const before=await page.evaluate(async({pac,campaign})=>{
    renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;
    const index=pac?MISSIONS.findIndex(m=>campaign==='zero'?m.defend:m.sbd&&!m.corsair):MISSIONS.findIndex(m=>m.id==='factory');
    if(pac){await prepareOkinawa();await preparePacificModels(MISSIONS[index]);startMission(index);finishCarrierIntro();}
    else {await ensureModel('p47');await ensureModel('bf109');startMission(index);finishLaunchIntro(false);}
    state=ST.FLIGHT;P.alive=true;P.pos.set(pac?-1500:10000,700,pac?800:18500);
    P.spd=85;P.throttle=.63;P.heading=.2;P.pitch=-.3;P.roll=.11;P.gear=P.gearTgt=0;P.flap=P.flapTgt=.35;
    P.fuel=73;P.hull=pac?67:86;P.ammo=777;P.rtb=false;
    SortieFeatures.Damage.surfaceHit(P,'aileron','left',.25);
    if(pac){P.onDeck=false;P.deckRun=P.arrestRun=null;score=321;qualTraps=1;carrierHP=75;
     pacificOps.elapsed=93;pacificOps.fired.add(0);pacificOps.reconDone=true;
     if(ships.length){ships[0].hp=0;ships[0].alive=false;ships[0].group.visible=false;shipDamage.hit(ships[0],null,'bomb');sortieShipsSunk=1;}
     spawnZero(0,1);zeros.at(-1).hp=1;zeros.at(-1).pos.set(-1000,550,1600);
     if(campaign!=='zero'){P.torps=2;P.pitch=-1;releaseBomb();}
     else {spawnRaider(0,1);raiders.at(-1).hp=2;spawnEnemyTorp(new THREE.Vector3(carrierX-500,1,0),new THREE.Vector3(1,0,0));}
    }else {P.onGround=false;score=654;sortieKills.factory=1;hitsTaken=2;europeOps.elapsed=111;europeOps.fired.add(0);
     const factory=targets.find(t=>t.kind==='factory');factory.hp=0;factory.alive=false;factory.sub.children[0].visible=false;
     spawnEnemyAir(1,'bf109');enemyAir.at(-1).hp=2;enemyAir.at(-1).pos.set(12000,800,19000);
     fireRocket();weapon='bomb';dropBomb();livingWorld.entities[0].phase+=123;livingWorld.entities[0].alertT=7;
    }
    const nav=ensureNavigation();nav.choose(nav.contacts().find(c=>c.kind==='BASE'));
    const saved=window.sortieCheckpoint.save();if(!saved.ok||!saved.persistent)throw Error('Checkpoint save failed '+JSON.stringify(saved));
    const snapshot=window.sortieCheckpoint.read().data;
    window.checkpointSummary=()=>({player:SortieCheckpoint.capture(P,['_keys','_stickActive','_keyboardFlightActive']),score,
     air:(pac?zeros:enemyAir).map(e=>({alive:e.alive,hp:e.hp,pos:e.pos.toArray()})),
     operation:SortieCheckpoint.capture(pac?pacificOps:europeOps),bombs:SortieCheckpoint.projectiles(bombs),rockets:pac?[]:SortieCheckpoint.projectiles(rockets),
     targets:(pac?ships:targets).map(t=>({alive:t.alive,hp:t.hp})),navigation:SortieCheckpoint.navigationState(navigation),log:localStorage.getItem(pac?'tc_log':'re_log')});
    return {snapshot,summary:checkpointSummary()};
   },{pac,campaign});
   await page.reload();await page.waitForFunction(pac=>state===ST.MENU&&window.sortieCheckpoint?.ready&&(pac||realWorldReady),pac,{polling:200});
   for(const size of [{width:1024,height:520},{width:1194,height:660},{width:1536,height:930}]){
    await page.setViewportSize(size);
    const layout=await page.evaluate(()=>{const r=document.getElementById('continueFlight').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:innerWidth,height:innerHeight};});
    assert(layout.top>=0&&layout.bottom<=layout.height&&layout.left>=0&&layout.right<=layout.width,'Continue fits iPad landscape '+JSON.stringify(layout));
    if(size.height===520){const out=path.resolve(__dirname,'../../test-visuals');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'build196-'+campaign+'-continue.png')});}
   }
   await page.setViewportSize({width:1024,height:600});
   await page.locator('#continueFlight').click();
   await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:200});
   const after=await page.evaluate(pac=>({player:SortieCheckpoint.capture(P,['_keys','_stickActive','_keyboardFlightActive']),score,
    air:(pac?zeros:enemyAir).map(e=>({alive:e.alive,hp:e.hp,pos:e.pos.toArray()})),operation:SortieCheckpoint.capture(pac?pacificOps:europeOps),
    bombs:SortieCheckpoint.projectiles(bombs),rockets:pac?[]:SortieCheckpoint.projectiles(rockets),targets:(pac?ships:targets).map(t=>({alive:t.alive,hp:t.hp})),navigation:SortieCheckpoint.navigationState(navigation),log:localStorage.getItem(pac?'tc_log':'re_log')}),pac);
   assert.deepEqual(after.player.pos,before.summary.player.pos,'position held after cold reload');
   for(const key of ['hull','fuel','ammo','spd','pitch','roll','throttle','systemDamage'])assert.deepEqual(after.player[key],before.summary.player[key],key+' preserved');
   for(const key of ['score','air','operation','targets','navigation','log'])assert.deepEqual(after[key],before.summary[key],key+' restored without replayed awards');
   assert.deepEqual(after.bombs,before.summary.bombs,'already released bombs retain trajectory and lifetime');
   assert.deepEqual(after.rockets,before.summary.rockets,'already fired rockets retain trajectory, geometry and lifetime');
   const button=page.locator(pac?'#resumeBtn':'#pmResume');await button.click();
   await page.evaluate(pac=>{for(let i=0;i<30;i++){updateFlight(1/60);if(pac)updateBombs(1/60);else updateOrdnance(1/60);}if(!P.alive||state!==ST.FLIGHT)throw Error('Restored physics failed');},pac);
   await page.locator('#pauseBtn').click();
   await page.locator(pac?'#menuBtn':'#pmMenu').click();
   assert.equal(await page.evaluate(()=>!!window.sortieCheckpoint.read()),false,'actual Abort button discards checkpoint');
   console.log(campaign+': local-only original models, cold reload, saved damage/AI/objectives/bombs, paused restore, actual Resume, physics and Abort pass.');
  }
  assert.deepEqual(remote,[],'no external runtime dependency');assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1);});
