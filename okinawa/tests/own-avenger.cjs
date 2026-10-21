'use strict';
// The repository's own procedural TBM-3 Avenger: real dimensions, working moving parts,
// consistent outward-facing surfaces and no dependency on any third-party model file.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),THREE=require('three');
const {createCanvas}=require('@napi-rs/canvas');
const OwnAvenger=require('../../own-avenger.js');
const source=fs.readFileSync(path.join(__dirname,'../../own-avenger.js'),'utf8');

assert(!/\.(glb|gltf|fbx|obj|png|jpe?g|webp)\b/i.test(source.replace(/\/\*[\s\S]*?\*\//,'')),'the model loads no external asset');
assert(!/GLTFLoader|FBXLoader|fetch\(|XMLHttpRequest/.test(source),'the model is built purely from code');

const plane=OwnAvenger.create(THREE,{createCanvas});
const {root,parts}=plane;
const each=(obj,f)=>{obj.updateMatrixWorld(true);const v=new THREE.Vector3();obj.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);f(v,o);}});};
const extent=(obj,axis)=>{let lo=Infinity,hi=-Infinity;each(obj,v=>{lo=Math.min(lo,v[axis]);hi=Math.max(hi,v[axis]);});return [lo,hi];};
const near=(a,b,tol,msg)=>assert(Math.abs(a-b)<=tol,`${msg}: ${a.toFixed(3)} vs ${b}`);

// 1. Published dimensions.
const [x0,x1]=extent(root,'x'),[z0,z1]=extent(root,'z');
near(x1-x0,16.51,.02,'span');
near(z1-z0,12.48,.02,'length');
let tipR=0;each(parts.propeller,v=>tipR=Math.max(tipR,Math.hypot(v.x,v.y)));near(2*tipR,3.96,.03,'propeller diameter');
let area=0;for(let x=0;x<16.51/2;x+=.001)area+=plane.wingAt(x).c*.001;near(2*area,45.52,.6,'wing area');
plane.set({fold:1});const [f0,f1]=extent(root,'x');near(f1-f0,5.8,.05,'folded width');
plane.set({fold:0});

// 2. Ground stance: both main tyres and the tail tyre carry the aircraft, propeller and belly clear.
const lowest=obj=>{let m=null;each(obj,v=>{if(!m||v.y<m.y)m=v.clone();});return m;};
const mainL=lowest(parts.gearL),mainR=lowest(parts.gearR),tail=lowest(parts.tailGear);
near(mainL.y,mainR.y,1e-6,'main wheels level');near(mainL.x,-mainR.x,1e-6,'main gear symmetric');
const attitude=Math.atan2(tail.y-mainR.y,tail.z-mainR.z);
assert(attitude>7*Math.PI/180&&attitude<13*Math.PI/180,'three-point attitude '+(attitude*180/Math.PI).toFixed(1));
const toGround=new THREE.Matrix4().makeRotationX(attitude);
let clearance=Infinity,height=-Infinity;
each(root,(v,o)=>{const w=v.clone().sub(mainR).applyMatrix4(toGround);height=Math.max(height,w.y);
  let p=o,gear=false;while(p){if(p===parts.gearL||p===parts.gearR||p===parts.tailGear||p===parts.hook)gear=true;p=p.parent;}
  if(!gear)clearance=Math.min(clearance,w.y);});
assert(clearance>.25,'airframe clears the ground on its wheels: '+clearance.toFixed(2));
let levelTop=-Infinity;each(root,v=>levelTop=Math.max(levelTop,v.y-mainR.y));near(levelTop,5.00,.05,'height in level attitude');

// 3. Retracted gear folds outward into the centre section, inboard of the wing fold.
plane.set({gear:0});
const wheelX=extent(parts.gearR,'x'),wheelY=extent(parts.gearR.getObjectByName('mainWheel'),'y');
assert(wheelX[1]<plane.FOLD_X,'retracted wheel stays inboard of the fold');
assert(wheelY[1]-wheelY[0]<.3,'retracted wheel lies flat in the wing');
const tailUp=lowest(parts.tailGear);assert(tailUp.y>tail.y+.25,'tail wheel retracts');
plane.set({gear:1});

// 4. Every animated part moves and returns.
const snapshot=()=>JSON.stringify(['flapInnerR','flapOuterL','hook','bayDoorL','bayDoorR','wingFoldL','wingFoldR','gearL','tailGear'].map(n=>parts[n].quaternion.toArray().map(q=>q.toFixed(5))).concat(parts.cowlFlaps.userData.flaps.map(p=>p.rotation.x.toFixed(4))));
const rest=snapshot();
for(const key of ['flaps','hook','bay','fold','cowl']){plane.set({[key]:1});assert.notEqual(snapshot(),rest,key+' moves');plane.set({[key]:0});}
plane.set({gear:0});assert.notEqual(snapshot(),rest,'gear moves');plane.set({gear:1});
assert.equal(snapshot(),rest,'all parts return to rest');
plane.set({flaps:1});const flapDrop=lowest(parts.flapOuterR).y;plane.set({flaps:0});
assert(flapDrop<lowest(parts.flapOuterR).y-.3,'split flaps deflect down');
plane.set({hook:1});const hookDown=lowest(parts.hook);plane.set({hook:0});
assert(hookDown.y<lowest(parts.hook).y-.6,'hook swings down');
plane.set({bay:1});assert(lowest(parts.bayDoorL).y<lowest(parts.torpedo).y,'open bay doors uncover the torpedo');plane.set({bay:0});
const before=parts.propeller.rotation.z;plane.spin(1/60,1);assert(parts.propeller.rotation.z<before,'propeller turns clockwise seen from the cockpit');
assert.equal(parts.mainWheel,undefined);assert(parts.gearR.getObjectByName('mainWheel').userData.groundWheel&&parts.tailGear.getObjectByName('tailWheel').userData.groundWheel,'tyres are tagged as ground supports');

// 5. Closed torpedo bay: the torpedo stays inside the belly.
each(parts.torpedo,v=>{const s=v.z+OwnAvenger.Z0;assert(v.y>=plane.fusBot(s)-.03,'torpedo inside the belly at station '+s.toFixed(2));});

// 6. Surfaces face outward (no inside-out skins under FrontSide materials).
const facing=(name,probe)=>{const o=root.getObjectByName(name);o.updateMatrixWorld(true);const g=o.geometry,p=g.attributes.position,n=g.attributes.normal,v=new THREE.Vector3(),q=new THREE.Vector3();let out=0,total=0;
  for(let i=0;i<p.count;i+=7){v.fromBufferAttribute(p,i);q.fromBufferAttribute(n,i);const d=probe(v);if(d.lengthSq()<1e-6)continue;total++;if(q.dot(d)>0)out++;}return out/total;};
assert(facing('fuselage',v=>new THREE.Vector3(v.x,v.y-plane.fusTop(v.z+OwnAvenger.Z0)/2-plane.fusBot(v.z+OwnAvenger.Z0)/2,0))>.9,'fuselage skin faces outward');
assert(facing('cowling',v=>v.z+OwnAvenger.Z0>.62&&Math.hypot(v.x,v.y)>.765?new THREE.Vector3(v.x,v.y,0):new THREE.Vector3())>.95,'cowling barrel faces outward');
for(const n of ['wingCentre','stabR','fin'])assert(facing(n,v=>{if(n==='fin')return new THREE.Vector3(v.x,0,0);const y=n==='stabR'?.5:plane.wingAt(v.x).y;return new THREE.Vector3(0,v.y-y,0);})>.9,n+' faces outward');

// 7. Budget and clean disposal.
const stats=plane.stats();
assert(stats.triangles<60000&&stats.meshes<110&&stats.textures===4,'budget '+JSON.stringify(stats));
let bad=0;each(root,v=>{if(!Number.isFinite(v.x+v.y+v.z))bad++;});assert.equal(bad,0,'finite geometry');
const scene=new THREE.Scene();scene.add(root);plane.dispose();assert.equal(root.parent,null,'dispose detaches the model');
for(const scheme of Object.keys(OwnAvenger.SCHEMES)){const p=OwnAvenger.create(THREE,{createCanvas,scheme});assert.equal(p.scheme,OwnAvenger.SCHEMES[scheme]);p.dispose();}
console.log(JSON.stringify({span:+(x1-x0).toFixed(2),length:+(z1-z0).toFixed(2),folded:+(f1-f0).toFixed(2),wingArea:+(2*area).toFixed(1),attitudeDeg:+(attitude*180/Math.PI).toFixed(1),height:+levelTop.toFixed(2),groundClearance:+clearance.toFixed(2),...stats}));
