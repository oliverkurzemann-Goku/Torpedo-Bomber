/* Real aircraft, real mission selection, service/departure camera and terrain.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Water, crews, takeoff and ditching: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(['/remagen-mission.html','/torpedo-carrier.html'].includes(url.pathname)){const html=fs.readFileSync(path.join(root,url.pathname.slice(1)),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  const origin='http://127.0.0.1:'+server.address().port;


  await page.goto(origin+'/torpedo-carrier.html?v=182');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
    renderer.setPixelRatio(.65);renderer.shadowMap.enabled=false;clock.getDelta=()=>.05;
    await prepareOkinawa();
    for(const kind of ['avenger','sbd','corsair','zero']){
      const m=MISSIONS.find(m=>kind==='sbd'?m.sbd&&!m.corsair:kind==='corsair'?m.corsair:kind==='zero'?m.defend:!m.sbd&&!m.corsair&&!m.defend);
      await preparePacificModels(m);
    }
  });
  for(const kind of ['avenger','sbd','corsair','zero'])for(const sinkFpm of [100,200])for(const difficulty of ['rookie','ace']){
    const result=await page.evaluate(({kind,sinkFpm,difficulty})=>{
      DIFF=difficulty;const i=MISSIONS.findIndex(m=>kind==='sbd'?m.sbd&&!m.corsair:kind==='corsair'?m.corsair:kind==='zero'?m.defend:!m.sbd&&!m.corsair&&!m.defend);
      startMission(i);finishCarrierIntro();state=ST.FLIGHT;hideOverlays();
      P.alive=true;P.hull=sinkFpm===200?30:100;P.pos.set(-1500,2,0);P.spd=65/KT;
      P.gear=P.gearTgt=0;P.flap=P.flapTgt=1;P.hook=P.hookTgt=1;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;
      const sink=-sinkFpm*.3048/60,liftLoss=(1-P.spd**2/(APP_SPD-6)**2)*28;
      P.pitch=Math.asin((sink+liftLoss)/P.spd);inputPitch=P.pitch/.70;inputRoll=0;
      const engineMul=(P.hull<60?.45+.55*P.hull/60:1)*SortieFeatures.Damage.power(P);
      P.throttle=((P.spd+Math.sin(P.pitch)*38+9)/engineMul-THR_MIN_SPD)/((isCorsair()?145:MAX_SPD)-THR_MIN_SPD);
      const power=P.throttle;let steps=0,contactSpeed=null,contactSink=null;const enter=beginDitching;beginDitching=()=>{contactSpeed=P.spd*KT;contactSink=-P.vSpeed*60/.3048;enter();};
      try{while(P.alive&&steps++<250)updateFlight(.02);}finally{beginDitching=enter;}
      if(!ditching||!bailRescue)throw Error('65kt '+sinkFpm+'fpm gear-up / flaps-down / hook-down rejected: '+kind+' '+difficulty+' '+document.getElementById('flash')?.textContent);
      const crew=[bailout,...crewBailouts.map(c=>c.chute)];if(crew.some(c=>c.deployed))throw Error('Ditching opened a chute');
      let boats=scene.children.filter(o=>o.name==='rescueBoat').length;
      const p=P.pos.clone(),time=ditching.time;togglePause();animate();const paused=p.equals(P.pos)&&time===ditching.time;togglePause();
      for(let j=0;j<1800&&!bailDone;j++){advanceBailout(.05);boats=Math.max(boats,scene.children.filter(o=>o.name==='rescueBoat').length);}
      const recovered=Number(bailRescue.pickup)+crewBailouts.filter(c=>c.safe).length,count=aircraftCrewCount();
      return {kind,sinkFpm,difficulty,power,steps,contactSpeed,contactSink,crew:count,recovered,boats,paused,done:bailDone};
    },{kind,sinkFpm,difficulty});
    assert(Math.abs(result.contactSpeed-65)<.1&&Math.abs(result.contactSink-sinkFpm)<2&&result.done&&result.recovered===result.crew&&result.boats===1&&result.paused,'one boat recovers all crew after actual slow sea contact');
    console.log('User ditching configuration:',result);
  }
  for(const kind of ['avenger','sbd']){
    const result=await page.evaluate(kind=>{
      DIFF='ace';startMission(MISSIONS.findIndex(m=>kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.corsair&&!m.defend));
      finishCarrierIntro();state=ST.FLIGHT;hideOverlays();P.alive=true;P.hull=100;P.pos.set(-2200,300,0);P.heading=0;P.spd=65/KT;
      P.gear=P.gearTgt=P.hook=P.hookTgt=0;P.flap=P.flapTgt=1;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;
      P.pitch=Math.asin((-.8+(1-P.spd**2/(APP_SPD-6)**2)*28)/P.spd);inputPitch=P.pitch/.7;inputRoll=0;
      P.throttle=(P.spd+Math.sin(P.pitch)*38+9-THR_MIN_SPD)/(MAX_SPD-THR_MIN_SPD);
      wingmenPending=false;spawnWingman(0);spawnWingman(1);for(const w of wingmen)w.cool=9999;
      wingmen[0].pos.copy(P.pos).add(new THREE.Vector3(-12,-2,-22));
      let maxYaw=0,maxBank=0,maxAcceleration=0,minDistance=Infinity,maxDistance=0,png=null;
      for(let i=0;i<2400;i++){
        const t=i/60;inputRoll=t<10?0:t<18?.05:t<26?-.05:0;
        const previous=wingmen.map(w=>({heading:w.heading,roll:w.roll,vel:w.vel.clone(),pos:w.pos.clone()}));
        updateFlight(1/60);updateWingmen(1/60);
        for(let j=0;j<wingmen.length;j++){
          const w=wingmen[j],b=previous[j],d=w.pos.distanceTo(P.pos);
          minDistance=Math.min(minDistance,d);maxDistance=Math.max(maxDistance,d);
          maxYaw=Math.max(maxYaw,Math.abs(Math.atan2(Math.sin(w.heading-b.heading),Math.cos(w.heading-b.heading)))*60);
          maxBank=Math.max(maxBank,Math.abs(w.roll-b.roll)*60);maxAcceleration=Math.max(maxAcceleration,w.vel.distanceTo(b.vel)*60);
          const forward=new THREE.Vector3(0,0,1).applyQuaternion(w.mesh.quaternion);
          if(forward.dot(w.vel.clone().normalize())<.999999)throw Error('Real escort mesh slides sideways');
          if(w.pos.distanceTo(b.pos)>115/60)throw Error('Real escort teleports');
        }
        if(i===1200){updatePlaneMesh(1/60);camera.position.copy(P.pos).add(new THREE.Vector3(-90,20,70));camera.lookAt(P.pos.clone().add(new THREE.Vector3(-25,0,0)));scene.updateMatrixWorld(true);renderer.render(scene,camera);png=renderer.domElement.toDataURL();}
      }
      const before=wingmen.map(w=>w.pos.clone());togglePause();animate();const paused=wingmen.every((w,i)=>w.pos.equals(before[i]));togglePause();
      return {kind,alive:P.alive,escorts:wingmen.length,maxYaw,maxBank,maxAcceleration,minDistance,maxDistance,paused,png};
    },kind);
    fs.writeFileSync(path.join(out,'build182-'+kind+'-formation.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
    assert(result.alive&&result.escorts===2&&result.maxYaw<=.25001&&result.maxBank<=.32001&&result.maxAcceleration<20&&result.minDistance>20&&result.maxDistance<100&&result.paused,'actual close formation remains continuous and safe');
    console.log('Original aircraft, actual flight/formation and pause:',result);
  }
  const unsafe=await page.evaluate(()=>{
    const results=[];
    for(const scenario of [{gear:1,roll:0,pitch:0,speed:65/KT,sink:-1},{gear:0,roll:.4,pitch:0,speed:65/KT,sink:-1},{gear:0,roll:0,pitch:-.3,speed:80,sink:-15}]){
      startMission(0);finishCarrierIntro();DIFF='ace';state=ST.FLIGHT;hideOverlays();Object.assign(P,{alive:true,hull:100,spd:scenario.speed,vSpeed:scenario.sink,pitch:scenario.pitch,roll:scenario.roll,gear:scenario.gear});P.pos.set(-1500,.5,0);
      resolveGroundAndDeck(.02);results.push(state===ST.RESULT&&!P.alive&&!ditching&&!bailRescue);
    }
    startMission(0);return {rejected:results,reset:!ditching&&!bailout&&!crewWaterRescue&&!scene.children.some(o=>o.name==='rescueBoat')};
  });assert(unsafe.rejected.every(Boolean)&&unsafe.reset);console.log('Unsafe impact limits and restart:',unsafe);
  assert.deepEqual(errors,[]);console.log('Build182 actual 65kt / 100–200fpm water contacts, one-boat rescues, close formations and pause passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
