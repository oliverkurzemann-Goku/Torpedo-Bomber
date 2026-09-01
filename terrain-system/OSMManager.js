// ============================================================
//  OSMManager — fetches a tile's real-feature JSON (produced offline by
//  tools/convert_osm_tile.js — see that file's header for the exact format
//  and the highway/railway/waterway/natural/landuse/building/aeroway tag
//  mapping) and renders it with the SAME simplified techniques Step 5's
//  procedural WaterRoadManager/VegetationManager already use: roads/rails/
//  rivers as ground-following ribbons, lakes/farmland as flat-ish tinted
//  ground patches, forests as scattered tree instances, buildings as simple
//  boxes (per the landscape spec: "individual buildings detailed only near
//  the aircraft" — a box is exactly the right amount of detail for anything
//  that isn't that).
//
//  Deliberately NOT wired into WorldStreamer yet. Loading a tile's JSON is
//  asynchronous (a real network fetch); WorldStreamer's loadTile(tx,tz)
//  contract is synchronous (matching TerrainManager.ensureTile()) — bridging
//  that is real integration work for a later step, not attempted here. This
//  class only proves the OFFLINE FORMAT -> FETCH -> PARSE -> RENDER pipeline
//  works, against the ONE hand-made sample tile convert_osm_tile.js
//  produces — see demo-dem-osm.html. Most tiles have no OSM file at all yet
//  (a 404 is treated as "nothing here", not an error) — that is the honest,
//  intended state until a real country-wide conversion exists.
// ============================================================

class OSMManager {
  constructor(scene, tileSize, terrainManager, baseUrl = 'data/osm/'){
    this.scene = scene;
    this.tileSize = tileSize;
    this.terrain = terrainManager;
    this.baseUrl = baseUrl;
    this.tiles = new Map();   // "tx,tz" -> { group: THREE.Group, treeCount, buildingCount } | null (no data)

    this.roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
    this.railMat = new THREE.MeshStandardMaterial({ color: 0x585048, roughness: 0.8 });
    this.riverMat = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.35, metalness: 0.1 });
    this.lakeMat = new THREE.MeshStandardMaterial({ color: 0x2f6f92, roughness: 0.2, metalness: 0.15 });
    this.farmMat = new THREE.MeshStandardMaterial({ color: 0xb8a355, roughness: 1 });
    this.buildingMat = new THREE.MeshStandardMaterial({ color: 0x9a8b78, roughness: 0.9 });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x6b3f36, roughness: 0.9 });
    this.trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4, 6);
    this.canopyGeo = new THREE.ConeGeometry(2.6, 6, 7);
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
    this.canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 1 });
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);   // scaled per-building via matrix
  }

  _key(tx, tz){ return tx + ',' + tz; }

  // Asynchronous — must be awaited (or otherwise let run) before this tile's
  // content appears. Not part of WorldStreamer's synchronous per-frame
  // budget loop; see file header.
  async loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return;

    let data;
    try {
      const res = await fetch(`${this.baseUrl}${tx}_${tz}.json`);
      if(!res.ok){ this.tiles.set(key, null); return; }   // no OSM data for this tile — expected, not an error
      data = await res.json();
    } catch(e){
      this.tiles.set(key, null);
      return;
    }

    const ox = tx * this.tileSize, oz = tz * this.tileSize;
    const group = new THREE.Group();
    let treeCount = 0, buildingCount = 0;

    for(const line of data.roads || [])  group.add(this._buildRibbon(line, ox, oz, 10, this.roadMat, 1.4));
    for(const line of data.rails || [])  group.add(this._buildRibbon(line, ox, oz, 3, this.railMat, 1.2));
    for(const line of data.rivers || []) group.add(this._buildRibbon(line, ox, oz, 34, this.riverMat, 1.8));
    for(const poly of data.lakes || [])  group.add(this._buildFlatPolygon(poly, ox, oz, this.lakeMat, 0.9));
    for(const poly of data.farmland || []) group.add(this._buildFlatPolygon(poly, ox, oz, this.farmMat, 0.3));
    for(const poly of data.airfields || []) group.add(this._buildFlatPolygon(poly, ox, oz, this.roadMat, 0.3));

    for(const poly of data.forests || []){
      treeCount += this._scatterForest(group, poly, ox, oz);
    }
    for(const b of data.buildings || []){
      this._buildBuilding(group, b, ox, oz);
      buildingCount++;
    }

    this.scene.add(group);
    this.tiles.set(key, { group, treeCount, buildingCount });
  }

  unloadTile(tx, tz){
    const key = this._key(tx, tz);
    const t = this.tiles.get(key);
    if(t){
      this.scene.remove(t.group);
      t.group.traverse(o => { if(o.geometry && o.geometry !== this.boxGeo && o.geometry !== this.trunkGeo && o.geometry !== this.canopyGeo) o.geometry.dispose(); if(o.isInstancedMesh) o.dispose(); });
    }
    this.tiles.delete(key);
  }

  // Ground-following ribbon from an explicit polyline (local tile metres) —
  // same self-correcting +Y winding technique as WaterRoadManager.js's own
  // ribbon builder (see that file's header for why: a hand-derived winding
  // guess is exactly the kind of thing thunderbolt-europe.html's CLAUDE.md
  // history (4.26) documents going wrong and staying invisible for a whole
  // build).
  _buildRibbon(localPts, ox, oz, width, mat, yOffset){
    if(localPts.length < 2) return new THREE.Group();
    const world = localPts.map(([lx,lz]) => [ox+lx, oz+lz]);
    const positions = [];
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
    const indices = [];
    for(let i = 1; i < world.length; i++){
      const l0=(i-1)*2, r0=l0+1, l1=i*2, r1=l1+1;
      addUpwardTriOSM(indices, positions, l0, r0, l1);
      addUpwardTriOSM(indices, positions, r0, r1, l1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, mat);
  }

  // Flat-ish ground patch for a closed polygon ring (lake/farmland/airfield),
  // fan-triangulated from the centroid — own triangulation instead of
  // THREE.Shape/ShapeGeometry so the winding is under the same self-checking
  // control as everything else in this module set, not a black-box
  // triangulator's own convention.
  _buildFlatPolygon(localRing, ox, oz, mat, yOffset){
    const world = localRing.map(([lx,lz]) => [ox+lx, oz+lz]);
    let cx = 0, cz = 0;
    for(const [x,z] of world){ cx += x; cz += z; }
    cx /= world.length; cz /= world.length;
    const cy = this.terrain.getRenderedHeight(cx, cz) + yOffset;

    const positions = [cx, cy, cz];
    for(const [x,z] of world) positions.push(x, this.terrain.getRenderedHeight(x,z) + yOffset, z);
    const indices = [];
    for(let i = 1; i < world.length; i++) addUpwardTriOSM(indices, positions, 0, i, i+1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, mat);
  }

  // Scatters trees inside a forest polygon (point-in-polygon via ray
  // casting), same InstancedMesh-per-part technique as VegetationManager.js.
  _scatterForest(group, localRing, ox, oz){
    const world = localRing.map(([lx,lz]) => [ox+lx, oz+lz]);
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const [x,z] of world){ minX=Math.min(minX,x); maxX=Math.max(maxX,x); minZ=Math.min(minZ,z); maxZ=Math.max(maxZ,z); }
    const step = 20;
    const placements = [];
    for(let x = minX; x <= maxX; x += step){
      for(let z = minZ; z <= maxZ; z += step){
        if(!pointInPolygon(x, z, world)) continue;
        const jx = (osmHash(x,z,1)-0.5)*step, jz = (osmHash(x,z,2)-0.5)*step;
        placements.push({ x: x+jx, z: z+jz, scale: 0.8+osmHash(x,z,3)*0.5, rot: osmHash(x,z,4)*Math.PI*2 });
      }
    }
    if(placements.length === 0) return 0;

    const trunk = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, placements.length);
    const canopy = new THREE.InstancedMesh(this.canopyGeo, this.canopyMat, placements.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for(let i = 0; i < placements.length; i++){
      const p = placements[i];
      const y = this.terrain.getRenderedHeight(p.x, p.z);
      q.setFromAxisAngle(OSM_UP, p.rot);
      m.compose(new THREE.Vector3(p.x, y+2*p.scale, p.z), q, new THREE.Vector3(p.scale,p.scale,p.scale));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, y+4.5*p.scale, p.z), q, new THREE.Vector3(p.scale,p.scale,p.scale));
      canopy.setMatrixAt(i, m);
    }
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    group.add(trunk); group.add(canopy);
    return placements.length;
  }

  // Simple box building — footprint centre/size/rotation straight from the
  // data (a real converter would take this from the OSM way's own footprint
  // polygon + building:levels tag; the hand-made sample already supplies it
  // directly). Per the spec, this level of detail (a coloured box with a
  // roof cap) is deliberately as far as a non-nearby building goes — a
  // BuildingManager doing real per-building detail near the aircraft is a
  // later step (in the user's own 8-step plan, Steps 5/6 here only cover
  // this simplified form).
  _buildBuilding(group, b, ox, oz){
    const x = ox + b.x, z = oz + b.z;
    const y = this.terrain.getRenderedHeight(x, z);
    const h = 6 + (b.w*b.d > 400 ? 4 : 0);
    const wall = new THREE.Mesh(this.boxGeo, this.buildingMat);
    wall.scale.set(b.w, h, b.d);
    wall.position.set(x, y+h/2, z);
    wall.rotation.y = b.rotY;
    group.add(wall);
    const roof = new THREE.Mesh(this.boxGeo, this.roofMat);
    roof.scale.set(b.w*1.05, 1.2, b.d*1.05);
    roof.position.set(x, y+h+0.6, z);
    roof.rotation.y = b.rotY;
    group.add(roof);
  }
}

const OSM_UP = new THREE.Vector3(0,1,0);

function osmHash(x, z, salt){
  const s = Math.sin(x*0.0913 + z*0.1277 + salt*7.13) * 43758.5453;
  return s - Math.floor(s);
}

// Standard ray-casting point-in-polygon test.
function pointInPolygon(px, pz, ring){
  let inside = false;
  for(let i = 0, j = ring.length-1; i < ring.length; j = i++){
    const [xi,zi] = ring[i], [xj,zj] = ring[j];
    const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj-xi)*(pz-zi)/(zj-zi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

// Same self-correcting +Y winding check as WaterRoadManager.js's addUpwardTri
// (kept as its own copy here — self-contained per this module set's own
// convention, see HeightProvider.js's file header).
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
