// Build 291: shared lighting for both games (GRAPHICS-PLAN, light pass 2).
//   * Sky light for EVERY lit material. A 9-coefficient spherical-harmonics light probe is measured from the
//     game's own sky (rendered once into a 16-px cube, read back, projected). r128 adds a light probe to the
//     ambient light of Lambert, Phong, Toon and Standard materials alike, so the sky's colour and direction
//     (bright horizon, warm sun side, darker ground) now reach every surface, not only the aircraft.
//     Where a Standard material also has an environment map (the Rhine's Ultra sky or an aircraft reflection),
//     its environment DIFFUSE term is skipped while a probe is active (the probe is the same sky, already
//     convolved); the environment map keeps doing what only it can do: reflections. Without a probe every
//     shader behaves exactly as before (the switch is a uniform test, no recompile).
//   * Soft shadows by percentage-closer soft shadows (PCSS): a blocker search finds how far above the receiver
//     the occluder is, the filter widens with that distance (a tree's shadow is crisp at the trunk and soft at
//     the crown, an aircraft's shadow soft from altitude). Switched on per light with a NEGATIVE shadow.radius
//     (the magnitude is the penumbra growth in shadow-map UV per unit of shadow depth); a positive radius keeps
//     three's own PCF / PCF-soft filter. One patch serves both games; no recompile when it is toggled.
(function(global){
  'use strict';
  const PCSS_FN=`
	float pcssShadow( sampler2D map, vec2 size, float k, vec3 c ) {
		// Build 291: PCSS. 12-tap blocker search, 16-tap filter, both on a Vogel disc turned per pixel.
		float texel = 1.0 / size.x;
		float rot = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		float search = 9.0 * texel, zb = 0.0, nb = 0.0;
		for ( int i = 0; i < 12; i ++ ) {
			float fi = float( i ), a = fi * 2.3999632 + rot;
			vec2 o = vec2( cos( a ), sin( a ) ) * sqrt( ( fi + 0.5 ) / 12.0 ) * search;
			float d = unpackRGBAToDepth( texture2D( map, c.xy + o ) );
			if ( d < c.z ) { zb += d; nb += 1.0; }
		}
		if ( nb < 0.5 ) return 1.0;
		zb /= nb;
		float pen = clamp( ( c.z - zb ) * k, 0.75 * texel, 12.0 * texel );
		float s = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			float fi = float( i ), a = fi * 2.3999632 + rot;
			vec2 o = vec2( cos( a ), sin( a ) ) * sqrt( ( fi + 0.5 ) / 16.0 ) * pen;
			s += texture2DCompare( map, c.xy + o, c.z );
		}
		return s / 16.0;
	}
`;
  function patchChunks(THREE){
    const C=THREE.ShaderChunk,report={probe:false,pcss:false};
    const ENV='iblIrradiance += getLightProbeIndirectIrradiance( geometry, maxMipLevel );';
    if(C.lights_fragment_maps.includes('/* skyProbe */'))report.probe=true;
    else if(C.lights_fragment_maps.includes(ENV)){
      C.lights_fragment_maps=C.lights_fragment_maps.replace(ENV,'/* skyProbe */ if ( dot( lightProbe[ 0 ], lightProbe[ 0 ] ) < 1e-10 ) '+ENV);
      report.probe=true;
    }
    const S=C.shadowmap_pars_fragment;
    if(S.includes('pcssShadow'))report.pcss=true;
    else if(S.includes('float getShadow(')&&S.includes('if ( frustumTest ) {')){
      C.shadowmap_pars_fragment=S.replace('float getShadow(',PCSS_FN+'\tfloat getShadow(')
        .replace('if ( frustumTest ) {','if ( frustumTest && shadowRadius < 0.0 ) {\n\t\t\tshadow = pcssShadow( shadowMap, shadowMapSize, - shadowRadius, shadowCoord.xyz );\n\t\t} else if ( frustumTest ) {');
      report.pcss=true;
    }
    return report;
  }

  // Shadow-depth units are (far - near) of the shadow camera; one unit of depth gap widens the penumbra by
  // (far - near) * tan(light size) metres, i.e. that over the box width in UV. tan .03 is a game choice: the real
  // sun (0.27 deg) gives penumbras under one shadow texel (0.35 m on High) at these box sizes, invisible; .03 makes a
  // 15 m tree's shadow end ~0.45 m soft and an aircraft's shadow from 60 m ~1.8 m soft (capped at 12 texels).
  function pcssRadius(shadowCamera,tan=.03){
    const width=Math.max(1,shadowCamera.right-shadowCamera.left),depth=Math.max(1,shadowCamera.far-shadowCamera.near);
    return -depth*tan/width;
  }

  function createSky(THREE,renderer,{size=16}={}){
    const target=new THREE.WebGLCubeRenderTarget(size,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,generateMipmaps:false,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    const cubeCamera=new THREE.CubeCamera(.1,1000,target);
    const probe=new THREE.LightProbe();probe.name='skyLightProbe';probe.intensity=0;
    const data=new Uint8Array(size*size*4),coord=new THREE.Vector3(),dir=new THREE.Vector3(),basis=new Array(9).fill(0);
    let measured=null;
    // Render `sky` (a scene with only the sky, and a floor if the game has one) and project it onto SH.
    function bake(sky,{intensity=1}={}){
      const tone=renderer.toneMapping,rt=renderer.getRenderTarget(),xr=renderer.xr?.enabled;
      renderer.toneMapping=THREE.NoToneMapping;if(renderer.xr)renderer.xr.enabled=false;
      cubeCamera.position.set(0,0,0);cubeCamera.updateMatrixWorld(true);
      try{cubeCamera.update(renderer,sky);}finally{renderer.toneMapping=tone;renderer.setRenderTarget(rt);if(renderer.xr)renderer.xr.enabled=xr;}
      const sh=probe.sh;for(const c of sh.coefficients)c.set(0,0,0);
      let total=0;const pixel=2/size;
      for(let face=0;face<6;face++){
        renderer.readRenderTargetPixels(target,0,0,size,size,data,face);
        for(let i=0;i<data.length;i+=4){
          const p=i>>2,col=-1+(p%size+.5)*pixel,row=1-(Math.floor(p/size)+.5)*pixel;
          switch(face){case 0:coord.set(1,row,-col);break;case 1:coord.set(-1,row,col);break;case 2:coord.set(col,1,-row);break;
            case 3:coord.set(col,-1,row);break;case 4:coord.set(col,row,1);break;default:coord.set(-col,row,-1);}
          const l2=coord.lengthSq(),w=4/(Math.sqrt(l2)*l2);total+=w;
          dir.copy(coord).normalize();THREE.SphericalHarmonics3.getBasisAt(dir,basis);
          const r=data[i]/255*w,g=data[i+1]/255*w,b=data[i+2]/255*w;
          for(let j=0;j<9;j++){const c=sh.coefficients[j];c.x+=basis[j]*r;c.y+=basis[j]*g;c.z+=basis[j]*b;}
        }
      }
      const norm=4*Math.PI/total;for(const c of sh.coefficients)c.multiplyScalar(norm);
      probe.intensity=intensity;measured=null;
      return probe;
    }
    // Luminance of the probe's irradiance for a surface facing `normal` (for matching it to the hemisphere light).
    function irradiance(normal){
      const c=new THREE.Color();const v=probe.sh.getIrradianceAt(normal,new THREE.Vector3());
      c.setRGB(v.x,v.y,v.z);return {colour:c,luminance:.2126*v.x+.7152*v.y+.0722*v.z};
    }
    return {probe,bake,irradiance,
      get measured(){if(!measured)measured={up:irradiance(new THREE.Vector3(0,1,0)).luminance,down:irradiance(new THREE.Vector3(0,-1,0)).luminance};return measured;},
      off(){probe.intensity=0;},
      dispose(){target.dispose();probe.parent?.remove(probe);}};
  }

  // Ambient occlusion matters near the ground: full below 150 m above ground, gone by 650 m (it only costs
  // while it shows).
  function aoForHeight(agl){return Math.max(0,Math.min(1,(650-agl)/500));}

  global.GraphicsLight={patchChunks,pcssRadius,createSky,aoForHeight};
  // Patched once, at load, before either game compiles a single program.
  if(global.THREE?.ShaderChunk)global.GraphicsLight.patched=patchChunks(global.THREE);
})(typeof window!=='undefined'?window:globalThis);
