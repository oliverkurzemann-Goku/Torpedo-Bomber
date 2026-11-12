/* Build 246, real Pacific game and the real PBY-5A GLB: a survivor who ditched far from the carrier is picked up by the Catalina (glides in from the
 * carrier side, settles hull-first on the water, stops beside the survivor, waits, takes a second survivor aboard, and takes off); near the carrier, far from
 * the first survivor and on the Japanese side the motor launch is used instead. Stepped at 20/60/120 FPS. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('PBY rescue WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/torpedo-carrier.html'){const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
  page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=248');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.begin=async title=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
    for(const z of zeros)z.alive=false;P.alive=true;P.onDeck=false;P.onGround=false;said.length=0;return i;};
  });
  for(const fps of [20,60,120]){
   const R=await page.evaluate(async fps=>{
    await begin('Sortie 2');
    clearCrewBailouts();
    const V=(x,z)=>new THREE.Vector3(x,0,z),far=V(carrierX+3300,3100),dt=1/fps;
    const water=shoreHeight(far.x,far.z)<=.6;
    const first=rescueCrewMember(far,true),near=rescueCrewMember(V(far.x+140,far.z+60),true),remote=rescueCrewMember(V(far.x+900,far.z),true);
    const g=crewPby.group,plane=g.children[0];
    const node=n=>plane.getObjectByName(n);
    const out={water,pby:[first.pby===true,near.pby===true,remote.pby===true],hasModel:!!pbyTemplate,said0:said.slice(),phases:[],
     rig:{gear:node('GearLeft').rotation.z,nose:node('NoseGear').rotation.x,floatL0:node('FloatLeft').rotation.z},plan:crewPby.plan?{u:[crewPby.plan.u.x,crewPby.plan.u.z]}:null};
    const toCarrier=V(carrierX-far.x,-far.z).normalize();out.towardCarrier=crewPby.plan.u.x*toCarrier.x+crewPby.plan.u.z*toCarrier.z;
    const hullBox=()=>{g.updateMatrixWorld(true);return new THREE.Box3().setFromObject(node('SteppedFlyingBoatHull'));};   // the render loop is stubbed: refresh the world matrices ourselves
    let last='',t=0,start=null,touch=null,stop=null,pick=null,done=null,heights=[],props0=node('PropellerLeft').rotation.z,gone=null,nearPick=null,nearDone=null,maxFloat=0,minFloat=9,lift=null;
    for(let i=0;i<fps*160;i++){
     updateCrewBailouts(dt);t+=dt;
     const ph=crewPby.phase;if(ph!==last){out.phases.push([ph,+t.toFixed(1)]);last=ph;}
     if(!start){start={d:Math.hypot(g.position.x-far.x,g.position.z-far.z),y:g.position.y,visible:g.visible};
      const f=node('FloatLeft').rotation.z;out.rig.floatFlight=f;}
     if(ph==='roll'&&!touch){const hb=hullBox(),sea=seaHeightAt(g.position.x,g.position.z,seaUniforms.uTime.value);touch={t,hullMinOverSea:+(hb.min.y-sea).toFixed(2),float:node('FloatLeft').rotation.z,dist:Math.hypot(g.position.x-far.x,g.position.z-far.z)};}
     if(ph==='board'&&!stop){const hb=hullBox(),sea=seaHeightAt(g.position.x,g.position.z,seaUniforms.uTime.value);stop={t,dist:Math.hypot(g.position.x-far.x,g.position.z-far.z),hullMinOverSea:+(hb.min.y-sea).toFixed(2),speedless:true};}
     if(first.update().pickup&&!pick)pick={t,pickDist:Math.hypot(g.position.x-far.x,g.position.z-far.z)};
     if(near.update().pickup&&!nearPick)nearPick={t,dist:Math.hypot(g.position.x-near.group.position.x,g.position.z-near.group.position.z)};
     if(first.update().done&&!done)done={t};
     if(near.update().done&&!nearDone)nearDone={t};
     if(ph==='takeoff'&&!lift&&g.position.y>seaHeightAt(g.position.x,g.position.z,seaUniforms.uTime.value)+8)lift={t};
     if(ph==='gone'&&!gone){gone={t,visible:g.visible};break;}
    }
    out.start=start;out.touch=touch;out.stop=stop;out.pick=pick;out.nearPick=nearPick;out.nearDone=nearDone;out.done=done;out.lift=lift;out.gone=gone;
    out.propSpin=+(node('PropellerLeft').rotation.z-props0).toFixed(1);out.floatEnd=node('FloatLeft').rotation.z;
    out.remoteIsBoat=!remote.pby&&remote.water;out.remoteDone=remote.update();
    crewPby.dispose();out.removed=!g.parent;
    return out;
   },fps);
   report['fps'+fps]=R;
   assert.ok(R.water,'the test point is open water');assert.ok(R.hasModel,'the real Catalina model is loaded');
   assert.deepEqual(R.pby,[true,true,false],'first and second (140 m away) survivor go to the Catalina, the one 900 m away to the launch: '+R.pby);
   assert.ok(R.towardCarrier>.99,'she comes from the carrier side: '+R.towardCarrier);assert.ok(R.said0.some(t=>/CATALINA INBOUND/.test(t)),R.said0);
   assert.ok(Math.abs(R.rig.gear-1.47)<1e-6&&Math.abs(R.rig.nose+1.37)<1e-6,'wheels up for a water landing: '+JSON.stringify(R.rig));assert.ok(Math.abs(Math.abs(R.rig.floatFlight)-1.5708)<1e-3,'tip floats folded in flight: '+R.rig.floatFlight);
   assert.ok(R.start.visible&&R.start.d>930&&R.start.d<970&&R.start.y>40,'she starts 950 m out and high: '+JSON.stringify(R.start));
   assert.ok(R.touch&&R.touch.t>12&&R.touch.t<17,'touchdown after about 14 s: '+JSON.stringify(R.touch));assert.ok(Math.abs(R.touch.float)<1e-6,'tip floats deployed for the landing: '+R.touch.float);
   assert.ok(R.touch.hullMinOverSea<-.1&&R.touch.hullMinOverSea>-1.3,'the hull meets the water (tail low in the flare): '+R.touch.hullMinOverSea);
   assert.ok(R.stop&&R.stop.dist>20&&R.stop.dist<40,'she stops 30 m from the survivor: '+JSON.stringify(R.stop));assert.ok(Math.abs(R.stop.hullMinOverSea+.25)<.3,'hull on the water: '+R.stop.hullMinOverSea);
   assert.ok(R.pick&&R.pick.t-R.stop.t>3&&R.pick.t-R.stop.t<4.6,'the first survivor is aboard about 3.2 s after she stops: '+JSON.stringify([R.stop,R.pick]));
   assert.ok(R.done&&R.done.t-R.pick.t>2.2&&R.done.t-R.pick.t<3.2,'done about 2.5 s after the pickup: '+JSON.stringify([R.pick,R.done]));
   assert.ok(R.nearPick&&R.nearPick.t>R.pick.t+10&&R.nearPick.dist<40&&R.nearDone,'the second survivor is taxied to and taken aboard: '+JSON.stringify([R.nearPick,R.nearDone,R.phases,R.pick,R.stop]));
   assert.ok(R.lift&&R.gone&&!R.gone.visible,'she takes off and leaves: '+JSON.stringify([R.lift,R.gone]));assert.ok(Math.abs(R.propSpin)>50,'the propellers turn: '+R.propSpin);assert.ok(R.removed,'dispose removes her');
   assert.ok(R.remoteIsBoat,'a survivor 900 m from the first one is left to the motor launch');
  }
  // ---- near the carrier, and on the Japanese side, the launch is used ----
  const N=await page.evaluate(async()=>{
   await begin('Sortie 2');clearCrewBailouts();
   const V=(x,z)=>new THREE.Vector3(x,0,z);
   const nearCarrier=rescueCrewMember(V(carrierX+900,500),true);const a=!!nearCarrier.pby;clearCrewBailouts();
   await begin('Sortie 6');clearCrewBailouts();
   const defend=rescueCrewMember(V(carrierX+3300,3100),true);const b=!!defend.pby;clearCrewBailouts();
   return {nearCarrierPby:a,defendPby:b,defend:isDefend()};
  });
  report.others=N;
  assert.equal(N.nearCarrierPby,false,'near the carrier: the launch');assert.ok(N.defend&&N.defendPby===false,'the Japanese side keeps its boat');
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/pby-rescue-browser.json'),JSON.stringify(report,null,1));
  console.log('PBY rescue WebGL: OK',JSON.stringify({touch:report.fps60.touch.t.toFixed(1),stop:report.fps60.stop.t.toFixed(1),pick:report.fps60.pick.t.toFixed(1),done:report.fps60.done.t.toFixed(1),second:report.fps60.nearPick.t.toFixed(1),gone:report.fps60.gone.t.toFixed(1)}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
