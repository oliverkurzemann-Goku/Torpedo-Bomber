// ============================================================
// OSMManager — renders the offline real-world feature tiles used by Remagen.
// Public contract is intentionally unchanged: loadTile(), unloadTile(), tiles.
// See /TERRAIN.md before changing terrain, buildings, vegetation or LOD logic.
// ============================================================

class OSMManager {
  constructor(scene, tileSize, terrainManager, baseUrl = 'data/osm/'){
    this.scene = scene;
    this.tileSize = tileSize;
    this.terrain = terrainManager;
    this.baseUrl = baseUrl;
    this.tiles = new Map();

    this.roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
    this.railMat = new THREE.MeshStandardMaterial({ color: 0x585048, roughness: 0.8 });
    this.riverMat = new THREE.MeshStandardMaterial({ color: 0x426f78, roughness: 0.72, metalness: 0 });
    this.lakeMat = new THREE.MeshStandardMaterial({ color: 0x3c6d78, roughness: 0.68, metalness: 0 });
    // Farmland is a subtle tint over the textured terrain, not an opaque map
    // polygon. Opaque yellow polygons made whole valleys read like a board game.
    this.farmMat = new THREE.MeshStandardMaterial({
      color: 0x8a8054, roughness: 1, transparent: true, opacity: 0.20,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
    });

    // Building palette: still cheap/instanced, but no longer one identical box everywhere.
    this.buildingWarmMat = new THREE.MeshStandardMaterial({ color: 0x9b8a73, roughness: 0.95 });
    this.buildingCoolMat = new THREE.MeshStandardMaterial({ color: 0x807d75, roughness: 0.95 });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x653b31, roughness: 0.95 });
    this.roofSlateMat = new THREE.MeshStandardMaterial({ color: 0x454b4a, roughness: 0.98 });
    this.flatRoofMat = new THREE.MeshStandardMaterial({ color: 0x4d4b45, roughness: 1 });
    this.chimneyMat = new THREE.MeshStandardMaterial({ color: 0x4e4038, roughness: 1 });
    this.facadeDetailMat = new THREE.MeshStandardMaterial({ color: 0x27302d, roughness: 0.85 });

    // Vegetation palette. Four tree draw calls maximum per tile regardless of
    // how many forest polygons the source data contains.
    this.trunkGeo = new THREE.CylinderGeometry(0.34, 0.48, 5.5, 6);
    this.coniferGeo = new THREE.ConeGeometry(2.7, 7.5, 7);
    this.deciduousGeo = new THREE.DodecahedronGeometry(2.7, 0);
    this.shrubGeo = new THREE.DodecahedronGeometry(1.7, 0);
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x51402d, roughness: 1 });
    this.coniferMat = new THREE.MeshStandardMaterial({ color: 0x284d28, roughness: 1 });
    this.deciduousMat = new THREE.MeshStandardMaterial({ color: 0x3f6835, roughness: 1 });
    this.shrubMat = new THREE.MeshStandardMaterial({ color: 0x536f3a, roughness: 1 });

    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    // Proper gable prism: the previous four-sided cone was a pyramid. Once
    // stretched over a rectangular footprint it produced the implausible tall,
    // diagonal roof faces visible in BUILD 7 screenshots.
    this.gableRoofGeo = makeGableRoofGeometry();
    this.chimneyGeo = new THREE.BoxGeometry(0.72, 1.8, 0.72);

    this.sharedGeometries = new Set([
      this.boxGeo, this.gableRoofGeo, this.chimneyGeo, this.trunkGeo,
      this.coniferGeo, this.deciduousGeo, this.shrubGeo
    ]);
  }

  _key(tx, tz){ return tx + ',' + tz; }

  async loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return;

    let data;
    try {
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
    const riverMesh = this._buildRibbons(data.rivers || [], ox, oz, 34, this.riverMat, 1.8);
    if(riverMesh) group.add(riverMesh);
    const lakeMesh = this._buildFlatPolygons(data.lakes || [], ox, oz, this.lakeMat, 0.9);
    if(lakeMesh) group.add(lakeMesh);
    const farmMesh = this._buildFlatPolygons(data.farmland || [], ox, oz, this.farmMat, 0.3);
    if(farmMesh) group.add(farmMesh);
    const airfieldMesh = this._buildFlatPolygons(data.airfields || [], ox, oz, this.roadMat, 0.3);
    if(airfieldMesh) group.add(airfieldMesh);

    // Infrastructure stays visible across tile boundaries. Only expensive
    // vegetation/building instances are distance-culled by remagen-mission.html.
    const farGroup = new THREE.Group();
    group.add(farGroup);
    const forestExclusion = this._buildForestExclusion(data, ox, oz);
    const treeCount = this._buildForests(farGroup, data.forests || [], ox, oz, forestExclusion);
    const buildingCount = this._buildBuildings(farGroup, data.buildings || [], ox, oz, forestExclusion);

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
    // A building corner or jittered tree can cross a tile edge by a few metres.
    // Clamp only for the height query so a missing neighbour in demo pages
    // cannot abort the whole tile build. Remagen itself preloads all DEM tiles.
    const eps = 0.01;
    const qx = Math.min(ox + this.tileSize - eps, Math.max(ox + eps, x));
    const qz = Math.min(oz + this.tileSize - eps, Math.max(oz + eps, z));
    return this.terrain.getRenderedHeight(qx, qz);
  }

  _buildRibbons(lines, ox, oz, width, mat, yOffset){
    if(!lines || lines.length === 0) return null;
    const positions = [], indices = [];
    for(const localPts of lines){
      if(!localPts || localPts.length < 2) continue;
      const world = localPts.map(([lx,lz]) => [ox+lx, oz+lz]);
      const base = positions.length/3;
      for(let i = 0; i < world.length; i++){
        const [x,z] = world[i];
        const [px,pz] = world[Math.max(0,i-1)];
        const [nx,nz] = world[Math.min(world.length-1,i+1)];
        let dx = nx-px, dz = nz-pz;
        const len = Math.hypot(dx,dz) || 1;
        dx/=len; dz/=len;
        const perpX = -dz*width/2, perpZ = dx*width/2;
        const y = this.terrain.getRenderedHeight(x,z) + yOffset;
        positions.push(x+perpX, y, z+perpZ, x-perpX, y, z-perpZ);
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
    return new THREE.Mesh(geo, mat);
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
    return new THREE.Mesh(geo, mat);
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
    addCorridors(data.rivers, 23, 'river'); // 17m rendered half-width + margin
    addPolygons(data.lakes, 7, 'lake');
    addPolygons(data.airfields, 12, 'airfield');

    for(const b of data.buildings||[]){
      const x=ox+b.x,z=oz+b.z,c=Math.cos(b.rotY),s=Math.sin(b.rotY),margin=7;
      const ex=Math.abs(c)*b.w/2+Math.abs(s)*b.d/2+margin;
      const ez=Math.abs(s)*b.w/2+Math.abs(c)*b.d/2+margin;
      add({kind:'building',source:'building',x,z,c,s,hw:b.w/2+margin,hd:b.d/2+margin},x-ex,z-ez,x+ex,z+ez);
    }
    return {cellSize,cells};
  }

  _treeExcluded(x,z,index){
    if(!index) return false;
    const bucket=index.cells.get(Math.floor(x/index.cellSize)+','+Math.floor(z/index.cellSize));
    if(!bucket) return false;
    for(const f of bucket){
      if(f.kind==='segment' && pointSegmentDistanceSq(x,z,f.ax,f.az,f.bx,f.bz)<=f.r2) return true;
      if(f.kind==='polygon' && pointInPolygon(x,z,f.ring)) return true;
      if(f.kind==='building'){
        const dx=x-f.x,dz=z-f.z;
        const lx=dx*f.c+dz*f.s, lz=-dx*f.s+dz*f.c;
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
    const c=Math.cos(b.rotY),s=Math.sin(b.rotY),hw=b.w/2,hd=b.d/2;
    // Centre, corners and edge midpoints. This catches both a small building
    // inside water and a long footprint crossed by a narrow mapped stream.
    const samples=[[0,0],[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd],[-hw,0],[hw,0],[0,-hd],[0,hd]];
    return samples.some(([lx,lz])=>this._pointTouchesWater(x+lx*c-lz*s,z+lx*s+lz*c,index));
  }

  _forestPlacements(polys, ox, oz, exclusion=null){
    const placements = [];
    const usedCells = new Set();

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
      const step = Math.min(150, Math.max(20, Math.round(Math.sqrt(bboxArea / TARGET_TREES))));

      for(let x = minX; x <= maxX; x += step){
        for(let z = minZ; z <= maxZ; z += step){
          if(!pointInPolygon(x, z, world)) continue;
          const jx = (osmHash(x,z,1)-0.5)*step;
          const jz = (osmHash(x,z,2)-0.5)*step;
          const px = Math.min(ox+this.tileSize-0.01, Math.max(ox+0.01, x+jx));
          const pz = Math.min(oz+this.tileSize-0.01, Math.max(oz+0.01, z+jz));
          if(this._treeExcluded(px,pz,exclusion)) continue;

          // Overlapping source polygons used to create visibly doubled trees.
          // Dedupe on a small world-space cell while retaining organic jitter.
          const cell = `${Math.round(px/12)},${Math.round(pz/12)}`;
          if(usedCells.has(cell)) continue;
          usedCells.add(cell);

          const r = osmHash(px,pz,7);
          const kind = r < 0.52 ? 0 : (r < 0.90 ? 1 : 2); // conifer / deciduous / shrub
          placements.push({
            x:px, z:pz, kind,
            scale:0.78 + osmHash(px,pz,3)*0.62,
            rot:osmHash(px,pz,4)*Math.PI*2
          });
        }
      }
    }
    return placements;
  }

  _buildForests(group, polys, ox, oz, exclusion=null){
    if(!polys || polys.length === 0) return 0;
    const placements = this._forestPlacements(polys, ox, oz, exclusion);
    if(placements.length === 0) return 0;

    const conifers = placements.filter(p => p.kind === 0);
    const deciduous = placements.filter(p => p.kind === 1);
    const shrubs = placements.filter(p => p.kind === 2);
    const trunked = placements.filter(p => p.kind !== 2);

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
        scale.set(p.scale,p.scale,p.scale);
        m.compose(pos,q,scale);
        trunks.setMatrixAt(i,m);
      }
      trunks.instanceMatrix.needsUpdate=true;
      group.add(trunks);
    }

    const addCanopies = (items, geo, mat, yFactor, sx, sy, sz) => {
      if(!items.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      mesh.name = geo===this.coniferGeo ? 'osmForestConifers' : (geo===this.deciduousGeo ? 'osmForestDeciduous' : 'osmForestShrubs');
      for(let i=0;i<items.length;i++){
        const p=items[i], y=this._safeRenderedHeight(p.x,p.z,ox,oz);
        q.setFromAxisAngle(OSM_UP,p.rot);
        pos.set(p.x,y+yFactor*p.scale,p.z);
        scale.set(p.scale*sx,p.scale*sy,p.scale*sz);
        m.compose(pos,q,scale);
        mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;
      group.add(mesh);
    };

    addCanopies(conifers, this.coniferGeo, this.coniferMat, 5.6, 1.0, 1.0, 1.0);
    addCanopies(deciduous, this.deciduousGeo, this.deciduousMat, 5.5, 1.15, 1.05, 1.15);
    addCanopies(shrubs, this.shrubGeo, this.shrubMat, 1.5, 1.25, 0.85, 1.25);

    return placements.length;
  }

  _buildingGroundRange(b, x, z, ox, oz){
    const c=Math.cos(b.rotY), s=Math.sin(b.rotY);
    const hw=b.w/2, hd=b.d/2;
    const samples=[[0,0],[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
    let minY=Infinity,maxY=-Infinity;
    for(const [lx,lz] of samples){
      const wx=x + lx*c - lz*s;
      const wz=z + lx*s + lz*c;
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
      const area=b.w*b.d;
      const aspect=b.w/Math.max(1,b.d);
      const r=osmHash(x,z,21);

      // Size is real; exact levels are not present in the current tile JSON.
      // Use deterministic, bounded variation rather than pretending to know
      // the historical storey count.
      let h;
      if(area > 1600) h=8 + r*6;
      else if(area > 650) h=7 + r*5;
      else h=5.5 + r*4.5;

      const pitched = area < 1200 && b.d < 38 && aspect < 5.5;
      const warm = osmHash(x,z,22) > 0.34;
      const redRoof = osmHash(x,z,23) > 0.22;
      const chimney = pitched && area < 700 && Math.min(b.w,b.d) > 5 && osmHash(x,z,24) > 0.28;
      const ground=this._buildingGroundRange(b,x,z,ox,oz);

      // Foundation extends below the lowest sampled corner. The roof datum is
      // above the highest corner, so large buildings cannot visibly hover on
      // a slope or have an uphill corner poke through the wall.
      const baseY=ground.minY-0.8;
      const wallTop=ground.maxY+h;
      return {b,x,z,pitched,warm,redRoof,chimney,ground,baseY,wallTop};
    }).filter(Boolean);

    const warm=desc.filter(d=>d.warm);
    const cool=desc.filter(d=>!d.warm);
    const pitchedRed=desc.filter(d=>d.pitched&&d.redRoof);
    const pitchedSlate=desc.filter(d=>d.pitched&&!d.redRoof);
    const flat=desc.filter(d=>!d.pitched);
    const chimneys=desc.filter(d=>d.chimney);
    const detailed=desc.filter(d=>d.pitched&&d.b.w>=7&&d.b.d>=6&&d.b.w*d.b.d<900);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), pos=new THREE.Vector3(), scale=new THREE.Vector3();

    const addWalls=(items,mat)=>{
      if(!items.length) return;
      const mesh=new THREE.InstancedMesh(this.boxGeo,mat,items.length);
      mesh.name = mat===this.buildingWarmMat ? 'osmBuildingWallsWarm' : 'osmBuildingWallsCool';
      for(let i=0;i<items.length;i++){
        const d=items[i], h=d.wallTop-d.baseY;
        q.setFromAxisAngle(OSM_UP,d.b.rotY);
        pos.set(d.x,d.baseY+h/2,d.z);
        scale.set(d.b.w,h,d.b.d);
        m.compose(pos,q,scale);
        mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;
      group.add(mesh);
    };

    addWalls(warm,this.buildingWarmMat);
    addWalls(cool,this.buildingCoolMat);

    const addPitchedRoofs=(items,mat,name)=>{
      if(!items.length) return;
      const roofs=new THREE.InstancedMesh(this.gableRoofGeo,mat,items.length);
      roofs.name=name;
      for(let i=0;i<items.length;i++){
        const d=items[i];
        const roofH=Math.min(3.2,Math.max(1.1,d.b.d*0.16));
        q.setFromAxisAngle(OSM_UP,d.b.rotY);
        // Gable geometry spans y=0..1, so its base sits directly on wallTop.
        pos.set(d.x,d.wallTop+0.05,d.z);
        scale.set(d.b.w*1.06,roofH,d.b.d*1.08);
        m.compose(pos,q,scale);
        roofs.setMatrixAt(i,m);
      }
      roofs.instanceMatrix.needsUpdate=true;
      group.add(roofs);
    };

    addPitchedRoofs(pitchedRed,this.roofMat,'osmBuildingRoofsRed');
    addPitchedRoofs(pitchedSlate,this.roofSlateMat,'osmBuildingRoofsSlate');

    if(flat.length){
      const roofs=new THREE.InstancedMesh(this.boxGeo,this.flatRoofMat,flat.length);
      roofs.name='osmBuildingRoofsFlat';
      for(let i=0;i<flat.length;i++){
        const d=flat[i];
        q.setFromAxisAngle(OSM_UP,d.b.rotY);
        pos.set(d.x,d.wallTop+0.35,d.z);
        scale.set(d.b.w*1.02,0.7,d.b.d*1.02);
        m.compose(pos,q,scale);
        roofs.setMatrixAt(i,m);
      }
      roofs.instanceMatrix.needsUpdate=true;
      group.add(roofs);
    }

    if(chimneys.length){
      const mesh=new THREE.InstancedMesh(this.chimneyGeo,this.chimneyMat,chimneys.length);
      mesh.name='osmBuildingChimneys';
      for(let i=0;i<chimneys.length;i++){
        const d=chimneys[i],roofH=Math.min(3.2,Math.max(1.1,d.b.d*0.16));
        const lx=(osmHash(d.x,d.z,25)-0.5)*d.b.w*0.42;
        const c=Math.cos(d.b.rotY),s=Math.sin(d.b.rotY);
        q.setFromAxisAngle(OSM_UP,d.b.rotY);
        pos.set(d.x+lx*c,d.wallTop+roofH*0.72+0.55,d.z+lx*s);
        scale.set(1,1,1);
        m.compose(pos,q,scale);
        mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;
      group.add(mesh);
    }

    // One bounded facade-detail bucket per tile: a door and two front windows
    // on ordinary pitched-roof buildings. This adds visible scale/detail from
    // low altitude without creating thousands of individual Mesh draw calls.
    if(detailed.length){
      const details=[];
      for(const d of detailed){
        const front=osmHash(d.x,d.z,26)>0.5 ? 1 : -1;
        const lz=front*(d.b.d/2+0.10);
        const spread=Math.min(d.b.w*0.24,4.2);
        const specs=[[0,lz,1.15,1.15,2.3,0.18],[-spread,lz,2.65,1.15,1.05,0.18],[spread,lz,2.65,1.15,1.05,0.18]];
        const c=Math.cos(d.b.rotY),s=Math.sin(d.b.rotY);
        for(const [lx,lz0,yOff,sx,sy,sz] of specs){
          const x=d.x+lx*c-lz0*s,z=d.z+lx*s+lz0*c;
          details.push({x,z,y:this._safeRenderedHeight(x,z,ox,oz)+yOff,rot:d.b.rotY,sx,sy,sz});
        }
      }
      const mesh=new THREE.InstancedMesh(this.boxGeo,this.facadeDetailMat,details.length);
      mesh.name='osmBuildingFacadeDetails';
      for(let i=0;i<details.length;i++){
        const d=details[i];
        q.setFromAxisAngle(OSM_UP,d.rot);
        pos.set(d.x,d.y,d.z); scale.set(d.sx,d.sy,d.sz);
        m.compose(pos,q,scale); mesh.setMatrixAt(i,m);
      }
      mesh.instanceMatrix.needsUpdate=true;
      group.add(mesh);
    }

    return desc.length;
  }
}

const OSM_UP = new THREE.Vector3(0,1,0);

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
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
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
