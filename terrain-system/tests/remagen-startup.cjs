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
   const initial={id:m.id,bombs:P.bombs,rockets:P.rockets,ammo:P.ammo,
     drop:document.getElementById('dropBtn').style.display,arm:document.getElementById('armBtn').style.display,brief};
   if(!P.bombs&&!P.rockets){const count=bombs.length;dropBomb();if(bombs.length!==count)throw Error('Unarmed mission released ordnance');}
   return initial;
 })`,c);
 for(const l of loadouts){
  const airOnly=['circ','fighter','boxes','libs','jetstrike','jetboxes','komet'].includes(l.id);
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
