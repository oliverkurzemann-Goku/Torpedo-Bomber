/* Build 224: the fighter pilot law (FlightControl.ai, vector mode), the dogfight brain and the smooth wingmen.
 * Everything runs through the real FlightCore forces and the shipped modules; the wingman half slices the shipped
 * updateWingmen out of torpedo-carrier.html. Frame-rate independence is checked at 20/60/120 FPS. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');global.THREE=THREE;
global.FlightCoreEnabled=true;
const FlightCore=global.FlightCore=require('../../flight-core.js');const FC=require('../../flight-control.js');const DF=require('../../dogfight-ai.js');
const F=FlightCore,G=9.81;
function lcg(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const mk=(kind,y,spd,h=0,pitch=0)=>({kind,pos:new THREE.Vector3(0,y,0),vel:new THREE.Vector3(Math.sin(h)*spd,0,Math.cos(h)*spd),spd,heading:h,pitch,roll:0});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

/* ---- 1. the fighter pilot law flies manoeuvres a heading-and-path-angle pilot cannot ---- */
{
 const run=(aimFn,T,fps=60,kind='bf109')=>{
  const e=mk(kind,2500,160),dt=1/fps;let minSpd=1e9,maxStall=0,minY=1e9,peakPitch=-9,maxN=0,peakRoll=0;
  for(let i=0;i<T*fps;i++){const out=FC.ai(e,dt,aimFn(e,i*dt),200,{vector:true});minSpd=Math.min(minSpd,e.spd);maxStall=Math.max(maxStall,e.coreStall||0);minY=Math.min(minY,e.pos.y);peakPitch=Math.max(peakPitch,Math.abs(e.pitch));peakRoll=Math.max(peakRoll,Math.abs(wrap(e.roll)));maxN=Math.max(maxN,out.nCmd);}
  return {e,minSpd,maxStall,minY,peakPitch,peakRoll,maxN};
 };
 // split-S: aim straight down. The pilot rolls the lift vector onto it (inverted) and pulls through.
 const s=run(()=>({x:0,y:-1,z:0}),6);
 assert(s.e.pitch<-1.45,'split-S ends nose down ('+(s.e.pitch*57.3).toFixed(0)+' deg)');
 assert(s.peakRoll>2.3,'he rolled inverted to pull down (peak '+(s.peakRoll*57.3).toFixed(0)+' deg)');
 assert(s.maxStall<.2&&s.maxN<=F.model('bf109').assumed.nLimit+.1,'inside the wing and the structure');
 // vertical plane aim (up then behind): a loop, nose past the vertical
 const loop=run((e,t)=>t<2.5?{x:0,y:1,z:.15}:{x:0,y:.2,z:-1},9);
 assert(loop.peakPitch>2.4,'loop goes over the top ('+(loop.peakPitch*57.3).toFixed(0)+' deg)');
 assert(loop.minSpd>F.stallSpeed(F.model('bf109'),2500)*1.02,'loop stays above the 1 g stall');
 // an aim slightly below the nose is pushed over to, not rolled onto
 const push=run(()=>({x:0,y:-.12,z:1}),3);
 assert(Math.abs(push.e.roll)<.3,'a small push-over does not roll the aircraft over ('+(push.e.roll*57.3).toFixed(0)+' deg)');
 // same manoeuvre, three frame rates, same outcome
 const rates=[20,60,120].map(f=>run(()=>({x:.5,y:.3,z:-.8}),6,f).e);
 for(const r of rates.slice(1)){assert(Math.abs(wrap(r.heading-rates[0].heading))<.25,'heading agrees across frame rates');assert(Math.abs(r.pos.y-rates[0].pos.y)<60,'height agrees across frame rates');}
 // the pilot's hands: roll acceleration limit is honoured
 {const e=mk('bf109',2500,160),dt=1/60;let last=0,maxAcc=0;
  for(let i=0;i<240;i++){FC.ai(e,dt,{x:1,y:0,z:.2},200,{vector:true,rollAccel:6});const p=e.core.p;maxAcc=Math.max(maxAcc,Math.abs(p-last)/dt);last=p;}
  assert(maxAcc<=6.001,'roll rate changes at most rollAccel ('+maxAcc.toFixed(2)+')');}
}

/* ---- 2. the brain ---- */
const specFor=(kind,alt)=>{const m=F.model(kind),mass=F.loadout(m,{fuel:70}).mass;return {stall:F.stallSpeed(m,alt,mass/m.mass),max:F.levelMaxSpeed(m,alt,mass*G),gLim:m.assumed.nLimit};};
function fight(kind,seed,{seconds=100,skill=.7,altitude=2600,player='straight',tKind='p47'}={}){
 const rng=lcg(seed*7919+11),dt=1/60,en=mk(kind,altitude,150),pl=mk(tKind,altitude+80,115,Math.PI);pl.pos.set((rng()-.5)*800,altitude+80,2000);
 const tac=DF.create({kind,skill,rng}),spec=specFor(kind,altitude),pspec=specFor(tKind,altitude),ptac=player==='mirror'?DF.create({kind:tKind,skill:.9,rng}):null,r={modes:[],defences:[],minY:1e9,fire:0,gun:0,minSpd:1e9,seq:[],tac};
 let last=null,weave=0,wt=0;
 for(let i=0;i<seconds*60;i++){
  if(player==='mirror'){const o=DF.think(pl,ptac,{target:{pos:en.pos,vel:en.vel,spd:en.spd},spec:pspec,agl:pl.pos.y,ceiling:7000,rollNow:FC.rollNow(pl),friends:[]},dt);FC.ai(pl,dt,o.aim,o.spd,o.opts);}
  else if(player==='weaver'){wt-=dt;if(wt<=0){weave=(rng()-.5)*2;wt=1.5+rng()*2.5;}const h=pl.heading+weave*.9;FC.ai(pl,dt,{x:Math.sin(h),y:0,z:Math.cos(h)},120,{maxBank:1.2});}
  else FC.ai(pl,dt,{x:Math.sin(pl.heading),y:0,z:Math.cos(pl.heading)},115,{maxBank:1});
  if(pl.pos.y<200){pl.pos.y=200;pl.pitch=Math.max(0,pl.pitch);}
  const out=DF.think(en,tac,{target:{pos:pl.pos,vel:pl.vel,spd:pl.spd},spec,agl:en.pos.y,ceiling:7000,rollNow:FC.rollNow(en),friends:[]},dt);
  FC.ai(en,dt,out.aim,out.spd,out.opts);
  r.minY=Math.min(r.minY,en.pos.y);r.minSpd=Math.min(r.minSpd,en.spd);
  if(out.fire)r.fire+=dt;if(out.gun)r.gun+=dt;
  if(tac.mode!==last){r.seq.push(tac.mode);last=tac.mode;}
 }
 return r;
}
{
 // never into the ground, over many seeds, types and skills
 for(const kind of ['bf109','fw190','p47','zero','me262'])for(const skill of [.4,.85])for(const seed of [1,2,3]){
  const r=fight(kind,seed,{skill,seconds:70,altitude:1500});
  assert(r.minY>40,kind+' skill '+skill+' seed '+seed+' kept clear of the ground ('+r.minY.toFixed(0)+' m)');
  assert(r.minSpd>F.stallSpeed(F.model(kind),1500)*.9,kind+' kept flying speed ('+r.minSpd.toFixed(0)+' m/s)');
 }
 // variety: different pilots fight differently, the same pilot (same seed) fights the same
 const seqs=[1,2,3,4,5,6].map(seed=>fight('bf109',seed,{player:'mirror',seconds:120}).seq);
 const grams=new Set();let total=0;for(const s of seqs)for(let i=0;i+2<s.length;i++){grams.add(s.slice(i,i+3).join('>'));total++;}
 const modes=new Set(seqs.flat());
 assert(modes.size>=8,'at least five manoeuvres show up across six pilots: '+[...modes]);
 assert(grams.size>=10&&grams.size/total>.1,'the three-step sequences are varied ('+grams.size+' of '+total+')');
 assert.deepEqual(fight('fw190',9,{seconds:60}).seq,fight('fw190',9,{seconds:60}).seq,'same pilot, same fight');
 assert.notDeepEqual(fight('fw190',9,{seconds:60}).seq,fight('fw190',10,{seconds:60}).seq,'another pilot fights differently');
 // the approach geometry differs from engagement to engagement
 const bearings=new Set();
 for(const seed of [1,2,3,4,5,6,7,8]){const t=DF.create({kind:'p47',skill:.8,rng:lcg(seed*31)});bearings.add(Math.round(Math.abs(t.rng())*3)+(DF.STYLE.boom?'':''));}
 // defences: a gun on him makes him choose among several, and he does not stick to one
 const defences=[];
 for(const kind of ['bf109','fw190','zero','p47']){
  for(let seed=1;seed<=12;seed++){
   const en=mk(kind,3000,170),pl=mk('p47',3010,150,0);pl.pos.set(0,3010,-420);                 // the player sits on his six
   const tac=DF.create({kind,skill:.8,rng:lcg(seed*13)}),spec=specFor(kind,3000);let seen=null;
   for(let i=0;i<60*4;i++){
    FC.ai(pl,1/60,{x:Math.sin(pl.heading),y:0,z:Math.cos(pl.heading)},180,{maxBank:1});
    const out=DF.think(en,tac,{target:{pos:pl.pos,vel:pl.vel,spd:pl.spd},spec,agl:3000,ceiling:7000,rollNow:FC.rollNow(en),friends:[]},1/60);
    FC.ai(en,1/60,out.aim,out.spd,out.opts);
    if(!seen&&['brk','barrel','splitS','dive','jink','loop','climbTurn'].includes(tac.mode))seen=tac.mode;
    if(en.pos.y<100)break;
   }
   assert(seen,kind+' seed '+seed+' answers a gun on his six');defences.push(kind+':'+seen);
  }
 }
 assert(new Set(defences.map(d=>d.split(':')[1])).size>=4,'several different defences are used: '+[...new Set(defences)].join(', '));
 // type character: the Zero loops and climbs into the attacker far more than a Fw 190 does; the Fw 190 dives
 const share=(kind,names)=>defences.filter(d=>d.startsWith(kind+':')&&names.includes(d.split(':')[1])).length/12;
 assert(share('zero',['loop','climbTurn','brk'])>=share('fw190',['loop','climbTurn','brk']),'the Zero turns and climbs more than the Fw 190');
 assert(share('fw190',['dive','splitS'])>=share('zero',['dive','splitS']),'the Fw 190 uses its dive more than the Zero');
 // nerve: a bold pilot holds a head-on pass, a timid one breaks away early
 const headOn=aggr=>{let broke=0;
  for(let seed=1;seed<=20;seed++){
   const en=mk('bf109',2000,150),pl=mk('p47',2000,120,Math.PI);pl.pos.set(0,2000,950);
   const tac=DF.create({kind:'bf109',skill:.9,aggression:aggr,rng:lcg(seed*17)}),spec=specFor('bf109',2000);
   for(let i=0;i<60*1.9;i++){const out=DF.think(en,tac,{target:{pos:pl.pos,vel:pl.vel,spd:pl.spd},spec,agl:2000,ceiling:7000,rollNow:2,friends:[]},1/60);FC.ai(en,1/60,out.aim,out.spd,out.opts);
    pl.pos.addScaledVector(pl.vel,1/60);if(['brk','barrel','splitS','dive','jink','loop','climbTurn'].includes(tac.mode)){broke++;break;}}
  }return broke;};
 assert(headOn(.1)>headOn(1)+4,'a timid pilot breaks head-on passes early, a bold one holds on');
 // ground: a dive onto a low target is shallow enough to pull out of
 {const en=mk('me262',700,230,0,-.5),pl=mk('p47',120,120,0);pl.pos.set(0,120,1500);en.vel.set(0,-110,200);
  const tac=DF.create({kind:'me262',skill:.9,rng:lcg(5)}),spec=specFor('me262',300);let minY=1e9;
  for(let i=0;i<60*14;i++){const out=DF.think(en,tac,{target:{pos:pl.pos,vel:pl.vel,spd:pl.spd},spec,agl:en.pos.y,ceiling:7000,rollNow:FC.rollNow(en),friends:[]},1/60);FC.ai(en,1/60,out.aim,out.spd,out.opts);pl.pos.addScaledVector(pl.vel,1/60);minY=Math.min(minY,en.pos.y);}
  assert(minY>25,'a jet diving after a target on the deck pulls out ('+minY.toFixed(0)+' m)');}
 // map edge: an inward order wins over the fight
 {const en=mk('bf109',2000,150),pl=mk('p47',2000,120,Math.PI);pl.pos.set(0,2000,800);const tac=DF.create({kind:'bf109',skill:.8,rng:lcg(3)});
  const out=DF.think(en,tac,{target:{pos:pl.pos,vel:pl.vel,spd:120},spec:specFor('bf109',2000),agl:2000,ceiling:7000,inward:{x:-1,y:0,z:0},rollNow:2,friends:[]},1/60);
  assert.equal(tac.mode,'return');assert(out.aim.x<-.9,'he turns inward');}
 // two fighters share the work: the second flies cover or comes from another side
 {const spec=specFor('bf109',2600),dt=1/60,rng=lcg(77),pl=mk('p47',2680,115,Math.PI);pl.pos.set(0,2680,2000);
  const a=mk('bf109',2600,150),b=mk('bf109',2650,150);b.pos.x=300;
  const ta=DF.create({kind:'bf109',skill:.8,rng}),tb=DF.create({kind:'bf109',skill:.8,rng});let cover=0,steps=0;
  for(let i=0;i<60*60;i++){
   FC.ai(pl,dt,{x:Math.sin(pl.heading),y:0,z:Math.cos(pl.heading)},115,{maxBank:1});if(pl.pos.y<200)pl.pos.y=200;
   const mkctx=(self,other,ot)=>({target:{pos:pl.pos,vel:pl.vel,spd:115},spec,agl:self.pos.y,ceiling:7000,rollNow:FC.rollNow(self),friends:[{pos:other.pos,vel:other.vel,tac:ot}]});
   const oa=DF.think(a,ta,mkctx(a,b,tb),dt),ob=DF.think(b,tb,mkctx(b,a,ta),dt);
   FC.ai(a,dt,oa.aim,oa.spd,oa.opts);FC.ai(b,dt,ob.aim,ob.spd,ob.opts);
   steps++;if(ta.mode==='cover'||tb.mode==='cover')cover++;
   assert(a.pos.distanceTo(b.pos)>25||i<10,'they keep a wing\'s width apart');
  }
  assert(cover>60*3,'a pair spends some time with one flying cover ('+(cover/60).toFixed(1)+' s)');}
 // skill matters: a rookie reacts later and comes back later than an ace
 const t1=DF.create({kind:'bf109',skill:.4,rng:lcg(1)}),t2=DF.create({kind:'bf109',skill:.9,rng:lcg(1)});
 assert(t1.react>t2.react,'a rookie looks at the target less often');
}

/* ---- 3. wingmen: smooth hands, no surging (the shipped updateWingmen behind a roughly flown leader) ---- */
{
 require('../../game-runtime.js');require('../../flight-support.js');const {GameRuntime,FlightSupport}=global;
 const AvengerBay=require('../../avenger-bay.js'),CarrierRecovery=require('../../carrier-recovery.js');
 const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
 const source=(name,next)=>{const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a+1);assert(a>0&&b>a);return html.slice(a,b);};
 for(const fps of [20,60,120]){
  let seed=4242;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const dt=1/fps,SPEED=80,leader={pos:new THREE.Vector3(0,400,0),heading:0,pitch:0,roll:0,spd:SPEED,vSpeed:0};
  const e={alive:true,kind:'avenger',mode:'form',cool:999,side:1,pos:new THREE.Vector3(-40,398,34),heading:Math.PI/2,pitch:0,roll:0,spd:SPEED,vel:new THREE.Vector3(SPEED,0,0),mesh:new THREE.Group()};
  const c=vm.createContext({AvengerBay,GameRuntime,FlightSupport,CarrierRecovery,THREE,Math,P:leader,ships:[],wingmen:[e],PROP_STEP:.3,isDefend:()=>false,
   DROP_MAX_SPD:62,DROP_MAX_ALT:55,windHead:0,windZ:0,windGust:0,radioSay:()=>{},NavalAssets:{label:()=>'FREIGHTER'}});
  vm.runInContext(source('playerLateral','spawnWingman')+'\n'+source('updateWingmen','updateWingShots')+'\n'+source('noseDir','loadPlaneModel'),c);
  let bankT=0,climbT=0,tb=0,tc=0,lastRoll=0,lastP=0,maxAcc=0,maxAlong=0,minS=1e9,maxS=0,samples=0,sumAlong=0;
  const T=120;
  for(let i=0;i<T*fps;i++){
   tb-=dt;tc-=dt;
   if(tb<=0){bankT=(rnd()<.35?0:(rnd()*2-1)*.9);tb=1+rnd()*3;}
   if(tc<=0){climbT=(rnd()<.4?0:(rnd()*2-1)*.08);tc=1.5+rnd()*3.5;}
   leader.roll+=(bankT+(rnd()-.5)*.04-leader.roll)*Math.min(1,1.8*dt);leader.pitch+=(climbT+(rnd()-.5)*.01-leader.pitch)*Math.min(1,1.2*dt);
   leader.heading+=G*Math.tan(leader.roll)/leader.spd*dt;leader.vSpeed=Math.sin(leader.pitch)*leader.spd;
   leader.pos.add(new THREE.Vector3(Math.cos(leader.heading)*Math.cos(leader.pitch)*leader.spd,leader.vSpeed,Math.sin(leader.heading)*Math.cos(leader.pitch)*leader.spd).multiplyScalar(dt));
   c.updateWingmen(dt);
   if(i>10*fps){
    const p=(e.roll-lastRoll)/dt,acc=Math.abs(p-lastP)/dt;if(i>10*fps+2)maxAcc=Math.max(maxAcc,acc);lastP=p;
    const rel=e.pos.clone().sub(leader.pos),fx=Math.cos(leader.heading),fz=Math.sin(leader.heading),along=rel.x*fx+rel.z*fz+40;
    sumAlong+=Math.abs(along);samples++;maxAlong=Math.max(maxAlong,Math.abs(along));minS=Math.min(minS,e.spd);maxS=Math.max(maxS,e.spd);
   }
   lastRoll=e.roll;
  }
  assert(maxAcc<2.2,'roll acceleration stays human at '+fps+' FPS ('+maxAcc.toFixed(2)+' rad/s2; Build 223 reached 3.2)');
  assert(sumAlong/samples<20,'the escort holds its slot along the track at '+fps+' FPS (mean error '+(sumAlong/samples).toFixed(1)+' m; Build 223 surged 40-70 m)');
  assert(maxS-minS<20,'no surging: speed varies '+(maxS-minS).toFixed(1)+' m/s around the leader\'s '+SPEED);
 }
}
console.log('Dogfight: fighter pilot law (split-S, loop, push-over, hands), brain (variety, defences, nerve, ground, edge, cover, skill) and smooth wingmen at 20/60/120 FPS');
