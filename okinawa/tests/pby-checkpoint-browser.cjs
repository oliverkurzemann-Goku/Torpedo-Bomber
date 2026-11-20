/* Build 294, real Pacific game: a Catalina patrol (Sortie 24 Dumbo, Sortie 25 submarine hunt, Sortie 26 convoy) is saved in the air,
 * the page is reloaded cold and Continue restores the patrol: the same search ring, the drifted raft with its dye and men, the
 * submarine's dive state and place, the false contacts (kind, place, checked), timers and calls, the convoy ships. Afloat she is not saved.
 * After Resume the patrol runs on for a few seconds without an error. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('PBY checkpoint WebGL: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png','.wav':'audio/wav'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const SUMMARY=`(()=>{const o=pbyOps,r=v=>+(+v).toFixed(2);return {kind:o.kind,ring:[r(o.ring.x),r(o.ring.z),r(o.ring.r)],point:[r(o.point.x),r(o.point.z)],t:r(o.t),found:o.found,phase:o.phase,checked:o.checked,datums:o.datums,
 dye:o.dye?[r(o.dye.position.x),r(o.dye.position.z)]:null,men:o.men.map(m=>[r(m.group.position.x),r(m.group.position.z),m.group.visible]),
 sub:o.sub?{state:o.sub.state,dives:o.sub.dives,x:r(o.sub.x),z:r(o.sub.z),heading:r(o.sub.heading)}:null,
 decoys:o.decoys.map(d=>({kind:d.kind,x:r(d.x),z:r(d.z),seen:d.seen,checked:d.checked,mesh:!!d.mesh&&d.mesh.parent===o.group})),
 ships:ships.map(s=>({type:s.def.type,alive:s.alive,x:r(s.group.position.x),z:r(s.group.position.z)})),pos:P.pos.toArray().map(r),onWater:!!P.onWater,
 df:o.df.lines.length,calls:Object.keys(o.calls||{}).sort()};})()`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},hasTouch:true}),errors=[];
  page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const title of ['Sortie 24','Sortie 25','Sortie 26']){
   await page.goto(origin+'/torpedo-carrier.html?v=294');
   await page.waitForFunction(()=>state===ST.MENU&&window.sortieCheckpoint?.ready,null,{polling:200});
   const saved=await page.evaluate(async({title,SUMMARY})=>{
    renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;await prepareOkinawa();
    const i=MISSIONS.findIndex(m=>m.title===title);DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);launch();
    // afloat at the fleet: not saved
    const afloat=window.sortieCheckpoint.save();
    const o=pbyOps;
    // airborne over the ring, the patrol run on for a while (drift, contacts, radio fixes)
    P.onWater=false;P.onDeck=false;P.gear=P.gearTgt=0;P.alive=true;state=ST.FLIGHT;P.spd=60;P.pitch=0;P.vSpeed=0;P.heading=0;
    P.pos.set(o.ring.x+o.ring.r*.6,420,o.ring.z);
    for(let k=0;k<30*40;k++){P.pos.y=420;P.vSpeed=0;updatePbyPatrol(1/30);updateShips(1/30);}
    if(o.decoys[0]){o.decoys[0].seen=o.decoys[0].checked=true;o.checked=1;}
    if(o.sub){o.sub.state='submerged';o.sub.dives=1;o.sub.t=33;}
    o.calls.test=1;o.datums=2;
    const r=window.sortieCheckpoint.save();if(!r.ok)throw Error('save failed '+JSON.stringify(r));
    return {afloat,summary:eval(SUMMARY)};
   },{title,SUMMARY});
   assert.equal(saved.afloat.ok,false,title+': not saved afloat');
   await page.reload();
   await page.waitForFunction(()=>state===ST.MENU&&window.sortieCheckpoint?.ready,null,{polling:200});
   await page.locator('#continueFlight').click();
   await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:200});
   const restored=await page.evaluate(SUMMARY=>eval(SUMMARY),SUMMARY);
   const s=saved.summary;
   for(const k of ['kind','ring','point','t','found','phase','checked','datums','dye','men','sub','decoys','pos','df','calls'])assert.deepEqual(restored[k],s[k],title+': '+k+' restored');
   assert.equal(restored.onWater,false);
   assert.deepEqual(restored.ships.map(x=>[x.type,x.alive,x.x,x.z]),s.ships.map(x=>[x.type,x.alive,x.x,x.z]),title+': ships');
   await page.locator('#resumeBtn').click();
   const after=await page.evaluate(()=>{for(let k=0;k<30*5;k++){P.pos.y=420;P.vSpeed=0;updatePbyPatrol(1/30);updateShips(1/30);}return {state,alive:P.alive,t:pbyOps.t};});
   assert(after.alive,'runs on after resume');
   report[title]={kind:s.kind,ring:s.ring,decoys:s.decoys.length,sub:s.sub,ships:s.ships.length,tAfter:after.t};
   await page.evaluate(()=>window.sortieCheckpoint.clear());
  }
  assert.deepEqual(errors,[]);
  console.log('pby-checkpoint-browser: ok',JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
