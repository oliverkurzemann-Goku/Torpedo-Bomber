/* Build 283: Me 262 / Me 163 heat shimmer (Rhine Ultra, graphics High). The real game, the real Me 262: two frames of the shimmer at different
 * times are compared pixel by pixel; changed pixels on the aircraft's own silhouette (the engines) must vanish with the airframe mask,
 * while the air behind the jet keeps rippling. Writes app/release/heat-haze-browser.json and test-visuals/build283-heat-haze.png. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=require('node:path').resolve(__dirname,'../..'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Heat haze WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(url.pathname.endsWith('.html')){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.glb':'model/gltf-binary','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const page=await browser.newPage({viewport:{width:1194,height:660}});page.setDefaultTimeout(900000);
 page.on('pageerror',e=>console.log('ERR',e.message));
 const sortie=encodeURIComponent(JSON.stringify({version:1,theatre:'europe',task:'free',ac:'me262',kit:'guns',weather:'clear',time:'day',start:'air',difficulty:'vet',enemies:0,fuel:100}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?surprises=off&scenery=ultra&graphics=high&sortie='+sortie);
 await page.waitForFunction(()=>realWorldReady&&(state===ST.MENU||state===ST.BRIEF),null,{polling:200});
 const out=await page.evaluate(async()=>{
  await ensureModel('me262');await new Promise(r=>setTimeout(r,3000));
  selectedMission=0;briefPlan=chooseEuropePlan(0);briefPlan.weather='clear';startMission(0);if(launchIntro)finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;P.alive=true;P.throttle=1;
  renderer.setPixelRatio(1);
  for(let i=0;i<30;i++){updateFlight(1/60);posePlayerAircraft(1/60);}for(let i=0;i<400;i++)updateCamera(1/60);planeGroup.updateMatrixWorld(true);
  if(!graphicsPost?.enabled)return {err:'post off',s:graphicsSettings()};
  const gl=renderer.getContext(),W=gl.drawingBufferWidth,H=gl.drawingBufferHeight;
  const grab=()=>{const a=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
  const shot=(t,mask,haze)=>{graphicsPost.haze=haze;graphicsPost.maskRoot=mask;graphicsPost.render(scene,camera,t,false);return grab();};
  const haze=jetHaze();
  // the airframe silhouette: plane only, everything else hidden
  const vis=[];scene.children.forEach(c=>{vis.push(c.visible);c.visible=(c===planeGroup);});const bg=scene.background,fog=scene.fog;scene.background=new THREE.Color(0);scene.fog=null;scene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff,fog:false});
  const sil=shot(0,null,[]);scene.children.forEach((c,i)=>c.visible=vis[i]);scene.overrideMaterial=null;scene.background=bg;scene.fog=fog;
  const onPlane=i=>sil[i]+sil[i+1]+sil[i+2]>30;
  const count=(a,b)=>{let plane=0,rest=0,planePx=0;for(let i=0;i<a.length;i+=4){const on=onPlane(i);if(on)planePx++;const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>12){if(on)plane++;else rest++;}}return {plane,rest,planePx};};
  const r={haze,size:[W,H],dist:camera.position.distanceTo(planeGroup.position),parent:planeGroup.parent===scene};
  r.before=count(shot(1,null,haze),shot(1.37,null,haze));
  r.after=count(shot(1,planeGroup,haze),shot(1.37,planeGroup,haze));
  r.still=count(shot(1,null,[]),shot(1.37,null,[]));
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),img=x.createImageData(W,H);
  const save=(a)=>{for(let y=0;y<H;y++)img.data.set(a.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4);x.putImageData(img,0,0);return c.toDataURL('image/png');};
  r.png=save(shot(1,planeGroup,haze));r.pngBefore=save(shot(1,null,haze));
  return r;
 });
 if(out.png){const dir=path.join(root,'test-visuals');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'build283-heat-haze.png'),Buffer.from(out.png.split(',')[1],'base64'));delete out.png;delete out.pngBefore;}
 assert.ok(!out.err,JSON.stringify(out));assert.ok(out.before.planePx>1500,'the Me 262 is on screen: '+JSON.stringify(out));
 assert.ok(out.before.plane>100,'without the mask the shimmer moves the airframe: '+JSON.stringify(out.before));
 assert.ok(out.after.plane<=out.before.plane*.05,'with the mask the airframe stays still: '+JSON.stringify(out.after));
 assert.ok(out.after.rest>out.before.rest*.6,'the air behind the jet still shimmers: '+JSON.stringify(out.after));
 assert.equal(out.still.plane+out.still.rest,0,'no shimmer, no change');
 fs.writeFileSync(path.join(root,'app/release/heat-haze-browser.json'),JSON.stringify(out,null,1)+'\n');
 console.log('Heat haze WebGL: OK',JSON.stringify(out));
 await browser.close();server.close();
})();
