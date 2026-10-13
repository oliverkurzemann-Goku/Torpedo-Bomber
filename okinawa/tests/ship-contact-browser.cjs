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
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:680}}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=195');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(async()=>{
   await prepareOkinawa();
   for(const kind of ['avenger','sbd','corsair','zero']){
    const m=MISSIONS.find(m=>kind==='avenger'?!m.sbd&&!m.defend&&!m.free&&!m.qual:kind==='zero'?m.defend:kind==='corsair'?m.corsair:m.sbd&&!m.corsair);
    await preparePacificModels(m);
   }
   for(const name of Object.keys(NavalAssets.specs))await NavalAssets.load(name);
   renderer.setPixelRatio(.4);renderer.shadowMap.enabled=false;
  });
  const collisions=await page.evaluate(()=>{
   const samples=[],quaternion=new THREE.Quaternion(),point=new THREE.Vector3();
   for(const name of Object.keys(NavalAssets.specs)){
    const template=NavalAssets.get(name),naval=template.userData.naval;
    for(const heading of [0,.73,2.1])for(const fps of [20,60,120]){
     const group=new THREE.Group();group.position.set(1000,0,1000);group.rotation.set(.02,heading,-.025,'YXZ');group.add(template.clone(true));group.updateMatrixWorld(true);
     const root=group.children[0],previous=new THREE.Vector3(),next=new THREE.Vector3();let hit=false;
     for(let x=-naval.beam/2-8;x<naval.beam/2+8;x+=180/fps){
      previous.set(x,.4,0).applyMatrix4(group.matrixWorld);next.set(x+180/fps,.4,0).applyMatrix4(group.matrixWorld);
      if(shipContact.sweep(root,previous,next,quaternion,quaternion,[[0,0,0]])){hit=true;break;}
     }
     if(!hit)throw Error('Actual hull passed through '+name+' '+heading+' '+fps);
     previous.copy(new THREE.Vector3(-naval.beam/2-8,naval.height+12,0).applyMatrix4(group.matrixWorld));
     next.copy(new THREE.Vector3(naval.beam/2+8,naval.height+12,0).applyMatrix4(group.matrixWorld));
     if(shipContact.sweep(root,previous,next,quaternion,quaternion,shipAircraftProbes))throw Error('Empty air falsely collides '+name);
     samples.push({name,heading,fps});
    }
   }
   const belowDeck=[];
   for(const defend of [false,true]){
    startMission(MISSIONS.findIndex(m=>defend?m.defend:!m.sbd&&!m.defend&&!m.free&&!m.qual));finishCarrierIntro();state=ST.FLIGHT;hideOverlays();DIFF='rookie';P.alive=true;
    const hull=defend?ijnCarrierModel:carrierModel,triangles=shipContact.prepare(hull).triangles;hull.updateWorldMatrix(true,true);let face=null,normal=null;
    for(let i=0;i<triangles.length&&!face;i+=9){
     const a=new THREE.Vector3().fromArray(triangles,i).applyMatrix4(hull.matrixWorld),b=new THREE.Vector3().fromArray(triangles,i+3).applyMatrix4(hull.matrixWorld),c=new THREE.Vector3().fromArray(triangles,i+6).applyMatrix4(hull.matrixWorld);
     const centre=a.clone().add(b).add(c).multiplyScalar(1/3),n=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
     if(Math.abs(n.y)<.35&&centre.y>3&&centre.y<carrierDeckHeight(centre.x,centre.z)-3&&Math.abs(centre.x-carrierX)<95&&Math.abs(centre.z)<DECK_HALF_W-3){face=centre;normal=n;}
    }
    if(!face)throw Error('No original below-deck hull face');
    const previous=face.clone().addScaledVector(normal,2);P.pos.copy(face).addScaledVector(normal,-2);P.heading=P.roll=P.pitch=0;P.vSpeed=1;P.spd=70;P.onDeck=false;
    const y=P.pos.y;resolveGroundAndDeck(.05,previous,pacificAircraftQuaternion());
    if(P.alive||P.pos.y>y+.01||P.deckRun||P.arrestRun)throw Error('Climb through carrier hull is ejected or credited');
    belowDeck.push({defend,alive:P.alive,y});
   }
   // Prove that the actual flight/contact pipeline reaches a crash, including allies.
   startMission(0);finishCarrierIntro();state=ST.FLIGHT;hideOverlays();
   const template=NavalAssets.get('liberty'),group=new THREE.Group();group.add(template.clone(true));group.position.set(-2000,0,1000);scene.add(group);
   supportFleet.push({def:{model:'liberty'},group,alive:true});P.alive=true;P.gear=P.gearTgt=0;P.onDeck=false;P.pos.set(-1975,1,1000);
   const before=new THREE.Vector3(-2025,1,1000);resolveGroundAndDeck(.05,before,pacificAircraftQuaternion());
   if(P.alive)throw Error('Allied ship ignored by actual player contact');
   const count=shipContact.stats.profiles,tests=shipContact.stats.triangleTests,start=performance.now();
   for(let i=0;i<5000;i++)shipContact.sweep(group.children[0],new THREE.Vector3(-15000,800,-12000),new THREE.Vector3(-14995,800,-12000),quaternion,quaternion,shipAircraftProbes);
   if(shipContact.stats.profiles!==count||shipContact.stats.triangleTests!==tests)throw Error('Distant ships rebuild or scan triangles');
   return {cases:samples.length,belowDeck,distant5000ms:performance.now()-start,profiles:count};
  });console.log('Original ships, swept hits, clear air and actual allied collision:',collisions);
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const kind of ['avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
   const result=await page.evaluate(({kind,fps})=>{
    const index=MISSIONS.findIndex(m=>kind==='avenger'?!m.sbd&&!m.defend&&!m.free&&!m.qual:kind==='zero'?m.defend:kind==='corsair'?m.corsair:m.sbd&&!m.corsair);
    startMission(index);finishCarrierIntro();state=ST.FLIGHT;hideOverlays();DIFF='ace';P.alive=true;P.rtb=true;
    ships=[];supportFleet=[];raiders=[];etorps=[];enemyBombs=[];shoreTargets=[];pacificOps=null;
    P.heading=0;P.pitch=-.04;P.roll=.018;P.pitchVel=P.rollVel=0;P.flap=P.flapTgt=P.gear=P.gearTgt=P.hook=P.hookTgt=1;
    P.spd=40;P.throttle=.275;windHead=6;windGust=0;inputPitch=P.pitch/.70;inputRoll=0;
    P.pos.set(carrierX-125,30,0);updatePlaneMesh(0);P.pos.y=carrierContactHeight()+.2;
    let minGap=Infinity,maxRise=0,minForward=Infinity,grounded=0,time=0;
    for(let i=0;i<fps*6&&state===ST.FLIGHT&&P.alive;i++){
     const old=P.pos.clone(),oldX=P.pos.x-carrierX,dt=1/fps;time+=dt;CARRIER_SPD=5;carrierX+=5*dt;carrier.position.x=carrierX;
     for(const hull of [carrierModel,ijnCarrierModel])if(hull){hull.position.x=carrierX;hull.rotation.x=.025*Math.sin(time*.9);hull.rotation.z=.025*Math.cos(time*.7);}
     updateFlight(dt);updatePlaneMesh(dt);
     minForward=Math.min(minForward,P.pos.x-carrierX-oldX);maxRise=Math.max(maxRise,P.pos.y-old.y);
     if(P.onDeck){
      grounded++;const model=isDefend()?playerZero:isSBD()?playerSBD:planeGroup,plane=carrierDeckPlane(),p=new THREE.Vector3();
      for(const vertices of AircraftGround.supports(model,'carrier'))for(let j=0;j<vertices.length;j+=3){
       p.fromArray(vertices,j).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
       minGap=Math.min(minGap,p.y-(plane.y+plane.sx*(p.x-plane.x)+plane.sz*(p.z-plane.z)));
      }
     }
    }
    const result={kind,fps,alive:P.alive,state,minGap,maxRise,minForward,grounded};
    if(!P.alive||!grounded||state!==ST.RESULT||minGap<-.002||maxRise>.4||minForward<-.002)throw Error('Rolling carrier penetration/pop/backward motion '+JSON.stringify(result));
    return result;
   },{kind,fps});console.log('Rolling original-model deck recovery:',result);
  }
  const qualification=await page.evaluate(()=>{
   startMission(MISSIONS.findIndex(m=>m.qual));finishCarrierIntro();state=ST.FLIGHT;hideOverlays();P.alive=true;
   P.pos.set(carrierX-75,30,0);P.gear=P.gearTgt=P.hook=P.hookTgt=P.flap=P.flapTgt=1;P.heading=P.roll=P.pitch=0;P.spd=40;P.throttle=.275;
   updatePlaneMesh(0);P.pos.y=carrierContactHeight();P.vSpeed=-2;resolveGroundAndDeck(1/60);
   const start=P.pos.x-carrierX;for(let i=0;i<200&&state===ST.FLIGHT;i++){CARRIER_SPD=5;carrierX+=5/60;carrier.position.x=carrierX;for(const h of [carrierModel,ijnCarrierModel])if(h)h.position.x=carrierX;updateFlight(1/60);updatePlaneMesh(1/60);}
   if(state!==ST.SERVICE||!sortieService.active||qualTraps!==1||P.pos.x-carrierX<start||carrierIntro)throw Error('Qualification teleports to launch after wire stop');
   const held=P.pos.x-carrierX;sortieService.update(60);
   if(!sortieService.ready||state!==ST.SERVICE||Math.abs(P.pos.x-carrierX-held)>.001)throw Error('Ready service automatically launches');
   return {traps:qualTraps,state,held};
  });console.log('Qualification waits for pilot relaunch:',qualification);
  assert.deepEqual(errors,[]);console.log('Ship contacts and moving/rolling-deck recovery passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

