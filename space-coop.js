(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const protocol=1, stages=['search','recover','return','escort','boss','won','lost'];
 const scripts=['vendor/three-r128.min.js?v=128','vendor/GLTFLoader-r128.js?v=147','game-runtime.js?v=263',
  'space-coop-flight.js?v=263','space-coop-view.js?v=263','audio/throttle-response.js?v=218','audio/jet-engine.js?v=255'];
 let assets,link=null,ready=false,partnerReady=false,preparing=false,view=null,game=null,busy=false,output='';
 let stickInput={yaw:0,pitch:0},roll=false,fire=false,boost=false,keys=new Set(),audio=null;
 const inviteLink=code=>{
  const url=new URL(location.href);
  url.hash='';url.searchParams.set('v','263');
  if($('internet').checked)url.searchParams.set('internet','1');else url.searchParams.delete('internet');
  url.hash=code;
  return url.href;
 };
 const codeFrom=value=>DuelNet.clean(value);
 const say=text=>{$('status').textContent=text;};
 function reportError(error){
  if(error.name==='NotSupportedError'||error.name==='SecurityError')say('Die direkte Verbindung ist hier nicht verfügbar. Öffnet das Spiel in Safari oder Chrome.');
  else say(error.message||String(error));
 }
 function loadScript(src){
  return new Promise((resolve,reject)=>{
   const tag=document.createElement('script');
   tag.src=src;tag.onload=resolve;
   tag.onerror=()=>{tag.remove();reject(new Error('Spieldatei konnte nicht geladen werden. Bitte erneut versuchen.'));};
   document.head.append(tag);
  });
 }
 async function loadAssets(){
  if(!assets){
   assets=(async()=>{
    for(const src of scripts){
     if(![...document.scripts].some(s=>s.getAttribute('src')===src))await loadScript(src);
    }
    return new Promise((resolve,reject)=>new THREE.GLTFLoader().load('assets/aircraft/geheimer-jet.glb?v=1',
     gltf=>resolve(gltf.scene),undefined,()=>reject(new Error('Der Jet konnte nicht geladen werden. Bitte erneut versuchen.'))));
   })().catch(error=>{assets=null;throw error;});
  }
  return assets;
 }
 function outputCode(code,label){
  output=code;$('exchange').hidden=$('outRow').hidden=false;
  $('outLabel').textContent=label;$('outCode').value=code;
 }
 function inputCode(label,button,value=''){
  $('exchange').hidden=$('inRow').hidden=false;
  $('inLabel').textContent=label;$('confirm').textContent=button;$('inCode').value=value;
 }
 function clearInput(){
  keys.clear();
  if(pointer!==null&&stick.hasPointerCapture(pointer))stick.releasePointerCapture(pointer);
  pointer=null;roll=fire=boost=false;stickInput={yaw:0,pitch:0};
  $('stick').firstElementChild.style.transform='';
 }
 function notice(title,body,leave=false){
  $('notice').hidden=false;$('noticeTitle').textContent=title;$('noticeBody').textContent=body;
  $('dismiss').hidden=!leave;
 }
 function buttons(){
  $('host').disabled=$('join').disabled=$('confirm').disabled=busy;
  $('internet').disabled=busy||!!link;
  $('start').hidden=link?.role!=='host'||link.status!=='open';
  $('start').disabled=busy||!ready||!partnerReady;
 }
 function reset(){
  const old=link;link=null;old?.close();
  ready=partnerReady=preparing=busy=false;output='';
  if(game)cancelAnimationFrame(game.frame);
  if(view)view.dispose();
  if(audio){audio.context.close().catch(()=>{});audio=null;}
  game=view=null;clearInput();
  $('notice').hidden=$('flight').hidden=$('exchange').hidden=$('outRow').hidden=$('inRow').hidden=true;
  $('lobby').hidden=false;buttons();
 }
 function chooseLink(){
  const current=DuelNet.create({stun:$('internet').checked,onError:reportError});
  link=current;
  current.on('status',(status,info)=>{
   if(link!==current)return;
   if(status==='open'){
    say('Verbunden. Spiel wird vorbereitet.');
    if(game){game.lastRx=performance.now();return;}
    prepare(current);
   }else if(status==='closed'||status==='failed'||status==='lost'){
    if(game){
     if(game.finished)return;
     if(status==='lost')notice('Verbindung unterbrochen','Warte auf den zweiten Jet.');
     else{game.finished=true;notice('Verbindung beendet','Ihr könnt euch im Menü neu verbinden.',true);}
     clearInput();
    }else say(info||'Verbindung beendet. Eröffnet ein neues Spiel.');
   }
   buttons();
  });
  current.on('event',message=>{
   if(link!==current||!message||message.space!==protocol)return;
   if(message.t==='ready'){
    partnerReady=true;
    if(ready)say(current.role==='host'?'Beide bereit. Ihr könnt starten.':'Beide bereit. Warte auf den Start.');
    buttons();
   }else if(message.t==='start'&&current.role==='guest'&&ready&&partnerReady&&!game&&Number.isSafeInteger(message.seed)){
    begin(message.seed).catch(error=>{reset();reportError(error);});
   }else if(message.t==='end'&&current.role==='guest'&&game&&validWorld(message.world)){
    game.snapshot=message.world;finish(game);
   }
  });
  current.on('state',message=>{
   if(link!==current||!game||!message||message.space!==protocol||!Number.isSafeInteger(message.seq)||message.seq<=game.rx)return;
   if(game.index===1&&!validWorld(message.world))return;
   if(!SpaceCoopFlight.readPilot(game.remote,message.jet))return;
   game.rx=message.seq;game.lastRx=performance.now();game.remoteVisible=message.away!==true;
   if(game.index===1&&!game.finished)game.snapshot=message.world;
  });
  return current;
 }
 async function prepare(current){
  if(ready||preparing)return;
  preparing=true;
  try{
   await loadAssets();
   if(link!==current)return;
   ready=true;
   current.sendEvent({t:'ready',space:protocol});
   say(partnerReady?(current.role==='host'?'Beide bereit. Ihr könnt starten.':'Beide bereit. Warte auf den Start.'):'Warte, bis der zweite Jet geladen ist.');
  }catch(error){
   if(link===current){reset();reportError(error);}
  }finally{if(link===current){preparing=false;buttons();}}
 }
 function work(fn){
  return async()=>{
   if(busy)return;
   busy=true;buttons();
   try{await fn();}catch(error){reportError(error);}
   finally{busy=false;buttons();}
  };
 }
 $('host').onclick=work(async()=>{
  reset();busy=true;buttons();
  const current=chooseLink();
  say('Einladung wird erstellt …');
  try{
   const invite=await current.createInvite();
   if(link!==current)return;
   outputCode(invite,'Einladung an den zweiten Spieler');
   inputCode('Antwort vom zweiten Spieler','Verbinden');
   say('Einladungslink teilen. Danach den Antwortlink hier einfügen.');
  }catch(error){if(link===current)reset();throw error;}
 });
 $('join').onclick=()=>{
  reset();
  inputCode('Einladung vom ersten Spieler','Antwort erstellen',codeFrom(location.hash));
  say('Einladungslink oder Code einfügen.');
 };
 $('confirm').onclick=work(async()=>{
  const code=codeFrom($('inCode').value);
  if(!code||code.length>24000)throw new Error('Bitte den vollständigen Link oder Code einfügen.');
  if(link?.role==='host'){
   say('Die Geräte verbinden sich …');
   await link.acceptAnswer(code);
   return;
  }
  if(link){const previous=link;link=null;previous.close();}
  const current=chooseLink();
  say('Antwort wird erstellt …');
  try{
   const answer=await current.acceptInvite(code);
   if(link!==current)return;
   $('inRow').hidden=true;
   outputCode(answer,'Antwort an den ersten Spieler');
   say('Antwortlink mit dem ersten Spieler teilen.');
  }catch(error){
   if(link===current){link=null;current.close();}
   throw error;
  }
 });
 $('share').onclick=async()=>{
  const url=inviteLink(output);
  if(navigator.share&&/^https?:/.test(url)){
   try{await navigator.share({title:'Weltraum-Koop',url});return;}
   catch(error){if(error.name==='AbortError')return;}
  }
  try{
   await navigator.clipboard.writeText(url);
   say('Link kopiert.');
  }catch(_){
   $('outCode').focus();$('outCode').select();say('Den markierten Code kopieren und teilen.');
  }
 };
 function validWorld(s){
  return s&&stages.includes(s.stage)&&Array.isArray(s.shuttle)&&s.shuttle.length===3&&s.shuttle.every(Number.isFinite)
   &&['shields','down','cells','generators'].every(k=>Array.isArray(s[k])&&s[k].length===2)
   &&Number.isFinite(s.core)&&Number.isFinite(s.escort)
   &&Array.isArray(s.drones)&&s.drones.length<=5&&s.drones.every(d=>Array.isArray(d)&&d.length===7&&d.every(Number.isFinite))
   &&Array.isArray(s.shots)&&s.shots.length<=42&&s.shots.every(d=>Array.isArray(d)&&d.length===8&&d.every(Number.isFinite));
 }
 async function begin(seed){
  const current=link,template=await loadAssets();
  if(link!==current||current.status!=='open')throw new Error('Die Verbindung wurde vor dem Start unterbrochen.');
  const T=THREE,F=SpaceCoopFlight,index=current.role==='host'?0:1,world=F.createWorld(T,seed),rules=F.mission(T,world,seed);
  const pilots=[F.pilot(T,0),F.pilot(T,1)],remote=F.pilot(T,1-index);
  view=SpaceCoopView.create(T,$('viewport'),world,template,rules.nodes);
  game={index,pilots,remote,rules,world,step:F.flight(T),snapshot:rules.snapshot(),remoteVisible:true,
   rx:-1,seq:0,lastRx:performance.now(),time:performance.now(),send:0,finished:false,seconds:0};
  $('lobby').hidden=true;$('flight').hidden=false;$('notice').hidden=true;
  $('throttle').value='45';
  if(index===0&&!current.sendEvent({t:'start',space:protocol,seed})){
   reset();throw new Error('Das Startsignal konnte nicht gesendet werden.');
  }
  const activeView=view;
  view.canvas.addEventListener('webglcontextlost',event=>{
   if(view!==activeView)return;
   event.preventDefault();reset();say('Die Grafikverbindung ist abgebrochen. Startet ein neues Spiel.');
  },{once:true});
  game.frame=requestAnimationFrame(frame);
 }
 function unlockAudio(){
  if(audio||!(window.AudioContext||window.webkitAudioContext))return;
  try{
   const context=new (window.AudioContext||window.webkitAudioContext)();
   audio={context,engine:null,pulse:0};
   context.resume().catch(()=>{});
  }catch(_){}
 }
 $('flight').addEventListener('pointerdown',unlockAudio);
 function updateAudio(g,p,dt,active){
  if(!audio)return;
  const {context}=audio;
  if(!audio.engine)audio.engine=JetEngine.create(context,context.destination);
  audio.engine.update(dt,p.boost?1:p.throttle*.72,active&&!g.snapshot.down[g.index],0,p.fire?.65:0);
  audio.pulse-=dt;
  if(active&&p.fire&&audio.pulse<=0){
   const osc=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
   osc.type='triangle';osc.frequency.setValueAtTime(640,now);osc.frequency.exponentialRampToValueAtTime(180,now+.10);
   gain.gain.setValueAtTime(.042,now);gain.gain.exponentialRampToValueAtTime(.001,now+.11);
   osc.connect(gain);gain.connect(context.destination);osc.start();osc.stop(now+.11);audio.pulse=.18;
  }
 }
 $('start').onclick=work(async()=>{
  if(!link||link.status!=='open'||!ready||!partnerReady||game)return;
  unlockAudio();
  try{await begin(crypto.getRandomValues(new Uint32Array(1))[0]);}
  catch(error){reset();throw error;}
 });
 function finish(g){
  if(g.finished)return;
  g.finished=true;clearInput();
  const won=g.snapshot.stage==='won';
  notice(won?'Frachter gerettet':'Mission gescheitert',
   won?'Ihr habt den Frachter gemeinsam in Sicherheit gebracht und das Mutterschiff besiegt.':'Der Frachter oder beide Jets wurden außer Gefecht gesetzt.',true);
 }
 const objective={
  search:'Notsignal finden',recover:'Zwei Energiezellen bergen',return:'Zum Frachter zurück',escort:'Frachter zum Sprungtor begleiten',
  boss:'Mutterschiff ausschalten',won:'Mission erfüllt',lost:'Mission gescheitert'
 };
 const hud={reticle:$('reticle'),target:$('target'),wingman:$('wingman'),radar:$('radar')};
 let shuttle;
 function updateHud(g,p,s){
  let goal=shuttle.fromArray(s.shuttle),label=objective[s.stage];
  if(s.stage==='recover'){
   const available=g.world.cells.filter((_,i)=>!s.cells[i]);
   goal=available.reduce((a,b)=>p.position.distanceToSquared(a)<p.position.distanceToSquared(b)?a:b,available[0]||goal);
   label+=' · '+s.cells.filter(Boolean).length+'/2';
  }
  if(s.stage==='boss'){
   const available=g.rules.nodes.filter((_,i)=>s.generators[i]>0);
   goal=available.reduce((a,b)=>p.position.distanceToSquared(a)<p.position.distanceToSquared(b)?a:b,available[0]||g.world.boss);
   label=available.length?'Schildgeneratoren · '+available.length+'/2':'Kern treffen · '+s.core;
  }
  if(s.stage==='escort')label+=' · Hülle '+s.escort+'/10';
  if(s.down[g.index])label='Jet ausgefallen · Warte auf deinen Partner';
  else if(s.down[1-g.index]){label='Partner retten · 2 Sekunden in seiner Nähe bleiben';goal=g.pilots[1-g.index].position;}
  const speed=Math.round(p.speed*3.6),shield=s.shields[g.index],partner=s.shields[1-g.index];
  $('meters').textContent=speed+' km/h · Schild '+shield+'/4 · Partner '+partner+'/4';
  $('objective').textContent=label;
  $('distance').textContent='Ziel '+Math.round(p.position.distanceTo(goal))+' m · Partner '+Math.round(p.position.distanceTo(g.pilots[1-g.index].position))+' m';
  $('boost').textContent=p.boost?'BOOST':p.cooldown>0?p.cooldown.toFixed(1)+' s':'BOOST';
  $('hint').hidden=g.seconds>14;
  return goal;
 }
 function frame(now){
  const g=game;if(!g)return;
  const dt=Math.min(.05,Math.max(0,(now-g.time)/1000));
  g.time=now;
  const p=g.pilots[g.index],other=g.pilots[1-g.index],current=link;
  const paused=current.status!=='open'||now-g.lastRx>1700||!g.remoteVisible||document.hidden;
  if(!g.finished&&!paused){
   $('notice').hidden=true;g.seconds+=dt;
   other.position.lerp(g.remote.position,1-Math.exp(-dt*22));
   other.rotation.slerp(g.remote.rotation,1-Math.exp(-dt*22));
   other.speed=g.remote.speed;other.bank=g.remote.bank;other.fire=g.remote.fire;other.boost=g.remote.boost;
   if(!g.snapshot.down[g.index]){
    g.step(p,{
     yaw:stickInput.yaw+Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),
     pitch:stickInput.pitch+Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')),
     roll:Number(roll||keys.has('KeyE'))-Number(keys.has('KeyQ')),
     throttle:Number($('throttle').value)/100,fire:fire||keys.has('KeyF')||keys.has('Space'),boost
    },dt);
   }else{p.fire=false;p.boost=false;}
   if(g.index===0)g.rules.step(g.pilots,dt);
  }else if(!g.finished){
   notice('Flug wartet','Beide Spieler müssen im Flugfenster verbunden sein.');
  }
  boost=false;
  if(g.index===0&&!g.finished&&!paused)g.snapshot=g.rules.snapshot();
  if(!g.finished&&(g.snapshot.stage==='won'||g.snapshot.stage==='lost')){
   if(g.index===0)current.sendEvent({t:'end',space:protocol,world:g.snapshot});
   finish(g);
  }
  if(!g.finished&&(g.send-=dt)<=1e-6){
   sendState(g,document.hidden);g.send+=.05;
  }
  if(!shuttle)shuttle=new THREE.Vector3();
  updateAudio(g,p,dt,!paused&&!g.finished);
  const goal=updateHud(g,p,g.snapshot);
  view.draw(g.pilots,g.snapshot,g.index,goal,paused||g.finished?0:dt,hud);
  if(!g.finished)g.frame=requestAnimationFrame(frame);
 }
 function sendState(g,away){
  link.sendState({space:protocol,seq:++g.seq,away,jet:SpaceCoopFlight.packPilot(g.pilots[g.index]),
   world:g.index===0?g.snapshot:undefined});
 }
 let pointer=null;
 const stick=$('stick');
 function steer(e){
  const command=GameRuntime.stickInput(stick.getBoundingClientRect(),e.clientX,e.clientY,false);
  stickInput={yaw:-command.roll,pitch:command.pitch};
  stick.firstElementChild.style.transform='translate('+command.knobX+'px,'+command.knobY+'px)';
 }
 stick.onpointerdown=e=>{
  if(!game||pointer!==null)return;
  pointer=e.pointerId;stick.setPointerCapture(pointer);steer(e);
 };
 stick.onpointermove=e=>{if(e.pointerId===pointer)steer(e);};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{
  if(e.pointerId!==pointer)return;
  pointer=null;stickInput={yaw:0,pitch:0};stick.firstElementChild.style.transform='';
 });
 function hold(id,handler){
  const button=$(id);let held=null;
  button.onpointerdown=e=>{if(held!==null)return;held=e.pointerId;button.setPointerCapture(held);handler(true);};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{
   if(e.pointerId===held){held=null;handler(false);}
  });
 }
 hold('roll',on=>{roll=on;});hold('fire',on=>{fire=on;});
 $('boost').onclick=()=>{boost=true;};
 window.addEventListener('keydown',e=>{
  if(!game||game.finished||e.target===$('throttle'))return;
  if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault();
  unlockAudio();
  if(e.code==='KeyJ'&&!e.repeat)boost=true;
  keys.add(e.code);
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',clearInput);
 document.addEventListener('visibilitychange',()=>{
  clearInput();
  if(game&&!game.finished)sendState(game,document.hidden);
 });
 window.addEventListener('pagehide',()=>{link?.close();});
 window.addEventListener('pageshow',e=>{if(e.persisted){reset();say('Bitte erneut verbinden.');}});
 $('leave').onclick=$('dismiss').onclick=()=>{reset();say('Eröffnet ein neues Spiel oder fügt eine Einladung ein.');};
 const incoming=codeFrom(location.hash);
 if(incoming){
  history.replaceState(null,'',location.pathname+location.search);
  if(incoming.startsWith('TB1.o')){
   $('internet').checked=new URLSearchParams(location.search).get('internet')==='1';
   inputCode('Einladung vom ersten Spieler','Antwort erstellen',incoming);
   say('Einladung empfangen. Erstellt eine Antwort und teilt sie mit dem ersten Spieler.');
  }else{
   say('Antwortlink empfangen. Fügt ihn im bereits geöffneten Spiel beim ersten Spieler ein.');
  }
 }
})();
