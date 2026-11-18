/* Build 285: three iPad reports on Okinawa (Ultra, High). (1) "Es gibt keine Schatten": nothing on the island cast a shadow
 * and the box was 240 m around the aircraft; now houses/palms/trees/bunkers cast into a box ahead of the camera. (2) At dawn
 * the far hills were blue-white: the weather grey replaced the warm haze; now the fog stays warm. (3) The Ultra waves read as
 * a designed pattern; the sea now mixes rotated copies, a far tap and gust patches. Measured in the real game, Sortie 3.
 * Set OLD_PAGE=<file.html> to run the same measurements against another copy of the page (before/after numbers).
 * Writes app/release/pacific-shadows-browser.json and test-visuals/build285-*.jpg. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Pacific shadows WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname.endsWith('.html')){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const pageFile=process.env.OLD_PAGE||'torpedo-carrier.html',tag=process.env.OLD_PAGE?'old':'new';
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,res={page:pageFile};
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660}});page.setDefaultTimeout(900000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|ERROR:/.test(m.text()))errors.push(m.text().slice(0,600));});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(base+'/'+pageFile+'?v=285&campaign=1&graphics=high&scenery=ultra');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
  const index=await page.evaluate(()=>MISSIONS.findIndex(m=>/Sortie 3\b/.test(m.title)));
  await page.evaluate(async i=>{renderer.setPixelRatio(1);await prepareOkinawa();await preparePacificModels(MISSIONS[i]);
   startMission(i);finishCarrierIntro();hideOverlays();timeMode='day';weather='broken';applyWeather();
   clock.getDelta=()=>1/60;state=ST.FLIGHT;P.deckRun=null;P.onDeck=false;P.spd=90;P.gear=P.gearTgt=0;
   renderPacific();const job=pacificLand.update(okinawaWorld,seaUniforms.uSunDir.value);if(job)await job;},index);
  const grabSrc=`(()=>{const gl=renderer.getContext();renderPacific();const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,a=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);
    return {W,H,a,jpg:renderer.domElement.toDataURL('image/jpeg',.85)};})`;
  // 1) shadows: a village 300 m ahead at 120 m, the real chase camera, with and without the island's casters
  res.shadows=await page.evaluate(src=>{const grab=eval(src);
   const homes=[];okinawaWorld.root.traverse(o=>{if(o.isInstancedMesh&&o.name==='Coral homes')homes.push(o);});
   // the house with the most neighbours within 150 m (a village, not a lone farm)
   const m=new THREE.Matrix4(),pts=[];
   for(const cell of homes)for(let i=0;i<cell.count;i++){cell.getMatrixAt(i,m);pts.push(new THREE.Vector3().setFromMatrixPosition(m));}
   let bi=0,bn=-1;pts.forEach((p,i)=>{let n=0;for(const q of pts)if(Math.hypot(p.x-q.x,p.z-q.z)<150)n++;if(n>bn){bn=n;bi=i;}});
   const h=pts[bi].clone().applyMatrix4(okinawaWorld.root.matrixWorld);
   // fly a fixed heading, read where the chase camera actually looks, and put the aircraft 330 m back along that line
   // at 120 m, so the village sits ahead in the frame whatever the heading convention
   const fwd=new THREE.Vector3();let pos=new THREE.Vector3(h.x,h.y+120,h.z);
   for(let pass=0;pass<3;pass++){for(let k=0;k<30;k++){P.pos.copy(pos);P.heading=.7;P.pitch=-.16;P.roll=0;animateFrame();}
     camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();pos=new THREE.Vector3(h.x-fwd.x*330,h.y+120,h.z-fwd.z*330);}
   for(let k=0;k<40;k++){P.pos.copy(pos);P.heading=.7;P.pitch=-.16;P.roll=0;animateFrame();}
   const casters=[];okinawaWorld.root.traverse(o=>{if(o.isMesh&&o.castShadow)casters.push(o);});
   const on=grab();
   const was=casters.map(o=>o.castShadow);casters.forEach(o=>o.castShadow=false);const off=grab();casters.forEach((o,i)=>o.castShadow=was[i]);
   let n=0,tot=0,dark=0;for(let j=0;j<on.a.length;j+=16){tot++;const d=(off.a[j]+off.a[j+1]+off.a[j+2])-(on.a[j]+on.a[j+1]+on.a[j+2]);if(d>30)n++;if(d>0)dark+=d;}
   const look=new THREE.Vector3();camera.getWorldDirection(look);look.y=0;look.normalize();
   const t=sun.target.position,ahead=(t.x-P.pos.x)*look.x+(t.z-P.pos.z)*look.z;
   const cells=casters.filter(o=>o.isInstancedMesh&&o.userData.cell!==undefined).length;
   return {villageHouses:bn,casters:casters.length,treeCellsCasting:cells,shadowShare:+(n/tot).toFixed(4),range:sun.shadow.camera.right,boxAhead:Math.round(ahead),
     on:on.jpg,off:off.jpg};},grabSrc);
  // 2) dawn haze: fog colour and the far hills, Sortie 3 weather 'broken'
  res.dawn=await page.evaluate(src=>{const grab=eval(src);applyTimeOfDay('dawn');timeMode='dawn';applyWeather();
   const c=new THREE.Vector3().applyMatrix4(okinawaWorld.root.matrixWorld);
   for(let k=0;k<30;k++){P.pos.set(c.x-9000,60,c.z+300);P.heading=0;P.pitch=-.02;animateFrame();}
   const fog=scene.fog.color.clone(),pic=grab();
   timeMode='day';applyTimeOfDay('day');applyWeather();
   return {fog:fog.toArray().map(v=>+v.toFixed(3)),warm:+(fog.r-fog.b).toFixed(3),jpg:pic.jpg};},grabSrc);
  // 3) waves: the iPad pose (520 ft over the water toward the coast); variation of 24x24-px block brightness in the sea area
  res.sea=await page.evaluate(src=>{const grab=eval(src);
   const c=new THREE.Vector3().applyMatrix4(okinawaWorld.root.matrixWorld);
   for(let k=0;k<30;k++){P.pos.set(c.x-11500,160,c.z-1500);P.heading=0;P.pitch=-.05;animateFrame();}
   const g=grab(),W=g.W,H=g.H,B=24,means=[];
   for(let by=0;by<Math.floor(H*.55/B);by++)for(let bx=0;bx<Math.floor(W/B);bx++){let s=0;   // bottom 55 % of the frame = water
     for(let y=0;y<B;y+=2)for(let x=0;x<B;x+=2){const i=((by*B+y)*W+bx*B+x)*4;s+=g.a[i]+g.a[i+1]+g.a[i+2];}means.push(s/((B/2)*(B/2)));}
   // compare each block with its neighbour in its own row: a uniform tile pattern gives nearly equal neighbours
   const rows=Math.floor(H*.55/B),cols=Math.floor(W/B);let diff=0,n=0;const avg=means.reduce((a,b)=>a+b,0)/means.length;
   for(let r=0;r<rows;r++)for(let q=0;q+1<cols;q++){diff+=Math.abs(means[r*cols+q]-means[r*cols+q+1]);n++;}
   const sd=Math.sqrt(means.reduce((a,b)=>a+(b-avg)**2,0)/means.length);
   // regularity: the strongest repeat of the high-passed water texture (crop 600x180 in the middle distance, lags up to
   // 30 px across, 8 rows down); a tiled lattice repeats every few pixels with a high correlation
   const cw=600,ch=180,x0=(W-cw)>>1,y0=Math.round(H*.18),lum=new Float64Array(cw*ch),hp=new Float64Array(cw*ch);
   for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const i=((y0+y)*W+x0+x)*4;lum[y*cw+x]=g.a[i]+g.a[i+1]+g.a[i+2];}   // readPixels rows start at the bottom
   for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){let t=0,c=0;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<ch&&xx>=0&&xx<cw){t+=lum[yy*cw+xx];c++;}}hp[y*cw+x]=lum[y*cw+x]-t/c;}
   const ac=(dx,dy)=>{let t=0,c=0;for(let y=10;y<ch-10;y++)for(let x=40;x<cw-40;x++){t+=hp[y*cw+x]*hp[(y+dy)*cw+x+dx];c++;}return t/c;};
   const a0=ac(0,0);let repeat=0;for(let dy=-8;dy<=8;dy++)for(let dx=-30;dx<=30;dx++){if(Math.hypot(dx,dy*3)<6)continue;repeat=Math.max(repeat,ac(dx,dy)/a0);}
   return {blockSd:+(sd/avg).toFixed(4),neighbour:+(diff/n/avg).toFixed(4),repeat:+repeat.toFixed(3),jpg:g.jpg};},grabSrc);
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});
  const save=(k,v)=>fs.writeFileSync(path.join(root,'test-visuals',`build285-${tag}-${k}.jpg`),Buffer.from(v.split(',')[1],'base64'));
  save('village-shadows',res.shadows.on);save('village-noshadows',res.shadows.off);save('dawn',res.dawn.jpg);save('sea',res.sea.jpg);
  delete res.shadows.on;delete res.shadows.off;delete res.dawn.jpg;delete res.sea.jpg;
  res.errors=errors.slice();
  console.log('Pacific shadows/dawn/sea ('+tag+'):',JSON.stringify(res));
  if(process.env.OLD_PAGE)return;
  fs.writeFileSync(path.join(root,'app/release/pacific-shadows-browser.json'),JSON.stringify(res,null,1)+'\n');
  assert.deepEqual(res.errors,[],'shader/page errors');
  assert.ok(res.shadows.casters>20,'island objects cast: '+res.shadows.casters);
  assert.ok(res.shadows.shadowShare>.003,'island shadows visible in the village view: '+res.shadows.shadowShare);
  assert.ok(res.shadows.boxAhead>res.shadows.range*.35,'shadow box ahead of the camera: '+res.shadows.boxAhead);
  assert.ok(res.sea.repeat<.17,'Ultra sea texture repeats less (Build 284: 0.187): '+res.sea.repeat);
  assert.ok(res.dawn.warm>.04,'dawn haze stays warm: '+JSON.stringify(res.dawn.fog));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
