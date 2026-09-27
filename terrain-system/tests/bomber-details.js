// Real bomber assets: each shaft spins and MG rounds leave the turret, not the fuselage centre.
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
  ? {getContext(){return {drawImage(){},getImageData(){return {data:[60,60,60,255]};}};}}
  : new ImageStub();}};
vm.runInThisContext(fs.readFileSync(process.env.GLTF_LOADER_R128,'utf8'));
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
vm.runInThisContext(html.slice(html.indexOf('function samplePoints('),html.indexOf('// Find the propeller BY GEOMETRY')));
vm.runInThisContext("const JET_KINDS=['me262','me163'],NO_PROP_KINDS=['b24'],MULTI_ENGINE_KINDS=['b17'],TRICYCLE_KINDS=['me262'];\n"+
  html.slice(html.indexOf('function readVert('),html.indexOf('function loadModels(){')));
vm.runInThisContext(html.slice(html.indexOf('function bomberRotors('),html.indexOf('function spawnBombers(')));
const loader=new THREE.GLTFLoader();
async function load(file){
  const b=fs.readFileSync(path.join(root,file));
  return new Promise((resolve,reject)=>loader.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',resolve,reject));
}
function fixedBladeFaces(group,p){
  group.updateMatrixWorld(true);
  let faces=0;const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  group.traverse(o=>{
    if(!o.isMesh||!o.geometry?.index)return;
    for(let a=o.parent;a;a=a.parent)if(a.name==='prop')return;
    const ix=o.geometry.index.array,pos=o.geometry.attributes.position;
    for(let i=0;i<ix.length;i+=3){
      if(ix[i]===ix[i+1]&&ix[i]===ix[i+2])continue;
      for(let j=0;j<3;j++){readVert(pos,ix[i+j],v[j]);o.localToWorld(v[j]);}
      const x=(v[0].x+v[1].x+v[2].x)/3,y=(v[0].y+v[1].y+v[2].y)/3,
        z=(v[0].z+v[1].z+v[2].z)/3,r=Math.hypot(x-p.cx,y-p.cy);
      if(r>.13&&r<1.24&&z>p.zPlane-1.1&&z<p.zPlane+.5)faces++;
    }
  });return faces;
}
(async()=>{
  for(const [file,span,kind,axis] of [['b17.glb',31.62,'b17','z'],['b24.glb',33.53,'b24','y']]){
    const gltf=await load(file),group=new THREE.Group(),src=gltf.scene;
    group.add(src);src.updateMatrixWorld(true);
    const width=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).x;
    src.scale.setScalar(span/width);group.updateMatrixWorld(true);
    src.position.copy(new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3())).negate();
    group.updateMatrixWorld(true);
    const originalProps=kind==='b17'?findWingProps(group):[];
    const rig=rigModel(group,kind);
    assert.match(rig,kind==='b17'?/across 4 engines/:/four original B-24 propellers rigged/);
    const aircraft=group.clone(true),rotors=bomberRotors(aircraft),stations=bomberGunStations(aircraft);
    assert.equal(rotors.length,4,kind+' must spin four independent shafts even on a cloned enemy');
    assert(rotors.every(r=>r.userData.spinAxis===axis),kind+' must rotate around each shaft axis');
    assert.equal(new Set(rotors.map(r=>Math.round(r.getWorldPosition(new THREE.Vector3()).x*10))).size,4,
      kind+' rotors must sit at four separate wing engines');
    if(kind==='b17'){
      assert.equal(originalProps.length,4);
      assert.equal(group.getObjectByName('0_1'),undefined,'B-17 original rigid propeller assembly must be removed');
      assert(group.getObjectByName('0_0'),'B-17 wing and engine cowls must remain');
      assert(originalProps.every(p=>fixedBladeFaces(group,p)<5),
        'B-17 must have no fixed blade faces around any of its four spinning rotors');
      assert(rotors.every(r=>{
      const s=new THREE.Box3().setFromObject(r).getSize(new THREE.Vector3());
      return s.x>2.3&&s.y>2.0;
      }), 'B-17 rotating blades must be large enough to read in flight');
    }
    if(kind==='b24'){
      const fixed=[];aircraft.traverse(o=>{if(/^prop[0-3]_(still|blurred)_AN_/.test(o.name))fixed.push(o);});
      assert.equal(fixed.length,0,'static and blurred duplicate propeller subtrees must be removed');
    }
    const e={group:aircraft,rotors,gunStations:stations,kind,bomber:true,alive:true,
      pos:new THREE.Vector3(0,1000,0),vel:new THREE.Vector3(0,0,72),heading:0,pitch:0,roll:0,
      hp:30,maxhp:30,cool:0};
    const P={pos:new THREE.Vector3(0,1300,0),spd:120,alive:true};
    const tracers=[],scene=new THREE.Scene();scene.add(aircraft);
    const code=html.slice(html.indexOf('const bomberRoundGeo='),html.indexOf('function damagePlayer(',html.indexOf('const bomberRoundGeo=')));
    const ctx=vm.createContext({THREE,P,scene,tracers,groundY:()=>0,RTILE:10000,RGRID_W:4,RGRID_H:4,
      D:()=>({id:'rookie',aim:1,dmg:.5}),noseDir:()=>new THREE.Vector3(0,0,1),spawnSmoke(){}});
    vm.runInContext(code,ctx);
    const spin=rotors[0].rotation[axis];
    ctx.updateBomber(e,.05,P.pos.clone().sub(e.pos),300);
    assert(Math.abs(rotors[0].rotation[axis]-spin)>1,kind+' propeller rotation must advance with time');
    assert.equal(tracers.length,2,kind+' single rookie gunner fires two small rounds');
    const dorsal=aircraft.localToWorld(stations[0].pos.clone());
    assert(tracers.every(t=>t.mesh.position.distanceTo(dorsal)<10),kind+' bullets must originate at dorsal turret');
    assert(tracers.every(t=>t.mesh.geometry.parameters.depth<1.5&&t.damage===2.25),
      kind+' rounds are smaller without doubling hit damage');
    for(const [z,stationId] of [[300,2],[-300,3]]){
      P.pos.set(0,1000,z);e.cool=0;
      const before=tracers.length;
      ctx.updateBomber(e,.05,P.pos.clone().sub(e.pos),P.pos.distanceTo(e.pos));
      const muzzle=aircraft.localToWorld(stations[stationId].pos.clone());
      assert(tracers.slice(before).every(t=>t.mesh.position.distanceTo(muzzle)<10),
        kind+' nose/tail fire must start at the turret facing the player');
    }
    assert(new Set(tracers.map(t=>t.mesh.material.color.getHex())).size===2,
      kind+' burst must mix dark rounds with faint bright tracers');
    console.log(kind,'four rotating engines; turret-origin, short mixed rounds');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
