/* Reusable dim runway markers at the active strip. No point lights/shadows. */
(function(root){
 'use strict';
 function create(THREE,scene,groundAt,length=900,width=40){
  const group=new THREE.Group();group.name='runwayLights';group.visible=false;scene.add(group);
  const positions=[],colors=[];const warm=new THREE.Color(0xf0c98a),green=new THREE.Color(0x77cba1),red=new THREE.Color(0xd96f55);
  for(let x=-length/2;x<=length/2;x+=45)for(const side of [-1,1]){positions.push([x,side*(width/2+2)]);colors.push(warm);}
  for(const end of [-1,1])for(let i=-2;i<=2;i++){positions.push([end*(length/2-2),i*width/5]);colors.push(end<0?green:red);}
  const count=positions.length,body=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.25,.45,7),new THREE.MeshStandardMaterial({color:0x414436,roughness:.95}),count);
  const lens=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,7,5),new THREE.MeshBasicMaterial({color:0xffffff}),count);
  // A radial halo makes small bulbs visible on approach without lighting the terrain.
  const n=32,pixels=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const r=Math.hypot((x+ .5-n/2)/(n/2),(y+ .5-n/2)/(n/2)),j=(y*n+x)*4;pixels[j]=pixels[j+1]=pixels[j+2]=255;pixels[j+3]=Math.round(200*Math.pow(Math.max(0,1-r),2));}
  const texture=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);texture.needsUpdate=true;
  const halo=new THREE.InstancedMesh(new THREE.PlaneGeometry(8.0,8.0),new THREE.MeshBasicMaterial({color:0xffffff,map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}),count);
  for(const mesh of [body,lens,halo]){mesh.frustumCulled=false;group.add(mesh);}body.name='runwayLampBases';lens.name='runwayLampLenses';halo.name='runwayLampHalos';
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);let field={x:0,z:0};const heights=[];
  function refresh(){for(let i=0;i<count;i++){const [dx,dz]=positions[i],h=groundAt(field.x+dx,field.z+dz);heights[i]=h;pos.set(dx,h+.225,dz);matrix.compose(pos,q,scale);body.setMatrixAt(i,matrix);pos.y=h+.48;matrix.compose(pos,q,scale);lens.setMatrixAt(i,matrix);pos.y=h+.055;matrix.compose(pos,rotation,scale);halo.setMatrixAt(i,matrix);lens.setColorAt(i,colors[i]);halo.setColorAt(i,colors[i]);}for(const mesh of [body,lens,halo])mesh.instanceMatrix.needsUpdate=true;}
  return {group,positions,update(camera){if(!group.visible)return;for(let i=0;i<count;i++){const [dx,dz]=positions[i];pos.set(dx,heights[i]+.48,dz);matrix.compose(pos,camera.quaternion,scale);halo.setMatrixAt(i,matrix);}halo.instanceMatrix.needsUpdate=true;},setActive(enabled,x,z){group.visible=!!enabled;field={x,z};group.position.set(x,0,z);if(enabled)refresh();},refresh,get field(){return field;},dispose(){scene.remove(group);for(const mesh of [body,lens,halo]){mesh.geometry.dispose();mesh.material.dispose();}texture.dispose();}};
 }
 root.RunwayLights={create};if(typeof module==='object'&&module.exports)module.exports=root.RunwayLights;
})(typeof window==='undefined'?globalThis:window);
