/* Build 231: the Pacific surprise events in the real game (torpedo-carrier.html) - the armed merchant that stays silent
 * until the attack is on top of it, the destroyer the briefing never showed, the Zeros out of the sun and the magazine
 * explosion. Checked: really shooting, never counting for an objective (the extra destroyer is optional), the sea
 * placement, the blast hurting when close, the difficulty (Rookie merchant slower, 1 Zero instead of 2), the budget per
 * sortie, a clean restart and ?surprises=off.
 * Writes app/release/surprises-pacific-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Surprises WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const GAMES=process.env.GAME_TEST_RHINE_ONLY?['rhine']:process.env.GAME_TEST_PACIFIC_ONLY?['pac']:['pac','rhine'];
if(process.env.GAME_TEST_RHINE_ONLY){console.log('Pacific surprises: skipped (Rhine only).');process.exit(0);}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const base='http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?campaign=1';
  await page.goto(base+'&v=surprises');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(async()=>{
   await prepareOkinawa();
   const m=MISSIONS.find(m=>!m.sbd&&!m.corsair&&!m.defend&&!m.free&&!m.qual&&!m.shoreStrike&&m.targets?.length);await preparePacificModels(m);
   if(!destroyerTemplate)await loadDestroyerModel();
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
  });
  for(const diff of ['rookie','veteran','ace']){
   report[diff]=await page.evaluate(async diff=>{
    DIFF=diff;
    const index=MISSIONS.findIndex(m=>!m.sbd&&!m.corsair&&!m.defend&&!m.free&&!m.qual&&!m.shoreStrike&&m.targets?.length&&m.targets.some(t=>t.type==='freighter'));
    const dt=1/60;
    const begin=async()=>{selectedMission=index;await launchCampaignMission(index);launch();
     await new Promise(r=>{const t=setInterval(()=>{updatePlaneMesh(0);if(carrierAircraftReady()){clearInterval(t);r();}},100);});
     finishCarrierIntro();clock.getDelta=()=>dt;GameRuntime.render=()=>true;state=ST.FLIGHT;P.alive=true;P.gear=P.gearTgt=0;P.spd=75;};
    await begin();
    const r={level:DIFF,have:!!surprises,mission:MISSIONS[index].title};
    const prim=surprisePrimaries(),s0=prim[0],primCount=prim.length;
    const at=(s,back,y)=>{P.pos.set(s.group.position.x-back,y,s.group.position.z);P.heading=Math.PI/2;P.pitch=0;P.roll=0;};
    // --- armed merchant
    const target=surprisePrimaries().find(s=>!s.flak);
    at(target,5000,40);
    r.f1=surprises.force('qship',surpriseContext());
    r.q0={qship:!!target.qship,flak:target.flak,ease:+(target.flakEase||0).toFixed(2)};
    updateSurprises(.05);r.q1={revealed:!!target.qRevealed};
    at(target,1500,40);updateSurprises(.05);
    r.q2={revealed:!!target.qRevealed,flak:target.flak};
    const t0=tracers.length;for(let i=0;i<160;i++){P.pos.y=70;updateFlak(.05);}
    r.qTracers=tracers.length-t0;
    // --- the destroyer the briefing never showed
    const before=JSON.stringify({prim:primCount,clear:pacificTargetsClear()});
    r.f2=surprises.force('reinforce',surpriseContext());
    const dd=ships.find(s=>s.def.surprise);
    r.dd=dd?{type:dd.def.type,optional:dd.def.optional,flak:dd.flak,sea:surpriseSea(dd.group.position.x,dd.group.position.z),ease:+dd.flakEase.toFixed(2),
      dist:Math.round(Math.hypot(dd.group.position.x-target.group.position.x,dd.group.position.z-target.group.position.z))}:null;
    r.objectiveUnchanged=before===JSON.stringify({prim:surprisePrimaries().length,clear:pacificTargetsClear()});
    // --- Zeros out of the sun
    at(target,3000,60);
    const zb=zeros.length;r.f3=surprises.force('zeroBounce',surpriseContext());
    const fresh=zeros.filter(z=>z.surprise);
    const f=horizontalNose();
    r.zero={n:fresh.length,engaged:fresh.every(z=>z.engaged),behind:fresh.every(z=>(z.pos.x-P.pos.x)*f.x+(z.pos.z-P.pos.z)*f.z<-1500),high:fresh.every(z=>z.pos.y>P.pos.y+250)};
    for(let i=0;i<60;i++)updateZeros(.05);
    r.zeroOk=fresh.every(z=>Number.isFinite(z.pos.x)&&Number.isFinite(z.pos.y));
    // --- the magazine
    const ship=surprisePrimaries()[0];
    at(ship,60,35);P.hull=100;
    let ok=false,tries=0;while(!ok&&tries++<80)ok=surprises.trigger('magazine',{ship,dist:60,agl:35});
    for(let i=0;i<24;i++)surprises.update(.1,surpriseContext());
    r.magazine={fired:ok,tries,hullLost:+(100-P.hull).toFixed(1)};
    // --- the scheduler: 14 flight minutes near the target
    await begin();
    const tg=surprisePrimaries()[0];
    for(let t=0;t<840;t+=.05){P.hull=P.systemDamage?.maxHull||100;at(tg,2600,45);updateSurprises(.05);}
    r.scheduled=surprises.report();
    // --- restart: nothing left over
    const keep=ships.length;
    await begin();
    r.cleanup={surpriseShips:ships.filter(s=>s.def.surprise).length,surpriseZeros:zeros.filter(z=>z.surprise).length,qship:ships.filter(s=>s.qship).length,time:surprises.time,fired:surprises.report().fired.length};
    return r;
   },diff);
   const r=report[diff];console.log(JSON.stringify(r));
   assert.ok(r.have,'the scheduler exists');
   assert.ok(r.f1&&r.q0.qship&&r.q0.flak===false&&r.q0.ease>0,'an armed merchant is marked, silent at first '+JSON.stringify(r.q0));
   assert.equal(r.q1.revealed,false,'not revealed from 5 km');assert.ok(r.q2.revealed&&r.q2.flak,'it opens fire at 1.5 km');
   assert.ok(r.qTracers>0,'and really shoots ('+r.qTracers+' tracers)');
   assert.ok(r.f2&&r.dd&&r.dd.type==='destroyer'&&r.dd.optional&&r.dd.flak&&r.dd.sea,'a destroyer on open water '+JSON.stringify(r.dd));
   assert.ok(r.dd.dist>1800&&r.dd.dist<3200,'a couple of km from the convoy '+r.dd.dist);
   assert.ok(r.objectiveUnchanged,'the extra destroyer is optional: the objective is unchanged');
   assert.ok(r.f3&&r.zero.n===(diff==='rookie'?1:2)&&r.zero.engaged&&r.zero.behind&&r.zero.high,'Zeros out of the sun '+JSON.stringify(r.zero));assert.ok(r.zeroOk);
   assert.ok(r.magazine.fired&&r.magazine.hullLost>0,'the blast hurts when close '+JSON.stringify(r.magazine));
   assert.ok(r.scheduled.fired.length>=1&&r.scheduled.fired.length<=({rookie:2,veteran:3,ace:4})[diff],'the scheduler stays in budget '+JSON.stringify(r.scheduled));
   assert.equal(r.cleanup.surpriseShips,0);assert.equal(r.cleanup.surpriseZeros,0);assert.equal(r.cleanup.qship,0);assert.equal(r.cleanup.time,0);assert.equal(r.cleanup.fired,0,'a restart starts a new plan');
  }
  assert.ok(report.rookie.q0.ease>report.ace.q0.ease,'the Rookie merchant is slower than the Ace one');
  await page.goto(base+'&surprises=off&v=surprises');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  report.off=await page.evaluate(async()=>{await prepareOkinawa();const m=MISSIONS.find(m=>m.targets?.length&&!m.defend);await preparePacificModels(m);selectedMission=MISSIONS.indexOf(m);await launchCampaignMission(selectedMission);return {surprises};});
  assert.equal(report.off.surprises,null,'?surprises=off');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/surprises-pacific-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Surprises browser (Pacific): OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
