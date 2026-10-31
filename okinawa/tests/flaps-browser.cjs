/* Build 231: the flap lever of both games.
 *  - Detents: Avenger / SBD / Zero and the Rhine types UP - T/O - DN; the Corsair six segments in 10 deg steps (0-50).
 *    FLAPS lowers one detent, the small FLAPS UP button raises one; both stop at the ends (no wrap-around).
 *  - ARCADE (default) starts with the flaps up; REALISTIC chosen on the strip / in the deck launch gives every type with
 *    flaps the take-off setting (Corsair 20 deg), also while the aircraft is already rolling; the Komet has none.
 *  - The Corsair can be taken in step by step: 20 -> 10 -> UP (and out again in 10 deg steps up to 50).
 * Writes app/release/flaps-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Flaps WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  for(const g of GAMES){
   const pacific=g==='pac';
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+(pacific?'torpedo-carrier.html?campaign=1':'remagen-mission.html?')+'&v=flaps');
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(async p=>{
    if(p){await prepareOkinawa();}
    else await Promise.all(['p47','bf109','fw190','ju87','me262','me163'].map(ensureModel));
    renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   },pacific);
   const kinds=pacific?['avenger','sbd','corsair','zero']:['p47','bf109','fw190','ju87','me262'];
   for(const kind of kinds){
    const index=await page.evaluate(({kind,pacific})=>MISSIONS.findIndex(m=>pacific?(kind==='zero'?m.defend:kind==='corsair'?m.corsair&&!m.shoreStrike:kind==='sbd'?m.sbd&&!m.corsair&&m.torps>0:!m.sbd&&!m.corsair&&!m.defend&&!m.free&&!m.qual&&!m.shoreStrike):m.ac===kind&&!m.free&&!m.circuits),{kind,pacific});
    assert.ok(index>=0,kind+': a mission exists');
    report[g+'-'+kind]=await page.evaluate(async ({kind,pacific,index})=>{
     const dt=1/60,ids=id=>document.getElementById(id);
     if(pacific){selectedMission=index;await launchCampaignMission(index);launch();}
     else{startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;}
     if(pacific){await new Promise(r=>{const t=setInterval(()=>{updatePlaneMesh(0);if(carrierAircraftReady()){clearInterval(t);r();}},100);});finishCarrierIntro();clock.getDelta=()=>dt;GameRuntime.render=()=>true;}
     inputRoll=inputPitch=0;
     const press=id=>ids(id).dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
     const lab=()=>[ids('flapBtn').textContent.replace(/\s+/g,' ').trim(),ids('flapUpBtn').textContent.replace(/\s+/g,' ').trim()];
     const res={kind,aero0:aeroMode,flap0:+P.flapTgt.toFixed(2),onGround:P.onGround,state:String(state)};
     if(!pacific&&!P.onGround){res.airborneStart=true;return res;}
     // ---- ARCADE: flaps up; the buttons walk the detents and stop at the ends
     const walk=[];
     for(let i=0;i<7;i++){press('flapBtn');walk.push(+P.flapTgt.toFixed(2));}
     res.down=walk;res.labelsDown=lab();
     const up=[];
     for(let i=0;i<7;i++){press('flapUpBtn');up.push(+P.flapTgt.toFixed(2));}
     res.up=up;res.labelsUp=lab();
     // ---- REALISTIC chosen on the strip / deck: take-off flap
     const before=P.flapTgt;
     press('aeroBtn');
     res.aero=aeroMode;res.coreOn=coreOn();res.afterAero=+P.flapTgt.toFixed(2);res.btnLabels=lab();
     // the real flap setting follows the target
     for(let i=0;i<240;i++)P.flap+=Math.sign(P.flapTgt-P.flap)*Math.min(Math.abs(P.flapTgt-P.flap),dt*.6);
     res.flapAfterRun=+P.flap.toFixed(2);
     // ---- taking them in step by step after the take-off
     const steps=[];
     for(let i=0;i<7&&P.flapTgt>0;i++){press('flapUpBtn');steps.push(+P.flapTgt.toFixed(2));}
     res.retract=steps;
     // ---- back to ARCADE and again REALISTIC while rolling (Rhine only: the strip run has speed)
     press('aeroBtn');res.aeroOff=aeroMode;
     return res;
    },{kind,pacific,index});
    const r=report[g+'-'+kind];console.log(g,kind,JSON.stringify(r));
    if(r.airborneStart)continue;
    const corsair=kind==='corsair',n=corsair?5:2;
    assert.equal(r.aero0,false,kind+': the sortie starts in ARCADE');
    assert.equal(r.flap0,0,kind+': ARCADE starts with the flaps up');
    assert.deepEqual(r.down,corsair?[.2,.4,.6,.8,1,1,1]:[.5,1,1,1,1,1,1],kind+': FLAPS lowers one detent per press and stops at the end '+JSON.stringify(r.down));
    assert.deepEqual(r.up,corsair?[.8,.6,.4,.2,0,0,0]:[.5,0,0,0,0,0,0],kind+': FLAPS UP raises one detent per press and stops at UP '+JSON.stringify(r.up));
    assert.match(r.labelsDown[0],corsair?/50°/:/DN/,kind+': the lower button names the setting');
    assert.match(r.labelsUp[0],/UP/,kind+': back at UP');
    assert.equal(r.aero,true,kind+': REALISTIC chosen on the strip / deck');
    assert.equal(r.coreOn,true,kind+': on the core');
    assert.equal(r.afterAero,corsair?.4:.5,kind+': REALISTIC sets the take-off flap '+r.afterAero);
    assert.ok(Math.abs(r.flapAfterRun-r.afterAero)<.01,kind+': the flaps travel to it');
    assert.match(r.btnLabels[0],corsair?/20°/:/T\/O/,kind+': the button shows the take-off setting '+JSON.stringify(r.btnLabels));
    assert.deepEqual(r.retract,corsair?[.2,0]:[0],kind+': the flaps come in step by step after take-off '+JSON.stringify(r.retract));
    assert.equal(r.aeroOff,false,kind+': ARCADE again');
   }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/flaps-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Flaps browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
