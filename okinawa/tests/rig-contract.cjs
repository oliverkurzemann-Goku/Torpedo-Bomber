/* Rig contract v1: the validator rejects every broken delivery it claims to check, the Khronos
 * validator accepts a clean one, and the real r128 GLTFLoader + AircraftContract + AircraftGround
 * pose it without any propeller/gear/flap search. Synthetic box aircraft, not a game model. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {GlbWriter,box}=require('../../scripts/lib/glb-writer.cjs');
require('gltf-validator');// the Dart-compiled validator must load before the browser stubs below
global.THREE=require('three');global.self=global;global.window=global;
global.document={createElementNS:()=>({addEventListener(){},removeEventListener(){}}),createElement:()=>({getContext:()=>null})};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-contract.js');require('../../aircraft-articulation.js');
vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));

const SPAN=9.925,LENGTH=9.02;
function aircraft(mutate={}){
  const w=new GlbWriter(),mat=w.material({name:'paint',pbrMetallicRoughness:{baseColorFactor:[.4,.45,.42,1],metallicFactor:0,roughnessFactor:.8}});
  const mesh=(name,c,s)=>w.mesh(name,{...box(c,s),material:mat});
  const meta={rigContract:1,class:'tailwheel-fighter',nativeAircraft:'test-box-1',kind:'bf109',title:'Contract test box',author:'test',license:'CC0-1.0',source:'okinawa/tests/rig-contract.cjs',provenance:'synthetic',
    references:[{title:'none, synthetic',file:'okinawa/tests/rig-contract.cjs',license:'CC0-1.0',role:'fixture'}],dimensions:{span:SPAN,length:LENGTH,height:2.6},...mutate.meta};
  const top=w.node({name:'TestBox',extras:meta,scale:mutate.stretch?[1,1,mutate.stretch]:undefined});
  // fuselage from z -4.51 to +4.51 (incl. spinner), wing spans X
  w.node({name:'Airframe',mesh:mesh('fuselage',[0,0,-.2],[.9,1.1,8.2])},top);
  w.node({name:'Wing',mesh:mesh('wing',[0,-.35,.6],[SPAN,.18,1.7])},top);
  const prop=w.node({name:'Propeller',translation:[0,0,4.0],rotation:mutate.propRotation,extras:{rig:{drive:'prop',axis:[0,0,1],blades:3}}},top);
  w.node({name:'Blades',mesh:mesh('blades',[0,0,.2],[.15,3.0,.06])},prop);
  w.node({name:'Spinner',mesh:mesh('spinner',[0,0,.26],[.4,.4,.5])},prop);
  const gear=w.node({name:'gear'},top);
  const leg=(name,x,z,len,range,axis)=>{const g=w.node({name,translation:[x,-.42,z],extras:{rig:{drive:'gear',axis,range}}},gear);
    w.node({name:name+'Strut',mesh:mesh(name+'strut',[0,-len/2,0],[.08,len,.08])},g);
    if(!mutate.noTyre||mutate.noTyre!==name)w.node({name:name+'Tyre',mesh:mesh(name+'tyre',[0,-len,0],[.17,.65,.65]),extras:{groundWheel:true}},g);return g;};
  leg(mutate.swapSides?'GearRight':'GearLeft',-1.03,1.1,.95,[-1.48,0],[0,0,1]);leg(mutate.swapSides?'GearLeft':'GearRight',1.03,1.1,.95,[1.48,0],[0,0,1]);leg('TailGear',0,-3.9,.35,[1.2,0],[1,0,0]);
  const flaps=w.node({name:'flightFlaps'},top);
  for(const [name,x,drive] of [['FlapLeft',-1.6,'flapLeft'],['FlapRight',1.6,'flapRight']])w.node({name,translation:[x,-.38,-.2],extras:{rig:{drive,axis:[1,0,0],range:[0,-.70]}},mesh:mesh(name,[0,0,-.2],[1.4,.04,.4])},flaps);
  w.node({name:'AileronLeft',translation:[-4,-.3,-.15],extras:{rig:{drive:'roll',axis:[1,0,0],gain:.22}},mesh:mesh('al',[0,0,-.15],[1.4,.04,.3])},top);
  w.node({name:'AileronRight',translation:[4,-.3,-.15],extras:{rig:{drive:'roll',axis:[1,0,0],gain:-.22}},mesh:mesh('ar',[0,0,-.15],[1.4,.04,.3])},top);
  for(const [name,x] of [['ElevatorLeft',-.9],['ElevatorRight',.9]])w.node({name,translation:[x,.25,-4.0],extras:{rig:{drive:'pitch',axis:[1,0,0],gain:-.25}},mesh:mesh(name,[0,0,-.15],[1.5,.04,.3])},top);
  if(!mutate.noRudder)w.node({name:'Rudder',translation:[0,.6,-4.1],extras:{rig:{drive:'yaw',axis:[0,1,0],gain:mutate.rudderGain??-.2}},mesh:mesh('rudder',[0,.4,-.2],[.05,1.3,.4])},top);
  for(const x of [-.15,.15])w.node({name:'Muzzle'+(x<0?'Left':'Right'),translation:[x,.45,2.9]},top);
  if(mutate.duplicate)w.node({name:'Wing'},top);
  if(mutate.specGloss)w.json.extensionsUsed=['KHR_materials_pbrSpecularGlossiness'];
  return w.glb();
}
(async()=>{
  const {checkContract,khronos}=await import('../../scripts/check-rig-contract.mjs');
  const good=aircraft(),ok=checkContract(good);
  assert.deepEqual(ok.errors,[],'clean synthetic aircraft passes');
  assert.equal(ok.report.size[0],9.925);assert(Math.abs(ok.report.size[2]-LENGTH)<.0901,'length within the 1% gate');
  const k=await khronos(good);assert.equal(k.errors,0,'Khronos validator: '+k.messages.join('; '));
  const reject=(mutate,pattern)=>{const r=checkContract(aircraft(mutate));assert(r.errors.some(e=>pattern.test(e)),'expected '+pattern+' got '+JSON.stringify(r.errors));};
  reject({noRudder:true},/missing part Rudder/);
  reject({stretch:1.04},/length on Z/);
  reject({meta:{dimensions:{span:9.6,length:LENGTH}}},/span on X/);
  reject({swapSides:true},/GearLeft must be on -X/);
  reject({noTyre:'TailGear'},/groundWheel/);
  reject({specGloss:true},/forbidden extension KHR_materials_pbrSpecularGlossiness/);
  reject({duplicate:true},/duplicate node name Wing/);
  reject({rudderGain:1.4},/Rudder gain/);
  reject({propRotation:[0,.3826834,0,.9238795]},/Propeller node must be unrotated/);
  reject({meta:{references:[]}},/references/);
  reject({meta:{license:''}},/license/);

  // Real loader + production rig code: no heuristics, exact hinge angles, independent clones.
  const gltf=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(good.buffer.slice(good.byteOffset,good.byteOffset+good.byteLength),'',yes,no));
  const frame=new THREE.Group();frame.add(gltf.scene);
  assert(AircraftContract.isContract(frame));
  // The shipped Rhine rigModel must return on the contract line before any search or cut.
  const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\n  root.updateMatrixWorld(true);',start);
  assert(/<script src="aircraft-contract\.js\?v=\d+"><\/script>\n<script src="aircraft-articulation\.js/.test(html),'contract loads before articulation');
  vm.runInThisContext(html.slice(start,end)+'\nthrow Error("contract model fell through to the heuristic rig");}');
  assert.match(rigModel(frame,'bf109'),/^rig contract v1 test-box-1: .*no mesh cuts$/);
  AircraftArticulation.install(frame,'bf109');
  assert.equal(frame.userData.articulation.nativeContract,true,'articulation uses the contract, not the bf109 profile');
  assert.equal(frame.getObjectByName('flapLeft'),undefined,'no generic flap skins built');assert.equal(frame.getObjectByName('wheelAxle'),undefined,'no generic wheels built');
  const prop=frame.getObjectByName('prop');assert(prop&&prop.userData.rig.blades===3,'Propeller renamed to the game rotor');
  const left=frame.getObjectByName('GearLeft'),q=new THREE.Quaternion();
  const expect=(node,angle)=>{q.fromArray(node.userData.rigRest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(node.userData.rig.axis),angle));assert(node.quaternion.angleTo(q)<1e-6,node.name+' at '+angle);};
  AircraftArticulation.pose(frame,0,{left:0,right:0});expect(left,-1.48);expect(frame.getObjectByName('TailGear'),1.2);
  AircraftArticulation.pose(frame,.5,{left:1,right:.25});expect(left,-.74);expect(frame.getObjectByName('FlapLeft'),-.70);expect(frame.getObjectByName('FlapRight'),-.175);
  AircraftArticulation.controls(frame,.5,-1);expect(frame.getObjectByName('AileronLeft'),.11);expect(frame.getObjectByName('AileronRight'),-.11);expect(frame.getObjectByName('ElevatorLeft'),.25);expect(frame.getObjectByName('Rudder'),-.1);
  AircraftArticulation.pose(frame,1,{left:0,right:0});
  const supports=AircraftGround.supports(frame,'bf109');assert.equal(supports.length,3,'three tagged tyres feed ground contact');
  const lowest=supports.map(v=>{let y=Infinity;for(let i=1;i<v.length;i+=3)y=Math.min(y,v[i]);return y;});
  assert(Math.abs(lowest[0]-lowest[1])<1e-6&&lowest[2]>lowest[0],'main tyres level, tailwheel higher in the level model frame');
  AircraftArticulation.pose(frame,.2,{left:0,right:0});assert.equal(frame.userData.groundSupports,undefined,'gear motion invalidates ground supports');
  const clone=frame.clone(true);AircraftArticulation.install(clone,'bf109');AircraftArticulation.pose(clone,0,{left:0,right:0});
  AircraftArticulation.pose(frame,1,{left:0,right:0});expect(left,0);expect(clone.getObjectByName('GearLeft'),-1.48);
  const ports=AircraftContract.muzzles(frame,frame);assert.equal(ports.length,2);assert(ports.every(p=>p.z>2.8&&Math.abs(p.x)<.2));
  console.log(JSON.stringify({validator:'rejects 11 broken deliveries',khronos:k,report:ok.report,runtime:'Rhine rigModel returns before any search; install/pose/controls/ground supports/clone verified on real r128 GLTFLoader'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
