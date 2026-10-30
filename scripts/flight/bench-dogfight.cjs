/* Dogfight bench: the brain (dogfight-ai.js) flying real FlightCore aircraft (FlightControl.ai, vector mode)
 * against stand-in players. Prints how varied, how dangerous and how safe the fighting is.
 *   node scripts/flight/bench-dogfight.cjs [runs] [seconds] [enemyKind] [playerKind]
 * Stand-ins: straight (level cruise), weaver (random bank reversals), evader (breaks when shot at), mirror (the same brain). */
const THREE=require('three');
global.FlightCore=require('../../flight-core.js');const FC=require('../../flight-control.js');const DF=require('../../dogfight-ai.js');
const F=global.FlightCore;
const runs=+process.argv[2]||6,seconds=+process.argv[3]||150,eKind=process.argv[4]||'bf109',pKind=process.argv[5]||'p47';
const G=9.81,dt=1/60;
function rngFor(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function spawn(kind,x,y,z,heading,spd){return {kind,pos:new THREE.Vector3(x,y,z),vel:new THREE.Vector3(Math.sin(heading)*spd,0,Math.cos(heading)*spd),spd,heading,pitch:0,roll:0};}
function specFor(kind,alt){const m=F.model(kind),mass=F.loadout(m,{fuel:70}).mass;
 return {stall:F.stallSpeed(m,alt,mass/m.mass),max:F.levelMaxSpeed(m,alt,mass*G),gLim:m.assumed.nLimit};}
function nose(e){return new THREE.Vector3(Math.sin(e.heading)*Math.cos(e.pitch),Math.sin(e.pitch),Math.cos(e.heading)*Math.cos(e.pitch));}

// ---- the Build 223 enemy (updateEnemyAir in remagen-mission.html), ported line for line onto plain vectors ----
function oldBrain(e,pl,plSpec,spec,st,rng,dt){
 const V3=THREE.Vector3;st.modeT=(st.modeT??0)-dt;st.evadeCd=Math.max(0,(st.evadeCd||0)-dt);st.weaveCd=Math.max(0,(st.weaveCd||0)-dt);
 if(!st.mode)st.mode='engage';
 const toP=pl.pos.clone().sub(e.pos),dist=toP.length(),n=nose(e),ahead=dist>1?n.dot(toP.clone().normalize()):1,agl=e.pos.y;
 const slow=e.spd<spec.stall*1.45;
 const playerBehind=dist<950&&ahead<.3&&nose(pl).dot(e.pos.clone().sub(pl.pos).normalize())>.88;
 if(agl<160&&e.pitch<.15){st.mode='pullup';st.modeT=Math.max(st.modeT,1.6);}
 else if(playerBehind&&st.evadeCd<=0&&!slow){st.evadeSide=-(st.evadeSide||1);st.evadeDive=agl>520&&e.spd>spec.stall*2.2;st.mode='break';st.modeT=1.7+rng()*.8;st.evadeCd=6+rng()*2;}
 else if(st.modeT<=0){
  if(st.mode==='engage'){
   if(dist<240||slow){st.mode='extend';st.modeT=2.5+rng()*1.2;}
   else if(dist<1700&&dist>440&&e.spd>spec.stall*1.8&&st.weaveCd<=0){st.evadeSide=-(st.evadeSide||1);st.mode='weave';st.modeT=1.5+rng()*.6;st.weaveCd=3.4+rng()*1.2;}
   else st.modeT=1.2;
  }else if(st.mode==='extend'){if(!slow&&dist>700){st.mode='climb';st.modeT=2.4+rng()*1.8;}else st.modeT=1.6;}
  else if(st.mode==='break'){st.mode='extend';st.modeT=1.4;}
  else if(st.mode==='weave'){st.mode='engage';st.modeT=2.4;}
  else{st.mode='engage';st.modeT=3+rng()*2.5;}
 }
 let aim,thr=spec.max;
 const side=new V3(Math.cos(e.heading),0,-Math.sin(e.heading));
 if(st.mode==='pullup'){aim=n.clone();aim.y=.75;}
 else if(st.mode==='break'||st.mode==='weave'){aim=n.clone().multiplyScalar(st.mode==='break'?.85:1.1).addScaledVector(side,st.evadeSide*(st.mode==='break'?.92:.82));aim.y+=(st.mode==='break'&&st.evadeDive)?-.28:.12;}
 else if(st.mode==='extend'){aim=e.pos.clone().sub(pl.pos).normalize();aim.y=Math.max(-.12,Math.min(.10,aim.y));}
 else if(st.mode==='climb'){aim=toP.clone().normalize();aim.y=.34;thr=spec.max*.92;}
 else{
  const tof=Math.min(2.2,dist/Math.max(120,e.spd+pl.spd*.5)),pv=nose(pl).multiplyScalar(pl.spd),lead=pl.pos.clone().addScaledVector(pv,tof);
  aim=lead.sub(e.pos).normalize();if(dist>500)aim.y+=.10;
  const corner=spec.stall*Math.sqrt(spec.gLim);thr=(dist<820&&ahead>.45)?Math.max(corner,pl.spd*1.12+8):spec.max;
 }
 if(agl<260&&aim.y<.05)aim.y=.05;
 return {aim:{x:aim.x,y:aim.y,z:aim.z},spd:thr,mode:st.mode};
}
const MODES=['engage','cover','zoom','yoyoHigh','yoyoLow','scissors','extend','brk','barrel','splitS','dive','jink','loop','climbTurn','return','pullout'];
let CR=120;
function run(seed,style,altStart,brainKind){CR=Math.min(120,.75*specFor(pKind,altStart).max);
 const rng=rngFor(seed*977+13);
 const en=spawn(eKind,0,altStart,0,0,150),pl=spawn(pKind,(rng()-.5)*1400,altStart+(rng()-.3)*300,1800+rng()*600,Math.PI+(rng()-.5)*.6,CR);
 const enSpec=specFor(eKind,altStart),plSpec=specFor(pKind,altStart);
 const SK=+process.env.SKILL||.85,tac=DF.create({kind:eKind,skill:SK,rng}),oldSt={},ptac=style==='mirror'?DF.create({kind:pKind,skill:.9,rng}):null;
 const target={pos:pl.pos,vel:pl.vel,spd:pl.spd};
 const jerk={roll:[],pitch:[],yaw:[]};let prevAtt=null,prevRate=null;
 const stats={jerk,fireFlagT:0,fireT:0,crashMode:null,gunT:0,passes:0,minAgl:1e9,stallT:0,crash:false,modeT:{},seq:[],tm:0,startBearings:[],playerShot:0};
 let weaverBank=0,weaverT=0,evadeT=0,evadeSide=1,prevMode='engage',gunRun=0;
 for(let i=0;i<seconds*60;i++){
  const t=i*dt;
  // ---- player stand-in ----
  if(style==='straight'){FC.ai(pl,dt,{x:Math.sin(pl.heading),y:0,z:Math.cos(pl.heading)},CR,{maxBank:1});}
  else if(style==='weaver'){weaverT-=dt;if(weaverT<=0){weaverBank=(rng()-.5)*2;weaverT=1.5+rng()*2.5;}
   const h=pl.heading+weaverBank*.9;FC.ai(pl,dt,{x:Math.sin(h),y:(rng()-.5)*.001,z:Math.cos(h)},CR*1.04,{maxBank:1.2});}
  else if(style==='evader'){evadeT-=dt;
   const toE=en.pos.clone().sub(pl.pos),d=toE.length(),behind=nose(pl).dot(toE.clone().normalize())<-.3&&d<900;
   if(behind&&evadeT<=0&&tac.gunOk){evadeT=2;evadeSide=rng()<.5?-1:1;}
   if(evadeT>0){const h=pl.heading+evadeSide*1.4;FC.ai(pl,dt,{x:Math.sin(h),y:-.15,z:Math.cos(h)},CR*1.25,{maxBank:1.35});}
   else FC.ai(pl,dt,{x:Math.sin(pl.heading),y:0,z:Math.cos(pl.heading)},CR*1.04,{maxBank:1});}
  else if(style==='mirror'){
   const pc={target:{pos:en.pos,vel:en.vel,spd:en.spd},spec:plSpec,agl:pl.pos.y,ceiling:7000,friends:[],rollNow:FC.rollNow(pl)};
   const o=DF.think(pl,ptac,pc,dt);FC.ai(pl,dt,o.aim,o.spd,o.opts);}
  // ---- enemy brain ----
  let out;
  if(brainKind==='old'){out=oldBrain(en,pl,plSpec,enSpec,oldSt,rng,dt);FC.ai(en,dt,out.aim,out.spd,{maxBank:1.3});tac.mode=out.mode;out.gun=false;}
  else{const ctx={target:{pos:pl.pos,vel:pl.vel,spd:pl.spd},spec:enSpec,agl:en.pos.y,ceiling:7000,friends:[],rollNow:FC.rollNow(en)};
   out=DF.think(en,tac,ctx,dt);FC.ai(en,dt,out.aim,out.spd,out.opts);}
  // ---- smoothness of what the eye sees: rate of change of the angular rates ----
  {const att={r:en.roll,p:en.pitch,h:en.heading};
   if(prevAtt){const w=a=>Math.atan2(Math.sin(a),Math.cos(a));const rate={r:w(att.r-prevAtt.r)/dt,p:w(att.p-prevAtt.p)/dt,h:w(att.h-prevAtt.h)/dt};
    if(prevRate){jerk.roll.push(Math.abs(rate.r-prevRate.r)/dt);jerk.pitch.push(Math.abs(rate.p-prevRate.p)/dt);jerk.yaw.push(Math.abs(rate.h-prevRate.h)/dt);}prevRate=rate;}
   prevAtt=att;}
  // ---- bookkeeping ----
  stats.minAgl=Math.min(stats.minAgl,en.pos.y);if(en.pos.y<20)stats.crash=true;
  if(en.coreStall>.4)stats.stallT+=dt;
  {const rel=pl.pos.clone().sub(en.pos),d=rel.length(),a=nose(en).dot(rel.clone().normalize());if(a>.965&&d>85&&d<680)stats.fireT+=dt;}
  if(process.env.TRACE&&i%10===0){stats.ring=stats.ring||[];stats.ring.push(`${t.toFixed(1)} ${tac.mode} y ${en.pos.y.toFixed(0)} spd ${en.spd.toFixed(0)} pitch ${(en.pitch*57.3).toFixed(0)} roll ${(en.roll*57.3).toFixed(0)} n ${(en.core&&en.core.n||0).toFixed(1)} aimY ${out.aim.y.toFixed(2)} hz ${tac.hazardT}`);if(stats.ring.length>40)stats.ring.shift();}
  if(en.pos.y<60&&!stats.crashMode&&process.env.TRACE){console.log('--- crash trace (style '+style+', seed '+seed+', alt '+altStart+')\n'+stats.ring.join('\n'));}
  if(en.pos.y<60&&!stats.crashMode)stats.crashMode=tac.mode+' pitch '+(en.pitch*57.3|0)+' spd '+(en.spd|0);
  if(out.fire)stats.fireFlagT+=dt;
  if(out.gun){stats.gunT+=dt;gunRun+=dt;}else{if(gunRun>.8)stats.playerShot++;gunRun=0;}
  stats.modeT[tac.mode]=(stats.modeT[tac.mode]||0)+dt;
  if(tac.mode!==prevMode){stats.seq.push(tac.mode);
   if(prevMode==='engage'){stats.passes++;
    const rel=en.pos.clone().sub(pl.pos);const nz=nose(pl);const az=Math.atan2(rel.x*nz.z-rel.z*nz.x,rel.x*nz.x+rel.z*nz.z),el=Math.atan2(rel.y,Math.hypot(rel.x,rel.z));
    stats.startBearings.push([az,el]);}
   prevMode=tac.mode;}
  if(pl.pos.y<150){pl.pos.y=150;pl.pitch=Math.max(pl.pitch,0);}   // the stand-in never crashes
 }
 return stats;
}
function entropy(arr){const c={};arr.forEach(x=>c[x]=(c[x]||0)+1);const n=arr.length||1;return -Object.values(c).reduce((a,v)=>a+v/n*Math.log2(v/n),0);}
const BRAIN=process.env.BRAIN||'new';
for(const style of ['straight','weaver','evader','mirror']){
 let agg={fireFlagT:0,jerk:{roll:[],pitch:[],yaw:[]},fireT:0,crashModes:[],gunT:0,passes:0,minAgl:1e9,stallT:0,crash:0,modeT:{},seq:[],bearings:[],shot:0};
 for(let k=0;k<runs;k++){const s=run(k+1,style,k%2?1200:2600,BRAIN);
  agg.gunT+=s.gunT;agg.fireT+=s.fireT;agg.fireFlagT+=s.fireFlagT;if(s.crashMode)agg.crashModes.push(s.crashMode);agg.passes+=s.passes;agg.minAgl=Math.min(agg.minAgl,s.minAgl);agg.stallT+=s.stallT;agg.crash+=s.crash?1:0;agg.shot+=s.playerShot;
  agg.seq.push(...s.seq);for(const k of ['roll','pitch','yaw'])agg.jerk[k].push(...s.jerk[k].filter((_,i)=>i%6===0));agg.bearings.push(...s.startBearings);for(const m in s.modeT)agg.modeT[m]=(agg.modeT[m]||0)+s.modeT[m];}
 const total=runs*seconds,mins=total/60;
 const grams=[];for(let i=0;i+2<agg.seq.length;i++)grams.push(agg.seq.slice(i,i+3).join('>'));
 const uniq=new Set(grams).size;
 const az=agg.bearings.map(b=>Math.abs(b[0])*57.3),el=agg.bearings.map(b=>b[1]*57.3);
 const sd=a=>{const m=a.reduce((x,y)=>x+y,0)/(a.length||1);return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/(a.length||1));};
 console.log(`\n== [${BRAIN} brain] ${eKind} vs ${style} ${pKind}: ${runs} runs x ${seconds} s ==`);
 console.log(`game-style firing geometry (nose within 15 deg, 85-680 m) ${(agg.fireT/mins).toFixed(1)} s/min | trigger down (brain bursts) ${(agg.fireFlagT/mins).toFixed(1)} s/min | tight gun solution ${(agg.gunT/mins).toFixed(1)} s/min | firing windows ${(agg.shot/mins).toFixed(2)}/min | passes ${(agg.passes/mins).toFixed(2)}/min | min height ${agg.minAgl.toFixed(0)} m | crashes ${agg.crash}/${runs}${agg.crashModes.length?' ['+agg.crashModes.join('; ')+']':''} | stalled ${(agg.stallT/mins).toFixed(1)} s/min`);
 console.log(`mode share: ${Object.entries(agg.modeT).sort((a,b)=>b[1]-a[1]).map(([m,v])=>m+' '+(100*v/total).toFixed(0)+'%').join(', ')}`);
 {const p=(a,q)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length*q)]||0;};console.log(`angular acceleration (rad/s2) p50/p95/p99.9: roll ${p(agg.jerk.roll,.5).toFixed(1)}/${p(agg.jerk.roll,.95).toFixed(1)}/${p(agg.jerk.roll,.999).toFixed(1)} | pitch ${p(agg.jerk.pitch,.5).toFixed(2)}/${p(agg.jerk.pitch,.95).toFixed(2)}/${p(agg.jerk.pitch,.999).toFixed(2)} | yaw ${p(agg.jerk.yaw,.5).toFixed(2)}/${p(agg.jerk.yaw,.95).toFixed(2)}/${p(agg.jerk.yaw,.999).toFixed(2)}`);}
 console.log(`variety: ${uniq} distinct 3-step sequences in ${grams.length} (${(100*uniq/Math.max(1,grams.length)).toFixed(0)}%), entropy of modes ${entropy(agg.seq).toFixed(2)} bit | attack bearing sd ${sd(az).toFixed(0)} deg, elevation sd ${sd(el).toFixed(0)} deg (n=${az.length})`);
}
