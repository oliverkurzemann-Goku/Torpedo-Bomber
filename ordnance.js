/* Low-poly, shared ordnance. Local +Z is the nose; lookAt follows velocity. */
(function(root){
 'use strict';
 const templates={};
 function template(kind){
  if(templates[kind])return templates[kind];
  const torpedo=kind==='torpedo',r=torpedo?.32:.40,L=torpedo?4.6:2.6;
  // Closed ogive nose, cylindrical middle, tapered tail. Lathe axis Y -> +Z.
  const profile=torpedo?[[0,-.50],[.11,-.48],[.20,-.40],[.29,-.31],[.32,-.23],[.32,.33],[.29,.40],[.22,.46],[.10,.495],[0,.50]]:
   [[0,-.50],[.10,-.47],[.20,-.39],[.30,-.31],[.39,-.14],[.40,.17],[.34,.32],[.24,.42],[.12,.48],[0,.50]];
  const body=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(p[0],p[1]*L)),16);
  body.rotateX(Math.PI/2);
  const skin=new THREE.MeshStandardMaterial({color:torpedo?0x72786c:0x3b4430,roughness:.76,metalness:torpedo?.18:.05});
  // Four swept fins, distinct from the body even in a small chase-camera view.
  const finShape=new THREE.Shape();
  finShape.moveTo(r*.45,-L*.22);finShape.lineTo(r*1.75,-L*.33);
  finShape.lineTo(r*1.75,-L*.49);finShape.lineTo(r*.35,-L*.47);finShape.closePath();
  const fin=new THREE.ShapeGeometry(finShape);fin.rotateX(Math.PI/2);
  const fins=new THREE.MeshStandardMaterial({color:torpedo?0x434b43:0x293223,roughness:.82,side:THREE.DoubleSide});
  const band=new THREE.CylinderGeometry(r*1.008,r*1.008,L*.025,16,1,true);band.rotateX(Math.PI/2);
  const bandMat=new THREE.MeshStandardMaterial({color:torpedo?0x454e48:0xb4a25b,roughness:.85});
  return templates[kind]={body,skin,fin,fins,band,bandMat,L,r};
 }
 function create(kind){
  const t=template(kind),g=new THREE.Group();g.name=kind;g.userData.ordnance=kind;
  const body=new THREE.Mesh(t.body,t.skin);body.name='ogiveBody';g.add(body);
  for(let i=0;i<4;i++){const f=new THREE.Mesh(t.fin,t.fins);f.name='tailFin';f.rotation.z=i*Math.PI/2;g.add(f);}
  const band=new THREE.Mesh(t.band,t.bandMat);band.position.z=t.L*.20;g.add(band);
  // Resources belong to the shared template, never to one dropped weapon.
  return g;
 }
 root.Ordnance={create};
})(typeof window==='undefined'?globalThis:window);
