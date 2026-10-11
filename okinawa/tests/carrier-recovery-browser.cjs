/* Real selected models + actual game functions. No simplified substitute simulation. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Carrier recovery WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/torpedo-carrier.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=186');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(async()=>{
   await prepareOkinawa();for(const kind of ['avenger','sbd','corsair','zero']){
    const m=MISSIONS.find(m=>kind==='avenger'?!m.sbd&&!m.defend&&!m.free&&!m.qual:kind==='zero'?m.defend:kind==='corsair'?m.corsair:m.sbd&&!m.corsair);
    await preparePacificModels(m);
   }
   renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;
  });
  for(const kind of ['avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
   const result=await page.evaluate(({kind,fps})=>{
    function setup(late){
     const index=MISSIONS.findIndex(m=>kind==='avenger'?!m.sbd&&!m.defend&&!m.free&&!m.qual:kind==='zero'?m.defend:kind==='corsair'?m.corsair:m.sbd&&!m.corsair);
     startMission(index);finishCarrierIntro();state=ST.FLIGHT;hideOverlays();DIFF='ace';P.alive=true;P.rtb=true;
     for(const s of ships)s.alive=false;raiders=[];etorps=[];enemyBombs=[];shoreTargets=[];pacificOps=null;
     windHead=6;windZ=0;windGust=0;seaState=0;P.heading=0;P.pitch=-.06;P.roll=0;P.pitchVel=P.rollVel=0;
     P.flap=P.flapTgt=P.gear=P.gearTgt=P.hook=P.hookTgt=1;P.spd=40;P.throttle=.275;
     inputPitch=P.pitch/.70;inputRoll=0;P.pos.set(carrierX+(late?-8:-80),30,0);updatePlaneMesh(0);
     P.pos.y=carrierContactHeight()+.55;updatePlaneMesh(0);
    }
    function step(){
     const dt=1/fps;carrierX+=5*dt;CARRIER_SPD=5;carrier.position.x=carrierX;
     for(const cm of [carrierModel,ijnCarrierModel])if(cm){cm.position.x=carrierX;cm.rotation.x=cm.rotation.z=0;}
     updateFlight(dt);updatePlaneMesh(dt);
    }
    setup(true);let contact=false,framesOnDeck=0,maxGap=0,minGap=Infinity,lastGap=0,peakStep=0,deckStep=0,firstSpeed=null,bolterSpeed=null;
    const originalBolter=bolter;bolter=msg=>{firstSpeed=P.spd;originalBolter(msg);bolterSpeed=P.spd;};
    for(let i=0;i<fps*7;i++){
     const oldY=P.pos.y,oldSpeed=P.spd;step();peakStep=Math.max(peakStep,P.pos.y-oldY);
     if(P.deckRun){inputPitch=.15;contact=true;framesOnDeck++;deckStep=Math.max(deckStep,P.pos.y-oldY);lastGap=0;
      const model=isDefend()?playerZero:isSBD()?playerSBD:planeGroup;
      const supports=AircraftGround.supports(model,'carrier'),v=new THREE.Vector3();
      for(const vertices of supports){let low=null;for(let k=0;k<vertices.length;k+=3){v.fromArray(vertices,k).applyQuaternion(planeGroup.quaternion);if(!low||v.y<low.y)low=v.clone();}
       low.add(planeGroup.position);const gap=low.y-carrierDeckHeight(low.x,low.z);minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);lastGap=Math.max(lastGap,gap);
      }
     }
     if(!P.alive||state===ST.RESULT)throw Error('Late touchdown killed/recovered instead of boltering '+JSON.stringify({kind,fps,i,state,alive:P.alive,pos:P.pos.toArray(),pitch:P.pitch,speed:P.spd,contact:P.touchResolved,run:P.deckRun,ref:carrierContactHeight(),result:document.getElementById('result')?.textContent}));
    }
    if(!contact||framesOnDeck<fps*.6||P.deckRun||P.onDeck||P.pos.y<carrierDeckHeight(P.pos.x,P.pos.z))throw Error('Missing powered deck run/liftoff '+kind+' '+fps);
    bolter=originalBolter;
    if(minGap<-.025||lastGap>.15||deckStep>.3||Math.abs(bolterSpeed-firstSpeed)>.00001)throw Error('Penetration/teleport/speed injection '+JSON.stringify({kind,fps,minGap,maxGap,lastGap,deckStep,peakStep,firstSpeed,bolterSpeed}));
    if(P.bolters!==1||Math.abs(P.pos.z)>.001)throw Error('Repeated bolter/crosswind drift');
    const late={framesOnDeck,minGap,lastGap,deckStep,peakStep,bolters:P.bolters};
    setup(false);for(let i=0;i<fps*3&&state===ST.FLIGHT;i++)step();
    if(state!==ST.RESULT||!P.landingSample||P.landingSample.speed<38||P.landingSample.speed>42||P.spd!==0)throw Error('Good touchdown did not arrest/record speed '+kind+' '+fps);
    const before=P.pos.clone();for(let i=0;i<fps;i++)updatePlaneMesh(1/fps);
    if(P.pos.y<carrierContactHeight(P.deckQuaternion)-.001||Math.abs(P.pos.y-before.y)>1)throw Error('Trapped aircraft sinks/jumps');
    const sample={...P.landingSample,grade:lastGrade};
    P.onDeck=false;state=ST.FLIGHT;P.pos.y=120;P.flap=1;P.spd=27;updateHUD();
    const low=document.getElementById('hSpd').classList.contains('lowSpeed'),ref=document.getElementById('landingRef').textContent;
    P.spd=40;updateHUD();const clear=!document.getElementById('hSpd').classList.contains('lowSpeed');
    if(!low||!clear||!ref.includes('REF 78 KT'))throw Error('Stall/ref HUD missing');
    return {kind,fps,late,sample,reference:ref};
   },{kind,fps});console.log('Actual model recovery:',result);
  }
  const ship=await page.evaluate(()=>{
   startMission(MISSIONS.findIndex(m=>m.theater==='reserve'));finishCarrierIntro();state=ST.FLIGHT;hideOverlays();P.pos.set(-2000,200,3000);
   const s=ships.find(s=>s.def.type==='freighter');s.def={...s.def,hp:5};s.hp=5;s.speed=5;s.fwd=new THREE.Vector3(0,0,1);s.wakeT=0;
   s.group.updateMatrixWorld(true);const point=s.group.localToWorld(new THREE.Vector3(0,1,0));
   hitShip(s,true,point,'torpedo');for(let i=0;i<600;i++)updateShips(1/60);
   const performance=shipDamage.performance(s),status=shipDamage.status(s),drive=s.driveMultiplier;
   if(performance.speed>=.5||drive>=.51||!status.includes('ENGINE'))throw Error('Engine zone has no movement effect');
   // Sufficient repeated stern cannon hits impair steering without sinking the hull.
   const d=shipDamage.get(s),stern=s.group.localToWorld(new THREE.Vector3(0,1,d.box.min.z+3));
   for(let i=0;i<240;i++)shipDamage.systemHit(s,stern,'shell',.008);
   if(shipDamage.performance(s).steering>=.75||s.hp!==4)throw Error('Rudder system not separate from HP');
   const carrier=ships.find(s=>s.def.type==='cruiser');
   return {performance,drive,status,rudder:shipDamage.performance(s).steering};
  });console.log('Actual ship engine/rudder:',ship);
  const reserve=await page.evaluate(()=>{
   startMission(MISSIONS.findIndex(m=>m.theater==='reserve'));finishCarrierIntro();state=ST.FLIGHT;hideOverlays();
   const starting=P.fuel,noWingmen=MISSIONS[mission].solo===true;
   for(const s of ships.filter(s=>!s.def.optional))hitShip(s,false,s.group.position,'bomb');
   for(let i=0;i<240;i++)updatePacificOperation(1/60);
   return {starting,noWingmen,rtb:P.rtb,weather,notes:pacificRecoveryText()};
  });console.log("Reserve proof",reserve);assert.equal(reserve.starting,42);assert(reserve.noWingmen&&reserve.rtb&&reserve.weather==='rain');console.log('Fuel-reserve return:',reserve);
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  await page.evaluate(()=>{P.pos.set(carrierX-330,42,0);P.heading=0;P.pitch=-.06;P.roll=0;P.spd=40;P.flap=P.gear=P.hook=1;P.onDeck=false;P.deckRun=null;updatePlaneMesh(0);updateHUD();camera.position.copy(P.pos).add(new THREE.Vector3(-24,6,0));camera.lookAt(P.pos.clone().add(new THREE.Vector3(30,-1.8,0)));updateLSO();scene.updateMatrixWorld(true);renderer.render(scene,camera);});
  await page.screenshot({path:path.join(out,'build186-carrier-final.png')});
  await page.evaluate(()=>{P.spd=27;updateHUD();});await page.screenshot({path:path.join(out,'build186-low-speed.png')});
  assert.deepEqual(errors,[]);console.log('Build186 native 12 late/12 valid landings, actual ship systems, fuel-reserve return and visible speed cues passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
