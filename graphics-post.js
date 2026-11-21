// Build 277: compact post-processing for both games (GRAPHICS-PLAN phases 2 and 5).
// Build 291: ambient occlusion from the scene depth (near the ground only).
// Build 287: eye adaptation (auto exposure) and a film look (S-curve, split tone, vignette, grain, sharpening)
// for the graded Rhine picture; the Pacific (grade:false) is unchanged.
// The scene is drawn into an off-screen target (multisampled on WebGL 2, so the
// edges stay smooth), then one full-screen pass applies, in display space:
//   * a filmic tone curve (only where the game does not tone-map already),
//   * glow (bloom) from a half/quarter/eighth-resolution blur of bright pixels,
//   * heat shimmer behind jet exhausts (Build 283: masked by the aircraft's own silhouette, so the
//     engines and the airframe stay still and only what lies behind them ripples).
// No external libraries: one triangle, seven small passes, all owned here.
(function(global){
  'use strict';
  const VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const BRIGHT='uniform sampler2D src;uniform float threshold;uniform vec2 texel;varying vec2 vUv;'+
    'vec3 pick(vec2 o){vec3 c=texture2D(src,vUv+o*texel).rgb;float l=max(c.r,max(c.g,c.b));return c*smoothstep(threshold,threshold+.18,l);}'+
    'void main(){gl_FragColor=vec4((pick(vec2(-1.,-1.))+pick(vec2(1.,-1.))+pick(vec2(-1.,1.))+pick(vec2(1.,1.)))*.25,1.);}';
  const DOWN='uniform sampler2D src;uniform vec2 texel;varying vec2 vUv;'+
    'void main(){gl_FragColor=vec4((texture2D(src,vUv+texel*vec2(-1.,-1.)).rgb+texture2D(src,vUv+texel*vec2(1.,-1.)).rgb+texture2D(src,vUv+texel*vec2(-1.,1.)).rgb+texture2D(src,vUv+texel*vec2(1.,1.)).rgb)*.25,1.);}';
  const BLUR='uniform sampler2D src;uniform vec2 dir;varying vec2 vUv;'+
    'void main(){vec3 c=texture2D(src,vUv).rgb*.2270;'+
    'c+=(texture2D(src,vUv+dir*1.3846).rgb+texture2D(src,vUv-dir*1.3846).rgb)*.3162;'+
    'c+=(texture2D(src,vUv+dir*3.2308).rgb+texture2D(src,vUv-dir*3.2308).rgb)*.0703;'+
    'gl_FragColor=vec4(c,1.);}';
  // Build 287 (the "Saltline" look in r128): the average brightness of the picture is measured every frame on
  // a 32x18 reduction (16 taps per cell) and the eye adapts to it over about 1.2 s (log-average, centre-weighted).
  const REDUCE='uniform sampler2D src;uniform vec2 cell;varying vec2 vUv;'+
    'void main(){vec3 c=vec3(0.);for(int y=0;y<4;y++)for(int x=0;x<4;x++)c+=texture2D(src,vUv+cell*(vec2(float(x),float(y))-1.5)/4.).rgb;gl_FragColor=vec4(c/16.,1.);}';
  const ADAPT='uniform sampler2D src,prev;uniform float rate;varying vec2 vUv;'+
    'void main(){float s=0.,w=0.;for(int y=0;y<6;y++)for(int x=0;x<8;x++){vec2 uv=vec2((float(x)+.5)/8.,(float(y)+.5)/6.);'+
    'vec3 c=pow(max(texture2D(src,uv).rgb,vec3(0.)),vec3(2.2));float l=dot(c,vec3(.2126,.7152,.0722));'+
    'float k=1.-.75*smoothstep(.12,.72,length((uv-.5)*vec2(1.,1.25)));s+=log(max(l,1e-4))*k;w+=k;}'+
    'float cur=s/w,old=texture2D(prev,vec2(.5)).r;gl_FragColor=vec4(rate>=1.?cur:mix(old,cur,rate),0.,0.,1.);}';
  // Build 291: ambient occlusion from the depth buffer (both games, High, faded in near the ground by the game).
  // Half resolution; the view-space position is rebuilt from depth, the normal from the smaller of the two depth
  // differences per axis (no halo at silhouettes); 8 taps (Build 294; 12 before) on a disc of `radius` metres turned on a 4x4 pattern,
  // which the depth-aware 4x4 box below averages away exactly. Each tap that rises above the surface's tangent plane
  // darkens by how steeply it rises (cosine above .3, i.e. occluders steeper than ~17 deg: houses, trees, hulls, aircraft;
  // the gentle creases of the terrain mesh would otherwise draw stripes across flat ground), fading out between one and
  // two radii. Sky (depth 1) and far ground (fades 700-1200 m, Build 294; 900-1600 before) stay at 1.
  const AO=`uniform sampler2D depth;uniform vec2 texel,tanHalf;uniform float near,far,radius,scale;varying vec2 vUv;
    float viewZ(vec2 uv){float d=texture2D(depth,uv).r;return 2.*near*far/((far+near)-(2.*d-1.)*(far-near));}
    vec3 viewPos(vec2 uv,float z){return vec3((uv*2.-1.)*tanHalf*z,-z);}
    void main(){
      float d0=texture2D(depth,vUv).r;
      if(d0>=.99999){gl_FragColor=vec4(1.,1.,0.,1.);return;}
      float z=viewZ(vUv);
      // Build 294: past the fade nothing is darkened; return before the normal and the taps (it used to compute them and mix them away)
      if(z>=1200.){gl_FragColor=vec4(1.,z/2000.,0.,1.);return;}
      vec3 p=viewPos(vUv,z);
      // Normal: over 3 texels each way (the depth buffer comes in steps; one texel apart two rows can share a depth
      // and the ground would read as a wall). Where the two sides disagree (an edge) the shorter side is used.
      vec2 ox=vec2(3.*texel.x,0.),oy=vec2(0.,3.*texel.y);
      vec3 px=viewPos(vUv+ox,viewZ(vUv+ox))-p,mx=p-viewPos(vUv-ox,viewZ(vUv-ox));
      vec3 py=viewPos(vUv+oy,viewZ(vUv+oy))-p,my=p-viewPos(vUv-oy,viewZ(vUv-oy));
      float lx=dot(px,px),lmx=dot(mx,mx),ly=dot(py,py),lmy=dot(my,my);
      vec3 tx=max(lx,lmx)<4.*min(lx,lmx)?px+mx:(lx<lmx?px:mx),ty=max(ly,lmy)<4.*min(ly,lmy)?py+my:(ly<lmy?py:my);
      vec3 n=normalize(cross(tx,ty));
      vec2 cell=mod(floor(gl_FragCoord.xy),4.);
      float rot=(cell.x*4.+cell.y)*.39269908+.2;
      float r=clamp(radius*scale/z,4.,48.);
      float sum=0.;
      for(int i=0;i<8;i++){
        float fi=float(i),a=fi*2.3999632+rot;
        vec2 uv=vUv+vec2(cos(a),sin(a))*sqrt((fi+.5)/8.)*r*texel;
        vec3 v=viewPos(uv,viewZ(uv))-p;float l=length(v);
        sum+=(dot(v,n)>.004*z?max(0.,dot(v,n)/max(l,.05)-.3)/.7:0.)*(1.-smoothstep(radius,2.*radius,l));
      }
      float ao=clamp(1.-sum*2.2/8.,0.,1.);
      ao=mix(ao,1.,smoothstep(700.,1200.,z));
      gl_FragColor=vec4(ao,z/2000.,0.,1.);
    }`;
  const AO_BLUR=`uniform sampler2D src;uniform vec2 texel;varying vec2 vUv;
    void main(){vec2 c=texture2D(src,vUv).rg;float s=0.,w=0.;
      for(int y=0;y<4;y++)for(int x=0;x<4;x++){vec2 t=texture2D(src,vUv+(vec2(float(x),float(y))-1.5)*texel).rg;
        float k=1./(1.+abs(t.y-c.y)*8./max(c.y,.0005));s+=t.x*k;w+=k;}
      gl_FragColor=vec4(s/w,c.y,0.,1.);}`;
  const FINAL=`uniform sampler2D scene,glowA,glowB,mask,adapt,occlusion;uniform float glow,grade,exposure,time,hazeCount,useMask,aoStrength;
    uniform float autoOn,key,minGain,maxGain,contrast,saturation,vignette,grain,sharpen;uniform vec2 texel;
    uniform vec4 haze[2];uniform vec2 aspect;varying vec2 vUv;
    vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    void main(){
      vec2 uv=vUv,off=vec2(0.);
      for(int i=0;i<2;i++){
        if(float(i)>=hazeCount)break;
        vec4 h=haze[i];vec2 d=(vUv-h.xy)*aspect;float f=1.-smoothstep(0.,h.z,length(d));
        // A plume that wobbles with time; strongest at the nozzle, gone at the rim.
        off+=vec2(sin(vUv.y*170.+time*23.),cos(vUv.x*150.-time*19.))*h.w*f*f;
      }
      // Build 283: the aeroplane itself never ripples. No shift where this pixel or the pixel it would
      // borrow lies on the airframe (half-resolution silhouette, soft at its edge).
      if(useMask>.5)off*=1.-smoothstep(0.,.35,max(texture2D(mask,vUv).r,texture2D(mask,vUv+off).r));
      uv+=off;
      vec3 c=texture2D(scene,uv).rgb;
      if(aoStrength>0.)c*=mix(1.,texture2D(occlusion,vUv).r,aoStrength);
      if(grade>.5){
        // Build 287: a light unsharp mask (four neighbours) restores the crispness the multisampled
        // target and the half-resolution passes take away.
        if(sharpen>0.){
          vec3 n=texture2D(scene,uv+vec2(texel.x,0.)).rgb+texture2D(scene,uv-vec2(texel.x,0.)).rgb+
                 texture2D(scene,uv+vec2(0.,texel.y)).rgb+texture2D(scene,uv-vec2(0.,texel.y)).rgb;
          c=max(c+(c-n*.25)*sharpen,vec3(0.));
        }
        // Display values -> approximate light -> filmic curve -> display. Mid grey
        // is kept; highlights roll off instead of clipping, shadows gain depth.
        float gain=1.;
        if(autoOn>.5)gain=clamp(sqrt(key/exp(texture2D(adapt,vec2(.5)).r)),minGain,maxGain);
        vec3 lin=pow(max(c,vec3(0.)),vec3(2.2))*exposure*gain;
        c=pow(aces(lin),vec3(1./2.2));
        // Build 287 look: a gentle S-curve around mid grey, cooler shadows and warmer highlights.
        c=mix(c,c*c*(3.-2.*c),contrast);
        float l=dot(c,vec3(.299,.587,.114));
        c=mix(vec3(l),c,saturation);
        c*=mix(vec3(.97,.99,1.03),vec3(1.03,1.,.96),smoothstep(.15,.85,l));
        vec2 v=(vUv-.5)*vec2(aspect.x/max(aspect.x,1.),1.);
        c*=1.-vignette*smoothstep(.25,.85,dot(v,v)*2.2);
      }
      c+=(texture2D(glowA,vUv).rgb*.55+texture2D(glowB,vUv).rgb*.75)*glow;
      // Fine moving film grain (also breaks up 8-bit banding in the sky gradient).
      if(grade>.5&&grain>0.)c+=(fract(sin(dot(gl_FragCoord.xy+fract(time*7.3)*91.7,vec2(12.9898,78.233)))*43758.5453)-.5)*grain;
      gl_FragColor=vec4(c,1.);
    }`;

  function create(THREE,renderer,options={}){
    const gl2=!!renderer.capabilities?.isWebGL2;
    const params={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:false};
    const sceneTarget=gl2&&THREE.WebGLMultisampleRenderTarget?
      new THREE.WebGLMultisampleRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,stencilBuffer:true}):
      new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,stencilBuffer:true});
    // stencilBuffer: r128 gives a plain depth buffer only 16 bits; with stencil it is
    // 24-bit depth. At 2.5 m - 30 km, 16 bits let the ground poke through rivers.
    if(sceneTarget.isWebGLMultisampleRenderTarget)sceneTarget.samples=4;
    // Build 291: the depth the scene pass wrote, for ambient occlusion (WebGL 2 only: the multisample resolve copies
    // depth into this texture; same 24-bit depth + stencil format as the multisampled buffer, which the copy needs).
    const aoOk=gl2&&options.ao!==false&&!!THREE.DepthTexture;
    if(aoOk){sceneTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedInt248Type);sceneTarget.depthTexture.format=THREE.DepthStencilFormat;}
    const aoTargets=aoOk?[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,
      type:(renderer.extensions?.has?.('EXT_color_buffer_float')||renderer.extensions?.has?.('EXT_color_buffer_half_float'))?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:false})):[];
    // The scene target receives exactly what the screen would (tone mapping and
    // sRGB encoding included), so the passes below all work in display space.
    sceneTarget.texture.encoding=renderer.outputEncoding;
    const half=new THREE.WebGLRenderTarget(1,1,params),quarter=[new THREE.WebGLRenderTarget(1,1,params),new THREE.WebGLRenderTarget(1,1,params)];
    const eighth=[new THREE.WebGLRenderTarget(1,1,params),new THREE.WebGLRenderTarget(1,1,params)];
    const maskTarget=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
    const maskMaterial=new THREE.MeshBasicMaterial({color:0xffffff,fog:false,side:THREE.DoubleSide});maskMaterial.toneMapped=false;
    const MASK_LAYER=6,clearColor=new THREE.Color();let lightScan=0;
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
    const quad=new THREE.Mesh(geometry);quad.frustumCulled=false;
    const scene=new THREE.Scene();scene.add(quad);
    const mat=(fragmentShader,uniforms)=>new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader,uniforms,depthTest:false,depthWrite:false});
    const bright=mat(BRIGHT,{src:{value:null},threshold:{value:.92},texel:{value:new THREE.Vector2()}});
    const down=mat(DOWN,{src:{value:null},texel:{value:new THREE.Vector2()}});
    const blur=mat(BLUR,{src:{value:null},dir:{value:new THREE.Vector2()}});
    const final=mat(FINAL,{scene:{value:sceneTarget.texture},glowA:{value:quarter[0].texture},glowB:{value:eighth[0].texture},
      glow:{value:0},grade:{value:0},exposure:{value:1},time:{value:0},hazeCount:{value:0},mask:{value:maskTarget.texture},useMask:{value:0},
      haze:{value:[new THREE.Vector4(),new THREE.Vector4()]},aspect:{value:new THREE.Vector2(1,1)},
      adapt:{value:null},autoOn:{value:0},key:{value:.18},minGain:{value:.8},maxGain:{value:1.35},
      contrast:{value:0},saturation:{value:1.06},vignette:{value:0},grain:{value:0},sharpen:{value:0},texel:{value:new THREE.Vector2()},
      occlusion:{value:null},aoStrength:{value:0}});
    const aoMat=mat(AO,{depth:{value:aoOk?sceneTarget.depthTexture:null},texel:{value:new THREE.Vector2()},tanHalf:{value:new THREE.Vector2()},
      near:{value:1},far:{value:1000},radius:{value:3},scale:{value:1}});
    const aoBlur=mat(AO_BLUR,{src:{value:null},texel:{value:new THREE.Vector2()}});
    // Build 287: eye adaptation needs a float target (a log luminance creeping by a fraction of a percent per frame
    // stalls on 8-bit steps). Without float render targets the exposure stays fixed, as before.
    const floatOk=gl2&&!!(renderer.extensions?.has?.('EXT_color_buffer_float')||renderer.extensions?.has?.('EXT_color_buffer_half_float'));
    const lumTarget=new THREE.WebGLRenderTarget(32,18,params);
    const adaptTargets=floatOk?[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
      format:THREE.RGBAFormat,type:THREE.HalfFloatType,depthBuffer:false})):[];
    const reduce=mat(REDUCE,{src:{value:null},cell:{value:new THREE.Vector2(1/32,1/18)}});
    const adapt=mat(ADAPT,{src:{value:lumTarget.texture},prev:{value:null},rate:{value:1}});
    let adaptIndex=0,adaptFresh=true,lastTime=null;
    const size=new THREE.Vector2();let width=0,height=0;
    const pass=(material,target)=>{quad.material=material;renderer.setRenderTarget(target);renderer.render(scene,camera);};
    // The player's airframe in white on black, half resolution, same camera. Only the aircraft's meshes are on
    // the mask layer; the scene's lights are put on it too, so the light set (and with it every material's
    // program) stays the same as in the main pass, and the shadow map is not redrawn for this pass.
    function renderMask(world,view){
      if(--lightScan<=0){lightScan=120;world.traverse(o=>{if(o.isLight)o.layers.enable(MASK_LAYER);});}
      api.maskRoot.traverse(o=>{if(o.isMesh||o.isSprite)o.layers.enable(MASK_LAYER);});   // Build 295: the nozzle halo (a sprite) belongs to the airframe too
      const background=world.background,override=world.overrideMaterial,layers=view.layers.mask,
        shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,alpha=renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      world.background=null;world.overrideMaterial=maskMaterial;view.layers.set(MASK_LAYER);
      // Build 286: the scene pass of this frame already updated every world matrix; doing it again here cost the jets a second
      // walk over the whole Rhine scene each frame (the frame-time spikes that shook the chase camera).
      const autoUpdate=world.autoUpdate;world.autoUpdate=false;
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.setClearColor(0x000000,1);
      renderer.setRenderTarget(maskTarget);renderer.clear();renderer.render(world,view);
      world.background=background;world.overrideMaterial=override;view.layers.mask=layers;world.autoUpdate=autoUpdate;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.setClearColor(clearColor,alpha);
    }
    const api={
      enabled:false,glow:.6,grade:!!options.grade,exposure:options.exposure||.72,threshold:.92,
      // Build 287 look (only with grade): auto exposure, S-curve, vignette, grain, sharpening. Values are
      // game decisions; key is the log-average display luminance that keeps the gain at 1.
      look:Object.assign({auto:true,key:.18,minGain:.8,maxGain:1.35,adaptTau:1.2,contrast:.14,saturation:1.0,vignette:.22,grain:.014,sharpen:.22},options.look||{}),
      get autoExposure(){return floatOk;},
      // Forget the adapted brightness (new mission, teleport): the next frame adapts at once.
      resetAdaptation(){adaptFresh=true;},
      haze:[],maskRoot:null,
      // Build 291: ambient occlusion strength 0..1 (the game sets it from height above ground; 0 skips both passes).
      ao:0,aoRadius:3,aoStrength:.85,
      get aoSupported(){return aoOk;},
      resize(){
        renderer.getDrawingBufferSize(size);
        if(size.x===width&&size.y===height)return;
        width=size.x;height=size.y;
        sceneTarget.setSize(width,height);
        half.setSize(Math.max(1,width>>1),Math.max(1,height>>1));maskTarget.setSize(Math.max(1,width>>1),Math.max(1,height>>1));
        for(const t of quarter)t.setSize(Math.max(1,width>>2),Math.max(1,height>>2));
        for(const t of eighth)t.setSize(Math.max(1,width>>3),Math.max(1,height>>3));
        for(const t of aoTargets)t.setSize(Math.max(1,width>>1),Math.max(1,height>>1));
        final.uniforms.aspect.value.set(width/Math.max(1,height),1);
      },
      // Returns false when post-processing is off, so the caller renders as before.
      render(world,view,time=0,bloom=true){
        if(!api.enabled)return false;
        api.resize();
        const previous=renderer.getRenderTarget();
        renderer.setRenderTarget(sceneTarget);renderer.render(world,view);
        // The measuring panel reports the scene pass, not the last full-screen pass.
        renderer.__sceneInfo={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
        const hazeOn=api.haze.length>0,masked=hazeOn&&!!api.maskRoot;
        if(masked)renderMask(world,view);
        const auto=renderer.autoClear;renderer.autoClear=false;
        if(bloom&&api.glow>0){
          bright.uniforms.src.value=sceneTarget.texture;bright.uniforms.threshold.value=api.threshold;
          bright.uniforms.texel.value.set(1/width,1/height);pass(bright,half);
          down.uniforms.src.value=half.texture;down.uniforms.texel.value.set(1/half.width,1/half.height);pass(down,quarter[0]);
          blur.uniforms.src.value=quarter[0].texture;blur.uniforms.dir.value.set(1/quarter[0].width,0);pass(blur,quarter[1]);
          blur.uniforms.src.value=quarter[1].texture;blur.uniforms.dir.value.set(0,1/quarter[0].height);pass(blur,quarter[0]);
          down.uniforms.src.value=quarter[0].texture;down.uniforms.texel.value.set(1/quarter[0].width,1/quarter[0].height);pass(down,eighth[0]);
          blur.uniforms.src.value=eighth[0].texture;blur.uniforms.dir.value.set(1/eighth[0].width,0);pass(blur,eighth[1]);
          blur.uniforms.src.value=eighth[1].texture;blur.uniforms.dir.value.set(0,1/eighth[0].height);pass(blur,eighth[0]);
        }
        const u=final.uniforms,look=api.look,autoOn=api.grade&&look.auto&&floatOk;
        const aoOn=aoOk&&api.ao>0&&view.isPerspectiveCamera;
        if(aoOn){
          const a=aoMat.uniforms,tanY=Math.tan(view.fov*Math.PI/360)/(view.zoom||1),hw=aoTargets[0].width,hh=aoTargets[0].height;
          a.texel.value.set(1/width,1/height);a.tanHalf.value.set(tanY*view.aspect,tanY);a.near.value=view.near;a.far.value=view.far;
          a.radius.value=api.aoRadius;a.scale.value=height/(2*tanY);
          pass(aoMat,aoTargets[0]);
          aoBlur.uniforms.src.value=aoTargets[0].texture;aoBlur.uniforms.texel.value.set(1/hw,1/hh);pass(aoBlur,aoTargets[1]);
          u.occlusion.value=aoTargets[1].texture;
        }
        u.aoStrength.value=aoOn?api.ao*api.aoStrength:0;
        if(autoOn){
          reduce.uniforms.src.value=sceneTarget.texture;pass(reduce,lumTarget);
          const dt=lastTime===null?1/60:Math.max(0,Math.min(.25,time-lastTime));
          adapt.uniforms.prev.value=adaptTargets[adaptIndex].texture;
          adapt.uniforms.rate.value=adaptFresh?1:1-Math.exp(-dt/Math.max(.05,look.adaptTau));
          adaptIndex=1-adaptIndex;pass(adapt,adaptTargets[adaptIndex]);adaptFresh=false;
          u.adapt.value=adaptTargets[adaptIndex].texture;
        }
        lastTime=time;
        u.autoOn.value=autoOn?1:0;u.key.value=look.key;u.minGain.value=look.minGain;u.maxGain.value=look.maxGain;
        u.contrast.value=look.contrast;u.saturation.value=look.saturation;u.vignette.value=look.vignette;
        u.grain.value=look.grain;u.sharpen.value=look.sharpen;u.texel.value.set(1/width,1/height);
        u.glow.value=bloom?api.glow:0;u.grade.value=api.grade?1:0;u.exposure.value=api.exposure;u.time.value=time;
        u.hazeCount.value=Math.min(2,api.haze.length);u.useMask.value=masked?1:0;
        for(let i=0;i<2;i++){const h=api.haze[i];if(h)u.haze.value[i].set(h.x,h.y,h.r,h.s);}
        pass(final,previous);
        renderer.autoClear=auto;
        return true;
      },
      dispose(){
        for(const t of [sceneTarget,half,maskTarget,lumTarget,...adaptTargets,...aoTargets,...quarter,...eighth])t.dispose();sceneTarget.depthTexture?.dispose();
        for(const m of [bright,down,blur,final,maskMaterial,reduce,adapt,aoMat,aoBlur])m.dispose();
        geometry.dispose();
      },
      // Build 292: compile the ambient-occlusion programs now. They used to compile the first time the camera came
      // below 650 m in a sortie, a one-off hitch of a few hundred ms on the iPad right in low flight.
      warm(){if(!aoOk)return;const keep=quad.material;for(const m of [aoMat,aoBlur]){quad.material=m;renderer.compile(scene,camera);}quad.material=keep;},
      get multisampled(){return !!sceneTarget.isWebGLMultisampleRenderTarget;},
      // Test/diagnostic only (a GPU read stalls): the blurred occlusion of the last frame (min, mean of R) and the
      // depth range seen (G = view distance / 2000).
      readOcclusion(raw=false){
        if(!aoOk||!aoTargets[1].width)return null;
        const t=aoTargets[raw?0:1],half=t.texture.type===THREE.HalfFloatType,n=t.width*t.height*4,out=half?new Uint16Array(n):new Uint8Array(n);
        renderer.readRenderTargetPixels(t,0,0,t.width,t.height,out);
        const f=v=>{if(!half)return v/255;const e=(v>>10)&31,m=v&1023;return e?Math.pow(2,e-15)*(1+m/1024):Math.pow(2,-14)*m/1024;};
        let min=1,sum=0,dark=0,zmin=1e9,zmax=0;
        for(let i=0;i<n;i+=4){const a=f(out[i]),z=f(out[i+1]);min=Math.min(min,a);sum+=a;if(a<.85)dark++;zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);}
        const image=raw===2?Array.from({length:n/4},(_,i)=>Math.round(f(out[i*4])*255)):undefined;
        return {min,mean:sum/(n/4),darkShare:dark/(n/4),zmin:zmin*2000,zmax:zmax*2000,width:t.width,height:t.height,image};
      },
      // Test/diagnostic only (a GPU read stalls): the adapted log luminance and the gain it gives.
      readAdaptation(){
        if(!floatOk)return null;
        const out=new Uint16Array(4);renderer.readRenderTargetPixels(adaptTargets[adaptIndex],0,0,1,1,out);
        const half=h=>{const e=(h>>10)&31,m=h&1023,sign=h>>15?-1:1;return sign*(e?Math.pow(2,e-15)*(1+m/1024):Math.pow(2,-14)*m/1024);};
        const log=half(out[0]),look=api.look;
        return {log,lum:Math.exp(log),gain:Math.max(look.minGain,Math.min(look.maxGain,Math.sqrt(look.key/Math.exp(log))))};
      }
    };
    try{api.warm();}catch(e){}
    return api;
  }
  global.GraphicsPost={create};
})(typeof window!=='undefined'?window:globalThis);
