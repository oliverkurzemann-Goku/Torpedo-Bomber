/* Build 236: the Rhine squad (squad.js). Pure logic against the real flight core and the shipped mission list:
 *  - who flies with you (solo sorties stay solo), skills by difficulty, deterministic for a seed
 *  - what a wingman does next (defend the leader, the role, a free target, home when hurt or empty)
 *  - a ground pass flown through FlightControl.ai at 20/60/120 FPS: guns / rockets / a bomb run on a real hill
 *  - the take-off roll on the player's own forces (distance inside the 900 m strip), the landing path, radio, bonus */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
global.FlightCoreEnabled=true;
const F=global.FlightCore=require('../../flight-core.js'),FC=require('../../flight-control.js'),Squad=require('../../squad.js');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const missions=vm.runInNewContext(html.slice(html.indexOf('const MISSIONS=['),html.indexOf('function M(){'))+'\nMISSIONS');
const G=9.81;

/* ---- 1. the plan ---- */
{
 const byId=Object.fromEntries(missions.map(m=>[m.id,m]));
 const solo=['free','circ','train','factory','bridge','jetjabo','komet','stuka','jetambush','kometdash','nightworks'];
 for(const id of solo)assert.equal(Squad.plan(byId[id],{difficulty:'vet',seed:3}).length,0,id+' stays a solo sortie');
 const withSquad=missions.filter(m=>m.squad);
 assert(withSquad.length>=8,'a good share of the sorties fly with wingmen ('+withSquad.length+')');
 assert(missions.filter(m=>!m.squad).length>=9,'and plenty stay solo ('+missions.filter(m=>!m.squad).length+')');
 for(const m of withSquad){
  const p=Squad.plan(m,{difficulty:'vet',seed:7,side:['bf109','fw190','me262','ju87'].includes(m.ac)?'axis':'allied'});
  assert.equal(p.length,Math.min(2,m.squad.n),m.id+' squad size');
  assert.deepEqual(p.map(w=>w.callsign),['TWO','THREE'].slice(0,p.length));
  assert.equal(new Set(p.map(w=>w.name)).size,p.length,'names differ');
  assert(!m.custom&&m.ac!=='me163','no squad for the Komet or custom sorties');
  for(const w of p)assert(['strike','hunter','cover'].includes(w.role),m.id+' role '+w.role);
 }
 // ground sorties get a strike wingman, air sorties a hunter, a pair on a mixed sortie splits the work
 assert.equal(Squad.plan({squad:{n:1},kills:{truck:4}},{seed:1})[0].role,'strike');
 assert.equal(Squad.plan({squad:{n:1},bombers:{n:3}},{seed:1})[0].role,'hunter');
 assert.deepEqual(Squad.plan({squad:{n:2},bombers:{n:3},enemyAir:2},{seed:1}).map(w=>w.role),['hunter','cover']);
 assert.deepEqual(Squad.plan({squad:{n:2},kills:{truck:4},enemyAir:2},{seed:1}).map(w=>w.role),['strike','hunter']);
 assert.deepEqual(Squad.plan({squad:{n:2,roles:['cover','strike']},kills:{truck:4}},{seed:1}).map(w=>w.role),['cover','strike']);
 // deterministic for a seed, different across seeds; easier levels give a better wingman with more hit points
 const a=Squad.plan(byId.libs,{difficulty:'vet',seed:11}),b=Squad.plan(byId.libs,{difficulty:'vet',seed:11}),c=Squad.plan(byId.libs,{difficulty:'vet',seed:12});
 assert.deepEqual(a,b);assert.notDeepEqual(a.map(w=>w.name+w.skill),c.map(w=>w.name+w.skill));
 const mean=d=>{let s=0,n=0;for(let seed=1;seed<=40;seed++)for(const w of Squad.plan(byId.libs,{difficulty:d,seed})){s+=w.skill;n++;}return s/n;};
 assert(mean('rookie')>mean('vet')&&mean('vet')>mean('ace'),'the wingman is better on the easy levels');
 assert(Squad.maxHp('p47',Squad.LEVELS.rookie.hp)>Squad.maxHp('p47',Squad.LEVELS.ace.hp),'and lasts longer');
 assert(Squad.describe(a).includes('TWO')&&/high cover|hunter/.test(Squad.describe(a)));
}

/* ---- 2. what to do next ---- */
{
 const L={pos:{x:0,y:900,z:0},vel:{x:0,y:0,z:130},spd:130,engaged:false};
 const me=(o={})=>({pos:{x:-40,y:900,z:-30},hp:8,maxhp:8,ammo:3000,bombs:2,rockets:8,role:'strike',aggression:.7,skill:.6,cool:0,...o});
 const truck=(x,z,o={})=>({ref:'t'+x,kind:'truck',pos:{x,y:100,z},alive:true,heavy:false,primary:true,claimed:false,...o});
 const foe=(x,z,o={})=>({ref:'f'+x,pos:{x,y:950,z},bomber:false,alive:true,claimed:false,threatLeader:false,...o});
 // far away targets: he stays in formation until the leader is in reach
 assert.equal(Squad.chooseTask({leader:L,me:me(),targets:[truck(9000,0)],foes:[]}).task,'form');
 const t=Squad.chooseTask({leader:L,me:me(),targets:[truck(3000,0),truck(6500,0)],foes:[]});
 assert.equal(t.task,'ground');assert.equal(t.ref,'t3000','the nearest one');
 // a target another pilot already claimed is left alone unless it is the only one
 assert.equal(Squad.chooseTask({leader:L,me:me(),targets:[truck(3000,0,{claimed:true}),truck(4200,0)],foes:[]}).ref,'t4200');
 assert.equal(Squad.chooseTask({leader:L,me:me(),targets:[truck(3000,0,{claimed:true})],foes:[]}).ref,'t3000');
 // guns alone cannot take a bridge; with bombs he goes
 const bridge=[{ref:'b',kind:'bridge',pos:{x:2500,y:90,z:0},alive:true,primary:true,claimed:false}];
 assert.equal(Squad.chooseTask({leader:L,me:me({bombs:0,rockets:8}),targets:bridge,foes:[]}).task,'form');
 assert.equal(Squad.chooseTask({leader:L,me:me({bombs:1}),targets:bridge,foes:[]}).task,'ground');
 // the leader has opened fire: targets up to twice the window count
 assert.equal(Squad.chooseTask({leader:{...L,engaged:false},me:me(),targets:[truck(7000,0)],foes:[]}).task,'form');
 assert.equal(Squad.chooseTask({leader:{...L,engaged:true},me:me(),targets:[truck(7000,0)],foes:[]}).task,'ground');
 // a bandit on the leader's tail comes first, for every role
 for(const role of ['strike','hunter','cover']){
  const r=Squad.chooseTask({leader:L,me:me({role}),targets:[truck(3000,0)],foes:[foe(-400,-900,{threatLeader:true})]});
  assert.equal(r.task,'air',role);assert.equal(r.why,'six');
 }
 // a hunter takes fighters before bombers when both are near; cover stays high until somebody comes close
 const mixed=[foe(600,600,{bomber:true,ref:'B'}),foe(900,200,{ref:'F'})];
 assert.equal(Squad.chooseTask({leader:L,me:me({role:'hunter'}),targets:[],foes:mixed}).ref,'F');
 assert.equal(Squad.chooseTask({leader:L,me:me({role:'cover'}),targets:[],foes:[foe(9000,9000)]}).task,'cover');
 assert.equal(Squad.chooseTask({leader:L,me:me({role:'cover'}),targets:[],foes:[foe(300,900)]}).task,'air');
 // the leash: a fight far from the leader is not taken, and a wingman dragged away comes back (a bandit on the leader's tail still wins)
 assert.equal(Squad.chooseTask({leader:L,me:me({role:'hunter'}),targets:[],foes:[foe(9000,9000)]}).task,'form');
 assert.equal(Squad.chooseTask({leader:L,me:me({role:'hunter',far:true}),targets:[],foes:[foe(300,900)]}).why,'rejoin');
 assert.equal(Squad.chooseTask({leader:L,me:me({role:'hunter',far:true}),targets:[],foes:[foe(-400,-900,{threatLeader:true})]}).why,'six');
 // a strike pilot defends himself against a bandit on top of him
 assert.equal(Squad.chooseTask({leader:L,me:me(),targets:[truck(3000,0)],foes:[foe(-300,-200)]}).task,'air');
 // hurt or empty: home. A cool-down after a pass keeps him in formation for a while.
 assert.deepEqual([Squad.chooseTask({leader:L,me:me({hp:2}),targets:[truck(3000,0)],foes:[]}).task,Squad.chooseTask({leader:L,me:me({ammo:10,bombs:0,rockets:0}),targets:[truck(3000,0)],foes:[]}).task],['rtb','rtb']);
 assert.equal(Squad.chooseTask({leader:L,me:me({cool:9}),targets:[truck(3000,0)],foes:[]}).task,'form');
 // a cautious pilot would rather take the light target than the battery
 const flak={ref:'F88',kind:'flak',pos:{x:2500,y:100,z:0},alive:true,heavy:true,primary:false,claimed:false};
 assert.equal(Squad.chooseTask({leader:L,me:me({aggression:.3}),targets:[flak,truck(3600,0,{primary:false})],foes:[]}).ref,'t3600');
 assert.equal(Squad.chooseTask({leader:L,me:me({aggression:.9}),targets:[flak,truck(3600,0,{primary:false})],foes:[]}).ref,'F88');
}

/* ---- 3. a ground pass through the real pilot ---- */
const rough=(x,z)=>100+55*Math.sin(x/650)*Math.cos(z/820)+Math.max(0,28*Math.sin(x/260+1.3));
const gentle=(x,z)=>100+12*Math.sin(x/900);
const specFor=(kind,y,mass)=>{const m=F.model(kind),lo=F.loadout(m,mass);
 const stall=F.stallSpeed(m,y,lo.ratio),max=F.levelMaxSpeed(m,y,lo.mass*G);return {stall,max,gLim:m.assumed.nLimit,corner:stall*Math.sqrt(m.assumed.nLimit)};};
function flyPass(o){
 const hill=o.ground||rough;
 const kind=o.kind||'p47',fps=o.fps||60,dt=1/fps,load={fuel:70,bombs:o.bombs??0,rockets:o.rockets??0};
 const tgt={x:o.tx??0,y:hill(o.tx??0,o.tz??0),z:o.tz??0,kind:o.targetKind||'truck',radius:7};
 const e={kind,pos:{x:o.sx??-4200,y:o.sy??tgt.y+300,z:o.sz??-300,clone(){return this;}},vel:{x:0,y:0,z:0,set(a,b,c){this.x=a;this.y=b;this.z=c;}},spd:125,heading:Math.PI/2,pitch:0,roll:0,loadout:load};
 e.pos.addScaledVector=function(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this;};
 const spec=specFor(kind,tgt.y+300,load),skill=o.skill??.62;
 const run=Squad.newRun(),st={bombs:o.bombs??0,rockets:o.rockets??0,ammo:3000},opts={vector:true,rollAccel:4+5*skill,rollGain:3.2+1.4*skill,pullGain:2+1.2*skill,rollDeadband:.12,aimTau:.12,powerRate:.9,pushBelow:.3};
 const rng=Squad.rngFrom(o.seed||5);
 const rec={minAgl:1e9,phases:new Set(),gunVolleys:0,hits:0,rockets:0,bombs:0,bombMiss:null,rocketHits:0,t:0,rocketMiss:[]};
 const shells=[],bombs=[];
 for(let i=0;i<fps*90;i++){
  const me={pos:e.pos,heading:e.heading,pitch:e.pitch,spd:e.spd,vel:e.vel,bombs:st.bombs,rockets:st.rockets,ammo:st.ammo,skill,spec};
  const r=Squad.groundPass(run,me,tgt,{groundAt:hill},dt);
  rec.phases.add(r.phase);
  FC.ai(e,dt,r.aim,r.spd,opts);
  rec.minAgl=Math.min(rec.minAgl,e.pos.y-hill(e.pos.x,e.pos.z));
  const nose={x:Math.sin(e.heading)*Math.cos(e.pitch),y:Math.sin(e.pitch),z:Math.cos(e.heading)*Math.cos(e.pitch)};
  if(r.fire.guns){
   // two scatter-cone rounds per volley, a volley every 0.055 s: where would they land?
   rec.gunT=(rec.gunT||0)-dt;
   if(rec.gunT<=0){rec.gunT=.055;rec.gunVolleys++;
    for(let k=0;k<2;k++){
     const a=Squad.gunScatter(skill,Math.hypot(tgt.x-e.pos.x,tgt.z-e.pos.z)),ex=(rng()-.5)*2*a,ey=(rng()-.5)*2*a;
     const d={x:nose.x+ex,y:nose.y+ey,z:nose.z+ex*.3};const l=Math.hypot(d.x,d.y,d.z);d.x/=l;d.y/=l;d.z/=l;
     shells.push({p:{x:e.pos.x,y:e.pos.y,z:e.pos.z},d,life:2.4});st.ammo-=8;}}
  }
  if(r.fire.rocket&&st.rockets>0){st.rockets--;rec.rockets++;shells.push({rocket:true,p:{x:e.pos.x,y:e.pos.y-1,z:e.pos.z},d:{x:nose.x,y:nose.y,z:nose.z},life:6,speed:Math.max(150,e.spd+180)});}
  if(r.fire.bomb&&st.bombs>0){st.bombs--;rec.bombs++;bombs.push({p:{x:e.pos.x,y:e.pos.y,z:e.pos.z},v:{x:e.vel.x,y:e.vel.y,z:e.vel.z}});}
  for(let k=shells.length-1;k>=0;k--){const s=shells[k],v=s.rocket?s.speed:760;s.life-=dt;
   const a={...s.p};s.p.x+=s.d.x*v*dt;s.p.y+=s.d.y*v*dt;s.p.z+=s.d.z*v*dt;if(s.rocket)s.d.y-=.06*dt;
   // distance from the segment to the target (same test as updateBullets / updateOrdnance)
   const ex=s.p.x-a.x,ey=s.p.y-a.y,ez=s.p.z-a.z,l2=ex*ex+ey*ey+ez*ez||1;let u=((tgt.x-a.x)*ex+(tgt.y+3-a.y)*ey+(tgt.z-a.z)*ez)/l2;u=Math.max(0,Math.min(1,u));
   const cx=a.x+ex*u,cy=a.y+ey*u,cz=a.z+ez*u;
   if(Math.hypot(cx-tgt.x,cz-tgt.z)<tgt.radius+2&&cy<tgt.y+9){if(s.rocket)rec.rocketHits++;else rec.hits++;shells.splice(k,1);continue;}
   if(s.p.y<=hill(s.p.x,s.p.z)||s.life<=0){if(s.rocket)rec.rocketMiss.push(Math.hypot(s.p.x-tgt.x,s.p.z-tgt.z));shells.splice(k,1);}}
  for(let k=bombs.length-1;k>=0;k--){const b=bombs[k];b.v.y-=32*dt;b.p.x+=b.v.x*dt;b.p.y+=b.v.y*dt;b.p.z+=b.v.z*dt;
   if(b.p.y<=hill(b.p.x,b.p.z)+.6){rec.bombMiss=Math.hypot(b.p.x-tgt.x,b.p.z-tgt.z);bombs.splice(k,1);}}
  if(r.done){rec.t=i*dt;rec.done=true;break;}
  if(e.pos.y<hill(e.pos.x,e.pos.z)){rec.crash=true;break;}
 }
 rec.e=e;rec.st=st;return rec;
}
{
 // guns on a truck: the pass is flown, he clears the hill and the cone puts rounds on the target
 const fps=[20,60,120],runs=fps.map(f=>flyPass({fps:f,ammo:3000}));
 for(const [i,r] of runs.entries()){
  assert(r.done&&!r.crash,fps[i]+' FPS: the pass ends with him flying ('+[...r.phases]+')');
  assert(['ingress','attack','pullout','egress'].every(p=>r.phases.has(p)),fps[i]+' FPS: all four phases flown');
  assert(r.minAgl>38,fps[i]+' FPS: stays off the ground ('+r.minAgl.toFixed(0)+' m)');
  assert(r.gunVolleys>=4,fps[i]+' FPS: fires a burst ('+r.gunVolleys+' volleys)');
  assert(r.hits>=1,fps[i]+' FPS: a skilled pilot puts rounds on the truck ('+r.hits+' hits)');
 }
 assert(Math.max(...runs.map(r=>r.hits))<400,'but not every round');
 // rockets: a salvo of up to four, aimed down the same dive
 const rk=flyPass({rockets:8,seed:9,ground:gentle});
 assert(rk.done&&!rk.crash&&rk.rockets>=2&&rk.rockets<=4,'a rocket salvo ('+rk.rockets+')');
 assert(rk.rocketHits+rk.rocketMiss.filter(d=>d<40).length>=1,'at least one lands close (hits '+rk.rocketHits+', misses '+rk.rocketMiss.map(d=>d.toFixed(0))+')');
 // a bomb run on a bridge: one bomb, low and level, and it lands on the span
 const bb=flyPass({bombs:2,targetKind:'bridge',tx:300,tz:100,sx:-4500,sz:-250,ground:gentle});
 assert(bb.done&&!bb.crash&&bb.bombs===1,'one bomb dropped per pass ('+bb.bombs+')');
 assert(bb.bombMiss!=null&&bb.bombMiss<45,'and it lands on the target (miss '+(bb.bombMiss==null?'none':bb.bombMiss.toFixed(0))+' m)');
 assert(bb.minAgl>60,'a bomb run keeps its height ('+bb.minAgl.toFixed(0)+' m)');
 // set-up: starting right next to the target he flies away first instead of a hopeless pass
 const close=flyPass({sx:-500,sz:-300,sy:rough(-500,-300)+260});
 assert(close.phases.has('away')&&close.done&&!close.crash,'too close: breaks away, sets up again and flies the pass');
 // all five fighter types fly it without hitting the ground
 for(const kind of ['bf109','fw190','me262']){const r=flyPass({kind});assert(r.done&&!r.crash&&r.minAgl>34,kind+' flies the pass ('+r.minAgl.toFixed(0)+' m)');}
 // bomb release geometry on its own: dropped at the computed range, the bomb lands within the tolerance
 const me={pos:{x:-900,y:300,z:0},vel:{x:130,y:0,z:0},spd:130};
 let rel=null;for(let x=-2500;x<0;x+=1){me.pos.x=x;if(Squad.bombRelease(me,{x:0,y:100,z:0},6)){rel=x;break;}}
 assert(rel!=null);{const tt=Math.sqrt(2*200/32);assert(Math.abs(-rel-130*tt)<8,'release range matches the fall ('+(-rel).toFixed(0)+' vs '+(130*tt).toFixed(0)+' m)');}
 assert(!Squad.bombRelease({pos:{x:-900,y:110,z:0},vel:{x:130,y:0,z:0},spd:130},{x:0,y:100,z:0}),'no release this low');
}

/* ---- 4. the take-off roll on the player's own forces ---- */
{
 const roll=(kind,load,fps=60)=>{
  const w={kind,spd:0,pos:{y:200},loadout:load,flaps:kind==='me163'?0:.5},dt=1/fps;let x=0,t=0,lift=false;
  for(;t<60;t+=dt){const r=Squad.takeoffRoll(w,dt,{FlightCore:F});x+=w.spd*dt;if(r.liftoff){lift=true;break;}}
  return {x,t,lift,w};
 };
 for(const [kind,load] of [['p47',{fuel:100,bombs:2,rockets:8}],['p47',{fuel:70}],['bf109',{fuel:70,bombs:1}],['fw190',{fuel:70,bombs:1}],['me262',{fuel:70,bombs:2}]]){
  const r=roll(kind,load);
  assert(r.lift,kind+' leaves the ground');
  assert(r.x<900&&r.x>150,kind+' rolls '+r.x.toFixed(0)+' m on the 900 m strip');
  const r20=roll(kind,load,20),r120=roll(kind,load,120);
  assert(Math.abs(r20.x-r.x)<25&&Math.abs(r120.x-r.x)<25,kind+' same roll at 20/60/120 FPS ('+[r20.x,r.x,r120.x].map(v=>v.toFixed(0))+')');
 }
 // the same call the player's coreGround makes: with the same stores the roll is as long as FlightCore predicts
 {const m=F.model('p47'),lo=F.loadout(m,{fuel:100,bombs:2,rockets:8});const w={kind:'p47',spd:0,pos:{y:200},loadout:{fuel:100,bombs:2,rockets:8},flaps:.5};
  let t=0;for(;t<60;t+=1/60){if(Squad.takeoffRoll(w,1/60,{FlightCore:F}).liftoff)break;}
  assert(t>8&&t<30,'loaded P-47 needs '+t.toFixed(1)+' s to lift off');}
}

/* ---- 5. landing, radio, bonus ---- */
{
 const f={x:6000,y:195,z:15800};
 const a=Squad.landingPath(0,f),b=Squad.landingPath(1,f);
 for(const path of [a,b]){assert.equal(path.length,3);assert(path[0].x>path[1].x&&path[1].x>path[2].x,'comes in from the east');assert(path[0].y>path[1].y&&path[1].y>path[2].y,'descending');assert(Math.abs(path[2].z-f.z)<1);assert(path[2].y-f.y<3);}
 assert(b[0].x>a[0].x&&b[0].y>a[0].y,'THREE flies a longer, higher pattern than TWO (no collision)');
 assert.equal(Squad.callout('six',{callsign:'THREE'},0).split(' — ')[0],'THREE');
 assert(Squad.callout('kill',null,5).startsWith('TWO — '));
 for(const ev of ['roll','airborne','joined','ground','groundHit','rocket','bomb','air','six','kill','hit','bingo','lost','landed','cover'])assert(Squad.callout(ev,{callsign:'TWO'},1).length>8,ev);
 assert.equal(Squad.flightBonus(2,true),300);assert.equal(Squad.flightBonus(2,false),0);assert.equal(Squad.flightBonus(0,true),0);
 // grid and formation geometry
 assert(Squad.gridSlot(0,12.4).right>0&&Squad.gridSlot(1,12.4).right<0,'one on each side of the leader');
 assert(Math.abs(Squad.gridSlot(0,12.4).right)>12.4,'wings clear each other');
 assert(Squad.gridSlot(1,12.4).back>Squad.gridSlot(0,12.4).back);
 assert(Squad.formationOffset('cover',0,12,10).up>100&&Squad.formationOffset('cover',0,12,10).back>300,'cover sits high behind');
 assert(Math.abs(Squad.formationOffset('strike',0,12,0).right)>=30,'close wing');
}
console.log('squad: plan, tasks, ground pass (guns/rockets/bomb at 20/60/120 FPS), take-off roll, landing, radio OK');
