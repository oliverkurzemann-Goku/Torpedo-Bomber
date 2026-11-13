/* Build 258: the Consolidated PBY-5A Catalina in the Pacific game - the flying boat's pure parts (no THREE, no DOM): the water rules, where a search
 * ring and the things hidden inside it are put, how far a lookout sees them, and the four patrol sorties (Sorties 24-27).
 * torpedo-carrier.html flies her on the computed core (flight-core.js SOURCES.pby) from the water beside the task force; the game code that uses these
 * functions is the block "PBY PATROL" there. Metres, +X east, +Z north, heading 0 = +X (the Pacific convention).
 * Every figure marked (C) is a game decision to adjust after playing, not flight-test data.
 *
 * A search sortie never shows the position of what it hunts: the briefing map and the minimap show a RING, the navigation arrow points at the ring's
 * centre, and the thing inside (a raft, a submarine, a convoy) is "found" only when it comes inside the sight range of `sight()`. */
(function(g){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TAU=Math.PI*2,R2D=180/Math.PI;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ---- the boat on the water (the same numbers as the Rhine Catalina, Build 252/257; hull points there are of 150, here percent of the hull) ---- */
const WATER={keel:.84,lift:.30,mu:{base:.032,hump:.09,at:.5,width:.2},sink:{ok:4.5,hard:6.5},over:14,pitch:{min:-.14,max:.40}};
// REALISTIC keeps the strict boat; ARCADE forgives (a thumb on a touch stick flies a steady glide, not a flare, and forgets the wheels): a harder alighting costs hull
// instead of the aircraft, a steeper nose, a wing low and a faster arrival are allowed, and the crew raises the wheels.
// Build 264: a rough sea (the game's seaState, 1 = calm, 1.55 rain, 1.93 heavy showers, 2.09 storm) moves the surface under the hull: it is harder to read and to land on.
// At seaState 1 every figure is exactly the calm-water figure above; per unit of sea above 1 (C): 12 % off the sink rate that is fine, 10 % off the one that breaks the hull,
// 0.03 rad off the tail-down limit, 0.04 rad off the wing-low limit, 1.5 m/s off the arrival-speed margin.
function rules(strict,sea){
 const r=strict?{strict:true,over:WATER.over,pitchMin:WATER.pitch.min,pitchMax:WATER.pitch.max,roll:.3,ok:WATER.sink.ok,hard:WATER.sink.hard,factor:14}
  :{strict:false,over:24,pitchMin:-.32,pitchMax:.50,roll:.5,ok:5.5,hard:9,factor:10};
 const k=Math.max(0,(sea||1)-1);
 if(k>0){r.ok*=1-.12*k;r.hard*=1-.10*k;r.pitchMax-=.03*k;r.roll-=.04*k;r.over-=1.5*k;}
 return r;
}
// hull damage of a firm alighting, in percent of the hull (the Rhine figure of 150 points / 1.5)
function alightingDamage(sink,r){return sink>r.ok?Math.round((20+(sink-r.ok)*r.factor)/1.5):0;}
// resistance coefficient on the water: a hump at about half the take-off speed
function mu(ratio){return WATER.mu.base+WATER.mu.hump*Math.exp(-(((ratio-WATER.mu.at)/WATER.mu.width)**2));}
// the touch-down verdict from the aircraft state; null = alighted well enough, else {crash:title,text} or {damage:percent,text}
function touchdown(s,r){
 if(s.speed>s.reference+r.over)return {crash:'TOO FAST',text:'Hit the water too fast — the hull broke up.'};
 if(s.pitch<r.pitchMin)return {crash:'NOSE FIRST',text:'The bow dug in.'};
 if(s.pitch>r.pitchMax)return {crash:'TAIL FIRST',text:'Stalled onto the water tail first.'};
 if(Math.abs(s.roll)>r.roll)return {crash:'FLOAT DUG IN',text:'A wing-tip float caught the water and she cartwheeled.'};
 if(s.sink>r.hard)return {crash:'HARD LANDING',text:'Came down too fast — the hull was stove in.'};
 if(s.sink>r.ok)return {damage:alightingDamage(s.sink,r),text:'HARD LANDING — HULL DAMAGED'};
 return null;
}

/* ---- compass text (north = +Z, east = +X) ---- */
const POINTS16=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const compass=(dx,dz)=>((Math.atan2(dx,dz)*R2D)%360+360)%360;
const cardinal=deg=>POINTS16[Math.round(deg/22.5)%16];
// "about 14 km WNW of the fleet, course 285" - the approximate course and distance the briefing gives instead of a position
function describe(from,ring){
 const dx=ring.x-from.x,dz=ring.z-from.z,km=Math.hypot(dx,dz)/1000,deg=compass(dx,dz);
 return 'about '+Math.round(km)+' km '+cardinal(deg)+' of the fleet, course '+String(Math.round(deg/5)*5%360).padStart(3,'0');
}
// the clock position of a point from the aircraft's own heading (heading 0 = +X): 12 o'clock is straight ahead, 3 to starboard
function clock(pos,heading,point){
 const rel=Math.atan2(point.z-pos.z,point.x-pos.x)-heading;
 const right=((rel%TAU)+TAU)%TAU;     // +Z is to the right of a +X heading, so a positive angle is clockwise
 return Math.round(right/TAU*12)%12||12;
}

/* ---- where the ring and the hidden thing go ---- */
// every sample of a disc of radius r around (x,z) must be open water: the 8 points at r and the centre
function openWater(water,x,z,r){
 if(!water(x,z))return false;
 for(let i=0;i<8;i++){const a=i*TAU/8;if(!water(x+Math.cos(a)*r,z+Math.sin(a)*r))return false;}
 return true;
}
/* place({random,origin,dist:[min,max],bearing:[a,b] rad,radius,offset:[min,max] fraction of the radius,water(x,z)->bool,clear})
 *   -> {ring:{x,z,r},point:{x,z},bearing,distance} or null. The ring's centre lies dist away from the origin on a bearing in [a,b]; the hidden point lies inside the ring,
 *   offset*radius away from the centre in a random direction - never in the middle, so flying straight to the centre of the ring does not find it by luck. */
function place(o){
 const random=o.random||Math.random,off=o.offset||[.18,.62],clear=o.clear??700;
 for(let n=0;n<80;n++){
  const b=o.bearing[0]+random()*(o.bearing[1]-o.bearing[0]),d=o.dist[0]+random()*(o.dist[1]-o.dist[0]);
  const cx=o.origin.x+Math.cos(b)*d,cz=o.origin.z+Math.sin(b)*d;
  const a=random()*TAU,q=o.radius*(off[0]+random()*(off[1]-off[0])),px=cx+Math.cos(a)*q,pz=cz+Math.sin(a)*q;
  if(!openWater(o.water,cx,cz,o.radius*.5)||!openWater(o.water,px,pz,clear))continue;
  return {ring:{x:cx,z:cz,r:o.radius},point:{x:px,z:pz},bearing:b,distance:d};
 }
 return null;
}

/* ---- the lookout ---- */
// Base sight range in metres for each thing, by day in clear air (C). Raft: the yellow dye patch (3 200 m) shows long before the raft itself (1 900 m);
// a flare is seen from further still. A surfaced submarine is a low grey sliver; her wake shows a little sooner. A convoy is seen by its smoke and hulls.
const SIGHT={raft:1900,dye:3200,flare:4200,sub:2300,wake:2700,convoy:6500,ship:5200,radar:15000};
const WEATHER_FACTOR={clear:1,broken:.9,haze:.6,rain:.45,storm:.32,lowcloud:.8,fog:.4,squall:.38};   // Build 264: the game's own weather names too
const TIME_FACTOR={day:1,dawn:.75,dusk:.7,night:.28};
const FLARE_TIME={dawn:1,dusk:1.15,night:1.6};   // Build 264: a signal flare shows further in the dark, not less
const LIT_TIME=.7;                               // something inside the light of a parachute flare is seen as at dusk
const DIFF_FACTOR={rookie:1.35,veteran:1,ace:.85};
function sightRange(kind,o={}){
 let t=kind==='flare'?(FLARE_TIME[o.time]??1):(TIME_FACTOR[o.time]??1);if(o.lit&&kind!=='flare')t=Math.max(t,LIT_TIME);
 const base=SIGHT[kind]??2000,w=WEATHER_FACTOR[o.weather]??1,d=DIFF_FACTOR[o.diff]??1;
 // an observer high above the sea sees a little further, but a thin target is lost from very high (above 2 500 m) and the dye is lost under cloud
 const alt=o.altitude??300,h=alt>2500?.7:alt<40?.8:1;
 if(kind==='radar')return SIGHT.radar*(o.radarRange?o.radarRange/SIGHT.radar:1);
 return base*w*t*d*h;
}
function sees(kind,distance,o={}){return distance<=sightRange(kind,o);}

/* ---- Build 264: what floats drifts, not everything on the sea is them, and the survivors' radio gives a noisy bearing ---- */
// the sea moves what floats in it: a drift vector (m/s) from a random bearing, faster in worse weather (C)
const DRIFT={clear:.45,broken:.55,haze:.5,lowcloud:.65,fog:.4,rain:.8,squall:1,storm:1.15};
function drift(random,weather){const a=random()*TAU,sp=(DRIFT[weather]??.5)*(.8+random()*.4);return {x:Math.sin(a)*sp,z:Math.cos(a)*sp,speed:sp,bearing:a};}   // north = +Z: bearing a points to (sin a, cos a)
// the things that are not them: each with the words that come when the lookout has closed in on it (IDENTIFY metres, below 450 m); wreck and empty raft drift, the whale and the sampan make way
const CONTACTS={wreck:{text:'FLOATING WRECKAGE — OIL AND SPLINTERS, NOBODY HERE',drifts:true},whale:{text:'A WHALE — IT BLOWS AS YOU PASS',speed:.9},
 sampan:{text:'A FISHING SAMPAN — LOCAL FISHERMEN',speed:1.8},raft:{text:'AN EMPTY RAFT — NOBODY IN IT',drifts:true}};
const IDENTIFY=900;
// decoys({ring:{x,z,r},point,count,random,water,clear,kinds}) -> [{kind,x,z,heading}]: inside the ring, never within 1 100 m of the real thing or within 900 m of each other, on open water
function decoys(o){
 const random=o.random||Math.random,list=[],kinds=o.kinds||Object.keys(CONTACTS);
 for(let n=0;n<240&&list.length<o.count;n++){
  const a=random()*TAU,q=o.ring.r*(.15+random()*.75),x=o.ring.x+Math.cos(a)*q,z=o.ring.z+Math.sin(a)*q;
  if(Math.hypot(x-o.point.x,z-o.point.z)<1100||list.some(l=>Math.hypot(l.x-x,l.z-z)<900)||!openWater(o.water,x,z,o.clear??300))continue;
  list.push({kind:kinds[Math.floor(random()*kinds.length)],x,z,heading:random()*TAU});
 }
 return list;
}
// the survivors' emergency radio: a bearing (degrees, compass, from the aircraft to the set) every `interval` s within `range` m; the error grows with the range (C): 4 degrees + 1 degree per 3 km,
// roughly normal and never more than twice that. Two bearings from two places cross near the raft.
const DF={interval:25,range:24000,base:4,perKm:1/3,keep:4};
function bearingFix(from,to,random){
 const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz),sd=DF.base+d/1000*DF.perKm,z=clamp((random()+random()+random()+random()-2)/.5774,-2,2);
 return {bearing:((compass(dx,dz)+z*sd)%360+360)%360,error:sd,range:d};
}

/* ---- the submarine's dive (Ko-hyoteki, a midget boat: quicker than a fleet boat) ---- */
const SUB={diveSeconds:22,spotAt:2300,submergedSpeed:1.6,surfacedSpeed:2.2,trailSeconds:75,resurfaceAfter:170,lethal:{surfaced:15,diving:15,submerged:26},maxDives:2};
// maxDives = how many times she crash-dives (2): she comes up once after the first dive and stays down after the second (her bubble trail still shows where).
// the state a submarine is in: advance it by dt. s={state:'surfaced'|'diving'|'submerged'|'sunk', t, dives, x,z,heading}
function stepSub(s,dt,o={}){
 s.t=(s.t||0)+dt;
 if(s.state==='sunk')return s;
 const sp=s.state==='submerged'?SUB.submergedSpeed:SUB.surfacedSpeed;
 s.x+=Math.cos(s.heading)*sp*dt;s.z+=Math.sin(s.heading)*sp*dt;
 if(s.state==='surfaced'){
  s.dive=0;
  if(o.spotted){s.state='diving';s.t=0;s.dives=(s.dives||0)+1;s.diveFrom={x:s.x,z:s.z};}
 }else if(s.state==='diving'){
  s.dive=clamp(s.t/SUB.diveSeconds,0,1);
  if(s.t>=SUB.diveSeconds){s.state='submerged';s.t=0;s.dive=1;}
 }else if(s.state==='submerged'){
  s.dive=1;
  if(s.t>=SUB.resurfaceAfter&&(s.dives||0)<SUB.maxDives){s.state='surfaced';s.t=0;s.dive=0;}
 }
 return s;
}
// the lethal radius of a depth charge or a bomb that goes off at (x,z) on the surface, for the submarine's present state; false when she is out of reach
function inReach(s,x,z){
 if(!s||s.state==='sunk')return false;
 const r=SUB.lethal[s.state]??15;
 return Math.hypot(x-s.x,z-s.z)<=r;
}

/* ---- the sorties (Sorties 24-27, appended before the Okinawa free flight) ----
 * `pby` carries what the game builds at the start: kind, ring distance/radius/bearing window, what hides in it. `torps` = depth charges or bombs, 0 for the rescue. The
 * bearing windows keep the ring in the open sea west and north-west/south-west of the fleet (the Okinawa coast lies east). */
const WEST=[Math.PI*.62,Math.PI*1.38];        // 112 deg .. 248 deg: from north-west round to south-west
const missions=[
 {title:'Sortie 24',sub:'Dumbo · Airmen Down',pby:{kind:'dumbo',dist:[11000,15000],radius:4200,bearing:WEST,survivors:2,zeros:2},theater:'patrol',loadout:'depth',torps:0,fuel:100,zeros:0,targets:[],
  body:'<b>PBY-5A Catalina — Dumbo.</b> A Dauntless crew went into the sea after a Zero attack. Nobody knows exactly where: their last position report puts them <b>somewhere inside the search ring</b> on the map. '
   +'Take off from the water beside the fleet, search low over the sea and watch for the <b>yellow dye patch</b> and a signal flare. Alight beside the raft, taxi alongside and take both airmen aboard. '
   +'<b>Wheels up for the water.</b> The survivors\' radio gives a <b>noisy bearing</b> every 25 s (two bearings from two places cross near them); not everything on the sea is them. Then take off again, Zeros will come, and alight beside the fleet.',
  operation:{weather:['clear','broken'],phases:[],notes:'Find the raft in the search ring, alight, take the airmen aboard, take off and alight beside the fleet. No exact position is given: fly a search pattern. The Catalina has no forward guns, only the gunners.'}},
 {title:'Sortie 25',sub:'Submarine Hunt',pby:{kind:'sub',dist:[10000,14000],radius:4500,bearing:WEST,zeros:0},theater:'patrol',loadout:'depth',torps:4,fuel:100,zeros:0,targets:[],weather:'broken',
  body:'<b>Catalina — submarine hunt.</b> A contact report: a Japanese <b>Ko-hyoteki</b> carrier is on the surface charging batteries, <b>somewhere inside the ring</b>, no exact fix. Search low; she <b>crash-dives about 20 seconds</b> after she sees you. '
   +'Drop <b>depth charges</b> across her while she is going down, or onto her <b>bubble trail</b> afterwards. <b>4 depth charges</b>; she will come up once more, and only once. Then return to the fleet and alight.',
  operation:{weather:['clear','broken','haze'],phases:[],notes:'Find the surfaced submarine in the search ring, sink her with depth charges (while she dives or on the bubble trail) and alight beside the fleet.'}},
 {title:'Sortie 26',sub:'Contact Report',pby:{kind:'shadow',dist:[14000,18000],radius:6000,bearing:WEST,zeros:2,hold:240,minRange:3000,maxRange:8500},theater:'patrol',loadout:'depth',torps:0,fuel:100,zeros:0,targets:[],weather:'broken',
  body:'<b>Catalina — contact report.</b> A Japanese convoy is crossing the area inside the ring. Find it, then <b>keep contact for four minutes</b> from <b>3 to 8.5 km</b>: close enough to see her, outside her guns. '
   +'Radio reports go out as long as you hold her. The escort will <b>scramble Zeros</b> once she has been watched for a minute: use your <b>gunners</b>, stay low and keep turning. Then return and alight beside the fleet.',
  operation:{weather:['broken','clear'],phases:[],notes:'Find the convoy in the search ring and hold contact for 4 minutes between 3 and 8.5 km. Closer than 2.2 km the escorts open fire. Zeros scramble after about a minute.'}},
 {title:'Sortie 27',sub:'Black Cat · Night Strike',time:'night',sea:1.4,pby:{kind:'blackcat',dist:[12000,16000],radius:5200,bearing:WEST,zeros:0,radar:15000},theater:'patrol',loadout:'depth',torps:4,fuel:100,zeros:0,targets:[],weather:'haze',
  body:'<b>Catalina in Black Cat paint — night.</b> A supply convoy, two freighters and a destroyer, is running dark <b>somewhere inside the ring</b>. Your <b>search radar</b> shows ships as blips on the map within 8 miles: no names, no certainty. '
   +'Find them, come in <b>low (50 to 200 m)</b> from the dark side and put <b>4 bombs</b> on a freighter; the destroyer fires back. <b>Both freighters must go down.</b> FLARE lights the target. Then return to the fleet and alight.',
  operation:{weather:['haze'],phases:[],notes:'Search radar shows ships within 8 NM as blips only. Both freighters must be sunk; the destroyer is optional. Bombs from 50-200 m, flat and level.'}}
];
// the convoys: relative formations (metres ahead / to starboard of the leader, heading shared); leader first
const FORMATION={
 shadow:[{type:'freighter',ahead:0,side:0},{type:'freighter',ahead:-420,side:150},{type:'freighter',ahead:-860,side:-130},{type:'destroyer',ahead:520,side:-420,flak:true},{type:'destroyer',ahead:-260,side:520,flak:true}],
 blackcat:[{type:'freighter',ahead:0,side:0},{type:'freighter',ahead:-460,side:160},{type:'destroyer',ahead:420,side:-380,flak:true,optional:true}]
};

const API={DRIFT,drift,CONTACTS,IDENTIFY,decoys,DF,bearingFix,WATER,rules,alightingDamage,mu,touchdown,compass,cardinal,describe,clock,openWater,place,SIGHT,sightRange,sees,SUB,stepSub,inReach,missions,FORMATION,mulberry32};
g.PbyPatrol=API;
if(typeof module==='object'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
