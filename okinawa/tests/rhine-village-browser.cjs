/* Render matching low flight paths with and without the new Rhine detail. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Rhine village WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:[
   '--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'
  ]});
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true}),errors=[];
  page.setDefaultTimeout(150000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=268');
  await page.waitForFunction(()=>typeof livingWorld!=='undefined'&&livingWorld?.rhineVillage&&state===ST.MENU,null,{polling:200});
  const proof=await page.evaluate(()=>{
   renderer.setPixelRatio(.60);renderer.shadowMap.enabled=false;
   const layer=livingWorld.rhineVillage;
   if(!periodBuildings.entries.some(e=>e.group.name==='remagen-rail-ruin'&&e.proxy.children[0].geometry.attributes.position.count===144)){
    throw Error('Railway ruin or open distant shell missing');
   }
   const cam=new THREE.PerspectiveCamera(52,1024/768,1,13000);
   const output=[];
   for(const site of layer.sites){
    const {x,z}=site,altitude=groundY(x,z)+70;
    const key=Math.floor(x/RTILE)+','+Math.floor(z/RTILE),tile=terrain.tiles.get(key),osmTile=osmMgr.tiles.get(key);
    const local=new THREE.Scene();local.background=new THREE.Color(0x9eb4c2);
    const sky=new THREE.HemisphereLight(0xe5ecff,0x747565,1.45),sun=new THREE.DirectionalLight(0xffdfb5,1.05);
    sun.position.set(-150,200,100);local.add(sky,sun);
    const ground=new THREE.Mesh(tile.mesh.geometry,tile.mesh.material);ground.position.copy(tile.mesh.position);local.add(ground);
    osmTile.farGroup.updateMatrixWorld(true);
    for(const mesh of osmTile.farGroup.children.filter(o=>o.name.startsWith('osmBuilding')))local.add(mesh.clone());
    layer.update(.3,x,z,altitude);
    const scenery=site.group.clone();scenery.visible=false;local.add(scenery);
    const shots=[];
    for(const distance of [180,115,72]){
     cam.position.set(x-32,altitude,z+distance);cam.lookAt(x,groundY(x,z)+3,z);
     const render=visible=>{
      scenery.visible=visible;renderer.render(local,cam);
      const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
      const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return {pixels,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
     };
     const before=render(false),after=render(true);let changed=0;
     for(let i=0;i<before.pixels.length;i+=4){
      if(Math.abs(before.pixels[i]-after.pixels[i])>8||
         Math.abs(before.pixels[i+1]-after.pixels[i+1])>8||
         Math.abs(before.pixels[i+2]-after.pixels[i+2])>8)changed++;
     }
     shots.push({distance,changed,extraCalls:after.calls-before.calls,extraTriangles:after.triangles-before.triangles});
    }
    output.push({name:site.name,shots});
   }
   return output;
  });
  assert.equal(proof.length,2);
  for(const site of proof){
   assert(site.shots.some(s=>s.changed>120),site.name+' details must be visible in the low pass '+JSON.stringify(site.shots));
   assert(site.shots.every(s=>s.extraCalls<=1&&s.extraTriangles<=1800),'site exceeds geometry budget');
  }
  assert.deepEqual(errors,[]);
  console.log('Rhine low pass:',JSON.stringify(proof));
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
