/* Build 228/229: the climb-out after the real take-off (runway / carrier deck) in the two shipped games, all types.
 *  - ARCADE (default, Build 229): the previous flight physics again (not the computed core): the aircraft takes off,
 *    climbs away, never crashes; REALISTIC chosen in the air switches to the core and back without a jump.
 *  - ARCADE on the core (?arcade=core, the Build 227/228 law): stick fully back from lift-off, wheels and flaps up at
 *    60 m: the aircraft settles into a steep climb (the departure envelope held it to 6-10 deg before), never stalls.
 *  - REALISTIC chosen BEFORE the take-off through the real button, on the strip / in the deck-launch state: the
 *    take-off still works and the aircraft climbs away; Avenger and Corsair have it too.
 * Writes app/release/climb-out-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Climb-out WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const GAMES=process.env.GAME_TEST_RHINE_ONLY?['rhine']:process.env.GAME_TEST_PACIFIC_ONLY?['pac']:['pac','rhine'];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const law of ['classic','core'])for(const g of GAMES){
   const pacific=g==='pac';
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+(pacific?'torpedo-carrier.html?campaign=1':'remagen-mission.html?')+'&v=climbout'+(law==='core'?'&arcade=core':''));
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(async p=>{
    if(p){await prepareOkinawa();for(const kind of ['avenger','sbd','corsair','zero']){const m=MISSIONS.find(m=>kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual);await preparePacificModels(m);}}
    else await Promise.all(['p47','bf109','fw190','ju87','me262','me163'].map(ensureModel));
    renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
    const orig=crash;window.__crash=null;crash=(t,m)=>{window.__crash=t+': '+m;orig(t,m);};
   },pacific);
   const kinds=pacific?['avenger','sbd','corsair','zero']:['p47','bf109','fw190','ju87','me262'];   // the Me 163 starts in the air
   for(const kind of kinds){
    const index=await page.evaluate(({kind,pacific})=>MISSIONS.findIndex(m=>pacific?(kind==='zero'?m.defend:kind==='corsair'?m.corsair&&!m.shoreStrike:kind==='sbd'?m.sbd&&!m.corsair&&m.torps>0:!m.sbd&&!m.corsair&&!m.defend&&!m.free&&!m.qual&&m.torps>0):((m.ac||'p47')===kind&&!m.free&&!m.circuits&&!m.qual)),{kind,pacific});
    assert.ok(index>=0,kind+': a mission exists');
    // mode 'arcade': full back stick from lift-off. mode 'real': REALISTIC chosen on the ground/deck with the real button,
    // a 2.5 s pull of 0.4 after lift-off, then neutral.
    for(const mode of (law==='core'?['arcade']:['arcade','real'])){
     report[law+'-'+g+'-'+kind+'-'+mode]=await page.evaluate(async ({kind,pacific,index,mode})=>{
      const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1);window.__crash=null;
      if(pacific){selectedMission=index;await launchCampaignMission(index);launch();}
      else{startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;}
      if(pacific){await new Promise(r=>{const t=setInterval(()=>{updatePlaneMesh(0);if(carrierAircraftReady()){clearInterval(t);r();}},100);});finishCarrierIntro();clock.getDelta=()=>dt;GameRuntime.render=()=>true;}
      inputRoll=inputPitch=0;aeroMode=false;
      const res={kind,mode,state0:state};
      if(!pacific&&!P.onGround){res.airborneStart=true;return res;}
      if(mode==='real'){   // the real button, before any power is given
       const b=document.getElementById('aeroBtn');res.btnVisible=getComputedStyle(b).visibility!=='hidden';
       b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
       res.aero=aeroMode;res.btn=b.textContent;
      }
      res.coreOn=coreOn();   // ARCADE: false in the default law, true with ?arcade=core; REALISTIC: always true
      P.throttle=1;if(pacific)setThrottleUI(1);
      const stallNow=()=>pacific?CarrierRecovery.envelope(P,STALL_SPD,APP_SPD).stall:SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall;
      let t=0,off=null,peakStall=0,minRatio=9;const row={};
      for(;t<80&&P.alive;t+=dt){
       const vr=stallNow()*(pacific?1.0:1.1);
       if(pacific){if(state===ST.LAUNCH&&P.spd+deckWind()>vr)inputPitch=.5;animateFrame();}
       else{if(P.onGround&&P.spd>.95*vr)inputPitch=.5;updateFlight(dt);}
       const airborne=pacific?state===ST.FLIGHT:!P.onGround;
       if(airborne&&off==null){off=t;inputPitch=mode==='arcade'?1:.4;}
       if(off!=null){
        const since=t-off,agl=pacific?P.pos.y:P.pos.y-groundY(P.pos.x,P.pos.z);
        if(mode==='real')inputPitch=since<2.5?.4:0;
        if(agl>40)P.gearTgt=0;if(agl>60)P.flapTgt=0;
        peakStall=Math.max(peakStall,P.coreStall||0);if(since>3)minRatio=Math.min(minRatio,P.spd/stallNow());
        for(const s of [3,10,20,30])if(since>=s&&!(s in row))row[s]={pitch:r1(deg(P.pitch)),climb:r1(P.vSpeed),kt:Math.round(P.spd*1.94384),agl:Math.round(agl)};
        if(since>30)break;
       }
      }
      let toggle=null;
      if(mode==='arcade'&&!res.coreOn&&P.alive&&off!=null){   // default ARCADE: switch to REALISTIC in the air and back
       const frame=()=>{if(pacific)animateFrame();else updateFlight(dt);};
       inputPitch=0;inputRoll=0;P.gearTgt=0;P.flapTgt=0;
       for(let i=0;i<120;i++)frame();
       const a={spd:P.spd,y:P.pos.y};
       toggleAero();const onCore=coreOn();
       for(let i=0;i<300&&P.alive;i++)frame();
       const b={spd:P.spd,y:P.pos.y,finite:[P.pos.x,P.pos.y,P.pos.z,P.spd,P.pitch,P.roll,P.heading].every(Number.isFinite)};
       toggleAero();const offCore=coreOn();
       for(let i=0;i<300&&P.alive;i++)frame();
       toggle={onCore,offCore,alive:P.alive,finite:b.finite&&[P.pos.x,P.pos.y,P.pos.z,P.spd,P.pitch,P.roll,P.heading].every(Number.isFinite),
        speedKept:r1(P.spd/Math.max(1,a.spd)),heightKept:r1(P.pos.y-a.y)};
      }
      return {...res,liftoffS:off==null?null:r1(off),alive:P.alive,death:window.__crash,peakStall:+peakStall.toFixed(2),minRatio:r1(minRatio),row,aeroEnd:aeroMode,toggle};
     },{kind,pacific,index,mode});
     const r=report[law+'-'+g+'-'+kind+'-'+mode];console.log(law,g,kind,mode,JSON.stringify(r));
     assert.ok(r.liftoffS!=null,kind+' '+mode+': leaves the strip / deck');
     if(mode==='arcade'&&law==='classic'){
      assert.equal(r.coreOn,false,kind+': ARCADE flies the previous physics, not the core');
      assert.ok(r.alive,kind+': survives the take-off and climb-out '+JSON.stringify(r));
      const a=r.row[10];assert.ok(a&&a.climb>0&&a.agl>20,kind+': climbs away after the take-off '+JSON.stringify(a));
      assert.ok(r.toggle&&r.toggle.onCore===true&&r.toggle.offCore===false,kind+': the REALISTIC button moves the player onto the core and back '+JSON.stringify(r.toggle));
      assert.ok(r.toggle.alive&&r.toggle.finite,kind+': flies on through both switches '+JSON.stringify(r.toggle));
      assert.ok(r.toggle.speedKept>.6&&r.toggle.speedKept<1.5,kind+': the switch does not jump the speed '+JSON.stringify(r.toggle));
     }else if(mode==='arcade'){
      assert.equal(r.coreOn,true,kind+': ?arcade=core puts ARCADE on the core');
      assert.ok(r.alive,kind+': survives the arcade climb-out '+JSON.stringify(r));
      assert.ok(r.peakStall<.05,kind+': a fully pulled stick after lift-off does not stall '+r.peakStall);
      assert.ok(r.minRatio>=.98,kind+': the speed does not fall to the stall speed '+r.minRatio);
      const a=r.row[20];assert.ok(a,kind+': reaches 20 s');
      assert.ok(a.pitch>=13,kind+': the arcade climb-out is steeper than 13 deg after 20 s ('+a.pitch+') - it was held to 6-10 deg before');
      assert.ok(a.climb>=10,kind+': and climbs at least 10 m/s ('+a.climb+')');
     }else{
      assert.ok(r.btnVisible,kind+': the REALISTIC button is visible once the camera ride is over');
      assert.equal(r.aero,true,kind+': REALISTIC can be chosen before the take-off with the real button');
      assert.equal(r.coreOn,true,kind+': REALISTIC flies the core');
      assert.match(r.btn,/REALISTIC\s*ON/,kind+': the button shows it');
      const a=r.row[3];assert.ok(a&&a.climb>2,kind+': with REALISTIC the aircraft still climbs away after the take-off '+JSON.stringify(a));
     }
    }
   }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/climb-out-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Climb-out browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
