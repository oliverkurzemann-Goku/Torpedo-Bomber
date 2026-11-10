/* Squad (the "Rotte"): the pure logic of friendly wingmen in the Rhine game. No THREE, no DOM.
 *
 * The plan decides WHO flies with you and WHAT each pilot is for; the game glue (remagen-mission.html) does the
 * flying with FlightControl.ai / DogfightAI and owns every model, bullet and bomb. Everything here is plain data in,
 * plain data out, so it runs against the real flight core in Node (okinawa/tests/squad.cjs).
 *
 *   plan(mission,{difficulty,seed,side})   -> [{slot,callsign,name,role,skill,aggression,hpMul,help,startDelay}]
 *   gridSlot(slot,wing)                    -> where a pilot lines up on the strip beside the leader
 *   formationOffset(role,slot,wing,t)      -> where he holds in the air, in the leader's frame
 *   chooseTask(ctx)                        -> {task:'form'|'ground'|'air'|'cover'|'rtb', ref, why}   (ctx.order: the player's order,
 *                                             ORDERS = free (the pilots decide) | attack (engage at will, wider reach) | cover | form)
 *   newRun() / groundPass(run,me,tgt,env,dt) -> one staged strafing / rocket / bomb pass on a ground target
 *   bombRelease(me,tgt)                    -> true when a bomb dropped now lands on the target
 *   takeoffRoll(w,dt,o)                    -> the ground run on the same forces as the player's
 *   landingPath(slot,field)                -> three waypoints for a straight-in approach
 *   callout(event,w,n)                     -> the radio line
 *
 * Game decisions (Kennung C, tuned by feel): roles, skills, pass geometry, the 0.34 / 0.6 hit-point thresholds.
 * Vectors are plain {x,y,z}; heading convention is the core's (x = sin h, z = cos h).
 */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
function rngFrom(seed){let a=(seed>>>0)||1;return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

// A friendly pilot is better on the easy levels (he helps more, lasts longer) and a little worse on Ace.
const LEVELS={rookie:{skill:.74,help:1,hp:1.3},vet:{skill:.62,help:.85,hp:1},ace:{skill:.5,help:.7,hp:.85}};
const NAMES={
 allied:['Lt. Dawes','Lt. Kowalski','Capt. Hollis','Lt. Maddox','Capt. Ryland','Lt. Okafor','Lt. Nowak','Lt. Brennan'],
 axis:['Ofw. Keller','Lt. Vogt','Hptm. Reiner','Uffz. Lindner','Lt. Sauer','Fw. Hartmann','Lt. Brandl','Ofw. Wendt']
};
const CALLSIGNS=['TWO','THREE'];
const HP={p47:125,bf109:86,fw190:100,me262:93,ju87:112,me163:74};  // hull points: about 97 % of the player's own hull of the type (the game hits them at 70 %, see TOUGH)
const TOUGH=.7;                     // what a tracer does to a wingman compared with the player: they are meant to last the sortie, not to be targets
const ROLE_TEXT={strike:'ground attack',hunter:'fighter / bomber hunter',cover:'high cover'};

function autoRole(air,ground,slot){
 if(air&&ground)return slot===0?'strike':'hunter';
 if(ground)return 'strike';
 return slot===0?'hunter':'cover';
}
// mission.squad = {n:1|2, roles:[...]}. No squad -> a solo sortie: the plan is empty.
function plan(mission,o={}){
 const cfg=mission&&mission.squad;
 if(!cfg||!(cfg.n>0)||mission.free||mission.circuits||mission.custom||mission.ac==='me163')return [];
 const level=LEVELS[o.difficulty]||LEVELS.vet,r=rngFrom(o.seed==null?1:o.seed),names=(NAMES[o.side==='axis'?'axis':'allied']).slice();
 const air=!!(mission.bombers||mission.enemyAir),ground=!!(mission.kills&&Object.keys(mission.kills).length);
 const out=[];
 for(let slot=0;slot<Math.min(2,cfg.n|0);slot++){
  const name=names.splice(Math.floor(r()*names.length),1)[0];
  out.push({slot,callsign:CALLSIGNS[slot],name,role:(cfg.roles&&cfg.roles[slot])||autoRole(air,ground,slot),
   skill:clamp(level.skill+(r()-.5)*.2,.35,.95),aggression:clamp(.35+r()*.55,.2,.95),hpMul:level.hp,help:level.help,
   startDelay:.9+slot*.9+r()*.5});
 }
 return out;
}
function describe(p){return p.map(w=>w.callsign+' ('+w.name+') — '+ROLE_TEXT[w.role]).join(' · ');}
function maxHp(kind,hpMul=1){return Math.max(10,Math.round((HP[kind]||60)*hpMul));}

// ---- on the strip: echelon beside and behind the leader (all start on the runway, 40 m wide) ----
function gridSlot(slot,wing=12){return {right:(slot===0?1:-1)*Math.max(16,wing*1.3),back:20+slot*22};}
// ---- in the air, in the leader's frame (right = starboard, back = behind him, up = above him) ----
function formationOffset(role,slot,wing=12,t=0){
 const side=slot===0?1:-1;
 if(role==='cover')return {right:Math.sin(t*.35+slot*2.1)*120,back:380+slot*80,up:150+slot*40};
 if(role==='hunter')return {right:side*(120+slot*30),back:70,up:18};
 return {right:side*Math.max(30,wing*2.6),back:32+slot*8,up:-2};
}

// ---- what to do next ----
// ctx: {leader:{pos,vel,spd,engaged},me:{pos,hp,maxhp,ammo,bombs,rockets,role,aggression,skill,cool},
//       targets:[{ref,kind,pos,alive,heavy,primary,claimed}], foes:[{ref,pos,bomber,alive,claimed,threatLeader}],
//       engageRange?}
const ORDERS=['free','attack','cover','form'];        // the player's orders to the flight (Build 237)
const LEASH=4200;                                     // metres from the leader inside which a wingman picks a fight
const d3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),d2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function usable(me,t){
 const bombs=me.bombs>0,rockets=me.rockets>0,guns=me.ammo>60;
 switch(t.kind){
  case 'bridge':return bombs;                          // a bridge only takes bombs
  case 'factory':return bombs||rockets;                // cannon fire barely scratches the works
  case 'train':case 'ferry':return bombs||rockets||me.ammo>400;
  default:return guns||rockets||bombs;
 }
}
function chooseTask(c){
 const me=c.me,L=c.leader,tgts=(c.targets||[]).filter(t=>t.alive);
 let foes=(c.foes||[]).filter(f=>f.alive);
 const order=ORDERS.includes(c.order)?c.order:'free',role=order==='cover'?'cover':me.role;
 const hp=me.hp/Math.max(1,me.maxhp),armed=me.ammo>40||me.bombs>0||me.rockets>0;
 if(hp<=.34)return {task:'rtb',why:'damaged'};
 if(!armed)return {task:'rtb',why:'winchester'};
 // 1. somebody on the leader's tail: that is the job, whatever the role or the order
 const six=foes.filter(f=>!f.bomber&&f.threatLeader).sort((a,b)=>d3(a.pos,L.pos)-d3(b.pos,L.pos))[0];
 if(six)return {task:'air',ref:six.ref,why:'six'};
 // a leash: he fights where the leader is, and comes back when the fight has dragged him far away
 if(me.far)return {task:'form',why:'rejoin'};
 foes=foes.filter(f=>d3(f.pos,L.pos)<(order==='attack'?LEASH*1.6:LEASH));
 const near=foes.filter(f=>d3(f.pos,me.pos)<1500&&!f.bomber).sort((a,b)=>d3(a.pos,me.pos)-d3(b.pos,me.pos))[0];
 // order FORM: stay on the leader, fight only what is on top of him
 if(order==='form')return near&&d3(near.pos,me.pos)<700?{task:'air',ref:near.ref,why:'defend'}:{task:'form',why:'ordered'};
 // order ATTACK: whatever is nearest, a bandit or a ground target, from further out
 if(order==='attack'){
  const a=pickAir(me,foes),g=groundChoice({...c,engageRange:9000},tgts);
  const gt=g&&tgts.find(t=>t.ref===g.ref),da=a?d3(a.pos,me.pos):Infinity,dg=gt?d2(gt.pos,me.pos):Infinity;
  if(a&&da<=dg+(a.bomber?0:1200))return {task:'air',ref:a.ref,why:a.bomber?'bomber':'fighter'};
  if(g)return g;
  return a?{task:'air',ref:a.ref,why:a.bomber?'bomber':'fighter'}:{task:'form',why:'no target'};
 }
 if(role==='cover'){
  const f=foes.filter(f=>d3(f.pos,L.pos)<1900).sort((a,b)=>d3(a.pos,L.pos)-d3(b.pos,L.pos))[0];
  return f?{task:'air',ref:f.ref,why:'cover'}:{task:'cover',why:'cover'};
 }
 if(role==='hunter'){
  // fighters first when they are close, otherwise the bomber nearest to him; a hunter with no foe left may help on the ground
  const f=pickAir(me,foes);
  if(f&&d3(f.pos,me.pos)<9000)return {task:'air',ref:f.ref,why:f.bomber?'bomber':'fighter'};
  if(!foes.length)return groundChoice(c,tgts)||{task:'form',why:'no contact'};
  return {task:'form',why:'no contact'};
 }
 // strike: a bandit that is on top of him is dealt with, otherwise the ground target the leader is not on
 if(near&&d3(near.pos,me.pos)<900)return {task:'air',ref:near.ref,why:'defend'};
 return groundChoice(c,tgts)||{task:'form',why:'no target'};
}
// The foe a pilot goes for: fighters first when they are close (900 m better than a bomber), foes nobody else has claimed.
function pickAir(me,foes){
 const pool=foes.filter(f=>!f.claimed||d3(f.pos,me.pos)<900);
 const score=f=>d3(f.pos,me.pos)-(f.bomber?0:900);
 return pool.sort((a,b)=>score(a)-score(b))[0]||foes.slice().sort((a,b)=>score(a)-score(b))[0]||null;
}
function groundChoice(c,tgts){
 const me=c.me,L=c.leader;if(me.cool>0)return null;
 const window=c.engageRange||4500;
 const open=tgts.filter(t=>usable(me,t)&&(!t.claimed||tgts.length===1));
 // He joins the attack when the leader is within reach of a target (or has started shooting), never from the far end of the map.
 const ready=open.filter(t=>d2(t.pos,L.pos)<window||(L.engaged&&d2(t.pos,L.pos)<window*2.2));
 const score=t=>d2(t.pos,me.pos)-(t.primary?900:0)+(t.heavy&&me.aggression<.5?2500:0);
 const t=ready.sort((a,b)=>score(a)-score(b))[0];
 return t?{task:'ground',ref:t.ref,why:t.kind}:null;
}

// ---- a ground pass ----
const BOMB_G=32,ROCKET_DROOP=.03,BOMB_KINDS={bridge:1,factory:1,train:1,ferry:1};
// A bomb dropped now: fall time from height h with vertical speed vy under the game's 32 m/s^2.
function bombRelease(me,tgt,tolerance=28){
 const h=me.pos.y-(tgt.y+1);if(h<25)return false;
 const vy=me.vel?me.vel.y:0,t=(vy+Math.sqrt(vy*vy+2*BOMB_G*h))/BOMB_G;
 const vh=Math.hypot(me.vel?me.vel.x:0,me.vel?me.vel.z:0)||me.spd,range=Math.hypot(tgt.x-me.pos.x,tgt.z-me.pos.z);
 return Math.abs(range-vh*t)<tolerance;
}
function newRun(){return {phase:'setup',t:0,pt:0,bombed:false,rockets:0,rocketT:0,burstT:0,bursting:false,dir:null,fired:false};}
// aim: where to point, spd: the speed to fly, fire:{guns,rocket,bomb}, done: the pass is over (he is climbing away)
function groundPass(run,me,tgt,env,dt){
 run.t+=dt;run.pt+=dt;
 const g=env.groundAt,spec=me.spec||{},skill=me.skill==null?.6:me.skill;
 const px=me.pos.x,py=me.pos.y,pz=me.pos.z,cruise=clamp((spec.corner||115)*1.05,95,(spec.max||170)*.85);
 const t0=Math.hypot(tgt.x-px,tgt.z-pz),lead=Math.min(3,t0/Math.max(60,me.spd||100));
 const tx=tgt.x+(tgt.vx||0)*lead,tz=tgt.z+(tgt.vz||0)*lead,ty=tgt.y;
 const dx=tx-px,dz=tz-pz,range=Math.hypot(dx,dz)||1,ux=dx/range,uz=dz/range,bearing=Math.atan2(ux,uz);
 const hx=Math.sin(me.heading),hz=Math.cos(me.heading);
 // terrain in front of him, but only up to the target (the climb-out after it is the pull-out's business)
 const reach=Math.max(150,Math.min(800,range+60)),ahead=Math.max(g(px+hx*reach*.25,pz+hz*reach*.25),g(px+hx*reach*.55,pz+hz*reach*.55),g(px+hx*reach,pz+hz*reach));
 const clearance=py-ahead,agl=py-g(px,pz);
 const bombing=me.bombs>0&&!run.bombed&&(BOMB_KINDS[tgt.kind]||me.rockets<=0&&me.ammo<=60);
 const fire={guns:false,rocket:false,bomb:false};
 let aim,spd=cruise,done=false;
 const flat=(ay)=>({x:ux*Math.sqrt(1-ay*ay),y:ay,z:uz*Math.sqrt(1-ay*ay)});
 const holdHeading=(ay)=>({x:hx*Math.sqrt(1-ay*ay),y:ay,z:hz*Math.sqrt(1-ay*ay)});
 if(run.phase==='setup'){run.phase=range<1300?'away':'ingress';run.pt=0;}
 switch(run.phase){
  case 'away':{
   aim={x:-ux*.985,y:.17,z:-uz*.985};spd=Math.min((spec.max||170)*.9,cruise*1.1);
   if(range>2800||run.pt>14){run.phase='ingress';run.pt=0;}
   break;
  }
  case 'ingress':{
   const alt=ty+(bombing?170:250);
   let ay=clamp((alt-py)/Math.max(500,range)*2.2,-.1,.14);
   aim=flat(ay);
   if((range<2700&&Math.abs(wrap(bearing-me.heading))<.55)||range<1700||run.pt>28){run.phase='attack';run.pt=0;run.dir={x:ux,z:uz};run.rockets=0;}
   break;
  }
  case 'attack':{
   // A straight dive on the target: the gun line (the nose is the flight path on this core) ends on it; a bomb run is nearly level.
   // Rockets drop 0.03 g-ish on the way (the game's 0.06/s droop), so the salvo is fired from a raised line and arcs onto the target:
   // rockets first, then the guns once the salvo is away.
   const rocketing=me.rockets>0&&tgt.kind!=='bridge'&&run.rockets<4&&range<1300&&range>760;
   const vr=Math.max(150,(me.spd||120)+180),drop=rocketing?ROCKET_DROOP*range*range/vr:0;
   const aimY=ty+(bombing?150:3)+drop;
   const gamma=clamp(Math.atan2(py-aimY,Math.max(60,range)),bombing?-.02:rocketing?-.06:.03,bombing?.10:.30);
   aim=flat(-Math.sin(gamma));spd=bombing?cruise:Math.min((spec.max||170)*.9,cruise*1.12);
   const nose=[Math.sin(me.heading)*Math.cos(me.pitch||0),Math.sin(me.pitch||0),Math.cos(me.heading)*Math.cos(me.pitch||0)];
   const L3=Math.hypot(dx,dz,aimY-py)||1;
   const lineErr=Math.acos(clamp((nose[0]*dx+nose[1]*(aimY-py)+nose[2]*dz)/L3,-1,1));
   const tight=.05+.08*(1-skill);
   // trigger discipline: bursts of about a second with a pause
   run.burstT-=dt;
   const inGun=!bombing&&!rocketing&&me.ammo>0&&range<850&&range>260&&lineErr<tight;
   if(run.burstT<=0){run.bursting=inGun&&!run.bursting;run.burstT=run.bursting?.8+.4*skill:.4;}
   if(!inGun)run.bursting=false;
   fire.guns=run.bursting;
   run.rocketT-=dt;
   if(rocketing&&run.rocketT<=0&&lineErr<.04){run.rockets++;run.rocketT=.16;fire.rocket=true;}
   if(bombing&&range<1100&&bombRelease(me,{x:tx,y:ty,z:tz})){run.bombed=true;fire.bomb=true;}
   // out: too close, too low, or the ground is coming up in front of him
   const minAgl=bombing?95:68;
   if(range<(bombing?170:250)||agl<minAgl||clearance<42){run.phase='pullout';run.pt=0;}
   break;
  }
  case 'pullout':{
   aim=holdHeading(.30);spd=Math.min((spec.max||170)*.92,cruise*1.2);
   if(run.pt>2.2||agl>200)run.phase='egress',run.pt=0;
   break;
  }
  default:{
   aim=holdHeading(.11);spd=cruise;
   if(run.pt>4.5)done=true;
  }
 }
 // terrain wins over every plan
 if(clearance<75&&run.phase!=='pullout')aim=holdHeading(Math.max(aim.y,.26));
 return {aim,spd,fire,done,phase:run.phase,range};
}

// ---- the ground run: the same forces as the player's (FlightCore.groundAcceleration), same rotation rule ----
// w: {kind,spd,groundPower,rotation,rato,loadout,flaps,pos:{y}}   o: {FlightCore,throttle,mu}
function takeoffRoll(w,dt,o={}){
 const F=o.FlightCore||root.FlightCore,m=F.model(w.kind),lo=F.loadout(m,w.loadout||{fuel:70});
 const throttle=o.throttle==null?1:o.throttle;
 w.groundPower=(w.groundPower??0)+(throttle-(w.groundPower??0))*(1-Math.exp(-dt/m.assumed.spool));
 const vr=F.stallSpeed(m,w.pos.y,lo.ratio,w.flaps??.5)*1.1;
 let extra=0;const rato=F.SOURCES[w.kind]&&F.SOURCES[w.kind].rato;
 if(rato){
  if(w.rato==null&&w.spd>.6*vr)w.rato=0;
  if(w.rato!=null&&w.rato<rato.burn){w.rato+=dt;extra=rato.thrust;}
 }
 const rotationTarget=w.spd>vr*.85?.07:0;
 w.rotation=(w.rotation||0)+(rotationTarget-(w.rotation||0))*(1-Math.exp(-dt/1.1));
 const gnd=F.groundAcceleration(m,w.spd,{power:w.groundPower,damage:1,massKg:lo.mass,flaps:w.flaps??.5,gear:1,storeArea:lo.storeArea,tank:lo.tank,
  brake:0,rotated:Math.min(1,(w.rotation||0)/.063),mu:o.mu??.04,altitude:w.pos.y,extraThrust:extra});
 w.spd=Math.max(0,w.spd+gnd.accel*dt);
 return {liftoff:gnd.liftoff&&w.rotation>.045,vr};
}

// ---- landing: three waypoints into the wind-free straight-in from the east (the strip runs east-west) ----
function landingPath(slot,f){
 // a wide downwind leg to the east, then a long straight final: the turn onto the line ends 1.5 km out
 return [{x:f.x+2700+slot*900,z:f.z+(slot?-240:240),y:f.y+200+slot*60,spd:100},
  {x:f.x+1500+slot*300,z:f.z,y:f.y+85+slot*12,spd:70},
  {x:f.x-360,z:f.z,y:f.y+2,spd:52}];
}

// ---- gunnery: the scatter cone of a wingman's burst (radians) ----
function gunScatter(skill,range){return (.004+(1-skill)*.011)*(1+range/1500*.4);}
// Light flak is not simulated against wingmen; a pass over a live battery carries a risk per second instead.
function flakRisk(dt,agl,distToBattery,r){return distToBattery<1700&&agl<1100&&r()<clamp(.07*dt*(1-distToBattery/1900),0,.2);}

// ---- radio ----
const LINES={
 roll:['ROLLING','ON THE ROLL — WITH YOU','FOLLOWING YOU DOWN THE STRIP'],
 airborne:['AIRBORNE — GEAR UP','OFF THE GROUND — JOINING'],
 joined:['IN POSITION','JOINED UP — LEAD, YOU HAVE THE LEAD'],
 ground:['IN ON THE TARGET','ROLLING IN','TAKING THE ONE ON THE LEFT','MY TARGET — STAY CLEAR'],
 groundHit:['HITS ON THE TARGET','DIRECT HIT','TARGET IS BURNING'],
 rocket:['ROCKETS AWAY','RIFLE — ROCKETS'],
 bomb:['BOMB AWAY','BOMBS GONE — PULLING OFF'],
 air:['ENGAGING','TALLY — GOING IN','I HAVE THE BANDIT'],
 six:['BREAK! BANDIT ON YOUR SIX — I AM ON HIM','CLEAR YOUR TAIL — COMING IN','BOGEY BEHIND YOU — BREAK'],
 kill:['SPLASH ONE','GOT HIM','HE IS GOING DOWN'],
 hit:['I AM HIT','TOOK HITS — STILL FLYING','THEY GOT ME'],
 bingo:['BINGO — HEADING HOME','OUT OF AMMUNITION — HEADING HOME','TOO MANY HITS — HEADING HOME'],
 lost:['GOING DOWN — GOOD LUCK','MAYDAY — I AM OUT'],
 landed:['DOWN SAFELY','ON THE GROUND — THANKS FOR THE COVER'],
 cover:['HIGH COVER — WATCHING YOUR SIX','ABOVE AND BEHIND YOU'],
 rejoin:['OFF THE TARGET — REJOINING YOU','CLEAR OF THE TARGET — FORMING UP'],
 form:['FORMING UP ON YOU','NO TARGET IN SIGHT — STAYING WITH YOU'],
 ordFree:['WILCO — I WILL PICK MY OWN TARGETS','ROGER — FREE TO ENGAGE'],
 ordAttack:['WILCO — ENGAGING AT WILL','ROGER — GOING AFTER THEM'],
 ordCover:['WILCO — HIGH COVER','ROGER — I HAVE YOUR SIX'],
 ordForm:['WILCO — TIGHT ON YOU','ROGER — HOLDING FORMATION']
};
function callout(event,w,n=0){
 const list=LINES[event]||[event.toUpperCase()],line=list[Math.abs(n|0)%list.length];
 return (w&&w.callsign?w.callsign:'TWO')+' — '+line;
}

// Debrief bonus: +150 for every wingman who is still flying when you land (only on a successful sortie).
function flightBonus(alive,success){return success?150*Math.max(0,alive|0):0;}

const api={ORDERS,TOUGH,LEVELS,NAMES,ROLE_TEXT,HP,plan,describe,maxHp,gridSlot,formationOffset,chooseTask,usable,newRun,groundPass,bombRelease,takeoffRoll,landingPath,gunScatter,ROCKET_DROOP,flakRisk,callout,flightBonus,rngFrom,autoRole};
root.Squad=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
