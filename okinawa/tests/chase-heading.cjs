'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
const root=path.resolve(__dirname,'../..');
for(const [file,pacific] of [['torpedo-carrier.html',true],['remagen-mission.html',false]]){
 const html=fs.readFileSync(path.join(root,file),'utf8'),start=html.indexOf('function updateCamera(dt){'),end=html.indexOf('\nfunction ',start+12);
 for(const aeroMode of [false,true])for(const fps of [20,60,120])for(const degrees of [0,45,90,120,180,225,270,289])for(const wind of [-12,0,12]){
  const P={pos:new THREE.Vector3(0,170,0),heading:pacific?(90-degrees)*Math.PI/180:degrees*Math.PI/180,pitch:0,roll:0,spd:80/1.94384,alive:true};
  const noseDir=()=>new THREE.Vector3(pacific?Math.cos(P.heading):Math.sin(P.heading),0,pacific?Math.sin(P.heading):Math.cos(P.heading));
  const reticle={style:{}};
  const camera=new THREE.PerspectiveCamera(60,1536/927,1,30000),nd=noseDir();
  camera.position.copy(P.pos).addScaledVector(nd,-30).add(new THREE.Vector3(0,8,0));
  const c=vm.createContext({THREE,camera,P,launchIntro:null,aeroMode,killCam:null,chaseH:6,chaseUp:0,
   APP_SPD:70,MAX_SPD:230,groundY:()=>0,shakeT:0,dbgOn:false,ST:{FLIGHT:1},state:1,
   document:{querySelector:()=>reticle},window:{innerWidth:1536,innerHeight:927},applyShake(){},noseDir});
  vm.runInContext(fs.readFileSync(path.join(root,'flight-support.js'),'utf8'),c);
  c.FlightSupport=c.window.FlightSupport;
  vm.runInContext(html.slice(start,end),c);
  for(let frame=0;frame<fps*5;frame++){
   P.pos.addScaledVector(nd,P.spd/fps);P.pos[pacific?'z':'x']+=wind/fps;c.updateCamera(1/fps);
   camera.updateMatrixWorld(true);
   if(frame>fps){
    const screen=P.pos.clone().project(camera),offsetPixels=screen.x*1536/2;
    assert(Math.abs(offsetPixels)<.05,`${file}: ${degrees} degrees, ${wind} m/s crosswind, ${fps} FPS shifts aircraft ${offsetPixels.toFixed(3)} px`);
    if(pacific){const aim=P.pos.clone().addScaledVector(nd,400).project(camera);assert(Math.abs(parseFloat(reticle.style.left)-(aim.x*.5+.5)*1536)<.01,'gunsight follows the camera in this frame');}
    assert((1-screen.y)/2>.5&&(1-screen.y)/2<.7,file+' keeps normal vertical framing');
   }
  }
 }
 console.log(file+': all headings including 120/289 degrees remain centred at 20/60/120 FPS, with and without crosswind');
}
