/* Pacific GLBs: one decode per URL, bounded textures, and preflight loading.
 * Keep original geometry/UVs/propellers. No low-poly replacement aircraft. */
(function(global){
 'use strict';
 const sources=new Map();
 const maxTextureSize=(global.navigator?.maxTouchPoints||0)>0?512:1024;
 function boundTextures(root,limit=maxTextureSize){
  const textures=new Set(),images=new Map();let before=0,after=0;
  root.traverse(o=>{for(const material of [].concat(o.material||[])){
   for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }});
  for(const texture of textures){
   const image=texture.image;if(!image)continue;
   const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
   if(!width||!height)continue;
   before+=width*height*4*4/3;
   if(Math.max(width,height)>limit){
    let canvas=images.get(image);
    if(!canvas){
     canvas=global.document.createElement('canvas');
     const scale=limit/Math.max(width,height);
     canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
     canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);images.set(image,canvas);
    }
    texture.image=canvas;texture.needsUpdate=true;
   }
   after+=texture.image.width*texture.image.height*4*4/3;
  }
  // ImageBitmap keeps its own decoded allocation; no texture refers to the
  // resized source now. HTML images have no close() and are collected normally.
  for(const image of images.keys())if(typeof image.close==='function')image.close();
  return {before,after,textures:textures.size};
 }
 // Per-model finishing step, run once on the decoded source before any clone is handed out
 // (e.g. the Avenger's repainted livery). A failed step keeps the delivered model.
 const prepares=[];
 function configure(match,prepare){prepares.push({match,prepare});}
 function source(url){
  if(sources.has(url))return sources.get(url);
  const task=new Promise((resolve,reject)=>{
   const timeout=global.setTimeout(()=>reject(Error('Model download timed out: '+url)),60000);
   const fail=error=>{global.clearTimeout(timeout);reject(error);};
   try{new global.THREE.GLTFLoader().load(url,async gltf=>{
    try{
     const root=gltf.scene||gltf.scenes?.[0];if(!root)throw Error('GLB has no scene: '+url);
     boundTextures(root);
     global.clearTimeout(timeout);   // download done; the finish has its own bound
     // At most 20 s: a stalled finish never blocks the mission (a late one still applies).
     for(const p of prepares)if(url.includes(p.match)){
      let bound;
      try{await Promise.race([p.prepare(root),new Promise(r=>bound=global.setTimeout(r,20000))]);}
      catch(e){global.console?.warn('Model finish failed; delivered textures kept: '+url,e);}
      finally{global.clearTimeout(bound);}
     }
     // Retain only the scene, not GLTFParser's decoded-image and binary caches.
     resolve(root);
    }catch(e){fail(e);}
   },undefined,fail);}catch(error){fail(error);}
  }).catch(error=>{sources.delete(url);throw error;});
  sources.set(url,task);return task;
 }
 function loader(){return {load(url,onLoad,_onProgress,onError){
  return source(url).then(root=>onLoad({scene:root.clone(true)})).catch(error=>{
   if(onError)onError(error);else throw error;
  });
 }};}
 global.PacificAssets={loader,boundTextures,configure,maxTextureSize};
})(window);
