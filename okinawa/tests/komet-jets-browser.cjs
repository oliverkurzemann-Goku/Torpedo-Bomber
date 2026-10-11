/* Native game/GLBs: bomber kill -> rocket cutoff -> skid touchdown -> debrief,
 * metered Komet roll and Me262 slow rotation/fast climb. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Komet/jet native regression: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/remagen-mission.html'){const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?campaign=1&v=184');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:100});
  await page.evaluate(async()=>{renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;for(const kind of ['me163','me262','b17','p47'])await ensureModel(kind);});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const id of ['komet','kometdash'])for(const fps of [20,60,120]){
   const result=await page.evaluate(({id,fps})=>{
    const logBefore=loadLog().sorties||0;startMission(MISSIONS.findIndex(m=>m.id===id));finishLaunchIntro(false);
    show('menu',false);show('brief',false);show('result',false);refreshModels();state=ST.FLIGHT;
    const original=(group,kind)=>{const geometries=new Set();modelTpl[kind]?.traverse(o=>{if(o.isMesh)geometries.add(o.geometry);});let matches=0;group.traverse(o=>{if(o.isMesh&&geometries.has(o.geometry))matches++;});return matches>0;};
    if(!original(playerModel,'me163'))throw Error('Original Komet not attached');
    const bombers=enemyAir.filter(e=>e.bomber),count=bombers.length;
    if(bombers.some(e=>!original(e.group,'b17')))throw Error('Original bomber not attached');
    P.pos.copy(bombers[0].pos).add(new THREE.Vector3(0,200,600));P.onGround=false;P.spd=155;P.throttle=.65;
    P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.pitch=P.roll=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;
    for(let i=0;i<fps*3;i++){updateFlight(1/fps);updateEuropeOperation(1/fps);}
    const fuelBefore=P.fuel;P.ammo=42;
    for(const e of bombers)damageEnemyAir(e,e.hp+1);
    for(let i=0;i<fps;i++){updateFlight(1/fps);updateEuropeOperation(1/fps);}
    const cleared=europeOps.ready()&&P.rtb,cutoff=P.fuel===0&&P.throttle===0;
    const pursuers=enemyAir.filter(e=>e.alive&&e.escapeThreat).length;
    // Fly a real gentle skid touchdown on the DEM strip, rather than call landed().
    P.pos.set(AF_X-200,groundY(AF_X-200,AF_Z)+7,AF_Z);P.heading=RWY_HDG;P.spd=68;
    P.gear=P.gearTgt=1;P.flap=P.flapTgt=.5;P.pitch=-.025;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.touchResolved=false;
    inputPitch=-Math.pow(.025/(AC.me163.pitchLim*.92),1/AC.me163.stickExponent);inputRoll=0;
    for(let i=0;i<fps*15&&!P.onGround&&P.alive;i++){updateFlight(1/fps);updateEuropeOperation(1/fps);}
    // A phantom service cycle must not refill this recovered aircraft.
    sortieService.update(20);
    return {id,fps,count,fuelBefore,cleared,cutoff,pursuers,alive:P.alive,onGround:P.onGround,missionOver,
     service:fieldServicePending||sortieService.active,fuel:P.fuel,ammo:P.ammo,sorties:(loadLog().sorties||0)-logBefore,
     title:document.getElementById('rsTitle').textContent};
   },{id,fps});
   assert(result.fuelBefore>0&&result.cleared&&result.cutoff&&result.pursuers===1,'last powered kill releases the recovery');
   assert(result.alive&&result.onGround&&result.missionOver&&!result.service&&result.fuel===0&&result.ammo===42&&result.sorties===1,'native skid touchdown finishes once without refuelling');
   assert.equal(result.title,'MISSION ACCOMPLISHED');console.log('Native Komet recovery:',result);
   if(fps===60)await page.screenshot({path:path.join(out,'build184-'+id+'-debrief.png')});
  }
  const handling=await page.evaluate(()=>{
   startMission(MISSIONS.findIndex(m=>m.id==='kometdash'));finishLaunchIntro(false);show('menu',false);show('brief',false);show('result',false);
   const d=AC.me163,saved={...d},samples=[];
   const run=(fps,aero,old,sign)=>{
    Object.assign(d,saved);if(old)Object.assign(d,{rollAuth:1.48,pitchAuth:1.16,stickExponent:undefined,controlDamping:undefined,aeroResponse:undefined});
    P.pos.set(AF_X,2000,AF_Z);P.onGround=false;P.alive=true;P.spd=155;P.fuel=100;P.throttle=.65;
    P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.roll=P.pitch=P.rollBias=P.rollVel=P.pitchVel=0;P.heading=0;P.hull=d.hull;
    aeroMode=aero;inputRoll=sign*.5;inputPitch=.25;
    for(let i=0;i<fps*.5;i++)updateFlight(1/fps);
    return {bank:Math.abs(P.roll)*180/Math.PI,heading:Math.abs(P.heading)*180/Math.PI};
   };
   try{for(const aero of [false,true])for(const fps of [20,60,120])for(const sign of [-1,1]){
    const old=run(fps,aero,true,sign),now=run(fps,aero,false,sign);samples.push({aero,fps,sign,old,now});
   }}finally{Object.assign(d,saved);}
   return samples;
  });
  assert(handling.every(s=>s.now.bank>s.old.bank*.3&&s.now.bank<s.old.bank*.8&&s.now.heading<s.old.heading*.8),'native Komet inputs start both turns progressively');
  console.log('Native Komet half-second inputs:',handling.filter(s=>s.fps===60&&s.sign===1));
  const jets=await page.evaluate(()=>{
   const samples=[];
   for(const fps of [20,60,120]){
    startMission(MISSIONS.findIndex(m=>m.ac==='me262'));finishLaunchIntro(false);show('menu',false);show('brief',false);
    P.throttle=1;inputPitch=1;inputRoll=0;let time=0,rotation=null,lowPitch=0,lowVS=0;
    while(time<40&&P.alive){updateFlight(1/fps);time+=1/fps;if(!P.onGround){if(rotation===null)rotation=time;if(P.spd<=80){lowPitch=Math.max(lowPitch,P.pitch);lowVS=Math.max(lowVS,P.vSpeed);}if(time-rotation>=8)break;}}
    samples.push({fps,type:'departure',alive:P.alive,rotation,pitch:lowPitch*180/Math.PI,vs:lowVS,ground:P.onGround});
    startMission(MISSIONS.findIndex(m=>m.ac==='me262'));finishLaunchIntro(false);
    P.onGround=false;P.pos.set(AF_X,2000,AF_Z);P.spd=200;P.throttle=1;P.gear=P.gearTgt=P.flap=P.flapTgt=0;
    P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=1;inputRoll=0;
    for(let i=0;i<fps*2;i++)updateFlight(1/fps);
    samples.push({fps,type:'fast',alive:P.alive,pitch:P.pitch*180/Math.PI,vs:P.vSpeed,speed:P.spd});
   }
   return samples;
  });
  assert(jets.every(s=>s.alive&&(s.type==='departure'?s.rotation>12&&s.rotation<35&&s.pitch<14&&s.vs<15&&!s.ground:s.pitch>45&&s.vs>100&&s.speed>140)),'native Me262 retains slow departure, regains fast climb');
  console.log('Native Me262 slow/fast climb:',jets);
  await page.evaluate(()=>{posePlayerAircraft(0);for(let i=0;i<120;i++)updateCamera(.05);setThrottleUI(P.throttle);resetCtlUI();updateHUD();drawMinimap();document.getElementById('flash').classList.remove('show');updateContentVisibility(P.pos.x,P.pos.z);scene.updateMatrixWorld(true);renderer.render(scene,camera);});
  await page.screenshot({path:path.join(out,'build184-me262-fast-climb.png')});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
