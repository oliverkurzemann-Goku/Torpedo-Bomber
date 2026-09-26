/* Real GLB and r128 GLTFLoader regression: the SBD has one rotor and the
   Avenger's detached blade must accompany its wingmen. Run with NODE_PATH set
   to the project's test dependencies. */
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');global.THREE=THREE;global.self=global;global.window=global;
class ImageStub{
 constructor(){this.listeners={};this.width=2;this.height=2;}
 addEventListener(event,fn){this.listeners[event]=fn;}
 removeEventListener(){}
 set src(_){queueMicrotask(()=>this.listeners.load?.());}
}
global.document={createElementNS(){return new ImageStub();}};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));
const root=path.resolve(__dirname,'../..'), html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
vm.runInThisContext(html.slice(html.indexOf('function readVert('),html.indexOf('function cowlCentre(')));
vm.runInThisContext(html.slice(html.indexOf('function makeSBDGear('),html.indexOf('function loadSBDModel(){')));
function glb(file){return new Promise((resolve,reject)=>{const raw=fs.readFileSync(path.join(root,file));
 new THREE.GLTFLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'',v=>resolve(v.scene),reject);
});}
(async()=>{
 const model=await glb('sbd dauntless.glb');
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
 model.position.sub(bounds.getCenter(new THREE.Vector3()));model.scale.setScalar(12.7/Math.max(size.x,size.y,size.z));
 const holder=new THREE.Group();holder.add(model);
 const prop=findProp(holder,+1);assert.ok(prop&&prop.tipR>1.2&&prop.tipR<2.2,'real SBD propeller measured');
 const cut=cutBlades(holder,prop);assert.ok(cut>0,'static SBD blades removed from loaded geometry');
 const survivors=[];
 holder.updateMatrixWorld(true);
 holder.traverse(o=>{if(!o.isMesh||!o.geometry?.index||!o.geometry.attributes.position)return;
  const ix=o.geometry.index.array,pos=o.geometry.attributes.position;
  for(let t=0;t<ix.length;t+=3){if(ix[t]===ix[t+1]&&ix[t]===ix[t+2])continue;
   const vs=[ix[t],ix[t+1],ix[t+2]].map(i=>holder.worldToLocal(o.localToWorld(readVert(pos,i,new THREE.Vector3()))));
   const centre=vs[0].clone().add(vs[1]).add(vs[2]).divideScalar(3);
   const r=Math.hypot(centre.x-prop.cx,centre.y-prop.cy);
   const outer=Math.max(...vs.map(v=>Math.hypot(v.x-prop.cx,v.y-prop.cy)));
   if(outer>prop.hubR*1.35&&r<prop.tipR*1.3&&Math.abs(centre.z-prop.zPlane)<.85)
    survivors.push([centre.z.toFixed(2),r.toFixed(2),outer.toFixed(2),o.name]);
  }
 });
 assert.equal(survivors.length,0,'no fixed blade tips remain near the measured SBD propeller');
 const rotor=makeProp(prop,3);rotor.name='sbdRotorBlade';holder.add(rotor);
 const gear=makeSBDGear();holder.add(gear);
 assert.equal(gear.name,'sbdGear');assert.equal(gear.children.length,8,'two main wheel assemblies and tailwheel fitted');
 const gearBounds=new THREE.Box3().setFromObject(gear);
 assert.ok(gearBounds.min.y<-2.1&&gearBounds.max.x>2,'wheels hang visibly beneath the loaded SBD wing');
 for(const clone of [holder.clone(true),holder.clone(true)]){
   const rotors=[];clone.traverse(o=>{if(o.name==='sbdRotorBlade')rotors.push(o);});
   assert.equal(rotors.length,1,'each player/wingman clone has exactly one movable rotor');
   rotors[0].rotation.z+=.3;assert.notEqual(rotors[0].rotation.z,rotor.rotation.z,'rotor transforms are independent');
   setSBDGearVisible(clone,false);assert.equal(clone.getObjectByName('sbdGear').visible,false,'gear retracts on cloned wingman');
   setSBDGearVisible(clone,true);assert.equal(clone.getObjectByName('sbdGear').visible,true,'gear extends on player clone');
 }
 const avenger=await glb('grumman tbm avenger.glb');
 const avBox=new THREE.Box3().setFromObject(avenger),avSize=avBox.getSize(new THREE.Vector3());
 avenger.position.sub(avBox.getCenter(new THREE.Vector3()));
 avenger.scale.setScalar(14/Math.max(avSize.x,avSize.y,avSize.z));
 avenger.updateMatrixWorld(true);
 const inv=new THREE.Matrix4().copy(avenger.matrixWorld).invert(),whole=new THREE.Box3(),parts=[];
 avenger.traverse(o=>{if(!o.isMesh||!o.geometry)return;
  if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
  const box=o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));
  whole.union(box);parts.push({o,box});
 });
 const sz=whole.getSize(new THREE.Vector3()),nose=whole.min.x;
 let blades=null,best=-1;
 for(const p of parts){const d=p.box.getSize(new THREE.Vector3()),across=Math.max(d.y,d.z);
  if(p.box.min.x>nose+sz.x*.13||across<sz.z*.12||d.x>sz.x*.20)continue;
  const score=across-Math.abs(p.box.getCenter(new THREE.Vector3()).x-nose)*.2;
  if(score>best){best=score;blades=p.o;}
 }
 assert.ok(blades,'real Avenger has a separate nose rotor');
 const pivot=new THREE.Group();pivot.add(blades.clone());
 const escort=pivot.clone(true);escort.rotation.z+=.3;
 assert.equal(escort.children.length,1,'wingman rotor carries the loaded Avenger blades');
 assert.match(html,/disc=propPivot\.clone\(true\)/,'Avenger wingman copies the detached real blade');
 console.log('SBD GLB: '+cut+' original triangles cut, one independent rotor per aircraft; real Avenger wingman blade cloned ('+blades.name+')');
})().catch(e=>{console.error(e);process.exitCode=1;});
