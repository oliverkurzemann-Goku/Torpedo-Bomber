/* Own Bf 109 pipeline: the generator builds the measured F-2 as a rig-contract GLB that passes the
 * contract and the Khronos validator, keeps the retracted gear inside the wing skin, refuses to
 * release an unmeasured (FIXTURE) shape, and the Rhine rigModel + contract rig + ground code drive
 * it on the real r128 GLTFLoader. Shape accuracy is the silhouette gate's job (silhouette-gate.cjs). */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');require('gltf-validator');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'own-bf109-'));
const run=args=>spawnSync(process.execPath,[path.join(root,'scripts/build-own-bf109.cjs'),...args],{cwd:root,encoding:'utf8'});
const built=run(['--out',out]);assert.equal(built.status,0,built.stderr);
const info=JSON.parse(built.stdout.trim().split('\n').pop());
assert.equal(info.status,'MEASURED');
for(const [k,g] of Object.entries(info.gearUp))assert(g.insideSkin.lower>=.005&&g.insideSkin.upper>=.005,k+' retracted gear inside the wing: '+JSON.stringify(g));
const refused=run([path.join(root,'scripts/own-aircraft/bf109g6-fixture.json'),'--release']);assert.notEqual(refused.status,0,'FIXTURE must never be released');assert.match(refused.stderr,/--release refused: shape table is FIXTURE/);
assert(!fs.existsSync(path.join(root,'assets/aircraft/bf109f2-unmeasured.glb')));

global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub(),createElement:()=>({getContext:()=>null})};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-contract.js');require('../../aircraft-articulation.js');
vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),start=html.indexOf('function rigModel(root, kind){'),end=html.indexOf('\n  root.updateMatrixWorld(true);',start);
vm.runInThisContext(html.slice(start,end)+'\nthrow Error("contract model fell through to the heuristic rig");}');

(async()=>{
  const {checkContract,khronos}=await import('../../scripts/check-rig-contract.mjs');
  const bytes=fs.readFileSync(path.join(out,'bf109f2-own.glb'));
  const c=checkContract(bytes),k=await khronos(bytes);
  assert.deepEqual(c.errors,[],'contract');assert.equal(k.errors,0,'Khronos: '+k.messages.join('; '));assert.equal(k.warnings,0,'Khronos warnings: '+(k.warningMessages||[]).join('; '));
  assert.equal(c.report.nativeAircraft,'bf109f2-own-1','measured build');
  assert(c.report.triangles<75000&&c.report.images===2&&c.report.imageSizes[0][0]===2048,'budget: '+JSON.stringify(c.report));
  const gltf=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no));
  const frame=new THREE.Group();frame.add(gltf.scene);
  assert.match(rigModel(frame,'bf109'),/^rig contract v1 bf109f2-own-1: .*no mesh cuts$/);
  AircraftArticulation.install(frame,'bf109');assert(frame.getObjectByName('prop'),'rotor named for the game');
  const tyre=frame.getObjectByName('GearLeftTyre'),box=()=>{frame.updateMatrixWorld(true);return new THREE.Box3().setFromObject(tyre);};
  const down=box();AircraftArticulation.pose(frame,0,{left:0,right:0});const up=box();
  assert(up.min.y-down.min.y>.6&&up.getCenter(new THREE.Vector3()).x<down.getCenter(new THREE.Vector3()).x,'left wheel swings outward and up: '+JSON.stringify([down.min,up.min]));
  AircraftArticulation.pose(frame,1,{left:1,right:0});const flap=frame.getObjectByName('FlapLeft');assert(flap.quaternion.angleTo(new THREE.Quaternion())>.6,'left flap deploys');
  assert.equal(AircraftGround.supports(frame,'bf109').length,3,'three tagged tyres');
  const ports=AircraftContract.muzzles(frame,frame);assert.equal(ports.length,3);assert(ports.every(p=>p.z>3.3),'guns at the nose');
  assert.deepEqual(ports.map(p=>p.name).sort(),['MuzzleCannon','MuzzleLeft','MuzzleRight'],'muzzles carry their names for the per-gun list');
  fs.rmSync(out,{recursive:true,force:true});
  console.log(JSON.stringify({built:info,contract:'passed',khronos:{errors:k.errors,warnings:k.warnings},releaseOfFixture:'refused',rig:'rigModel contract path, gear retracts outward inside the wing skin, flaps, 3 tyres, 3 named muzzles'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
