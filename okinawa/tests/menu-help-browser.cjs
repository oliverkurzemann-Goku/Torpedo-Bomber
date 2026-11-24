/* Build 296: How to Play and Graphics dialogs in both menus (opened from the menu, every option inside with its text, the moved controls still work, everything fits on iPad screens). Screenshots: test-visuals/build296-*.png. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Menu help WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
const launch=()=>chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote']});
 let browser=null;
 const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});const report={};
 try{
  for(const [file,name,ready] of [['remagen-mission.html','rhine','state===ST.MENU&&realWorldReady'],['torpedo-carrier.html','pacific','state===ST.MENU']]){
   if(browser)await browser.close();browser=await launch();   // single-process Chromium: one page per browser
   const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
   page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+file+'?v=help');
   await page.waitForFunction(ready,null,{polling:200});
   for(const [w,h] of [[1194,660],[1024,600],[1366,1024]]){
    await page.setViewportSize({width:w,height:h});
    const R=await page.evaluate(()=>{const fit=e=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;};
     const how=document.getElementById('howToPlayBtn'),gfx=document.getElementById('graphicsHelpBtn'),start=document.getElementById('startBtn')||document.querySelector('#menu .startBtn');
     const menuCard=document.querySelector('#menu .menuCard');
     const sr=start&&start.getBoundingClientRect(),m=document.getElementById('menu');return {startRect:sr&&[Math.round(sr.top),Math.round(sr.bottom)],menuScroll:m.scrollHeight-m.clientHeight,buttons:!!how&&!!gfx,howFits:fit(how),gfxFits:fit(gfx),start:start?fit(start):'n/a',menuOverflow:Math.max(0,Math.round(menuCard.scrollHeight-innerHeight)),
       touch:[how,gfx].map(b=>Math.round(b.getBoundingClientRect().height))};});
    assert.ok(R.buttons);assert.ok(R.howFits&&R.gfxFits,name+' '+w+'x'+h+': help buttons on screen');assert.ok(R.touch.every(t=>t>=44),'44 px touch targets');
    if(R.start!=='n/a')assert.ok(R.start,name+' '+w+'x'+h+': start still on screen '+JSON.stringify(R));
    report[name+w+'x'+h]=R;
   }
   await page.setViewportSize({width:1194,height:660});
   // How to Play
   const H=await page.evaluate(()=>{document.getElementById('howToPlayBtn').click();const d=document.getElementById('howToPlay'),c=d.querySelector('.helpCard').getBoundingClientRect();
    return {open:!d.classList.contains('hidden'),steps:d.querySelectorAll('.helpSteps li').length,landing:!!d.querySelector('#menuLandingSpeed'),oldGuide:!!document.querySelector('#menu .quickGuide'),
     inView:c.top>=0&&c.bottom<=innerHeight&&c.left>=0&&c.right<=innerWidth,scrolls:d.querySelector('.helpBody').scrollHeight>d.querySelector('.helpBody').clientHeight};});
   assert.ok(H.open);assert.equal(H.steps,6);assert.ok(H.landing,'the live landing speed moved into the guide');assert.equal(H.oldGuide,false);assert.ok(H.inView);
   await page.screenshot({path:path.join(out,'build296-'+name+'-howto.png')});
   await page.evaluate(()=>document.querySelector('#howToPlay .helpGo').click());
   const seen=await page.evaluate(k=>localStorage.getItem(k),name==='rhine'?'re_howto_seen':'tc_howto_seen');assert.equal(seen,'1','closing marks it seen');
   // Graphics
   const G=await page.evaluate(()=>{document.getElementById('graphicsHelpBtn').click();const d=document.getElementById('graphicsHelp'),c=d.querySelector('.helpCard').getBoundingClientRect();
    const ids=['graphicsMenu','frameRateMenu'],inside=ids.map(id=>d.contains(document.getElementById(id)));
    const scen=d.querySelector('select[id$="SceneryMenu"]'),perf=d.querySelector('input[type=checkbox]');
    const sel=document.getElementById('graphicsMenu');sel.value='low';sel.dispatchEvent(new Event('change',{bubbles:true}));const afterLow=graphicsQuality.choice;
    d.querySelector('.helpGo').click();
    return {open:!d.classList.contains('hidden'),sections:d.querySelectorAll('.helpSetting').length,inside,scenery:!!scen,perf:!!perf,afterLow,afterRec:graphicsQuality.choice,frame:graphicsQuality.frameMode,
      inView:c.top>=0&&c.bottom<=innerHeight,text:d.querySelector('.helpRec').textContent};});
   assert.ok(G.open);assert.equal(G.sections,4,'quality, frame rate, scenery, overlay');assert.ok(G.inside.every(Boolean)&&G.scenery&&G.perf,'the real controls are in the dialog');
   assert.equal(G.afterLow,'low','the moved select still changes the setting');assert.equal(G.afterRec,'high');assert.equal(G.frame,'hold60');assert.ok(G.inView);
   await page.screenshot({path:path.join(out,'build296-'+name+'-graphics.png')});
   await page.evaluate(()=>{document.querySelector('#graphicsHelp .helpClose').click();});
   await page.screenshot({path:path.join(out,'build296-'+name+'-menu.png')});
   assert.deepEqual(errors,[],name+' page errors');report[name]={H,G};
   await page.evaluate(()=>{localStorage.clear();});
  }
  console.log('Menu help browser: OK',JSON.stringify(report));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
