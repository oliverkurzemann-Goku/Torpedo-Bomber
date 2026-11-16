// Build 277: compact post-processing for both games (GRAPHICS-PLAN phases 2 and 5).
// The scene is drawn into an off-screen target (multisampled on WebGL 2, so the
// edges stay smooth), then one full-screen pass applies, in display space:
//   * a filmic tone curve (only where the game does not tone-map already),
//   * glow (bloom) from a half/quarter/eighth-resolution blur of bright pixels,
//   * heat shimmer behind jet exhausts.
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
  const FINAL=`uniform sampler2D scene,glowA,glowB;uniform float glow,grade,exposure,time,hazeCount;
    uniform vec4 haze[2];uniform vec2 aspect;varying vec2 vUv;
    vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    void main(){
      vec2 uv=vUv;
      for(int i=0;i<2;i++){
        if(float(i)>=hazeCount)break;
        vec4 h=haze[i];vec2 d=(uv-h.xy)*aspect;float f=1.-smoothstep(0.,h.z,length(d));
        // A plume that wobbles with time; strongest at the nozzle, gone at the rim.
        uv+=vec2(sin(uv.y*170.+time*23.),cos(uv.x*150.-time*19.))*h.w*f*f;
      }
      vec3 c=texture2D(scene,uv).rgb;
      if(grade>.5){
        // Display values -> approximate light -> filmic curve -> display. Mid grey
        // is kept; highlights roll off instead of clipping, shadows gain depth.
        vec3 lin=pow(max(c,vec3(0.)),vec3(2.2))*exposure;
        c=pow(aces(lin),vec3(1./2.2));
        float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.06);
      }
      c+=(texture2D(glowA,vUv).rgb*.55+texture2D(glowB,vUv).rgb*.75)*glow;
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
    // The scene target receives exactly what the screen would (tone mapping and
    // sRGB encoding included), so the passes below all work in display space.
    sceneTarget.texture.encoding=renderer.outputEncoding;
    const half=new THREE.WebGLRenderTarget(1,1,params),quarter=[new THREE.WebGLRenderTarget(1,1,params),new THREE.WebGLRenderTarget(1,1,params)];
    const eighth=[new THREE.WebGLRenderTarget(1,1,params),new THREE.WebGLRenderTarget(1,1,params)];
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
      glow:{value:0},grade:{value:0},exposure:{value:1},time:{value:0},hazeCount:{value:0},
      haze:{value:[new THREE.Vector4(),new THREE.Vector4()]},aspect:{value:new THREE.Vector2(1,1)}});
    const size=new THREE.Vector2();let width=0,height=0;
    const pass=(material,target)=>{quad.material=material;renderer.setRenderTarget(target);renderer.render(scene,camera);};
    const api={
      enabled:false,glow:.6,grade:!!options.grade,exposure:options.exposure||.72,threshold:.92,
      haze:[],
      resize(){
        renderer.getDrawingBufferSize(size);
        if(size.x===width&&size.y===height)return;
        width=size.x;height=size.y;
        sceneTarget.setSize(width,height);
        half.setSize(Math.max(1,width>>1),Math.max(1,height>>1));
        for(const t of quarter)t.setSize(Math.max(1,width>>2),Math.max(1,height>>2));
        for(const t of eighth)t.setSize(Math.max(1,width>>3),Math.max(1,height>>3));
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
        const u=final.uniforms;
        u.glow.value=bloom?api.glow:0;u.grade.value=api.grade?1:0;u.exposure.value=api.exposure;u.time.value=time;
        u.hazeCount.value=Math.min(2,api.haze.length);
        for(let i=0;i<2;i++){const h=api.haze[i];if(h)u.haze.value[i].set(h.x,h.y,h.r,h.s);}
        pass(final,previous);
        renderer.autoClear=auto;
        return true;
      },
      dispose(){
        for(const t of [sceneTarget,half,...quarter,...eighth])t.dispose();
        for(const m of [bright,down,blur,final])m.dispose();
        geometry.dispose();
      },
      get multisampled(){return !!sceneTarget.isWebGLMultisampleRenderTarget;}
    };
    return api;
  }
  global.GraphicsPost={create};
})(typeof window!=='undefined'?window:globalThis);
