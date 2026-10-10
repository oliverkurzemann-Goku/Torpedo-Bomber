/* Lightweight period-inspired clothing. +Z is the face; figures stand on Y=0.
 * No insignia or exact unit reconstruction. Static details are material-batched. */
(function(root){
 'use strict';
 const palettes={
  usaaf:{jacket:0x654735,trousers:0x9b9270,helmet:0x664735,vest:0xc8a84e,shirt:0xc7b99a},
  usnavy:{jacket:0xb5a17b,trousers:0x9c906e,helmet:0x76583c,vest:0xd2b654,shirt:0xd1c4a6},
  luftwaffe:{jacket:0x535b60,trousers:0x606970,helmet:0x574432,vest:0xb6a04f,shirt:0xa1a3a0},
  ijn:{jacket:0x988464,trousers:0x85755c,helmet:0x634d36,vest:0xb29c69,shirt:0xb9ab8e}
 };
 function batch(THREE,parent){
  parent.updateMatrixWorld(true);const byMaterial=new Map(),inverse=parent.matrixWorld.clone().invert();
  for(const o of [...parent.children])if(o.isMesh){
   const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
   g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
   if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);byMaterial.get(o.material).push(g);
   parent.remove(o);o.geometry.dispose();
  }
  for(const [material,parts] of byMaterial){
   const geometry=new THREE.BufferGeometry();
   for(const name of ['position','normal']){const values=[];for(const g of parts)values.push(...g.attributes[name].array);geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,3));}
   for(const g of parts)g.dispose();geometry.computeBoundingSphere();parent.add(new THREE.Mesh(geometry,material));
  }
 }
 function create(THREE,options={}){
  const service=options.service||'usaaf',p=palettes[service]||palettes.usaaf,naval=options.role==='sailor',pilot=options.role!=='ground'&&!naval,chute=options.pose==='chute';
  const figure=new THREE.Group();figure.name='pilot';figure.userData.service=service;
  const mat=c=>{const material=new THREE.MeshStandardMaterial({color:c,roughness:.92});if(options.srgbOutput)material.color.convertSRGBToLinear();return material;};
  const m={coat:mat(naval?0x697b83:pilot?p.jacket:service==='luftwaffe'?0x616963:0x62664b),pants:mat(naval?0x404e5a:p.trousers),skin:mat([0xb99679,0xc4a183,0xa77f60][(options.variant||0)%3]),
   leather:mat(p.helmet),boot:mat(0x302b25),sole:mat(0x1c201e),web:mat(0xc0b28d),metal:mat(0x8d9289),glass:mat(0x34464a),vest:mat(p.vest),shirt:mat(p.shirt)};
  function part(name,parent=figure){const g=new THREE.Group();g.name=name;parent.add(g);return g;}
  function box(g,size,pos,material){const o=new THREE.Mesh(new THREE.BoxGeometry(...size),material);o.position.set(...pos);g.add(o);return o;}
  function sphere(g,size,pos,material){const o=new THREE.Mesh(new THREE.SphereGeometry(1,10,7),material);o.scale.set(...size);o.position.set(...pos);g.add(o);return o;}
  const jacket=part('flightJacket');
  sphere(jacket,[.235,.33,.155],[0,1.12,0],m.coat);
  box(jacket,[.34,.19,.24],[0,.86,0],m.coat);
  box(jacket,[.32,.055,.28],[0,.83,0],m.boot);
  box(jacket,[.07,.065,.02],[0,.83,.151],m.metal);
  box(jacket,[.016,.48,.018],[0,1.14,.153],m.metal);
  for(const s of [-1,1]){
   const collar=box(jacket,[.105,.11,.03],[s*.075,1.39,.13],m.shirt);collar.rotation.z=s*.35;
   box(jacket,[.11,.13,.025],[s*.115,1.19,.145],m.coat);
   box(jacket,[.125,.025,.03],[s*.115,1.25,.16],m.shirt);
   box(jacket,[.12,.1,.025],[s*.105,.94,.143],m.coat);
  }
  if(pilot||naval){
   for(const s of [-1,1])sphere(jacket,[.09,.22,.065],[s*.13,1.16,.19],m.vest);
   box(jacket,[.20,.07,.035],[0,.97,.205],m.web);
   for(const s of [-1,1]){const strap=box(jacket,[.035,.59,.035],[s*.12,1.10,.265],m.web);strap.rotation.z=s*.17;box(jacket,[.062,.075,.022],[s*.13,1.04,.29],m.metal);}
  }
  batch(THREE,jacket);
  const neck=part('neck');sphere(neck,[.065,.075,.065],[0,1.46,0],m.skin);batch(THREE,neck);
  const seat=part('seatHarness');
  if(pilot)for(const side of [-1,1]){const strap=box(seat,[.025,.20,.035],[side*.075,.80,.13],m.web);strap.rotation.z=side*.35;}batch(THREE,seat);
  const face=part('face');sphere(face,[.135,.175,.12],[0,1.64,.015],m.skin);
  sphere(face,[.036,.045,.047],[0,1.63,.132],m.skin);
  for(const s of [-1,1]){sphere(face,[.028,.055,.032],[s*.135,1.64,.015],m.skin);box(face,[.018,.013,.015],[s*.047,1.68,.125],m.boot);}
  box(face,[.045,.011,.012],[0,1.575,.125],m.boot);batch(THREE,face);
  const helmet=part('helmet');
  sphere(helmet,[.148,.115,.135],[0,1.735,0],pilot?m.leather:m.coat);
  if(pilot)for(const s of [-1,1]){sphere(helmet,[.042,.075,.055],[s*.145,1.65,0],m.leather);box(helmet,[.022,.15,.021],[s*.095,1.57,.09],m.web);}
  else box(helmet,[.26,.028,.21],[0,1.73,.08],m.coat);
  batch(THREE,helmet);
  const goggles=part('goggles');
  if(pilot){for(const s of [-1,1]){sphere(goggles,[.064,.046,.035],[s*.065,1.69,.14],m.metal);sphere(goggles,[.047,.029,.018],[s*.065,1.69,.17],m.glass);}box(goggles,[.025,.018,.022],[0,1.69,.175],m.boot);}
  batch(THREE,goggles);
  const pack=part('parachutePack');
  if(pilot){box(pack,[.34,.40,.16],[0,1.08,-.20],m.web);for(const y of [.97,1.20])box(pack,[.36,.025,.025],[0,y,-.29],m.boot);batch(THREE,pack);}
  const arms=[],legs=[];
  for(const s of [-1,1]){
   const arm=part(s<0?'leftArm':'rightArm');arm.position.set(s*.235,1.39,0);
   sphere(arm,[.083,.18,.082],[s*.035,-.16,0],m.coat);
   sphere(arm,[.070,.17,.070],[s*.055,-.43,.035],m.coat);
   box(arm,[.14,.04,.15],[s*.055,-.565,.035],m.boot);
   sphere(arm,[.062,.08,.055],[s*.055,-.63,.045],pilot?m.boot:m.skin);
   if(chute)arm.rotation.z=s*2.45;
   batch(THREE,arm);arms.push(arm);
   const leg=part(s<0?'leftLeg':'rightLeg');leg.position.set(s*.11,.82,0);
   sphere(leg,[.105,.23,.11],[0,-.22,0],m.pants);sphere(leg,[.08,.20,.09],[s*.025,-.56,.02],m.pants);
   box(leg,[.065,.14,.025],[s*.09,-.29,.045],m.web);batch(THREE,leg);legs.push(leg);
   const boot=part(s<0?'leftBoot':'rightBoot',leg);box(boot,[.17,.18,.27],[s*.025,-.71,.07],m.boot);box(boot,[.18,.035,.29],[s*.025,-.795,.075],m.sole);
   for(let i=0;i<3;i++)box(boot,[.075,.012,.012],[s*.025,-.65-i*.03,.204],m.web);batch(THREE,boot);
   // Boots are children of articulated legs and remain available by name.
  }
  figure.userData.arms=arms;figure.userData.legs=legs;
  return figure;
 }
 root.CrewVisuals={create,palettes,batch};if(typeof module==='object'&&module.exports)module.exports=root.CrewVisuals;
})(typeof window==='undefined'?globalThis:window);
