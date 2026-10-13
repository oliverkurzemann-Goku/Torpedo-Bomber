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
 // Touch-only, hysteretic render budget. Simulation dt, collision objects,
 // weather visibility, weapons and HTML touch controls are never changed.
 const qualities=new WeakMap();
 const qualityPresets=[{scale:1,effects:1,stride:1,rain:1},{scale:.85,effects:.75,stride:1,rain:.8},
  {scale:.70,effects:.5,stride:2,rain:.6},{scale:.55,effects:.35,stride:3,rain:.4}];
 class AdaptiveQuality{
  constructor(renderer,{enabled=(global.navigator?.maxTouchPoints||0)>0}={}){
   this.renderer=renderer;this.enabled=enabled;this.baseRatio=this.lastRatio=renderer.getPixelRatio();this.tier=0;
   this.buckets=new Map();this.reset();
  }
  reset(){this.warmup=3;this.mean=0;this.bad=0;this.good=0;this.cooldown=0;}
  get budget(){return qualityPresets[this.tier];}
  sample(dt,active=true){
   if(!this.enabled)return;
   const current=this.renderer.getPixelRatio();
   if(current!==this.lastRatio){this.baseRatio=Math.min(this.baseRatio,current);this.lastRatio=current;this.reset();}
   if(!active||!Number.isFinite(dt)||dt>.2){this.reset();return;}
   if(dt<.008)return; // Artificial test loops are not a frame-rate measurement.
   if(this.warmup>0){this.warmup-=dt;return;}
   this.mean=this.mean?this.mean+(dt-this.mean)*(1-Math.exp(-dt/1.5)):dt;
   this.cooldown=Math.max(0,this.cooldown-dt);
   this.bad=this.mean>.026?this.bad+dt:0;
   this.good=this.mean<.019?this.good+dt:0;
   if(!this.cooldown&&this.bad>2&&this.tier<3)this.setTier(this.tier+1);
   else if(!this.cooldown&&this.good>15&&this.tier>0)this.setTier(this.tier-1);
  }
  setTier(tier){
   this.tier=Math.max(0,Math.min(3,Math.round(tier)));this.bad=this.good=0;this.cooldown=8;
   this.renderer.setPixelRatio(Math.min(this.baseRatio,Math.max(Math.min(.75,this.baseRatio),this.baseRatio*this.budget.scale)));
   this.lastRatio=this.renderer.getPixelRatio();
  }
  allow(kind='smoke',critical=false){
   if(critical||!this.enabled||this.tier===0)return true;
   const balance=(this.buckets.get(kind)||0)+this.budget.effects;
   this.buckets.set(kind,balance>=1?balance-1:balance);return balance>=1;
  }
  weather(clouds,rain){
   if(!this.enabled)return;
   // Only decorative puffs, never the fog/LOS-bearing cloud groups.
   for(const c of clouds||[])c.children.forEach((p,i)=>{p.visible=i%this.budget.stride===0;});
   if(rain?.isInstancedMesh)rain.count=Math.ceil(rain.instanceMatrix.count*this.budget.rain);
   else if(rain?.geometry&&rain.userData.dropCount)rain.geometry.setDrawRange(0,Math.ceil(rain.userData.dropCount*this.budget.rain)*2);
  }
  report(){return {enabled:this.enabled,tier:this.tier,pixelRatio:this.renderer.getPixelRatio(),meanMs:this.mean*1000,...this.budget};}
 }
 function createQuality(renderer,options){const q=new AdaptiveQuality(renderer,options);qualities.set(renderer,q);return q;}
 function allowEffect(renderer,kind,critical=false){return qualities.get(renderer)?.allow(kind,critical)??true;}
 function setHTML(node,value){if(node&&node.innerHTML!==String(value))node.innerHTML=value;}
 // A bore-sight at a bounded reference distance, never a target lock or lead
 // solution. Matches the actual parallel muzzle paths, retaining gun dispersion.
 function gunAim(camera,position,quaternion,muzzles,direction,airspeed,roundSpeed){
  const centre=position.clone().set(0,0,0);for(const port of muzzles)centre.add(port);
  centre.multiplyScalar(1/Math.max(1,muzzles.length)).applyQuaternion(quaternion).add(position);
  const range=Math.max(220,Math.min(430,roundSpeed*(.34+Math.max(0,airspeed)*.00075)));
  camera.updateMatrixWorld(true);const point=centre.addScaledVector(direction,range).project(camera);
  return {x:(point.x*.5+.5)*global.innerWidth,y:(-point.y*.5+.5)*global.innerHeight,visible:point.z>=-1&&point.z<=1&&Math.abs(point.x)<1&&Math.abs(point.y)<1,range};
 }
 function showGunAim(element,aim,dt=0){
  if(!element)return;
  element.style.display=aim?.visible?'block':'none';if(!aim?.visible){delete element._gunCue;return;}
  let cue=element._gunCue;
  if(!cue||Math.hypot(aim.x-cue.x,aim.y-cue.y)>160)cue=element._gunCue={x:aim.x,y:aim.y};
  const blend=dt?1-Math.exp(-Math.min(.05,dt)/.065):1;
  cue.x+=(aim.x-cue.x)*blend;cue.y+=(aim.y-cue.y)*blend;
  element.style.left=cue.x+'px';element.style.top=cue.y+'px';
 }
 // A display filter only: bomb release, collision and the predictor stay exact.
 // Transport the cached point with the aircraft between ballistic samples. A
 // stationary world-space cache otherwise sawtooths under a moving chase camera.
 class BombCue{
  constructor(element){
   this.element=element;
   element.innerHTML='<span class="bombPipper">⊕</span><span class="bombCueLabel">BOMB</span>';
   this.label=element.lastElementChild;this.reset();
  }
  reset(){
   this.hit=null;this.sampled=false;this.timer=0;this.origin={x:0,y:0,z:0};this.view=null;
   this.x=this.y=null;this.opacity=0;this.width=this.height=0;
   this.element.hidden=true;this.element.style.opacity='0';this.element.classList.remove('onTarget');
  }
  update(dt,{enabled,position,camera,predict,attack=false,releaseAllowed=false}){
   if(!enabled){this.reset();return;}
   const width=global.innerWidth,height=global.innerHeight,step=Math.max(0,Math.min(.05,dt||0));
   if(width!==this.width||height!==this.height){this.reset();this.width=width;this.height=height;}
   const interval=attack?1/30:.1;
   this.timer=Math.min(this.timer,interval)-step;
   if(!this.sampled||this.timer<=1e-6||dt===0){
    this.hit=predict();this.sampled=true;this.timer=Math.max(this.timer,-interval)+interval;
    Object.assign(this.origin,{x:position.x,y:position.y,z:position.z});
   }
   let targetOpacity=0,ready=false;
   if(this.hit){
    if(!this.view)this.view=this.hit.point.clone();
    this.view.copy(this.hit.point);
    this.view.x+=position.x-this.origin.x;this.view.y+=position.y-this.origin.y;this.view.z+=position.z-this.origin.z;
    camera.updateMatrixWorld(true);this.view.project(camera);
    const p=this.view,x=(p.x*.5+.5)*width,y=(-p.y*.5+.5)*height;
    if(Number.isFinite(x)&&Number.isFinite(y)&&p.z>=-1&&p.z<=1){
     // Fade before the edge and the bottom bailout control; never pin a false
     // impact point to the screen border or flicker hidden at a one-pixel limit.
     const edge=Math.max(0,Math.min(1,x/36,(width-x)/36,(y-24)/36,(height-80-y)/40));
     if(edge>0){
      const error=this.x===null?0:Math.hypot(x-this.x,y-this.y);
      if(this.x===null||error>Math.min(width,height)*.45){this.x=x;this.y=y;this.opacity=0;}
      else if(error>.6){
       const tau=(attack?.055:.16)/(1+error/80),blend=step?1-Math.exp(-step/tau):1;
       this.x+=(x-this.x)*blend;this.y+=(y-this.y)*blend;
      }
      // Green belongs to a current valid release with a settled pipper, never
      // to a lagging position during a fast turn or a camera cut.
      ready=!!this.hit.onTarget&&releaseAllowed&&Math.hypot(x-this.x,y-this.y)<8;
      targetOpacity=edge*(ready?1:attack?.92:.42);
     }
    }
   }
   this.opacity+=(targetOpacity-this.opacity)*(step?1-Math.exp(-step/.12):1);
   this.element.hidden=this.opacity<.015;
   this.element.style.opacity=this.opacity.toFixed(3);
   this.element.classList.toggle('onTarget',ready);
   this.label.textContent=ready?'RELEASE':'BOMB';
   if(this.x!==null)this.element.style.transform='translate3d('+this.x.toFixed(2)+'px,'+this.y.toFixed(2)+'px,0) translate(-50%,-50%)';
   if(this.element.hidden&&targetOpacity===0)this.x=this.y=null;
  }
 }
 function stackHUD(doc,top=8){
  const objective=doc.getElementById('obj');if(!objective?.parentNode)return;
  const stack=doc.createElement('div');stack.id='hudStack';
  stack.style.cssText='position:fixed;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:7px;width:min(460px,calc(100vw - 300px));pointer-events:none;z-index:12;';
  stack.style.top='max('+top+'px,calc(env(safe-area-inset-top) + '+(top>8?26:8)+'px))';
  objective.parentNode.insertBefore(stack,objective);
  for(const id of ['obj','systemsStatus','opsStatus','wxHazard']){
   const node=doc.getElementById(id);if(!node)continue;stack.appendChild(node);
   Object.assign(node.style,{position:'relative',top:'auto',left:'auto',transform:'none',maxWidth:'100%',boxSizing:'border-box'});
  }
  const lamps=doc.getElementById('systemsStatus');if(lamps){lamps.style.flexWrap='wrap';lamps.style.justifyContent='center';}
  return stack;
 }
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
  global.addEventListener('squadronbackground',()=>interrupt('App left in background — sortie paused.'));
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
 global.GameRuntime={storage,own,release,segmentDistance,stickInput,rotorStep,render,HintCoach,attachLifecycle,FrameMeter,frames,setHTML,AdaptiveQuality,createQuality,allowEffect,stackHUD,BombCue,gunAim,showGunAim};
})(typeof window!=='undefined'?window:globalThis);
