// ============================================================
// OSMManager — renders the offline real-world feature tiles used by Remagen.
// Public contract is intentionally unchanged: loadTile(), unloadTile(), tiles.
// See /TERRAIN.md before changing terrain, buildings, vegetation or LOD logic.
// ============================================================

class OSMManager {
  static get BUILD(){ return 23; }
  constructor(scene, tileSize, terrainManager, baseUrl = 'data/osm/'){
    this.scene = scene;
    this.tileSize = tileSize;
    this.terrain = terrainManager;
    this.baseUrl = baseUrl;
    this.tiles = new Map();
    this.sourceTiles = new Map();
    this.waterIndex = null;
    this.churchKeys = new Set();

    this.roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
    this.railMat = new THREE.MeshStandardMaterial({ color: 0x585048, roughness: 0.8 });
    // Muted, fairly rough water suits an overcast inland river. BUILD 16's
    // bright 48m wave tile produced a severe checker/moire pattern on iPad.
    this.riverMat = new THREE.MeshStandardMaterial({ color: 0x365f66, roughness: 0.84, metalness: 0 });
    this.lakeMat = new THREE.MeshStandardMaterial({ color: 0x3a6268, roughness: 0.82, metalness: 0 });
    this.waterTexture=makeOSMWaterTexture();
    this.riverMat.map=this.lakeMat.map=this.waterTexture;
    // Farmland is a subtle tint over the textured terrain, not an opaque map
    // polygon. Opaque yellow polygons made whole valleys read like a board game.
    this.farmMat = new THREE.MeshStandardMaterial({
      color: 0x8a8054, roughness: 1, transparent: true, opacity: 0.20,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
    });

    // Building palette: still cheap/instanced, but no longer one identical box everywhere.
    this.buildingWarmMat = new THREE.MeshStandardMaterial({ color: 0xcfc4ac, roughness: 0.95 });
    this.buildingCoolMat = new THREE.MeshStandardMaterial({ color: 0x9fa5a2, roughness: 0.98 });
    this.buildingOchreMat = new THREE.MeshStandardMaterial({ color: 0xc09b66, roughness: 0.97 });
    this.buildingBrickMat = new THREE.MeshStandardMaterial({ color: 0xa26e5c, roughness: 0.98 });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x653b31, roughness: 0.95 });
    this.roofSlateMat = new THREE.MeshStandardMaterial({ color: 0x454b4a, roughness: 0.98 });
    this.roofBrownMat = new THREE.MeshStandardMaterial({ color: 0x574439, roughness: 1 });
    this.flatRoofMat = new THREE.MeshStandardMaterial({ color: 0x4d4b45, roughness: 1 });
    this.chimneyMat = new THREE.MeshStandardMaterial({ color: 0x4e4038, roughness: 1 });
    this.facadeDetailMat = new THREE.MeshStandardMaterial({ color: 0x27302d, roughness: 0.85 });
    // Four genuinely different atlases, one per existing material bucket. This
    // changes no draw-call budget, but stops every house from carrying the same
    // perfectly mirrored window grid when seen low over a village.
    this.facadeTextures = [0,1,2,3].map(makeOSMFacadeTexture);
    this.roofTexture = makeOSMRoofTexture();
    [this.buildingWarmMat,this.buildingCoolMat,this.buildingOchreMat,this.buildingBrickMat]
      .forEach((mat,i)=>{ mat.map=this.facadeTextures[i];
        mat.onBeforeCompile=shader=>{
          shader.vertexShader="attribute vec2 facadeVariant;\n"+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace("#include <uv_vertex>","#include <uv_vertex>\n#ifdef USE_UV\nvUv = vUv * 0.5 + facadeVariant;\n#endif");
        };
        mat.customProgramCacheKey=()=>"period-facade-atlas-166";
      });
    this.roofMat.map = this.roofSlateMat.map = this.roofBrownMat.map = this.roofTexture;

    // A subdued polygon floor makes mapped woods read as one continuous mass
    // from the air. Individual trees remain for silhouette/parallax up close;
    // this adds one bounded draw call per tile, not more tree instances.
    this.forestFloorMat = new THREE.MeshStandardMaterial({
      color:0x29472a,roughness:1,transparent:true,opacity:.62,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1
    });
    // Vegetation palette. Four tree draw calls plus one forest-floor draw call
    // maximum per tile regardless of how many source polygons exist.
    this.trunkGeo = new THREE.CylinderGeometry(0.34, 0.48, 5.5, 6);
    this.coniferGeo = makeOSMForestCrown(0);
    this.deciduousGeo = makeOSMForestCrown(1);
    this.poplarGeo=normaliseOSMForestCrown(makeOSMTreeCrown(3));
    this.willowGeo=normaliseOSMForestCrown(makeOSMTreeCrown(4));
    this.shrubGeo = new THREE.DodecahedronGeometry(2.3, 0);
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x51402d, roughness: 1 });
    this.coniferMat = new THREE.MeshStandardMaterial({ color: 0x3a4c37, roughness: 1 });
    this.deciduousMat = new THREE.MeshStandardMaterial({ color: 0x4c6243, roughness: 1 });
    this.shrubMat = new THREE.MeshStandardMaterial({ color: 0x536f3a, roughness: 1 });
    this.poplarMat=new THREE.MeshStandardMaterial({color:0x52613b,roughness:1});
    this.willowMat=new THREE.MeshStandardMaterial({color:0x65735a,roughness:1});
    this.foliageTexture=makeOSMForestTexture();
    for(const mat of [this.coniferMat,this.deciduousMat,this.poplarMat,this.willowMat])mat.map=this.foliageTexture;

    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.wallGeo = makeOSMWallGeometry();
    // Proper gable prism: the previous four-sided cone was a pyramid. Once
    // stretched over a rectangular footprint it produced the implausible tall,
    // diagonal roof faces visible in BUILD 7 screenshots.
    this.gableRoofGeo = makeGableRoofGeometry();
    this.hipRoofGeo = makeHipRoofGeometry();
    this.chimneyGeo = new THREE.BoxGeometry(0.72, 1.8, 0.72);
    this.spireGeo = new THREE.ConeGeometry(1, 1, 8);

    this.sharedGeometries = new Set([
      this.boxGeo, this.wallGeo, this.gableRoofGeo, this.hipRoofGeo, this.chimneyGeo, this.trunkGeo,
      this.coniferGeo, this.deciduousGeo, this.shrubGeo, this.poplarGeo, this.willowGeo, this.spireGeo
    ]);
    for(const mat of [this.buildingWarmMat,this.buildingCoolMat,this.buildingOchreMat,this.buildingBrickMat,
      this.roofMat,this.roofSlateMat,this.roofBrownMat,this.flatRoofMat,this.chimneyMat,
      this.trunkMat,this.coniferMat,this.deciduousMat,this.shrubMat,this.poplarMat,this.willowMat])
      osmFadeScenery(mat);
    for(const mat of [this.coniferMat,this.deciduousMat,this.poplarMat,this.willowMat])osmCanopyTerrain(mat);
  }

  _key(tx, tz){ return tx + ',' + tz; }

  // Read every source before placing anything: a roof/crown near a seam can
  // intersect water belonging to the NEXT tile. Network completion order must
  // never decide which objects are admitted. A failed source aborts preparation.
  async prepareRegion(coords,waterwaysURL=null){
    const records = await Promise.all(coords.map(async ([tx,tz]) => {
      const res = await fetch(`${this.baseUrl}${tx}_${tz}.json`);
      if(!res.ok) throw new Error(`Missing OSM tile ${tx},${tz}: ${res.status}`);
      return {tx,tz,data:await res.json()};
    }));
    if(waterwaysURL){
      const res=await fetch(waterwaysURL);
      if(!res.ok)throw new Error('Missing complete water network');
      const network=await res.json();
      for(const r of records){
        const water=network.tiles[this._key(r.tx,r.tz)];
        if(!water||water.rivers.length!==water.riverWidths.length||water.rivers.length!==water.riverEnds.length)
          throw new Error('Incomplete water overlay for '+r.tx+','+r.tz);
        r.data={...r.data,...water};
      }
    }
    for(const r of records) this.sourceTiles.set(this._key(r.tx,r.tz),r.data);
    this._prepareSettlementLandmarks(records);
    this.waterIndex = makeOSMWaterIndex(records,this.tileSize);
  }

  _prepareSettlementLandmarks(records){
    // Current Overture conversion has no trustworthy historical building-use
    // field. Pick a small number of church-like landmarks from plausible large
    // footprints inside dense clusters, with a region-wide spacing limit. This
    // is a visual inference, never historical identification.
    const candidates=[];
    for(const {tx,tz,data} of records){
      const list=data.buildings||[],ox=tx*this.tileSize,oz=tz*this.tileSize;
      for(const b of list){
        const area=b.w*b.d,aspect=Math.max(b.w/Math.max(1,b.d),b.d/Math.max(1,b.w));
        if(area<180||area>1100||Math.min(b.w,b.d)<8||aspect>3.6)continue;
        const near=list.reduce((n,q)=>n+(Math.hypot(q.x-b.x,q.z-b.z)<260),0);
        if(near<28)continue;
        const x=ox+b.x,z=oz+b.z;
        candidates.push({x,z,b,score:near*10+Math.min(area,700)/100+osmHash(x,z,170)});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    const selected=[];
    for(const c of candidates){
      if(selected.length>=14)break;
      if(selected.every(s=>Math.hypot(c.x-s.x,c.z-s.z)>1900))selected.push(c);
    }
    this.churchKeys=new Set(selected.map(c=>osmBuildingKey(c.x,c.z)));
  }

  async loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return;

    let data = this.sourceTiles.get(key);
    if(!data) try {
      const res = await fetch(`${this.baseUrl}${tx}_${tz}.json`);
      if(!res.ok){ this.tiles.set(key, null); return; }
      data = await res.json();
    } catch(e){
      this.tiles.set(key, null);
      return;
    }

    const ox = tx * this.tileSize, oz = tz * this.tileSize;
    const group = new THREE.Group();

    const roadMesh = this._buildRibbons(data.roads || [], ox, oz, 10, this.roadMat, 1.4);
    if(roadMesh) group.add(roadMesh);
    const railMesh = this._buildRibbons(data.rails || [], ox, oz, 3, this.railMat, 1.2);
    if(railMesh) group.add(railMesh);
    const riverMesh = this._buildRibbons(data.rivers || [], ox, oz, 12, this.riverMat, 0.65,data);
    if(riverMesh) group.add(riverMesh);
    const lakeMesh = this._buildFlatPolygons(data.lakes || [], ox, oz, this.lakeMat, 0.9);
    if(lakeMesh) group.add(lakeMesh);
    // Land cover is baked into the terrain shader. Separate huge polygon
    // sheets cannot remain attached to a changing terrain triangulation.
    if(this.terrain.setLandcover)this.terrain.setLandcover(tx,tz,data);
    const airfieldMesh = this._buildFlatPolygons(data.airfields || [], ox, oz, this.roadMat, 0.3);
    if(airfieldMesh) group.add(airfieldMesh);

    // Infrastructure stays visible across tile boundaries. Only expensive
    // vegetation/building instances are distance-culled by remagen-mission.html.
    const farGroup = new THREE.Group();
    group.add(farGroup);
    const forestExclusion = this._buildForestExclusion(data, ox, oz);
    const treeCount = this._buildForests(farGroup, data.forests || [], ox, oz, forestExclusion);
    const buildingCount = this._buildBuildings(farGroup, data.buildings || [], ox, oz, forestExclusion);

    // Land cover is continuous ground, not part of the distance-culled trees.
    const floor=farGroup.children.find(m=>m.name==='osmForestFloor');
    if(floor){farGroup.remove(floor);group.add(floor);}

    this.scene.add(group);
    this.tiles.set(key, { group, farGroup, treeCount, buildingCount });
  }

  unloadTile(tx, tz){
    const key = this._key(tx, tz);
    const t = this.tiles.get(key);
    if(t){
      this.scene.remove(t.group);
      t.group.traverse(o => {
        if(o.geometry && !this.sharedGeometries.has(o.geometry)) o.geometry.dispose();
        if(o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
      });
    }
    this.tiles.delete(key);
  }

  _safeRenderedHeight(x, z, ox, oz){
    if(this.terrain.tiles && this.terrain.tiles.has(this._key(Math.floor(x/this.tileSize),Math.floor(z/this.tileSize))))
      return this.terrain.getRenderedHeight(x,z);
    // A building corner or jittered tree can cross a tile edge by a few metres.
    // Clamp only for the height query so a missing neighbour in demo pages
    // cannot abort the whole tile build. Remagen itself preloads all DEM tiles.
    const eps = 0.01;
    const qx = Math.min(ox + this.tileSize - eps, Math.max(ox + eps, x));
    const qz = Math.min(oz + this.tileSize - eps, Math.max(oz + eps, z));
    return this.terrain.getRenderedHeight(qx, qz);
  }

  _buildRibbons(lines, ox, oz, width, mat, yOffset,riverData=null){
    if(!lines || lines.length === 0) return null;
    const positions = [], indices = [];
    for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
      const localPts=lines[lineIndex];
      if(!localPts || localPts.length < 2) continue;
      const pairs = mat===this.riverMat
        ? osmWaterPairs(localPts,ox,oz,riverData?.riverWidths?.[lineIndex]||width,riverData?.riverEnds?.[lineIndex])
        : osmRibbonPairs(localPts,ox,oz,width);
      const world = pairs; // index count below
      const base = positions.length/3;
      for(const pair of pairs) for(const [x,z] of pair){
        positions.push(x,this._safeRenderedHeight(x,z,ox,oz)+yOffset,z);
      }
      for(let i = 1; i < world.length; i++){
        const l0=base+(i-1)*2, r0=l0+1, l1=base+i*2, r1=l1+1;
        addUpwardTriOSM(indices, positions, l0, r0, l1);
        addUpwardTriOSM(indices, positions, r0, r1, l1);
      }
    }
    if(positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh=new THREE.Mesh(geo, mat);
    mesh.userData.yOffsets=new Float32Array(positions.length/3).fill(yOffset);
    this._prepareWaterSurface(mesh,ox,oz,yOffset);
    return mesh;
  }

  _buildFlatPolygons(polys, ox, oz, mat, yOffset){
    if(!polys || polys.length === 0) return null;
    const positions = [], indices = [];
    for(const localRing of polys){
      const world = cleanPolygonRing(localRing.map(([lx,lz]) => [ox+lx, oz+lz]));
      if(world.length < 3) continue;
      const base = positions.length/3;
      for(const [x,z] of world) positions.push(x, this.terrain.getRenderedHeight(x,z) + yOffset, z);
      // A centroid fan only works for convex polygons. The Rhine/lake rings are
      // strongly concave; the old fan crossed bends and painted blue wedges
      // over land, which made valid trees/buildings appear to stand in water.
      const triangles=triangulateSimplePolygon(world);
      for(const [a,b,c] of triangles) addUpwardTriOSM(indices,positions,base+a,base+b,base+c);
    }
    if(positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh=new THREE.Mesh(geo, mat);
    mesh.userData.yOffsets=new Float32Array(positions.length/3).fill(yOffset);
    this._prepareWaterSurface(mesh,ox,oz,yOffset);
    return mesh;
  }

  _prepareWaterSurface(mesh,ox,oz,offset){
    // Keep the small source triangulation to rebuild when LOD changes.
    mesh.userData.waterSource={positions:mesh.geometry.attributes.position.array.slice(),indices:Array.from(mesh.geometry.index.array),ox,oz,offset};
    if(!this.deferSurfaces)this.redrapeWater(mesh);
  }

  syncSurface(mesh){
    const src=mesh.userData.waterSource;
    const tile=src&&this.terrain.tiles.get(this._key(src.ox/this.tileSize,src.oz/this.tileSize));
    if(!tile)return;
    if(mesh.userData.surfaceSegments!==tile._renderSeg){this.redrapeWater(mesh);return;}
    if(mesh.userData.surfaceGeometry===tile.mesh.geometry&&mesh.userData.surfaceMorph===tile.morphT)return;
    const p=mesh.geometry.attributes.position,base=mesh.userData.surfaceBase,uv=mesh.userData.surfaceWeights;
    const heights=tile.mesh.geometry.attributes.position.array,n=tile._renderSeg+1;
    for(let i=0;i<p.count;i++){
      const a=base[i],b=a+n,d=a+1,c=b+1,u=uv[i*2],v=uv[i*2+1];
      p.array[i*3+1]=(u+v<=1 ? heights[a*3+1]*(1-u-v)+heights[d*3+1]*u+heights[b*3+1]*v
        : heights[c*3+1]*(u+v-1)+heights[b*3+1]*(1-u)+heights[d*3+1]*(1-v))+src.offset;
    }
    p.needsUpdate=true;
    if(!tile.morphing)mesh.geometry.computeVertexNormals();
    mesh.userData.surfaceGeometry=tile.mesh.geometry;mesh.userData.surfaceMorph=tile.morphT;
  }

  syncTerrainSurfaces(){
    for(const t of this.tiles.values())if(t)for(const mesh of t.group.children)
      if(mesh.isMesh&&mesh.userData.waterSource)this.syncSurface(mesh);
  }

  _surfaceHeight(src,x,z){
    return this.terrain.getRenderedHeight(
      Math.max(src.ox+.001,Math.min(src.ox+this.tileSize-.001,x)),
      Math.max(src.oz+.001,Math.min(src.oz+this.tileSize-.001,z)))+src.offset;
  }

  redrapeWater(mesh){
    const src=mesh.userData.waterSource;
    if(!src || !this.terrain.tiles) return;
    const tile=this.terrain.tiles.get(this._key(src.ox/this.tileSize,src.oz/this.tileSize));
    if(!tile) return;
    const step=this.tileSize/tile._renderSeg,positions=[];
    // At an exact seam, TerrainManager normally prefers the next tile. Its
    // LOD may differ. A surface owned by THIS tile must use THIS tile's edge.
    const height=(x,z)=>this._surfaceHeight(src,x,z);
    for(let i=0;i<src.indices.length;i+=3){
      const tri=src.indices.slice(i,i+3).map(j=>[src.positions[j*3],src.positions[j*3+2]]);
      const xs=tri.map(p=>p[0]),zs=tri.map(p=>p[1]);
      for(let gx=Math.floor(Math.min(...xs)/step);gx<=Math.floor(Math.max(...xs)/step);gx++)
        for(let gz=Math.floor(Math.min(...zs)/step);gz<=Math.floor(Math.max(...zs)/step);gz++){
          const x=gx*step,z=gz*step;
          let ring=osmClipHalfPlane(tri,1,0,x,true);
          ring=osmClipHalfPlane(ring,1,0,x+step,false);
          ring=osmClipHalfPlane(ring,0,1,z,true);
          ring=osmClipHalfPlane(ring,0,1,z+step,false);
          ring=osmClipHalfPlane(ring,1,0,src.ox,true);
          ring=osmClipHalfPlane(ring,1,0,src.ox+this.tileSize,false);
          ring=osmClipHalfPlane(ring,0,1,src.oz,true);
          ring=osmClipHalfPlane(ring,0,1,src.oz+this.tileSize,false);
          // Split at PlaneGeometry's diagonal too, not just the grid edges.
          for(const keepGreater of [false,true]){
            const part=osmClipHalfPlane(ring,1,1,x+z+step,keepGreater);
            for(let j=1;j<part.length-1;j++){
              const a=part[0],b=part[j],c=part[j+1];
              const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
              if(Math.abs(area)<1e-5) continue;
              for(const [px,pz] of area<0?[a,b,c]:[a,c,b]) positions.push(px,height(px,pz),pz);
            }
          }
        }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const uv=[];
    // One repeat spans 260m. The old 48m repeat made its diagonal waves turn
    // into a high-frequency screen-door pattern over the broad Rhine.
    for(let i=0;i<positions.length;i+=3)uv.push(positions[i]/260,positions[i+2]/260);
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    geo.boundingSphere.radius+=200; // conservative throughout a height blend
    mesh.geometry.dispose(); mesh.geometry=geo;
    mesh.userData.yOffsets=new Float32Array(positions.length/3).fill(src.offset);
    mesh.userData.surfaceSegments=tile._renderSeg;
    mesh.userData.surfaceGeometry=tile.mesh.geometry;mesh.userData.surfaceMorph=tile.morphT;
    const p=geo.attributes.position,base=new Uint16Array(p.count),weights=new Float32Array(p.count*2);
    const seg=tile._renderSeg,n=seg+1;
    for(let i=0;i<p.count;i++){
      const fx=Math.max(.001/step,Math.min(seg-.001/step,(p.getX(i)-src.ox)/step));
      const fz=Math.max(.001/step,Math.min(seg-.001/step,(p.getZ(i)-src.oz)/step));
      const ix=Math.min(seg-1,Math.floor(fx)),iz=Math.min(seg-1,Math.floor(fz));
      base[i]=ix+n*iz;weights[i*2]=fx-ix;weights[i*2+1]=fz-iz;
    }
    mesh.userData.surfaceBase=base;mesh.userData.surfaceWeights=weights;
  }

  _buildForestExclusion(data, ox, oz){
    // Uniform-grid spatial index. A candidate tree only checks features in
    // its own 64m cell, avoiding O(trees x every road/building) startup cost.
    const cellSize=64, cells=new Map();
    const add=(feature,minX,minZ,maxX,maxZ)=>{
      const gx0=Math.floor(minX/cellSize), gz0=Math.floor(minZ/cellSize);
      const gx1=Math.floor(maxX/cellSize), gz1=Math.floor(maxZ/cellSize);
      for(let gx=gx0;gx<=gx1;gx++) for(let gz=gz0;gz<=gz1;gz++){
        const key=gx+','+gz;
        let bucket=cells.get(key);
        if(!bucket){ bucket=[]; cells.set(key,bucket); }
        bucket.push(feature);
      }
    };
    const addCorridors=(lines,clearance,source)=>{
      for(const line of lines||[]){
        if(!line||line.length<2) continue;
        for(let i=1;i<line.length;i++){
          const a=line[i-1], b=line[i];
          const f={kind:'segment',source,ax:ox+a[0],az:oz+a[1],bx:ox+b[0],bz:oz+b[1],r2:clearance*clearance};
          add(f,Math.min(f.ax,f.bx)-clearance,Math.min(f.az,f.bz)-clearance,
            Math.max(f.ax,f.bx)+clearance,Math.max(f.az,f.bz)+clearance);
        }
      }
    };
    const addPolygons=(polys,edgeClearance,source)=>{
      for(const localRing of polys||[]){
        if(!localRing||localRing.length<3) continue;
        const ring=localRing.map(p=>[ox+p[0],oz+p[1]]);
        let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
        for(const [x,z] of ring){ minX=Math.min(minX,x); minZ=Math.min(minZ,z); maxX=Math.max(maxX,x); maxZ=Math.max(maxZ,z); }
        add({kind:'polygon',source,ring},minX-edgeClearance,minZ-edgeClearance,maxX+edgeClearance,maxZ+edgeClearance);
        // Also keep canopies back from the polygon edge, not merely outside it.
        addCorridors([localRing],edgeClearance,source);
      }
    };

    addCorridors(data.roads, 13, 'road');   // 5m road half-width + canopy/root margin
    addCorridors(data.rails, 9, 'rail');
    for(let i=0;i<(data.rivers||[]).length;i++)
      addCorridors([data.rivers[i]],(data.riverWidths?.[i]||12)/2+6,'river');
    addPolygons(data.lakes, 7, 'lake');
    addPolygons(data.airfields, 12, 'airfield');

    for(const b of data.buildings||[]){
      const x=ox+b.x,z=oz+b.z,c=Math.cos(b.rotY),s=Math.sin(b.rotY),margin=7;
      const ex=Math.abs(c)*b.w/2+Math.abs(s)*b.d/2+margin;
      const ez=Math.abs(s)*b.w/2+Math.abs(c)*b.d/2+margin;
      add({kind:'building',source:'building',x,z,c,s,hw:b.w/2+margin,hd:b.d/2+margin},x-ex,z-ez,x+ex,z+ez);
    }
    return {cellSize,cells,water:this.waterIndex || makeOSMWaterIndex([{tx:ox/this.tileSize,tz:oz/this.tileSize,data}],this.tileSize)};
  }

  _treeExcluded(x,z,index){
    if(!index) return false;
    // Build 16's broader crowns stay clear of water with their full envelope.
    if(osmWaterOverlaps([[x,z]],7,index.water)) return true;
    const bucket=index.cells.get(Math.floor(x/index.cellSize)+','+Math.floor(z/index.cellSize));
    if(!bucket) return false;
    for(const f of bucket){
      if(f.kind==='segment' && pointSegmentDistanceSq(x,z,f.ax,f.az,f.bx,f.bz)<=f.r2) return true;
      if(f.kind==='polygon' && pointInPolygon(x,z,f.ring)) return true;
      if(f.kind==='building'){
        const dx=x-f.x,dz=z-f.z;
        const lx=dx*f.c-dz*f.s, lz=dx*f.s+dz*f.c;
        if(Math.abs(lx)<=f.hw && Math.abs(lz)<=f.hd) return true;
      }
    }
    return false;
  }

  _pointTouchesWater(x,z,index){
    if(!index) return false;
    const bucket=index.cells.get(Math.floor(x/index.cellSize)+','+Math.floor(z/index.cellSize));
    if(!bucket) return false;
    for(const f of bucket){
      if(f.source!=='river' && f.source!=='lake') continue;
      if(f.kind==='segment' && pointSegmentDistanceSq(x,z,f.ax,f.az,f.bx,f.bz)<=f.r2) return true;
      if(f.kind==='polygon' && pointInPolygon(x,z,f.ring)) return true;
    }
    return false;
  }

  _buildingTouchesWater(b,x,z,index){
    // Test the entire rendered roof footprint, including overhang and 2m
    // bank clearance. Nine sample points missed thin streams between probes.
    return osmWaterOverlaps(osmBuildingFootprint(b,x,z),2,index && index.water);
  }

  _forestPlacements(polys, ox, oz, exclusion=null){
    const placements = [];
    const usedCells = new Set();
    const standCells=new Map();

    for(const localRing of polys){
      if(!localRing || localRing.length < 4) continue;
      const world = localRing.map(([lx,lz]) => [ox+lx, oz+lz]);
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const [x,z] of world){
        minX=Math.min(minX,x); maxX=Math.max(maxX,x);
        minZ=Math.min(minZ,z); maxZ=Math.max(maxZ,z);
      }

      const TARGET_TREES = 800;
      const bboxArea = Math.max(1, (maxX-minX) * (maxZ-minZ));
      const step = Math.min(36, Math.max(24, Math.round(Math.sqrt(bboxArea / TARGET_TREES))));

      for(let x = minX; x <= maxX; x += step){
        for(let z = minZ; z <= maxZ; z += step){
          if(!pointInPolygon(x, z, world)) continue;
          const jx = (osmHash(x,z,1)-0.5)*step;
          const jz = (osmHash(x,z,2)-0.5)*step;
          const px = Math.min(ox+this.tileSize-0.01, Math.max(ox+0.01, x+jx));
          const pz = Math.min(oz+this.tileSize-0.01, Math.max(oz+0.01, z+jz));
          if(!pointInPolygon(px,pz,world)) continue;
          if(this._treeExcluded(px,pz,exclusion)) continue;

          // Low-frequency density produces irregular glades without the square
          // checkerboard of per-tree random thinning.
          const density=0.88+0.10*osmValueNoise(px/420,pz/420,88);
          if(osmHash(px,pz,89)>density) continue;

          // Overlapping source polygons used to create visibly doubled trees.
          // Dedupe on a small world-space cell while retaining organic jitter.
          const cell = `${Math.round(px/12)},${Math.round(pz/12)}`;
          if(usedCells.has(cell)) continue;
          usedCells.add(cell);

          const edge=osmRingEdgeDistance(px,pz,world);
          const stand=osmValueNoise(px/310,pz/310,91);
          // Species change in broad, blended stands. Shrubs favour real polygon
          // edges; individual-tree hash only softens the boundaries.
          const jitter=(osmHash(px,pz,7)-.5)*.16;
          let kind=stand+jitter<.47?0:1;
          if(kind===1&&edge<42&&osmValueNoise(px/180,pz/180,193)>.63)kind=3;
          if(kind===1&&edge<42&&osmHash(px,pz,194)>.74)kind=4;
          if(edge<24&&osmHash(px,pz,92)<.48)kind=2;
          const radius=kind===2?6.8:Math.min(kind>=3?6.2:20,
            this._forestCanopyRadius(px,pz,step,edge,ox,oz,exclusion));
          if(radius<1.5)continue;
          const gx=Math.floor(px/24),gz=Math.floor(pz/24);let crowded=false;
          for(let ix=gx-2;ix<=gx+2;ix++)for(let iz=gz-2;iz<=gz+2;iz++)
            for(const other of standCells.get(ix+','+iz)||[])
              if(Math.hypot(px-other.x,pz-other.z)<Math.max(7,(radius+other.radius)*.45))crowded=true;
          if(crowded)continue;
          const standKey=gx+','+gz;if(!standCells.has(standKey))standCells.set(standKey,[]);
          standCells.get(standKey).push({x:px,z:pz,radius});
          placements.push({
            x:px, z:pz, kind, radius,
            scale:0.78 + osmHash(px,pz,3)*0.62,
            width:0.82+osmHash(px,pz,5)*0.28,
            height:0.84+osmHash(px,pz,6)*0.42,
            rot:osmHash(px,pz,4)*Math.PI*2,
            edge
          });
        }
      }
    }
    return placements;
  }

  _forestCanopyRadius(x,z,step,edge,ox,oz,index){
    // A stand fills the former large gaps, but its whole crown must remain
    // inside mapped woodland and outside roads, buildings, runways and water.
    let radius=Math.min(90,step*.75,edge-1,x-ox,ox+this.tileSize-x,z-oz,oz+this.tileSize-z);
    if(radius<=0||!index)return Math.max(0,radius);
    const seen=new Set(),cs=index.cellSize;
    for(let ix=Math.floor((x-radius)/cs);ix<=Math.floor((x+radius)/cs);ix++)
      for(let iz=Math.floor((z-radius)/cs);iz<=Math.floor((z+radius)/cs);iz++)
        for(const f of index.cells.get(ix+','+iz)||[])seen.add(f);
    for(const f of seen){
      let distance=Infinity;
      if(f.kind==='segment')distance=Math.sqrt(pointSegmentDistanceSq(x,z,f.ax,f.az,f.bx,f.bz))-Math.sqrt(f.r2);
      if(f.kind==='polygon')distance=pointInPolygon(x,z,f.ring)?0:osmRingEdgeDistance(x,z,f.ring);
      if(f.kind==='building'){
        const dx=x-f.x,dz=z-f.z,lx=dx*f.c-dz*f.s,lz=dx*f.s+dz*f.c;
        distance=Math.hypot(Math.max(0,Math.abs(lx)-f.hw),Math.max(0,Math.abs(lz)-f.hd));
      }
      radius=Math.min(radius,Math.max(0,distance-.5));
    }
    if(radius>0&&osmWaterOverlaps([[x,z]],radius,index.water)){
      let lo=0,hi=radius;for(let i=0;i<8;i++){const mid=(lo+hi)*.5;
        if(osmWaterOverlaps([[x,z]],mid,index.water))hi=mid;else lo=mid;}
      radius=lo;
    }
    return radius;
  }

  _buildForests(group, polys, ox, oz, exclusion=null){
    if(!polys || polys.length === 0) return 0;
    const placements = this._forestPlacements(polys, ox, oz, exclusion);
    if(placements.length === 0) return 0;

    const conifers = placements.filter(p => p.kind === 0);
    const deciduous = placements.filter(p => p.kind === 1);
    const shrubs = placements.filter(p => p.kind === 2);
      const trunked = placements.filter(p => p.kind >= 3);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    if(trunked.length){
      const trunks = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, trunked.length);
      trunks.name='osmForestTrunks';
      for(let i=0;i<trunked.length;i++){
        const p=trunked[i], y=this._safeRenderedHeight(p.x,p.z,ox,oz);
        q.setFromAxisAngle(OSM_UP,p.rot);
        // Embed trunk by 1.2m so small LOD height changes do not expose roots.
        pos.set(p.x,y+1.55*p.scale,p.z);
        scale.set(p.scale*.86,p.scale*p.height,p.scale*.86);
        m.compose(pos,q,scale);
        trunks.setMatrixAt(i,m);
      }
      trunks.instanceMatrix.needsUpdate=true;
      group.add(trunks);
    }

    const addCanopies = (items, geo, mat, yFactor, sx, sy, sz) => {
      if(!items.length) return;
      // The extra instanced height attribute belongs to this tile's clone.
      const canopyGeo=geo.clone?geo.clone():geo;
      const ground=new Float32Array(items.length*4);
      if(mat!==this.shrubMat)canopyGeo.setAttribute('canopyGround',new THREE.InstancedBufferAttribute(ground,4));
      const mesh = new THREE.InstancedMesh(canopyGeo, mat, items.length);
      mesh.userData.canopyRadii=items.map(p=>p.radius);
      mesh.name = geo===this.coniferGeo?'osmForestConifers':geo===this.deciduousGeo?'osmForestDeciduous':geo===this.poplarGeo?'osmForestPoplars':geo===this.willowGeo?'osmForestWillows':'osmForestShrubs';
      for(let i=0;i<items.length;i++){
        const p=items[i], y=this._safeRenderedHeight(p.x,p.z,ox,oz);
        q.setFromAxisAngle(OSM_UP,p.rot);
        if(mat===this.shrubMat){pos.set(p.x,y+yFactor*p.scale,p.z);scale.set(p.scale*sx*p.width,p.scale*sy*p.height,p.scale*sz*p.width);}
        else{
          const height=p.scale*sy*p.height;
          pos.set(p.x,y+yFactor*p.scale,p.z);scale.set(p.radius,height,p.radius);
          const r=p.radius;
          const roots=geo.userData?.forestRoots||[[0,0]],c=Math.cos(p.rot),s=Math.sin(p.rot);
          for(let j=0;j<4;j++){
            const root=roots[Math.min(j,roots.length-1)],dx=root[0]*r,dz=root[1]*r;
            ground[i*4+j]=(this._safeRenderedHeight(p.x+c*dx+s*dz,p.z-s*dx+c*dz,ox,oz)-y)/height;
          }
        }
        m.compose(pos,q,scale);
        mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;
      group.add(mesh);
    };

    addCanopies(conifers, this.coniferGeo, this.coniferMat, 0, 1.0, 1.0, 1.0);
    addCanopies(deciduous, this.deciduousGeo, this.deciduousMat, 0, 1.0, 1.0, 1.0);
    addCanopies(shrubs, this.shrubGeo, this.shrubMat, 1.5, 1.25, 0.85, 1.25);
    addCanopies(placements.filter(p=>p.kind===3),this.poplarGeo,this.poplarMat,6.6,1,1,1);
    addCanopies(placements.filter(p=>p.kind===4),this.willowGeo,this.willowMat,5.1,1,1,1);

    return placements.length;
  }

  _buildingGroundRange(b, x, z, ox, oz){
    const c=Math.cos(b.rotY), s=Math.sin(b.rotY);
    const hw=b.w/2, hd=b.d/2;
    const samples=[[0,0],[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
    let minY=Infinity,maxY=-Infinity;
    for(const [lx,lz] of samples){
      const wx=x + lx*c + lz*s;
      const wz=z - lx*s + lz*c;
      const y=this._safeRenderedHeight(wx,wz,ox,oz);
      minY=Math.min(minY,y);
      maxY=Math.max(maxY,y);
    }
    return {minY,maxY};
  }

  _buildBuildings(group, buildings, ox, oz, exclusion=null){
    if(!buildings || buildings.length === 0) return 0;

    const desc = buildings.map(b => {
      const x=ox+b.x, z=oz+b.z;
      if(this._buildingTouchesWater(b,x,z,exclusion)) return null;
      const area=b.w*b.d,aspect=Math.max(b.w/Math.max(1,b.d),b.d/Math.max(1,b.w));
      const r=osmHash(x,z,21),church=this.churchKeys.has(osmBuildingKey(x,z));
      const barn=!church&&area>380&&area<1800&&aspect>1.75&&osmHash(x,z,26)>.28;
      // Only a small share of very large, elongated footprints remain flat
      // industrial sheds. Modern OSM rectangles otherwise become period-style
      // gabled masses below instead of one giant post-war block.
      const industrial=!church&&!barn&&area>4800&&aspect>1.7&&osmHash(x,z,127)>.62;
      let h=area>1600?6.8+r*3.8:(area>650?6.2+r*3.6:5.5+r*3.2);
      const cottage=!church&&!barn&&area<240&&r<.34;
      if(cottage)h=3.1+r*2;
      if(barn)h=6+r*2.8;
      if(church)h=13+r*3.5;
      if(industrial)h=7.5+r*3.5;
      const pitched=!industrial;
      // Neighbourhood-scale wall palette creates coherent streets; a fine hash
      // keeps every block from being literally identical.
      let palette=Math.min(3,Math.floor(osmValueNoise(x/260,z/260,122)*4));
      if(osmHash(x,z,265)>.60)palette=Math.floor(osmHash(x,z,266)*4);
      if(barn)palette=osmHash(x,z,123)>.45?2:3;
      if(church)palette=1;
      let roofTone=Math.min(2,Math.floor(osmValueNoise(x/330,z/330,124)*3));
      if(osmHash(x,z,267)>.78)roofTone=Math.floor(osmHash(x,z,268)*3);
      if(church)roofTone=1;
      const chimney=pitched&&!church&&!barn&&area<1700&&Math.min(b.w,b.d)>5&&osmHash(x,z,24)>.24;
      const ground=this._buildingGroundRange(b,x,z,ox,oz);
      const baseY=ground.minY-0.8,wallTop=ground.maxY+h;
      const annex=!church&&!barn&&pitched&&area>170&&area<700&&b.w<32&&aspect<3&&osmHash(x,z,125)>.68;
      return {b,x,z,area,aspect,church,barn,cottage,industrial,pitched,palette,roofTone,chimney,annex,ground,baseY,wallTop,facade:cottage?2:barn?3:Math.floor(osmHash(x,z,161)*2)};
    }).filter(Boolean);

    const wallParts=[],roofParts=[],chimneys=[],spires=[],dormers=[];
    const addPart=(d,lx,lz,w,depth,top=d.wallTop,roof=true,style={})=>{
      const c=Math.cos(d.b.rotY),s=Math.sin(d.b.rotY);
      const part={...d,...style,x:d.x+lx*c+lz*s,z:d.z-lx*s+lz*c,w,depth,wallTop:top,rotY:d.b.rotY};
      wallParts.push(part);if(roof)roofParts.push(part);return part;
    };
    for(const d of desc){
      const houseParts=[];
      // Wide/deep source rectangles often describe a whole modern block. Lay
      // out two to six smaller, slightly staggered gabled houses inside that
      // same dry footprint. This gives villages street rhythm and courtyards
      // without inventing a new map location or extra draw-call buckets.
      const subdivide=!d.church&&!d.barn&&!d.industrial&&d.b.w>30&&d.area>480;
      if(subdivide){
        const rows=d.b.d>29&&d.area>1450?2:1;
        const cols=Math.min(rows===2?3:4,Math.max(2,Math.round(d.b.w/19)));
        const slotW=d.b.w/cols,slotD=d.b.d/rows;
        for(let rz=0;rz<rows;rz++)for(let rx=0;rx<cols;rx++){
          const seed=osmHash(d.x+rx*19,d.z+rz*23,128);
          const w=slotW*Math.min(.92,Math.max(.78,1.8/slotW+.78));
          const depth=rows===1?d.b.d*(.72+seed*.18):slotD*Math.min(.91,Math.max(.72,1.6/slotD+.72));
          const lx=-d.b.w/2+slotW*(rx+.5);
          const rowCentre=-d.b.d/2+slotD*(rz+.5);
          const spare=slotD-depth,lz=rowCentre+(seed-.5)*spare*.72;
          const top=d.wallTop+(osmHash(d.x+rx,d.z+rz,129)-.5)*1.5;
          houseParts.push(addPart(d,lx,lz,w,depth,top,true,{
            palette:(d.palette+(seed>.82?1:0))%4,
            roofTone:(d.roofTone+Math.floor(seed*2.4))%3
          }));
        }
      }else if(d.annex){
        houseParts.push(addPart(d,-d.b.w*.14,0,d.b.w*.72,d.b.d));
        const side=osmHash(d.x,d.z,126)>.5?1:-1;
        houseParts.push(addPart(d,d.b.w*.36,side*d.b.d*.225,d.b.w*.28,d.b.d*.55,d.wallTop-.45));
      }else houseParts.push(addPart(d,0,0,d.b.w,d.b.d));
      if(d.church){
        // The former 6.5m cap vanished into the nave from normal flight
        // altitude. A broad, tall western tower and steep spire now make the
        // landmark unmistakable without adding a new material/draw-call bucket.
        const tw=Math.min(10,Math.max(7,d.b.w*.44));
        const td=Math.min(10,Math.max(7,d.b.d*.62));
        const tower=addPart(d,-d.b.w/2+tw/2,0,tw,td,d.wallTop+12,false);
        spires.push({...tower,radius:Math.min(tw,td)*.66,height:10});
      }
      if(d.chimney&&houseParts.length){
        const at=Math.min(houseParts.length-1,Math.floor(osmHash(d.x,d.z,130)*houseParts.length));
        chimneys.push(houseParts[at]);
      }
    }

    for(const d of roofParts)if(!d.church&&!d.barn&&d.pitched&&d.w>10&&d.depth>8&&osmHash(d.x,d.z,163)>.78){
      const roofH=osmRoofHeight(d),c=Math.cos(d.rotY),ss=Math.sin(d.rotY),lz=d.depth*.19;
      dormers.push({x:d.x+lz*ss,z:d.z+lz*c,y:d.wallTop+roofH*.62,rot:d.rotY,width:Math.min(2.4,d.w*.16)});
    }
    for(const roof of [false,true])if(dormers.length){
      const mesh=new THREE.InstancedMesh(roof?this.gableRoofGeo:this.boxGeo,roof?this.roofBrownMat:this.chimneyMat,dormers.length);
      mesh.name=roof?'osmBuildingDormerRoofs':'osmBuildingDormerWalls';
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
      dormers.forEach((d,i)=>{q.setFromAxisAngle(OSM_UP,d.rot+Math.PI/2);pos.set(d.x,d.y+(roof?.72:0),d.z);scale.set(1.8,roof?.85:1.45,d.width);m.compose(pos,q,scale);mesh.setMatrixAt(i,m);});
      mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }
    const wallMats=[this.buildingWarmMat,this.buildingCoolMat,this.buildingOchreMat,this.buildingBrickMat];
    const wallNames=['Warm','Stone','Ochre','Brick'];
    for(let palette=0;palette<wallMats.length;palette++){
      const items=wallParts.filter(d=>d.palette===palette);if(!items.length)continue;
      const wallGeo=makeOSMWallGeometry();
      const atlas=new Float32Array(items.length*2);
      items.forEach((d,i)=>{atlas[i*2]=(d.facade%2)*.5;atlas[i*2+1]=Math.floor(d.facade/2)*.5;});
      wallGeo.setAttribute("facadeVariant",new THREE.InstancedBufferAttribute(atlas,2));
      const mesh=new THREE.InstancedMesh(wallGeo,wallMats[palette],items.length);
      mesh.name='osmBuildingWalls'+wallNames[palette];
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
      for(let i=0;i<items.length;i++){
        const d=items[i],h=d.wallTop-d.baseY;q.setFromAxisAngle(OSM_UP,d.rotY);
        pos.set(d.x,d.baseY+h/2,d.z);scale.set(d.w,h,d.depth);m.compose(pos,q,scale);mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }

    const roofMats=[this.roofMat,this.roofSlateMat,this.roofBrownMat];
    const roofNames=['Red','Slate','Brown'];
    for(let tone=0;tone<roofMats.length;tone++){
      const items=roofParts.filter(d=>d.pitched&&d.roofTone===tone);if(!items.length)continue;
      const mesh=new THREE.InstancedMesh(tone===0?this.hipRoofGeo:this.gableRoofGeo,roofMats[tone],items.length);
      mesh.name='osmBuildingRoofs'+roofNames[tone];
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
      for(let i=0;i<items.length;i++){
        const d=items[i],roofH=osmRoofHeight(d);
        q.setFromAxisAngle(OSM_UP,d.rotY);pos.set(d.x,d.wallTop+.05,d.z);
        scale.set(d.w*1.06,roofH,d.depth*1.08);m.compose(pos,q,scale);mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }

    const flat=roofParts.filter(d=>!d.pitched);
    if(flat.length){
      const mesh=new THREE.InstancedMesh(this.boxGeo,this.flatRoofMat,flat.length);mesh.name='osmBuildingRoofsFlat';
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
      for(let i=0;i<flat.length;i++){
        const d=flat[i];q.setFromAxisAngle(OSM_UP,d.rotY);pos.set(d.x,d.wallTop+.35,d.z);
        scale.set(d.w*1.02,.7,d.depth*1.02);m.compose(pos,q,scale);mesh.setMatrixAt(i,m);
      }mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }

    if(chimneys.length){
      const mesh=new THREE.InstancedMesh(this.chimneyGeo,this.chimneyMat,chimneys.length);mesh.name='osmBuildingChimneys';
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1);
      for(let i=0;i<chimneys.length;i++){
        const d=chimneys[i],roofH=osmRoofHeight(d);
        const lx=(osmHash(d.x,d.z,25)-.5)*d.w*.42,c=Math.cos(d.rotY),s=Math.sin(d.rotY);
        q.setFromAxisAngle(OSM_UP,d.rotY);pos.set(d.x+lx*c,d.wallTop+roofH*.72+.55,d.z-lx*s);
        m.compose(pos,q,scale);mesh.setMatrixAt(i,m);
      }mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }

    if(spires.length){
      const mesh=new THREE.InstancedMesh(this.spireGeo,this.roofSlateMat,spires.length);mesh.name='osmChurchSpires';
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
      for(let i=0;i<spires.length;i++){
        const d=spires[i];q.setFromAxisAngle(OSM_UP,d.rotY);pos.set(d.x,d.wallTop+d.height/2,d.z);
        scale.set(d.radius,d.height,d.radius);m.compose(pos,q,scale);mesh.setMatrixAt(i,m);
      }mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }
    return desc.length;
  }
}

const OSM_UP = new THREE.Vector3(0,1,0);

function osmBuildingKey(x,z){ return `${Math.round(x*10)},${Math.round(z*10)}`; }

function osmFadeScenery(mat){
  const previous=mat.onBeforeCompile;
  const key=typeof mat.customProgramCacheKey==='function'?mat.customProgramCacheKey():'standard';
  mat.onBeforeCompile=shader=>{
    if(previous)previous(shader);
    shader.vertexShader='varying float sceneryDistance;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n#ifdef USE_INSTANCING\n'+
      'vec2 patchCenter = floor(instanceMatrix[3].xz / 4000.0) * 4000.0 + 2000.0;\n'+
      'sceneryDistance = length((modelViewMatrix * vec4(patchCenter.x, instanceMatrix[3].y, patchCenter.y, 1.0)).xyz);\n'+
      '#else\nsceneryDistance = length(mvPosition.xyz);\n#endif');
    shader.fragmentShader='varying float sceneryDistance;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nfloat sceneryAlpha = 1.0 - smoothstep(5500.0, 6500.0, sceneryDistance);\n'+
      'float sceneryDither = fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.0625, 0.25)));\n'+
      'if (sceneryAlpha <= sceneryDither) discard;');
  };
  mat.customProgramCacheKey=()=> key+'-scenery-fade-161';
}

function osmSmooth(t){ return t*t*(3-2*t); }
function osmValueNoise(x,z,salt){
  const ix=Math.floor(x),iz=Math.floor(z),fx=osmSmooth(x-ix),fz=osmSmooth(z-iz);
  const a=osmHash(ix,iz,salt),b=osmHash(ix+1,iz,salt);
  const c=osmHash(ix,iz+1,salt),d=osmHash(ix+1,iz+1,salt);
  return (a+(b-a)*fx)*(1-fz)+(c+(d-c)*fx)*fz;
}

function osmRoofHeight(d){
  if(d.church) return Math.min(6.5,Math.max(3.2,d.depth*.30));
  if(d.barn) return Math.min(4.8,Math.max(2.1,d.depth*.24));
  return Math.min(5.4,Math.max(1.8,d.depth*(.21+osmHash(d.x,d.z,162)*.13)));
}

function osmRingEdgeDistance(x,z,ring){
  let best=Infinity;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    best=Math.min(best,pointSegmentDistanceSq(x,z,a[0],a[1],b[0],b[1]));
  }
  return Math.sqrt(best);
}

function osmClipHalfPlane(ring,nx,nz,limit,greater){
  if(!ring.length) return [];
  const out=[],sign=greater?1:-1;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    const da=(a[0]*nx+a[1]*nz-limit)*sign,db=(b[0]*nx+b[1]*nz-limit)*sign;
    if(da>=0) out.push(a);
    if((da>=0)!==(db>=0)){
      const t=da/(da-db);
      out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return out;
}

function makeOSMWaterTexture(){
  if(typeof THREE.DataTexture!=='function')return null;
  // Very broad, low-contrast neutral undulation. Integer wave frequencies
  // keep the texture tileable; low amplitudes and the 260m world repeat keep
  // it from becoming a visible screen pattern at low flight altitude.
  const n=128,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const a=x/n*Math.PI*2,b=y/n*Math.PI*2,i=(y*n+x)*4;
    const v=Math.round(249+2.2*Math.sin(a+2*b)+1.4*Math.sin(2*a-b)+.8*Math.sin(3*a+b));
    pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
  }
  const tex=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}

function osmBuildingFootprint(b,x,z){
  const c=Math.cos(b.rotY),s=Math.sin(b.rotY),hw=b.w*0.53,hd=b.d*0.54;
  // THREE.Matrix4.makeRotationY: x'=cx+sz, z'=-sx+cz.
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([u,v])=>[x+c*u+s*v,z-s*u+c*v]);
}

function osmRibbonPairs(line,ox,oz,width){
  const world=line.map(([x,z])=>[x+ox,z+oz]);
  return world.map(([x,z],i)=>{
    const p=world[Math.max(0,i-1)],n=world[Math.min(world.length-1,i+1)];
    const dx=n[0]-p[0],dz=n[1]-p[1],k=width/2/(Math.hypot(dx,dz)||1);
    return [[x-dz*k,z+dx*k],[x+dz*k,z-dx*k]];
  });
}

// Source centre-lines are retained. Resample for gently varying bank widths and
// taper only unconnected source ends, never tile seams or mapped confluences.
// Rendering AND placement masks must call this exact function.
function osmWaterPairs(line,ox,oz,width,ends=[false,false]){
  if(!line||line.length<2)return [];
  const sampled=[line[0]],dist=[0];let total=0;
  const length=line.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-line[i][0],p[1]-line[i][1]),0);
  for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    // Preserve original bends. Only sparse long segments need extra samples;
    // grid clipping handles ground accuracy, so 8m subdivision wasted triangles.
    const steps=Math.max(1,Math.ceil(len/80)),fractions=[];
    for(let j=1;j<=steps;j++)fractions.push(j/steps);
    for(const distance of [ends[0]?12:-1,ends[1]?length-12:-1])
      if(distance>total&&distance<total+len)fractions.push((distance-total)/len);
    fractions.sort((a,b)=>a-b);
    for(const f of fractions){
      sampled.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);dist.push(total+len*f);
    }total+=len;
  }
  const pairs=osmRibbonPairs(sampled,ox,oz,width);
  return pairs.map((pair,i)=>{
    const x=sampled[i][0]+ox,z=sampled[i][1]+oz;
    const taper=Math.min(1,ends[0]?dist[i]/12:1,ends[1]?(total-dist[i])/12:1);
    const factor=Math.max(.08,taper)*(.95+.05*Math.sin(x*.07+z*.09));
    return pair.map(([px,pz])=>[x+(px-x)*factor,z+(pz-z)*factor]);
  });
}

function makeOSMWaterIndex(records,tileSize){
  const cellSize=128,cells=new Map();
  const add=ring=>{
    if(ring.length<3) return;
    const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
    const f={ring,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
    for(let x=Math.floor((f.minX-8)/cellSize);x<=Math.floor((f.maxX+8)/cellSize);x++)
      for(let z=Math.floor((f.minZ-8)/cellSize);z<=Math.floor((f.maxZ+8)/cellSize);z++){
        const key=x+','+z;
        if(!cells.has(key)) cells.set(key,[]);
        cells.get(key).push(f);
      }
  };
  for(const {tx,tz,data} of records){
    const ox=tx*tileSize,oz=tz*tileSize;
    for(const ring of data.lakes||[]) add(cleanPolygonRing(ring.map(([x,z])=>[x+ox,z+oz])));
    for(let i=0;i<(data.rivers||[]).length;i++){
      const pairs=osmWaterPairs(data.rivers[i],ox,oz,data.riverWidths?.[i]||12,data.riverEnds?.[i]);
      for(let i=1;i<pairs.length;i++){
        // EXACT projected triangles from _buildRibbons, including bend joins.
        const [a,b]=pairs[i-1],[c,d]=pairs[i];
        add([a,b,c]); add([b,d,c]);
      }
    }
  }
  return {cells,cellSize};
}

function osmSegmentsIntersect(a,b,c,d){
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),t=cross(c,d,b);
  if(((u>0&&v<0)||(u<0&&v>0))&&((w>0&&t<0)||(w<0&&t>0))) return true;
  const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-7&&r[0]>=Math.min(p[0],q[0])-1e-7&&r[0]<=Math.max(p[0],q[0])+1e-7&&r[1]>=Math.min(p[1],q[1])-1e-7&&r[1]<=Math.max(p[1],q[1])+1e-7;
  return on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}

function osmWaterOverlaps(footprint,margin,index){
  if(!index) return false;
  const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
  const minX=Math.min(...xs)-margin,maxX=Math.max(...xs)+margin;
  const minZ=Math.min(...zs)-margin,maxZ=Math.max(...zs)+margin;
  const candidates=new Set(),cs=index.cellSize;
  for(let x=Math.floor(minX/cs);x<=Math.floor(maxX/cs);x++) for(let z=Math.floor(minZ/cs);z<=Math.floor(maxZ/cs);z++)
    for(const f of index.cells.get(x+','+z)||[]) candidates.add(f);
  const r2=margin*margin;
  for(const f of candidates){
    if(f.maxX<minX||f.minX>maxX||f.maxZ<minZ||f.minZ>maxZ) continue;
    if(footprint.some(p=>pointInPolygon(p[0],p[1],f.ring))) return true;
    if(footprint.length>2&&f.ring.some(p=>pointInPolygon(p[0],p[1],footprint))) return true;
    for(let i=0;i<footprint.length;i++){
      const a=footprint[i],b=footprint[(i+1)%footprint.length];
      for(let j=0;j<f.ring.length;j++){
        const c=f.ring[j],d=f.ring[(j+1)%f.ring.length];
        if(osmSegmentsIntersect(a,b,c,d)||
           pointSegmentDistanceSq(a[0],a[1],c[0],c[1],d[0],d[1])<=r2||
           pointSegmentDistanceSq(c[0],c[1],a[0],a[1],b[0],b[1])<=r2) return true;
      }
    }
  }
  return false;
}

function makeOSMWallGeometry(){
  const geo=new THREE.BoxGeometry(1,1,1);
  const uv=geo.attributes && geo.attributes.uv;
  if(uv) for(let i=0;i<uv.count;i++){
    // Canvas top half: window-only side/rear. Bottom half: entrance facade.
    // BoxGeometry face order: +X,-X,+Y,-Y,+Z,-Z.
    const front=Math.floor(i/4)===4;
    uv.setY(i,uv.getY(i)*0.5+(front?0:0.5));
  }
  return geo;
}

function osmCanvasTexture(canvas){
  const tex=new THREE.CanvasTexture(canvas);
  tex.anisotropy=4;
  tex.encoding=THREE.sRGBEncoding;
  return tex;
}

function makeOSMFacadePanel(variant=0,style=0){
  if(typeof document==='undefined') return null; // placement-only Node tests
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=512;
  const c=canvas.getContext('2d');
  const profiles=[
    {top:[90,343],bottom:[96,350],door:224},
    {top:[64,333],bottom:[68,342],door:215},
    {top:[125,353],bottom:[80,355],door:224},
    {top:[68,262,417],bottom:[270,413],door:72}
  ];
  const profile={...profiles[(variant+style)%profiles.length]};
  if(style===2){profile.top=[];profile.bottom=[110,355];}
  if(style===3){profile.top=[102,369];profile.bottom=[];}
  const drawWindow=(x,wy,w=42,h=57)=>{
    c.fillStyle='#a69c84'; c.fillRect(x-5,wy-5,w+10,h+10);
    c.fillStyle=variant%2?'#596044':'#685244';
    if(style!==3){c.fillRect(x-17,wy,10,h);if((x+variant)%3)c.fillRect(x+w+7,wy,10,h);}
    c.fillStyle='#263633'; c.fillRect(x,wy,w,h);
    c.fillStyle='#66766e'; c.fillRect(x+3,wy+3,Math.max(8,w*.38),Math.max(10,h*.4));
    c.fillStyle='#b7b3a0'; c.fillRect(x+w/2-1.5,wy,3,h); c.fillRect(x,wy+h/2-1.5,w,3);
    c.fillStyle='#ece5d3'; c.fillRect(x-6,wy+h+1,w+12,4);
  };
  for(let panel=0;panel<2;panel++){
    const y=panel*256;
    c.fillStyle=[['#ede5d3','#e0d0b5','#e9d5bb','#ccbfa8'],['#d8d7cc','#c2c9c7','#d9d5c7','#b2b8b4'],
      ['#e4ce9e','#d3b27d','#e1c9a3','#bfa684'],['#c39a84','#b78f7a','#ceae99','#a88c79']][variant%4][style]; c.fillRect(0,y,512,256);
    if(style===1){
      c.strokeStyle='#756048';c.lineWidth=8;
      for(const x of [5,127,255,383,507]){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+224);c.stroke();}
      for(const yy of [y+8,y+116,y+220]){c.beginPath();c.moveTo(0,yy);c.lineTo(512,yy);c.stroke();}
      for(const x of [5,255]){c.beginPath();c.moveTo(x,y+116);c.lineTo(x+120,y+220);c.stroke();}
    }
    if(style===3){c.strokeStyle='rgba(67,53,39,.3)';c.lineWidth=2;for(let x=0;x<512;x+=20){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+224);c.stroke();}}
    // Weathered plaster, stone footing and cornice; one shared 1 MB atlas.
    for(let i=0;i<2400;i++){
      c.fillStyle=i%2?'rgba(90,78,62,0.065)':'rgba(255,253,236,0.10)';
      c.fillRect(osmHash(i,panel,81)*512,y+osmHash(i,panel,82)*256,2+osmHash(i,panel,83)*9,2);
    }
    c.fillStyle='#a39b89'; c.fillRect(0,y+222,512,34);
    c.strokeStyle='#888270'; c.lineWidth=1;
    for(let row=0;row<2;row++) for(let col=0;col<14;col++){
      c.strokeRect(col*40+(row%2)*20,y+223+row*16,40,16);
    }
    c.fillStyle='#c6bfaf'; c.fillRect(0,y+3,512,7);
    // Side/rear faces have one opening per floor, with some blank walls.
    // The entrance face carries only two or three windows per floor.
    const top=panel===0?(style===2?[]:profile.top.slice(0,variant===2?0:1)):profile.top;
    const bottom=panel===0?profile.bottom.slice(0,1):profile.bottom;
    for(const x of top)drawWindow(x,y+31,variant===1?36:42,variant===2?64:57);
    for(const x of bottom){
      if(panel===1&&Math.abs(x-profile.door)<62)continue;
      drawWindow(x,y+(style===2?78:136),variant===3?38:42,style===2?91:variant===0?62:57);
    }
    if(panel===1){
      if(style===3){c.fillStyle='#655342';c.fillRect(175,y+113,163,141);c.strokeStyle='#a29780';c.lineWidth=3;c.strokeRect(175,y+113,163,141);c.beginPath();c.moveTo(255,y+113);c.lineTo(255,y+254);c.stroke();continue;}
      const x=profile.door,dy=y+143;
      c.fillStyle='#b6ad98'; c.fillRect(x-6,dy-6,54,111);
      c.fillStyle='#4f4434'; c.fillRect(x,dy,42,101);
      c.strokeStyle='#837159'; c.lineWidth=2; c.strokeRect(x+6,dy+10,30,31); c.strokeRect(x+6,dy+50,30,42);
      c.fillStyle='#b3a17a'; c.fillRect(x+33,dy+47,4,5);
    }
  }
  return canvas;
}
function makeOSMFacadeTexture(variant=0){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const c=canvas.getContext('2d');
  for(let style=0;style<4;style++)c.drawImage(makeOSMFacadePanel(variant,style),(style%2)*512,(1-Math.floor(style/2))*512);
  return osmCanvasTexture(canvas);
}

function makeOSMRoofTexture(){
  if(typeof document==='undefined') return null;
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=256;
  const c=canvas.getContext('2d');
  c.fillStyle='#b9b2a7'; c.fillRect(0,0,256,256);
  for(let row=0;row<16;row++) for(let col=-1;col<16;col++){
    const light=Math.floor(150+osmHash(row,col,90)*60);
    c.fillStyle=`rgb(${light},${light},${light})`;
    const x=col*20+(row%2)*10,y=row*16;
    c.fillRect(x+1,y+1,18,14);
    c.fillStyle='rgba(25,21,16,0.28)'; c.fillRect(x,y+14,20,2);
  }
  return osmCanvasTexture(canvas);
}

function makeGableRoofGeometry(){
  // Unit prism, ridge along local X. There is deliberately no bottom face.
  const positions=[
    -0.5,0,-0.5,  0.5,0,-0.5,
    -0.5,0, 0.5,  0.5,0, 0.5,
    -0.5,1, 0.0,  0.5,1, 0.0
  ];
  const indices=[
    0,5,1, 0,4,5,       // south roof plane
    2,3,5, 2,5,4,       // north roof plane
    0,2,4,               // west gable
    1,5,3                // east gable
  ];
  const expanded=[],uv=[];
  for(let i=0;i<indices.length;i++){
    const idx=indices[i],x=positions[idx*3],y=positions[idx*3+1],z=positions[idx*3+2];
    expanded.push(x,y,z);
    uv.push(i<12?x+0.5:z+0.5,i<12?(z<0?y:1-y):y);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(expanded,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function makeHipRoofGeometry(){
  // Low tiled hip roofs break up the repeated gable silhouette without adding
  // material buckets or draw calls. The ridge stays along the long X axis.
  const v=[
    [-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],
    [-.27,1,0],[.27,1,0]
  ];
  const faces=[[0,4,5],[0,5,1],[3,2,5],[3,5,4],[0,3,4],[1,5,2]];
  const pos=[],uv=[];
  for(const face of faces)for(const i of face){
    const [x,y,z]=v[i];pos.push(x,y,z);uv.push(x+.5,z+.5);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();geo.computeBoundingSphere();
  return geo;
}

function osmHash(x, z, salt){
  const s = Math.sin(x*0.0913 + z*0.1277 + salt*7.13) * 43758.5453;
  return s - Math.floor(s);
}

function pointInPolygon(px, pz, ring){
  let inside = false;
  for(let i = 0, j = ring.length-1; i < ring.length; j = i++){
    const [xi,zi] = ring[i], [xj,zj] = ring[j];
    const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj-xi)*(pz-zi)/(zj-zi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

function cleanPolygonRing(ring){
  const out=[];
  for(const p of ring||[]){
    if(!out.length || Math.abs(p[0]-out[out.length-1][0])>1e-6 || Math.abs(p[1]-out[out.length-1][1])>1e-6) out.push(p);
  }
  if(out.length>1 && Math.abs(out[0][0]-out[out.length-1][0])<1e-6 && Math.abs(out[0][1]-out[out.length-1][1])<1e-6) out.pop();
  return out;
}

function polygonArea2(ring){
  let area=0;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) area+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
  return area;
}

function cross2(a,b,c){
  return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
}

function pointInTriangle2(p,a,b,c,orientation){
  const eps=1e-8;
  return cross2(a,b,p)*orientation>=-eps && cross2(b,c,p)*orientation>=-eps && cross2(c,a,p)*orientation>=-eps;
}

function triangulateSimplePolygon(input){
  const ring=cleanPolygonRing(input);
  if(ring.length<3) return [];
  const orientation=polygonArea2(ring)>=0 ? 1 : -1;
  const remaining=ring.map((_,i)=>i), triangles=[];
  let guard=ring.length*ring.length;
  while(remaining.length>3 && guard-->0){
    let clipped=false;
    for(let i=0;i<remaining.length;i++){
      const ia=remaining[(i-1+remaining.length)%remaining.length];
      const ib=remaining[i];
      const ic=remaining[(i+1)%remaining.length];
      const a=ring[ia],b=ring[ib],c=ring[ic];
      if(cross2(a,b,c)*orientation<=1e-8) continue;
      let occupied=false;
      for(const ip of remaining){
        if(ip===ia||ip===ib||ip===ic) continue;
        if(pointInTriangle2(ring[ip],a,b,c,orientation)){ occupied=true; break; }
      }
      if(occupied) continue;
      triangles.push([ia,ib,ic]);
      remaining.splice(i,1);
      clipped=true;
      break;
    }
    if(!clipped) return [];
  }
  if(remaining.length===3) triangles.push([remaining[0],remaining[1],remaining[2]]);
  return triangles;
}

function pointSegmentDistanceSq(px,pz,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az;
  const denom=dx*dx+dz*dz;
  const t=denom ? Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/denom)) : 0;
  const qx=ax+t*dx,qz=az+t*dz;
  return (px-qx)*(px-qx)+(pz-qz)*(pz-qz);
}

function addUpwardTriOSM(indices, positions, a, b, c){
  const pa=[positions[a*3],positions[a*3+1],positions[a*3+2]];
  const pb=[positions[b*3],positions[b*3+1],positions[b*3+2]];
  const pc=[positions[c*3],positions[c*3+1],positions[c*3+2]];
  const e1=[pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]];
  const e2=[pc[0]-pa[0],pc[1]-pa[1],pc[2]-pa[2]];
  const ny = e1[2]*e2[0]-e1[0]*e2[2];
  if(ny >= 0) indices.push(a,b,c);
  else indices.push(a,c,b);
}

// Small tree groups, each root sampled on the terrain after instance rotation.
// All vertices fit the full disc validated against woodland and exclusions.
function normaliseOSMForestCrown(geo){
 const a=geo.attributes.position.array;let radius=0;
 for(let i=0;i<a.length;i+=3)radius=Math.max(radius,Math.hypot(a[i],a[i+2]));
 for(let i=0;i<a.length;i+=3){a[i]/=radius;a[i+2]/=radius;}
 const uv=[];for(let i=0;i<a.length;i+=3)uv.push(a[i]*.5+.5,a[i+2]*.5+.5);
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 if(!geo.attributes.forestPart)geo.setAttribute('forestPart',new THREE.Float32BufferAttribute(new Float32Array(a.length/3*2),2));
 if(geo.userData?.forestRoots)geo.userData.forestRoots=geo.userData.forestRoots.map(([x,z])=>[x/radius,z/radius]);
 geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
function makeOSMForestCrown(kind){
 const positions=[],parts=[],indices=[],roots=[[.35,.03],[-.24,.39],[-.30,-.35]];
 const add=(x,y,z,tree,stem=0)=>{parts.push(tree,stem);positions.push(x,y,z);return positions.length/3-1;};
 const phi=(1+Math.sqrt(5))/2;
 const ico=[[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]];
 const faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 for(let tree=0;tree<3;tree++){
  const [cx,cz]=roots[tree],height=[14,19,16][tree],width=[.52,.45,.50][tree];
  const trunk=positions.length/3;
  for(const y of [0,height*.58])for(let i=0;i<4;i++){const a=i*Math.PI/2;add(cx+Math.cos(a)*.019,y,cz+Math.sin(a)*.019,tree,1);}
  for(let i=0;i<4;i++){const a=trunk+i,b=trunk+(i+1)%4;indices.push(a,a+4,b,b,a+4,b+4);}
  if(kind===0){
   for(let layer=0;layer<3;layer++){
    const base=positions.length/3,r=width*(1-layer*.24),y=height*(.20+layer*.22);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;add(cx+Math.cos(a)*r,y,cz+Math.sin(a)*r,tree);}
    const top=add(cx+.025*(tree-1),y+height*.40,cz,tree);
    for(let i=0;i<6;i++)indices.push(base+i,top,base+(i+1)%6);
   }
  }else{
   const base=positions.length/3;
   // A broad, irregular lower crown and an offset upper tuft give each tree
   // a branching silhouette. Only eight more faces per tree, no new buckets.
   for(let i=0;i<ico.length;i++){
    const v=ico[i],d=Math.hypot(...v),bump=.78+.28*osmHash(i,tree,411);
    add(cx+(v[0]/d*bump+.07*v[1]/d)*width,height*(.57+v[1]/d*.25),cz+v[2]/d*width*(1.04-.10*tree)*bump,tree);
   }
   for(const f of faces)indices.push(...f.map(i=>base+i));
   const tuft=positions.length/3,tx=cx+width*[.15,-.19,.23][tree],tz=cz+width*[.12,.08,-.15][tree];
   for(const v of [[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0],[0,-1,0]])
    add(tx+v[0]*width*.65,height*(.79+v[1]*.23),tz+v[2]*width*.64,tree);
   for(let i=0;i<4;i++){const a=tuft+i,b=tuft+(i+1)%4;indices.push(a,tuft+4,b,a,b,tuft+5);}
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);
 geo.setAttribute('forestPart',new THREE.Float32BufferAttribute(parts,2));geo.userData=geo.userData||{};geo.userData.forestRoots=roots;
 return normaliseOSMForestCrown(geo);
}
function makeOSMForestTexture(){
 if(typeof document==='undefined')return null;
 const n=256,c=document.createElement('canvas');c.width=c.height=n;const ctx=c.getContext('2d'),img=ctx.createImageData(n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const warp=osmValueNoise(x/45,y/45,280)*13;
  const leaf=osmValueNoise((x+warp)/5,(y-warp)/5,281)-.5;
  const shade=osmValueNoise((x-warp)/17,(y+warp)/17,282)-.5,grain=osmHash(x,y,284)-.5;
  const value=Math.round(190+leaf*30+shade*20+grain*15),i=(y*n+x)*4;
  img.data[i]=img.data[i+1]=img.data[i+2]=value;img.data[i+3]=255;
 }
 ctx.putImageData(img,0,0);const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 tex.anisotropy=4;return tex;
}
function osmCanopyTerrain(material){
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{
  previous(shader);shader.vertexShader='attribute vec4 canopyGround;\nattribute vec2 forestPart;\nvarying float forestStem;\nvarying float forestShade;\n'+shader.vertexShader;
  shader.fragmentShader='varying float forestStem;\nvarying float forestShade;\n'+shader.fragmentShader;
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
   '#include <uv_vertex>\n#ifdef USE_UV\n#ifdef USE_INSTANCING\nvec3 leafWorld = (instanceMatrix * vec4(position, 1.0)).xyz;\nvUv = (leafWorld.xz + leafWorld.y * vec2(0.37,0.21)) / 48.0;\n#else\nvUv = (modelMatrix * vec4(position, 1.0)).xz / 48.0;\n#endif\n#endif');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\nforestStem = forestPart.y;\nforestShade = 1.0;\n#ifdef USE_INSTANCING\nforestShade = 0.88 + 0.22 * fract(sin(dot(instanceMatrix[3].xz + vec2(forestPart.x * 17.0), vec2(0.013,0.019))) * 43758.5453);\n#endif\n'+
   'transformed.y += forestPart.x < 0.5 ? canopyGround.x : forestPart.x < 1.5 ? canopyGround.y : canopyGround.z;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
   '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * forestShade, vec3(0.25,0.19,0.12), forestStem);');
 };
 material.customProgramCacheKey=()=> 'rooted-tree-groups-166';
}
function makeOSMTreeCrown(kind){
 const positions=[];
 const tri=(a,b,c)=>positions.push(...a,...b,...c);
 const lobe=(cx,cy,cz,rx,ry,rz)=>{
  const point=(ring,sector)=>{const a=ring*Math.PI/4,b=sector*Math.PI/4;return [cx+rx*Math.sin(a)*Math.cos(b),cy+ry*Math.cos(a),cz+rz*Math.sin(a)*Math.sin(b)];};
  for(let j=0;j<4;j++)for(let i=0;i<8;i++){const a=point(j,i),b=point(j+1,i),c=point(j+1,i+1),d=point(j,i+1);tri(a,d,b);tri(b,d,c);}
 };
 if(kind===0){
  for(let layer=0;layer<3;layer++){
   const y=-3.6+layer*2.1,r=3.7-layer*.9,top=y+3.8;
   for(let i=0;i<8;i++){const a=i*Math.PI/4,b=(i+1)*Math.PI/4;tri([r*Math.cos(a),y,r*Math.sin(a)],[0,top,0],[r*Math.cos(b),y,r*Math.sin(b)]);}
  }
 }else if(kind===3){lobe(0,0,0,1.4,5.1,1.6);lobe(.35,1.2,.2,1.2,3.7,1.2);}
 else if(kind===4){lobe(0,.8,0,3,2.3,2.7);for(let i=0;i<4;i++){const a=i*Math.PI/2;lobe(Math.cos(a)*1.9,-.9,Math.sin(a)*1.9,1.5,2.5,1.5);}}
 else {lobe(0,.5,0,2.5,2.5,2.5);for(let i=0;i<3;i++){const a=i*Math.PI*2/3;lobe(Math.cos(a)*1.6,-.4,Math.sin(a)*1.6,2,2.1,2);}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
