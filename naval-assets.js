/* Uploaded ships, baked to static meshes with bounded embedded textures.
 * Templates share geometry and materials; no skeleton copies or per-frame decode. */
(function(g){
 'use strict';
 const specs={
  cargo:{file:'japanese-cargo',length:132,draft:3.5,yaw:Math.PI/2,name:'Japanese supply ship'},
  samidare:{file:'samidare',length:110,draft:3.3,yaw:-Math.PI/2,name:'Samidare destroyer'},
  liberty:{file:'liberty',length:135,draft:5.8,yaw:0,name:'Liberty transport'},
  landing:{file:'landing-ship',length:100,draft:2.3,yaw:-Math.PI/2,name:'Landing ship'},
  fletcher:{file:'fletcher',length:115,draft:3.5,yaw:-Math.PI/2,name:'Fletcher escort'},
  submarine:{file:'ko-hyoteki',length:24,draft:1.1,yaw:0,name:'Surfaced Ko-hyoteki'}
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
  template.userData.naval={length:spec.length,beam:size.x*scale,draft:spec.draft,height:size.y*scale-spec.draft};
  template.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;}});
  template.updateMatrixWorld(true);return template;
 }
 function load(name){
  if(tasks.has(name))return tasks.get(name);
  const spec=specs[name];if(!spec)return Promise.reject(Error('Unknown ship model: '+name));
  const task=PacificAssets.loader().load('assets/ships/'+spec.file+'.glb?v=172',gltf=>{
   const template=normalize(gltf.scene,spec);templates.set(name,template);return template;
  }).then(()=>templates.get(name));
  tasks.set(name,task.catch(e=>{tasks.delete(name);throw e;}));return tasks.get(name);
 }
 function label(def){return def.type==='cruiser'?'Zuiho light carrier':specs[key(def)]?.name||'Ship';}
 function gunThreshold(def){return def.type==='cruiser'?Infinity:def.model==='submarine'?70:def.type==='destroyer'?300:120;}
 g.NavalAssets={specs,key,label,gunThreshold,normalize,load,get:name=>templates.get(name)};
})(window);
