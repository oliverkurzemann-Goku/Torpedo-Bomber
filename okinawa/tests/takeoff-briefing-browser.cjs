/* Real aircraft, real mission selection, service/departure camera and terrain.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Takeoff dust and landscape briefings: skipped locally (no Chrome).');process.exit(0);}
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
  for(const pacific of [true,false]){
   await page.goto(origin+(pacific?'/torpedo-carrier.html':'/remagen-mission.html')+'?v=180');
   await page.waitForFunction(pacific=>state===ST.MENU&&(pacific||realWorldReady),pacific,{polling:100});
   await page.evaluate(async pacific=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(pacific){await prepareOkinawa();for(const m of MISSIONS)await preparePacificModels(m);}},pacific);
   for(const viewport of [{width:1024,height:600},{width:1194,height:660},{width:1366,height:768},{width:1024,height:520}]){
    await page.setViewportSize(viewport);
    const proof=await page.evaluate(pacific=>{
     const menu=document.getElementById('menu'),brief=document.getElementById('brief');
     const visible=e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1;};
     const check=(e,name)=>{if(!visible(e))throw Error(name+' clipped: '+JSON.stringify(e.getBoundingClientRect().toJSON()));};
     if(pacific){showOverlay('menu');state=ST.MENU;}else{show('brief',false);show('menu',true);state=ST.MENU;}
     menu.scrollTop=0;check(document.getElementById('startBtn'),'mission selection launch');
     check(document.querySelector('#missionSel .chip:last-child'),'last mission');check(document.getElementById('selBtn'),'Change Game');
     for(let i=0;i<MISSIONS.length;i++){
      if(pacific)startMission(i);else showBrief(i);
      brief.scrollTop=0;
      for(const selector of ['.briefHeading','.briefOrders','.briefNavigation','.briefActions'])check(brief.querySelector(selector),MISSIONS[i].sub+' '+selector);
      if(brief.scrollHeight>brief.clientHeight+1)throw Error(MISSIONS[i].sub+' needs scrolling: '+brief.scrollHeight+' > '+brief.clientHeight);
      const launch=document.getElementById(pacific?'launchBtn':'brGo');check(launch,'briefing launch');
      const r=launch.getBoundingClientRect();if(r.height<44)throw Error('Launch touch target too short');
      if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)!==launch)throw Error('Launch blocked');
     }
     return {campaign:pacific?'Pacific':'Rhine',width:innerWidth,height:innerHeight,briefings:MISSIONS.length};
    },pacific);console.log('No-scroll tablet layouts:',proof);
   }
   // Reproduce the reported long SBD briefing, then exercise the visible Back button.
   if(pacific){
    await page.setViewportSize({width:1024,height:600});
    await page.evaluate(()=>startMission(MISSIONS.findIndex(m=>m.sub==='Dive on the Convoy')));
    await page.screenshot({path:path.join(out,'build180-sbd-briefing.png')});
    await page.locator('#briefBack').click();assert.equal(await page.evaluate(()=>state===ST.MENU),true);
    await page.locator('#missionSel .chip').nth(8).click();await page.locator('#startBtn').click();
    await page.waitForFunction(()=>state===ST.BRIEF,null,{polling:100});
    assert(await page.locator('#launchBtn').isVisible());
   }else{
    await page.screenshot({path:path.join(out,'build180-rhine-briefing.png')});
    await page.locator('#brBack').click();
   }
  }
  for(const ac of ['p47','me262']){
   const proof=await page.evaluate(async ac=>{
    await ensureModel(ac);startMission(MISSIONS.findIndex(m=>m.ac===ac&&!m.free&&!m.circuits));finishLaunchIntro(false);
    P.throttle=1;inputPitch=0;inputRoll=0;clock.getDelta=()=>.05;
    const render=GameRuntime.render;GameRuntime.render=()=>{};
    try{for(let i=0;i<120;i++)animate();}finally{GameRuntime.render=render;}
    posePlayerAircraft(0);
    camera.near=.1;camera.fov=48;camera.updateProjectionMatrix();renderer.setPixelRatio(.65);
    camera.position.copy(P.pos).add(new THREE.Vector3(20,12,-32).applyAxisAngle(new THREE.Vector3(0,1,0),P.heading));
    camera.lookAt(P.pos.clone().add(new THREE.Vector3(-Math.sin(P.heading)*10,-1,-Math.cos(P.heading)*10)));
    scene.updateMatrixWorld(true);
    const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);
    groundDust.mesh.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
    groundDust.mesh.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
    let pixels=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>4)pixels++;
    const before=groundDust.mesh.instanceMatrix.array.slice(),stats=groundDust.stats;togglePause();animate();
    const paused=before.every((v,i)=>v===groundDust.mesh.instanceMatrix.array[i])&&groundDust.stats.emitted===stats.emitted;togglePause();
    return {...stats,pixels,paused,onGround:P.onGround,speed:P.spd,png:renderer.domElement.toDataURL()};
   },ac);
   const png=proof.png;delete proof.png;assert(proof.onGround&&proof.live>10&&proof.pixels>1000&&proof.paused,ac+' has visible ground dust and pause works');
   assert.equal(proof.mode,ac==='me262'?'jet':'prop');assert(proof.draws===1&&proof.allocated<=proof.limit);
   fs.writeFileSync(path.join(out,'build180-'+ac+'-takeoff-dust.png'),Buffer.from(png.split(',')[1],'base64'));console.log('Actual ground dust pixels:',{ac,...proof});
   const cleanup=await page.evaluate(()=>{P.onGround=false;const emitted=groundDust.stats.emitted;groundDust.trail(P,.05);const stopped=emitted===groundDust.stats.emitted;for(let i=0;i<80;i++)groundDust.update(.05);const faded=groundDust.stats.live===0;startMission(0);return {stopped,faded,reset:groundDust.stats.live===0};});assert.deepEqual(cleanup,{stopped:true,faded:true,reset:true});
  }
  // Actual FW190 takeoff/flight integration, not a replacement flight function.
  const handling=await page.evaluate(async()=>{await ensureModel('fw190');startMission(MISSIONS.findIndex(m=>m.ac==='fw190'));finishLaunchIntro(false);P.onGround=false;P.pos.y=groundY(P.pos.x,P.pos.z)+800;P.spd=150;P.gear=0;inputRoll=.5;inputPitch=.25;for(let i=0;i<10;i++)updateFlight(.05);const bank=P.roll;inputRoll=0;inputPitch=0;for(let i=0;i<80;i++)updateFlight(.05);return {bank,settled:Math.abs(P.roll)<.002,alive:P.alive};});assert(handling.bank>.15&&handling.bank<.6&&handling.settled&&handling.alive);console.log('Real FW190 gentler roll and neutral recovery:',handling);
  assert.deepEqual(errors,[]);console.log('Build180: every tablet briefing fits, visible native prop/jet dust, pause/airborne/fade/reset and live FW190 controls passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
