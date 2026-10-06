/* The two uploaded originals, prepared offline for bounded close-range drawing. */
(function(scope){
 'use strict';
 const specs={bunker:{length:10,name:'Concrete bunker'},'observation-post':{length:7.5,name:'WWII observation post'}},templates=new Map(),tasks=new Map();
 function normalize(source,kind){
  const spec=specs[kind],model=source.clone(true),box=new THREE.Box3(),vertex=new THREE.Vector3();model.updateMatrixWorld(true);
  // Rotated exporter bounds overestimate the scanned bunker by 65 cm vertically.
  // Measure the vertices after their complete original hierarchy transforms.
  model.traverse(o=>{if(!o.isMesh)return;const positions=o.geometry.attributes.position;
   for(let i=0;i<positions.count;i++)box.expandByPoint(vertex.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld));
  });
  const size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3()),scale=spec.length/Math.max(size.x,size.z);
  const template=new THREE.Group(),offset=new THREE.Group();offset.add(model);offset.position.set(-centre.x,-box.min.y,-centre.z);template.add(offset);template.scale.setScalar(scale);template.name=spec.name;
  template.userData.fortification={kind,width:size.x*scale,depth:size.z*scale,height:size.y*scale};
  template.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;o.frustumCulled=true;}});template.updateMatrixWorld(true);return template;
 }
 function load(kind){
  if(tasks.has(kind))return tasks.get(kind);
  const task=new Promise((yes,no)=>new THREE.GLTFLoader().load('assets/buildings/'+kind+'.glb?v=174',g=>{const model=normalize(g.scene,kind);templates.set(kind,model);yes(model);},undefined,no));
  tasks.set(kind,task.catch(e=>{tasks.delete(kind);throw e;}));return tasks.get(kind);
 }
 function proxy(template){
  const d=template.userData.fortification,g=new THREE.Group(),mat=new THREE.MeshLambertMaterial({color:d.kind==='bunker'?0x727567:0x8c8b7c});
  // Preserve the measured footprint and height for a distant, single-draw silhouette.
  const wall=new THREE.Mesh(new THREE.BoxGeometry(d.width,d.height,d.depth),mat);wall.position.y=d.height/2;g.add(wall);return g;
 }
 scope.FortificationAssets={specs,normalize,load,get:kind=>templates.get(kind),proxy};
})(typeof window!=='undefined'?window:globalThis);
