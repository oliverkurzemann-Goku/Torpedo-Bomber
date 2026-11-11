'use strict';
const specs=require('./specs.cjs');
const {template}=require('./scenery.cjs');

function create(T,map){
 const material=new T.MeshLambertMaterial({map,color:0xffffff}),roots={};
 for(const spec of specs){
  const group=new T.Group();
  for(const part of template(spec)){
   const src=part.mesh,geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Float32BufferAttribute(src.positions,3));
   geometry.setAttribute('normal',new T.Float32BufferAttribute(src.normals,3));
   geometry.setAttribute('uv',new T.Float32BufferAttribute(src.uv,2));
   geometry.setIndex(new T.Uint16BufferAttribute(src.indices,1));
   const mesh=new T.Mesh(geometry,material);
   mesh.name=part.name;
   if(part.translation)mesh.position.fromArray(part.translation);
   mesh.updateMatrix();
   group.add(mesh);
  }
  roots[spec.shape]=group;
 }
 return roots;
}
module.exports={create};
