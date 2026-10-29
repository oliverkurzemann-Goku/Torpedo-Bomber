// Follow a complete loop using the actual chase camera code from each game.
// Build 215: the AERO camera follows the aircraft's own nose and wing axis, so it stays BEHIND the
// aircraft through the top of the loop (the old heading-based camera ended up in front of the nose).
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),root=path.resolve(__dirname,'../..');
for(const [file,pacific] of [['remagen-mission.html',false],['torpedo-carrier.html',true]]){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const a=html.indexOf('function updateCamera(dt){'),b=html.indexOf('\nfunction ',a+12);
  assert(a>0&&b>a);
  const camera=new THREE.PerspectiveCamera(60,1.5,1,4000),P={pos:new THREE.Vector3(0,1000,0),heading:0,pitch:0,roll:0,spd:150};
  camera.position.set(0,1010,-30);
  // Pacific heading 0 = +X (cos/sin), Rhine heading 0 = +Z (sin/cos); both noses lie in the loop plane.
  const noseDir=()=>pacific?new THREE.Vector3(Math.cos(P.pitch),Math.sin(P.pitch),0):new THREE.Vector3(0,Math.sin(P.pitch),Math.cos(P.pitch));
  const c=vm.createContext({THREE,camera,P,launchIntro:null,aeroMode:true,killCam:null,chaseH:6,chaseUp:0,
    APP_SPD:70,MAX_SPD:230,groundY:()=>0,shakeT:0,dbgOn:false,
    document:{querySelector:()=>null},applyShake(){},noseDir});
  if(pacific){
    const q=html.indexOf('function pacificAircraftQuaternion(){'),r=html.indexOf('\nfunction ',q+12);
    vm.runInContext(html.slice(q,r),c);
  }
  vm.runInContext(fs.readFileSync(path.join(root,'flight-support.js'),'utf8'),c);
  vm.runInContext(html.slice(a,b),c);
  const aircraftUp=()=>{
    if(pacific)return new THREE.Vector3(0,1,0).applyQuaternion(c.pacificAircraftQuaternion());
    return new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.pitch,P.heading,-P.roll,'YXZ')));
  };
  P.pitch=Math.PI/3;c.updateCamera(1);camera.updateMatrixWorld(true);
  assert(camera.getWorldDirection(new THREE.Vector3()).y>.4,file+' AERO camera must follow the climb');
  // Quasi-static loop: at every phase the camera sits behind the nose and shows the aircraft upright.
  P.roll=0;
  for(let i=0;i<=48;i++){
    P.pitch=i*Math.PI/24;
    c.updateCamera(1);
    camera.updateMatrixWorld(true);
    const nose=noseDir(),up=aircraftUp();
    const toCamera=camera.position.clone().sub(P.pos).normalize();
    assert(toCamera.dot(nose)<-.35,file+' camera must stay behind the nose through the loop at '+i+'/48 (dot '+toCamera.dot(nose).toFixed(2)+')');
    assert(camera.getWorldDirection(new THREE.Vector3()).dot(nose)>.85,file+' camera looks along the flight path at '+i+'/48');
    const ahead=P.pos.clone().addScaledVector(nose,700);
    const above=ahead.clone().addScaledVector(up,100).project(camera),below=ahead.clone().addScaledVector(up,-100).project(camera);
    assert(above.y>below.y,file+' the aircraft stays upright on screen at '+i+'/48');
  }
  // Banked pull: the camera follows the wing axis without inverting.
  P.pitch=0;P.roll=70*Math.PI/180;
  for(let i=0;i<30;i++)c.updateCamera(1/30);
  const bankUp=aircraftUp();
  assert(camera.up.dot(bankUp)>.9,file+' AERO camera follows the bank');
  // Continuity: a fast real-time loop moves the camera smoothly, with no jump anywhere.
  P.roll=0;P.pitch=0;P.pos.set(0,1000,0);
  for(let i=0;i<30;i++)c.updateCamera(1/60);
  let last=camera.position.clone(),worst=0,lastUp=camera.up.clone(),worstUp=0;
  for(let i=0;i<60*8;i++){
    P.pitch+=.8/60;
    const n=noseDir();P.pos.addScaledVector(n,P.spd/60);
    c.updateCamera(1/60);
    const step=camera.position.distanceTo(last)-P.spd/60;worst=Math.max(worst,Math.abs(step));
    worstUp=Math.max(worstUp,camera.up.angleTo(lastUp));
    last=camera.position.clone();lastUp=camera.up.clone();
  }
  assert(worst<4.5,file+' camera must not jump during a loop (worst step excess '+worst.toFixed(2)+' m)');
  assert(worstUp<.06,file+' camera up-vector must turn smoothly (worst '+worstUp.toFixed(3)+' rad/frame)');
  // Leaving AERO restores the world-up chase.
  c.aeroMode=false;P.pitch=0;P.roll=0;for(let i=0;i<5;i++)c.updateCamera(1/30);
  assert(camera.up.y>.99,file+' normal flight keeps the world-up reference');
  console.log(file,'AERO camera stays behind the aircraft through a full loop (static, banked and real-time)');
}
