/* Original Rhine aircraft, actual contact/rollout, live HUD and flight controller. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Field landing WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/remagen-mission.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=193');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{for(const kind of ['p47','bf109','fw190','ju87','me262','me163'])await ensureModel(kind);renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;});
  await page.evaluate(()=>{
   window.setupFieldLanding=(kind,offset=-350)=>{
    startMission(MISSIONS.findIndex(m=>m.ac===kind&&!m.free&&!m.circuits));finishLaunchIntro(false);show('menu',false);show('brief',false);show('result',false);state=ST.FLIGHT;
    for(const k of Object.keys(M().kills||{}))sortieKills[k]=M().kills[k];for(const e of enemyAir)e.alive=false;europeOps=null;
    P.alive=true;P.onGround=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;
    P.fuel=25;P.bombs=P.rockets=0;P.tankAttached=false;P.tankFuel=0;P.throttle=0;P.hull=acDef().hull;SortieFeatures.Damage.reset(P,P.hull);
    P.gear=P.gearTgt=P.flap=P.flapTgt=1;P.heading=RWY_HDG;P.pitch=.025;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;aeroMode=false;
    P.pos.set(AF_X+offset,AF_Y+20,AF_Z);refreshModels();posePlayerAircraft(0);
    const speed=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app);P.spd=speed.reference*.90;P.vSpeed=-1.5;
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.pitch,P.heading,0,'YXZ')),point=new THREE.Vector3();let contactY=-Infinity;
    for(const vertices of AircraftGround.supports(playerModel,kind)){let low=null;
     for(let i=0;i<vertices.length;i+=3){point.fromArray(vertices,i).applyQuaternion(q);if(!low||point.y<low.y)low=point.clone();}
     contactY=Math.max(contactY,AircraftGround.height(terrain,P.pos.x+low.x,P.pos.z+low.z)-low.y);
    }P.pos.y=contactY+.04;posePlayerAircraft(0);
    return {reference:speed.reference,stall:speed.stall};
   };
  });
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const kind of ['p47','bf109','fw190','ju87','me262','me163']){
   const sink=await page.evaluate(kind=>{
    setupFieldLanding(kind);P.onGround=false;P.pos.y=AF_Y+800;P.pitch=-.04;P.throttle=.3;P.flap=P.flapTgt=0;
    const clean=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).reference;P.flap=P.flapTgt=1;
    const full=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).reference;P.spd=full;
    const d=acDef(),command=-.04/(d.pitchLim*.92);inputPitch=d.stickExponent?-Math.pow(-command,1/d.stickExponent):command;inputRoll=0;
    const load=SortieFeatures.Handling.sample(P);
    P.throttle=(full-d.thrMin+Math.sin(P.pitch)*62*load.ratio+17)/(d.max-d.thrMin);
    // The jet uses thrust/drag rather than the propeller target-speed spring.
    if(kind==='me262')P.throttle=(.00013*full*full+9.81*Math.sin(P.pitch)+1.9)/(7.6*load.acceleration);
    if(kind==='me163')P.throttle=0;
    for(let i=0;i<180;i++)updateFlight(1/60);updateHUD();
    const result={kind,clean,full,sink:-P.vSpeed,display:document.getElementById('landingRef').textContent};
    if(!(full<clean&&result.sink>1.5&&result.sink<4.5&&P.alive))throw Error('Unusable full-flap descent '+JSON.stringify(result));
    if(!result.display.includes('MPH'))throw Error('Rhine reference lost its units');return result;
   },kind);console.log('Actual full-flap final:',JSON.stringify(sink));
   for(const fps of [20,60,120]){
    const result=await page.evaluate(({kind,fps})=>{
     setupFieldLanding(kind);const before=P.pos.clone(),touch=P.spd,log=(loadLog().sorties||0);resolveGround(1/fps);
     if(!P.onGround||!P.landingRoll||missionOver||state!==ST.FLIGHT||P.spd!==touch||P.pos.distanceTo(before)>.15)throw Error('Contact jumps or ends the sortie '+kind);
     let elapsed=0,maximumDrop=0,maximumHeightStep=0,minimumGap=Infinity,png;
     while(!missionOver&&P.alive&&elapsed<60){
      const speed=P.spd,y=P.pos.y;updateFlight(1/fps);posePlayerAircraft(1/fps);elapsed+=1/fps;
      maximumDrop=Math.max(maximumDrop,speed-P.spd);maximumHeightStep=Math.max(maximumHeightStep,Math.abs(P.pos.y-y));
      if(elapsed<3&&missionOver)throw Error('Debrief appears before rollout');
      if(P.throttle!==0)throw Error('Rollout moves the gas lever');
      if(fps===60&&!png&&elapsed>3){
       camera.up.set(0,1,0);camera.position.copy(P.pos).add(new THREE.Vector3(-18,5,-14));camera.lookAt(P.pos);
       scene.updateMatrixWorld(true);renderer.render(scene,camera);png=renderer.domElement.toDataURL('image/png');
      }
      const point=new THREE.Vector3();for(const vertices of AircraftGround.supports(playerModel,kind)){
       let low=null;for(let i=0;i<vertices.length;i+=3){point.fromArray(vertices,i).applyQuaternion(planeGroup.quaternion);if(!low||point.y<low.y)low=point.clone();}
       low.add(planeGroup.position);minimumGap=Math.min(minimumGap,low.y-AircraftGround.height(terrain,low.x,low.z));
      }
     }
     const result={kind,fps,elapsed,travel:P.pos.x-before.x,maximumDrop,maximumHeightStep,minimumGap,speed:P.spd,alive:P.alive,title:document.getElementById('rsTitle').textContent};
     if(!P.alive||!missionOver||P.spd!==0||elapsed<7||result.travel<140||result.travel>650||maximumDrop>.8||maximumHeightStep>.5||minimumGap<-.03)throw Error('Bad live rollout '+JSON.stringify(result));
     if((loadLog().sorties||0)-log!==1)throw Error('Landing logged more than once');return {...result,png};
    },{kind,fps});
    if(result.png){fs.writeFileSync(path.join(out,'build193-'+kind+'-rolling.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;}
    console.log('Original-aircraft touchdown/rollout:',JSON.stringify(result));
   }
   await page.screenshot({path:path.join(out,'build193-'+kind+'-rollout-result.png')});
  }
  const goAround=await page.evaluate(()=>{
   setupFieldLanding('p47');P.throttle=1;inputPitch=.4;const before=P.pos.clone(),speed=P.spd;resolveGround(1/60);updateFlight(1/60);
   if(P.onGround||P.landingRoll||missionOver||P.throttle!==1||P.spd-speed>.5||P.pos.distanceTo(before)>2)throw Error('Powered touch-and-go jumps or steals controls');
   for(let i=0;i<120;i++)updateFlight(1/60);
   if(P.onGround||P.landingRoll||!P.alive||P.pos.y-groundY(P.pos.x,P.pos.z)<5)throw Error('Go-around re-catches the runway before leaving the ground');
   return {speed:P.spd,move:P.pos.distanceTo(before),departure:P.departureAge};
  });console.log('Actual powered go-around:',goAround);
  const overrun=await page.evaluate(()=>{
   setupFieldLanding('p47',250);resolveGround(1/60);for(let i=0;i<3600&&P.alive&&!missionOver;i++)updateFlight(1/60);
   if(P.alive||missionOver||state!==ST.DEAD)throw Error('Late landing receives false recovery credit');return {alive:P.alive,state};
  });
  await page.waitForFunction(()=>document.getElementById('rsTitle').textContent==='RUNWAY OVERRUN',null,{polling:100});console.log('Late touchdown:',overrun);
  assert.deepEqual(errors,[]);console.log('All six original Rhine types: live flap references/descent, tyre contact, continuous rollout, final debrief, go-around and overrun passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
