'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../..'),exe=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!exe){if(process.env.CI)throw Error('Chrome required');console.log('Aircraft preview: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[],shots=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>{errors.push(e.message);console.error(e);});page.on('console',m=>{if(/Aircraft preview:|Shader Error/.test(m.text()))console.error(m.text());});
  await page.goto(base+'/hangar.html');
  const ready=ac=>page.waitForFunction(ac=>{const el=document.getElementById('aircraftPreview');return el.dataset.aircraft===ac&&el.getAttribute('aria-busy')==='false';},ac,{polling:100});
  await ready('p47');assert.equal(await page.title(),'Custom Mission · Torpedo Squadron');
  for(const [theatre,planes]of [['europe',['p47','bf109','fw190','ju87','me262','me163']],['pacific',['avenger','sbd','corsair','zero']]]){
   await page.locator('[data-theatre="'+theatre+'"]').click();
   for(const ac of planes){console.log('Preview:',ac);await page.locator('button[data-aircraft="'+ac+'"]').click();await ready(ac);
    const kits=await page.locator('#kit option').evaluateAll(o=>o.map(n=>n.value));await page.locator('#kit').selectOption(kits.includes('mixed')?'mixed':kits.includes('bombs')?'bombs':'guns');
    await page.locator('#previewReset').click();
    const fit=JSON.parse(await page.locator('#aircraftPreview').getAttribute('data-mount-report')||'[]');
    if(['p47','bf109','fw190','ju87','me262','sbd'].includes(ac)){
     assert(fit.length>0,ac+' stores displayed');
     for(const mount of fit){
      assert(mount.measured,ac+' must fit '+mount.kind+' to actual airframe: '+JSON.stringify(mount));
      assert(Math.abs(mount.skinY-mount.storeTop-mount.clearance)<.001,ac+' store/rack continuous contact');
      assert(mount.storeTop<mount.skinY,ac+' store below actual skin');
     }
     console.log('Fitted stores',ac,JSON.stringify(fit));
    }
    if(ac==='bf109'||ac==='fw190'){
     await page.locator('#kit').selectOption('range');
     const tanks=JSON.parse(await page.locator('#aircraftPreview').getAttribute('data-mount-report')||'[]');
     assert.equal(tanks.length,1,ac+' one drop tank');
     assert.equal(tanks[0].kind,'tank');
     assert(tanks[0].measured,ac+' tank connected to actual fuselage: '+JSON.stringify(tanks[0]));
     assert(Math.abs(tanks[0].skinY-tanks[0].storeTop-tanks[0].clearance)<.001,ac+' tank rack continuous');
     console.log('Fitted drop tank',ac,JSON.stringify(tanks[0]));
     await page.locator('#kit').selectOption('bombs');
    }
    const picture=await page.locator('#aircraftPreview').screenshot();shots.push({ac,picture});
    assert(await page.locator('#go').isEnabled());
   }
  }
  // Rotation/zoom change the real rendered aircraft, then Reset returns its view.
  const expected={p47:10,bf109:1,fw190:1,ju87:4,me262:2,me163:0,avenger:0,sbd:2,corsair:0,zero:0};
  for(const [ac,count] of Object.entries(expected)){
   const s=ac==='p47'?{bombs:2,rockets:8}:ac==='avenger'?{bombs:2}:ac==='sbd'?{bombs:3}:ac==='corsair'?{bombs:2,rockets:8}:ac==='ju87'?{bombs:4}:ac==='me262'?{bombs:2}:ac==='bf109'||ac==='fw190'?{bombs:1}:{};
   assert.equal(await page.evaluate(({ac,s})=>SortiePreview.hardpoints(ac,s).length,{ac,s}),count,'Hardpoints '+ac);
  }
  const initial=await page.locator('#aircraftPreview').screenshot(),box=await page.locator('#aircraftPreview').boundingBox();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:10});await page.mouse.up();
  const rotated=await page.locator('#aircraftPreview').screenshot();assert(!initial.equals(rotated),'drag rotates the rendered Zero');
  await page.locator('#previewIn').click();const zoomed=await page.locator('#aircraftPreview').screenshot();assert(!rotated.equals(zoomed),'zoom changes rendered size');
  await page.locator('#previewReset').click();
  const layouts=[];for(const [width,height]of [[1194,660],[1024,700],[390,844]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,goBottom:document.getElementById('go').getBoundingClientRect().bottom,minTouch:Math.min(...[...document.querySelectorAll('button,select')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect().height))}));assert(!layout.overflow);assert(layout.minTouch>=44);layouts.push(layout);}
  await page.setViewportSize({width:1194,height:660});await page.locator('[data-theatre="europe"]').click();await ready('p47');await page.locator('#kit').selectOption('mixed');await page.locator('#previewReset').click();
  await page.screenshot({path:path.join(out,'build222-custom-mission.png')});
  // A failed asset remains recoverable and never blocks mission configuration.
  await page.locator('[data-theatre="pacific"]').click();await ready('avenger');await page.route('**/zero.glb',r=>r.abort());await page.locator('button[data-aircraft="zero"]').click();await page.waitForFunction(()=>!document.getElementById('previewRetry').hidden,null,{polling:100});assert(await page.locator('#go').isEnabled());await page.unroute('**/zero.glb');await page.locator('#previewRetry').click();await ready('zero');
  const fallback=await browser.newPage();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};});await fallback.goto(base+'/hangar.html');await fallback.waitForFunction(()=>document.getElementById('previewStatus').textContent.includes('unavailable'),null,{polling:100});assert(await fallback.locator('#go').isEnabled());await fallback.close();
  assert.deepEqual(errors,[]);const sheet=createCanvas(1000,840),g=sheet.getContext('2d');g.fillStyle='#142119';g.fillRect(0,0,1000,840);g.font='bold 16px sans-serif';
  for(let i=0;i<shots.length;i++){const x=i%3*333,y=Math.floor(i/3)*210;g.drawImage(await loadImage(shots[i].picture),x,y,333,176);g.fillStyle='#ead8a7';g.fillText(shots[i].ac.toUpperCase(),x+12,y+199);}
  const png=sheet.toBuffer('image/png');fs.writeFileSync(path.join(out,'build222-aircraft-sheet.png'),png);console.log('PREVIEW_QA_IMAGE:'+png.toString('base64'));for(const layout of layouts)if(layout.width>730)assert(layout.goBottom<=(layout.width===1194?660:700),'landscape controls visible '+JSON.stringify(layout));
  const report={aircraft:shots.map(s=>s.ac),layouts,drag:true,zoom:true,assetRetry:true,webglFallback:true,jsErrors:errors};fs.writeFileSync(path.join(out,'sortie-preview.json'),JSON.stringify(report,null,2));console.log('RESULT',JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
