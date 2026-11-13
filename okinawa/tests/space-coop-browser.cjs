'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');process.exit(0);}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage',
   '--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const url='http://127.0.0.1:'+server.address().port,errors=[];
  const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  for(const page of pages){
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&/WebGL|Shader/.test(m.text()))errors.push(m.text());});
   await page.addInitScript(()=>{Object.defineProperty(document,'hidden',{get:()=>false});});
  }
  const [host,guest]=pages;
  await host.goto(url+'/hangar.html?theatre=pacific');
  assert(!await host.locator('#spaceCoopLink').isVisible());
  await host.locator('#hangarBadge').focus();await host.keyboard.down('Enter');
  await host.locator('#spaceCoopLink').waitFor({state:'visible',timeout:10000});
  await host.keyboard.up('Enter');
  await host.locator('#spaceCoopLink').click();
  assert(await host.locator('#viewport canvas').count()===0,'lobby does not start WebGL');
  await host.locator('#host').click();
  await host.waitForFunction(()=>document.getElementById('outCode').value.startsWith('TB1.o'));
  const invite=await host.locator('#outCode').inputValue();
  await guest.goto(url+'/space-coop.html#'+invite);
  assert.equal(await guest.locator('#inCode').inputValue(),invite);
  await guest.locator('#confirm').click();
  await guest.waitForFunction(()=>document.getElementById('outCode').value.startsWith('TB1.a'));
  await host.locator('#inCode').fill(await guest.locator('#outCode').inputValue());
  await host.locator('#confirm').click();
  await host.locator('#start').click({timeout:40000});
  for(const page of pages){
   await page.locator('#flight').waitFor();
   await page.waitForFunction(()=>document.getElementById('distance').textContent.includes('Partner'));
   assert.equal(await page.locator('#viewport canvas').count(),1);
  }
  assert.equal(await host.locator('#objective').textContent(),'Notsignal finden');
  assert.equal(await guest.locator('#objective').textContent(),'Notsignal finden');
  await guest.keyboard.down('ArrowRight');
  await host.waitForFunction(()=>Number(document.getElementById('distance').textContent.match(/Partner (\d+)/)?.[1])>67);
  await guest.keyboard.up('ArrowRight');
  await guest.locator('#leave').click();
  await host.locator('#notice').waitFor({state:'visible'});
  assert(await guest.locator('#viewport canvas').count()===0);
  assert.deepEqual(errors,[]);
  console.log('Space co-op browser: hidden entry, two WebRTC peers, real GLB/WebGL, remote flight and cleanup passed.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
