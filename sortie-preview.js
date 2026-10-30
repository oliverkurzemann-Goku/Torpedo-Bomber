/* Selected aircraft only. Same GLBs and native rigs as the game; render on change,
 * never run the game/terrain loop in the mission planner. */
(function(root){
 'use strict';
 const T=root.THREE;
 const assets={p47:'assets/aircraft/p47-independent.glb',bf109:'assets/aircraft/bf109f2-own.glb',fw190:'assets/aircraft/fw190a8-own.glb',ju87:'assets/aircraft/ju87b2-own.glb',me262:'assets/aircraft/me262-noel.glb',me163:'assets/aircraft/me163b-own.glb',avenger:'grumman tbm avenger.glb',sbd:'assets/aircraft/sbd-dauntless.glb',corsair:'assets/aircraft/corsair-f4u1d-own.glb?v=229.1',zero:'zero.glb'};
 function dispose(model){const geo=new Set(),mat=new Set(),textures=new Set();model?.traverse(o=>{if(o.geometry)geo.add(o.geometry);for(const m of [].concat(o.material||[])){mat.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
 function prepare(model,ac){
  const frame=new T.Group();frame.name='previewAircraft';
  // The two legacy Pacific imports retain the game's exact alignment/scale.
  if(ac==='avenger'||ac==='zero'){
   if(ac==='zero')root.ZeroCanopy.apply(model);
   const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3());
   model.position.sub(b.getCenter(new T.Vector3()));model.scale.setScalar((ac==='avenger'?14:11)/Math.max(size.x,size.y,size.z));
   const holder=new T.Group();holder.add(model);frame.add(holder);
   if(ac==='avenger'){holder.rotation.y=-Math.PI/2;frame.updateMatrixWorld(true);root.AvengerBay.install(holder,frame);frame.rotation.y=Math.PI;frame.userData.bay=holder;}
  }else{
   frame.add(model);root.AircraftArticulation.install(frame,ac);
  }
  frame.traverse(o=>{if(!o.isMesh)return;
   const materials=[].concat(o.material).map(m=>{
    if(!m.isGLTFSpecularGlossinessMaterial)return m;
    return new T.MeshStandardMaterial({name:m.name,map:m.map||null,color:m.color.clone(),transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,side:m.side,depthWrite:m.depthWrite,roughness:.65,metalness:.05});
   });o.material=Array.isArray(o.material)?materials:materials[0];
   for(const m of materials){if(m.map)m.map.encoding=T.sRGBEncoding;if(m.transparent){m.depthWrite=false;o.renderOrder=2;}}
  });
  frame.updateMatrixWorld(true);const b=new T.Box3().setFromObject(frame),center=b.getCenter(new T.Vector3());
  const display=new T.Group();display.add(frame);frame.position.sub(center);display.userData.frame=frame;display.userData.ac=ac;display.userData.center=center;display.userData.stores=new T.Group();frame.add(display.userData.stores);return display;
 }
 // Model-space hardpoints, in metres: X span, Y up, +Z forward.
 // These are NOT a shared grid: each installation follows its own wing/belly.
 // The Corsair and Dauntless centre bomb use their authored GLB mount points.
 function hardpoints(ac,s){
  const out=[];
  const put=(kind,x,y,z,scale,roofY)=>out.push({kind,x,y,z,scale,roofY});
  const pair=(kind,x,y,z,scale,roofY)=>{put(kind,-x,y,z,scale,roofY);put(kind,x,y,z,scale,roofY);};
  if(s.bombs){
   if(ac==='p47')pair('bomb',2.35,-1.13,1.05,.78,-.53);
   else if(ac==='bf109')put('bomb',0,-1.20,.45,.68,-.72);
   else if(ac==='fw190')put('bomb',0,-1.27,.55,.73,-.82);
   else if(ac==='ju87'){
    // Four small SC 50 wing bombs, not four full-size centreline bombs.
    pair('bomb',2.32,-.90,.72,.34,-.50);
    pair('bomb',3.14,-1.02,.72,.34,-.60);
   }else if(ac==='me262')pair('bomb',.88,-.16,1.16,.75,.17);
   else if(ac==='sbd'&&s.bombs>1){
    // The large centreline bomb is already part of the native SBD rig.
    pair('bomb',2.48,-1.53,.70,.36,-1.16);
   }
   // TBM: both bombs stay INSIDE the internal bomb bay.
  }
  if(ac==='p47'&&s.rockets)for(const side of [-1,1])for(let i=0;i<4;i++)
   put('rocket',side*(3.05+i*.46),-.83,.68,.88,-.55);
  return out;
 }
 // Fit racks to the actual airframe surface, never to a guessed model height.
 // The shared articulation probe decodes quantized GLB vertices and ignores gear,
 // flaps and propellers. Build its CPU proxies once per aircraft, then free them.
 function underside(frame,ac,x,z,fallback){
  if(!frame.userData.previewUndersides){
   const stations=hardpoints(ac,{bombs:4,rockets:8}).map(h=>[h.x,h.z]);
   stations.push([0,.3]);
   const probes=root.AircraftArticulation.meshes(frame,frame),values={};
   try{
    for(const [px,pz] of stations){
     const key=px.toFixed(3)+':'+pz.toFixed(3);
     if(Object.prototype.hasOwnProperty.call(values,key))continue;
     // Swept/tapered wings are not rectangular. If a station lies over an
     // aileron gap or beyond the local trailing edge, move it fore/aft to
     // the nearest actual wing skin instead of inventing a surface height.
     let hit=null,contactZ=pz;
     const offsets=[0,.20,-.20,.40,-.40,.60,-.60,.80,-.80,1,-1,1.20,-1.20,1.40,-1.40,1.60,-1.60];
     for(const dz of offsets){
      const z=pz+dz;
      const candidate=root.AircraftArticulation.probe(frame,probes,px,z);
      if(candidate){hit=candidate;contactZ=z;break;}
     }
     values[key]=hit?{y:hit.local.y,z:contactZ,mesh:hit.object.name||'skin'}:null;
    }
   }finally{
    const materials=new Set();
    for(const proxy of probes){proxy.geometry.dispose();for(const mat of [].concat(proxy.material||[]))materials.add(mat);}
    materials.forEach(m=>m.dispose());
   }
   frame.userData.previewUndersides=values;
  }
  const found=frame.userData.previewUndersides[x.toFixed(3)+':'+z.toFixed(3)];
  return found?{...found,measured:true}:{y:fallback,mesh:'fallback',measured:false};
 }
 function loadout(display,c){
  const frame=display.userData.frame,group=display.userData.stores,s=root.CustomSortie.stores(c),ac=c.ac;
  for(const child of [...group.children]){group.remove(child);dispose(child);}
  if(ac==='corsair'){root.CorsairRig.update(frame,{gear:1,...s});return;}
  if(ac==='sbd')root.SBDRig.update(frame,{gear:1,bombs:s.bombs});
  function store(kind,x,y,z,scale,parent=group){
   const o=root.Ordnance.create(kind);
   // Shared Ordnance templates must not be disposed when changing aircraft.
   o.traverse(n=>{if(n.geometry)n.geometry=n.geometry.clone();if(n.material)n.material=n.material.clone();});
   o.position.set(x,y,z);o.scale.setScalar(scale);o.userData.previewStore=kind;parent.add(o);
   return o;
  }
  if(ac==='avenger'){
   const holder=frame.userData.bay,bay=holder.getObjectByName('avengerBombBay');
   if(!bay)throw Error('Avenger internal bay missing');
   const old=bay.getObjectByName('previewInternalBombs');
   if(old){bay.remove(old);dispose(old);}
   if(s.bombs){
    const rack=new T.Group();rack.name='previewInternalBombs';bay.add(rack);
    // The TBM bay is 0.96 m wide, so these are compact, paired internal bombs.
    for(const x of [-.225,.225]){const bomb=store('bomb',x,-.66,-.78,.52,rack);bomb.rotation.y=Math.PI;}
   }
   // Open only in the selection viewer to inspect the internal payload.
   // In flight, AvengerBay controls the doors and normally keeps them closed.
   root.AvengerBay.pose(holder,(s.bombs||s.torpedoes)?.72:0,s.torpedoes);
   return;
  }
  const report=[];
  for(const h of hardpoints(ac,s)){
   const skin=underside(frame,ac,h.x,h.z,h.roofY);
   const radius=(h.kind==='rocket'?.064:.40)*h.scale;
   const clearance=h.kind==='rocket'?.07:.09;
   const y=skin.y-radius-clearance;
   store(h.kind,h.x,y,skin.z??h.z,h.scale);
   // Rack joins the weapon's upper skin to the aircraft's lower skin.
   const pylon=new T.Mesh(new T.BoxGeometry(h.kind==='rocket'?.055:.10,clearance+.018,h.kind==='rocket'?.32:.30),
    new T.MeshStandardMaterial({color:0x59635e,roughness:.76,metalness:.12}));
   pylon.name='previewPylon';pylon.position.set(h.x,skin.y-clearance/2,skin.z??h.z);group.add(pylon);
   report.push({kind:h.kind,x:h.x,z:skin.z??h.z,requestedZ:h.z,skinY:skin.y,storeY:y,storeTop:y+radius,clearance,measured:skin.measured,mesh:skin.mesh});
  }
  if(s.tank){
   const fallback=ac==='p47'?-.53:ac==='bf109'?-.72:-.82;
   const skin=underside(frame,ac,0,.3,fallback),clearance=.09;
   const tank=new T.Mesh(new T.SphereGeometry(1,20,12),new T.MeshStandardMaterial({color:0xa3a49c,roughness:.55,metalness:.35}));
   tank.name='previewDropTank';tank.scale.set(.31,.29,1.25);
   tank.position.set(0,skin.y-.29-clearance,skin.z??.3);group.add(tank);
   const pylon=new T.Mesh(new T.BoxGeometry(.12,clearance+.018,.42),new T.MeshStandardMaterial({color:0x737e78,roughness:.65}));
   pylon.name='previewTankPylon';pylon.position.set(0,skin.y-clearance/2,skin.z??.3);group.add(pylon);
   report.push({kind:'tank',x:0,z:skin.z??.3,requestedZ:.3,skinY:skin.y,storeY:tank.position.y,storeTop:tank.position.y+.29,clearance,measured:skin.measured,mesh:skin.mesh});
  }
  display.userData.storeFit=report;
 }
 function create({host,status,reset,closer,further,retry}){
  let renderer,scene,camera,model,current=null,pending=0,frameRequest=0,failed=false,yaw=.7,pitch=.28,zoom=1,fit=20;const pointers=new Map();let pinch=0;
  function message(text,busy=false){status.textContent=text;host.setAttribute('aria-busy',String(busy));}
  function render(){frameRequest=0;if(!renderer||!model||document.hidden)return;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
   camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
   fit=9/Math.tan(camera.fov*Math.PI/360)/Math.min(1.4,camera.aspect);const d=fit*zoom;
   camera.position.set(Math.sin(yaw)*Math.cos(pitch)*d,Math.sin(pitch)*d,Math.cos(yaw)*Math.cos(pitch)*d);camera.lookAt(0,0,0);renderer.render(scene,camera);
  }
  const draw=()=>{if(!frameRequest)frameRequest=requestAnimationFrame(render);};
  function init(){if(renderer)return true;try{
   renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
   renderer.domElement.setAttribute('aria-hidden','true');host.prepend(renderer.domElement);scene=new T.Scene();camera=new T.PerspectiveCamera(35,1,.1,180);
   scene.add(new T.HemisphereLight(0xe8f1ff,0x595848,1.5));const sun=new T.DirectionalLight(0xffe8c6,2.1);sun.position.set(-12,18,14);scene.add(sun);const rim=new T.DirectionalLight(0xc4dbff,.9);rim.position.set(10,4,-12);scene.add(rim);
   renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;renderer.domElement.hidden=true;message('3D preview unavailable. Your mission can still launch.');retry.hidden=false;});return true;
  }catch(e){failed=true;message('3D preview unavailable. Your mission can still launch.');return false;}}
  async function update(input,force=false){const c=root.CustomSortie.normalize(input),old=current;current=c;
   if(!force&&old?.ac===c.ac&&model?.userData.ac===c.ac&&model.visible){loadout(model,c);host.dataset.mountReport=JSON.stringify(model.userData.storeFit||[]);draw();return;}
   const token=++pending;model&&(model.visible=false);message('Loading '+root.CustomSortie.planes[c.ac].name+'…',true);retry.hidden=true;
   if(failed&&!force||!init()){message('3D preview unavailable. Your mission can still launch.');retry.hidden=false;return;}
   if(force&&failed){renderer.dispose();renderer.domElement.remove();renderer=null;failed=false;if(!init())return;}
   try{const gl=await new Promise((ok,no)=>new T.GLTFLoader().load(assets[c.ac],ok,undefined,no));
    if(token!==pending){dispose(gl.scene);return;}const next=prepare(gl.scene,c.ac);loadout(next,current);host.dataset.mountReport=JSON.stringify(next.userData.storeFit||[]);if(model){scene.remove(model);dispose(model);}model=next;model.visible=true;scene.add(model);yaw=.7;pitch=.28;zoom=1;
    host.dataset.aircraft=c.ac;host.dataset.source=assets[c.ac];message(root.CustomSortie.planes[c.ac].name);draw();
   }catch(e){if(token!==pending)return;message('Preview could not load. Your mission can still launch.');retry.hidden=false;console.warn('Aircraft preview:',e);}
  }
  function changeZoom(amount){zoom=Math.max(.62,Math.min(1.9,zoom*amount));draw();}
  reset.onclick=()=>{yaw=.7;pitch=.28;zoom=1;draw();};closer.onclick=()=>changeZoom(.85);further.onclick=()=>changeZoom(1.18);retry.onclick=()=>update(current,true);
  host.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;host.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=0;});
  host.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch&&distance)changeZoom(pinch/distance);pinch=distance;}
   else {yaw-=dx*.009;pitch=Math.max(-.5,Math.min(1.2,pitch+dy*.008));draw();}});
  const up=e=>{pointers.delete(e.pointerId);pinch=0;};for(const event of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(event,up);
  host.addEventListener('wheel',e=>{e.preventDefault();changeZoom(Math.exp(e.deltaY*.001));},{passive:false});
  host.addEventListener('keydown',e=>{if(e.target!==host)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')reset.click();else if(e.key==='+')changeZoom(.85);else if(e.key==='-')changeZoom(1.18);else{yaw+=(e.key==='ArrowLeft'?.15:e.key==='ArrowRight'?-.15:0);pitch=Math.max(-.5,Math.min(1.2,pitch+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0)));draw();}}});
  const resize=new ResizeObserver(draw);resize.observe(host);document.addEventListener('visibilitychange',()=>{pointers.clear();if(!document.hidden)draw();});
  return {update};
 }
 root.SortiePreview={assets,prepare,hardpoints,loadout,dispose,create};
 if(typeof module==='object'&&module.exports)module.exports=root.SortiePreview;
})(typeof window==='undefined'?globalThis:window);
