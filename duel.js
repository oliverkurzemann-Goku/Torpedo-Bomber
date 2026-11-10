/* duel.js - Build 238: rules and maths of the 2-player duel. Pure functions, no THREE, no DOM, no network.
 *
 * Model (kept deliberately simple, a duel between friends, no anti-cheat):
 *   - every client flies its own aeroplane and is the only authority over it (position, hull, death);
 *   - the other pilot is an avatar drawn from the 20 Hz state packets, shown ~100 ms in the past and
 *     interpolated (Track), so what you aim at is what you see;
 *   - hits are decided by the SHOOTER: a bullet that reaches the avatar sends a 'hit' (percent of the victim's
 *     structure); the victim applies it, so damage needs no shared clock;
 *   - a death is announced by the victim; both clients count the same events, so both scoreboards agree.
 * Damage is normalised: a sustained stream of hits kills a fresh aeroplane in about TTK seconds whatever the
 * type's own gun figures say (a Me 262 deals ~130 'damage' a second, a Fw 190 ~20, which is a fine contest
 * against AI but not between two pilots); ammunition, handling and the target's toughness stay the differences.
 */
(function(root){
'use strict';
const PROTOCOL=1;
const TTK=6;                 // seconds of continuous hits that bring a fresh aeroplane down (game decision, tune here)
const HIT_RADIUS=9;          // metres, the same bubble the AI fighters have
const PROTECT=3;             // seconds nobody can hurt you after a spawn
const RESPAWN=4;             // seconds between going down and the new aeroplane
const RELOAD=15;             // seconds with empty guns until a fresh magazine (nobody should be stuck unable to fight)
const TOUGH={p47:1.15,fw190:1.0,bf109:.9,me262:.9,me163:.7,ju87:1.1};   // structural toughness (game decision)
const FLAG={GEAR:1,FIRING:2,GROUND:4,ALIVE:8,PROTECT:16,PAUSED:32};
const STATE_HZ=20;

// ---- small vector / quaternion helpers (plain arrays) ----------------------------------------------------
function qSlerp(a,b,t){
  let [ax,ay,az,aw]=a,[bx,by,bz,bw]=b;
  let d=ax*bx+ay*by+az*bz+aw*bw;
  if(d<0){bx=-bx;by=-by;bz=-bz;bw=-bw;d=-d;}
  let s0,s1;
  if(d>.9995){s0=1-t;s1=t;}
  else{const th=Math.acos(Math.min(1,d)),sn=Math.sin(th);s0=Math.sin((1-t)*th)/sn;s1=Math.sin(t*th)/sn;}
  const x=s0*ax+s1*bx,y=s0*ay+s1*by,z=s0*az+s1*bz,w=s0*aw+s1*bw,l=Math.hypot(x,y,z,w)||1;
  return [x/l,y/l,z/l,w/l];
}
function qRotate(q,v){
  const [x,y,z,w]=q,[vx,vy,vz]=v;
  const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
  return [vx+w*tx+(y*tz-z*ty),vy+w*ty+(z*tx-x*tz),vz+w*tz+(x*ty-y*tx)];
}
const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

// ---- state packets ----------------------------------------------------------------------------------------
// [n, t, x,y,z, qx,qy,qz,qw, spd, thr, hull, flags, flap, epoch, volley]
const r1=v=>Math.round(v*10)/10,r2=v=>Math.round(v*100)/100,r4=v=>Math.round(v*1e4)/1e4;
function packState(n,t,s){
  return [n|0,Math.round(t),r1(s.pos[0]),r1(s.pos[1]),r1(s.pos[2]),r4(s.q[0]),r4(s.q[1]),r4(s.q[2]),r4(s.q[3]),
    r1(s.spd||0),r2(s.thr||0),r1(s.hull==null?100:s.hull),s.flags|0,r2(s.flap||0),s.epoch|0,s.volley|0];
}
function unpackState(a){
  if(!Array.isArray(a)||a.length<16)return null;
  for(let i=0;i<16;i++)if(typeof a[i]!=='number'||!Number.isFinite(a[i]))return null;
  const q=[a[5],a[6],a[7],a[8]],l=Math.hypot(q[0],q[1],q[2],q[3]);
  if(l<.5||l>1.5)return null;
  return {n:a[0],t:a[1],pos:[a[2],a[3],a[4]],q:q.map(v=>v/l),spd:a[9],thr:a[10],hull:a[11],flags:a[12],flap:a[13],epoch:a[14],volley:a[15]};
}

// ---- the other pilot's track: snapshot interpolation with a clock-offset estimate -------------------------
// The sender stamps each packet with its own clock. The smallest (receive - send) seen in the last few seconds is
// the network's fastest delivery; playing back `delay` behind that keeps the picture smooth through jitter.
class Track{
  constructor(o={}){this.delay=o.delay==null?.1:o.delay;this.maxExtrap=o.maxExtrap==null?.4:o.maxExtrap;this.keep=o.keepMs||2500;this.reset();}
  reset(){this.snaps=[];this.win=[];this.offset=null;this.lastN=-1;this.lastE=-1;this.count=0;}
  push(s,recvMs){
    if(!s)return false;
    if(s.epoch===this.lastE&&s.n<=this.lastN)return false;      // late or duplicate packet
    this.lastN=s.n;this.lastE=s.epoch;this.count++;
    this.win.push({at:recvMs,off:recvMs-s.t});
    while(this.win.length&&recvMs-this.win[0].at>5000)this.win.shift();
    let m=Infinity;for(const w of this.win)if(w.off<m)m=w.off;
    this.offset=m;
    this.snaps.push(s);
    while(this.snaps.length>2&&s.t-this.snaps[0].t>this.keep)this.snaps.shift();
    return true;
  }
  get ready(){return this.snaps.length>0&&this.offset!=null;}
  // The picture for time `nowMs` (receiver clock).
  sample(nowMs){
    if(!this.ready)return null;
    const sn=this.snaps,rt=nowMs-this.offset-this.delay*1000;
    const out=(a,pos,q,extra)=>Object.assign({pos,q,spd:a.spd,thr:a.thr,hull:a.hull,flags:a.flags,flap:a.flap,epoch:a.epoch,volley:a.volley,extrapolated:false,stale:false,age:(nowMs-this.offset-sn[sn.length-1].t)/1000},extra||{});
    if(rt<=sn[0].t)return out(sn[0],sn[0].pos.slice(),sn[0].q.slice());
    const last=sn[sn.length-1];
    if(rt>=last.t){
      const prev=sn.length>1&&sn[sn.length-2].epoch===last.epoch?sn[sn.length-2]:null;
      const over=(rt-last.t)/1000,dt=Math.min(this.maxExtrap,over);
      let pos=last.pos.slice();
      if(prev&&last.t>prev.t){const k=dt/((last.t-prev.t)/1000);pos=pos.map((v,i)=>v+(last.pos[i]-prev.pos[i])*k);}
      return out(last,pos,last.q.slice(),{extrapolated:true,stale:over>this.maxExtrap});
    }
    let i=sn.length-2;while(i>0&&sn[i].t>rt)i--;
    const a=sn[i],b=sn[i+1];
    if(a.epoch!==b.epoch||dist3(a.pos,b.pos)>400)return out(b,b.pos.slice(),b.q.slice());
    const k=(rt-a.t)/(b.t-a.t);
    return out(a,a.pos.map((v,j)=>v+(b.pos[j]-v)*k),qSlerp(a.q,b.q,k));
  }
}

// ---- damage -----------------------------------------------------------------------------------------------
// Damage a type's guns deal per second at full cadence (the game's own figures, AC in remagen-mission.html).
function gunDps(def,kind,ports,jet){
  if(def.guns)return def.guns.reduce((n,g)=>n+def.gunDmg*g.dmg/g.interval,0);
  const scale=jet?1:kind==='p47'?.5:kind==='fw190'?1/ports:.25;
  return def.gunDmg*scale*ports/def.gunRate;
}
// Percent of the victim's structure one bullet takes (before the victim's toughness).
function hitPct(bulletDmg,dps,ttk){return dps>0?bulletDmg/dps*100/(ttk||TTK):0;}
function victimPct(pct,kind){return pct/(TOUGH[kind]||1);}

// ---- the match --------------------------------------------------------------------------------------------
function createMatch(rules={}){
  const m={rules:{target:5,minutes:10,...rules},me:{kills:0,deaths:0},them:{kills:0,deaths:0},t:0,over:false,winner:null,reason:''};
  function check(){
    if(m.over)return;
    if(m.me.kills>=m.rules.target||m.them.kills>=m.rules.target)finish(m.me.kills>=m.rules.target&&m.them.kills>=m.rules.target?'draw':m.me.kills>=m.rules.target?'me':'them','score');
  }
  function finish(winner,reason){m.over=true;m.winner=winner;m.reason=reason;}
  m.localDeath=cause=>{m.me.deaths++;if(cause==='shot')m.them.kills++;check();return m;};
  m.remoteDeath=cause=>{m.them.deaths++;if(cause==='shot')m.me.kills++;check();return m;};
  m.tick=dt=>{
    m.t+=dt;
    if(!m.over&&m.rules.minutes&&m.t>=m.rules.minutes*60){
      const a=m.me.kills-m.them.kills,d=m.them.deaths-m.me.deaths;
      finish(a>0?'me':a<0?'them':d>0?'me':d<0?'them':'draw','time');
    }
    return m;
  };
  m.timeLeft=()=>Math.max(0,m.rules.minutes*60-m.t);
  m.finish=finish;
  // The host's verdict, seen from the guest's side ({me,them} are the HOST's numbers).
  m.applyFinal=(f,asGuest)=>{
    const mine=asGuest?f.them:f.me,theirs=asGuest?f.me:f.them;
    m.me.kills=mine.kills;m.me.deaths=mine.deaths;m.them.kills=theirs.kills;m.them.deaths=theirs.deaths;
    finish(f.winner==='draw'?'draw':(f.winner==='me')===!asGuest?'me':'them',f.reason||'score');
  };
  m.final=()=>({me:{...m.me},them:{...m.them},winner:m.winner,reason:m.reason});
  return m;
}
const timeText=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function scoreText(m,name){
  return 'YOU '+m.me.kills+' — '+m.them.kills+' '+(name||'THEM')+(m.rules.minutes?'  ·  '+timeText(m.timeLeft()):'')+'  ·  FIRST TO '+m.rules.target;
}

// ---- arena and spawns -------------------------------------------------------------------------------------
function arena(width,depth){return {cx:width/2,cz:depth/2,radius:9000,fade:1500};}
function mulberry(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// First spawn: the two pilots start on opposite sides of the arena centre, facing each other.
function startSpawn(role,ar,seed){
  const ang=mulberry(seed||1)()*Math.PI*2+(role==='guest'?Math.PI:0),d=1500;
  const x=ar.cx+Math.cos(ang)*d,z=ar.cz+Math.sin(ang)*d;
  return {x,z,heading:Math.atan2(ar.cx-x,ar.cz-z)};
}
// After a death: the ring point farthest from the opponent (never closer than ~2.5 km), nose towards the centre.
function respawnPoint(ar,opp,rnd){
  const r=rnd||Math.random,off=r()*Math.PI*2;let best=null;
  for(let i=0;i<8;i++){
    const ang=off+i*Math.PI/4,d=3500+r()*2000,x=ar.cx+Math.cos(ang)*d,z=ar.cz+Math.sin(ang)*d;
    const far=opp?Math.hypot(x-opp[0],z-opp[2]):1e5;
    if(!best||far>best.far)best={x,z,far};
  }
  best.heading=Math.atan2(ar.cx-best.x,ar.cz-best.z)+(r()-.5)*.6;
  return best;
}
// Beyond the arena the aeroplane takes structural damage; the warning starts before that.
function arenaPenalty(ar,x,z){
  const d=Math.hypot(x-ar.cx,z-ar.cz),over=d-ar.radius;
  return {dist:d,warn:d>ar.radius-ar.fade,out:over>0,dps:over>0?Math.min(14,4+over/500):0};
}

// ---- lobby handshake --------------------------------------------------------------------------------------
function cleanName(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9 ]+/g,'').replace(/\s+/g,' ').trim().slice(0,12);}
function hello(info){return {t:'hello',v:PROTOCOL,name:cleanName(info.name)||'PILOT',ac:info.ac,build:info.build||0};}
function compatible(a,b){return !!a&&!!b&&a.v===b.v;}

const API={PROTOCOL,TTK,HIT_RADIUS,PROTECT,RESPAWN,RELOAD,TOUGH,FLAG,STATE_HZ,qSlerp,qRotate,packState,unpackState,Track,gunDps,hitPct,victimPct,
  createMatch,timeText,scoreText,arena,startSpawn,respawnPoint,arenaPenalty,mulberry,cleanName,hello,compatible};
if(typeof module!=='undefined'&&module.exports)module.exports=API;
root.Duel=API;
})(typeof globalThis!=='undefined'?globalThis:this);
