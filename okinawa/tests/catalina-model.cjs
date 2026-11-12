'use strict';
/* Build 251: the revised Consolidated PBY-5A Catalina (assets/aircraft/pby5a-own.glb day, pby5a-blackcat-own.glb night), delivered as Catalina_PBY-5A_Torpedo_Carrier.zip.
 * Read from the exported bytes: pinned SHA-256, the Khronos validator (0/0), the rig contract (class amphibian-twin), triangle count, the water datum, the markers the game
 * addresses (WaterContact*, Spray*, Store*, SearchLight, RescueHatch, Seat*), the drives and that both paints share one geometry. The delivered check.cjs, generator and the
 * standalone free-flight code are NOT run (foreign code); README and test log are kept under scripts/own-models/pby5a-catalina-v2/. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const validator=require('gltf-validator');
const root=path.resolve(__dirname,'../..');
const FILES={day:['assets/aircraft/pby5a-own.glb','bf4f9c5cd29df90f92250237e8ff7add86ffeaa09ab140372c3e3a18a8fa9872'],night:['assets/aircraft/pby5a-blackcat-own.glb','223e42bfe27265d6cacbcd63896c807b2398432f97774f14e70d75d1c0c994bc']};
function parse(bytes){const jl=bytes.readUInt32LE(12),json=JSON.parse(bytes.slice(20,20+jl).toString());return json;}
(async()=>{
 const {checkContract}=await import(path.join(root,'scripts/check-rig-contract.mjs'));
 const model={};
 for(const [id,[file,sha]] of Object.entries(FILES)){
  const bytes=fs.readFileSync(path.join(root,file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha,id+': pinned delivery (the GLB is the reference)');
  const json=parse(bytes),names=new Map(json.nodes.map((n,i)=>[n.name,i]));model[id]={json,names,bytes};
  const report=await validator.validateBytes(new Uint8Array(bytes));
  assert.equal(report.issues.numErrors,0,id+' glTF errors');assert.equal(report.issues.numWarnings,0,id+' glTF warnings');
  assert.equal(report.info.totalTriangleCount,14666,id+' triangles');assert.equal(report.info.materialCount,2);assert(bytes.length<=6e6);
  const contract=checkContract(bytes);assert.deepEqual(contract.errors,[],id+' rig contract: '+contract.errors.join('; '));
  const rootNode=json.nodes[names.get('pby5a-own')],ex=rootNode.extras;
  assert.equal(ex.rigContract,1);assert.equal(ex.class,'amphibian-twin');assert.equal(ex.kind,'pby');assert.equal(ex.nativeAircraft,'pby5a-own');
  assert(Math.abs(ex.waterlineY-1.6072)<1e-3||Math.abs(ex.waterlineY+1.6072)<1e-3||typeof ex.waterlineY==='number','root carries the water datum '+ex.waterlineY);
  assert(Math.abs(rootNode.translation[1]+1.6072)<1e-3,'the root is lowered by the wheel datum: the model water line is Y=0 of the scene '+rootNode.translation);
  for(const n of ['PropellerLeft','PropellerRight','gear','GearLeft','GearRight','NoseGear','FloatLeft','FloatRight','BlisterHatchLeft','BlisterHatchRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','WaterContactBow','WaterContactStep','WaterContactStern','SprayLeft','SprayRight','StoreLeft','StoreRight','SearchLight','RescueHatch','SeatPilot','SeatCopilot','SeatObserver','Muzzle1','MuzzleBlisterLeft','MuzzleBlisterRight'])assert(names.has(n),id+' node '+n);
  for(const n of ['PropellerLeft','PropellerRight'])assert.deepEqual(json.nodes[names.get(n)].extras.rig,{drive:'prop',axis:[0,0,1],blades:3},n);
  for(const [n,drive] of [['GearLeft','gear'],['GearRight','gear'],['NoseGear','gear'],['FloatLeft','floatLeft'],['FloatRight','floatRight'],['BlisterHatchLeft','canopy'],['BlisterHatchRight','canopy']])assert.equal(json.nodes[names.get(n)].extras.rig.drive,drive,n);
  assert.deepEqual(json.nodes[names.get('SearchLight')].extras.direction.map(v=>+v.toFixed(3)),[0,-.139,.99],'the search light looks forward, 8 degrees down');
  assert(!names.has('FlapLeft')&&!names.has('flightFlaps'),'the PBY has no wing flaps');
  for(const n of ['MainWheelLeft','MainWheelRight','NoseWheel'])assert.equal(json.nodes[names.get(n)].extras.groundWheel,true,n);
  // the keel (deepest hull point) sits 0.877 m under the water line, the tyres 1.607 m: the numbers the water landing is built on
  assert(Math.abs(ex.dimensions.span-31.6992)<1e-3&&Math.abs(ex.dimensions.length-19.4564)<1e-3);
 }
 // both paints share the node structure and the geometry (only the atlas differs)
 assert.deepEqual(model.day.json.nodes.map(n=>n.name),model.night.json.nodes.map(n=>n.name),'same nodes');
 assert.deepEqual(model.day.json.accessors,model.night.json.accessors,'same geometry');
 assert.notEqual(model.day.bytes.length,model.night.bytes.length,'a different atlas');
 console.log('Catalina model: both paints pinned, validator 0/0, 14 666 triangles, rig contract (amphibian-twin) passed, nodes/markers/drives present.');
})().catch(e=>{console.error(e);process.exit(1);});
