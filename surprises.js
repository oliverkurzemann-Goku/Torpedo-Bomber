/* Build 231: mission surprises - the scheduler only (no THREE, no DOM).
 * A sortie used to be a straight line: fly to the target, shoot it, fly home. This module decides WHEN something
 * unexpected happens (a hidden gun opens up, fighters bounce you, a truck blows up in your face); each game supplies
 * the events - what actually spawns - and a few host callbacks. Everything is driven by the game's own flight time:
 *  - nothing runs on the ground, in the launch ride, in the pause or the menu (the game just does not call update());
 *  - one seeded random stream per sortie (seed = Math.random() unless fixed): same seed, same sortie;
 *  - bounded: a budget per sortie, a minimum gap between two events, at most N still-active events at once, and
 *    none while the aircraft is badly hurt or on its way home to land;
 *  - the difficulty changes how many, how soon, how hard and how fairly they are announced (Rookie: fewer, later,
 *    warned at once and weaker; Ace: more, sooner, no warning).
 * Event shape: {id, weight, max, minTime, free, ready(ctx,api)->number (0 = not now, else a weight multiplier),
 *               fire(ctx,api)->false|true|{alive():bool}}. `free` events (blasts that follow a kill) are fired through
 * trigger() and use neither the budget nor the gap. */
(function(root){
 'use strict';
 const LEVELS={
  rookie:{start:[85,125],gap:[75,110],max:2,rate:.07,active:1,minHull:.5,warn:0,power:.6},
  vet:{start:[55,95],gap:[50,85],max:3,rate:.10,active:2,minHull:.35,warn:2.5,power:1},
  ace:{start:[40,70],gap:[36,62],max:4,rate:.13,active:2,minHull:.2,warn:null,power:1.25}
 };
 const ALIAS={veteran:'vet',normal:'vet',easy:'rookie',hard:'ace'};
 function levelFor(id){return LEVELS[ALIAS[id]||id]||LEVELS.vet;}
 function mulberry32(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
 function between(rand,range){return range[0]+(range[1]-range[0])*rand();}

 function create(opt){
  opt=opt||{};
  const events=(opt.events||[]).slice(),say=opt.say||(()=>{});
  let lvl=levelFor(opt.level),seed=(opt.seed==null?Math.floor(Math.random()*4294967296):opt.seed)>>>0;
  let rand=mulberry32(seed),enabled=opt.enabled!==false;
  let time=0,tickT=0,nextAt=0,fails=0,fired=[],counts={},last=null,timers=[],live=[];
  function arm(){nextAt=time+between(rand,lvl.start);}
  const api={
   get rand(){return rand;},get level(){return lvl;},get power(){return lvl.power;},
   say:(text,delay)=>{if(delay>0)api.after(delay,()=>say(text));else say(text);},
   // seconds to wait before announcing an event: 0 = at once (Rookie), 2.5 s (Veteran), null = never (Ace)
   warnDelay:()=>lvl.warn,
   after:(delay,fn)=>{timers.push({at:time+delay,fn});}
  };
  function activeCount(){live=live.filter(h=>{try{return h&&h.alive?h.alive():false;}catch(e){return false;}});return live.length;}
  function eligible(ctx,free){
   const list=[];
   for(const ev of events){
    if(!!ev.free!==!!free)continue;
    if((counts[ev.id]||0)>=(ev.max||1))continue;
    if(time<(ev.minTime||0))continue;
    const w=ev.ready?ev.ready(ctx,api):1;
    if(w>0)list.push({ev,w:w*(ev.weight==null?1:ev.weight)*(ev.id===last?.35:1)});
   }
   return list;
  }
  function record(ev,result){
   counts[ev.id]=(counts[ev.id]||0)+1;last=ev.id;
   fired.push({id:ev.id,t:Math.round(time*10)/10});
   if(result&&typeof result==='object'&&result.alive)live.push(result);
  }
  function run(ev,ctx){
   const result=ev.fire(ctx,api);
   if(result===false)return false;
   record(ev,result);return true;
  }
  function pick(list){
   let total=0;for(const c of list)total+=c.w;
   let r=rand()*total;
   for(const c of list){r-=c.w;if(r<=0)return c.ev;}
   return list[list.length-1].ev;
  }
  function step(ctx){
   const timed=fired.filter(f=>!(events.find(e=>e.id===f.id)||{}).free).length;
   if(time<nextAt||timed>=lvl.max)return;
   if(ctx.suppress||ctx.hull<lvl.minHull||activeCount()>=lvl.active)return;
   if(rand()>=lvl.rate)return;
   const list=eligible(ctx,false);
   if(!list.length)return;
   const ev=pick(list);
   if(run(ev,ctx)){fails=0;nextAt=time+between(rand,lvl.gap);}
   else{fails++;nextAt=time+(fails>=8?between(rand,lvl.gap):6);if(fails>=8)fails=0;}
  }
  arm();
  return {
   LEVELS,
   get seed(){return seed;},get time(){return time;},get nextAt(){return nextAt;},get enabled(){return enabled;},
   get fired(){return fired.slice();},get lvl(){return lvl;},
   setEnabled(v){enabled=!!v;},
   setLevel(id){lvl=levelFor(id);},
   reset(newSeed,level){
    if(level!=null)lvl=levelFor(level);
    seed=(newSeed==null?Math.floor(Math.random()*4294967296):newSeed)>>>0;rand=mulberry32(seed);
    time=0;tickT=0;fails=0;fired=[];counts={};last=null;timers=[];live=[];arm();
   },
   // ctx: {flying, hull (0..1), suppress, ...whatever the events' ready() read}. Only flight time counts.
   update(dt,ctx){
    if(!enabled||!ctx||!ctx.flying)return;
    time+=dt;
    for(let i=timers.length-1;i>=0;i--)if(time>=timers[i].at){const t=timers.splice(i,1)[0];t.fn();}
    tickT+=dt;
    while(tickT>=1){tickT-=1;step(ctx);}
   },
   // an event that follows something the player did (a kill): not scheduled, not counted against the budget
   trigger(id,ctx){
    if(!enabled)return false;
    const ev=events.find(e=>e.id===id);if(!ev)return false;
    if((counts[id]||0)>=(ev.max||1))return false;
    if(ev.ready&&!(ev.ready(ctx,api)>0))return false;
    return run(ev,ctx);
   },
   // developer / test hook: fire one event now, ignoring budget, gap and chance
   force(id,ctx){
    const ev=events.find(e=>e.id===id);if(!ev)return false;
    return run(ev,ctx||{});
   },
   report(){return {seed,level:Object.keys(LEVELS).find(k=>LEVELS[k]===lvl),fired:fired.slice(),time:Math.round(time)};},
   ids(){return events.map(e=>e.id);},
   rng(){return rand;}
  };
 }
 const out={create,LEVELS,levelFor,mulberry32};
 root.Surprises=out;
 if(typeof module==='object'&&module.exports)module.exports=out;
})(typeof window!=='undefined'?window:globalThis);
