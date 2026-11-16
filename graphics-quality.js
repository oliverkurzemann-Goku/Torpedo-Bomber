// Build 277: one graphics setting for both games (GRAPHICS-PLAN.md section 6).
// The player picks Auto, Low, Medium or High. Auto starts at Medium, rises after
// a stretch of comfortable 60-Hz frames and falls after sustained slow frames or a
// thermal/memory warning from the app (graphics-bridge in the iOS shell). A tier
// that proved too slow is not retried (Build 278), and Auto never toggles
// shadows or texture filtering (both are expensive to change mid-flight).
// 120 Hz is deliberately not a goal: the target is a steady 60 frames per second.
(function(global){
  'use strict';
  const ORDER=['low','medium','high'];
  const TIERS={
    low:{name:'Low',pixelRatio:1,shadows:false,shadowSize:0,shadowRange:0,treeRange:.7,bloom:false,grade:true,
      anisotropy:2,groundDetail:false,nearTrees:0,contrails:false,heatHaze:false,windowLight:true},
    medium:{name:'Medium',pixelRatio:1.5,shadows:true,shadowSize:1024,shadowRange:200,treeRange:1,bloom:false,grade:true,
      anisotropy:4,groundDetail:true,nearTrees:.5,contrails:true,heatHaze:false,windowLight:true},
    high:{name:'High',pixelRatio:2,shadows:true,shadowSize:2048,shadowRange:360,treeRange:1.25,bloom:true,grade:true,
      anisotropy:8,groundDetail:true,nearTrees:1,contrails:true,heatHaze:true,windowLight:true}
  };
  const KEY='graphicsQuality';
  const read=()=>{try{const v=global.localStorage.getItem(KEY);return v==='low'||v==='medium'||v==='high'||v==='auto'?v:null;}catch(e){return null;}};
  const write=v=>{try{global.localStorage.setItem(KEY,v);}catch(e){}};

  function create(options={}){
    const params=new URLSearchParams(global.location?.search||'');
    const forced=params.get('graphics');
    const touch=(global.navigator?.maxTouchPoints||0)>0;
    let choice=['auto','low','medium','high'].includes(forced)?forced:read()||'auto';
    // Desktop browsers and the M1 iPad both have headroom; Auto begins at Medium
    // on touch devices (unknown GPU) and at High elsewhere.
    let auto=touch?'medium':'high',ceiling='high',listeners=[];
    const autoStart=auto;
    let slow=0,good=0,cooldown=0,last=null,failed=new Set(),stepping=false;
    const tier=()=>choice==='auto'?auto:choice;
    const cap=name=>ORDER[Math.min(ORDER.indexOf(name),ORDER.indexOf(ceiling))];
    // Build 278: Auto steps only change what is cheap to change (resolution,
    // tree range, glow, ground detail). Shadows on/off recompiles every shader
    // and a new anisotropy level re-uploads every texture; on the iPad each Auto
    // step was a visible hitch. Those two stay at the starting tier's values.
    const pinned=t=>choice!=='auto'?t:Object.assign({},t,{shadows:TIERS[autoStart].shadows,
      shadowSize:TIERS[autoStart].shadowSize,anisotropy:TIERS[autoStart].anisotropy});
    const api={
      ORDER,TIERS,
      get choice(){return choice;},
      get tier(){return cap(tier());},
      get settings(){return pinned(TIERS[cap(tier())]);},
      // True while listeners run for an automatic (not user) step.
      get automatic(){return stepping;},
      get failed(){return [...failed];},
      get ceiling(){return ceiling;},
      onChange(fn){listeners.push(fn);return api;},
      set(next,remember=true){
        if(!['auto','low','medium','high'].includes(next))return api;
        choice=next;if(remember)write(next);slow=good=0;cooldown=3;failed.clear();notify();return api;
      },
      // A thermal or memory warning lowers the highest permitted tier.
      limit(level){ceiling=ORDER[Math.max(0,Math.min(2,level))];notify();return api;},
      // Frame interval in seconds (unclamped). Returns true when the tier changed.
      sample(interval,active=true){
        if(choice!=='auto'||!active||!Number.isFinite(interval)||interval<=0||interval>.5)return false;
        if(cooldown>0){cooldown-=interval;return false;}
        const ms=interval*1000;
        // Slower than 45 FPS for three seconds lowers; 20 s at 60 FPS raises.
        // Build 278: a tier that was too slow once is not tried again in this
        // session. Before, a device at ~40 FPS on Medium fell to Low, ran
        // smoothly, rose to Medium after 15 s and fell again - a hitch every
        // ~25 s, which is what Auto looked like on the iPad.
        if(ms>22){slow+=interval;good=0;}else{good+=ms<17.5?interval:0;slow=Math.max(0,slow-interval*.5);}
        const i=ORDER.indexOf(auto);
        if(slow>3&&i>0){failed.add(auto);auto=ORDER[i-1];slow=good=0;cooldown=8;step();return true;}
        if(good>20&&i<2&&!failed.has(ORDER[i+1])){auto=ORDER[i+1];slow=good=0;cooldown=8;step();return true;}
        return false;
      },
      label(){return (choice==='auto'?'Auto · ':'')+TIERS[cap(tier())].name;},
      bindSelect(select){
        if(!select)return api;
        select.value=choice;
        select.onchange=e=>api.set(e.target.value);
        listeners.push(()=>{if(select.value!==choice)select.value=choice;});
        return api;
      }
    };
    function step(){stepping=true;try{notify();}finally{stepping=false;}}
    function notify(){
      const now=api.tier;
      for(const fn of listeners)try{fn(api.settings,now,last);}catch(err){console.warn('Graphics change:',err);}
      last=now;
    }
    // Phase 6: the iOS app reports thermal state and memory pressure.
    global.addEventListener?.('graphicsdevicehealth',e=>{
      const d=e.detail||{};
      // ProcessInfo.thermalState: 0 nominal, 1 fair, 2 serious, 3 critical.
      let level=2;
      if(d.thermal>=3||d.memoryWarning)level=0;else if(d.thermal>=2)level=1;
      api.limit(level);
    });
    return api;
  }

  // Estimated GPU texture memory (bytes) of everything the renderer uploaded.
  function textureBytes(renderer,scene){
    const seen=new Set();let bytes=0;
    const add=t=>{
      if(!t||seen.has(t))return;seen.add(t);
      const img=t.image;const w=img?.width||img?.videoWidth||0,h=img?.height||img?.videoHeight||0;
      if(!w||!h)return;
      const bpp=t.type===1015||t.type===1016?(t.type===1015?16:8):4;
      bytes+=w*h*bpp*(t.generateMipmaps!==false&&t.minFilter!==1006&&t.minFilter!==1003?4/3:1);
    };
    scene.traverse(o=>{
      const mats=Array.isArray(o.material)?o.material:o.material?[o.material]:[];
      for(const m of mats){for(const k in m){const v=m[k];if(v&&v.isTexture)add(v);}
        if(m.uniforms)for(const u of Object.values(m.uniforms)){if(u?.value?.isTexture)add(u.value);}}
    });
    if(scene.background?.isTexture)add(scene.background);
    return bytes;
  }

  // Shared measuring panel (both games). Shows frames per second, slowest 5 %,
  // triangles, draw calls, texture memory, pixel ratio and the graphics tier.
  function createPerfPanel(panel,renderer,options={}){
    const samples=new Float32Array(300);let n=0,elapsed=0,texT=0,texMB=0;
    return {
      reset(){n=0;elapsed=0;texT=0;},
      sample(dt,scene,label){
        if(!panel||!Number.isFinite(dt)||dt<=0)return null;
        samples[n++]=dt*1000;elapsed+=dt;texT-=dt;
        if(texT<=0&&scene){texT=3;texMB=textureBytes(renderer,scene)/1048576;}
        if(elapsed<1.5&&n<samples.length)return null;
        const sorted=samples.subarray(0,n).sort();
        const report={fps:n/elapsed,p95:sorted[Math.ceil(n*.95)-1]};
        const {triangles,calls}=renderer.__sceneInfo||renderer.info.render;
        panel.textContent=label+' · '+Math.round(report.fps)+' FPS · P95 '+report.p95.toFixed(1)+' ms\n'+
          (triangles/1e6).toFixed(2)+' M tris · '+calls+' draws · '+Math.round(texMB)+' MB tex · '+renderer.getPixelRatio().toFixed(2)+'×';
        n=0;elapsed=0;
        return report;
      }
    };
  }

  // Anisotropic filtering for every texture in the scene (aircraft, ground,
  // runway). Textures seen for the first time are set before their upload;
  // a tier change re-uploads only those whose level actually changes.
  const anisotropySeen=new WeakMap();
  function applyAnisotropy(scene,renderer,level){
    const max=renderer.capabilities?.getMaxAnisotropy?renderer.capabilities.getMaxAnisotropy():1;
    const want=Math.max(1,Math.min(max,level|0));let changed=0;
    const visit=t=>{
      if(!t||!t.isTexture||t.isDataTexture&&t.image?.width<=64)return;
      if(anisotropySeen.get(t)===want)return;
      anisotropySeen.set(t,want);
      if(t.anisotropy===want)return;
      t.anisotropy=want;if(t.version>0||t.image)t.needsUpdate=true;changed++;
    };
    scene.traverse(o=>{
      const mats=Array.isArray(o.material)?o.material:o.material?[o.material]:[];
      for(const m of mats)for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','bumpMap'])visit(m[k]);
    });
    return changed;
  }

  global.GraphicsQuality={create,textureBytes,createPerfPanel,applyAnisotropy,TIERS,ORDER};
})(typeof window!=='undefined'?window:globalThis);
