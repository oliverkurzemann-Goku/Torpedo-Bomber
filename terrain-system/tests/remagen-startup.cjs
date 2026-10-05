// Startup integration: real scene/weather, terrain pipeline and shipped data; GPU/model downloads omitted.
// NODE_PATH=/path/to/dependencies node terrain-system/tests/remagen-startup.cjs
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const THREE=require('three'),{createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const elements=new Map(),listeners={},requests=[],errors=[];
function node(){const classes=new Set(['hidden']),attributes={};return {style:{},setAttribute(k,v){attributes[k]=v},getAttribute(k){return attributes[k]},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},addEventListener(){},appendChild(){},querySelectorAll(){return []},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}},value:'clear',innerHTML:'',textContent:''};}
const renderer=class{constructor(){this.domElement=node();}setPixelRatio(){}setSize(){}getContext(){return {isContextLost:()=>false};}render(){}};
const c=vm.createContext({THREE:{...THREE,WebGLRenderer:renderer},console:{...console,error:(...args)=>errors.push(args)},Math,atob,performance:{now:()=>0},navigator:{},location:{search:'?campaign=1'},URLSearchParams,devicePixelRatio:1,
 localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},requestAnimationFrame(){},innerWidth:1280,innerHeight:800,
 addEventListener(event,cb){listeners[event]=cb;},document:{addEventListener(){},querySelectorAll(){return []},getElementById(id){if(!elements.has(id))elements.set(id,id==='opsMap'?createCanvas(720,420):node());return elements.get(id);},createElement(t){return t==='canvas'?createCanvas(1,1):node();},body:node()},
 fetch:async url=>{requests.push(url);const b=fs.readFileSync(path.join(root,url.split('?')[0]));return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});c.window=c;
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 const src=m[0].match(/src="([^"]+)"/);
 if(src){if(!src[1].startsWith('https:'))vm.runInContext(fs.readFileSync(path.join(root,src[1].split('?')[0]),'utf8'),c,{filename:src[1]});}
 else vm.runInContext(m[1],c,{filename:'remagen-mission.html'});
}
vm.runInContext('loadModels=()=>{};ensureModel=async()=>null;WorldVehicles.prototype.load=async()=>{};',c);
(async()=>{
 listeners.load();
 for(let i=0;i<100&&c.document.getElementById('menu').classList.contains('hidden')&&!errors.length;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(errors.length,0,errors.map(a=>a.join(' ')).join('\n'));
 assert(!c.document.getElementById('menu').classList.contains('hidden'),'startup must reach the mission menu');
 assert(c.document.getElementById('loading').classList.contains('hidden'),'loading overlay must close');
 assert.equal(requests.filter(u=>/dem\/\d+_\d+\.bin/.test(u)).length,56,'all DEM tiles requested');
 // Use the actual prepared water network and loaded terrain, including the
 // apron/huts: moving a runway inland must not put it in a village or stream.
 vm.runInContext(`{
   const footprint=[[ALLIED_AF_X+AF_CLEAR_X0,ALLIED_AF_Z+AF_CLEAR_Z0],
     [ALLIED_AF_X+AF_CLEAR_X1,ALLIED_AF_Z+AF_CLEAR_Z0],
     [ALLIED_AF_X+AF_CLEAR_X1,ALLIED_AF_Z+AF_CLEAR_Z1],
     [ALLIED_AF_X+AF_CLEAR_X0,ALLIED_AF_Z+AF_CLEAR_Z1]];
   if(osmWaterOverlaps(footprint,2,osmMgr.waterIndex))throw Error('Inland field overlaps real water');
   let low=Infinity,high=-Infinity;
   for(let x=-RWY_LEN/2;x<=RWY_LEN/2;x+=10)for(let z=-RWY_W/2;z<=RWY_W/2;z+=10){
     const y=terrain.getHeight(ALLIED_AF_X+x,ALLIED_AF_Z+z);low=Math.min(low,y);high=Math.max(high,y);
   }
   if(high-low>6)throw Error('New runway is too steep: '+(high-low));
   const boxes=[];
   for(const [key,data] of osmMgr.sourceTiles){
     const [tx,tz]=key.split(',').map(Number);
     for(const b of data.buildings||[]){
       const r=Math.hypot(b.w,b.d)/2,x=tx*RTILE+b.x,z=tz*RTILE+b.z;
       if(x+r<footprint[0][0]||x-r>footprint[1][0]||z+r<footprint[0][1]||z-r>footprint[2][1])continue;
       const ring=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,c])=>{
         const dx=a*b.w/2,dz=c*b.d/2;return [x+Math.cos(b.rotY)*dx+Math.sin(b.rotY)*dz,z-Math.sin(b.rotY)*dx+Math.cos(b.rotY)*dz];
       });boxes.push({tx:0,tz:0,data:{lakes:[ring]}});
     }
   }
   if(osmWaterOverlaps(footprint,2,makeOSMWaterIndex(boxes,RTILE)))throw Error('Field overlaps a mapped building');
   const m=new THREE.Matrix4(),p=new THREE.Vector3();
   for(const tile of osmMgr.tiles.values())for(const mesh of tile.farGroup?.children||[]){
     if(!mesh.isInstancedMesh||!mesh.name.startsWith('osmForest'))continue;
     for(let i=0;i<mesh.count;i++){
       mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);
       if(p.x>footprint[0][0]&&p.x<footprint[1][0]&&p.z>footprint[0][1]&&p.z<footprint[2][1])throw Error('Tree on inland field');
     }
   }
   globalThis.inlandStats={runwayRelief:high-low,runwayEdgeDistance:ALLIED_AF_X-RWY_LEN/2};
 }`,c);
 assert(c.inlandStats.runwayEdgeDistance>=5000,'whole Allied runway has five kilometres of edge clearance');
 vm.runInContext(`for(const kind of Object.keys(FlightOps.weather)){weather=kind;applyWeather();if(!scene.background.isColor)throw Error('Missing sky');}showBrief(2);`,c);
 assert(!c.document.getElementById('brief').classList.contains('hidden'),'first combat briefing opens after terrain loads');
 assert(c.document.getElementById('opsLegend').textContent.length>0,'briefing includes target legend');
 vm.runInContext(`startMission(11);
   const f=flakUnits[0],p=f.group.position;
   P.pos.set(p.x+700,p.y+240,p.z+700);P.heading=0;
   camera.position.copy(P.pos);camera.lookAt(p.x,p.y+11,p.z);camera.updateMatrixWorld(true);
   enemyAir.forEach(e=>e.alive=false);
   updateHUD();
   globalThis.fwStats={mission:M().id,kind:document.getElementById('navKind').textContent,
     bearing:document.getElementById('compassText').textContent};`,c);
 assert.equal(c.fwStats.mission,'jabo');
 assert(!html.includes('id="flakMarker"'),'flak should be visible in the world, without a floating label');
 assert.match(c.fwStats.bearing,/BRG/);
 vm.runInContext(`enemyAir.push({alive:true,pos:new THREE.Vector3(P.pos.x+1000,P.pos.y,P.pos.z),bomber:false});updateHUD();`,c);
 assert.equal(c.document.getElementById('navKind').textContent,'BANDIT','the moving fighter must override the ground target');
 assert.match(c.document.getElementById('navArrow').style.transform,/rotate\(-90deg\)/,'fighter due east is left in the northbound chase camera (see navigation.js)');
 vm.runInContext(`enemyAir[enemyAir.length-1].alive=false;updateHUD();`,c);
 assert.notEqual(c.document.getElementById('navKind').textContent,'BANDIT','destroyed fighter must no longer guide the arrow');
 // Actual mission initialization, weapon UI and release routines must agree.
 const loadouts=vm.runInContext(`MISSIONS.map((m,i)=>{
   showBrief(i);const brief=document.getElementById('brText').innerHTML;
   startMission(i);
   const initial={id:m.id,ac:P.ac,bombs:P.bombs,rockets:P.rockets,ammo:P.ammo,
     field:[AF_X,AF_Z],position:P.pos.toArray(),heading:P.heading,
     drop:document.getElementById('dropBtn').style.display,arm:document.getElementById('armBtn').style.display,brief};
   if(!P.bombs&&!P.rockets){const count=bombs.length;dropBomb();if(bombs.length!==count)throw Error('Unarmed mission released ordnance');}
   return initial;
 })`,c);
 for(const l of loadouts){
  if(l.ac==='p47'){
   assert.deepEqual(Array.from(l.field),[6000,15800],l.id+' uses the inland Allied field');
   assert(l.position[0]>5000&&Math.sin(l.heading)>.99,l.id+' departs east with safe edge clearance');
  }
  if(l.ac==='me163'){
   const [x,,z]=l.position;
   assert(Math.min(x,28000-x,z,32000-z)>5000,l.id+' trolley release is well inside the terrain');
   assert(Math.sin(l.heading)<0&&Math.cos(l.heading)<0,l.id+' faces southwest, toward the bomber sector');
  }
  const airOnly=['circ','fighter','boxes','libs','jetstrike','jetboxes','komet','jetambush','kometdash'].includes(l.id);
  if(airOnly){assert.equal(l.bombs,0,l.id);assert.equal(l.rockets,0,l.id);assert.equal(l.drop,'none');assert.equal(l.arm,'none');assert.match(l.brief,/ARMAMENT<\/b> Guns(?:<br|$)/);}
  else{assert(l.bombs>0,l.id+' ground attack/practice must retain bombs');assert.notEqual(l.drop,'none');}
  assert(l.ammo>0,l.id+' retains guns');
 }
 assert.equal(loadouts.find(l=>l.id==='jetjabo').bombs,2,'Me 262 bridge strike carries its two bombs');
 assert.equal(loadouts.find(l=>l.id==='final').rockets,8,'mixed ground/air P-47 sortie keeps its rockets');
 // Both synchronous initialization errors and rejected terrain loads surface on the loading panel.
 vm.runInContext("const realInit=init;init=()=>{throw new Error('test renderer failure');};",c);
 listeners.load();
 assert.match(c.document.getElementById('loadingText').textContent,/test renderer failure/);
 vm.runInContext("init=realInit;loadRealWorld=async()=>{throw new Error('test terrain failure');};",c);
 listeners.load();await new Promise(r=>setTimeout(r,0));
 assert.match(c.document.getElementById('loadingText').textContent,/test terrain failure/);
 assert(c.document.getElementById('menu').classList.contains('hidden'));
 assert(!c.document.getElementById('loading').classList.contains('hidden'));
 console.log('Thunderbolt startup: real weather, 56 terrain tiles, mission menu and briefing OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
