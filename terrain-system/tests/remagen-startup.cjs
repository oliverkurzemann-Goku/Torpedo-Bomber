// Startup integration: real scene/weather, terrain pipeline and shipped data; GPU/model downloads omitted.
// NODE_PATH=/path/to/dependencies node terrain-system/tests/remagen-startup.cjs
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const THREE=require('three'),{createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const elements=new Map(),listeners={},requests=[],errors=[];
function node(){const classes=new Set(['hidden']);return {style:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},addEventListener(){},appendChild(){},querySelectorAll(){return []},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}},value:'clear',innerHTML:'',textContent:''};}
const renderer=class{constructor(){this.domElement=node();}setPixelRatio(){}setSize(){}render(){}};
const c=vm.createContext({THREE:{...THREE,WebGLRenderer:renderer},console:{...console,error:(...args)=>errors.push(args)},Math,atob,performance:{now:()=>0},navigator:{},location:{search:'?campaign=1'},URLSearchParams,devicePixelRatio:1,
 localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},requestAnimationFrame(){},innerWidth:1280,innerHeight:800,
 addEventListener(event,cb){listeners[event]=cb;},document:{addEventListener(){},querySelectorAll(){return []},getElementById(id){if(!elements.has(id))elements.set(id,id==='opsMap'?createCanvas(720,420):node());return elements.get(id);},createElement(t){return t==='canvas'?createCanvas(1,1):node();},body:node()},
 fetch:async url=>{requests.push(url);const b=fs.readFileSync(path.join(root,url.split('?')[0]));return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});c.window=c;
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 const src=m[0].match(/src="([^"]+)"/);
 if(src){if(!src[1].startsWith('https:'))vm.runInContext(fs.readFileSync(path.join(root,src[1].split('?')[0]),'utf8'),c,{filename:src[1]});}
 else vm.runInContext(m[1],c,{filename:'remagen-mission.html'});
}
vm.runInContext('loadModels=()=>{};WorldVehicles.prototype.load=async()=>{};',c);
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
