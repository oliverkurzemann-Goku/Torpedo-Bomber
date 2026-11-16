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
  // Build 280: frame-rate setting, separate from the detail tier.
  //   hold60 - keep 60 FPS by lowering the render resolution in small steps
  //            (shadows, glow and detail stay; only the pixel count changes),
  //   cap30  - a steady 30 FPS with the full resolution of the tier,
  //   free   - as before Build 280: whatever the device manages.
  // Measured (Build 280, Rhine Ultra High, same view): at 2x the scene costs
  // 1.6x the time of Build 276's 1.5x picture without shadows/glow, and 66 % of
  // the extra time scales with the pixel count - resolution is the lever.
  const FRAME_KEY='graphicsFrameRate',FRAME_MODES=['hold60','cap30','free'];
  const LADDER=[2,1.75,1.5,1.3,1.15,1];
  const readFrame=()=>{try{const v=global.localStorage.getItem(FRAME_KEY);return FRAME_MODES.includes(v)?v:null;}catch(e){return null;}};
  const writeFrame=v=>{try{global.localStorage.setItem(FRAME_KEY,v);}catch(e){}};

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
    // Frame-rate state. Automated browsers (tests) keep 'free' unless the page
    // asks for a mode, so simulated 20-FPS test loops never change resolution.
    const forcedFrame=params.get('framerate');
    let frameMode=FRAME_MODES.includes(forcedFrame)?forcedFrame:
      global.navigator?.webdriver?'free':readFrame()||'hold60';
    let level=0,steps=1,cpuBound=false,winC=0,winT=0,winN=0,goodWins=0,resCool=0,clockT=0,raisedAt=-1e9,raiseAt=0,backoff=30,lastFrame=-1e9,resListeners=[],misses=new Map();
    const target=()=>frameMode==='cap30'?1/30:1/60;
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
      // cpuSeconds (optional): script time of the frame. When the script alone
      // misses the target, fewer pixels cannot help; the resolution then stays.
      sample(interval,active=true,cpuSeconds=0){
        if(!active||!Number.isFinite(interval)||interval<=0||interval>.5)return false;
        // Build 280: resolution first; the tier only moves once the resolution
        // is at its floor (too slow) or at the tier's full value (fast enough).
        let atFloor=true,atTop=true;
        if(frameMode!=='free'){
          resolution(interval,cpuSeconds);
          atFloor=level>=steps-1||cpuBound;atTop=level===0;
        }
        if(choice!=='auto')return false;
        if(cooldown>0){cooldown-=interval;return false;}
        // Thresholds follow the target: 22/17.5 ms at 60 FPS, double at 30.
        const ms=interval*1000*(1/60)/target();
        if(!atFloor&&ms>22){slow=0;return false;}
        if(!atTop&&ms<=22){good=0;return false;}
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
      get frameMode(){return frameMode;},
      get resolutionLevel(){return level;},
      // Build 282: for the measuring panel - steps on the ladder and whether the script alone missed the target.
      get resolutionState(){return {level,steps,cpuBound};},
      setFrameMode(next,remember=true){
        if(!FRAME_MODES.includes(next))return api;
        frameMode=next;if(remember)writeFrame(next);
        level=0;winT=winC=winN=goodWins=0;cpuBound=false;resCool=1;backoff=30;raiseAt=0;slow=good=0;misses.clear();
        for(const fn of resListeners)try{fn();}catch(err){console.warn('Resolution change:',err);}
        for(const fn of listeners)try{fn(api.settings,api.tier,last);}catch(err){console.warn('Graphics change:',err);}
        return api;
      },
      onResolution(fn){resListeners.push(fn);return api;},
      // Render pixel ratio for a device/tier maximum, after the frame-rate steps.
      pixelRatio(max){
        const floor=Math.min(max,1);
        const ladder=[max,...LADDER.filter(r=>r<max-.01&&r>=floor-.001)];
        steps=ladder.length;if(frameMode!=='hold60'&&frameMode!=='cap30')level=0;
        return ladder[Math.min(level,steps-1)];
      },
      // cap30: true on the frames to draw (every second 60-Hz frame).
      frameDue(now){
        if(frameMode!=='cap30')return true;
        if(now-lastFrame<28)return false;
        lastFrame=now;return true;
      },
      label(){return (choice==='auto'?'Auto · ':'')+TIERS[cap(tier())].name+(frameMode==='free'?'':' · '+(frameMode==='cap30'?'30':'60'));},
      bindFrameSelect(select){
        if(!select)return api;
        select.value=frameMode;
        select.onchange=e=>api.setFrameMode(e.target.value);
        listeners.push(()=>{if(select.value!==frameMode)select.value=frameMode;});
        return api;
      },
      bindSelect(select){
        if(!select)return api;
        select.value=choice;
        select.onchange=e=>api.set(e.target.value);
        listeners.push(()=>{if(select.value!==choice)select.value=choice;});
        return api;
      }
    };
    // One-second windows. Slower than the target by 12 % -> one step down
    // (about 13 % fewer pixels each). Six windows on target -> try one step up;
    // if that is too slow within 4 s, step back and wait twice as long before
    // the next try (30 s, 60 s ... 5 min); a step that failed three times is not
    // tried again until the setting changes. On a 60-Hz display a frame that
    // misses 16.7 ms is shown at 33 ms, so free headroom cannot be measured -
    // only tried.
    function resolution(interval,cpu){
      clockT+=interval;if(resCool>0){resCool-=interval;return;}
      winT+=interval;winC+=Number.isFinite(cpu)&&cpu>0?cpu:0;winN++;if(winT<1)return;
      const mean=winT/winN,goal=target();cpuBound=winC/winN>goal;winT=winC=winN=0;
      if(mean>goal*1.12){
        goodWins=0;
        if(level<steps-1&&!cpuBound){
          if(clockT-raisedAt<4){backoff=Math.min(300,backoff*2);raiseAt=clockT+backoff;misses.set(level,(misses.get(level)||0)+1);}
          level++;resCool=1;changed();
        }
      }else if(mean<goal*1.03){
        goodWins++;
        if(goodWins>=6&&level>0&&clockT>=raiseAt&&(misses.get(level-1)||0)<3){level--;goodWins=0;raisedAt=clockT;resCool=1;changed();}
      }else goodWins=0;
    }
    function changed(){for(const fn of resListeners)try{fn();}catch(err){console.warn('Resolution change:',err);}}
    function step(){stepping=true;try{notify();}finally{stepping=false;}}
    function notify(){
      const now=api.tier;if(now!==last){misses.clear();backoff=30;}
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
  // Build 282: a third line answers "what limits the frame rate": script time per
  // frame (game logic + handing the draw calls to WebGL, both on the CPU) against
  // the frame time, the share of it spent submitting draws, and the 60-FPS step.
  // CPU near the frame time = the processor is the limit (fewer pixels do not help);
  // CPU well below it = the graphics chip (pixels) is the limit.
  function createPerfPanel(panel,renderer,options={}){
    const samples=new Float32Array(300),cpu=new Float32Array(300),draw=new Float32Array(300);let n=0,elapsed=0,texT=0,texMB=0;
    return {
      reset(){n=0;elapsed=0;texT=0;},
      sample(dt,scene,label){
        if(!panel||!Number.isFinite(dt)||dt<=0)return null;
        const meter=options.frames;cpu[n]=meter?.lastCpu||0;draw[n]=meter?.lastRender||0;
        samples[n++]=dt*1000;elapsed+=dt;texT-=dt;
        if(texT<=0&&scene){texT=3;texMB=textureBytes(renderer,scene)/1048576;}
        if(elapsed<1.5&&n<samples.length)return null;
        const mean=a=>{let t=0;for(let i=0;i<n;i++)t+=a[i];return t/Math.max(1,n);};
        const cpuMs=mean(cpu),drawMs=mean(draw),frameMs=elapsed*1000/n;
        const sorted=samples.subarray(0,n).sort();
        const report={fps:n/elapsed,p95:sorted[Math.ceil(n*.95)-1],cpu:cpuMs,draw:drawMs,
          limit:frameMs<18?'none':cpuMs>frameMs*.8||cpuMs>15?'cpu':'gpu'};
        const {triangles,calls}=renderer.__sceneInfo||renderer.info.render;
        const q=options.quality,res=q?.resolutionState;
        const mode=!q||q.frameMode==='free'?'':q.frameMode==='cap30'?' · 30 FPS mode':
          ' · 60 FPS mode: step '+(res.level+1)+'/'+res.steps+(res.cpuBound?' (CPU-bound, resolution held)':'');
        panel.textContent=label+' · '+Math.round(report.fps)+' FPS · P95 '+report.p95.toFixed(1)+' ms\n'+
          (triangles/1e6).toFixed(2)+' M tris · '+calls+' draws · '+Math.round(texMB)+' MB tex · '+renderer.getPixelRatio().toFixed(2)+'×\n'+
          'CPU '+cpuMs.toFixed(1)+' ms (draws '+drawMs.toFixed(1)+') of '+frameMs.toFixed(1)+' ms · limit: '+
          (report.limit==='none'?'none':report.limit==='cpu'?'CPU':'GPU (pixels)')+mode;
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

  global.GraphicsQuality={create,textureBytes,createPerfPanel,applyAnisotropy,TIERS,ORDER,FRAME_MODES,LADDER};
})(typeof window!=='undefined'?window:globalThis);
