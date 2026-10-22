/* 1942 finish for the repository's Avenger, "Grumman Tbm Avenger" by helijah (Emmanuel
 * Baranger, with Laurent Hayvel), CC BY 4.0. Swaps the embedded airframe atlas of
 * grumman tbm avenger.glb for the repainted one baked by scripts/bake-avenger-livery.cjs
 * (non-specular Blue-Gray over Light Gray, 1942 insignia, weathering) plus its panel-line
 * normal map, and sets matte paint values. Geometry, UVs and every other texture stay as
 * delivered. Runs once per decoded source model; clones share the result. If a file fails
 * to load, the original texture stays.
 *
 * The livery atlas is deliberately full 2048 px even on touch devices: the original atlas was
 * cut to 512 px there (PacificAssets), which is what made the Avenger look blurry next to the
 * Rhine aircraft.
 */
(function(root){
'use strict';
const FILES={map:'assets/aircraft/avenger-1942-livery.webp?v=198',normal:'assets/aircraft/avenger-1942-normal.png?v=198'};
const ATLAS='DefaultWhite_texture.png',GLASS='transparentExt';

function findAtlas(model){
  let found=null;
  model.traverse(o=>{if(found||!o.isMesh)return;for(const m of [].concat(o.material||[]))if(m&&m.name===ATLAS&&m.map){found=m;return;}});
  return found;
}
function load(THREE,url){return new Promise((resolve,reject)=>new THREE.TextureLoader().load(url,resolve,undefined,reject));}

async function apply(THREE,model,opts={}){
  const material=findAtlas(model);if(!material)return null;
  if(material.userData.avengerFinish)return material.userData.avengerFinish;
  const files=opts.files||FILES;
  let map,normal;
  try{[map,normal]=await Promise.all([load(THREE,files.map),load(THREE,files.normal)]);}
  catch(e){if(root.console)console.warn('Avenger livery not loaded; original texture kept',e);return null;}
  const source=material.map;
  for(const t of [map,normal]){t.flipY=false;t.wrapS=source.wrapS;t.wrapT=source.wrapT;t.anisotropy=Math.max(source.anisotropy||1,opts.anisotropy||4);t.needsUpdate=true;}
  map.encoding=source.encoding;
  source.dispose();
  material.map=map;material.normalMap=normal;
  // glTF convention (texture not flipped): green points the other way, as GLTFLoader does.
  material.normalScale=new THREE.Vector2(.45,-.45);
  material.roughness=.86;material.metalness=0;material.needsUpdate=true;
  // canopy: thin, slightly reflective glazing instead of milky plastic
  model.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material||[]))if(m&&m.name===GLASS&&!m.userData.avengerFinish){m.color.setRGB(.62,.70,.74);m.roughness=.08;m.metalness=.2;m.userData.avengerFinish=true;m.needsUpdate=true;}});
  const info={map:files.map,normal:files.normal,size:map.image.width};
  material.userData.avengerFinish=info;
  return info;
}

const AvengerFinish={apply,findAtlas,FILES};
root.AvengerFinish=AvengerFinish;
if(typeof module==='object'&&module.exports)module.exports=AvengerFinish;
})(typeof window!=='undefined'?window:globalThis);
