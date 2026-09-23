/* Touch-first, standalone scenery viewer. Does not read game saves. */
(async function(){
'use strict';
const el=id=>document.getElementById(id),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
try{
 if(typeof THREE==='undefined'||typeof OkinawaWorld==='undefined')throw Error('The 3D library could not load. Please reload with an internet connection.');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,1,65000);
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.domElement.id='viewport';renderer.domElement.setAttribute('aria-label','Interactive Okinawa scenery');renderer.domElement.tabIndex=0;document.body.prepend(renderer.domElement);
 scene.fog=new THREE.FogExp2(0xa7bfc0,.000065);
 const hemi=new THREE.HemisphereLight(0xc8dfeb,0x686142,.8);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xfff3d7,2.05);sun.position.set(-4800,7200,4600);scene.add(sun);
 const world=await new OkinawaWorld(window.OKINAWA_DATA).build((p,msg)=>{el('loadBar').style.width=Math.round(p*100)+'%';el('loadText').textContent=msg;});scene.add(world.root);
 const state={yaw:0,pitch:0,fly:false,t:0,view:'coast',keys:{},ui:true,frames:0,seconds:0,fps:0};
 const presets={coast:{pos:[-6290,340,-1960],aim:[-3800,30,-4250]},cape:{pos:[-6010,225,-6820],aim:[-4450,20,-5440]},inland:{pos:[-3390,200,-2090],aim:[-1900,55,-2990]}};
 function orient(){camera.rotation.set(state.pitch,state.yaw,0,'YXZ');}
 function setView(name){state.view=name;const p=presets[name];camera.position.fromArray(p.pos);camera.lookAt(new THREE.Vector3(...p.aim));const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');state.yaw=e.y;state.pitch=e.x;state.fly=false;syncFly();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));}
 const route=new THREE.CatmullRomCurve3([new THREE.Vector3(-6500,320,500),new THREE.Vector3(-6500,280,-2700),new THREE.Vector3(-5700,240,-6100),new THREE.Vector3(-3400,350,-6100),new THREE.Vector3(-2000,400,-3900),new THREE.Vector3(-2300,310,-1200),new THREE.Vector3(-4500,300,1600)],true,'catmullrom',.3);
 function syncFly(){el('fly').textContent=state.fly?'Pause flyover':'Start flyover';el('fly').setAttribute('aria-pressed',String(state.fly));}
 let flyBlend=0,flyStart=new THREE.Vector3(),flyQ=new THREE.Quaternion();
 el('fly').onclick=()=>{state.fly=!state.fly;if(state.fly){let best=Infinity,bestT=0;for(let i=0;i<250;i++){const t=i/250,d=route.getPointAt(t).distanceToSquared(camera.position);if(d<best){best=d;bestT=t;}}state.t=bestT;flyBlend=0;flyStart.copy(camera.position);flyQ.copy(camera.quaternion);}else{const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');state.pitch=e.x;state.yaw=e.y;}syncFly();};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
 el('light').onchange=()=>{const warm=el('light').value==='warm';world.setLight(warm);sun.color.set(warm?0xffcf91:0xfff3d7);sun.intensity=warm?1.8:2.05;hemi.intensity=warm?.68:.8;scene.fog.color.set(warm?0xbfb59c:0xa7bfc0);renderer.toneMappingExposure=warm?1.08:1.12;};
 el('info').onclick=()=>{el('about').hidden=!el('about').hidden;el('info').setAttribute('aria-expanded',String(!el('about').hidden));};
 function showUI(show){document.body.classList.toggle('clean',!show);state.ui=show;}
 el('clean').onclick=()=>showUI(false);el('showUI').onclick=()=>showUI(true);
 const held={up:false,down:false};for(const id of ['up','down']){const b=el(id);b.onpointerdown=e=>{held[id]=true;b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>held[id]=false;}
 const pointers=new Map();let pinch=0;
 function manual(){if(state.fly){state.fly=false;const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');state.pitch=e.x;state.yaw=e.y;syncFly();}}
 function moveForward(amount){camera.position.x-=Math.sin(state.yaw)*amount;camera.position.z-=Math.cos(state.yaw)*amount;}
 const viewport=renderer.domElement;
 viewport.onpointerdown=e=>{manual();viewport.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=0;};
 viewport.onpointermove=e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){state.yaw-=dx*.003;state.pitch=clamp(state.pitch-dy*.0025,-1.35,1.2);orient();}else{const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch)moveForward((d-pinch)*4);pinch=d;}};
 viewport.onpointerup=viewport.onpointercancel=viewport.onlostpointercapture=e=>{pointers.delete(e.pointerId);pinch=0;};
 viewport.onwheel=e=>{e.preventDefault();manual();moveForward(-e.deltaY*1.1);};viewport.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
 window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();state.keys[e.code]=true;if(e.code==='Escape')showUI(true);if(e.code==='Space'&&!e.repeat)el('fly').click();});
 window.addEventListener('keyup',e=>state.keys[e.code]=false);window.addEventListener('blur',()=>{state.keys={};pointers.clear();held.up=held.down=false;});
 viewport.addEventListener('webglcontextlost',e=>{e.preventDefault();el('loading').classList.remove('done');el('loadText').textContent='Graphics paused by the device. Reload to resume.';running=false;});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 el('export').onclick=async()=>{el('export').disabled=true;el('exportStatus').textContent='Preparing the terrain model…';try{await new Promise(r=>setTimeout(r,30));const blob=exportTerrain(world),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Okinawa-Yomitan-terrain.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);el('exportStatus').textContent='Terrain exported. Vegetation and animated water remain in the reusable scene module.';}catch(e){el('exportStatus').textContent=e.message;}finally{el('export').disabled=false;}};
 setView('coast');el('loading').classList.add('done');
 const map=el('map'),mc=map.getContext('2d');
 function drawMap(){mc.clearRect(0,0,280,280);mc.save();mc.beginPath();mc.arc(140,140,140,0,Math.PI*2);mc.clip();mc.fillStyle='#175363';mc.fillRect(0,0,280,280);for(let j=0;j<140;j++)for(let i=0;i<140;i++){const x=i/139*16000-8000,z=j/139*16000-8000;if(world.shoreDistance(x,z)>0){mc.fillStyle='#788368';mc.fillRect(i*2,j*2,2,2);}}mc.strokeStyle='#f6edd0';mc.lineWidth=2;const x=(camera.position.x+8000)/16000*280,y=(camera.position.z+8000)/16000*280;mc.translate(x,y);mc.rotate(-state.yaw);mc.beginPath();mc.moveTo(0,-9);mc.lineTo(5,7);mc.lineTo(0,4);mc.lineTo(-5,7);mc.closePath();mc.fillStyle='#fff1bc';mc.fill();mc.restore();mc.fillStyle='#f4f1e6';mc.font='16px system-ui';mc.fillText('N',134,23);}
 let last=performance.now(),running=true,mapTimer=0;const routeLen=route.getLength(),lookCam=new THREE.PerspectiveCamera();
 function frame(now){if(!running)return;requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden)return;world.update(dt);
  if(state.fly){state.t=(state.t+dt*88/routeLen)%1;flyBlend=Math.min(1,flyBlend+dt*.35);const q=route.getPointAt(state.t),ahead=route.getPointAt((state.t+.012)%1);q.y=Math.max(q.y,world.getHeight(q.x,q.z)+90);ahead.y-=30;lookCam.position.copy(q);lookCam.lookAt(ahead);const k=flyBlend*flyBlend*(3-2*flyBlend);camera.position.lerpVectors(flyStart,q,k);camera.quaternion.slerpQuaternions(flyQ,lookCam.quaternion,k);const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');state.yaw=e.y;state.pitch=e.x;
  }else{const k=state.keys,speed=(k.ShiftLeft?420:140)*dt;if(k.KeyW||k.ArrowUp)moveForward(speed);if(k.KeyS||k.ArrowDown)moveForward(-speed);const side=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);camera.position.x+=Math.cos(state.yaw)*side*speed;camera.position.z-=Math.sin(state.yaw)*side*speed;if(held.up||k.KeyE)camera.position.y+=90*dt;if(held.down||k.KeyQ)camera.position.y-=90*dt;
   camera.position.x=clamp(camera.position.x,-7650,7650);camera.position.z=clamp(camera.position.z,-7650,7650);camera.position.y=clamp(camera.position.y,Math.max(8,world.getHeight(camera.position.x,camera.position.z)+6),2200);
  }
  renderer.render(scene,camera);mapTimer+=dt;if(mapTimer>.45){drawMap();mapTimer=0;el('stats').textContent='BUILD 1 · '+Math.round(camera.position.y)+' m';}
 }
 drawMap();requestAnimationFrame(frame);
 // Read-only diagnostics surfaced by the viewer for regression tests.
 window.okinawaDiagnostics=()=>({build:1,tiles:world.terrain.children.length,instances:world.objectCount,houses:world.houses,position:camera.position.toArray(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fly:state.fly});
}catch(e){console.error(e);el('loadText').textContent=e.message;el('loadText').style.maxWidth='80%';el('loadText').style.lineHeight='1.7';}

function exportTerrain(world){
 // Plain glTF 2.0 with one shared embedded texture. The animated ocean is an engine effect.
 const gltf={asset:{version:'2.0',generator:'Okinawa terrain build 1',copyright:'See okinawa/README.md'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],materials:[{name:'Okinawa ground',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],images:[]};
 const parts=[];let offset=0;
 function append(bytes,target){const a=new Uint8Array(bytes.buffer||bytes,bytes.byteOffset||0,bytes.byteLength);const view={buffer:0,byteOffset:offset,byteLength:a.length};if(target)view.target=target;const id=gltf.bufferViews.push(view)-1;parts.push({offset,bytes:a});offset+=(a.length+3)&~3;return id;}
 function accessor(attr,type,target,minMax){const arr=attr.array,id=gltf.accessors.length,a={bufferView:append(arr,target),componentType:arr instanceof Float32Array?5126:arr instanceof Uint32Array?5125:5123,count:attr.count,type};if(minMax){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<attr.count;i++)for(let j=0;j<3;j++){a.min[j]=Math.min(a.min[j],arr[i*3+j]);a.max[j]=Math.max(a.max[j],arr[i*3+j]);}}gltf.accessors.push(a);return id;}
 for(const mesh of world.terrain.children){const g=mesh.geometry,uv=g.attributes.uv.clone();for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));const primitive={attributes:{POSITION:accessor(g.attributes.position,'VEC3',34962,true),NORMAL:accessor(g.attributes.normal,'VEC3',34962),TEXCOORD_0:accessor(uv,'VEC2',34962)},indices:accessor(g.index,'SCALAR',34963),material:0};gltf.scenes[0].nodes.push(gltf.nodes.length);gltf.nodes.push({mesh:gltf.meshes.length,name:mesh.name});gltf.meshes.push({primitives:[primitive]});}
 const png=Uint8Array.from(atob(world.groundCanvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));gltf.images.push({bufferView:append(png),mimeType:'image/png'});gltf.buffers.push({byteLength:offset});const json=new TextEncoder().encode(JSON.stringify(gltf)),jl=(json.length+3)&~3,total=12+8+jl+8+offset,out=new Uint8Array(total),dv=new DataView(out.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);dv.setUint32(12,jl,true);dv.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jl);out.set(json,20);dv.setUint32(20+jl,offset,true);dv.setUint32(24+jl,0x004e4942,true);for(const p of parts)out.set(p.bytes,28+jl+p.offset);return new Blob([out],{type:'model/gltf-binary'});
}
})();
