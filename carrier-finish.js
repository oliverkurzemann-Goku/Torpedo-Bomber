/* Local-coordinate paint and wear. The same finish follows the hull as it moves and rolls. */
(function(root){
  'use strict';
  const surface=`
float cvHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cvNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(cvHash(i),cvHash(i+vec2(1.,0.)),f.x),mix(cvHash(i+vec2(0.,1.)),cvHash(i+1.),f.x),f.y);}
float cvJoint(float p,float width){return 1.-smoothstep(width*.4,width,abs(fract(p+.5)-.5));}
`;
  const flightDeck=`
  vec2 plank=vec2(cv.x/.31,cv.z/5.9+cvHash(vec2(floor(cv.x/.31),2.0)));
  float board=cvHash(floor(plank)),line=cvJoint(plank.x,.055),joint=cvJoint(plank.y,.017);
  float deckCloud=cvNoise(cv.xz*vec2(.33,.075));
  float grain=cvNoise(cv.xz*vec2(23.,.67));
  float runway=exp(-abs(cv.x)*.37)*smoothstep(-116.,-88.,cv.z)*(1.-smoothstep(-40.,-21.,cv.z));
  float tyres=runway*cvNoise(cv.xz*vec2(2.3,.083));
  float oil=smoothstep(.61,.82,cvNoise(cv.xz*.29))*smoothstep(6.,11.,abs(cv.x));
  diffuseColor.rgb*=.84+board*.24+deckCloud*.19+cvNear*((grain-.5)*.17-line*.11-joint*.08)-tyres*.25-oil*.32;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.12,1.06,.93),${'CV_JAPAN'}*.53);
`;
  const exterior=`
  vec2 plate=vec2(cv.z/5.1,cv.y/1.85);
  float panel=cvHash(floor(plate+vec2(floor(plate.y)*.43,0.)));
  float seams=max(cvJoint(plate.x+floor(plate.y)*.43,.018),cvJoint(plate.y,.040));
  float streak=cvNoise(vec2(cv.z*.63,cv.y*.072));
  float broad=cvNoise(vec2(cv.z*.041,cv.y*.17));
  float dry=smoothstep(4.,24.,cv.y);
  float waterline=1.-smoothstep(.32,2.15,abs(cv.y-.65));
  float runoff=smoothstep(.67,.84,streak)*(1.-smoothstep(.62,.81,cvNoise(cv.zy*.047)));
  float soot=(1.-smoothstep(1.,13.,abs(cv.z+3.)))*smoothstep(24.,30.5,cv.y)*(1.-${'CV_JAPAN'});
  diffuseColor.rgb*=.76+panel*.20+dry*.13+broad*.29-cvNear*seams*.15-waterline*.23-soot*.24;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.43,.84,.59),runoff*(.29+.29*waterline));
`;
  const bases={deckPaint:'deck',glass:'glass',hullPaint:'steel',usSteel:'steel',usDark:'steel',usLight:'steel',jpSteel:'steel',jpDark:'steel',jpLight:'steel',deckEdge:'steel'};
  function apply(model,kind){
    model.traverse(node=>{
      const mat=node.material,type=bases[mat?.name];
      if(!type||mat.userData.carrierFinish)return;
      mat.userData.carrierFinish=kind;
      if(type==='glass'){mat.roughness=.26;mat.metalness=.32;}
      mat.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCarrierLocal;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nvCarrierLocal=position;');
        const finish=type==='deck'?flightDeck:type==='steel'?exterior:
          'diffuseColor.rgb*=mix(.76,1.30,cvNoise(vec2(cv.z*1.6,cv.y*4.2)));';
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCarrierLocal;\n'+surface)
          .replace('#include <map_fragment>','#include <map_fragment>\n{vec3 cv=vCarrierLocal; float cvNear=1.-smoothstep(30.,480.,length(vViewPosition));\n'
            +finish.replace(/CV_JAPAN/g,kind==='kaga'?'1.0':'0.0')+'\n}');
      };
      mat.customProgramCacheKey=()=>`carrier-wear-289/${type}/${kind}`;
      mat.needsUpdate=true;
    });
  }
  root.CarrierFinish={apply};
  if(typeof module==='object'&&module.exports)module.exports=root.CarrierFinish;
})(typeof window==='undefined'?globalThis:window);
