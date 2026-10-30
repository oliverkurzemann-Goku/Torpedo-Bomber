/* Wingman smoothness bench: the shipped updateWingmen (sliced out of torpedo-carrier.html) behind a leader that is
 * flown the way a thumb on a touch stick flies - bank and climb targets change every 1-4 s, with small hand noise.
 * Prints the jerk figures of the wingman's displayed attitude (the thing the eye reads as "ruckartig").
 *   node scripts/flight/bench-wingman.cjs [seconds] [fps] */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');global.THREE=THREE;const AvengerBay=require('../../avenger-bay.js');
require('../../game-runtime.js');require('../../flight-support.js');const {GameRuntime,FlightSupport}=global;
global.FlightCoreEnabled=true;require('../../flight-core.js');require('../../flight-control.js');
const CarrierRecovery=require('../../carrier-recovery.js');
const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
function source(name,next){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a+1);if(a<0||b<a)throw Error(name);return html.slice(a,b);}
const seconds=+process.argv[2]||180,fps=+process.argv[3]||60,dt=1/fps;
let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const SPEED=+process.env.SPEED||80;
const leader={pos:new THREE.Vector3(0,400,0),heading:0,pitch:0,roll:0,spd:SPEED,vSpeed:0};
const mk=side=>({alive:true,kind:'avenger',mode:'form',cool:999,side,pos:new THREE.Vector3(-32*0-34*side*0,396,side*34),
 heading:Math.PI/2,pitch:0,roll:0,spd:SPEED,vel:new THREE.Vector3(SPEED,0,0),mesh:new THREE.Group()});
const escorts=[mk(-1),mk(1)];
for(const e of escorts){e.pos.set(-32-(e.side>0?8:0),398,e.side*34);}
const c=vm.createContext({AvengerBay,GameRuntime,FlightSupport,CarrierRecovery,THREE,Math,P:leader,ships:[],wingmen:escorts,PROP_STEP:.3,isDefend:()=>false,
 DROP_MAX_SPD:62,DROP_MAX_ALT:55,windHead:0,windZ:0,windGust:0,radioSay:()=>{},NavalAssets:{label:()=> 'FREIGHTER'}});
vm.runInContext(source('playerLateral','spawnWingman')+'\n'+source('updateWingmen','updateWingShots')+'\n'+source('noseDir','loadPlaneModel'),c);
let bankT=0,climbT=0,tb=0,tc=0;
const series=escorts.map(()=>({roll:[],pitch:[],head:[],spd:[],gap:[],along:[],lat:[],vert:[]}));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
for(let i=0;i<seconds*fps;i++){
 tb-=dt;tc-=dt;
 if(tb<=0){bankT=(rnd()<.35?0:(rnd()*2-1)*(+process.env.BANK||.9));tb=+(process.env.TB0||1)+rnd()*(+process.env.TBR||3);}
 if(tc<=0){climbT=(rnd()<.4?0:(rnd()*2-1)*(+process.env.CLIMB||.08));tc=1.5+rnd()*3.5;}
 // the thumb: first-order to the target with a little tremor
 leader.roll+=(bankT+(rnd()-.5)*.04-leader.roll)*Math.min(1,1.8*dt);
 leader.pitch+=(climbT+(rnd()-.5)*.01-leader.pitch)*Math.min(1,1.2*dt);
 leader.heading+=9.81*Math.tan(leader.roll)/leader.spd*dt;
 leader.vSpeed=Math.sin(leader.pitch)*leader.spd;
 leader.pos.add(new THREE.Vector3(Math.cos(leader.heading)*Math.cos(leader.pitch)*leader.spd,leader.vSpeed,Math.sin(leader.heading)*Math.cos(leader.pitch)*leader.spd).multiplyScalar(dt));
 c.updateWingmen(dt);
 escorts.forEach((e,k)=>{const s=series[k];s.roll.push(e.roll);s.pitch.push(e.pitch);s.head.push(e.heading);s.spd.push(e.spd);
  const rel=e.pos.clone().sub(leader.pos);s.gap.push(rel.length());
  const fx=Math.cos(leader.heading),fz=Math.sin(leader.heading);   // leader track (Pacific: x=cos h, z=sin h)
  const slotAlong=-32-(e.side>0?8:0),slotLat=e.side*34;
  const along=rel.x*fx+rel.z*fz,lat=-rel.x*fz+rel.z*fx;
  s.along.push(along-slotAlong);s.lat.push(lat-slotLat*-1*-1);s.vert.push(rel.y);});
}
const stat=a=>{const b=a.map(Math.abs).sort((x,y)=>x-y);return {p50:b[b.length>>1],p95:b[Math.floor(b.length*.95)],max:b[b.length-1]};};
const d1=(a)=>a.map((v,i)=>i?(v-a[i-1])/dt:0).slice(1),dw=(a)=>a.map((v,i)=>i?wrap(v-a[i-1])/dt:0).slice(1);
const rev=(rate,th)=>{let n=0,last=0;for(const r of rate){if(Math.abs(r)<th)continue;const sg=Math.sign(r);if(last&&sg!==last)n++;last=sg;}return n;};
const f=x=>x.toFixed(3);
escorts.forEach((e,k)=>{const s=series[k];
 const spdSummary=(()=>{const a=s.spd.slice().sort((x,y)=>x-y);return `speed min ${a[0].toFixed(1)} p5 ${a[Math.floor(a.length*.05)].toFixed(1)} p50 ${a[a.length>>1].toFixed(1)} p95 ${a[Math.floor(a.length*.95)].toFixed(1)} max ${a[a.length-1].toFixed(1)} (leader ${SPEED}) throttle ${(e.core&&e.core.power||0).toFixed(2)}`;})();
 console.log('  '+spdSummary);
 const zc=a=>{let n=0;for(let i=1;i<a.length;i++)if(a[i-1]*a[i]<0)n++;return n/seconds*60;};
 const p=d1(s.roll),q=d1(s.pitch),r=dw(s.head),a=d1(s.spd);
 const pa=d1(p),qa=d1(q),ra=d1(r),aa=d1(a);
 const P_=stat(p),Pa=stat(pa),Q=stat(q),Qa=stat(qa),R=stat(r),Ra=stat(ra),A=stat(a),Aa=stat(aa),G=stat(s.gap);
 console.log(`escort ${k} (${fps} FPS, ${seconds} s):`);
 console.log(`  roll rate p95 ${f(P_.p95)} max ${f(P_.max)} rad/s | roll accel p95 ${f(Pa.p95)} max ${f(Pa.max)} rad/s2 | reversals/min ${(rev(p,.03)/seconds*60).toFixed(1)}`);
 console.log(`  pitch rate p95 ${f(Q.p95)} max ${f(Q.max)} | pitch accel p95 ${f(Qa.p95)} max ${f(Qa.max)} | reversals/min ${(rev(q,.01)/seconds*60).toFixed(1)}`);
 console.log(`  yaw rate p95 ${f(R.p95)} max ${f(R.max)} | yaw accel p95 ${f(Ra.p95)} max ${f(Ra.max)}`);
 console.log(`  slot error: along p95 ${f(stat(s.along).p95)} m (sign changes/min ${zc(s.along.map(v=>v-s.along.reduce((x,y)=>x+y,0)/s.along.length)).toFixed(0)}) | lateral p95 ${f(stat(s.lat).p95)} | vertical p50 ${f(stat(s.vert).p50)} p95 ${f(stat(s.vert).p95)}`);
 console.log(`  speed accel p95 ${f(A.p95)} max ${f(A.max)} m/s2 | jerk p95 ${f(Aa.p95)} m/s3 | gap p50 ${G.p50.toFixed(1)} p95 ${G.p95.toFixed(1)} max ${G.max.toFixed(1)} m`);
});
