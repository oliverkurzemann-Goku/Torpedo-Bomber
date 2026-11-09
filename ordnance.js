/* Low-poly, shared ordnance. Local +Z is the nose; lookAt follows velocity. */
(function(root){
 'use strict';
 const templates={};
 function template(kind){
  if(templates[kind])return templates[kind];
  const torpedo=kind==='torpedo',rocket=kind==='rocket',r=rocket?.064:torpedo?.32:.40,L=rocket?1.70:torpedo?4.6:2.6;
  // Closed ogive nose, cylindrical middle, tapered tail. Lathe axis Y -> +Z.
  const profile=rocket?[[0,-.5],[r,-.44],[r,.32],[.035,.44],[0,.5]]:torpedo?[[0,-.50],[.11,-.48],[.20,-.40],[.29,-.31],[.32,-.23],[.32,.33],[.29,.40],[.22,.46],[.10,.495],[0,.50]]:
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
  const t={body,skin,fin,fins,band,bandMat,L,r};
  if(rocket){
   // Build 235: a 1.7 m x 13 cm rocket at 350 m/s is far below one pixel from the chase camera. The visible part of a
   // rocket is its motor: two additive flame cones (shared geometry, no allocation per shot) and a soft glow that
   // stays readable seen straight from behind. Display only; the projectile itself is unchanged.
   t.flameGeo=new THREE.ConeGeometry(1,1,10);t.flameGeo.translate(0,.5,0);t.flameGeo.rotateX(-Math.PI/2);   // base at the origin, apex toward -Z
   const flameMat=color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false});
   t.flameOuterMat=flameMat(0xff8426);t.flameCoreMat=flameMat(0xfff1cf);
   const size=48,data=new Uint8Array(size*size*4);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){const d=Math.min(1,Math.hypot(x-size/2+.5,y-size/2+.5)/(size/2)),a=Math.pow(1-d,2.2),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*a);}
   const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.minFilter=map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
   t.glowMat=new THREE.SpriteMaterial({map,color:0xffa24a,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false});
  }
  return templates[kind]=t;
 }
 function create(kind){
  const t=template(kind),g=new THREE.Group();g.name=kind;g.userData.ordnance=kind;
  const body=new THREE.Mesh(t.body,t.skin);body.name='ogiveBody';g.add(body);
  for(let i=0;i<4;i++){const f=new THREE.Mesh(t.fin,t.fins);f.name='tailFin';f.rotation.z=i*Math.PI/2;g.add(f);}
  const band=new THREE.Mesh(t.band,t.bandMat);band.position.z=t.L*.20;g.add(band);
  if(kind==='rocket'){
   const flame=new THREE.Group();flame.name='rocketFlame';flame.position.z=-t.L*.5+.05;
   const outer=new THREE.Mesh(t.flameGeo,t.flameOuterMat);outer.scale.set(.34,.34,7.5);outer.name='flameOuter';
   const core=new THREE.Mesh(t.flameGeo,t.flameCoreMat);core.scale.set(.15,.15,4.4);core.name='flameCore';
   const glow=new THREE.Sprite(t.glowMat);glow.scale.set(5.2,5.2,1);glow.position.z=-1.4;glow.name='flameGlow';
   flame.add(outer,core,glow);g.add(flame);g.userData.flame=flame;
  }
  // Resources belong to the shared template, never to one dropped weapon.
  return g;
 }
 root.Ordnance={create};
})(typeof window==='undefined'?globalThis:window);
