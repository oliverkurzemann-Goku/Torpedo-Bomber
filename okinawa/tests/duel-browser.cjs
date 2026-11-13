/* Build 238: the 2-player duel in the real game - two pages (host and guest) connected by a real WebRTC link inside one
 * Chromium, the way two iPads would be: lobby with invitation and answer codes, start, aircraft appear, a hit reaches the
 * victim, deaths and the score agree on both sides, respawn with protection, rematch from the lobby, forfeit on leaving.
 * (Frames are stepped by hand: the sandbox renders with SwiftShader.) Writes app/release/duel-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Squad WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});


const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ST_FLIGHT=3;   // ST.FLIGHT in the game
const Duel_victim=(pct,kind)=>pct/({p47:1.15,fw190:1.0,bf109:.9,me262:.9,me163:.7,ju87:1.1}[kind]||1);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 // Two pages in ONE browser: host-candidate ICE over loopback, no STUN needed (the lobby box is switched off below).
 // (Not --single-process like the other browser tests: Chromium dies when a second page opens in that mode.)
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=WebRtcHideLocalIpsWithMdns']});
 const report={};
 try{
  const errors={A:[],B:[]};
  const open=async(name)=>{
   const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1});
   page.setDefaultTimeout(900000);page.on('pageerror',e=>errors[name].push(e.message));
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;Object.defineProperty(document,'hidden',{get:()=>false});Object.defineProperty(document,'visibilityState',{get:()=>'visible'});});
   return page;
  };
  const A=await open('A'),B=await open('B');
  const base='http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=duel&surprises=off';
  const boot=async(page)=>{
   await page.goto(base);
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
   await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;clock.getDelta=()=>1/60;GameRuntime.render=()=>true;});
  };
  await Promise.all([boot(A),boot(B)]);
  const frames=async(n,delay=6)=>{for(let i=0;i<n;i++){await Promise.all([A.evaluate(()=>animate()),B.evaluate(()=>animate())]);if(delay)await sleep(delay);}};
  const wait=async(page,fn,arg,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(fn,arg))return true;await sleep(100);}return false;};

  // ---- 1. lobby: invitation / answer / connect ----
  const lobby=await Promise.all([A,B].map(p=>p.evaluate(()=>{
   const before={build:document.getElementById('buildTag').textContent.includes('BUILD 260'),btn:!!document.getElementById('duelBtn'),menuRow:getComputedStyle(document.querySelector('#menu .menuRow')).display};
   document.getElementById('duelBtn').click();
   const l=document.getElementById('duelLobby');
   return {...before,shown:!l.classList.contains('hidden'),menuHidden:document.getElementById('menu').classList.contains('hidden'),chips:document.querySelectorAll('#dlAc .dlChip').length,
    stunBox:document.getElementById('dlStun').checked,duelNet:typeof DuelNet,duel:typeof Duel};
  })));
  report.lobby=lobby;
  for(const l of lobby){assert.ok(l.btn&&l.shown&&l.menuHidden,'the lobby opens from the menu');assert.equal(l.chips,4,'four aircraft to choose');assert.equal(l.duelNet,'object');assert.equal(l.duel,'object');}
  await Promise.all([A,B].map(p=>p.evaluate(()=>{document.getElementById('dlStun').checked=false;})));
  await A.evaluate(()=>{document.getElementById('dlName').value='ALPHA';document.getElementById('dlName').dispatchEvent(new Event('input'));document.querySelector('#dlAc [data-ac="p47"]').click();});
  await B.evaluate(()=>{document.getElementById('dlName').value='BRAVO';document.getElementById('dlName').dispatchEvent(new Event('input'));document.querySelector('#dlAc [data-ac="bf109"]').click();});
  await A.evaluate(()=>document.getElementById('dlHost').click());
  assert.ok(await wait(A,()=>document.getElementById('dlInvite').value.startsWith('TB1.o'),null,15000),'the host gets an invitation code');
  const invite=await A.evaluate(()=>document.getElementById('dlInvite').value);
  report.inviteLength=invite.length;
  await B.evaluate(()=>document.getElementById('dlJoin').click());
  await B.evaluate(c=>{document.getElementById('dlInviteIn').value=c;document.getElementById('dlAccept').click();},'  '+invite.slice(0,40)+'\n'+invite.slice(40)+' ');
  assert.ok(await wait(B,()=>document.getElementById('dlAnswer').value.startsWith('TB1.a'),null,15000),'the guest gets an answer code');
  const answer=await B.evaluate(()=>document.getElementById('dlAnswer').value);
  report.answerLength=answer.length;
  await A.evaluate(c=>{document.getElementById('dlAnswerIn').value=c;document.getElementById('dlConnect').click();},answer);
  const connected=await Promise.all([wait(A,()=>duelLink&&duelLink.status==='open'&&duelSession.opp,null,20000),wait(B,()=>duelLink&&duelLink.status==='open'&&duelSession.opp,null,20000)]);
  assert.deepEqual(connected,[true,true],'both sides reach an open link and know each other');
  report.opp=await Promise.all([A.evaluate(()=>duelSession.opp),B.evaluate(()=>duelSession.opp)]);
  assert.equal(report.opp[0].name,'BRAVO');assert.equal(report.opp[0].ac,'bf109');assert.equal(report.opp[1].name,'ALPHA');assert.equal(report.opp[1].ac,'p47');
  const ui=await Promise.all([A,B].map(p=>p.evaluate(()=>({conn:document.getElementById('dlConnected').hidden===false,start:document.getElementById('dlStart').hidden,startDisabled:document.getElementById('dlStart').disabled,text:document.getElementById('dlConn').textContent}))));
  assert.ok(ui[0].conn&&ui[1].conn,'the lobby shows the connected state');assert.equal(ui[0].start,false,'the host can start');assert.equal(ui[1].start,true,'the guest waits for the host');
  report.ui=ui;
  // ---- 2. start: both fly a duel, both see the other aeroplane ----
  await A.evaluate(()=>{const t=document.getElementById('dlTarget');t.add(new Option('2 kills (test)','2'));t.value='2';document.getElementById('dlMinutes').value='0';document.getElementById('dlStart').click();});
  const started=await Promise.all([wait(A,()=>duelSession.phase==='fight',null,90000),wait(B,()=>duelSession.phase==='fight',null,90000)]);
  assert.deepEqual(started,[true,true],'the host\'s Start begins the duel on both devices');
  await frames(90);
  const snap=p=>p.evaluate(()=>({mission:M().id,duel:!!M().duel,ac:P.ac,state,alive:P.alive,pos:[P.pos.x,P.pos.y,P.pos.z],agl:P.pos.y-groundY(P.pos.x,P.pos.z),hdg:P.heading,pitch:P.pitch,spd:P.spd,onGround:P.onGround,
   hull:SortieFeatures.Damage.hullPercent(P),squad:squad.length,enemy:enemyAir.length,targets:targets.length,bodyDuel:document.body.classList.contains('duel'),
   obj:document.getElementById('objText').textContent,sent:duelLink.sent,recv:duelLink.received,rtt:duelLink.rtt,count:duelSession.track.count,protect:duelSession.protectT,epoch:duelSession.epoch,
   hidden:document.hidden,bail:getComputedStyle(document.getElementById('bailBtn')).display,
   avatar:duelSession.avatar?{shown:duelSession.avatar.shown,kind:duelSession.avatar.kind,visible:duelSession.avatar.group.visible,pos:[duelSession.avatar.pos.x,duelSession.avatar.pos.y,duelSession.avatar.pos.z],prot:duelSession.avatar.protect}:null,
   marker:document.getElementById('duelMark').hidden,markerText:document.getElementById('duelMarkTxt').textContent,ckpt:typeof sortieCheckpoint==='object'?null:'none',
   audio:{ctx:actx?actx.state:null,piston:eng?eng.piston.state:null,jet:typeof jetEngine!=='undefined'&&jetEngine?jetEngine.state:null,master:eng?+eng.master.gain.value.toFixed(3):null,thr:P.throttle,fuel:P.fuel}}));
  const [a0,b0]=await Promise.all([snap(A),snap(B)]);
  report.start={a:a0,b:b0};console.log('AUDIO',JSON.stringify({a:a0.audio,b:b0.audio}));
  for(const [n,s,ac] of [['A',a0,'p47'],['B',b0,'bf109']]){
   assert.ok(s.duel&&s.mission==='duel',n+': the duel mission is installed');assert.equal(s.ac,ac,n+': own aircraft');assert.equal(s.state,ST_FLIGHT,n+': flying');assert.ok(s.alive&&!s.onGround,n+': airborne from the first frame');
   assert.ok(s.agl>500,n+': starts high above the ground ('+Math.round(s.agl)+' m)');assert.equal(s.squad+s.enemy+s.targets,0,n+': no wingmen, AI or targets');
   assert.ok(s.bodyDuel,n+': duel HUD mode');assert.ok(s.count>20,n+': state packets arrive ('+s.count+')');assert.ok(s.recv>20,n+': traffic both ways');
   assert.ok(s.avatar&&s.avatar.shown&&s.avatar.visible,n+': the other aeroplane is drawn');assert.equal(s.avatar.kind,ac==='p47'?'bf109':'p47',n+': it is the right type');
   assert.ok(/YOU 0 .{1,3} 0 /.test(s.obj),n+': the score line is the objective ('+s.obj+')');assert.equal(s.bail,'none',n+': no parachute button');
  }
  const gap=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
  report.avatarError={a:gap(a0.avatar.pos,b0.pos),b:gap(b0.avatar.pos,a0.pos)};
  assert.ok(report.avatarError.a<120&&report.avatarError.b<120,'the avatar sits where the other aeroplane is, one interpolation delay behind ('+JSON.stringify(report.avatarError)+')');
  assert.ok(gap(a0.pos,b0.pos)>1500,'the pilots start apart ('+Math.round(gap(a0.pos,b0.pos))+' m)');
  assert.ok(a0.hdg!==b0.hdg,'opposite sides of the arena');
  report.spawnGap=gap(a0.pos,b0.pos);

  // ---- 3. a burst of fire from A reaches B: the damage matches what was sent, scaled by B's toughness ----
  await A.evaluate(()=>{
   window.__hitSum=0;const orig=duelLink.sendEvent.bind(duelLink);duelLink.sendEvent=m=>{if(m.t==='hit')window.__hitSum+=m.pct;return orig(m);};
   window.__aim=b=>{
    const av=duelSession.avatar;if(!av)return;
    const cp=Math.cos(b.pitch),v=new THREE.Vector3(Math.sin(b.hdg)*cp*b.spd,Math.sin(b.pitch)*b.spd,Math.cos(b.hdg)*cp*b.spd),nose=v.clone().normalize();
    P.pos.set(b.pos[0]-nose.x*230,b.pos[1]-nose.y*230,b.pos[2]-nose.z*230);P.spd=b.spd;
    let lead=av.pos.clone();for(let k=0;k<3;k++){const t=lead.distanceTo(P.pos)/760;lead=av.pos.clone().addScaledVector(v,t);}
    const dir=lead.sub(P.pos).normalize();P.heading=Math.atan2(dir.x,dir.z);P.pitch=Math.asin(dir.y);P.roll=0;P.vSpeed=0;
   };
  });
  const trueState=p=>p.evaluate(()=>({pos:[P.pos.x,P.pos.y,P.pos.z],hdg:P.heading,pitch:P.pitch,spd:P.spd}));
  const shoot=async(max,until)=>{
   let n=0;
   for(;n<max;n++){
    const b=await trueState(B);
    await A.evaluate(b=>{if(P.alive&&state===ST.FLIGHT){window.__aim(b);firing=true;}animate();},b);
    await B.evaluate(()=>animate());await sleep(5);
    if(until&&await until())break;
   }
   await A.evaluate(()=>{firing=false;});
   return n;
  };
  const hullB=()=>B.evaluate(()=>SortieFeatures.Damage.hullPercent(P));
  let remoteTracers=0;
  const firstFrames=await shoot(240,async()=>{const r=await B.evaluate(()=>({hull:SortieFeatures.Damage.hullPercent(P),vis:bullets.filter(b=>b.visual).length,flash:!!duelSession.avatar&&duelSession.avatar.gunT!==0}));remoteTracers=Math.max(remoteTracers,r.vis);return r.hull<75;});
  report.remoteTracers=remoteTracers;
  assert.ok(remoteTracers>0,'the victim sees the shooter\'s tracers (cosmetic rounds from the avatar) while it is being fired at ('+remoteTracers+')');
  await frames(45);      // rounds already in the air still arrive; the last 'hit' is flushed every 0.1 s
  const hitA=await A.evaluate(()=>({sent:window.__hitSum,pending:duelSession.hitAcc,ammo:P.ammo}));
  const hullAfter=await hullB();
  report.burst={frames:firstFrames,sentPct:hitA.sent+hitA.pending,hullAfter,ammoLeft:hitA.ammo};
  assert.ok(hitA.sent>0,'bullets that reach the avatar send hit events');
  const expected=Duel_victim(hitA.sent+hitA.pending,'bf109');
  assert.ok(Math.abs((100-hullAfter)-expected)<=Math.max(3,expected*.15),'the victim loses what the shooter sent, divided by its toughness: sent '+(hitA.sent+hitA.pending).toFixed(1)+' -> '+expected.toFixed(1)+'% , lost '+(100-hullAfter).toFixed(1)+'%');
  const hits=await B.evaluate(()=>hitsTaken);assert.ok(hits>0,'the victim registers hits (flash, vignette, systems)');

  // ---- 4. shot down: the score agrees on both sides, B respawns protected ----
  await shoot(600,async()=>(await B.evaluate(()=>duelSession.match.them.kills+duelSession.match.me.deaths))>0);
  await A.evaluate(()=>{firing=false;});
  const down=await Promise.all([wait(B,()=>duelSession.match.me.deaths===1&&state===ST.DEAD&&!P.alive,null,20000),wait(A,()=>duelSession.match.me.kills===1,null,20000)]);
  assert.deepEqual(down,[true,true],'B is shot down and A is credited');
  const score1=await Promise.all([A,B].map(p=>p.evaluate(()=>({me:{...duelSession.match.me},them:{...duelSession.match.them},text:duelScoreText(),flash:document.getElementById('flash').textContent,hidden:planeGroup.visible}))));
  assert.deepEqual([score1[0].me,score1[0].them],[{kills:1,deaths:0},{kills:0,deaths:1}],'A sees 1 kill, 0 deaths');
  assert.deepEqual([score1[1].me,score1[1].them],[{kills:0,deaths:1},{kills:1,deaths:0}],'B sees 0 kills, 1 death: both boards agree');
  report.score1=score1.map(s=>s.text);
  assert.equal(score1[1].hidden,false,'the wreck is not drawn as an aeroplane');
  const avatarGone=await A.evaluate(()=>!duelSession.avatar.shown);assert.ok(avatarGone,'A no longer sees B\'s aeroplane');
  // B waits out RESPAWN seconds (sim time) and comes back with a full aeroplane, a new epoch and protection
  const sendHold=await A.evaluate(()=>{firing=false;return true;});
  let respawned=false;for(let i=0;i<420&&!respawned;i++){await frames(1,4);respawned=await B.evaluate(()=>P.alive&&state===ST.FLIGHT);}
  assert.ok(respawned,'B respawns after a few seconds');
  const b1=await snap(B);
  assert.equal(b1.epoch,1);assert.ok(b1.protect>0&&b1.protect<=3,'protected after the spawn ('+b1.protect.toFixed(2)+' s)');assert.ok(b1.hull>99,'a fresh aeroplane');assert.ok(b1.agl>500,'a new start in the air');
  assert.ok(gap(b1.pos,b0.pos)>500,'a different place');
  report.respawn={protect:b1.protect,hull:b1.hull,agl:Math.round(b1.agl)};
  // while protected, damage is ignored (even when it arrives)
  const prot=await B.evaluate(()=>{const before=P.hull;duelReceiveHit(40);return {before,after:P.hull};});
  assert.equal(prot.after,prot.before,'hits during the spawn protection do nothing');
  await frames(60);
  const seen=await A.evaluate(()=>({shown:duelSession.avatar.shown,epoch:duelSession.lastSample.epoch,prot:duelSession.avatar.protect}));
  assert.ok(seen.shown&&seen.epoch===1,'A sees the new aeroplane');
  // protection ends after the agreed time
  await frames(220);
  assert.equal(await B.evaluate(()=>duelSession.protectT),0,'the protection has run out');

  // ---- 5. second kill ends the match (first to 2): both show the result, the host's verdict is the same on both ----
  await A.evaluate(()=>{armGuns(acDef());updateGunUI();});         // a full magazine again (the first kill used much of it)
  const dbg=()=>Promise.all([A,B].map(p=>p.evaluate(()=>({kills:duelSession.match.me.kills,deaths:duelSession.match.me.deaths,them:{...duelSession.match.them},over:duelSession.match.over,finished:duelSession.finished,phase:duelSession.phase,
   alive:P.alive,state,hull:SortieFeatures.Damage.hullPercent(P),protect:duelSession.protectT,ammo:P.ammo,hitAcc:duelSession.hitAcc,hitSum:window.__hitSum,avatar:duelSession.avatar&&{shown:duelSession.avatar.shown,alive:duelSession.avatar.alive,prot:duelSession.avatar.protect,paused:duelSession.avatar.paused}}))));
  const used=await shoot(900,async()=>(await B.evaluate(()=>duelSession.finished))||(await A.evaluate(()=>duelSession.finished)));
  report.secondKillFrames=used;
  await A.evaluate(()=>{firing=false;});
  await frames(20);                  // the end of a match is evaluated in the frame loop of each device
  const over=await Promise.all([wait(A,()=>duelSession.finished,null,30000),wait(B,()=>duelSession.finished,null,30000)]);
  if(!over[0]||!over[1])console.log('DEBUG after the second burst',JSON.stringify(await dbg()));
  assert.deepEqual(over,[true,true],'the match ends on both devices');
  const res=await Promise.all([A,B].map(p=>p.evaluate(()=>({title:document.getElementById('rsTitle').textContent,shown:!document.getElementById('result').classList.contains('hidden'),go:document.getElementById('rsGo').textContent,
   me:{...duelSession.match.me},them:{...duelSession.match.them},winner:duelSession.match.winner,text:document.getElementById('rsText').textContent}))));
  report.result=res;
  assert.equal(res[0].title,'VICTORY');assert.equal(res[1].title,'DEFEAT');assert.ok(res[0].shown&&res[1].shown);assert.equal(res[0].go,'Rematch');
  assert.equal(res[0].me.kills,2);assert.equal(res[1].them.kills,2,'both agree on 2-0');

  // ---- 6. rematch returns to the lobby with the link still open; the duel mission is gone from slot 0 ----
  await Promise.all([A,B].map(p=>p.evaluate(()=>document.getElementById('rsGo').click())));
  const back=await Promise.all([A,B].map(p=>p.evaluate(()=>({lobby:!document.getElementById('duelLobby').classList.contains('hidden'),status:duelLink.status,slot0:MISSIONS[0].id,phase:duelSession.phase,bodyDuel:document.body.classList.contains('duel'),
   connected:!document.getElementById('dlConnected').hidden,opp:duelSession.opp&&duelSession.opp.name}))));
  report.back=back;
  for(const b of back){assert.ok(b.lobby&&b.connected,'back in the lobby, still connected');assert.equal(b.status,'open');assert.equal(b.slot0,'free','slot 0 is the free flight again');assert.equal(b.phase,'lobby');assert.ok(!b.bodyDuel);}

  // ---- 7. a second match, then B walks away: A wins by forfeit and is told ----
  await A.evaluate(()=>{document.getElementById('dlTarget').value='3';document.getElementById('dlStart').click();});
  const again=await Promise.all([wait(A,()=>duelSession.phase==='fight',null,90000),wait(B,()=>duelSession.phase==='fight',null,90000)]);
  assert.deepEqual(again,[true,true],'a rematch starts');
  await frames(60);
  await B.evaluate(()=>{togglePause();});
  await frames(5);
  const awayText=await A.evaluate(()=>({oppAway:duelSession.oppAway}));
  assert.equal(awayText.oppAway,true,'A is told that B paused');
  await B.evaluate(()=>{document.getElementById('pmMenu').click();});
  await A.evaluate(()=>animate());
  assert.ok(await wait(A,()=>duelSession&&duelSession.finished,null,20000),'A notices that B left');
  const forfeit=await A.evaluate(()=>({title:document.getElementById('rsTitle').textContent,winner:duelSession.match.winner,reason:duelSession.match.reason}));
  report.forfeit=forfeit;
  assert.equal(forfeit.title,'OPPONENT LEFT');assert.equal(forfeit.winner,'me');
  const bMenu=await B.evaluate(()=>({session:duelSession,menu:!document.getElementById('menu').classList.contains('hidden'),slot0:MISSIONS[0].id,bodyDuel:document.body.classList.contains('duel')}));
  assert.equal(bMenu.session,null,'the leaver has no duel session left');assert.ok(bMenu.menu);assert.equal(bMenu.slot0,'free');assert.ok(!bMenu.bodyDuel);

  report.packets=await Promise.all([A,B].map(p=>p.evaluate(()=>0)));
  fs.writeFileSync(path.join(root,'app/release/duel-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log(JSON.stringify(report));
  assert.deepEqual(errors,{A:[],B:[]},'no page errors');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
