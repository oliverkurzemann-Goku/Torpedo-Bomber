// Follow a complete loop using the actual chase camera code from each game.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),root=path.resolve(__dirname,'../..');
for(const [file,pacific] of [['remagen-mission.html',false],['torpedo-carrier.html',true]]){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const a=html.indexOf('function updateCamera(dt){'),b=html.indexOf('\nfunction ',a+12);
  assert(a>0&&b>a);
  const camera=new THREE.PerspectiveCamera(60,1.5,1,4000),P={pos:new THREE.Vector3(0,1000,0),heading:0,pitch:0,roll:0,spd:150};
  camera.position.set(0,1010,-30);
  const c=vm.createContext({THREE,camera,P,aeroMode:true,killCam:null,chaseH:6,chaseUp:0,
    APP_SPD:70,MAX_SPD:230,groundY:()=>0,shakeT:0,dbgOn:false,
    document:{querySelector:()=>null},applyShake(){},
    noseDir:()=>pacific?new THREE.Vector3(Math.cos(P.pitch),Math.sin(P.pitch),0):
      new THREE.Vector3(0,Math.sin(P.pitch),Math.cos(P.pitch))});
  vm.runInContext(html.slice(a,b),c);
  P.pitch=Math.PI/3;c.updateCamera(1);camera.updateMatrixWorld(true);
  assert(camera.getWorldDirection(new THREE.Vector3()).y>.4,file+' AERO camera must follow the climb');
  P.roll=70*Math.PI/180;c.updateCamera(1);
  assert(camera.up.y<.95&&camera.up.y>.65,file+' AERO camera must follow bank without inverting');
  P.roll=0;
  for(let i=0;i<=24;i++){
    P.pitch=i*Math.PI/12;
    c.updateCamera(1);
    camera.updateMatrixWorld(true);
    const forward=pacific?new THREE.Vector3(700,0,0):new THREE.Vector3(0,0,700);
    const above=P.pos.clone().add(forward).add(new THREE.Vector3(0,100,0)).project(camera);
    const below=P.pos.clone().add(forward).add(new THREE.Vector3(0,-100,0)).project(camera);
    assert(above.y>below.y,file+' ground and sky must stay upright through the loop at '+i+'/24');
    assert(camera.up.y>.99,file+' camera must keep a world-up reference');
  }
  console.log(file,'horizon stays upright from 0° through 360° pitch');
}
