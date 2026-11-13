/* Build 252: the two Catalina sorties of the Rhine game, real game and real GLBs: "Bonus Dumbo" (rescue from the river) and "Bonus Black Cat" (night strike on the ferry). */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Catalina missions WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const sortie=encodeURIComponent(JSON.stringify({version:1,theatre:'europe',task:'free',ac:'pby',kit:'guns',weather:'clear',time:'day',start:'ground',difficulty:'vet',enemies:0,fuel:100}));
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errors.push('console: '+m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=257&surprises=off&sortie='+sortie);
  await page.waitForFunction(()=>realWorldReady&&(state===ST.MENU||state===ST.BRIEF),null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['pby','pbyn','bf109','p47'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   const orig=crash;window.__crash=null;crash=(t,m)=>{window.__crash=t+': '+m;orig(t,m);};window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.begin=(id,diff=1)=>{diffIdx=diff;const i=MISSIONS.findIndex(m=>m.id===id);selectedMission=i;briefPlan=chooseEuropePlan(i);startMission(i);if(launchIntro)finishLaunchIntro(false);show('menu',false);show('brief',false);show('result',false);state=ST.FLIGHT;P.alive=true;inputRoll=inputPitch=0;window.__crash=null;said.length=0;return i;};
  });

  // ---- 1. Bonus Dumbo: alight on the river, taxi to the dinghy, the airman boards, water take-off, hunters, home to Beaufort ----
  const D=await page.evaluate(()=>{
   const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1),out={};
   begin('dumbo');
   const lz=sts.plan.lz,strip=sts.plan.strip;
   out.start={ac:P.ac,onGround:P.onGround,gear:r1(P.gear),kind:sts.kind,phase:sts.phase,fig:!!sts.fig,strip:strip&&Math.round(strip.len),bombs:P.bombs,rockets:P.rockets,text:objectiveText(),key:modelKey('pby'),dinghyOnWater:waterAt(lz.x,lz.z),figY:r1(sts.fig.position.y-waterY(lz.x,lz.z)),dist:Math.round(Math.hypot(lz.x-ALLIED_AF_X,lz.z-ALLIED_AF_Z))};
   if(!strip)return out;
   // a flown alighting along the stream, wheels UP (the same controller as catalina-flight-browser)
   const hdg=strip.heading,sx=Math.sin(hdg),sz=Math.cos(hdg),sp0=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app),ref=sp0.reference;
   const startX=strip.x-sx*strip.len/2,startZ=strip.z-sz*strip.len/2;
   P.onGround=false;P.onWater=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.throttle=.4;P.gear=P.gearTgt=0;P.heading=hdg;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;P.pitchRef=null;P.coreStall=0;P.coreDrop=0;P.core=null;P.nLoad=1;P.groundPose=null;P.takeoffRotation=0;
   {const x=startX+sx*60,z=startZ+sz*60;P.pos.set(x,waterY(x,z)+5.3,z);}P.spd=ref;P.vSpeed=-1.5;
   let touch=null;
   for(let t=0;t<90&&P.alive&&!missionOver;t+=dt){
    const wy=waterY(P.pos.x,P.pos.z),agl=P.pos.y+waterlineOffset()-.84-wy;
    if(!P.onGround){if(agl>7){inputPitch=Math.max(-.5,Math.min(.5,(-1.8-P.vSpeed)*.18));P.throttle=Math.max(0,Math.min(1,.4+(ref-P.spd)*.1));}
     else{inputPitch=Math.max(-.6,Math.min(.6,(.05-P.pitch)*1.6+(-1.2-P.vSpeed)*.08));P.throttle=0;}}
    else{if(touch==null)touch={t:r1(t),spd:r1(P.spd),wet:waterAt(P.pos.x,P.pos.z)};inputPitch=0;P.throttle=0;}
    updateFlight(dt);updateSites(dt);updateEuropeOperation(dt);
    if(touch&&P.onGround&&P.spd<.7&&!P.landingRoll)break;
   }
   out.alight={touch,alive:P.alive,crash:window.__crash,over:missionOver,onWater:P.onWater,phase:sts.phase,dist:Math.round(Math.hypot(P.pos.x-sts.fig.position.x,P.pos.z-sts.fig.position.z)),text:objectiveText()};
   // taxi up to the dinghy: head for it, idle the last stretch
   let t1=0;
   for(;t1<150&&P.alive&&sts.phase==='fly';t1+=dt){
    const fx=sts.fig.position.x-P.pos.x,fz=sts.fig.position.z-P.pos.z,dd=Math.hypot(fx,fz),want=Math.atan2(fx,fz);let da=want-P.heading;da=Math.atan2(Math.sin(da),Math.cos(da));
    inputRoll=Math.max(-1,Math.min(1,da*steerSign*2.5));   // on the water the stick turns the heading the same way (heading += stick); the sign was wrong and only a dinghy already alongside passed (the stop point varies with the random wind)
    P.throttle=dd>100&&Math.abs(da)<.5&&P.spd<5?.3:0;   // a taxiing boat turns first (the water rudders work at a crawl), then creeps - she must not charge across the river into the bank
    updateFlight(dt);updateSites(dt);updateEuropeOperation(dt);
   }
   inputRoll=0;
   out.taxi={t:r1(t1),phase:sts.phase,alive:P.alive,crash:window.__crash,spd:r1(P.spd),dist:Math.round(Math.hypot(P.pos.x-sts.fig.position.x,P.pos.z-sts.fig.position.z)),text:objectiveText()};
   // the dinghy comes alongside, the airman boards (6 s hold)
   let t2=0,hatchMax=0;
   for(;t2<80&&sts.phase!=='home'&&P.alive;t2+=dt){P.throttle=0;P.spd=0;updateFlight(dt);updateSites(dt);updateEuropeOperation(dt);posePlayerAircraft(dt);const h=playerModel.getObjectByName('BlisterHatchRight');if(h){const q=new THREE.Quaternion().fromArray(h.userData.rigRest);hatchMax=Math.max(hatchMax,q.angleTo(h.quaternion));}}
   out.boarded={t:r1(t2),phase:sts.phase,rescued:sortieKills.rescued||0,score,fig:!!(sts.fig&&sts.fig.visible),hatchMaxDeg:r1(deg(hatchMax)),text:objectiveText(),flightLeft:Object.keys(objectiveLeft()).length,said:said.filter(s=>/AIRMAN|FIGHTERS/.test(s)).length};
   // take off from the water along the longer half of the stretch (fully loaded with the airman: same data sheet)
   const run=h=>waterRun(P.pos.x,P.pos.z,h,1800);let h1=hdg,h2=hdg+Math.PI;const l1=run(h1),l2=run(h2);P.heading=l1>=l2?h1:h2;out.run={l1,l2};
   let off=null,t3=0;P.throttle=1;const x0=P.pos.x,z0=P.pos.z;
   for(;t3<120&&P.alive;t3+=dt){const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;
    updateFlight(dt);updateSites(dt);updateEuropeOperation(dt);
    if(!P.onGround&&off==null){off=t3;out.run.dist=Math.round(Math.hypot(P.pos.x-x0,P.pos.z-z0));inputPitch=.4;}
    // after lift-off a pilot follows the river (a straight line leaves it at the next bend, into the wooded bank): look for the longest water ahead every half second and bank towards it
    if(off!=null){if(Math.round((t3-off)*60)%30===0){let best=P.heading,bl=-1;for(const dh of [-.6,-.4,-.2,0,.2,.4,.6]){const l=run(P.heading+dh);if(l>bl+30){bl=l;best=P.heading+dh;}}P.__want=best;}
     if(P.__want!=null){let da=P.__want-P.heading;da=Math.atan2(Math.sin(da),Math.cos(da));inputRoll=Math.max(-.5,Math.min(.5,da*steerSign*2));}}   // positive stick = larger heading (measured: +0.4 stick turns +64 deg in 5 s); the old sign steered away from the river and hit the trees
    if(off!=null&&t3-off>14)break;}
   const hunters=enemyAir.filter(e=>e.alive&&e.sortie);
   out.takeoff={off:off==null?null:r1(off),alive:P.alive,crash:window.__crash,climb:r1(P.vSpeed),hunters:hunters.length,hunterAc:hunters[0]&&hunters[0].kind,huntLeft:sts.hunt&&sts.hunt.t,floatsOut:null};
   // the hunters never block the return
   out.block=blockingEnemyAir().length;
   // home: wheels down, a flown final onto the Allied strip, the landing ends the sortie
   P.gearTgt=1;P.gear=1;P.flap=0;P.onGround=false;P.landingRoll=null;P.touchResolved=false;P.departureAge=null;P.heading=Math.PI/2;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;P.pitchRef=null;P.coreStall=0;P.coreDrop=0;P.core=null;P.groundPose=null;P.takeoffRotation=0;
   const aim=AF_X-200,slope=Math.tan(3*Math.PI/180),sp=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app);
   P.pos.set(aim-500,Math.max(groundY(aim,AF_Z)+500*slope,groundY(aim-500,AF_Z)+25),AF_Z);P.spd=sp.reference;P.vSpeed=-1.4;P.throttle=.4;
   let td=null;
   for(let t=0;t<140&&P.alive&&!missionOver;t+=dt){const agl=P.pos.y-groundY(P.pos.x,P.pos.z);
    if(!P.onGround){inputPitch=Math.max(-.5,Math.min(.5,((agl<6?-.8:Math.max(-2.6,-1.2-(P.pos.y-(groundY(aim,AF_Z)+Math.max(0,aim-P.pos.x)*slope))*.2))-P.vSpeed)*.18));P.throttle=agl>6?Math.max(0,Math.min(1,.35+(sp.reference-P.spd)*.12)):0;}
    else{if(td==null)td={t:r1(t),spd:r1(P.spd),x:Math.round(P.pos.x-AF_X)};inputPitch=0;P.throttle=0;}
    updateFlight(dt);updateSites(dt);updateEuropeOperation(dt);}
   out.home={td,alive:P.alive,crash:window.__crash,over:missionOver,landing:!!P.landingRoll,onGround:P.onGround,result:(document.getElementById('result')?.textContent||'').slice(0,160),score};
   return out;
  });
  report.dumbo=D;console.log(JSON.stringify(D));
  assert.ok(D.start.ac==='pby'&&D.start.onGround&&D.start.kind==='dumbo'&&D.start.phase==='fly'&&D.start.fig&&D.start.strip>=1000,'Dumbo starts on the strip with a dinghy on a flat stretch of the river: '+JSON.stringify(D.start));
  assert.ok(D.start.dinghyOnWater&&Math.abs(D.start.figY)<.6,'the dinghy rides on the river surface: '+JSON.stringify([D.start.dinghyOnWater,D.start.figY]));assert.ok(D.start.bombs===0&&D.start.rockets===0,'the rescue flight carries no bombs: '+JSON.stringify([D.start.bombs,D.start.rockets]));
  assert.ok(D.start.key==='pby'&&/ALIGHT ON THE RIVER|RIVER/.test(D.start.text),'daytime paint and the objective line: '+JSON.stringify([D.start.key,D.start.text]));
  assert.ok(D.alight.touch&&D.alight.touch.wet&&D.alight.alive&&!D.alight.crash&&!D.alight.over&&D.alight.onWater,'she alights on the river and the sortie goes on: '+JSON.stringify(D.alight));
  assert.ok(D.taxi.alive&&!D.taxi.crash&&(D.taxi.phase==='run'||D.taxi.phase==='home')&&D.taxi.dist<=95,'the engines take her to the dinghy and she holds still: '+JSON.stringify(D.taxi));
  assert.ok(D.boarded.phase==='home'&&D.boarded.rescued===1&&D.boarded.t>5&&D.boarded.t<50&&D.boarded.score>=600&&!D.boarded.fig&&D.boarded.hatchMaxDeg>20&&/AIRMAN ABOARD/.test(D.boarded.text),'the airman is hauled aboard through the open hatch: '+JSON.stringify(D.boarded));
  assert.ok(D.takeoff.off!=null&&D.takeoff.alive&&!D.takeoff.crash&&D.run.dist<Math.max(D.run.l1,D.run.l2),'she takes off from the water inside the stretch: '+JSON.stringify([D.run,D.takeoff]));
  assert.ok(D.takeoff.hunters>=1&&D.takeoff.hunterAc==='bf109'&&D.block===0,'German fighters come after the airman is aboard and never block the return: '+JSON.stringify([D.takeoff,D.block]));
  assert.ok(D.home.td&&D.home.alive&&!D.home.crash&&D.home.over&&/airman is home/i.test(D.home.result),'the landing at Beaufort ends the sortie with the airman home: '+JSON.stringify(D.home));

  // ---- 2. Bonus Black Cat: night paint, two bombs, the ferry, a bomb that hits ----
  const B=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};
   begin('blackcat');
   const ferry=targets.find(t=>t.kind==='ferry'&&t.alive);
   out.start={ac:P.ac,night:!!M().night,key:modelKey('pby'),bombs:P.bombs,gear:r1(P.gear),ferry:!!ferry,primary:ferry&&ferry.primary,flares:flareSupport&&flareSupport.night,text:objectiveText(),flak:flakUnits.length,hp0:ferry&&ferry.hp};
   if(!ferry)return out;
   // a flown bomb run: level over the ferry at 70 m, bomb away
   const p=ferry.group.position;P.onGround=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.gear=P.gearTgt=0;P.heading=0;P.pitch=0;P.roll=0;P.pitchVel=P.rollVel=0;P.core=null;P.coreStall=0;P.groundPose=null;P.spd=0;P.vSpeed=0;
   P.pos.set(p.x,p.y+70,p.z);const b0=P.bombs,sc0=score;
   dropBomb();out.dropped=b0-P.bombs;
   for(let t=0;t<8&&bombs.length;t+=dt){P.pos.set(p.x,p.y+70,p.z);updateOrdnance(dt);updateTargets(dt);updateExplosions(dt);}
   out.hit={alive:ferry.alive,hp:ferry.hp,ferry:sortieKills.ferry||0,gain:score-sc0,left:Object.keys(objectiveLeft()).length,text:objectiveText(),bombs:P.bombs};
   return out;
  });
  report.blackcat=B;console.log(JSON.stringify(B));
  assert.ok(B.start.ac==='pby'&&B.start.night&&B.start.key==='pbyn'&&B.start.bombs===2&&B.start.ferry&&B.start.flares,'Black Cat: night paint, two bombs, the ferry and the flares: '+JSON.stringify(B.start));
  assert.ok(B.dropped===1&&(B.hit.ferry===1||!B.hit.alive||B.hit.hp<B.start.hp0),'a 500 lb bomb on the ferry: '+JSON.stringify(B.hit));
  assert.deepEqual(errors,[],'no page error: '+errors.join(' | '));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/catalina-missions-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Catalina missions WebGL: Dumbo (alighting, taxi, pickup, water take-off, hunters, home) and Black Cat (night paint, bombs, ferry) passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
