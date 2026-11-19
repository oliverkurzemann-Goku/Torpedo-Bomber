/* Build 291: shared lighting in the real Pacific game (graphics-light.js, graphics-post.js). Sortie 3 over the densest
 * Okinawa village, camera frozen: the sky light probe is matched to the hemisphere share it replaces, PCSS changes the
 * shadow edges on High, ambient occlusion darkens around houses and trees without extra scene draws and is off high up;
 * Medium keeps the sky light without PCSS/AO, Low the hemisphere alone; weather/time re-bake the probe. Writes
 * app/release/graphics-light-browser.json and test-visuals/build291-pacific-*.jpg. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Graphics light WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname.endsWith('.html')){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});


(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,out={};
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834}});page.setDefaultTimeout(900000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|ERROR:|sky light failed/.test(m.text()))errors.push(m.text().slice(0,400));});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(base+'/torpedo-carrier.html?v=293&campaign=1&graphics=high&scenery=ultra');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
  const index=await page.evaluate(()=>MISSIONS.findIndex(m=>/Sortie 3\b/.test(m.title)));
  await page.evaluate(async i=>{await prepareOkinawa();await preparePacificModels(MISSIONS[i]);},index);
  Object.assign(out,await page.evaluate(async i=>{
   startMission(i);finishCarrierIntro();hideOverlays();weather='clear';applyWeather();
   clock.getDelta=()=>1/60;state=ST.FLIGHT;P.deckRun=null;P.onDeck=false;P.spd=90;P.gear=P.gearTgt=0;
   renderPacific();const job=pacificLand?.update?.(okinawaWorld,seaUniforms.uSunDir.value);if(job)await job;
   const r={patched:GraphicsLight.patched,aoSupported:graphicsPost.aoSupported};
   // 1) sky light: on High the probe carries PAC_SKY_SHARE of the ambient, matched for an upward surface.
   r.high={probe:pacSkyLight.probe.intensity,up:pacSkyLight.measured.up,hemi:hemiLight.intensity,base:hemiLight.userData.base,
     colour:hemiLight.color.getHex()};
   const up=PAC_SKY_SHARE*r.high.base*Math.PI*(.2126*hemiLight.color.r+.7152*hemiLight.color.g+.0722*hemiLight.color.b);
   r.high.matchError=Math.abs(r.high.probe*r.high.up-up)/up;
   // 2) view: just above a village roof line; freeze the camera after it settles
   const v=new THREE.Vector3(5916.5,23.74,-785.96);// densest Okinawa village (measured)
   for(let k=0;k<60;k++){P.pos.set(v.x-90,v.y+22,v.z-20);P.heading=.2;P.pitch=-.25;animateFrame();}
   const grab=()=>{placePacificShadow(0);renderPacific();const c=document.createElement('canvas');c.width=renderer.domElement.width;c.height=renderer.domElement.height;
     const g=c.getContext('2d');g.drawImage(renderer.domElement,0,0);return {px:g.getImageData(0,0,c.width,c.height).data,calls:(renderer.__sceneInfo||renderer.info.render).calls,url:renderer.domElement.toDataURL('image/jpeg',.88)};};
   const diff=(a,b)=>{let n=0,s=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>12)n++;s+=a[i]+a[i+1]+a[i+2]-b[i]-b[i+1]-b[i+2];}return {changed:n/(a.length/4),mean:s/(a.length/4)/3};};
   const T=graphicsQuality.settings;
   const on=grab(),again=grab();r.noise=diff(on.px,again.px);r.ao=graphicsPost.ao;r.radius=sun.shadow.radius;r.calls=on.calls;
   r.occlusion=graphicsPost.readOcclusion();
   T.ao=false;const noAo=grab();T.ao=true;r.aoDiff=diff(on.px,noAo.px);r.callsNoAo=noAo.calls;
   T.softShadows=false;const noPcss=grab();r.pcssRadius=sun.shadow.radius;T.softShadows=true;r.pcssDiff=diff(on.px,noPcss.px);
   const k=pacSkyLight.probe.intensity,hI=hemiLight.intensity;pacSkyLight.probe.intensity=0;hemiLight.intensity=hemiLight.userData.base;
   const noSky=grab();pacSkyLight.probe.intensity=k;hemiLight.intensity=hI;r.skyDiff=diff(on.px,noSky.px);
   r.images={on:on.url,noAo:noAo.url,noPcss:noPcss.url,noSky:noSky.url};
   // 3) high above the island the occlusion pass is off (no cost)
   for(let k=0;k<30;k++){P.pos.set(v.x-1500,900,v.z-2500);animateFrame();}
   r.aoHigh=graphicsPost.ao;
   // 4) Medium: no PCSS, AO off, sky light still on; Low: hemisphere alone
   graphicsQuality.set('medium',false);for(let k=0;k<3;k++)animateFrame();
   r.medium={radius:sun.shadow.radius,probe:pacSkyLight.probe.intensity,ao:graphicsPost.ao};
   graphicsQuality.set('low',false);for(let k=0;k<3;k++)animateFrame();
   r.low={probe:pacSkyLight.probe.intensity,hemi:hemiLight.intensity,base:hemiLight.userData.base};
   graphicsQuality.set('high',false);for(let k=0;k<3;k++)animateFrame();
   r.backHigh={probe:pacSkyLight.probe.intensity,hemi:hemiLight.intensity};
   // 5) the weather and time of day re-bake: dusk is warmer and dimmer than noon
   timeMode='dusk';applyWeather();r.dusk={up:pacSkyLight.measured.up,probe:pacSkyLight.probe.intensity,hemi:hemiLight.intensity,base:hemiLight.userData.base};
   return r;
  },index));
  out.errors=errors;
 }finally{await browser.close();server.close();}
 const dir=path.join(root,'test-visuals');fs.mkdirSync(dir,{recursive:true});
 for(const [k,u] of Object.entries(out.images))fs.writeFileSync(path.join(dir,'build291-pacific-'+k+'.jpg'),Buffer.from(u.split(',')[1],'base64'));delete out.images;
 fs.writeFileSync(path.join(root,'app/release/graphics-light-browser.json'),JSON.stringify(out,null,1)+'\n');
 console.log(JSON.stringify(out));
 assert.deepEqual(out.errors,[],'no shader or page errors');
 assert.deepEqual(out.patched,{probe:true,pcss:true});assert.equal(out.aoSupported,true);
 assert.ok(out.high.probe>0&&out.high.matchError<.02,'probe matched to the hemisphere share it replaces');
 assert.ok(Math.abs(out.high.hemi-out.high.base*(1-.8))<1e-6,'hemisphere keeps 20 %');
 assert.ok(out.noise.changed===0,'frozen camera: identical frames');
 assert.ok(out.ao===1&&out.occlusion.min<.8&&out.occlusion.darkShare>.003,'occlusion at the village');
 assert.ok(out.aoDiff.mean<-.2&&out.aoDiff.changed>.01,'occlusion darkens the picture');
 assert.equal(out.callsNoAo,out.calls,'occlusion adds no scene draws');
 assert.ok(out.radius<0&&out.pcssRadius===1&&out.pcssDiff.changed>.002,'PCSS on High changes shadow edges');
 assert.ok(out.skyDiff.changed>0||Math.abs(out.skyDiff.mean)>.1,'sky light changes the picture');
 assert.equal(out.aoHigh,0,'no occlusion pass at 900 m');
 assert.ok(out.medium.radius>0&&out.medium.probe>0&&out.medium.ao===0,'Medium: sky light, no PCSS, no AO');
 assert.ok(out.low.probe===0&&out.low.hemi===out.low.base,'Low: hemisphere alone');
 assert.ok(out.backHigh.probe>0&&out.backHigh.hemi<out.low.hemi,'High again: probe back');
 assert.ok(out.dusk.probe>0&&out.dusk.up!==out.high.up,'dusk re-bakes the probe');
 console.log('Build 291 graphics light (Pacific, real game): sky probe, PCSS, ambient occlusion, tiers OK');
})().catch(e=>{console.error(e);process.exit(1);});
