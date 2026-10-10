/* Small shared safeguards for the two active games. No app wrapper or backend. */
(function(global){
 'use strict';
 const memory=new Map(),removed=new Set();
 // Bounded diagnostics: inspect GameRuntime.frames.report() in a live sortie.
 // CPU phases and uncapped frame intervals are separate; neither is an iPad benchmark.
 class FrameMeter{
  constructor(now=()=>global.performance.now()){
   this.now=now;this.names=['world','flight','combat','effects','render'];this.size=240;
   this.times=this.names.map(()=>new Float32Array(this.size));this.intervals=new Float32Array(this.size);
   this.index=0;this.count=0;this.last=0;this.start=0;
  }
  begin(dt){this.start=this.last=this.now();this.intervals[this.index]=dt*1000;for(const a of this.times)a[this.index]=0;}
  mark(name){const n=this.now(),i=this.names.indexOf(name);if(i>=0)this.times[i][this.index]+=n-this.last;this.last=n;}
  end(){this.mark('render');this.count=Math.min(this.size,this.count+1);this.index=(this.index+1)%this.size;}
  reset(){this.index=this.count=0;}
  report(){
   const stats=a=>{const v=Array.from(a.slice(0,this.count)).sort((a,b)=>a-b);return {median:v[Math.floor(v.length*.5)]||0,p95:v[Math.min(v.length-1,Math.floor(v.length*.95))]||0,max:v[v.length-1]||0};};
   return {samples:this.count,interval:stats(this.intervals),cpu:Object.fromEntries(this.names.map((n,i)=>[n,stats(this.times[i])]))};
  }
 }
 const frames=new FrameMeter();
 function setHTML(node,value){if(node&&node.innerHTML!==String(value))node.innerHTML=value;}
 const storage={
  getItem(key){
   if(removed.has(key))return null;
   if(memory.has(key))return memory.get(key);
   try{return global.localStorage.getItem(key);}catch(_){return null;}
  },
  setItem(key,value){
   value=String(value);memory.set(key,value);removed.delete(key);
   try{global.localStorage.setItem(key,value);}catch(_){}
  },
  removeItem(key){
   memory.delete(key);removed.add(key);
   try{global.localStorage.removeItem(key);}catch(_){}
  }
 };
 // Only newly allocated transient resources may be owned. GLB clones, pooled
 // particles, shared tracer geometry and their textures are never auto-disposed.
 function own(object,options={}){
  object.userData.runtimeOwned={geometry:options.geometry??!!object.isMesh,
   material:options.material??true};
  return object;
 }
 function release(object){
  if(!object)return;
  if(object.parent)object.parent.remove(object);
  if(typeof object.userData.runtimeRecycle==='function'){
   object.userData.runtimeRecycle(object);return;
  }
  const geometries=new Set(),materials=new Set();
  object.traverse(o=>{
   const ownership=o.userData.runtimeOwned;if(!ownership)return;
   if(ownership.geometry&&o.geometry)geometries.add(o.geometry);
   if(ownership.material)for(const m of [].concat(o.material||[]))if(m)materials.add(m);
   delete o.userData.runtimeOwned;
  });
  for(const g of geometries)g.dispose();
  for(const m of materials)m.dispose();
 }
 function segmentDistance(start,end,point){
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
  const length=dx*dx+dy*dy+dz*dz;
  const t=length?Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy+(point.z-start.z)*dz)/length)):0;
  return Math.hypot(start.x+dx*t-point.x,start.y+dy*t-point.y,start.z+dz*t-point.z);
 }
 // Both campaigns use the whole touch circle, with a quiet centre for level flight.
 function stickInput(rect,clientX,clientY,invertPitch=false){
  let x=(clientX-rect.left-rect.width/2)/(rect.width/2);
  let y=(clientY-rect.top-rect.height/2)/(rect.height/2);
  const radius=Math.hypot(x,y);
  if(radius>.08){
   const travel=(Math.min(1,radius)-.08)/.92;
   const response=travel*(.7+.3*travel*travel);
   x=x/radius*response;y=y/radius*response;
  }else{x=0;y=0;}
  return {roll:x===0?0:-x,pitch:y===0?0:(invertPitch?y:-y),knobX:x*36,knobY:y*36};
 }
 // Preserve the existing 60-Hz appearance, while avoiding blade symmetry
 // aliasing at low frame rates. Never change the aircraft physics here.
 function rotorStep(dt,stepAt60,blades=3){
  return Math.min(Math.PI/blades*.9,Math.max(0,dt)*60*stepAt60);
 }
 function render(renderer,scene,camera){
  const gl=renderer.getContext();
  if(gl.isContextLost())return false;
  try{renderer.render(scene,camera);return true;}
  catch(error){
   // r128 calls .trim() on null shader logs if loss occurs during compilation,
   // before the browser dispatches webglcontextlost. The loss handler recovers.
   if(gl.isContextLost())return false;
   throw error; // Do not conceal unrelated shader or application bugs.
  }
 }
 class HintCoach{
  constructor(){this.elapsed=0;this.next=6;this.seen=new Set();}
  tick(dt,s,notify){
   this.elapsed+=dt;
   if(!s.enabled||!s.alive||s.busy||this.elapsed<this.next)return;
   const rules=[
    ['damage',s.hull<30&&s.agl>120,'CRITICAL DAMAGE — BAIL OUT IS AVAILABLE IF YOU CANNOT LAND.'],
    ['recovery',s.rtb&&s.homeDistance<2200,'RECOVERY — '+s.recovery],
    ['dive',s.dive&&s.pitch<-.3&&s.agl>180&&!s.diveBrake,'EXTEND DIVE BRAKES BEFORE THE ATTACK.'],
    ['torpedo',s.torpedo&&s.ordnance>0&&s.targetDistance<1500&&s.altitude>s.dropAltitude,'TORPEDO ATTACK — DESCEND, LEVEL THE WINGS AND CHECK THE DROP LIMITS.'],
    ['gear',!s.fixedGear&&!s.gearLocked&&!s.rtb&&s.agl>100&&s.gear>.7&&s.homeDistance>500,'AIRBORNE — RETRACT THE GEAR TO REDUCE DRAG.'],
    ['start',s.onGround&&s.speed<10,'TAKE-OFF — ADD THROTTLE, KEEP STRAIGHT AND PULL BACK GENTLY.']
   ];
   for(const [id,ready,message] of rules)if(ready&&!this.seen.has(id)){
    notify('FLIGHT TIP: '+message);this.seen.add(id);this.next=this.elapsed+20;return message;
   }
  }
 }
 function attachLifecycle({canvas,pause,resetControls,onRestore}){
  const session={graphicsLost:false};
  const doc=global.document;
  const interrupt=reason=>{resetControls();pause(reason);};
  global.addEventListener('blur',()=>interrupt('Window inactive — tap Resume when ready.'));
  global.addEventListener('pagehide',()=>interrupt('Game left in background — sortie paused.'));
  doc.addEventListener('visibilitychange',()=>{
   if(doc.hidden)interrupt('Game left in background — tap Resume when ready.');
  });
  let notice=null;
  canvas.addEventListener('webglcontextlost',event=>{
   event.preventDefault();session.graphicsLost=true;
   interrupt('Graphics interrupted — waiting for recovery.');
   if(!notice){
    notice=doc.createElement('div');notice.id='graphicsRecovery';
    notice.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(15,20,15,.95);color:#e8ddbc;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:16px system-ui';
    notice.innerHTML='<div><h2>Graphics interrupted</h2><p>The sortie is held while the graphics recover.</p><p>If this screen stays here, reload the game.</p><button type="button" style="padding:12px 24px;font:inherit">Reload game</button></div>';
    notice.querySelector('button').onclick=()=>global.location.reload();doc.body.appendChild(notice);
   }
   notice.hidden=false;notice.style.display='flex';
  });
  canvas.addEventListener('webglcontextrestored',()=>{
   session.graphicsLost=false;
   if(notice){notice.hidden=true;notice.style.display='none';}
   // Three.js rebuilds its GPU state; the player explicitly resumes the sortie.
   resetControls();onRestore();
  });
  return session;
 }
 global.GameRuntime={storage,own,release,segmentDistance,stickInput,rotorStep,render,HintCoach,attachLifecycle,FrameMeter,frames,setHTML};
})(typeof window!=='undefined'?window:globalThis);
