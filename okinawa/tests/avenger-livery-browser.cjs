/* Real game, real helijah Avenger GLB, touch device: the repainted 1942 atlas replaces the
 * delivered tri-colour at full 2048 px (other textures keep the 512 px touch cap), is shared
 * by every clone, and the rendered chase view shows no 1941 rudder stripes.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Avenger livery WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
  page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|livery not loaded|finish failed/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=198');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  const result=await page.evaluate(async()=>{
   renderer.setPixelRatio(1);
   await prepareOkinawa();const i=MISSIONS.findIndex(m=>m.title==='Sortie 1');
   await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
   const atlas=AvengerFinish.findAtlas(gltfRoot),sizes=[];
   gltfRoot.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(m.map&&m!==atlas)sizes.push([Math.max(m.map.image.width,m.map.image.height),m.name,o.name,m.map===atlas.map]);});
   const clone=await new Promise(r=>PacificAssets.loader().load(PLANE_MODEL_URL,g=>r(g.scene)));
   // level cruise, chase camera from the left rear quarter so the fin and rudder are in view
   P.alive=true;P.onGround=false;P.onDeck=false;P.pos.set(-1800,320,700);P.heading=Math.PI/2;P.pitch=P.roll=0;P.gear=P.gearTgt=0;P.spd=70;
   updatePlaneMesh();planeGroup.updateMatrixWorld(true);
   const nose=noseDir(),side=new THREE.Vector3(-nose.z,0,nose.x);
   camera.position.copy(P.pos).addScaledVector(nose,-13).addScaledVector(side,-8).add(new THREE.Vector3(0,3.2,0));camera.lookAt(P.pos);camera.updateMatrixWorld(true);
   renderer.render(scene,camera);
   const box=new THREE.Box3().setFromObject(gltfRoot),pts=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new THREE.Vector3(x,y,z).project(camera));
   const W=renderer.domElement.width,H=renderer.domElement.height,X=t=>Math.round((t*.5+.5)*W),Y=t=>Math.round((-t*.5+.5)*H);
   const rect=[Math.max(0,Math.min(...pts.map(p=>X(p.x)))),Math.max(0,Math.min(...pts.map(p=>Y(p.y)))),Math.min(W,Math.max(...pts.map(p=>X(p.x)))),Math.min(H,Math.max(...pts.map(p=>Y(p.y))))];
   const gl=renderer.getContext(),px=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
   let red=0,plane=0,blueGray=0;
   for(let y=rect[1];y<rect[3];y++)for(let x=rect[0];x<rect[2];x++){const o=((H-1-y)*W+x)*4,r=px[o],g=px[o+1],b=px[o+2];
    if(Math.abs(r-174)+Math.abs(g-207)+Math.abs(b-230)<40)continue;plane++;   // skip the sky
    if(r>130&&g<90&&b<90)red++;
    if(b>r+8&&b<170&&b-r<70)blueGray++;}
   return {finish:atlas&&atlas.userData.avengerFinish,mapSize:atlas&&atlas.map.image.width,normalSize:atlas&&atlas.normalMap&&atlas.normalMap.image.width,
    normalY:atlas&&atlas.normalScale.y,roughness:atlas&&atlas.roughness,metalness:atlas&&atlas.metalness,flipY:atlas&&atlas.map.flipY,
    shared:AvengerFinish.findAtlas(clone)===atlas,cap:PacificAssets.maxTextureSize,others:Math.max(...sizes.filter(s=>!s[3]).map(s=>s[0])),big:sizes.filter(s=>s[0]>512&&!s[3]),flapSkins:sizes.filter(s=>s[3]).length,rect,plane,red,blueGray,canvas:renderer.domElement.toDataURL('image/png')};
  });
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'build198-avenger-livery.png'),Buffer.from(result.canvas.split(',')[1],'base64'));delete result.canvas;
  assert.deepEqual(errors,[],'no page, shader or livery errors');
  assert(result.finish,'the 1942 livery was applied to the decoded Avenger');
  assert.equal(result.cap,512,'touch device: Pacific textures are capped at 512 px');
  assert.equal(result.mapSize,2048,'the livery atlas stays at full 2048 px on touch devices');
  assert(result.others<=512,'every other Avenger texture keeps the touch cap: '+JSON.stringify(result.big));
  assert(result.flapSkins>=2,'the articulated flap skins carry the same livery map');
  assert.equal(result.normalSize,1024,'panel-line normal map present');
  assert(result.normalY<0&&result.flipY===false,'glTF texture orientation kept for colour and normal maps');
  assert(result.roughness>=.8&&result.metalness===0,'non-specular paint');
  assert(result.shared,'wingmen and raiders clone the finished source material');
  assert(result.plane>3000,'the Avenger fills the chase view: '+result.plane);
  assert(result.red<result.plane*.002,'no red/white 1941 rudder stripes in the rendered frame: '+result.red);
  assert(result.blueGray>result.plane*.25,'blue-gray paint dominates the airframe: '+result.blueGray+'/'+result.plane);
  console.log('Avenger livery WebGL: '+JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
