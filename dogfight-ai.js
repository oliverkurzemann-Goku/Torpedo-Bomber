/* DogfightAI (Build 224): the tactical brain of an enemy fighter.
 *
 * It decides WHERE to point and HOW FAST to fly; FlightControl.ai (vector mode) rolls and pulls the aircraft
 * there through the same FlightCore forces as the player's. No aircraft numbers live here - the character of a
 * type comes from three pilot choices (style, defence weights, aggression), the rest from the spec the game
 * hands in (stall speed, top speed, load limit) and from the energy the aircraft really has.
 *
 * What makes a fight unpredictable without making it unfair:
 *  - every pilot is somebody: skill, aggression and patience are drawn per aircraft;
 *  - he sees the world a reaction time late, with a little noise (a pilot, not a radar);
 *  - he chooses an attack GEOMETRY (high six, beam, head-on, low six, tail chase) and a different one from
 *    the last two; the approach is a curved offset pursuit, not a beeline;
 *  - after the pass he does what the energy allows: zoom, yo-yo, scissors or extend and come back;
 *  - when a gun is on him he picks one of several defences, weighted by type and energy, never the same one
 *    twice in a row (break into the attacker, barrel roll, split-S, dive, loop, climbing turn, jink);
 *  - two or more fighters share the work: one attacks, the others fly cover or flank from another side.
 *
 * Vectors are plain {x,y,z}; heading convention is the core's (x = sin h, z = cos h).
 * Game contract:  tac = DogfightAI.create({kind,skill,aggression,rng});
 *                 out = DogfightAI.think(e,tac,ctx,dt)  ->  {aim:{x,y,z}, spd, opts, mode, gun}
 * ctx: {target:{pos,vel,spd}, spec:{stall,max,gLim}, agl, ceiling, inward, friends:[{pos,vel,tac}], rearGun}
 */
(function(root){
'use strict';
const G=9.81,GUN_V=700;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const V=(x=0,y=0,z=0)=>({x,y,z});
const add=(a,b)=>V(a.x+b.x,a.y+b.y,a.z+b.z),sub=(a,b)=>V(a.x-b.x,a.y-b.y,a.z-b.z),mul=(a,k)=>V(a.x*k,a.y*k,a.z*k);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,len=a=>Math.hypot(a.x,a.y,a.z);
const norm=a=>{const l=len(a)||1;return V(a.x/l,a.y/l,a.z/l);};
const lerp=(a,b,k)=>V(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k,a.z+(b.z-a.z)*k);
const smooth=(x,a,b)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const UP=V(0,1,0);

// Character of a type: how he likes to fight (pilot choices, not aircraft data).
//  attack: weights of the five attack geometries; defence: weights of the defences.
const STYLE={
 boom:{attack:{highSix:.5,beam:.22,headOn:.12,tail:.06,lowSix:.1},zoom:.6,
  defence:{brk:.7,barrel:.5,splitS:1.1,dive:1.5,jink:.5,loop:.2,climbTurn:.05}},
 mixed:{attack:{highSix:.34,beam:.26,headOn:.1,tail:.22,lowSix:.08},zoom:.35,
  defence:{brk:.9,barrel:.7,splitS:1,dive:1,jink:.7,loop:.5,climbTurn:.3}},
 turn:{attack:{highSix:.2,beam:.28,headOn:.08,tail:.4,lowSix:.04},zoom:.15,
  defence:{brk:1.1,barrel:.6,splitS:.3,dive:.1,jink:.6,loop:1.2,climbTurn:1.1}},
 jet:{attack:{highSix:.45,beam:.15,headOn:.2,tail:.1,lowSix:.1},zoom:.5,
  defence:{brk:.4,barrel:.6,splitS:.8,dive:1.4,jink:.6,loop:.15,climbTurn:.1}}
};
const KIND_STYLE={fw190:'boom',p47:'boom',me163:'jet',me262:'jet',bf109:'mixed',zero:'turn',corsair:'boom',f4u:'boom'};

function pick(rng,weights){
 let sum=0;for(const k in weights)sum+=Math.max(0,weights[k]);
 let r=rng()*sum;for(const k in weights){r-=Math.max(0,weights[k]);if(r<=0)return k;}
 return Object.keys(weights)[0];
}
function create(o={}){
 const rng=o.rng||Math.random,skill=clamp(o.skill??.8,.3,1),style=STYLE[o.style||KIND_STYLE[o.kind]||'mixed'];
 return {
  kind:o.kind,style,rng,skill,id:rng(),
  aggr:clamp(o.aggression??(.35+rng()*.6),.1,1),               // how long he stays in the fight
  react:(.95-.8*skill)*(.7+rng()*.6),                           // seconds between looks at the target
  noise:(1-skill)*1.4,                                           // metres of position noise per 100 m of range
  mode:'engage',t:0,until:0,decideIn:.3+rng()*.3,clock:0,
  seen:null,seenT:0,
  attack:null,lastAttacks:[],lastDefence:null,defenceCd:0,
  role:'attack',roleT:0,
  maneuver:null,
  log:[{mode:'engage',t:0}],
  gunOk:false,bursting:false,burstT:0,aimWobble:V(),
  weave:rng()*6.28
 };
}

function setMode(tac,mode,dur,extra){
 if(tac.mode!==mode)tac.log.push({mode,t:tac.clock});if(tac.log.length>400)tac.log.shift();
 // A less sure pilot takes longer to turn round after a pass: that is where the difficulty setting bites.
 if(mode==='extend')dur*=1+2.4*(1-tac.skill)*(1.3-tac.aggr);
 tac.mode=mode;tac.t=0;tac.until=dur;tac.maneuver=extra||null;
}
function newAttack(tac,geo){
 const w={...tac.style.attack};
 for(const k of tac.lastAttacks)w[k]=(w[k]||0)*.3;                     // not the same geometry three times running
 if(geo.behindT<-.25&&geo.range>900){w.headOn+=.5;w.highSix*=.5;}      // he is coming at us
 if(geo.behindT>.5&&geo.range<1400)w.tail+=.4;                          // already on his tail
 if(geo.eAdv<-150){w.highSix*=.3;w.tail*=.4;w.beam+=.2;}                // no height: do not pretend to dive on him
 const type=pick(tac.rng,w);tac.lastAttacks.push(type);if(tac.lastAttacks.length>2)tac.lastAttacks.shift();
 const r=tac.rng;
 return {type,sideSign:r()<.5?-1:1,up:type==='highSix'?.45+r()*.6:type==='lowSix'?-(.3+r()*.3):.1*(r()-.5),
  lat:type==='beam'?.55+r()*.7:type==='headOn'?(r()-.5)*.25:.05*(r()-.5),
  patience:(14+r()*26)*(.6+.8*tac.aggr),weaveAmp:(.4+r()*.9)*(1-.4*tac.skill)};
}

// Gun solution: the direction the nose must point so a round of speed GUN_V reaches him. The games' rounds
// do not inherit the shooter's velocity (they fly dir x speed), so only his motion enters.
function gunDirection(rel,tv){
 let t=len(rel)/GUN_V;
 for(let i=0;i<3;i++)t=len(add(rel,mul(tv,t)))/GUN_V;
 return norm(add(rel,mul(tv,t)));
}
// Intercept direction at own speed (lead pursuit for the approach).
function interceptDirection(rel,tv,spd){
 let t=len(rel)/Math.max(60,spd);
 for(let i=0;i<3;i++)t=len(add(rel,mul(tv,t)))/Math.max(60,spd);
 return norm(add(rel,mul(tv,t)));
}
// Altitude a pull-out from a dive of this angle needs at this speed (core gain bends the path 2.2x).
function pulloutAltitude(spd,pitch,gain=2.2,n=4,roll=0,rollRate=1.5){
 const radius=spd*spd/(gain*G*Math.max(1,n-1)),dive=Math.min(1.4,Math.max(0,-pitch));
 // rolling the wings level first costs height too, at the roll rate this aircraft really has at this speed
 return radius*(1-Math.cos(dive))+spd*Math.sin(dive)*Math.min(Math.PI,Math.abs(roll))/Math.max(.3,rollRate)+60;
}
// Steepest dive he allows himself over this much air below: the pull-out must fit with room to spare.
function maxDive(spd,agl,rollRate){
 for(let d=1.3;d>0;d-=.05)if(pulloutAltitude(spd,-d,2.2,4,0,rollRate)*1.4+120<=agl)return d;
 return 0;
}

function think(e,tac,ctx,dt){
 tac.clock+=dt;tac.t+=dt;tac.defenceCd=Math.max(0,tac.defenceCd-dt);
 const r=tac.rng,spec=ctx.spec,corner=spec.stall*Math.sqrt(Math.max(2,spec.gLim));
 // ---- what he sees: a look every `react` seconds, with a little noise; in between he flies on what he saw ----
 tac.seenT-=dt;
 if(!tac.seen||tac.seenT<=0){
  const range=len(sub(ctx.target.pos,e.pos)),n=tac.noise*range/100;
  tac.seen={pos:add(ctx.target.pos,V((r()-.5)*n,(r()-.5)*n*.6,(r()-.5)*n)),vel:{...ctx.target.vel}};
  tac.seenT=tac.react*(.6+r()*.8);
 }else tac.seen.pos=add(tac.seen.pos,mul(tac.seen.vel,dt));
 const tp=tac.seen.pos,tv=tac.seen.vel,tspd=Math.max(1,len(tv)),tn=mul(tv,1/tspd);
 const me=e.pos,spd=Math.max(1,e.spd),nose=V(Math.sin(e.heading)*Math.cos(e.pitch),Math.sin(e.pitch),Math.cos(e.heading)*Math.cos(e.pitch));
 const rel=sub(tp,me),range=Math.max(1,len(rel)),los=mul(rel,1/range);
 const rv=sub(tv,V(nose.x*spd,nose.y*spd,nose.z*spd));            // target velocity relative to me
 const closure=-dot(rv,los);
 const ata=Math.acos(clamp(dot(nose,los),-1,1));
 const behindT=dot(tn,los);                                          // 1: I am on his six, -1: head-on
 const eAdv=(spd*spd-tspd*tspd)/(2*G)+(me.y-tp.y);
 const horiz=norm(V(nose.x,0,nose.z)),side=V(horiz.z,0,-horiz.x);    // +side = the way a positive roll turns
 const tgtSide=dot(rel,side)>=0?1:-1;
 // A gun on him: the target's nose points at me. Chased from behind he answers at once; in a head-on pass he
 // answers only when his nerve runs out (a bold pilot holds on and shoots first).
 const onMe=ctx.threat!=null?ctx.threat:(dot(tn,mul(los,-1))>Math.cos(.26)&&range<800);
 const headOn=ata<1.0&&closure>60;
 const nerve=230+470*(1-tac.aggr)*(1.1-.4*tac.skill);
 const threat=onMe&&(!headOn||range<nerve);
 const geo={range,los,ata,behindT,closure,eAdv,rel,rv};
 const rollNow=ctx.rollNow||1.5;
 const hazard=ctx.agl!=null&&ctx.agl<pulloutAltitude(spd,e.pitch,2.2,4,e.roll,rollNow)*1.35+80;
 const vy=e.vel?e.vel.y:0;

 // ---- wingman duties: who attacks, who covers ----
 tac.roleT-=dt;
 if(tac.roleT<=0){
  tac.roleT=3+r()*3;
  // The pilot with the lowest call-sign among those still attacking leads; the others fly cover or flank for a while.
  let nearer=false;
  for(const f of ctx.friends||[]){
   const fd=len(sub(ctx.target.pos,f.pos));
   if(f.tac&&f.tac.mode!=='cover'&&f.tac.id<tac.id&&fd<2200)nearer=true;
  }
  tac.role=nearer&&r()<.35?'cover':'attack';
 }

 tac.chaseT=(range>700&&closure<25&&tac.mode==='engage')?(tac.chaseT||0)+dt:0;
 // ---- decisions, on a jittered clock so nothing happens "every 1.2 s" ----
 tac.decideIn-=dt;
 const m=tac.mode;
 if(tac.decideIn<=0){
  tac.decideIn=.14+r()*.22;
  // a gun on him: defend (after he has looked), unless he is already defending or just did
  if(threat&&tac.defenceCd<=0&&!['brk','barrel','splitS','dive','jink','loop','climbTurn'].includes(m)&&range>70){
   const d=chooseDefence(e,tac,ctx,{spd,corner,agl:ctx.agl,tgtSide,range,eAdv});
   if(d)startDefence(e,tac,d,{horiz,side,tgtSide,nose});
  }else if(m==='engage'){
   const overshoot=range<150&&closure>20&&ata>.3;
   const crossing=range<95;
   const slow=spd<spec.stall*1.3;
   if(slow){setMode(tac,'extend',2.5+r()*2,{bear:(r()-.5)*1.4,dive:true});}
   else if(crossing||overshoot){afterPass(e,tac,ctx,geo,{spd,corner,horiz,side,tgtSide,vy});}
   else if(tac.role==='cover'&&range>500){setMode(tac,'cover',3.5+r()*3.5,{dir:r()<.5?1:-1});}
   // a tail chase that does not close: trade speed for height and come down on him again, or swing round to
   // another side - a pilot who cannot catch him does not simply stay behind him for a minute
   else if(tac.chaseT>6+r()*5&&spd>corner*1.05){
    tac.chaseT=0;tac.attack=null;
    if((ctx.agl==null||ctx.agl>500)&&r()<.55)setMode(tac,'zoom',5.5,{sign:r()<.5?-1:1});
    else setMode(tac,'extend',2.5+r()*2.5,{bear:(r()<.5?-1:1)*(.7+r()*.9),dive:false});
   }
   else if(range>900&&tac.attack&&tac.t>8&&r()<.012){tac.attack=newAttack(tac,geo);tac.t=Math.min(tac.t,tac.attack.patience*.4);}   // change the line of attack in mid-approach
   else if(tac.t>(tac.attack?.patience||30)){setMode(tac,'extend',3+r()*3,{bear:(r()-.5)*1.8,dive:false});}
   else if(range>650&&range<1700&&r()<.05*(1-tac.skill*.5)){setMode(tac,'jink',1.2+r()*1.2,{});}   // feint
  }else if(m==='cover'){
   if(tac.t>tac.until||range<550||tac.role!=='cover'){tac.attack=null;setMode(tac,'engage',0);}
  }
 }
 if(m!=='engage'&&tac.until>0&&tac.t>tac.until)endMode(e,tac,geo,{spd,corner});

 // ---- the map edge wins over the fight ----
 if(ctx.inward){tac.attack=null;if(tac.mode!=='return')setMode(tac,'return',1.5,{dir:norm(V(ctx.inward.x,.08,ctx.inward.z))});}
 else if(tac.mode==='return'&&tac.t>(tac.until||0))setMode(tac,'engage',0);
 // ---- where to point ----
 let aim,wantSpd=spec.max,o={};
 const mode=tac.mode,ph=tac.t,mv=tac.maneuver||{};
 const ground=ctx.agl!=null?ctx.agl:1e9;
 switch(mode){
  case 'engage':{
   if(!tac.attack)tac.attack=newAttack(tac,geo);
   const a=tac.attack;
   // The offset (height above, or off to one side) fades out as the range closes, so the pass ends on his tail.
   const fade=smooth(range,260,1400);
   const tside=norm(V(tn.z,0,-tn.x)),offDist=fade*range*.38;
   tac.weave+=dt*(.9+tac.aggr*.4);
   const weave=Math.sin(tac.weave)*a.weaveAmp*fade*range*.06;
   let off=add(add(mul(UP,a.up*offDist),mul(tside,(a.lat*a.sideSign)*offDist+weave)),V());
   const gun=gunDirection(rel,tv),lead=interceptDirection(add(rel,off),tv,spd);
   aim=lerp(lead,gun,1-smooth(range,520,900));
   if(range<260&&closure>35&&ata>.12){                               // too hot: sit behind him instead of cutting through
    const behind=norm(sub(add(tp,mul(tn,-closure*.5)),me));aim=lerp(aim,behind,clamp((closure-35)/60,0,.8));
   }
   // Speed: everything on the way in, his speed plus a little in the saddle so there is time to aim.
   const saddle=range<820&&ata<.65&&behindT>.2;
   wantSpd=saddle?Math.max(corner,tspd*1.1+8):spec.max;
   if(ctx.rearGun&&behindT>.8&&range<420)aim=lerp(aim,add(gun,mul(side,tgtSide*-.6)),.35);   // a gunner is watching: not dead six
   tac.gunOk=range>95&&range<650&&Math.acos(clamp(dot(nose,gun),-1,1))<.045;
   break;
  }
  case 'cover':{                                                      // fly a wide orbit above him, wait for a gap
   const hl=norm(V(-los.x,0,-los.z)),ang=Math.atan2(hl.x,hl.z)+(mv.dir||1)*.55;
   const px=tp.x+Math.sin(ang)*1500,pz=tp.z+Math.cos(ang)*1500,py=Math.max(tp.y+380,me.y*.9+tp.y*.1);
   aim=norm(V(px-me.x,py-me.y,pz-me.z));wantSpd=Math.max(corner*1.1,spec.max*.85);tac.gunOk=false;
   break;
  }
  case 'zoom':{                                                       // trade the speed of the pass for height, away from his guns
   aim=norm(add(add(mul(horiz,.45),mul(UP,.9)),mul(side,(mv.sign||1)*.2)));wantSpd=spec.max;tac.gunOk=false;
   if((ph>1.2&&spd<corner*1.12)||ph>6||(e.pitch>1.25&&ph>2.2))endMode(e,tac,geo,{spd,corner});
   break;
  }
  case 'yoyoHigh':{aim=norm(add(mul(los,.72),mul(UP,.62)));wantSpd=spec.max;tac.gunOk=false;break;}
  case 'yoyoLow':{aim=norm(add(mul(los,.74),mul(UP,-.5)));wantSpd=spec.max;tac.gunOk=false;break;}
  case 'scissors':{                                                   // turn hard onto him; reverse every time he crosses
   const tsNow=tgtSide;
   if(mv.sign==null)mv.sign=tsNow;
   if(tsNow!==mv.sign&&ph-(mv.flip||0)>.7&&range<500){mv.sign=tsNow;mv.flip=ph;}
   aim=norm(add(add(mul(horiz,.3),mul(side,mv.sign*.95)),mul(UP,-.08)));
   wantSpd=Math.max(spec.stall*1.35,corner*.95);tac.gunOk=false;
   if(ata<.45&&behindT>0){tac.attack=null;setMode(tac,'engage',0);}
   else if(spd<spec.stall*1.2||range>650)setMode(tac,'extend',2.5+r()*2,{bear:(r()-.5)*1.2,dive:true});
   break;
  }
  case 'extend':{                                                     // run, build speed back, come back from somewhere else
   const away=norm(V(-los.x,0,-los.z)),c=Math.cos(mv.bear||0),s=Math.sin(mv.bear||0);
   const dir=V(away.x*c+away.z*s,0,-away.x*s+away.z*c);
   const dive=(mv.dive||ground>700)&&ground>400?-.16:.04;
   aim=norm(V(dir.x,dive,dir.z));wantSpd=spec.max;tac.gunOk=false;
   if(range>1250&&spd>corner*1.25&&ph>2)endMode(e,tac,geo,{spd,corner});
   break;
  }
  case 'brk':{                                                        // hard turn, into the attacker
   aim=norm(add(add(mul(side,(mv.sign||1)*.95),mul(horiz,.18)),V(0,(spd<corner?-.22:.05),0)));wantSpd=spec.max;tac.gunOk=false;
   if(ph>.9&&!threat||ph>2.8)endMode(e,tac,geo,{spd,corner});
   break;
  }
  case 'barrel':{                                                     // a helix round his gun line: he overshoots
   const phi=clamp(ph/(mv.dur||2.1),0,1)*Math.PI*2,sg=mv.sign||1;
   const rad=add(mul(UP,Math.cos(phi+Math.PI/4)),mul(mv.side,sg*Math.sin(phi+Math.PI/4)));
   aim=norm(add(mul(mv.fwd,.55),mul(rad,.8)));wantSpd=spec.max;tac.gunOk=false;
   break;
  }
  case 'splitS':{
   aim=norm(add(mul(UP,-1),add(mul(horiz,.12),mul(side,(mv.sign||1)*.12))));wantSpd=spec.max;tac.gunOk=false;
   if((e.pitch<-1.2&&Math.abs(e.roll)<1.2&&ph>1.5)||ph>4.5)endMode(e,tac,geo,{spd,corner});
   break;
  }
  case 'dive':{
   aim=norm(add(add(mul(mv.fwd||horiz,.7),mul(UP,-.58)),mul(side,(mv.sign||1)*.22)));wantSpd=spec.max;tac.gunOk=false;break;
  }
  case 'jink':{                                                       // random walk in a cone, new heading every ~0.8 s
   mv.nextIn=(mv.nextIn??0)-dt;
   if(mv.nextIn<=0){mv.nextIn=.5+r()*.6;mv.dirv=norm(add(add(mul(horiz,.6),mul(side,(r()-.5)*1.7)),V(0,(r()-.55)*.9,0)));}
   aim=mv.dirv||horiz;wantSpd=spec.max;tac.gunOk=false;break;
  }
  case 'loop':{
   const f=mv.fwd||horiz;
   aim=ph<(mv.up||2.3)?norm(add(mul(UP,1),mul(f,.12))):norm(add(mul(f,-1),mul(UP,.3)));
   wantSpd=spec.max;tac.gunOk=false;break;
  }
  case 'climbTurn':{
   aim=norm(add(add(mul(mv.fwd||horiz,.55),mul(UP,.5)),mul(side,(mv.sign||1)*.65)));wantSpd=spec.max;tac.gunOk=false;break;
  }
  case 'return':{aim=norm(mv.dir||horiz);wantSpd=spec.max*.9;tac.gunOk=false;break;}
  default:aim=los;
 }

 // ---- safety: ground, ceiling, map edge, friends ----
 let override=null;
 if(hazard&&e.pitch<.2&&!['return'].includes(tac.mode)){
  // Wings level first, then pull: an aim in the vertical plane keeps the lift vector on the horizon.
  override=norm(V(nose.x,.0,nose.z));override.y=.85;override=norm(override);
  tac.gunOk=false;if(!tac.hazardT)tac.log.push({mode:'pullout',t:tac.clock});tac.hazardT=1;
  wantSpd=spec.max;
 }else tac.hazardT=0;
 if(override)aim=override;
 if(ground<260&&aim.y<.05&&!override)aim=norm(V(aim.x,.05,aim.z));       // never aim into the hill
 if(!override&&tac.mode!=='splitS'&&ctx.agl!=null){                         // and never dive onto a target he cannot pull out of
  const floorY=-Math.sin(maxDive(spd,ctx.agl,rollNow));
  if(aim.y<floorY){const h=Math.hypot(aim.x,aim.z)||1,k=Math.sqrt(1-floorY*floorY)/h;aim=V(aim.x*k,floorY,aim.z*k);}
 }
 if(ctx.ceiling!=null&&me.y>ctx.ceiling-350)aim=norm(V(aim.x,Math.min(aim.y,-.12),aim.z));
 for(const f of ctx.friends||[]){
  const d=sub(f.pos,me),dl=len(d);
  if(dl<130&&dl>1){aim=norm(add(aim,mul(norm(d),-.9*(1-dl/130))));}   // keep a wing's width
 }

 // ---- hands: a good pilot rolls quicker, a poor one pulls less hard ----
 o={vector:true,rollAccel:4+5*tac.skill,rollGain:3.2+1.4*tac.skill,pullGain:2.0+1.2*tac.skill,rollDeadband:.12,
  aimTau:.2-.1*tac.skill,powerRate:.9,pushBelow:.3};
 // a trace of aim wobble (fingers on the stick)
 tac.aimWobble=lerp(tac.aimWobble,V((r()-.5),(r()-.5)*.5,(r()-.5)),dt*2);
 aim=norm(add(aim,mul(tac.aimWobble,(1-tac.skill)*.09)));
 // Trigger discipline: bursts of about a second, then a pause; a poor shot lets go from further out of the gun line.
 const lineErr=Math.acos(clamp(dot(nose,gunDirection(rel,tv)),-1,1));
 tac.burstT-=dt;
 const inEnv=range>85&&range<680&&lineErr<.1+.2*(1-tac.skill)&&['engage'].includes(tac.mode);
 if(tac.burstT<=0){
  // a rookie fires shorter bursts and lets go for longer; an ace keeps the trigger down his full second
  if(tac.bursting){tac.bursting=false;tac.burstT=(.5+r()*1.1)*(1+1.4*Math.max(0,.85-tac.skill));}
  else if(inEnv){tac.bursting=true;tac.burstT=(.5+r()*.9)*(.55+.45*Math.min(1,tac.skill/.85));}
 }
 if(!inEnv)tac.bursting=false;
 return {aim,spd:wantSpd,opts:o,mode:tac.mode,gun:tac.gunOk,fire:tac.bursting&&inEnv,threat,geo};
}

function afterPass(e,tac,ctx,geo,s){
 const r=tac.rng,spec=ctx.spec,{spd,corner,side,tgtSide}=s;
 const high=ctx.agl==null||ctx.agl>480,rich=spd>1.45*corner;
 tac.attack=null;
 if(rich&&high&&r()<tac.style.zoom){setMode(tac,'zoom',6,{sign:-tgtSide});return;}
 if(geo.closure>30&&spd>1.1*corner&&r()<.45){setMode(tac,r()<.6||!high?'yoyoHigh':'yoyoLow',1.3+r()*.8,{});return;}
 if(geo.range<420&&len(ctx.target.vel)<spec.stall*1.9&&spd<1.7*corner&&r()<.6){setMode(tac,'scissors',7,{});return;}
 setMode(tac,'extend',3+r()*3,{bear:(r()-.5)*1.7,dive:false});
}
function endMode(e,tac,geo,s){
 const m=tac.mode,r=tac.rng;
 if(['brk','barrel','jink','dive','climbTurn','loop'].includes(m)){
  // a defence that worked leaves him either out in front of the attacker or with room to come back
  if(m==='brk'&&geo.range<500&&geo.behindT<.2&&r()<.5){tac.attack=null;setMode(tac,'scissors',6,{});return;}
  setMode(tac,'extend',2+r()*2.5,{bear:(r()-.5)*1.4,dive:m==='dive'});return;
 }
 if(m==='splitS'){setMode(tac,'extend',2+r()*2,{bear:(r()-.5)*1,dive:false});return;}
 tac.attack=null;setMode(tac,'engage',0);
}
function chooseDefence(e,tac,ctx,s){
 const w={...tac.style.defence},{spd,corner,agl,range}=s;
 const gainBend=2.2,rad=spd*spd/(gainBend*G*4);
 if(!(agl==null||agl>3*rad+300))w.splitS=0;
 if(!(agl==null||agl>450))w.dive=0;
 if(!(spd>corner*1.15&&(agl==null||agl>700)))w.loop=0;
 if(!(spd>corner*1.05))w.climbTurn*=.2;
 if(!(spd>ctx.spec.stall*1.25))w.barrel=0;
 if(spd<corner*.9){w.brk*=.4;w.dive*=1.5;}
 if(tac.lastDefence)w[tac.lastDefence]*=.3;
 // a poor pilot sometimes does the wrong thing
 if(tac.rng()<(1-tac.skill)*.35)for(const k in w)w[k]=w[k]>0?1:0;
 // not every look at a gun means a manoeuvre: he gives it a beat (and a rookie a longer one)
 if(tac.rng()<.18*(1-tac.skill)+.05)return null;
 const sum=Object.values(w).reduce((a,b)=>a+b,0);if(sum<=0)return null;
 return pick(tac.rng,w);
}
function startDefence(e,tac,d,g){
 const r=tac.rng,{horiz,side,tgtSide}=g;
 tac.lastDefence=d;tac.defenceCd=3.5+r()*3;tac.attack=null;
 // break INTO the attacker most of the time, away from him now and then
 const sign=r()<.82?tgtSide:-tgtSide;
 switch(d){
  case 'brk':setMode(tac,'brk',3,{sign});break;
  case 'barrel':setMode(tac,'barrel',2.4,{sign,dur:1.9+r()*.5,fwd:horiz,side});break;
  case 'splitS':setMode(tac,'splitS',5,{sign});break;
  case 'dive':setMode(tac,'dive',2.4+r()*1.6,{sign:r()<.5?-1:1,fwd:horiz});break;
  case 'jink':setMode(tac,'jink',2.6+r()*1.6,{});break;
  case 'loop':setMode(tac,'loop',6.5,{fwd:horiz,up:1.9+r()*.8});break;
  case 'climbTurn':setMode(tac,'climbTurn',2.2+r()*1.2,{sign,fwd:horiz});break;
 }
}

const api={create,think,gunDirection,interceptDirection,pulloutAltitude,maxDive,STYLE,KIND_STYLE};
root.DogfightAI=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
