'use strict';
// Build 291: shared lighting (graphics-light.js). Checks, against three r128's real shader chunks:
//   * the sky-probe patch: Standard materials skip their environment map's DIFFUSE term only while a light probe is
//     present (uniform test), reflections untouched; idempotent;
//   * the PCSS patch: negative shadow.radius takes the new lookup, positive keeps PCF / PCF-soft; it coexists with the
//     Build 279/285 edge-fade patch in either order (the fade still wraps the result);
//   * the PCSS radius (penumbra per unit of shadow depth) and the ambient-occlusion height fade;
//   * the spherical-harmonics projection used by the sky bake gives a uniform sky back as a uniform irradiance pi*L.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const THREE=require('three');
const lightSource=fs.readFileSync(path.join(__dirname,'../../graphics-light.js'),'utf8');
const fade=chunk=>chunk.replace('float getShadow(','float shadowEdgeFade(vec2 uv){vec2 e=min(uv,1.0-uv);return smoothstep(0.0,0.16,min(e.x,e.y));}\n\tfloat getShadow(')
  .replace(/(#endif\s*\}\s*)return shadow;/,'$1return mix(1.0,shadow,shadowEdgeFade(shadowCoord.xy));');
const original={maps:THREE.ShaderChunk.lights_fragment_maps,shadow:THREE.ShaderChunk.shadowmap_pars_fragment};
function load(){const win={THREE};new Function('window',lightSource)(win);return win.GraphicsLight;}

// 1) patch, then edge fade (the Rhine: graphics-light.js loads before graphics-extras.js)
let GL=load();
assert.deepEqual(GL.patched,{probe:true,pcss:true});
const maps=THREE.ShaderChunk.lights_fragment_maps;
assert.ok(maps.includes('/* skyProbe */ if ( dot( lightProbe[ 0 ], lightProbe[ 0 ] ) < 1e-10 ) iblIrradiance += getLightProbeIndirectIrradiance'));
assert.ok(maps.includes('radiance += getLightProbeIndirectRadiance'),'reflections stay');
let shadow=THREE.ShaderChunk.shadowmap_pars_fragment;
assert.equal((shadow.match(/float pcssShadow\(/g)||[]).length,1);
assert.ok(shadow.indexOf('float pcssShadow(')<shadow.indexOf('float getShadow('),'PCSS function precedes getShadow');
assert.ok(shadow.includes('if ( frustumTest && shadowRadius < 0.0 ) {')&&shadow.includes('} else if ( frustumTest ) {'));
assert.ok(shadow.includes('#if defined( SHADOWMAP_TYPE_PCF )')&&shadow.includes('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )'),'three filters kept');
const faded=fade(shadow);assert.ok(faded.includes('return mix(1.0,shadow,shadowEdgeFade(shadowCoord.xy));'),'edge fade still applies after PCSS');
// idempotent
assert.deepEqual(GL.patchChunks(THREE),{probe:true,pcss:true});
assert.equal(THREE.ShaderChunk.lights_fragment_maps,maps);assert.equal(THREE.ShaderChunk.shadowmap_pars_fragment,shadow);

// 2) edge fade first, then PCSS (the Pacific patches inline after loading graphics-light.js; check the other order too)
THREE.ShaderChunk.lights_fragment_maps=original.maps;THREE.ShaderChunk.shadowmap_pars_fragment=fade(original.shadow);
GL=load();assert.deepEqual(GL.patched,{probe:true,pcss:true});
shadow=THREE.ShaderChunk.shadowmap_pars_fragment;
assert.ok(shadow.includes('return mix(1.0,shadow,shadowEdgeFade(shadowCoord.xy));')&&shadow.includes('shadow = pcssShadow( shadowMap, shadowMapSize, - shadowRadius, shadowCoord.xyz );'));
// brace balance inside getShadow is unchanged by the patch
const body=s=>{const a=s.indexOf('float getShadow(');const b=s.indexOf('vec2 cubeToUV(');return s.slice(a,b);};
const count=(s,c)=>s.split(c).length-1;
assert.equal(count(body(shadow),'{')-count(body(shadow),'}'),count(body(fade(original.shadow)),'{')-count(body(fade(original.shadow)),'}'));

// 3) PCSS radius: -(far-near)*tan/width; ambient occlusion fade
const cam=new THREE.OrthographicCamera(-360,360,360,-360,10,5200);
assert.ok(Math.abs(GL.pcssRadius(cam)-(-5190*.03/720))<1e-12);
// 60 m between an aircraft and the ground: penumbra 60*tan .03 = 1.8 m = (60/5190)*k*720 m
assert.ok(Math.abs((60/5190)*-GL.pcssRadius(cam)*720-1.8)<1e-9);
assert.equal(GL.aoForHeight(40),1);assert.equal(GL.aoForHeight(150),1);assert.equal(GL.aoForHeight(400),.5);assert.equal(GL.aoForHeight(650),0);assert.equal(GL.aoForHeight(3000),0);

// 4) the bake's projection (same face mapping and weights as three's LightProbeGenerator): a uniform sky of
// radiance L must come back as irradiance pi*L in every direction. Run the bake with a fake renderer.
const L=.4;
const fake={toneMapping:THREE.ACESFilmicToneMapping,getRenderTarget:()=>null,setRenderTarget(){},
  readRenderTargetPixels(t,x,y,w,h,data){for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=Math.round(L*255);data[i+3]=255;}}};
const realUpdate=THREE.CubeCamera.prototype.update;THREE.CubeCamera.prototype.update=function(){};
try{
  const sky=GL.createSky(THREE,fake,{size:8});sky.bake(new THREE.Scene(),{intensity:1});
  const l=Math.round(L*255)/255;
  for(const n of [[0,1,0],[0,-1,0],[1,0,0],[0,0,-1],[.6,.8,0]]){
    const v=sky.probe.sh.getIrradianceAt(new THREE.Vector3(...n).normalize(),new THREE.Vector3());
    assert.ok(Math.abs(v.x-Math.PI*l)<.02*Math.PI*l,'uniform sky -> uniform irradiance '+n+' '+v.x);
  }
  assert.equal(fake.toneMapping,THREE.ACESFilmicToneMapping,'tone mapping restored');
  sky.off();assert.equal(sky.probe.intensity,0);
}finally{THREE.CubeCamera.prototype.update=realUpdate;}
THREE.ShaderChunk.lights_fragment_maps=original.maps;THREE.ShaderChunk.shadowmap_pars_fragment=original.shadow;
console.log('graphics-light: probe + PCSS patches, both orders, radius, AO fade, SH bake OK');
