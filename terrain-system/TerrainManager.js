// ============================================================
//  TerrainManager — owns a grid of TerrainTiles, assigns each one a LOD based
//  on distance from a focus point (the aircraft, once wired in via Step 4),
//  and keeps the Three.js scene graph in sync.
//
//  The grid bookkeeping here already supported an arbitrary sparse set from
//  Step 1 on — Step 2 ("multiple tiles") turned out to be less about this
//  class (ensureTile/removeTile/updateLOD already handled any tile count) and
//  more about what happens at the seam BETWEEN tiles once neighbours can be
//  at different LOD: see TerrainTile.js's skirt for that. Step 4 ("world
//  streaming") is what will actually call ensureTile/removeTile every frame
//  from an aircraft position instead of demo.html's fixed startup grid.
// ============================================================

// Distance bands (metres) at which a tile drops to a coarser LOD. A tile
// within TERRAIN_LOD_DISTANCES[0] of the focus point gets LOD 0 (highest
// detail); within [0]..[1] gets LOD 1; beyond that, the coarsest LOD.
// Placeholder values for the Step 1 prototype — tune once flying over this
// with the real aircraft (Step 4) shows what actually needs to be sharp.
const TERRAIN_LOD_DISTANCES = [2200, 6000];

// Step 3: a tile sitting almost exactly on a threshold would otherwise flip
// LOD every frame as the focus point jitters a metre either side of it —
// each flip re-triggers a geomorph (TerrainTile.js) for nothing. Upgrading
// (more detail) is allowed the moment the raw distance calls for it — more
// detail never looks wrong even a little early. Downgrading only happens
// once the distance clears the CURRENT band's own threshold by this factor,
// so retreating has to actually mean it before detail is thrown away.
const TERRAIN_LOD_HYSTERESIS = 1.15;

function rawLodFor(d){
  for(let i = 0; i < TERRAIN_LOD_DISTANCES.length; i++){
    if(d < TERRAIN_LOD_DISTANCES[i]) return i;
  }
  return TERRAIN_LOD_DISTANCES.length;
}

class TerrainManager {
  constructor(scene, tileSize, heightProvider){
    this.scene = scene;
    this.tileSize = tileSize;
    this.heightProvider = heightProvider;
    // flatShading:false + real vertex normals from TerrainTile reads as rolling
    // ground, not faceted low-poly — matches what a LOD system needs to look
    // acceptable even at the coarsest tesselation.
    //
    // Reported (real iPad, not this sandbox's headless SwiftShader renderer):
    // the terrain mesh itself was completely invisible -- pure sky colour
    // where the ground should be -- while every OTHER mesh in this same
    // scene (roads, river, trees, buildings, historical objects, all from
    // OSMManager/VegetationManager/WaterRoadManager/HistoricalObjectManager)
    // rendered correctly, unmoved by camera position or the LEVEL button.
    // Compared every material in this whole module set: this terrain
    // material was the ONLY one with vertexColors:true (all 17 others use a
    // plain solid `color`) -- the one structural difference between the one
    // mesh that fails and everything that doesn't. Cannot reproduce on real
    // iOS hardware from this environment to prove it conclusively, but it's
    // the one real lead the evidence points to, so: dropped the per-vertex
    // biome tint (TerrainTile.js) in favour of a plain solid colour here,
    // removing vertexColors from this material entirely as the most
    // surgical way to test/fix that lead. If this resolves it, the biome
    // tint is worth re-adding later via a baked canvas texture instead (the
    // technique thunderbolt-europe.html's own ground texture already uses
    // successfully on real iPads) rather than per-vertex colours.
    // A small seamless canvas texture is reliable on iOS (unlike the former
    // per-vertex colour path) and breaks up the single bright-green sheet that
    // dominated BUILD 7. It is shared by every tile and mipmapped, so memory
    // and draw-call cost stay essentially unchanged.
    this.groundTexture = makeTerrainGroundTexture();
    this.surfaceDetailTexture = makeTerrainSurfaceAtlas();
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: this.groundTexture, roughness: 1.0, metalness: 0
    });
    this.tiles = new Map();   // "tx,tz" -> TerrainTile
  }

  _key(tx, tz){ return tx + ',' + tz; }

  // Which tile-grid cell a world position falls in.
  worldToTileCoord(x, z){
    return { tx: Math.floor(x / this.tileSize), tz: Math.floor(z / this.tileSize) };
  }

  // Ensures a tile exists at the given tile-grid coordinate, adds its mesh to
  // the scene, and returns it. Idempotent — safe to call every frame for the
  // same coordinate. `initialLod` (default 0) is only used for a brand new
  // tile's first build — WorldStreamer (Step 4) passes in whatever LOD
  // actually matches the tile's real distance, so a tile that first appears
  // near the edge of the streaming radius doesn't pay for full LOD0 detail
  // only to immediately downgrade next frame; updateLOD()'s own hysteresis/
  // morph logic still corrects it on the very next call regardless, so this
  // only needs to be approximately right, not exact.
  ensureTile(tx, tz, initialLod = 0){
    const key = this._key(tx, tz);
    let tile = this.tiles.get(key);
    if(!tile){
      tile = new TerrainTile(tx, tz, this.tileSize, this.heightProvider);
      tile.setLOD(initialLod, this.material);
      this.scene.add(tile.mesh);
      this.tiles.set(key, tile);
    }
    return tile;
  }

  removeTile(tx, tz){
    const key = this._key(tx, tz);
    const tile = this.tiles.get(key);
    if(!tile) return;
    this.scene.remove(tile.mesh);
    if(tile.landcoverTexture)tile.landcoverTexture.dispose();
    if(tile.materialOverride)tile.materialOverride.dispose();
    tile.dispose();
    this.tiles.delete(key);
  }

  hasTile(tx, tz){
    return this.tiles.has(this._key(tx, tz));
  }

  // Re-picks LOD for every currently-loaded tile based on distance to
  // (focusX, focusZ), applies hysteresis (see TERRAIN_LOD_HYSTERESIS above),
  // and advances any tile mid-geomorph by dt. Call once per frame (Step 4
  // will throttle/stagger the LOD-selection part once tile counts get large
  // enough that even just the distance checks show up as a cost — the morph
  // update itself is already only ever done for tiles actually transitioning).
  updateLOD(focusX, focusZ, dt){
    let changed=false;
    for(const tile of this.tiles.values()){
      // An aircraft at a tile corner is still directly above that tile. Centre
      // distance used to coarsen the ground beneath low passes at every seam.
      const d = tile.distanceToBounds(focusX, focusZ);
      const raw = rawLodFor(d);
      let lod = tile.lod >= 0 ? tile.lod : raw;
      if(raw < lod){
        lod = raw;   // upgrade (more detail): immediate
      } else if(raw > lod){
        const curBoundary = lod < TERRAIN_LOD_DISTANCES.length ? TERRAIN_LOD_DISTANCES[lod] : Infinity;
        if(d >= curBoundary * TERRAIN_LOD_HYSTERESIS) lod = raw;   // downgrade: only once clearly past the band
      }
      if(lod !== tile.lod){
        // At runtime, prepare clipped ground in small slices, then commit one
        // matched terrain/surface transition per frame. Startup stays immediate.
        const ready=!this.beforeLODChange||this.beforeLODChange(tile,lod);
        if(ready&&(!this.beforeLODChange||!changed)){
          tile.setLOD(lod,tile.materialOverride||this.material);changed=true;
        }
      }
      if(tile.morphing) tile.updateMorph(dt);
    }
    this.stitchEdges();
  }

  stitchEdges(){
    const dirty=new Set();
    // Use the less detailed live edge as the shared profile, also during a
    // partial morph. Skirts hide empty gaps but used to leave 69m cliffs.
    for(const a of this.tiles.values())for(const [dx,dz,ea,eb] of [[1,0,1,0],[0,1,3,2]]){
      const b=this.tiles.get(this._key(a.tileX+dx,a.tileZ+dz));if(!b)continue;
      const owner=a._edgeResolution<=b._edgeResolution?a:b,side=owner===a?ea:eb;
      const profile=owner._edgeHeights[side],ps=profile.length-1,os=Math.min(a._renderSeg,b._renderSeg);
      for(const [t,e] of [[a,ea],[b,eb]]){
        const n=t._renderSeg+1,p=t.mesh.geometry.attributes.position;
        for(let i=0;i<n;i++){
          const f=i/(n-1)*os,k=Math.min(os-1,Math.floor(f)),u=f-k;
          const y=profile[k*ps/os]*(1-u)+profile[(k+1)*ps/os]*u;
          const j=e===0?i*n:e===1?i*n+n-1:e===2?i:i+n*(n-1);
          if(Math.abs(p.getY(j)-y)>.00001){p.setY(j,y);dirty.add(t);}
        }
      }
    }
    for(const t of dirty){
      const p=t.mesh.geometry.attributes.position,n=(t._renderSeg+1)**2;
      for(let i=0;i<t._skirtTopOf.length;i++)p.setY(n+i,p.getY(t._skirtTopOf[i])-TERRAIN_SKIRT_DEPTH);
      p.needsUpdate=true;t._refreshSurfaceNormals();t.surfaceRevision=(t.surfaceRevision||0)+1;
    }
  }

  // World-space height query, independent of tiling — works whether or not a
  // tile is currently loaded at (x,z), because it goes straight to the height
  // provider. Same one-argument-pair shape as thunderbolt-europe.html's own
  // groundY(x,z), deliberately: wiring this system into the live game later
  // means pointing the EXISTING groundY() calls at this method, not rewriting
  // every caller (flight-floor clamp, AI altitude, mission placement, ...).
  getHeight(x, z){
    return this.heightProvider.getHeight(x, z);
  }

  // Height as the CURRENTLY RENDERED terrain surface actually shows it at
  // (x,z) — distinct from getHeight() above, which is the true, exact height
  // regardless of tessellation. Step 5 content that rests ON TOP of the
  // terrain (roads, rivers, trees) needs THIS one: placing something at the
  // exact true height can leave it floating above or sunk into a coarser LOD
  // tile's own straight-line interpolation between its sparser sample points
  // — measured in Step 2 at up to ~48m for the coarsest tessellation. That's
  // the same interpolation-gap problem the terrain skirt already solved for
  // tile EDGES; this is the same fix applied to content sitting on a tile's
  // INTERIOR, reusing TerrainTile.js's own coarseInterpHeight() so it matches
  // pixel-for-pixel with what that tile's mesh is actually built from. Falls
  // back to the exact height when no tile is currently loaded at that point
  // (matches getHeight()'s point, no tile) — content wouldn't be visibly
  // resting on unloaded ground anyway.
  //
  // Real-data regression (found by demo-remagen.html's own real-browser
  // verification, not anticipated up front): the ORIGINAL version below
  // only ever looked up the ONE tile worldToTileCoord() floor()s to — fine
  // for the synthetic prototype's own content, which was always placed
  // with margin well inside a tile's interior, but real Overture forest
  // polygons routinely get clipped right up to a tile's shared edge, and
  // VegetationManager/OSMManager's own scatter-sampling grids (fixed step,
  // starting at the polygon's own bounding-box min) can land a sample
  // EXACTLY on that edge or a shared corner. worldToTileCoord()'s plain
  // floor() then resolves it to whichever of the (up to four) tiles
  // touching that point happens to "start" there — which does not have to
  // be one of the ones actually loaded, even when every tile that DOES
  // touch that exact point except one IS loaded. DEMHeightProvider.getHeight()
  // already solved exactly this ambiguity for its own tile lookup via
  // tileAxisCandidates() (HeightProvider.js) — reused here (both files
  // share one global scope, same as WorldStreamer.js already reusing
  // TerrainManager.js's own rawLodFor()) so this tile-selection step tries
  // every legitimate neighbour before ever falling through to a raw
  // heightProvider call that might have nothing loaded at the exact
  // (possibly wrong) primary index either.
  getRenderedHeight(x, z){
    for(const tx of tileAxisCandidates(x, this.tileSize)){
      for(const tz of tileAxisCandidates(z, this.tileSize)){
        const tile = this.tiles.get(this._key(tx, tz));
        if(tile && tile._renderSeg >= 0){
          // Read the actual two triangles, including their current morph.
          // Bilinear DEM interpolation is a curved patch, not the rendered
          // PlaneGeometry: it put water/objects below or above the mesh.
          const seg=tile._renderSeg,n=seg+1;
          const fx=Math.max(0,Math.min(seg,(x-tx*this.tileSize)/this.tileSize*seg));
          const fz=Math.max(0,Math.min(seg,(z-tz*this.tileSize)/this.tileSize*seg));
          const ix=Math.min(seg-1,Math.floor(fx)),iz=Math.min(seg-1,Math.floor(fz));
          const u=fx-ix,v=fz-iz,p=tile.mesh.geometry.attributes.position;
          const a=ix+n*iz,b=a+n,d=a+1,c=b+1;
          return u+v<=1 ? p.getY(a)*(1-u-v)+p.getY(d)*u+p.getY(b)*v
            : p.getY(c)*(u+v-1)+p.getY(b)*(1-u)+p.getY(d)*(1-v);
        }
      }
    }
    return this.heightProvider.getHeight(x, z);
  }

  get tileCount(){ return this.tiles.size; }

  setLandcover(tx,tz,data){
    const tile=this.tiles.get(this._key(tx,tz));
    if(!tile||typeof document==='undefined')return;
    const canvas=makeTerrainLandcover(tx,tz,this.tileSize,data);
    const texture=new THREE.CanvasTexture(canvas);
    texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
    const material=this.material.clone();
    material.onBeforeCompile=shader=>{
      shader.uniforms.landCoverMap={value:texture};
      shader.uniforms.surfaceDetails={value:this.surfaceDetailTexture};
      shader.vertexShader='varying vec2 landCoverUv;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\nlandCoverUv = uv;');
      shader.fragmentShader='uniform sampler2D landCoverMap;\nuniform sampler2D surfaceDetails;\nvarying vec2 landCoverUv;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
        'vec4 cover = texture2D(landCoverMap, landCoverUv);\n'+
        'float surface = clamp(floor(cover.a * 9.0 - 1.0 + 0.5), 0.0, 7.0);\n'+
        'vec2 cell = vec2(mod(surface, 4.0), floor(surface / 4.0));\n'+
        'vec2 detailUv = (cell + fract(vUv) * 0.984 + 0.008) / vec2(4.0, 2.0);\n'+
        'float grain = texture2D(surfaceDetails, detailUv).r;\n'+
        'diffuseColor.rgb *= cover.rgb * (0.70 + grain * 0.60);');
    };
    material.customProgramCacheKey=()=> 'terrain-landcover-165';
    if(tile.landcoverTexture)tile.landcoverTexture.dispose();
    if(tile.materialOverride)tile.materialOverride.dispose();
    tile.landcoverTexture=texture;tile.materialOverride=material;tile.mesh.material=material;
  }

  dispose(){
    for(const tile of this.tiles.values()){
      this.scene.remove(tile.mesh);
      if(tile.landcoverTexture)tile.landcoverTexture.dispose();
      if(tile.materialOverride)tile.materialOverride.dispose();
      tile.dispose();
    }
    this.tiles.clear();
    this.material.dispose();
    if(this.groundTexture)this.groundTexture.dispose();
    if(this.surfaceDetailTexture)this.surfaceDetailTexture.dispose();
    if(this.airfieldSoilTexture)this.airfieldSoilTexture.dispose();
  }
}

function terrainSurfaceHash(x,z,seed=0){
  const n=Math.sin(x*127.1+z*311.7+seed*74.7)*43758.5453;return n-Math.floor(n);
}
function terrainSurfaceNoise(x,z,seed=0){
  const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,a=u*u*(3-2*u),b=v*v*(3-2*v);
  const mix=(p,q,t)=>p+(q-p)*t;
  return mix(mix(terrainSurfaceHash(ix,iz,seed),terrainSurfaceHash(ix+1,iz,seed),a),
    mix(terrainSurfaceHash(ix,iz+1,seed),terrainSurfaceHash(ix+1,iz+1,seed),a),b);
}
// Eight shared, code-generated surfaces: meadow, earth, crop, stubble,
// leaf litter, gravel, dry pasture and mottled woodland. No extra ground meshes.
function terrainPeriodicNoise(x,y,period,seed){
 const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,a=u*u*(3-2*u),b=v*v*(3-2*v);
 const wrap=n=>(n%period+period)%period,h=(dx,dy)=>terrainSurfaceHash(wrap(ix+dx),wrap(iy+dy),seed);
 const mix=(p,q,t)=>p+(q-p)*t;return mix(mix(h(0,0),h(1,0),a),mix(h(0,1),h(1,1),a),b);
}
function makeTerrainSurfaceAtlas(){
  const n=256,canvas=document.createElement('canvas');canvas.width=n*4;canvas.height=n*2;
  const ctx=canvas.getContext('2d'),img=ctx.createImageData(canvas.width,canvas.height),tau=Math.PI*2;
  for(let kind=0;kind<8;kind++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=x/n,v=y/n,hash=terrainSurfaceHash(x,y,kind),fine=hash-.5;
    const warp=terrainPeriodicNoise(u*3,v*3,3,170+kind)-.5;
    const broad=terrainPeriodicNoise(u*5+warp,v*5-warp,5,180+kind)-.5;
    const medium=terrainPeriodicNoise(u*17+warp*3,v*17-warp*2,17,190+kind)-.5;
    let value=.5+broad*.10+medium*.09+fine*.055;
    if(kind===0)value+=terrainPeriodicNoise(u*47,v*47,47,201)*.025;
    if(kind===1)value+=terrainPeriodicNoise(u*31,v*31,31,202)*.035;
    if(kind===2)value+=Math.sin((u*31+warp*.6)*tau)*.025;
    if(kind===3)value+=(hash>.91?.055:0);
    if(kind===4)value+=terrainPeriodicNoise(u*39+warp,v*39,39,204)*.04;
    if(kind===5)value+=(hash>.85?.12:hash<.14?-.09:0);
    if(kind===6)value+=terrainPeriodicNoise(u*23+warp*2,v*23,23,206)*.035;
    if(kind===7)value+=terrainPeriodicNoise(u*29-warp,v*29+warp,29,207)*.065;
    const i=((y+Math.floor(kind/4)*n)*canvas.width+x+(kind%4)*n)*4;
    img.data[i]=img.data[i+1]=img.data[i+2]=Math.round(Math.max(.28,Math.min(.73,value))*255);img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);const tex=new THREE.CanvasTexture(canvas);
  tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.anisotropy=4;return tex;
}
function makeTerrainLandcover(tx,tz,tileSize,data){
  const n=128,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d'),base=ctx.createImageData(n,n);
  const makePattern=(forest=false)=>{
    const c=document.createElement('canvas');c.width=c.height=n;const p=c.getContext('2d'),img=p.createImageData(n,n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const wx=(tx+(x+.5)/n)*tileSize,wz=(tz+(y+.5)/n)*tileSize;
      const px=Math.floor((wx*.94+wz*.342)/270),pz=Math.floor((-wx*.342+wz*.94)/185);
      const pick=Math.floor(terrainSurfaceHash(px,pz,61)*5);
      const shade=terrainSurfaceNoise(wx/170,wz/170,13)*14-7;
      const palette=forest?[[57,72,47],[78,77,49],[66,82,56],[88,85,54],[53,66,44]]:
        [[145,115,82],[170,151,103],[124,133,79],[151,142,100],[130,115,89]];
      const rgb=palette[forest?Math.min(4,Math.floor(terrainSurfaceNoise(wx/470,wz/470,71)*5)):pick];
      const i=(y*n+x)*4;for(let ch=0;ch<3;ch++)img.data[i+ch]=rgb[ch]+shade;img.data[i+3]=255;
    }
    p.putImageData(img,0,0);return c;
  };
  const farms=makePattern(),woods=makePattern(true),kindCanvas=document.createElement('canvas');kindCanvas.width=kindCanvas.height=n;
  const kinds=kindCanvas.getContext('2d'),kindImg=kinds.createImageData(n,n);
  const farmKindCanvas=document.createElement('canvas');farmKindCanvas.width=farmKindCanvas.height=n;
  const farmKindCtx=farmKindCanvas.getContext('2d'),farmKinds=farmKindCtx.createImageData(n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const wx=(tx+(x+.5)/n)*tileSize,wz=(tz+(y+.5)/n)*tileSize;
    const dry=terrainSurfaceNoise(wx/850,wz/850,23),soil=terrainSurfaceNoise(wx/290,wz/290,24);
    const rgb=dry>.58?[148,141,101]:soil>.66?[130,117,89]:[112,127,87];
    const shade=terrainSurfaceNoise(wx/180,wz/180,25)*16-8,kind=dry>.58?6:soil>.66?5:0,i=(y*n+x)*4;
    for(let ch=0;ch<3;ch++)base.data[i+ch]=rgb[ch]+shade;
    base.data[i+3]=255;kindImg.data[i]=Math.round((kind+1)/9*255);kindImg.data[i+3]=255;
    const pick=Math.floor(terrainSurfaceHash(Math.floor((wx*.94+wz*.342)/270),Math.floor((-wx*.342+wz*.94)/185),61)*5);
    farmKinds.data[i]=Math.round(([1,3,2,6,1][pick]+1)/9*255);farmKinds.data[i+3]=255;
  }
  ctx.putImageData(base,0,0);kinds.putImageData(kindImg,0,0);farmKindCtx.putImageData(farmKinds,0,0);
  const trace=(c,ring)=>{c.beginPath();c.moveTo(ring[0][0]/tileSize*n,ring[0][1]/tileSize*n);
    for(let i=1;i<ring.length;i++)c.lineTo(ring[i][0]/tileSize*n,ring[i][1]/tileSize*n);c.closePath();};
  for(const [rings,pattern,isForest] of [[data.farmland||[],farms,false],[data.forests||[],woods,true]])for(const ring of rings){
    if(ring.length<3)continue;ctx.fillStyle=ctx.createPattern(pattern,'no-repeat');trace(ctx,ring);ctx.fill();
    if(isForest){kinds.fillStyle='rgb(227,0,0)';trace(kinds,ring);kinds.fill();}
    else{
      // Clip world-aligned visual crop parcels to the real farmland outline.
      kinds.fillStyle=kinds.createPattern(farmKindCanvas,'no-repeat');trace(kinds,ring);kinds.fill();
    }
  }
  const result=ctx.getImageData(0,0,n,n),types=kinds.getImageData(0,0,n,n);
  for(let i=0;i<result.data.length;i+=4)result.data[i+3]=types.data[i];
  ctx.putImageData(result,0,0);return canvas;
}

function makeTerrainGroundTexture(){
  const size=256;
  const canvas=document.createElement('canvas');
  canvas.width=size; canvas.height=size;
  const ctx=canvas.getContext('2d');
  const img=ctx.createImageData(size,size);
  const tau=Math.PI*2;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    // Integer-frequency waves make opposite texture edges meet cleanly.
    const u=x/size*tau,v=y/size*tau;
    const broad=(Math.sin(u*2+v)+Math.cos(v*3-u)+Math.sin((u+v)*5))*0.333;
    const medium=(Math.sin(u*11-v*7)+Math.cos(v*13+u*3))*0.5;
    const hash=Math.sin(x*12.9898+y*78.233)*43758.5453;
    const grain=(hash-Math.floor(hash))-0.5;
    const furrow=Math.sin(u*43+Math.sin(v*2))*Math.sin(v*5);
    const light=broad*10+medium*4+grain*9+furrow*1.5;
    const i=(y*size+x)*4;
    // Muted Rhine-valley grass/soil palette: olive, moss and earth rather
    // than saturated toy green. Lighting still supplies the slope shading.
    img.data[i]=Math.max(0,Math.min(255,92+light));
    img.data[i+1]=Math.max(0,Math.min(255,105+light*1.15));
    img.data[i+2]=Math.max(0,Math.min(255,61+light*0.65));
    img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(16,16);            // ~250m visual repeat on a 4km tile
  tex.anisotropy=4;
  if(THREE.sRGBEncoding!==undefined) tex.encoding=THREE.sRGBEncoding;
  tex.needsUpdate=true;
  return tex;
}
