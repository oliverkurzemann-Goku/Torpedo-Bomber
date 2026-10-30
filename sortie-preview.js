/* Selected aircraft only. Same GLBs and native rigs as the game; render on change,
 * never run the game/terrain loop in the mission planner. */
(function(root){
 'use strict';
 const T=root.THREE;
 const assets={p47:'assets/aircraft/p47-independent.glb',bf109:'assets/aircraft/bf109f2-own.glb',fw190:'assets/aircraft/fw190a8-own.glb',ju87:'assets/aircraft/ju87b2-own.glb',me262:'assets/aircraft/me262-noel.glb',me163:'assets/aircraft/me163b-own.glb',avenger:'grumman tbm avenger.glb',sbd:'assets/aircraft/sbd-dauntless.glb',corsair:'assets/aircraft/corsair-f4u1d-own.glb',zero:'zero.glb'};
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
 function loadout(display,c){
  const frame=display.userData.frame,group=display.userData.stores,s=root.CustomSortie.stores(c),ac=c.ac;
  for(const child of [...group.children]){group.remove(child);dispose(child);}
  if(ac==='corsair'){root.CorsairRig.update(frame,{gear:1,...s});return;}
  if(ac==='sbd')root.SBDRig.update(frame,{gear:1,bombs:s.bombs});
  if(ac==='avenger')root.AvengerBay.pose(frame.userData.bay,0,s.torpedoes);
  function store(kind,x,y,z,scale){const o=root.Ordnance.create(kind);o.traverse(n=>{if(n.geometry)n.geometry=n.geometry.clone();if(n.material)n.material=n.material.clone();});o.rotation.y=ac==='avenger'?Math.PI:0;o.position.set(x,y,z);o.scale.setScalar(scale);o.userData.previewStore=kind;group.add(o);}
  // Game loadout visualisation. The Avenger's one torpedo stays inside its closed bay.
  if(s.bombs){const count=ac==='sbd'?s.bombs-1:s.bombs;
   for(let i=0;i<count;i++){const single=count===1,x=single?0:(i%2?-1:1)*(ac==='avenger'?2.3:ac==='sbd'?2.15:2.2+Math.floor(i/2)*.8);store('bomb',x,ac==='sbd'?-.9:-1,0,ac==='avenger'?.65:.8);}}
  for(let i=0;i<s.rockets;i++)store('rocket',(i%2?-1:1)*(2.3+Math.floor(i/2)*.38),-.75,.3,.7);
  if(s.tank){const tank=new T.Mesh(new T.SphereGeometry(1,20,12),new T.MeshStandardMaterial({color:0xa3a49c,roughness:.55,metalness:.35}));tank.name='previewDropTank';tank.scale.set(.31,.29,1.25);tank.position.set(0,-1.05,0);group.add(tank);}
 }
 function create({host,status,reset,closer,further,retry}){
  let renderer,scene,camera,model,current=null,pending=0,frameRequest=0,failed=false,yaw=.7,pitch=.28,zoom=1,fit=20;const pointers=new Map();let pinch=0;
  function message(text,busy=false){status.textContent=text;host.setAttribute('aria-busy',String(busy));}
  function render(){frameRequest=0;if(!renderer||!model||document.hidden)return;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
   camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
   fit=7/Math.tan(camera.fov*Math.PI/360)/Math.min(1.4,camera.aspect);const d=fit*zoom;
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
   if(!force&&old?.ac===c.ac&&model?.userData.ac===c.ac&&model.visible){loadout(model,c);draw();return;}
   const token=++pending;model&&(model.visible=false);message('Loading '+root.CustomSortie.planes[c.ac].name+'…',true);retry.hidden=true;
   if(failed&&!force||!init()){message('3D preview unavailable. Your mission can still launch.');retry.hidden=false;return;}
   if(force&&failed){renderer.dispose();renderer.domElement.remove();renderer=null;failed=false;if(!init())return;}
   try{const gl=await new Promise((ok,no)=>new T.GLTFLoader().load(assets[c.ac],ok,undefined,no));
    if(token!==pending){dispose(gl.scene);return;}const next=prepare(gl.scene,c.ac);loadout(next,current);if(model){scene.remove(model);dispose(model);}model=next;model.visible=true;scene.add(model);yaw=.7;pitch=.28;zoom=1;
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
 root.SortiePreview={assets,prepare,loadout,dispose,create};
})(typeof window==='undefined'?globalThis:window);
