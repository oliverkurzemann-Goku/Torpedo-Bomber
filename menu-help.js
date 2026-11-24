/* Build 296: two menu dialogs shared by both games.
 *  - How to Play: a first-time player's walk through one sortie (shown once automatically, then from the menu button).
 *  - Graphics: every graphics option in one place, each with what it does and what it costs, plus an iPad recommendation.
 * The existing controls (selects, checkboxes) are MOVED into the dialogs, so their own handlers keep working unchanged. */
(function(root){
 'use strict';
 const STEPS={
  europe:[
   ['Pick a sortie and a difficulty','Start with <b>Circuits</b>: take-off and landing practice with nothing shooting at you. <b>Rookie</b> marks every target on the map. <b>Veteran</b> and <b>Ace</b> only give a <b>search area</b> (amber ring): you find the target yourself. Ace also has bigger rings, more fighters and accurate flak.'],
   ['Read the briefing','The chart shows your base (green), the targets or the search rings, a blue recon circle if there is one, and the route. The text says what counts for the objective and what is optional. Tap <b>Begin Sortie</b>.'],
   ['Take off','Push the <b>throttle bar</b> (right) to full. Keep the stick centred until the speed passes the take-off speed, then pull back gently. Once climbing: <b>GEAR</b> up, then <b>FLAPS ▲</b>.'],
   ['Find your way','The <b>arrow</b> at the top points at the next goal and says what it is: TARGET, SEARCH (a ring), PATROL, BASE. The <b>minimap</b> (bottom right) shows rings and found targets; tap it to pick another contact. The line under the arrow is your objective.'],
   ['Find and attack','In a search ring fly at about <b>1,000–2,000 ft</b> and look along roads and treelines. A target is marked once you have seen it (radio: <b>TARGET IN SIGHT</b>). A gun that fires at you gives itself away. <b>GUNS</b> fires the guns; <b>DROP</b> releases a bomb or rocket (the green cue shows where it lands).'],
   ['Come home and land','When the objective line says <b>RTB</b>, follow the arrow to the base. Throttle back, <b>GEAR</b> down, <b>FLAPS</b> down, hold the <b>REF</b> speed in the HUD, keep the wings level and touch down on the runway, then roll to a stop. The sortie is scored after you stop.']],
  pacific:[
   ['Pick a sortie and a difficulty','Start with <b>Carrier Qualification</b>: launches and deck landings, nobody shooting. <b>Rookie</b> marks the ships. <b>Veteran</b> and <b>Ace</b> only give a <b>search area</b> (amber ring): you find the ships yourself. Ace also adds Zeros and sharper flak.'],
   ['Read the briefing','The chart shows the carrier, the targets or the search rings and the route. The text says what must be sunk and what is optional. Tap <b>Begin Sortie</b>.'],
   ['Launch from the deck','Push the <b>throttle bar</b> (right) to full and keep the stick centred while you run down the deck; pull back gently near the bow. Once climbing: <b>GEAR</b> up, then <b>FLAPS ▲</b>.'],
   ['Find your way','The <b>arrow</b> at the top points at the next goal (TARGET, SEARCH, BASE). The <b>minimap</b> shows rings, found ships and the carrier; tap it to pick another contact.'],
   ['Find and attack','In a search ring fly at about <b>1,000–2,000 ft</b> and look for wakes. A ship is marked once seen. <b>Torpedo:</b> drop low (under 200 ft), level, slow enough (the cue turns green), at least 350 m out, from the ship\'s side. <b>Dive bombs (SBD):</b> dive steeply, release on the cue, pull out.'],
   ['Come home and land on the carrier','When the objective line says <b>RTB</b>, follow the arrow to the carrier. Fly the circuit, <b>GEAR</b>, <b>FLAPS</b> and <b>HOOK</b> down, hold the <b>REF</b> speed (green band), keep the sink gentle and catch a wire. A wave-off: power up and go round.']]
 };
 const HUD='<b>SPD</b> speed · <b>ALT</b> height · <b>VSI</b> climb/sink · <b>FUEL</b> · <b>HULL</b> damage · lamps <b>ENG FUEL GEAR HULL</b> turn amber/red when something is wrong. <b>II</b> pauses: orders, fuel and damage at a glance. <b>REALISTIC</b> switches to realistic flight (the stick commands load, not bank).';
 const GFX={
  quality:['Graphics quality','How much the GPU draws: resolution, shadows, glow, tree range, ground detail. <b>Low</b> is quickest, <b>High</b> is the best picture. <b>Auto</b> starts at Medium on an iPad and lowers detail when frames get slow.','Cost: High is the most work for the GPU (full resolution, soft shadows, glow, ambient occlusion); Low the least.'],
  frame:['Frame rate','<b>60 FPS</b> keeps the flight smooth by lowering the resolution a little when the GPU falls behind (detail stays). <b>30 FPS steady</b> draws every second frame at full resolution: sharp but less fluid. <b>Unlimited</b> draws as fast as it can; the frame rate then varies.','Recommended: 60 FPS.'],
  scenery:['Scenery','The landscape itself. <b>Ultra High</b> adds sky light, cloud shadows, relief shading and more ground detail; it is the most demanding setting. The standard scenery is lighter and still detailed.','Use Ultra on an iPad Pro (M1 or newer); otherwise the standard scenery.'],
  perf:['Performance overlay','Shows frames per second, frame time and what limits the game (CPU or GPU). Useful when something stutters: send a screenshot of it.','No cost worth mentioning.']
 };
 function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
 function dialog(id,title){
  const wrap=el('div','helpDialog hidden');wrap.id=id;wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label',title);
  const card=el('div','helpCard');const head=el('div','helpHead');head.append(el('h2',null,title));
  const close=el('button','helpClose','×');close.type='button';close.setAttribute('aria-label','Close');head.append(close);
  const body=el('div','helpBody');const foot=el('div','helpFoot');
  card.append(head,body,foot);wrap.append(card);document.body.append(wrap);
  wrap.addEventListener('pointerdown',e=>{if(e.target===wrap)api.close();});
  const api={wrap,body,foot,open(){wrap.classList.remove('hidden');},close(){wrap.classList.add('hidden');api.onClose?.();},get isOpen(){return !wrap.classList.contains('hidden');}};
  close.onclick=()=>api.close();return api;
 }
 function install(opt){
  const game=opt.game==='pacific'?'pacific':'europe',menu=document.getElementById(opt.menu||'menu');if(!menu)return null;
  const store=opt.storage||{getItem:k=>{try{return localStorage.getItem(k);}catch(e){return null;}},setItem:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}}};
  // ---- How to Play ----
  const how=dialog('howToPlay','How to Play');
  const list=el('ol','helpSteps');
  for(const [t,d] of STEPS[game]){const li=el('li');li.append(el('b',null,t),el('p',null,d));list.append(li);}
  how.body.append(list);
  const controls=el('section','helpSection');controls.append(el('h3',null,'Controls'));
  const guide=menu.querySelector('.quickGuide');
  if(guide){const div=guide.querySelector('div');if(div)controls.append(div);guide.remove();}   // the old guide text (with the live landing speed) moves in here
  how.body.append(controls);
  const hud=el('section','helpSection');hud.append(el('h3',null,'The display'),el('p',null,HUD));how.body.append(hud);
  const go=el('button','btn helpGo','Got it');go.type='button';go.onclick=()=>how.close();how.foot.append(go);
  how.onClose=()=>store.setItem(opt.seenKey,'1');
  // ---- Graphics ----
  const gfx=dialog('graphicsHelp','Graphics settings');
  const rec=el('p','helpRec','<b>Recommended for an iPad:</b> Graphics <b>High</b> and Frame rate <b>60 FPS</b>. If it still stutters, try Medium, then the standard scenery.');
  gfx.body.append(rec);
  const rows=[['quality',opt.graphics.quality],['frame',opt.graphics.frame],['scenery',opt.graphics.scenery],['perf',opt.graphics.perf]];
  for(const [key,id] of rows){
   const control=id&&document.getElementById(id),label=control&&control.closest('label');if(!label)continue;
   const [title,text,cost]=GFX[key],sec=el('section','helpSetting');
   sec.append(el('h3',null,title),label,el('p',null,text),el('p','helpCost',cost));gfx.body.append(sec);
  }
  const recBtn=el('button','btn helpGo','Use recommended');recBtn.type='button';
  recBtn.onclick=()=>{for(const [id,v] of [[opt.graphics.quality,'high'],[opt.graphics.frame,'hold60']]){const s=document.getElementById(id);if(s&&s.value!==v){s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));}}};
  const done=el('button','btn ghost helpGo','Done');done.type='button';done.onclick=()=>gfx.close();gfx.foot.append(recBtn,done);
  // ---- the two menu buttons ----
  const row=el('div','helpRow');
  const b1=el('button','btn ghost','How to Play');b1.type='button';b1.id='howToPlayBtn';b1.onclick=()=>how.open();
  const b2=el('button','btn ghost','Graphics');b2.type='button';b2.id='graphicsHelpBtn';b2.onclick=()=>gfx.open();
  row.append(b1,b2);
  const anchor=menu.querySelector(opt.after||'#logBtn');
  const after=anchor&&(anchor.closest('.menuRow')||anchor);
  if(after)after.after(row);else menu.querySelector('.menuOverview')?.append(row);
  // ---- shown once by itself, the first time the menu is open (not in automated test browsers) ----
  const auto=!opt.noAuto&&!(typeof navigator!=='undefined'&&navigator.webdriver)&&store.getItem(opt.seenKey)!=='1';
  if(auto){const t=setInterval(()=>{if(!menu.classList.contains('hidden')&&getComputedStyle(menu).display!=='none'){clearInterval(t);how.open();}},400);}
  return {how,gfx,row};
 }
 root.MenuHelp={install,STEPS,GFX};
})(typeof window!=='undefined'?window:globalThis);
