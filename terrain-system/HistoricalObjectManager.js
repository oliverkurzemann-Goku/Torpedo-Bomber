// ============================================================
//  HistoricalObjectManager — the WW2/mission layer, deliberately SEPARATE
//  from the real-world OSM layer (OSMManager.js): a bridge's or airfield's
//  wartime role (mission target, defended position) is not something
//  OpenStreetMap knows about, so it lives in its own file
//  (tools/convert_historical_tile.js — see that file's header for the exact
//  format) and its own manager, addable on top of whatever base terrain is
//  running (procedural OR real DEM/OSM — it only ever calls
//  terrainManager.getRenderedHeight(), the same terrain-following contract
//  every other content manager in this module set uses) or left off
//  entirely with zero effect on anything else. That independence is a
//  property of the SAME loadTile(tx,tz)/unloadTile(tx,tz) contract every
//  content manager here already has — proven, not just claimed, by
//  terrain_step8_independence.js: two otherwise-identical WorldStreamers,
//  one with this manager in contentManagers and one without, converge to
//  the exact same terrain tile count either way.
//
//  Deliberately visual/placement only — no mission logic (HP, destruction,
//  objective triggers) lives here. That belongs to whichever game eventually
//  wires this terrain system in (a much larger integration this prototype
//  does not attempt — see demo.html/demo-dem-osm.html's own "not wired into
//  the flight sim" notes); this class only proves WHERE historical objects
//  go and that they render correctly layered on top of the rest.
// ============================================================

class HistoricalObjectManager {
  constructor(scene, tileSize, terrainManager, baseUrl = 'data/historical/'){
    this.scene = scene;
    this.tileSize = tileSize;
    this.terrain = terrainManager;
    this.baseUrl = baseUrl;
    this.tiles = new Map();   // "tx,tz" -> THREE.Group | null

    this.runwayMat = new THREE.MeshStandardMaterial({ color: 0x555148, roughness: 1 });
    this.hangarMat = new THREE.MeshStandardMaterial({ color: 0x707868, roughness: 0.9 });
    this.flakBaseMat = new THREE.MeshStandardMaterial({ color: 0x5a5f4e, roughness: 0.9 });
    this.flakBarrelMat = new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 0.6, metalness: 0.3 });
    this.factoryMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 });
    this.chimneyMat = new THREE.MeshStandardMaterial({ color: 0x6b6255, roughness: 0.9 });
    this.bridgeMat = new THREE.MeshStandardMaterial({ color: 0x69625a, roughness: 0.8, metalness: 0.15 });
    this.pierMat = new THREE.MeshStandardMaterial({ color: 0x4f4a44, roughness: 0.9 });
    this.dockMat = new THREE.MeshStandardMaterial({ color: 0x5d5750, roughness: 0.9 });

    this.boxGeo = new THREE.BoxGeometry(1,1,1);
    this.cylGeo = new THREE.CylinderGeometry(1,1,1,10);
  }

  _key(tx, tz){ return tx + ',' + tz; }

  async loadTile(tx, tz){
    const key = this._key(tx, tz);
    if(this.tiles.has(key)) return;

    let data;
    try {
      const res = await fetch(`${this.baseUrl}${tx}_${tz}.json`);
      if(!res.ok){ this.tiles.set(key, null); return; }   // no historical data here — expected for most tiles
      data = await res.json();
    } catch(e){ this.tiles.set(key, null); return; }

    const ox = tx * this.tileSize, oz = tz * this.tileSize;
    const group = new THREE.Group();

    for(const a of data.airfields || []) this._buildAirfield(group, a, ox, oz);
    for(const f of data.flak || [])      this._buildFlak(group, f, ox, oz);
    for(const f of data.factories || []) this._buildFactory(group, f, ox, oz);
    for(const b of data.bridges || [])   this._buildBridge(group, b, ox, oz);
    for(const p of data.ports || [])     this._buildPort(group, p, ox, oz);

    this.scene.add(group);
    this.tiles.set(key, group);
  }

  unloadTile(tx, tz){
    const key = this._key(tx, tz);
    const g = this.tiles.get(key);
    if(g){
      this.scene.remove(g);
      g.traverse(o => { if(o.geometry && o.geometry !== this.boxGeo && o.geometry !== this.cylGeo) o.geometry.dispose(); });
    }
    this.tiles.delete(key);
  }

  _box(group, mat, x, y, z, w, h, d, rotY = 0){
    const m = new THREE.Mesh(this.boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
    return m;
  }
  _cyl(group, mat, x, y, z, r, h){
    const m = new THREE.Mesh(this.cylGeo, mat);
    m.scale.set(r, h, r);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  _buildAirfield(group, a, ox, oz){
    const x = ox + a.x, z = oz + a.z;
    const y = this.terrain.getRenderedHeight(x, z) + 0.2;
    this._box(group, this.runwayMat, x, y, z, a.length, 0.3, a.width, a.rotY);
    // a couple of hangars off to one side
    const perpX = -Math.sin(a.rotY), perpZ = Math.cos(a.rotY);
    for(let i = 0; i < 2; i++){
      const hx = x + perpX * (a.width/2 + 30) + Math.cos(a.rotY) * (i*60 - 30);
      const hz = z + perpZ * (a.width/2 + 30) + Math.sin(a.rotY) * (i*60 - 30);
      const hy = this.terrain.getRenderedHeight(hx, hz);
      this._box(group, this.hangarMat, hx, hy+4, hz, 24, 8, 20, a.rotY);
    }
  }

  _buildFlak(group, f, ox, oz){
    const x = ox + f.x, z = oz + f.z;
    const y = this.terrain.getRenderedHeight(x, z);
    this._cyl(group, this.flakBaseMat, x, y+0.6, z, 3, 1.2);
    const barrel = this._cyl(group, this.flakBarrelMat, x, y+1.6, z, 0.25, 3.2);
    barrel.rotation.z = Math.PI/2 * 0.55;
  }

  _buildFactory(group, f, ox, oz){
    const x = ox + f.x, z = oz + f.z;
    const y = this.terrain.getRenderedHeight(x, z);
    this._box(group, this.factoryMat, x, y+7, z, 40, 14, 26, f.rotY);
    this._box(group, this.factoryMat, x + 26*Math.cos(f.rotY), y+5, z + 26*Math.sin(f.rotY), 18, 10, 16, f.rotY);
    this._cyl(group, this.chimneyMat, x - 14*Math.cos(f.rotY), y+18, z - 14*Math.sin(f.rotY), 1.6, 36);
  }

  // Ground-following deck between two points, plus simple pier supports —
  // same self-correcting +Y winding technique as WaterRoadManager.js/
  // OSMManager.js's own ribbon builders (see WaterRoadManager.js's header
  // for why a hand-derived winding guess is worth avoiding).
  _buildBridge(group, b, ox, oz){
    const x1 = ox+b.x1, z1 = oz+b.z1, x2 = ox+b.x2, z2 = oz+b.z2;
    const dx = x2-x1, dz = z2-z1, len = Math.hypot(dx,dz) || 1;
    const ux = dx/len, uz = dz/len, perpX = -uz*b.width/2, perpZ = ux*b.width/2;
    const y1 = this.terrain.getRenderedHeight(x1,z1), y2 = this.terrain.getRenderedHeight(x2,z2);
    const deckY = Math.max(y1,y2) + 2.0;

    const positions = [
      x1+perpX, deckY, z1+perpZ,  x1-perpX, deckY, z1-perpZ,
      x2+perpX, deckY, z2+perpZ,  x2-perpX, deckY, z2-perpZ,
    ];
    const indices = [];
    addUpwardTriHist(indices, positions, 0, 1, 2);
    addUpwardTriHist(indices, positions, 1, 3, 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, this.bridgeMat));

    for(const t of [0.2, 0.5, 0.8]){
      const px = x1+dx*t, pz = z1+dz*t;
      const py = this.terrain.getRenderedHeight(px,pz);
      this._cyl(group, this.pierMat, px, (py+deckY)/2, pz, 1.2, deckY-py);
    }
  }

  _buildPort(group, p, ox, oz){
    const x = ox + p.x, z = oz + p.z;
    const y = this.terrain.getRenderedHeight(x, z) + 0.5;
    this._box(group, this.dockMat, x, y, z, p.length, 1.0, 12, p.rotY);
  }
}

function addUpwardTriHist(indices, positions, a, b, c){
  const pa=[positions[a*3],positions[a*3+1],positions[a*3+2]];
  const pb=[positions[b*3],positions[b*3+1],positions[b*3+2]];
  const pc=[positions[c*3],positions[c*3+1],positions[c*3+2]];
  const e1=[pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]];
  const e2=[pc[0]-pa[0],pc[1]-pa[1],pc[2]-pa[2]];
  const ny = e1[2]*e2[0]-e1[0]*e2[2];
  if(ny >= 0) indices.push(a,b,c);
  else indices.push(a,c,b);
}
