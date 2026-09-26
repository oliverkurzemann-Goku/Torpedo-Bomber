const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');
const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
const settings=html.slice(html.indexOf('let chaseH=6;'),html.indexOf('let planeBody,'));
const cameraCode=html.slice(html.indexOf('function updateCamera(dt)'),html.indexOf('function applyShake()'));
for(const [store,height]of [[{chaseH:'40'},6],[{tc_chaseHeight_v2:'8'},8],[{tc_chaseHeight_v2:'Infinity'},6],[{tc_chaseHeight_v2:'900'},16]]){
 const camera=new THREE.PerspectiveCamera(60,1536/927,1,30000),pos=new THREE.Vector3(0,24,0);
 const ctx=vm.createContext({THREE,Math,Number,parseFloat,localStorage:{getItem:k=>store[k]??null},camera,P:{pos},aeroMode:false,killCam:null,dbgOn:false,ST:{FLIGHT:1},state:1,document:{querySelector:()=>null},noseDir:()=>new THREE.Vector3(1,0,0),applyShake(){}});
 vm.runInContext(settings+cameraCode,ctx);
 camera.position.set(-24,24+height,0);
 for(let i=0;i<600;i++){pos.x+=100/60;ctx.updateCamera(1/60);}
 assert(Math.abs(camera.position.y-pos.y-height)<.01,'old saved high view must not return');
 camera.updateMatrixWorld();
 const plane=pos.clone().project(camera),horizon=pos.clone().add(new THREE.Vector3(100000,0,0)).project(camera);
 if(height===6){
  assert((1-horizon.y)/2>.4&&(1-horizon.y)/2<.5,'horizon stays near the screen centre');
  assert((1-plane.y)/2>.5&&(1-plane.y)/2<.65,'aircraft remains visible below centre');
  assert(camera.position.distanceTo(pos)<45,'chase camera follows close enough at 193 kt');
  console.log({height,planeScreenY:(1-plane.y)/2,horizonScreenY:(1-horizon.y)/2,distance:camera.position.distanceTo(pos)});
 }
}
console.log('Pacific chase camera: lower view, saved-value migration and moving-flight framing OK');
