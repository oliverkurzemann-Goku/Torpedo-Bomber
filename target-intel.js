/* Build 296: what the pilot KNOWS about the targets of a sortie (no THREE, no DOM).
 * Before this build every target sat on the map as a yellow dot from take-off on, at every difficulty, and the
 * arrow pointed straight at it ("immer auf den gelben Punkt fliegen"). Now:
 *  - Rookie   ('marked'): as before - every target is marked, the arrow leads to it.
 *  - Veteran  ('search'): the briefing and the map show a SEARCH AREA around each target group (the target is inside,
 *               never at its centre); a target is marked only once the pilot has SEEN it (in range, in the clear,
 *               not hidden behind a hill) or once it gives itself away (a gun opens fire).
 *  - Ace      ('search'): bigger areas, shorter sight range, and a moving target that drops out of sight for a while
 *               is only shown where it was LAST SEEN.
 * Moving groups (a convoy, a train, a ferry, ships) get an updated contact report when they leave their area.
 * The host game feeds positions, the observer and an optional line-of-sight test; everything here is plain data,
 * seeded (same seed, same areas) and frame-rate independent (checks run on a fixed 0.25 s clock). */
(function(root){
 'use strict';
 // Sight range in metres in clear daylight from a sensible height, by target size (Veteran). Spielentscheidung (C):
 // what a pilot in a fighter picks out by eye - a bridge or a factory from far off, a single vehicle late.
 const SIGHT={huge:5200,large:3400,medium:2300,small:1700};
 const LEVELS={
  rookie:{id:'rookie',mode:'marked',sight:1.3,area:0,offset:[0,0],lose:Infinity,report:0},
  vet:{id:'vet',mode:'search',sight:1,area:1300,offset:[.2,.6],lose:Infinity,report:110},
  ace:{id:'ace',mode:'search',sight:.72,area:2100,offset:[.3,.72],lose:14,report:150}
 };
 const ALIAS={veteran:'vet',normal:'vet',easy:'rookie',hard:'ace'};
 function levelFor(id){return LEVELS[ALIAS[id]||id]||LEVELS.vet;}
 // What each difficulty means, for the menu (both games use the same words; game-specific lines are added by the host)
 const SUMMARY={
  rookie:'Targets marked on the map from take-off, the arrow leads to them. Weaker flak, fewer fighters, more fuel, warned of every surprise.',
  vet:'Only a SEARCH AREA is given: find the target yourself, it is marked once you have seen it. Normal flak and fighters.',
  ace:'Large search areas, shorter sight, a moving target you lose sight of only shows where it was last seen. Extra fighters, accurate flak, no warnings.'
 };
 function mulberry32(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
 const posOf=e=>e.pos==null?e:typeof e.pos==='function'?e.pos():e.pos;
 const CARD=['N','NE','E','SE','S','SW','W','NW'];

 // A fighter pilot sees less of a small target from high up and less when skimming the ground.
 function heightFactor(size,agl){
  if(agl==null)return 1;
  let f=1;
  if(agl<40)f*=.75+agl/160;
  const ceiling=size==='huge'?3500:size==='large'?2500:size==='medium'?1700:1200;
  if(agl>ceiling)f*=Math.sqrt(ceiling/agl);
  return f;
 }
 function sightRange(entry,level,ctx){
  ctx=ctx||{};
  const base=entry.sight||SIGHT[entry.size]||SIGHT.medium;
  let r=base*level.sight*(ctx.vis==null?1:ctx.vis)*heightFactor(entry.size,ctx.agl);
  if(entry.moving)r*=1.2;               // movement and dust catch the eye
  if(entry.burning)r*=1.6;              // smoke columns
  return r;
 }

 function hash(seed,str){let h=(seed>>>0)^0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
 // groups targets of one kind that lie within `gap` metres of each other; keys are stable (kind#n, sorted west to east)
 // so the briefing (planned from the briefing's points) and the sortie (from the live targets) agree on every area.
 function groupPoints(points,gap){
  gap=gap||2600;const groups=[];
  for(const e of points){
   if(e.optional||e.noArea)continue;
   const p=posOf(e);let g=groups.find(c=>c.kind===e.kind&&c.members.some(m=>{const q=posOf(m);return Math.hypot(q.x-p.x,q.z-p.z)<gap;}));
   if(!g){g={kind:e.kind,members:[]};groups.push(g);}
   g.members.push(e);
  }
  for(const g of groups){let x=0,z=0;for(const m of g.members){const p=posOf(m);x+=p.x;z+=p.z;}g.cx=x/g.members.length;g.cz=z/g.members.length;}
  groups.sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.cx-b.cx);
  const n={};for(const g of groups){n[g.kind]=(n[g.kind]||0);g.key=g.kind+'#'+n[g.kind]++;for(const m of g.members)m.group=g.key;}
  return groups;
 }
 function areaFor(g,level,seed){
  const rand=mulberry32(hash(seed,g.key)),members=g.members;
  let spread=0;for(const e of members){const p=posOf(e);spread=Math.max(spread,Math.hypot(p.x-g.cx,p.z-g.cz));}
  const base=level.area*(members[0].areaScale||1),r=Math.max(base,spread*1.35+base*.6),a=rand()*Math.PI*2;
  const d=r*(level.offset[0]+(level.offset[1]-level.offset[0])*rand());
  return {key:g.key,kind:g.kind,x:g.cx+Math.cos(a)*d,z:g.cz+Math.sin(a)*d,r,label:members[0].label||g.kind,moving:members.some(e=>e.moving),reportT:level.report,issued:0};
 }
 // the search areas for a set of points ({kind,x,z,optional}); [] at Rookie
 function planAreas(points,levelId,seed){
  const level=levelFor(levelId);if(level.mode!=='search')return [];
  return groupPoints(points.map(p=>({...p}))).map(g=>areaFor(g,level,seed>>>0));
 }

 function create(opt){
  opt=opt||{};
  const base=levelFor(opt.level),level=(opt.sightScale||opt.areaScale)?{...base,sight:base.sight*(opt.sightScale||1),area:base.area*(opt.areaScale||1)}:base,seed=(opt.seed==null?Math.floor(Math.random()*4294967296):opt.seed)>>>0,rand=mulberry32(seed^0x9e3779b9);
  const northSign=opt.northSign||1;      // Pacific charts use -z as north
  let entries=[],areas=[],clock=0,tick=0;
  function bearingWord(dx,dz){const a=((Math.atan2(dx,dz*northSign)*180/Math.PI)%360+360)%360;return CARD[Math.round(a/45)%8];}
  const api={
   get level(){return level;},
   get mode(){return level.mode;},
   get search(){return level.mode==='search';},
   get seed(){return seed;},
   // list: [{ref, kind, pos (object or fn), size:'huge'|'large'|'medium'|'small', moving, optional, label, sight}]
   // preset: areas planned for the briefing (same keys) - used as they are so the map and the sortie agree
   setup(list,preset){
    entries=(list||[]).map(e=>({...e,known:level.mode==='marked'&&!e.optional?'live':false,seenAt:-1,last:null}));
    if(level.mode!=='search'){areas=[];return api;}
    const groups=groupPoints(entries);
    areas=groups.map(g=>{const p=(preset||[]).find(a=>a.key===g.key);return p?{...areaFor(g,level,seed),x:p.x,z:p.z,r:p.r}:areaFor(g,level,seed);});
    return api;
   },
   // a group that turns up during the sortie (a contact report): its own key and area; returns the area (null at Rookie)
   addGroup(key,list){
    const added=(list||[]).map(e=>({...e,group:key,known:level.mode==='marked'&&!e.optional?'live':false,seenAt:-1,last:null}));
    entries.push(...added);
    if(level.mode!=='search')return null;
    const members=added.filter(e=>!e.optional);if(!members.length)return null;
    let x=0,z=0;for(const m of members){const p=posOf(m);x+=p.x;z+=p.z;}
    const a=areaFor({key,kind:members[0].kind,members,cx:x/members.length,cz:z/members.length},level,seed);
    areas.push(a);return {...a};
   },
   // ctx: {observer:{x,y,z}, agl, vis (0..1) or visAt(pos), los(observer,targetPos)->bool, alive(ref)->bool}
   update(dt,ctx){
    const events=[];clock+=dt;tick+=dt;
    if(tick<.25)return events;
    const step=tick;tick=0;
    const o=ctx&&ctx.observer;if(!o)return events;
    for(const e of entries){
     if(ctx.alive&&!ctx.alive(e.ref))continue;
     const p=posOf(e);if(!p)continue;
     const d=Math.hypot(p.x-o.x,p.z-o.z,(p.y==null?o.y:p.y)-o.y);
     const r=sightRange(e,level,ctx.visAt?{agl:ctx.agl,vis:ctx.visAt(p)}:ctx);
     const seen=d<r&&(!ctx.los||d<180||ctx.los(o,p));
     if(seen){
      if(!e.known||e.known==='last'){
       const first=!e.known;e.known='live';
       if(first&&level.mode==='search')events.push({type:'spotted',ref:e.ref,label:e.label,group:e.group,dist:d,dir:bearingWord(p.x-o.x,p.z-o.z),optional:!!e.optional});
       else if(!first)events.push({type:'regained',ref:e.ref,label:e.label});
      }
      e.seenAt=clock;e.last={x:p.x,z:p.z,y:p.y};
     }else if(e.known==='live'&&e.moving&&level.lose<Infinity&&clock-e.seenAt>level.lose){
      e.known='last';events.push({type:'lost',ref:e.ref,label:e.label});
     }
    }
    // areas: gone once every member is known (or dead); a moving group that has left its area gets a new report
    for(const a of areas){
     const members=entries.filter(e=>e.group===a.key&&(!ctx.alive||ctx.alive(e.ref)));
     a.done=!members.length||members.every(e=>e.known);
     if(a.done||!a.moving)continue;
     a.reportT-=step;
     const hidden=members.filter(e=>!e.known);
     let cx=0,cz=0;for(const e of hidden){const p=posOf(e);cx+=p.x;cz+=p.z;}cx/=hidden.length;cz/=hidden.length;
     if(a.reportT>0)continue;
     if(Math.hypot(cx-a.x,cz-a.z)<=a.r*.62){a.reportT=20;continue;}
     const ang=rand()*Math.PI*2,off=a.r*(level.offset[0]+(level.offset[1]-level.offset[0])*rand())*.7;
     const nx=cx+Math.cos(ang)*off,nz=cz+Math.sin(ang)*off,moved=Math.hypot(nx-a.x,nz-a.z);
     a.x=nx;a.z=nz;a.reportT=level.report;a.issued++;
     events.push({type:'report',key:a.key,label:a.label,moved,dir:bearingWord(nx-o.x,nz-o.z),dist:Math.hypot(nx-o.x,nz-o.z)});
    }
    return events;
   },
   // a target gives itself away (opens fire, explodes, is hit)
   reveal(ref){
    const e=entries.find(x=>x.ref===ref);if(!e)return false;
    const was=e.known==='live';e.known='live';e.seenAt=clock;const p=posOf(e);if(p)e.last={x:p.x,z:p.z,y:p.y};
    return !was;
   },
   setBurning(ref,on){const e=entries.find(x=>x.ref===ref);if(e)e.burning=!!on;},
   managed(ref){return entries.some(x=>x.ref===ref);},
   // 'live' (shown where it is), 'last' (shown where it was last seen), false (unknown). A target the module does
   // not manage (an ambush gun that reveals itself, a target spawned later) is always 'live'.
   known(ref){const e=entries.find(x=>x.ref===ref);if(!e)return 'live';return e.known;},
   markPos(ref){const e=entries.find(x=>x.ref===ref);if(!e)return null;if(e.known==='live')return posOf(e);if(e.known==='last')return e.last;return null;},
   areas(){return areas.filter(a=>!a.done).map(a=>({key:a.key,kind:a.kind,x:a.x,z:a.z,r:a.r,label:a.label,moving:a.moving,issued:a.issued}));},
   allAreas(){return areas.map(a=>({...a}));},
   counts(){const list=entries.filter(e=>!e.optional);return {total:list.length,known:list.filter(e=>e.known).length};},
   entries(){return entries;},
   // checkpoint: plain data, matched back by entry order
   checkpoint(){return {clock,areas:areas.map(a=>({...a})),entries:entries.map(e=>({known:e.known,seenAt:e.seenAt,last:e.last}))};},
   restore(s){if(!s)return;clock=s.clock||0;if(Array.isArray(s.areas))areas=s.areas.map(a=>({...a}));
    if(Array.isArray(s.entries))s.entries.forEach((x,i)=>{const e=entries[i];if(e){e.known=x.known;e.seenAt=x.seenAt;e.last=x.last;}});}
  };
  return api;
 }
 root.TargetIntel={LEVELS,SIGHT,SUMMARY,levelFor,sightRange,heightFactor,create,planAreas,groupPoints};
})(typeof window!=='undefined'?window:globalThis);
