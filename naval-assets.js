/* Original static ship models with paint baked into a small set of materials.
 * Templates share geometry and materials; no skeleton copies or per-frame decode. */
(function(g){
 'use strict';
 const specs={
  cargo:{propellers:1,file:'japanese-cargo',length:132,draft:3.5,yaw:Math.PI/2,name:'Japanese supply ship'},
  samidare:{propellers:2,file:'samidare',length:110,draft:3.3,yaw:-Math.PI/2,name:'Samidare destroyer'},
  liberty:{propellers:1,file:'liberty',length:135,draft:5.8,yaw:0,name:'Liberty transport'},
  landing:{propellers:2,file:'landing-ship',length:100,draft:2.3,yaw:-Math.PI/2,name:'Landing ship'},
  fletcher:{propellers:2,file:'fletcher',length:115,draft:3.5,yaw:-Math.PI/2,name:'Fletcher escort'},
  submarine:{propellers:1,file:'ko-hyoteki',length:24,draft:1.1,yaw:0,name:'Surfaced Ko-hyoteki'},
  // Build 246: the neutral white hospital ship (hospital-ship-own.glb, 163.3 m, keel 9.23 m under the waterline, +Z forward)
  hospital:{propellers:2,file:'hospital-ship-own',length:163.3,draft:9.23,yaw:0,name:'Hospital ship'},
  // Build 247: the fleet oiler Nagisa (143.5 m, keel 8.08 m) and the battleship Yamato, April 1945 (263 m, keel 10.4 m). Both +Z forward.
  oiler:{propellers:2,file:'fleet-oiler-own',length:143.5,draft:8.08,yaw:0,name:'Fleet oiler'},
  yamato:{propellers:4,file:'yamato-1945-own',length:263,draft:10.4,yaw:0,name:'Battleship Yamato'}
 };
 const tasks=new Map(),templates=new Map();
 function key(def){return def.model||(def.type==='destroyer'?'samidare':'cargo');}
 function normalize(source,spec){
  const model=source.clone(true),orientation=new THREE.Group();orientation.add(model);orientation.rotation.y=spec.yaw;
  orientation.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(orientation),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
  const scale=spec.length/size.z;
  const template=new THREE.Group(),offset=new THREE.Group();offset.add(orientation);
  offset.position.set(-centre.x,-box.min.y-spec.draft/scale,-centre.z);
  template.add(offset);template.scale.setScalar(scale);template.name=spec.name;
  template.userData.naval={propellers:spec.propellers,length:spec.length,beam:size.x*scale,draft:spec.draft,height:size.y*scale-spec.draft};
  template.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;}});
  template.updateMatrixWorld(true);g.ShipContact?.instance?.prepare(template);return template;
 }
 function load(name){
  if(tasks.has(name))return tasks.get(name);
  const spec=specs[name];if(!spec)return Promise.reject(Error('Unknown ship model: '+name));
  const task=PacificAssets.loader().load('assets/ships/'+spec.file+'.glb?v=own-fleet-4',gltf=>{
   const template=normalize(gltf.scene,spec);templates.set(name,template);return template;
  }).then(()=>templates.get(name));
  tasks.set(name,task.catch(e=>{tasks.delete(name);throw e;}));return tasks.get(name);
 }
 function label(def){return def.type==='cruiser'&&!def.model?'Kaga fleet carrier':specs[key(def)]?.name||'Ship';}
 function gunThreshold(def){return def.type==='cruiser'?Infinity:def.model==='submarine'?70:def.type==='destroyer'?300:120;}
 g.NavalAssets={specs,key,label,gunThreshold,normalize,load,get:name=>templates.get(name)};
})(window);
