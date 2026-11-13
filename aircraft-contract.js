/* Rig contract v1 for replacement aircraft. The model names and hinges its own moving parts,
 * so the game runs no propeller, gear or flap search on it and never cuts its geometry.
 * Frame: metres, X span, +Y up, +Z nose. Specification: app/model-candidates/RIG-CONTRACT.md.
 * Shared by the game (window.AircraftContract) and scripts/check-rig-contract.mjs. */
(function(global){
 'use strict';
 const VERSION=1;
 // 0..1 drives use rig.range [angle at 0, angle at 1]; -1..1 drives use rig.gain (angle at +1).
 const RANGE_DRIVES=['gear','flapLeft','flapRight','canopy','radiator','floatLeft','floatRight'],GAIN_DRIVES=['roll','pitch','yaw'];
 const CLASSES={
  'tailwheel-fighter':{
   parts:{
    Propeller:{drive:'prop'},
    gear:{group:true},
    GearLeft:{drive:'gear',parent:'gear'},GearRight:{drive:'gear',parent:'gear'},TailGear:{drive:'gear',parent:'gear'},
    flightFlaps:{group:true},
    FlapLeft:{drive:'flapLeft',parent:'flightFlaps'},FlapRight:{drive:'flapRight',parent:'flightFlaps'},
    AileronLeft:{drive:'roll'},AileronRight:{drive:'roll'},
    ElevatorLeft:{drive:'pitch'},ElevatorRight:{drive:'pitch'},Rudder:{drive:'yaw'}
   },
   optional:{Canopy:'canopy',GearDoorLeft:'gear',GearDoorRight:'gear',RadiatorFlapLeft:'radiator',RadiatorFlapRight:'radiator'},
   tyres:{GearLeft:1,GearRight:1,TailGear:1},
   muzzles:1,
   budget:{triangles:75000,meshes:48,materials:16,images:8,imageSize:2048,bytes:12*1024*1024}
  },
  // Build 249: light liaison aircraft (Fieseler Fi 156 Storch). Same hinged parts as the fighter class, but the legs are fixed
  // (their gear range is [0,0]), and the model may carry a flexible rear gun that the game aims (an optional yaw drive).
  'tailwheel-light':{
   parts:{
    Propeller:{drive:'prop'},
    gear:{group:true},
    GearLeft:{drive:'gear',parent:'gear'},GearRight:{drive:'gear',parent:'gear'},TailGear:{drive:'gear',parent:'gear'},
    flightFlaps:{group:true},
    FlapLeft:{drive:'flapLeft',parent:'flightFlaps'},FlapRight:{drive:'flapRight',parent:'flightFlaps'},
    AileronLeft:{drive:'roll'},AileronRight:{drive:'roll'},
    ElevatorLeft:{drive:'pitch'},ElevatorRight:{drive:'pitch'},Rudder:{drive:'yaw'}
   },
   optional:{Canopy:'canopy',RearGun:'yaw'},
   // Build 259: the Storch's two wing halves end at the cabin (x = +-0.54), the roof between them is the fuselage's own: from above the wing looked cut in two.
   // The game closes the gap with a strip lofted between the two root sections of the wing mesh itself (same airfoil, same paint, nothing of the model is changed).
   centerSection:{wing:'Wings'},
   tyres:{GearLeft:1,GearRight:1,TailGear:1},
   muzzles:0,   // unarmed airframe: the game places the rear gunner's muzzle itself (storchGunnerPoint)
   budget:{triangles:25000,meshes:40,materials:10,images:4,imageSize:2048,bytes:5*1024*1024}
  },
  // Build 251: twin-engined amphibian flying boat (Consolidated PBY-5A Catalina). Two rotors (PropellerLeft/Right, each unrotated with its shaft on local Z),
  // retractable main legs and nose wheel, wing-tip floats that fold up, blister hatches that open outwards. The gear and float rigs are stored
  // "extended" at 0 (range [0, fold angle]): the game's amounts (1 = down/out) are inverted for the drives in `inverse`.
  'amphibian-twin':{
   parts:{
    PropellerLeft:{drive:'prop'},PropellerRight:{drive:'prop'},
    gear:{group:true},
    GearLeft:{drive:'gear',parent:'gear'},GearRight:{drive:'gear',parent:'gear'},NoseGear:{drive:'gear',parent:'gear'},
    AileronLeft:{drive:'roll'},AileronRight:{drive:'roll'},
    ElevatorLeft:{drive:'pitch'},ElevatorRight:{drive:'pitch'},Rudder:{drive:'yaw'},
    FloatLeft:{drive:'floatLeft'},FloatRight:{drive:'floatRight'}
   },
   optional:{BlisterHatchLeft:'canopy',BlisterHatchRight:'canopy'},
   tyres:{GearLeft:1,GearRight:1,NoseGear:1},
   inverse:['gear','floatLeft','floatRight'],
   // Build 259: the GLB carries no flap parts (the real PBY-5A had none; the game's lever is a decision, Build 257). The game builds two hinged split-flap panels per wing
   // under the trailing edge from these figures, measured on assets/aircraft/pby5a-own.glb (scene frame, water line y=0; both paints share the geometry): the wing is
   // 4.57 m deep (z -1.74..2.83) up to the ailerons at |x| 9.75, its trailing edge runs straight to |x| 6.4 and then sweeps forward to z -1.40; the lower skin is at
   // y 2.90 (z -0.95, |x| <= 6.4) rising to 3.02 at the aileron; its paint is mapped planar (u .410 + .0252 |x|, v .486 + .0262 (-.45 - z); the upper skin uses the same u and v - .125, a blue-grey top over the light-grey underside). Panel hinge z -0.95, the
   // trailing edge of the panel is the wing's. `rest` = the panel's own slope when stowed (hinge to trailing edge along the lower skin), `angle` = deflection at 1.
   flapPanels:{wing:'ParasolWing',hingeZ:-.95,rest:.165,angle:.70,thickness:.035,lift:.02,uv:{u0:.410,du:.0252,v0:.486,dv:.0262,z0:-.45,top:-.125},
    segments:[{x0:2.6,x1:6.4,y0:2.900,y1:2.908,te:[-1.74,-1.74]},{x0:6.4,x1:9.55,y0:2.908,y1:3.013,te:[-1.74,-1.42]}]},
   muzzles:1,
   budget:{triangles:30000,meshes:48,materials:8,images:4,imageSize:2048,bytes:6*1024*1024}
  }
 };
 const MOVING=['GearLeft','GearRight','TailGear','NoseGear','FlapLeft','FlapRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','Canopy','GearDoorLeft','GearDoorRight','RadiatorFlapLeft','RadiatorFlapRight','FloatLeft','FloatRight','BlisterHatchLeft','BlisterHatchRight'];
 const T=()=>global.THREE,cache=new WeakMap(),roots=new WeakMap(),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
 function source(o){
  if(!o?.traverse)return null;if(roots.has(o))return roots.get(o);
  let found=null;o.traverse(n=>{if(!found&&n.userData?.rigContract===VERSION)found=n;});if(found)roots.set(o,found);return found;
 }
 function isContract(o){return !!source(o);}
 function data(o){
  const src=source(o);if(!src)return null;if(cache.has(src))return cache.get(src);
  const spec=CLASSES[src.userData.class];if(!spec)throw Error('Unknown rig class '+src.userData.class);
  const parts={},axis=new (T().Vector3)();
  for(const name of [...Object.keys(spec.parts),...Object.keys(spec.optional)]){
   // install() renames the rotor to the game's 'prop'; clones of an installed template keep that name.
   let node=src.getObjectByName(name);if(!node&&name==='Propeller')src.traverse(n=>{if(!node&&n.userData.rig?.drive==='prop')node=n;});
   if(!node){if(spec.parts[name])throw Error('Contract aircraft lacks '+name);continue;}
   parts[name]=node;
   if(node.userData.rig&&!node.userData.rigRest)node.userData.rigRest=node.quaternion.toArray();
  }
  const muzzles=[];src.traverse(n=>{if(/^Muzzle/.test(n.name))muzzles.push(n);});
  const d={src,spec,parts,muzzles,flaps:[],q:new (T().Quaternion)(),r:new (T().Quaternion)(),axis};collectFlaps(d);cache.set(src,d);return d;
 }
 // Build 259: generated flap panels (see the class spec). Every hinge carries its own numbers in userData, so clones of an installed template need no second install.
 function collectFlaps(d){d.flaps=[];d.src.traverse(n=>{if(n.userData?.flapHinge)d.flaps.push(n);});}
 function panelGeometry(side,len,c0,c1,thick,uvOf){
  const V=T().Vector3,x=side*len,A=[new V(0,0,0),new V(x,0,0),new V(x,0,-c1),new V(0,0,-c0)],B=A.map(a=>new V(a.x,-thick,a.z)),centre=new V();
  for(const p of [...A,...B])centre.add(p);centre.multiplyScalar(1/8);
  const pos=[],nor=[],uv=[];
  const quad=(a,b,c,d,upper)=>{   // outward normal: flip the order when it points to the middle of the slab
   const n=new V().crossVectors(new V().subVectors(b,a),new V().subVectors(c,a)).normalize();
   if(n.dot(new V().add(a).add(b).add(c).add(d).multiplyScalar(.25).sub(centre))<0){[b,d]=[d,b];n.negate();}
   for(const p of [a,b,c,a,c,d]){pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z);const t=uvOf(p,upper);uv.push(t[0],t[1]);}
  };
  quad(A[0],A[1],A[2],A[3],true);quad(B[0],B[1],B[2],B[3]);quad(A[0],A[1],B[1],B[0]);quad(A[3],A[2],B[2],B[3]);quad(A[0],A[3],B[3],B[0]);quad(A[1],A[2],B[2],B[1]);
  const g=new (T().BufferGeometry)();g.setAttribute('position',new (T().Float32BufferAttribute)(pos,3));g.setAttribute('normal',new (T().Float32BufferAttribute)(nor,3));g.setAttribute('uv',new (T().Float32BufferAttribute)(uv,2));return g;
 }
 // Build 259: bridge the gap between the two root sections of a wing mesh. The root section = the vertices at the smallest |x|; the strip joins that airfoil ring to
 // its mirror image, so the profile and the paint of the wing continue across the cabin without a seam. The ring is rebuilt from the positions (the vertices at the
 // leading and trailing edge are duplicated with the normals and UVs of both skins, so the skin of a point is chosen by its normal, not by its place in the list).
 function buildCenterSection(d){
  const spec=d.spec.centerSection;if(!spec||d.src.getObjectByName('wingCenterSection'))return false;
  const wing=d.src.getObjectByName(spec.wing),geo=wing?.geometry,pos=geo?.attributes.position,nor=geo?.attributes.normal,uv=geo?.attributes.uv;if(!pos||!nor||!uv)return false;
  const Tj=T(),v=new Tj.Vector3();wing.updateWorldMatrix(true,false);d.src.updateWorldMatrix(true,false);
  const local=new Tj.Matrix4().multiplyMatrices(new Tj.Matrix4().copy(d.src.matrixWorld).invert(),wing.matrixWorld);
  let root=Infinity;for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(local);if(v.x>0&&v.x<root)root=v.x;}
  if(!(root<2))return false;   // no gap to close
  const points=[];
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(local);if(Math.abs(v.x-root)>.004)continue;
   let p=points.find(q=>Math.abs(q.z-v.z)<.004&&Math.abs(q.y-v.y)<.004);if(!p)points.push(p={z:v.z,y:v.y,recs:[]});p.recs.push({u:uv.getX(i),v:uv.getY(i),ny:nor.getY(i)});}
  if(points.length<8)return false;
  const LE=points.reduce((a,b)=>b.z>a.z?b:a),TE=points.reduce((a,b)=>b.z<a.z?b:a),line=z=>TE.y+(LE.y-TE.y)*(z-TE.z)/(LE.z-TE.z||1);
  const upper=points.filter(p=>p!==LE&&p!==TE&&p.y>line(p.z)).sort((a,b)=>b.z-a.z),lower=points.filter(p=>p!==LE&&p!==TE&&p.y<=line(p.z)).sort((a,b)=>a.z-b.z);
  if(upper.length<3||lower.length<3)return false;
  const loop=[LE,...upper,TE,...lower],n=loop.length,centre={z:loop.reduce((s,p)=>s+p.z,0)/n,y:loop.reduce((s,p)=>s+p.y,0)/n};
  // outward normal of every segment (in the z/y plane, away from the middle of the section) and smooth normals at the ring points
  const seg=[];for(let i=0;i<n;i++){const a=loop[i],b=loop[(i+1)%n];let nz=-(b.y-a.y),ny=b.z-a.z;const len=Math.hypot(nz,ny)||1;nz/=len;ny/=len;
   if(nz*((a.z+b.z)/2-centre.z)+ny*((a.y+b.y)/2-centre.y)<0){nz=-nz;ny=-ny;}seg.push({nz,ny,up:i<=upper.length});}
  const vn=loop.map((p,i)=>{const a=seg[(i+n-1)%n],b=seg[i];let nz=a.nz+b.nz,ny=a.ny+b.ny;const len=Math.hypot(nz,ny)||1;return {nz:nz/len,ny:ny/len};});
  const pick=(p,up)=>p.recs.find(r=>up?r.ny>=0:r.ny<0)||p.recs[0];
  const pos2=[],nor2=[],uv2=[],A=new Tj.Vector3(),B=new Tj.Vector3(),C=new Tj.Vector3();
  const tri=(c,want)=>{   // c = [[x,index,up],...]; wound so that the face normal points out of the section (want = the segment's normal)
   A.set(c[0][0],loop[c[0][1]].y,loop[c[0][1]].z);B.set(c[1][0],loop[c[1][1]].y,loop[c[1][1]].z);C.set(c[2][0],loop[c[2][1]].y,loop[c[2][1]].z);
   const f=new Tj.Vector3().crossVectors(B.clone().sub(A),C.clone().sub(A)),list=f.dot(want)>=0?c:[c[0],c[2],c[1]];
   for(const [x,k,up] of list){const p=loop[k],r=pick(p,up);pos2.push(x,p.y,p.z);nor2.push(0,vn[k].ny,vn[k].nz);uv2.push(r.u,r.v);}
  };
  for(let i=0;i<n;i++){const j=(i+1)%n,up=seg[i].up,want=new Tj.Vector3(0,seg[i].ny,seg[i].nz);
   tri([[-root,i,up],[root,i,up],[root,j,up]],want);tri([[-root,i,up],[root,j,up],[-root,j,up]],want);}
  const g=new Tj.BufferGeometry();g.setAttribute('position',new Tj.Float32BufferAttribute(pos2,3));g.setAttribute('normal',new Tj.Float32BufferAttribute(nor2,3));g.setAttribute('uv',new Tj.Float32BufferAttribute(uv2,2));
  const material=wing.material.clone();material.name='Wing centre section (wing paint)';material.polygonOffset=true;material.polygonOffsetFactor=-2;material.polygonOffsetUnits=-2;
  const mesh=new Tj.Mesh(g,material);mesh.name='wingCenterSection';mesh.castShadow=true;mesh.receiveShadow=true;
  d.src.add(mesh);return true;
 }
 function buildFlaps(d){
  const spec=d.spec.flapPanels;if(!spec||d.parts.FlapLeft||d.src.getObjectByName('flightFlaps'))return false;
  const wing=d.src.getObjectByName(spec.wing),base=wing?.material;if(!base)return false;
  const Tj=T(),group=new Tj.Group(),lift=-d.src.position.y,u=spec.uv;group.name='flightFlaps';group.userData.articulationPart=true;
  const material=base.clone();material.name='Flap panel (wing paint)';
  for(const side of [-1,1])for(const seg of spec.segments){
   const len=seg.x1-seg.x0,c0=spec.hingeZ-seg.te[0],c1=spec.hingeZ-seg.te[1],tilt=Math.atan2(seg.y1-seg.y0,len);
   const tiltGroup=new Tj.Group(),hinge=new Tj.Group();tiltGroup.position.set(side*seg.x0,seg.y0-spec.lift+lift,spec.hingeZ);tiltGroup.rotation.z=side*tilt;
   hinge.userData={flapHinge:true,flapSide:side,flapRest:spec.rest,flapAngle:spec.angle};hinge.rotation.x=spec.rest;hinge.visible=false;
   // paint: the wing's own planar mapping continued over the panel (scene x/z of every corner): the top face takes the upper skin's paint, the rest the underside's
   const mesh=new Tj.Mesh(panelGeometry(side,len,c0,c1,spec.thickness,(p,upper)=>[u.u0+u.du*(seg.x0+Math.abs(p.x)),u.v0+u.dv*(u.z0-(spec.hingeZ+p.z))+(upper?u.top:0)]),material);
   mesh.name='flapPanel'+(side<0?'Left':'Right');mesh.castShadow=true;mesh.userData.articulationPart=true;
   hinge.add(mesh);tiltGroup.add(hinge);group.add(tiltGroup);
  }
  d.src.add(group);collectFlaps(d);return true;
 }
 function turn(d,node,amount){
  const rig=node.userData.rig;if(!rig)return;
  const angle=GAIN_DRIVES.includes(rig.drive)?rig.gain*clamp(amount,-1,1):rig.range[0]+(rig.range[1]-rig.range[0])*clamp(amount);
  d.axis.fromArray(rig.axis).normalize();node.quaternion.fromArray(node.userData.rigRest).multiply(d.q.setFromAxisAngle(d.axis,angle));
 }
 function install(frame){
  const d=data(frame);if(!d)return false;
  // The game spins its rotor with prop.rotation.z; the contract requires the rotor node to be
  // unrotated with its axis on local Z, so that Euler channel is exactly the shaft.
  if(d.parts.Propeller){d.parts.Propeller.name='prop';d.parts.Propeller.userData.articulationPart=true;}
  else for(const k of ['PropellerLeft','PropellerRight'])if(d.parts[k])d.parts[k].userData.articulationPart=true;   // the twin keeps its two named rotors
  d.parts.gear.userData.articulationPart=true;if(d.parts.flightFlaps)d.parts.flightFlaps.userData.articulationPart=true;
  buildFlaps(d);   // Build 259: the amphibian's GLB has no flaps; its class spec generates the hinged panels
  buildCenterSection(d);   // Build 259: the Storch's wing centre section
  frame.userData.nativeContract=true;pose(frame,1,{left:0,right:0});return true;
 }
 function pose(o,gear,flaps={left:0,right:0},extra={}){
  const d=data(o);if(!d)return;const g=clamp(gear);
  for(const name of MOVING){
   const node=d.parts[name],drive=node?.userData.rig?.drive;if(!node||GAIN_DRIVES.includes(drive))continue;
   // extra: floatLeft / floatRight / hatchLeft / hatchRight (or canopy) as 0..1 "out/open" amounts; the drives in spec.inverse are stored extended at 0
   const amount=drive==='gear'?g:drive==='flapLeft'?flaps.left:drive==='flapRight'?flaps.right:name==='BlisterHatchLeft'?(extra.hatchLeft??extra[drive]):name==='BlisterHatchRight'?(extra.hatchRight??extra[drive]):extra[drive];
   turn(d,node,(d.spec.inverse||[]).includes(drive)?1-clamp(amount??1):clamp(amount||0));
  }
  for(const h of d.flaps){   // generated flap panels: hidden until the lever moves, then rest slope - angle x amount (positive x turn lifts the trailing edge: nose is +Z)
   const amount=clamp(h.userData.flapSide<0?flaps.left:flaps.right);h.rotation.x=h.userData.flapRest-h.userData.flapAngle*amount;h.visible=amount>.012;
  }
  d.parts.gear.visible=true;
  if(d.src.userData.contractGear!==g){for(let p=d.src;p;p=p.parent)delete p.userData.groundSupports;d.src.userData.contractGear=g;}
 }
 function controls(o,roll,pitch){
  const d=data(o);if(!d)return;
  // No rudder pedals in these games: the rudder follows the stick's roll axis, as in the native rigs.
  for(const name of ['AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder']){
   const node=d.parts[name];turn(d,node,node.userData.rig.drive==='pitch'?pitch:roll);
  }
 }
 function muzzles(o,space){
  const d=data(o);if(!d)return null;const V=T().Vector3;
  return d.muzzles.map(n=>{n.updateWorldMatrix(true,false);const p=n.getWorldPosition(new V());if(space)space.worldToLocal(p);p.name=n.name;return p;});
 }
 global.AircraftContract={VERSION,CLASSES,RANGE_DRIVES,GAIN_DRIVES,MOVING,isContract,source,install,pose,controls,muzzles};
 if(typeof module==='object'&&module.exports)module.exports=global.AircraftContract;
})(typeof window==='undefined'?globalThis:window);
