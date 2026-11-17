'use strict';
/* Build 286: the Rhine chase camera must hold the aircraft still on screen in straight flight whatever the frame times.
 * The old easing (camera.position.lerp(want,7*dt)) trailed the aircraft by speed*(1/7-dt): a long frame or alternating
 * 16.7/33.3 ms frames moved the camera along the flight path and the aircraft (the one near object) jumped - reported
 * for the fast Me 262 and Komet. This runs the real updateCamera() of remagen-mission.html (and, with OLD=1, the
 * version from git HEAD~ for comparison) at 205 and 240 m/s with even, alternating and spiky frame times. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
const root=path.resolve(__dirname,'../..');
const html=process.env.OLD_FILE?fs.readFileSync(process.env.OLD_FILE,'utf8'):fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const start=html.indexOf('function updateCamera(dt){'),end=html.indexOf('\nfunction ',start+12);
const W=1536,H=927,results={};
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const profiles={
 even60:()=>Array(360).fill(1/60),
 even30:()=>Array(360).fill(1/30),
 ipad40:()=>Array.from({length:360},()=>rnd()<.6?1/60:1/30),     // CPU-bound at ~40 FPS behind 60 Hz vsync
 spikes:()=>Array.from({length:360},(_,i)=>i%40===20?.045:1/60)    // a long frame now and then
};
function fly(aeroMode,speed,seq,heading=.7,stopAt=-1){
 const P={pos:new THREE.Vector3(0,600,0),heading,pitch:0,roll:0,spd:speed,alive:true};
 const nd=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
 const camera=new THREE.PerspectiveCamera(60,W/H,1,30000);
 camera.position.copy(P.pos).addScaledVector(nd,-40).add(new THREE.Vector3(0,9,0));
 const c=vm.createContext({THREE,camera,P,launchIntro:null,aeroMode,killCam:null,chaseUp:0,APP_SPD:70,MAX_SPD:230,
  groundY:()=>0,shakeT:0,shakeAmt:0,noseDir:()=>nd.clone(),Math});
 vm.runInContext(fs.readFileSync(path.join(root,'flight-support.js'),'utf8'),c);c.FlightSupport=c.window?.FlightSupport||c.FlightSupport;
 if(!c.FlightSupport){c.window=c;vm.runInContext(fs.readFileSync(path.join(root,'flight-support.js'),'utf8'),c);c.FlightSupport=c.window.FlightSupport;}
 vm.runInContext(html.slice(start,end),c);
 for(let i=0;i<240;i++){P.pos.addScaledVector(nd,speed/60);c.updateCamera(1/60);}   // settle at 60 FPS
 const rec=[];
 for(const [i,dt] of seq.entries()){
  if(stopAt<0||i<stopAt)P.pos.addScaledVector(nd,speed*dt);   // stopAt: the aircraft is held at the map edge
  c.updateCamera(dt);camera.updateMatrixWorld(true);
  const s=P.pos.clone().project(camera);rec.push({x:(s.x*.5+.5)*W,y:(1-(s.y*.5+.5))*H,d:camera.position.distanceTo(P.pos)});
 }
 let jerk=0,step=0;
 for(let i=2;i<rec.length;i++){
  jerk=Math.max(jerk,Math.hypot(rec[i].x-2*rec[i-1].x+rec[i-2].x,rec[i].y-2*rec[i-1].y+rec[i-2].y));
  step=Math.max(step,Math.abs(rec[i].d-rec[i-1].d));
 }
 const ds=rec.map(r=>r.d);
 return {jerkPx:+jerk.toFixed(3),distanceStep:+step.toFixed(3),distance:[+Math.min(...ds).toFixed(2),+Math.max(...ds).toFixed(2)],y:+rec[rec.length-1].y.toFixed(1)};
}
for(const aeroMode of [false,true])for(const speed of [150,205,240]){
 const key=(aeroMode?'realistic':'arcade')+'@'+speed;results[key]={};
 for(const [name,make] of Object.entries(profiles)){seed=7;results[key][name]=fly(aeroMode,speed,make());}
}
seed=7;results.mapEdge={stop:fly(false,205,profiles.even30(),.7,120)};
console.log(JSON.stringify(results,null,1));
if(!process.env.OLD_FILE){
 assert(results.mapEdge.stop.distanceStep<2.5&&results.mapEdge.stop.jerkPx<2.5,'a sudden stop at the map edge eases out: '+JSON.stringify(results.mapEdge.stop));
 for(const [key,r] of Object.entries(results)){if(key==='mapEdge')continue;
  for(const name of ['ipad40','spikes','even30'])assert(r[name].jerkPx<.05&&r[name].distanceStep<.01,`${key} ${name}: aircraft must not jump on screen: ${JSON.stringify(r[name])}`);
  // the same framing at every frame rate: the distance does not depend on the frame time
  assert(Math.abs(r.even30.distance[0]-r.even60.distance[0])<.05,`${key}: same distance at 30 and 60 FPS`);
  assert(Math.abs(r.even60.y-r.ipad40.y)<.5,`${key}: same height on screen`);
 }
 fs.writeFileSync(path.join(root,'app/release/chase-frametime.json'),JSON.stringify(results,null,1)+'\n');
 console.log('Chase camera (Rhine): the aircraft holds still on screen at even, alternating and spiky frame times');
}
