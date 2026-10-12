/* Model-space mechanical rigs. Every frame is span X, up Y, nose +Z.
 * Original GLB files and airframe indices are never edited by this module. */
(function(global){
 'use strict';
 const T=global.THREE,clamp=n=>Math.max(0,Math.min(1,n));
 const profiles={
  p47:{mainX:2.40,mainZ:1.99,leg:1.10,radius:.44,tailZ:-4.81,flapSpan:[1.45,3.30],wingZ:[-.6,3.2],wingY:-.45,chord:.64,flapAngle:.70},
  bf109:{mainX:.58,mainZ:.915,leg:.80,radius:.32,down:.63,fold:'out',tailZ:-3.85,flapSpan:[.86,2.48],wingZ:[.15,2.4],wingY:-.63,chord:.43,flapAngle:.70},
  fw190:{mainX:1.95,mainZ:1.60,leg:.99,radius:.34,down:-.17,tailZ:-3.83,flapSpan:[1.05,2.95],wingZ:[.0,2.7],wingY:-.76,chord:.50,flapAngle:.96},
  me262:{mainX:1.52,mainZ:.62,leg:1.20,radius:.34,nose:true,smallZ:4.33,smallLeg:1.32,flapSpan:[1.12,3.65],wingZ:[-.65,2.0],wingY:-.68,chord:.50,flapAngle:.70},
  ju87:{fixed:true,flapSpan:[1.60,4.90],wingZ:[-.2,3.0],wingY:-.18,chord:.57,flapAngle:.72,externalFlap:true},
  me163:{skid:true,flapSpan:[1.1,2.85],wingZ:[-1.6,1.4],wingY:-.22,chord:.64,flapAngle:.80,midChord:true},
  avenger:{mainX:1.65,mainZ:2.45,leg:1.02,radius:.40,tailZ:-3.7,flapSpan:[1.05,3.60],wingZ:[-1.1,3.2],wingY:-.55,chord:.70,flapAngle:.73},
  sbd:{mainX:2.05,mainZ:1.55,leg:.82,radius:.34,tailZ:-3.62,flapSpan:[1.2,3.25],wingZ:[-1.2,2.6],wingY:-1.06,chord:.56,flapAngle:.76},
  corsair:{mainX:2.05,mainZ:1.68,leg:1.10,radius:.39,fold:'aft',twist:true,tailZ:-4.36,flapSpan:[1.30,3.65],wingZ:[-.7,3.2],wingY:-1.30,chord:.67,flapAngle:.76},
  zero:{mainX:1.92,mainZ:1.65,leg:.68,radius:.29,tailZ:-3.38,flapSpan:[1.02,2.85],wingZ:[-1.4,3.0],wingY:-.46,chord:.52,flapAngle:.70},
  b17:{mainX:3.3,mainZ:4.75,leg:1.95,radius:.69,fold:'aft',tailZ:-10.3,smallLeg:.6,flapSpan:[2.0,8.7],wingZ:[.5,7.0],wingY:-.45,chord:1.05,flapAngle:.70},
  b24:{mainX:4.1,mainZ:1.4,leg:2.3,radius:.64,nose:true,smallZ:8.3,smallLeg:1.75,flapSpan:[2.0,9.6],wingZ:[-.6,4.3],wingY:.10,chord:.88,flapAngle:.70}
 };
 function meshes(skin,frame){
  const result=[];skin.updateMatrixWorld(true);frame.updateMatrixWorld(true);
  const rayMaterial=new T.MeshBasicMaterial({side:T.DoubleSide});
  skin.traverse(o=>{
   if(!o.isMesh||!o.geometry?.attributes.position)return;
   for(let p=o;p;p=p.parent)if(p===frame&&frame!==skin||p.userData.articulationPart||/^(gear|zeroGear|sbdGear|prop|sbdRotor|diveBrake)/i.test(p.name))return;
   if(o.visible===false||o.userData.groundWheel)return;
   // r128's raycaster reads quantized Int16 attributes without normalization.
   // CPU-only decoded proxies preserve the GLB and its shared renderer buffers.
   const geometry=new T.BufferGeometry();
   for(const name of ['position','uv']){
    const attr=o.geometry.attributes[name];if(!attr)continue;
    const data=new Float32Array(attr.count*attr.itemSize),array=attr.array||attr.data?.array;
    const divisor=attr.normalized?(array instanceof Int16Array?32767:array instanceof Uint16Array?65535:array instanceof Int8Array?127:255):1;
    for(let i=0;i<attr.count;i++)for(let k=0;k<attr.itemSize;k++)data[i*attr.itemSize+k]=(k===0?attr.getX(i):k===1?attr.getY(i):attr.getZ(i))/divisor;
    geometry.setAttribute(name,new T.BufferAttribute(data,attr.itemSize));
   }
   geometry.setIndex(o.geometry.index);geometry.groups=o.geometry.groups.map(g=>({...g}));geometry.setDrawRange(o.geometry.drawRange.start,o.geometry.drawRange.count);geometry.computeBoundingSphere();
   const proxy=new T.Mesh(geometry,Array.isArray(o.material)?o.material.map(()=>rayMaterial):rayMaterial);
   proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(o.matrixWorld);proxy.userData.source=o;result.push(proxy);
  });return result;
 }
 function probe(frame,list,x,z,guess=null,closest=false){
  const a=frame.localToWorld(new T.Vector3(x,20,z)),b=frame.localToWorld(new T.Vector3(x,-20,z));
  const ray=new T.Raycaster(a,b.sub(a).normalize());
  const hits=ray.intersectObjects(list,false).map(hit=>({...hit,object:hit.object.userData.source,local:frame.worldToLocal(hit.point.clone())}));
  const good=guess==null?hits:hits.filter(h=>Math.abs(h.local.y-guess)<.65);
  return good.sort(closest?(a,b)=>Math.abs(a.local.y-guess)-Math.abs(b.local.y-guess):(a,b)=>a.local.y-b.local.y)[0]||null;
 }
 function strut(a,b,r,material){
  const delta=b.clone().sub(a),mesh=new T.Mesh(new T.CylinderGeometry(r,r*1.04,delta.length(),8),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return mesh;
 }
 function wheel(radius,width,materials){
  const group=new T.Group();group.name='wheelAxle';group.userData.wheelRadius=radius;
  const tyre=new T.Mesh(new T.TorusGeometry(radius-width*.40,width*.40,8,24),materials.tyre);
  tyre.name='roundedTyre';tyre.rotation.y=Math.PI/2;tyre.userData.groundWheel=true;group.add(tyre);
  const hub=new T.Mesh(new T.CylinderGeometry(radius*.48,radius*.48,width*.9,14),materials.metal);hub.rotation.z=Math.PI/2;group.add(hub);
  for(const sign of [-1,1]){const cap=new T.Mesh(new T.CylinderGeometry(radius*.23,radius*.28,.02,10),materials.piston);cap.rotation.z=Math.PI/2;cap.position.x=sign*width*.48;group.add(cap);}
  return group;
 }
 function buildGear(frame,kind,name,list){
  const p=profiles[kind],old=frame.getObjectByName(name);
  // Keep the already verified P47 rig and the Ju87's original fixed fairings.
  if(kind==='p47'||p.fixed)return old;
  if(old)old.parent.remove(old);
  const gear=new T.Group();gear.name=name;gear.userData.articulationPart=true;gear.userData.articulationKind=kind;
  const materials={metal:new T.MeshStandardMaterial({color:0x69726d,roughness:.48,metalness:.48}),
   piston:new T.MeshStandardMaterial({color:0xbfc5c7,roughness:.25,metalness:.72}),tyre:new T.MeshLambertMaterial({color:0x171a18})};
  if(p.skid){
   const hinge=new T.Group();hinge.name='landingSkid';hinge.position.set(0,-.65,.35);
   const runner=new T.Mesh(new T.BoxGeometry(.29,.12,2.15),materials.metal);runner.position.y=-.36;hinge.add(runner);
   for(const z of [-.48,.62])hinge.add(strut(new T.Vector3(0,.08,z),new T.Vector3(0,-.36,z),.045,materials.piston));
   gear.add(hinge);frame.add(gear);return gear;
  }
  const skin=[-1,1].map(side=>probe(frame,list,side*p.mainX,p.mainZ,kind==='sbd'?p.wingY:null,kind==='sbd'));
  const anchor=skin.every(Boolean)?(skin[0].local.y+skin[1].local.y)/2:p.wingY;
  for(const side of [-1,1]){
   const hinge=new T.Group();hinge.name=side<0?'mainGearLeft':'mainGearRight';hinge.position.set(side*p.mainX,anchor+.06,p.mainZ);
   hinge.userData.gearSide=side;hinge.userData.downAngle=side*(p.down||.035);hinge.userData.fold=p.fold||'in';
   hinge.add(strut(new T.Vector3(0,.06,0),new T.Vector3(0,-p.leg*.62,.035),.07,materials.metal));
   hinge.add(strut(new T.Vector3(0,-p.leg*.47,.035),new T.Vector3(0,-p.leg,.06),.046,materials.piston));
   hinge.add(strut(new T.Vector3(-side*.18,.03,-.19),new T.Vector3(0,-p.leg*.82,.06),.033,materials.metal));
   hinge.add(strut(new T.Vector3(0,-p.leg*.58,.07),new T.Vector3(0,-p.leg*.73,.19),.024,materials.metal));
   hinge.add(strut(new T.Vector3(0,-p.leg*.73,.19),new T.Vector3(0,-p.leg*.90,.07),.024,materials.metal));
   const axle=wheel(p.radius,p.radius*.58,materials);axle.position.set(0,-p.leg,.06);hinge.add(axle);
   const door=new T.Mesh(new T.BoxGeometry(p.radius*1.10,p.leg*.63,.035),materials.metal);door.name='legDoor';door.position.set(-side*.08,-p.leg*.39,.02);hinge.add(door);
   gear.add(hinge);
  }
  const z=p.nose?p.smallZ:p.tailZ,hit=probe(frame,list,0,z);
  const small=new T.Group();small.name=p.nose?'noseGear':'tailGear';small.userData.smallGear=true;
  small.position.set(0,(hit?.local.y??anchor)+.04,z);
  const radius=p.nose?p.radius*.65:p.radius*.40;
  const leg=p.nose?Math.max(.32,small.position.y-(anchor+.06)+p.leg+p.radius-radius):(p.smallLeg||.32);
  small.add(strut(new T.Vector3(0,.05,.04),new T.Vector3(0,-leg,-.05),.037,materials.metal));
  const axle=wheel(radius,radius*.68,materials);axle.position.set(0,-leg,-.05);small.add(axle);gear.add(small);frame.add(gear);return gear;
 }
 function buildFlaps(frame,kind,list){
  const p=profiles[kind],flaps=new T.Group();flaps.name='flightFlaps';flaps.userData.articulationPart=true;
  for(const side of [-1,1]){
   const sections=[];
   for(let i=0;i<=6;i++){
    const x=side*(p.flapSpan[0]+(p.flapSpan[1]-p.flapSpan[0])*i/6);
    let trailing=null;
    for(let z=p.wingZ[0];z<=p.wingZ[1];z+=.06){const hit=probe(frame,list,x,z,p.wingY);if(hit){trailing={z,hit};break;}}
    if(!trailing)continue;
    const back=trailing.z+(p.midChord?p.chord*.7:.055),front=back+p.chord;
    const a=probe(frame,list,x,front,p.wingY),b=probe(frame,list,x,back,p.wingY);
    if(!a||!b)continue;
    sections.push({a:a.local,b:b.local,au:a.uv?.clone()||new T.Vector2(),bu:b.uv?.clone()||new T.Vector2(),material:Array.isArray(a.object.material)?a.object.material[a.face.materialIndex||0]:a.object.material});
   }
   if(sections.length<3){console.warn('Flap skin fit unavailable:',kind,side);continue;}
   const middle=sections[Math.floor(sections.length/2)],pivot=middle.a.clone();pivot.y-=.012;
   const hinge=new T.Group();hinge.name=side<0?'flapLeft':'flapRight';hinge.position.copy(pivot);hinge.userData.flapSide=side;hinge.userData.flapSign=-1;
   const xyz=[],uv=[];
   const put=(point,tex)=>{xyz.push(point.x-pivot.x,point.y-pivot.y-.015,point.z-pivot.z);uv.push(tex.x,tex.y);};
   for(let i=0;i<sections.length-1;i++){
    const a=sections[i],b=sections[i+1];put(a.a,a.au);put(a.b,a.bu);put(b.a,b.au);put(b.a,b.au);put(a.b,a.bu);put(b.b,b.bu);
   }
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(xyz,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
   const material=middle.material.clone();material.side=T.DoubleSide;material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;
   const panel=new T.Mesh(geometry,material);panel.name='texturedFlapSkin';panel.castShadow=true;hinge.add(panel);
   // Readable hinge/actuator underneath, without cutting static wing skin.
   const actuator=strut(new T.Vector3(0,.01,.02),new T.Vector3(0,-.07,-p.chord*.65),.022,new T.MeshStandardMaterial({color:0x777e79,metalness:.35,roughness:.6}));hinge.add(actuator);
   flaps.add(hinge);
  }
  frame.add(flaps);return flaps;
 }
 function install(frame,kind,{gearName='gear',skin=frame,gear=true,flaps=true}={}){
  if(!profiles[kind])return;
  const list=meshes(skin,frame);
  if(gear)buildGear(frame,kind,gearName,list);
  if(flaps&&!frame.getObjectByName('flightFlaps'))buildFlaps(frame,kind,list);
  const materials=new Set();for(const proxy of list){proxy.geometry.dispose();for(const m of [].concat(proxy.material))materials.add(m);}for(const m of materials)m.dispose();
  frame.userData.articulation={kind,gearName};pose(frame,1,{left:0,right:0});return frame;
 }
 function pose(frame,deployment,flaps={left:0,right:0}){
  const info=frame?.userData.articulation;if(!info)return;
  const p=profiles[info.kind],gear=frame.getObjectByName(info.gearName),g=clamp(deployment);
  if(gear&&info.kind!=='p47'&&!p.fixed){
   gear.visible=g>.005;
   for(const hinge of gear.children){
    if(p.skid){hinge.position.y=-.34-.31*g;continue;}
    const side=hinge.userData.gearSide;
    if(side){
     const axle=hinge.getObjectByName('wheelAxle');axle.rotation.z=-hinge.userData.downAngle*g;
     if(hinge.userData.fold==='aft'){hinge.rotation.x=1.5*(1-g);hinge.rotation.z=hinge.userData.downAngle*g;axle.rotation.y=p.twist?side*Math.PI/2*(1-g):0;}
     else hinge.rotation.z=hinge.userData.downAngle*g+side*(hinge.userData.fold==='out'?1.50:-1.50)*(1-g);
    }else hinge.rotation.x=1.2*(1-g);
   }
   if(gear.userData.deployment!==g){for(let object=frame;object;object=object.parent)delete object.userData.groundSupports;gear.userData.deployment=g;}
  }
  const panels=frame.getObjectByName('flightFlaps');if(panels)for(const hinge of panels.children){
   const amount=clamp(hinge.userData.flapSide<0?flaps.left:flaps.right);
   hinge.rotation.x=-p.flapAngle*amount;hinge.visible=amount>.012;
   if(p.externalFlap)hinge.position.y=hinge.userData.baseY??hinge.position.y;
  }
 }
 global.AircraftArticulation={profiles,install,pose,probe,meshes};
 if(typeof module==='object'&&module.exports)module.exports=global.AircraftArticulation;
})(typeof window==='undefined'?globalThis:window);
