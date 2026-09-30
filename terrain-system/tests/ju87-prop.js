// Load the actual shipped Ju 87 mesh: the fixed propeller must disappear without holes in
// the inverted gull wings, and the rotor must survive cloning for enemy aircraft.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');global.THREE=THREE;global.self=global;global.window=global;
class ImageStub{
  constructor(){this.listeners={};this.width=2;this.height=2;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  removeEventListener(){}
  set src(_){queueMicrotask(()=>this.listeners.load?.());}
}
global.document={createElementNS(){return new ImageStub();},createElement(type){return type==='canvas'
  ?{getContext(){return {drawImage(){},getImageData(){return {data:[60,60,60,255]};}};}}
  :new ImageStub();}};
vm.runInThisContext(fs.readFileSync(process.env.GLTF_LOADER_R128,'utf8'));
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
vm.runInThisContext(html.slice(html.indexOf('function samplePoints('),html.indexOf('// Find the propeller BY GEOMETRY')));
vm.runInThisContext("const JET_KINDS=['me262','me163'],NO_PROP_KINDS=['b24'],MULTI_ENGINE_KINDS=['b17'],TRICYCLE_KINDS=['me262'];\n"+
  html.slice(html.indexOf('function readVert('),html.indexOf('function loadModels(){')));
const bytes=fs.readFileSync(path.join(root,'ju87.glb'));
new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',gltf=>{
  const aircraft=new THREE.Group(),src=gltf.scene;aircraft.add(src);
  src.updateMatrixWorld(true);
  const initial=new THREE.Box3().setFromObject(aircraft);
  assert(Math.abs(initial.max.x+initial.min.x)<.01,'GLB spans the X axis');
  src.scale.setScalar(13.8/initial.getSize(new THREE.Vector3()).x);
  aircraft.updateMatrixWorld(true);
  src.position.copy(new THREE.Box3().setFromObject(aircraft).getCenter(new THREE.Vector3())).negate();
  aircraft.updateMatrixWorld(true);
  const wing=aircraft.getObjectByName('Object_8'),front=aircraft.getObjectByName('Object_12');
  const wingIndices=wing.geometry.index.array.slice(),before=front.geometry.index.array.slice();
  const description=rigModel(aircraft,'ju87');
  assert.match(description,/fixed Ju 87 blade faces; 3-blade rotor/);
  attachJu87DiveBrakes(aircraft);
  for(const name of ['diveBrakeLeft','diveBrakeRight']){
    const brake=aircraft.getObjectByName(name);
    assert(brake&&brake.children.length===3,'real Ju 87 has three slotted '+name+' panels');
    assert(brake.position.y<1,'brake belongs below the wing');
  }
  assert.deepEqual(wing.geometry.index.array,wingIndices,'both gull wings retain every triangle');
  let cut=0;
  for(let i=0;i<before.length;i+=3)if(before[i]!==before[i+1]&&before[i]!==before[i+2]
    &&front.geometry.index.array[i]===front.geometry.index.array[i+1]
    &&front.geometry.index.array[i]===front.geometry.index.array[i+2])cut++;
  assert(cut>1200&&cut<3200,'remove the front propeller blades, not the entire airframe');
  const rotor=aircraft.getObjectByName('prop');
  assert.equal(rotor.children.length,4,'three rotating blades and their spinner');
  assert.equal(aircraft.getObjectByName('gear'),undefined,'original fixed undercarriage stays visible');
  const enemy=aircraft.clone(true),enemyRotor=enemy.getObjectByName('prop');
  assert(enemyRotor&&enemyRotor!==rotor,'enemy clone has an independent animated shaft');
  assert.match(html,/if\(e\.prop\) e\.prop\.rotation\.z-=GameRuntime\.rotorStep\(dt,/,'enemy time-based spin hook active');
  assert.match(html,/if\(pr\) pr\.rotation\.z-=/,'player spin hook active');
  enemyRotor.rotation.z-=0.30;rotor.rotation.z-=0.25;
  assert.notEqual(enemyRotor.rotation.z,0);assert.notEqual(rotor.rotation.z,0);
  console.log('Ju 87: rotating player/enemy propeller; '+cut+' fixed front triangles removed; wings intact');
},e=>{throw e;});
