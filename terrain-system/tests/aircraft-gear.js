// Regression for the welded wheels in the real Fw 190 and Bf 109 GLBs.
// The former wheel cut removed thousands of wing faces and left visible holes.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');global.THREE=THREE;global.self=global;global.window=global;
class ImageStub{
 constructor(){this.listeners={};this.width=2;this.height=2;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 removeEventListener(){}
 set src(_){queueMicrotask(()=>this.listeners.load?.());}
}
global.document={createElementNS(){return new ImageStub();},createElement(type){return type==='canvas'?{getContext(){return {drawImage(){},getImageData(){return {data:[60,60,60,255]};}}}}:new ImageStub();}};
vm.runInThisContext(fs.readFileSync(process.env.GLTF_LOADER_R128,'utf8'));
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
vm.runInThisContext("const JET_KINDS=['me262'],NO_PROP_KINDS=['b24'],MULTI_ENGINE_KINDS=['b17'],TRICYCLE_KINDS=['me262'];\n"+
 html.slice(html.indexOf('function readVert('),html.indexOf('function loadModels(){')));
const loader=new THREE.GLTFLoader();
async function load(file){const b=fs.readFileSync(path.join(root,file));return new Promise((resolve,reject)=>loader.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',resolve,reject));}
function faceCount(group,minimumY){let total=0;group.updateMatrixWorld(true);group.traverse(o=>{
 if(!o.isMesh||!o.geometry?.index)return;
 const {position}=o.geometry.attributes,index=o.geometry.index.array,p=new THREE.Vector3();
 for(let i=0;i<index.length;i+=3){if(index[i]===index[i+1]&&index[i]===index[i+2])continue;
  for(let k=0;k<3;k++){readVert(position,index[i+k],p);o.localToWorld(p);if(p.y>=minimumY){total++;break;}}
 }
});return total;}
(async()=>{
 for(const [kind,file,yaw,span] of [['fw190','fw190.glb',0,10.51],['bf109','bf109new.glb',0,9.92]]){
  const {scene:src}=await load(file),model=new THREE.Group();model.add(src);src.rotation.y=yaw;src.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());src.scale.setScalar(span/size.x);
  model.updateMatrixWorld(true);src.position.copy(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())).negate();model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),s=box.getSize(new THREE.Vector3()),floor=box.min.y+s.y*.30;
  const upperBefore=faceCount(model,floor-.36),rig=rigModel(model,kind),upperAfter=faceCount(src,floor-.36);
  // The propeller is intentionally cut from the welded mesh too; even if all
  // its faces sit above this plane, the wing cut may remove none beyond them.
  const propFaces=Number(rig.match(/cut (\d+) moulded blade triangles/)[1]);
  assert.ok(upperBefore-upperAfter<=propFaces,kind+' wing skin was removed');
  assert.match(rig,/cut \d+ welded gear triangles, built gear/);
  const removed=Number(rig.match(/cut (\d+) welded gear triangles/)[1]);
  assert.ok(removed>0&&removed<100,kind+' wheel cut must stay local');
  const gear=model.getObjectByName('gear');assert.equal(gear.children.length,3);
  const wheels=gear.children.slice(0,2).map(g=>new THREE.Box3().setFromObject(g));
  assert.ok(wheels.every(b=>b.min.y<box.min.y-.55),kind+' main gear is hidden inside wing');
  assert.ok(Math.abs(wheels[0].min.y-wheels[1].min.y)<.05,kind+' wheel axles differ in height');
  brightenFighterSkin(src,kind);
  const painted=[];src.traverse(o=>{if(o.isMesh)painted.push(...[].concat(o.material).filter(m=>m?.emissiveIntensity>.1));});
  assert.ok(painted.length>0&&painted.every(m=>m.emissiveMap===null),kind+' body textures still block the ambient fill');
  console.log(kind,JSON.stringify({removedWheelFaces:removed,upperWingFaces:upperAfter,wheelBottom:wheels[0].min.y}));
 }
 const jet=(await load('me262.glb')).scene;brightenFighterSkin(jet,'me262');
 const jetMaterials=[];jet.traverse(o=>{if(o.isMesh)jetMaterials.push(...[].concat(o.material).filter(m=>m?.emissiveIntensity>.1));});
 assert.ok(jetMaterials.length>0&&jetMaterials.every(m=>m.emissiveMap===null&&m.emissiveIntensity>=.34),'Me 262 skin remains dark');
})().catch(e=>{console.error(e);process.exitCode=1;});
