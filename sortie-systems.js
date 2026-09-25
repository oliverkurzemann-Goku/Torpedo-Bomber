/* Shared flight weather, operation clocks and briefing cartography. Three r128. */
(function(global){
'use strict';
const weather={
 clear:{label:'Clear',near:1800,far:11000,base:1800,depth:900,clouds:14,cover:.35,rain:0,gust:.04,color:0xaecfe6,sun:1},
 broken:{label:'Broken cloud',near:1300,far:8500,base:950,depth:700,clouds:28,cover:.6,rain:0,gust:.13,color:0xb4c4cc,sun:.78},
 haze:{label:'Haze',near:700,far:5000,base:1300,depth:650,clouds:24,cover:.5,rain:0,gust:.12,color:0xb7bcb5,sun:.7},
 lowcloud:{label:'Low overcast',near:450,far:3800,base:380,depth:420,clouds:40,cover:.95,rain:.12,gust:.24,color:0x9ba7ac,sun:.45},
 fog:{label:'Valley / sea fog',near:100,far:1500,base:260,depth:280,clouds:32,cover:.85,rain:0,gust:.08,color:0xb0bab9,sun:.48},
 rain:{label:'Rain front',near:350,far:3000,base:620,depth:550,clouds:40,cover:.9,rain:1,gust:.36,color:0x89969f,sun:.4},
 squall:{label:'Heavy showers',near:220,far:2100,base:430,depth:650,clouds:40,cover:1,rain:1.5,gust:.5,color:0x75848e,sun:.32},
 storm:{label:'Thunderstorm',near:160,far:1600,base:480,depth:1100,clouds:40,cover:1,rain:1.8,gust:.65,color:0x677580,sun:.27}
};
const wx=n=>weather[n]||weather.clear;
function clouds(pool,name){
 const w=wx(name);
 pool.forEach((cl,i)=>{
  cl.visible=i<w.clouds;
  cl.position.y=w.base+((i*.61803398875)%1)*w.depth;
  const size=1+w.cover*.55;cl.scale.set(size,1+w.cover*.35,size);
  cl.userData.wxRadius=600*size;cl.userData.wxDepth=230*(1+w.cover*.35);
  cl.children.forEach((p,j)=>{if(!p.material)return;
   p.material.color.setHex(j%3===0?0xc8ced0:w.rain>.5?0x8c969f:0xe0e3e0);
   p.material.opacity=.55+w.cover*.28;
  });
 });
}
function visibility(scene,pool,pos,name,dt,sea){
 const w=wx(name);let inside=0;
 for(const c of pool){if(!c.visible)continue;
  const d=Math.hypot((pos.x-c.position.x)/(c.userData.wxRadius||700),
   (pos.z-c.position.z)/(c.userData.wxRadius||700),
   (pos.y-c.position.y)/(c.userData.wxDepth||260));
  inside=Math.max(inside,Math.max(0,1-d));
 }
 const above=name==='fog'?Math.min(1,Math.max(0,(pos.y-350)/600)):0;
 const far=(w.far+(9500-w.far)*above)*(1-inside*.94),near=Math.min(w.near,far*.18);
 const k=1-Math.exp(-dt*2);
 if(scene.fog){scene.fog.near+=(near-scene.fog.near)*k;scene.fog.far+=(far-scene.fog.far)*k;}
 if(sea&&scene.fog){sea.uFogNear.value=scene.fog.near;sea.uFogFar.value=scene.fog.far;}
 return inside;
}
class Operation{
 constructor(config={}){
  this.config=config;this.elapsed=0;this.fired=new Set();this.failed=false;
  this.reconDone=!config.recon;this.reconHold=0;this.warned=false;
 }
 pending(){return (this.config.events||[]).some((e,i)=>!this.fired.has(i)&&e.required);}
 ready(){return !this.failed&&this.reconDone&&!this.pending();}
 tick(dt,state){
  this.elapsed+=dt;const out=[];
  (this.config.events||[]).forEach((e,i)=>{
   if(this.fired.has(i))return;
   if(e.at!=null&&this.elapsed<e.at)return;
   if(e.kills!=null&&state.kills<e.kills)return;
   if(e.clear&&!state.clear)return;
   this.fired.add(i);out.push(e);
  });
  const r=this.config.recon;
  if(r&&!this.reconDone){
   const p=state.pos,valid=Math.hypot(p.x-r.x,p.z-r.z)<r.radius&&p.y>=r.min&&p.y<=r.max;
   this.reconHold=valid?this.reconHold+dt:Math.max(0,this.reconHold-dt*2);
   if(this.reconHold>=r.seconds){this.reconDone=true;out.push({recon:true,message:'RECON FIX CONFIRMED — CONTINUE THE ATTACK'});}
  }
  const remaining=(this.config.deadline||Infinity)-this.elapsed;
  if(remaining<=60&&!this.warned&&!state.complete){this.warned=true;out.push({message:'ONE MINUTE LEFT IN THE ATTACK WINDOW'});}
  if(remaining<=0&&!state.complete&&!this.failed){this.failed=true;out.push({failed:true,message:'ATTACK WINDOW MISSED — RECOVER YOUR AIRCRAFT'});}
  return out;
 }
 status(){
  if(this.failed)return 'WINDOW MISSED — RTB';
  if(!this.reconDone)return 'RECON '+Math.floor(this.reconHold)+'/'+this.config.recon.seconds+'s';
  if(this.config.deadline){const t=Math.max(0,Math.ceil(this.config.deadline-this.elapsed));return 'WINDOW '+Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
  return this.pending()?'MORE CONTACTS EXPECTED':'RECOVER WHEN TARGETS CLEAR';
 }
}
function briefText(name,config,wind){
 const w=wx(name),r=config.recon;
 return '<br><br><b>WEATHER</b> '+w.label+' · visibility '+(w.far/1000).toFixed(1)+' km · cloud base '+Math.round(w.base*3.281)+' ft MSL'
 +'<br><b>WIND</b> '+(wind<0?'PORT':'STARBOARD')+' crosswind '+Math.round(Math.abs(wind)*1.944)+' kt'
 +(config.deadline?'<br><b>ATTACK WINDOW</b> '+Math.round(config.deadline/60)+' minutes from take-off':'')
 +(r?'<br><b>RECON</b> Cross the blue circle at '+Math.round(r.min*3.281)+'–'+Math.round(r.max*3.281)+' ft MSL for '+r.seconds+' seconds.':'')
 +(config.notes?'<br><b>EXECUTION</b> '+config.notes:'')
 +(config.practice?'<br><b>RECOVERY</b> Landing practice — no timed combat objectives.':'<br><b>RECOVERY</b> Keep fuel and ammunition for the return. Land to complete the sortie.');
}
function drawMap(canvas,opt){
 if(!canvas)return;const g=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 const pts=[opt.base,...opt.targets,...(opt.recon?[opt.recon]:[])];
 const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
 const minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
 const span=Math.max(4200,(maxX-minX)*1.32,(maxZ-minZ)*(W-70)/(H-130)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
 const scale=(W-70)/span,top=32,bottom=H-43,mapH=bottom-top;
 const north=opt.northSign||1;
 const put=p=>[W/2+(p.x-cx)*scale,(top+bottom)/2-(p.z-cz)*scale*north];
 g.fillStyle='#172822';g.fillRect(0,0,W,H);
 if(opt.sample)for(let y=top;y<bottom;y+=4)for(let x=20;x<W-20;x+=4){
  const wx=cx+(x-W/2)/scale,wz=cz-(y-(top+bottom)/2)/scale*north;
  g.fillStyle=opt.sample(wx,wz);g.fillRect(x,y,4,4);
 }
 if(opt.background){g.save();g.beginPath();g.rect(20,top,W-40,mapH);g.clip();opt.background(g,put);g.restore();}
 g.strokeStyle='rgba(200,213,179,.13)';g.lineWidth=1;
 for(let x=20;x<W;x+=60){g.beginPath();g.moveTo(x,top);g.lineTo(x,bottom);g.stroke();}
 for(let y=top;y<bottom;y+=60){g.beginPath();g.moveTo(20,y);g.lineTo(W-20,y);g.stroke();}
 if(opt.lines)opt.lines(g,put);
 const ordered=opt.targets.filter(p=>!p.optional),route=[opt.base,...(opt.recon?[opt.recon]:[]),...ordered,opt.base];
 g.strokeStyle='#e1c878';g.lineWidth=2;g.setLineDash([7,5]);g.beginPath();
 route.forEach((p,i)=>{const q=put(p);i?g.lineTo(...q):g.moveTo(...q);});g.stroke();g.setLineDash([]);
 if(opt.recon){const p=put(opt.recon);g.strokeStyle='#80c9df';g.lineWidth=2;g.beginPath();g.arc(...p,Math.max(8,opt.recon.radius*scale),0,7);g.stroke();}
 for(const [i,t] of opt.targets.entries()){
  const p=put(t);g.fillStyle=t.optional?'#dba774':'#f06a4b';g.beginPath();g.arc(...p,5,0,7);g.fill();
  g.font='bold 13px monospace';g.fillStyle='#fff0cf';g.fillText(String(i+1),p[0]+8,p[1]-6);
 }
 const b=put(opt.base);g.fillStyle='#a1d191';g.fillRect(b[0]-5,b[1]-5,10,10);
 g.font='12px monospace';g.fillStyle='#f2e5c0';g.fillText('BASE',Math.max(20,b[0]-18),Math.min(bottom-2,b[1]+20));
 g.font='bold 14px monospace';g.fillStyle='#e6dbb8';g.fillText('OPERATIONS MAP  /  '+opt.title,20,22);
 g.fillText('N ↑',W-52,22);g.font='11px monospace';g.fillText('RED: TARGETS   AMBER: DEFENCES   BLUE: RECON',20,H-24);
 const km=1000*scale;g.strokeStyle='#eee0b5';g.beginPath();g.moveTo(W-30-km,H-12);g.lineTo(W-30,H-12);g.stroke();g.fillText('1 km',W-60,H-17);
 return opt.targets.map((p,i)=>(i+1)+'. '+p.label+(p.optional?' (optional)':'')).join(' · ');
}
global.FlightOps={weather,wx,clouds,visibility,Operation,briefText,drawMap};
})(typeof window!=='undefined'?window:globalThis);
