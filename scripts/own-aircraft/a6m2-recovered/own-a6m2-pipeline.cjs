/* Own A6M2 Zero pipeline: the generator builds the measured Model 21 as a rig-contract GLB that passes the
 * contract and the Khronos validator, matches the PDF's span and length, keeps the retracted gear inside the
 * wing skin (rays through the real Airframe mesh), refuses to release without the reference views or from an
 * unmeasured table, and the Pacific game's own loader + contract rig + ground code drive it on the real r128
 * GLTFLoader. Shape accuracy is the silhouette gate's job (it needs the copyrighted drawing, kept outside the
 * repository: scripts/build-own-a6m2.cjs --release --ref <dir>). */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');require('gltf-validator');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'own-a6m2-'));
const run=args=>spawnSync(process.execPath,[path.join(root,'scripts/build-own-a6m2.cjs'),...args],{cwd:root,encoding:'utf8',maxBuffer:1<<26});
const built=run(['--out',out]);assert.equal(built.status,0,built.stderr);
const info=JSON.parse(built.stdout.trim().split('\n').pop());
assert.equal(info.status,'MEASURED');
for(const [k,g] of Object.entries(info.gearUp))assert(g.insideSkin.lower>=.005&&g.insideSkin.upper>=.005,k+' retracted gear inside the wing: '+JSON.stringify(g));
// release needs the cut-out reference views and a measured table
const noRef=run(['--release']);assert.notEqual(noRef.status,0);assert.match(noRef.stderr,/--release needs --ref/);
const fixture=JSON.parse(fs.readFileSync(path.join(root,'app/model-candidates/references/a6m2/shape.json'),'utf8'));fixture.status='FIXTURE';
const fixtureFile=path.join(out,'fixture.json');fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
const refused=run([fixtureFile,'--release','--ref',out]);assert.notEqual(refused.status,0,'an unmeasured table must never be released');assert.match(refused.stderr,/--release refused: shape table is FIXTURE/);
assert(!fs.existsSync(path.join(root,'assets/aircraft/a6m2-unmeasured.glb')));

global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub(),createElement:()=>({getContext:()=>null})};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-contract.js');require('../../aircraft-articulation.js');
vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/AircraftGround.js'),'utf8'));

(async()=>{
  const {checkContract,khronos}=await import('../../scripts/check-rig-contract.mjs');
  const bytes=fs.readFileSync(path.join(out,'a6m2-own.glb')),shipped=fs.readFileSync(path.join(root,'assets/aircraft/a6m2-own.glb'));
  for(const [label,b] of [['built',bytes],['shipped',shipped]]){
    const c=checkContract(b),k=await khronos(b);
    assert.deepEqual(c.errors,[],label+' contract');assert.equal(k.errors,0,label+' Khronos: '+k.messages.join('; '));assert.equal(k.warnings,0,label+' Khronos warnings: '+(k.warningMessages||[]).join('; '));
    assert.equal(c.report.nativeAircraft,'a6m2-own-1',label+' measured build');
    assert(c.report.triangles<75000&&c.report.images===3&&c.report.imageSizes.every(s=>s[0]===2048),label+' budget: '+JSON.stringify(c.report));
    assert(c.report.materials<=16&&c.report.meshNodes<=48);
  }
  // the shipped file is what the generator makes from the committed numbers (the paint noise is deterministic)
  assert.equal(shipped.length,bytes.length,'assets/aircraft/a6m2-own.glb matches a fresh build');
  assert(shipped.equals(bytes),'assets/aircraft/a6m2-own.glb is byte-identical to a fresh build');
  const gltf=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no));
  const frame=new THREE.Group();frame.add(gltf.scene);
  AircraftArticulation.install(frame,'zero');assert(frame.getObjectByName('prop'),'rotor named for the game');
  assert.equal(frame.userData.articulation.nativeContract,true);
  // PDF page 14: span 12.0 m, length 9.06 m (the model keeps the contract frame: metres, nose +Z)
  frame.updateMatrixWorld(true);const hull=new THREE.Box3();for(const n of ['Airframe','Spinner'])hull.union(new THREE.Box3().setFromObject(frame.getObjectByName(n)));
  const size=hull.getSize(new THREE.Vector3());
  assert(Math.abs(size.x-12.0)<.06,'span from the PDF table: '+size.x);assert(Math.abs(size.z-9.06)<.06,'length from the PDF table: '+size.z);assert(hull.max.z>4.4,'nose points +Z');
  // gear: swings inward and up into the wing, three tagged tyres, retracted vertices have wing or fuselage skin above and below
  const tyre=frame.getObjectByName('GearLeftTyre'),box=()=>{frame.updateMatrixWorld(true);return new THREE.Box3().setFromObject(tyre);};
  const down=box();AircraftArticulation.pose(frame,0,{left:0,right:0});const up=box();
  assert(up.min.y-down.min.y>1&&Math.abs(up.getCenter(new THREE.Vector3()).x)<Math.abs(down.getCenter(new THREE.Vector3()).x),'left wheel swings inboard and up: '+JSON.stringify([down.min,up.min]));
  const skin=frame.getObjectByName('Airframe');skin.material=skin.material.clone();skin.material.side=THREE.DoubleSide;
  const upAxis=new THREE.Vector3(0,1,0),ray=new THREE.Raycaster(),v=new THREE.Vector3(),share={};
  for(const part of ['GearLeftTyre','GearRightTyre','GearLeftLeg','GearRightLeg']){
    const mesh=frame.getObjectByName(part),pos=mesh.geometry.attributes.position;let inside=0,n=0;
    for(let i=0;i<pos.count;i+=3){v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);n++;
      ray.set(v,upAxis);const above=ray.intersectObject(skin,false).length>0;ray.set(v,upAxis.clone().negate());const below=ray.intersectObject(skin,false).length>0;if(above&&below)inside++;}
    share[part]=inside/n;assert.equal(inside/n,1,part+' retracted inside the airframe skin: '+inside/n);
  }
  AircraftArticulation.pose(frame,1,{left:1,right:0});const flap=frame.getObjectByName('FlapLeft');assert(flap.quaternion.angleTo(new THREE.Quaternion())>.4,'left flap deploys');
  assert.equal(AircraftGround.supports(frame,'zero').length,3,'three tagged tyres');
  const ports=AircraftContract.muzzles(frame,frame);assert.equal(ports.length,4);
  assert.deepEqual(ports.map(p=>p.name).sort(),['MuzzleCannonLeft','MuzzleCannonRight','MuzzleLeft','MuzzleRight'],'muzzles carry their names');
  for(const p of ports.filter(p=>/Cannon/.test(p.name)))assert(Math.abs(Math.abs(p.x)-1.9)<.1&&p.z>2.6&&p.z<3,'20 mm ports in the wing leading edge: '+p.toArray());
  for(const p of ports.filter(p=>!/Cannon/.test(p.name)))assert(Math.abs(p.x)<.4&&p.z>3.7,'7.7 mm ports on the cowling: '+p.toArray());

  // the Pacific game's own loader, with the real GLB: no centring/scaling/search, tank left out, rig installed, clones independent
  const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8'),start=html.indexOf('function loadZeroModel(){'),end=html.indexOf('function makeZeroGear(');
  assert(start>0&&end>start);
  const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const sandbox={THREE,AircraftContract:global.AircraftContract,AircraftArticulation:global.AircraftArticulation,console,zeroTemplate:null,ZERO_MODEL_URL:'a6m2-own.glb',
    PacificAssets:{loader:()=>({load:(url,done)=>new THREE.GLTFLoader().parse(raw,'',g=>done(g),()=>assert.fail('parse'))})}};
  vm.createContext(sandbox);vm.runInContext(html.slice(start,end),sandbox);vm.runInContext('loadZeroModel()',sandbox);
  await new Promise(r=>setTimeout(r,50));
  const template=vm.runInContext('zeroTemplate',sandbox);assert(template,'loadZeroModel installs the template');
  assert.equal(template.getObjectByName('DropTank'),undefined,'the Zero flies clean');
  const a=template.clone(true),b=template.clone(true),fa=vm.runInContext('zeroFrame',sandbox)(a),fb=vm.runInContext('zeroFrame',sandbox)(b);
  assert(fa&&fb&&fa!==fb,'each clone has its own articulation frame');
  fa.getObjectByName('prop').rotation.z=.7;assert.equal(fb.getObjectByName('prop').rotation.z,0,'rotors turn independently');
  AircraftArticulation.pose(fa,0,{left:0,right:0});AircraftArticulation.pose(fb,1,{left:0,right:0});
  assert(fa.getObjectByName('GearLeft').quaternion.angleTo(fb.getObjectByName('GearLeft').quaternion)>2,'gear poses are independent per clone');
  assert.match(html,/z\.disk\.rotation\.z-=zeroFrame\(z\.mesh\)\?GameRuntime\.rotorStep\(dt,PROP_STEP\)/,'AI Zeros turn the real blades without aliasing');
  fs.rmSync(out,{recursive:true,force:true});
  console.log(JSON.stringify({built:info,contract:'passed',khronos:'0 errors, 0 warnings',span:+size.x.toFixed(3),length:+size.z.toFixed(3),releaseWithoutReference:'refused',releaseOfUnmeasured:'refused',
    rig:'game loader, contract rig, gear retracts inside the skin ('+Object.values(share).join('/')+'), flaps, 3 tyres, 4 named muzzles'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
