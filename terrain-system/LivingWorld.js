// ============================================================
// LivingWorld — lightweight motion and rural detail for Remagen.
//
// Routes come from the already-loaded OSM road/rail network. The Rhine route
// is traced inside the rendered water mask from the historical bridge centre.
// Placements are deterministic, period-inspired scenery rather than claims
// about the exact vehicles or units present at a coordinate in March 1945.
// ============================================================

class LivingWorld {
  static get BUILD(){ return 19; }

  constructor(scene,terrain,osm,landmarks={}){
    this.scene=scene;this.terrain=terrain;this.osm=osm;this.landmarks=landmarks;
    this.group=new THREE.Group();this.group.name='livingWorld';scene.add(this.group);
    this.details=new THREE.Group();this.details.name='livingWorldRuralDetails';this.group.add(this.details);
    this.entities=[];this.routes={road:[],rail:[],water:[]};this.smokeSources=[];
    this._smokeClock=0;this._mission='';
    this._makeMaterials();
    this._buildRoutes();
    this._buildTraffic();
    this._buildRuralDetails();
    this._buildAtmosphere();
  }

  _makeMaterials(){
    const lambert=color=>new THREE.MeshLambertMaterial({color});
    this.mat={
      olive:lambert(0x4b5138),canvas:lambert(0x77725a),dark:lambert(0x292b27),
      tyre:lambert(0x171817),steel:lambert(0x4a4b47),rust:lambert(0x63483b),
      wood:lambert(0x654a31),hay:lambert(0xa08a51),hedge:lambert(0x36552d),
      leaf:lambert(0x557044),trunk:lambert(0x51402d),cow:lambert(0x6c5d4a),
      cream:lambert(0xb6ab91),riverHull:lambert(0x414b49),deck:lambert(0x79684b)
    };
  }

  _lineLength(points){let n=0;for(let i=1;i<points.length;i++)n+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return n;}
  _route(points,kind){
    const clean=[];
    for(const p of points)if(!clean.length||Math.hypot(p[0]-clean.at(-1)[0],p[1]-clean.at(-1)[1])>.5)clean.push(p);
    const cumulative=[0];for(let i=1;i<clean.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(clean[i][0]-clean[i-1][0],clean[i][1]-clean[i-1][1]));
    let sx=0,sz=0;for(const p of clean){sx+=p[0];sz+=p[1];}
    return {kind,points:clean,cumulative,length:cumulative.at(-1)||0,mid:[sx/clean.length,sz/clean.length]};
  }
  _collectLines(key,minLength){
    const out=[];
    for(const [tileKey,data] of this.osm.sourceTiles){
      const [tx,tz]=tileKey.split(',').map(Number),ox=tx*this.osm.tileSize,oz=tz*this.osm.tileSize;
      for(const line of data[key]||[]){
        const r=this._route(line.map(([x,z])=>[ox+x,oz+z]),key==='roads'?'road':'rail');
        if(r.points.length>2&&r.length>=minLength)out.push(r);
      }
    }
    return out;
  }
  _pickRoutes(candidates,anchors,count){
    const chosen=[];
    for(const anchor of anchors){
      let best=null,bestScore=Infinity;
      for(const r of candidates){
        if(chosen.some(q=>Math.hypot(q.mid[0]-r.mid[0],q.mid[1]-r.mid[1])<850))continue;
        const distance=Math.hypot(r.mid[0]-anchor[0],r.mid[1]-anchor[1]);
        const score=distance-Math.min(r.length,3000)*.12;
        if(score<bestScore){best=r;bestScore=score;}
      }
      if(best)chosen.push(best);
      if(chosen.length>=count)break;
    }
    if(chosen.length<count)for(const r of candidates.sort((a,b)=>b.length-a.length)){
      if(chosen.some(q=>Math.hypot(q.mid[0]-r.mid[0],q.mid[1]-r.mid[1])<850))continue;
      chosen.push(r);if(chosen.length>=count)break;
    }
    return chosen;
  }

  _buildRoutes(){
    const roadCandidates=this._collectLines('roads',850);
    const railCandidates=this._collectLines('rails',800);
    const bridge=this.landmarks.bridge||[13805,15770];
    const factory=this.landmarks.factory||[13201,20490];
    const field=this.landmarks.field||[787,18088];
    this.routes.road=this._pickRoutes(roadCandidates,[factory,bridge,field,[20500,10500]],[0,1,2,3].length);
    this.routes.rail=this._pickRoutes(railCandidates,[bridge,factory],2);
    const water=this._traceRhineRoute(bridge,this.landmarks.bridgeSpan||[-101.5,-356.1]);
    if(water.length>500)this.routes.water=[water];
  }

  _pointOnWater(x,z){
    const index=this.osm.waterIndex;if(!index)return false;
    const bucket=index.cells.get(Math.floor(x/index.cellSize)+','+Math.floor(z/index.cellSize));
    if(!bucket)return false;
    for(const f of bucket)if(pointInPolygon(x,z,f.ring))return true;
    return false;
  }
  _waterClear(x,z,r=7){
    return [[0,0],[-r,0],[r,0],[0,-r],[0,r]].every(([dx,dz])=>this._pointOnWater(x+dx,z+dz));
  }
  _traceRhineRoute(anchor,span){
    const sl=Math.hypot(span[0],span[1])||1;
    const river=[-span[1]/sl,span[0]/sl],step=70;
    const trace=sign=>{
      const points=[[anchor[0],anchor[1]]];let dir=[river[0]*sign,river[1]*sign],cur=points[0];
      for(let n=0;n<34;n++){
        let next=null,nextDir=null;
        for(const angle of [0,-.12,.12,-.25,.25,-.42,.42,-.62,.62]){
          const c=Math.cos(angle),s=Math.sin(angle),vx=dir[0]*c+dir[1]*s,vz=-dir[0]*s+dir[1]*c;
          const q=[cur[0]+vx*step,cur[1]+vz*step];
          if(this._waterClear(q[0],q[1])){next=q;nextDir=[vx,vz];break;}
        }
        if(!next)break;
        points.push(next);cur=next;dir=nextDir;
      }
      return points;
    };
    const back=trace(-1).reverse(),forward=trace(1);
    return this._route(back.slice(0,-1).concat(forward),'water');
  }

  _box(group,w,h,d,mat,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);return m;}
  _cyl(group,r,h,mat,x=0,y=0,z=0,segments=8){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat);m.position.set(x,y,z);group.add(m);return m;}
  _rememberMaterials(group){group.traverse(o=>{if(o.isMesh)o.userData.baseMaterial=o.material;});}

  _makeTruck(){
    const g=new THREE.Group();
    this._box(g,5.4,.45,2.15,this.mat.dark,0,.65,0);
    this._box(g,1.75,1.75,2.05,this.mat.olive,0,1.55,1.35);
    this._box(g,3.1,1.45,1.95,this.mat.canvas,0,1.48,-1.05);
    for(const z of [-1.55,1.45]){const axle=this._cyl(g,.46,2.35,this.mat.tyre,0,.48,z,10);axle.rotation.z=Math.PI/2;}
    this._rememberMaterials(g);return g;
  }
  _makeWagon(){
    const g=new THREE.Group();this._box(g,3.8,.5,1.7,this.mat.wood,0,1,0);
    this._box(g,3.5,1.0,1.55,this.mat.hay,0,1.75,0);
    for(const z of [-1.15,1.15]){const axle=this._cyl(g,.62,1.95,this.mat.dark,0,.65,z,10);axle.rotation.z=Math.PI/2;}
    this._rememberMaterials(g);return g;
  }
  _makeCivilCar(){
    const g=new THREE.Group();this._box(g,4.3,.55,1.65,this.mat.dark,0,.65,0);
    this._box(g,2.2,1.05,1.5,this.mat.cream,0,1.35,-.15);
    for(const z of [-1.25,1.25]){const axle=this._cyl(g,.4,1.86,this.mat.tyre,0,.43,z,10);axle.rotation.z=Math.PI/2;}
    this._rememberMaterials(g);return g;
  }
  _makeTrain(){
    const g=new THREE.Group();
    const boiler=this._cyl(g,1.25,6.2,this.mat.dark,0,2.05,4.2,12);boiler.rotation.x=Math.PI/2;
    this._box(g,3.0,3.4,3.2,this.mat.steel,0,2.1,.2);
    this._cyl(g,.72,2.0,this.mat.dark,0,4.3,5.3,10);
    for(let i=0;i<4;i++)this._box(g,3.0,2.5,8.5,i%2?this.mat.rust:this.mat.wood,0,1.65,-6.3-i*9.2);
    for(const z of [5,2,-6,-10,-15,-19,-24,-28,-33]){const axle=this._cyl(g,.72,3.3,this.mat.tyre,0,.75,z,10);axle.rotation.z=Math.PI/2;}
    this._rememberMaterials(g);return g;
  }
  _makeFerry(){
    const g=new THREE.Group();this._box(g,8.5,1.6,24,this.mat.riverHull,0,.8,0);
    this._box(g,8.0,.45,21,this.mat.deck,0,1.75,0);
    this._box(g,5.2,3.3,5.5,this.mat.cream,0,3.45,-3.5);
    this._cyl(g,.45,4.2,this.mat.dark,1.5,5.2,-3.8,8);
    this._rememberMaterials(g);return g;
  }

  _addEntity(kind,visual,route,speed,phase,meta={}){
    const model=new THREE.Group();model.name='living-'+kind;visual.name='living-'+kind+'-fallback';model.add(visual);this.group.add(model);
    const radius=kind==='train'?4800:((kind==='civil'||kind==='wagon')?5200:3600);
    const e={kind,model,visual,route,speed,phase,initialPhase:phase,alive:true,meta,last:{x:0,z:0},visibleRadius:radius};
    e.last=this._sample(route,phase);model.position.set(e.last.x,this._groundEntity(e,e.last),e.last.z);model.rotation.y=e.last.yaw;
    model.userData.livingEntity=e;this.entities.push(e);return e;
  }
  _buildTraffic(){
    for(let r=0;r<Math.min(3,this.routes.road.length);r++)for(let i=0;i<4;i++)
      this._addEntity('truck',this._makeTruck(),this.routes.road[r],8.2+r*.7,140+i*31+r*173,{convoy:r});
    if(this.routes.rail[0])this._addEntity('train',this._makeTrain(),this.routes.rail[0],17,260,{train:0});
    if(this.routes.water[0])for(let i=0;i<2;i++)this._addEntity('ferry',this._makeFerry(),this.routes.water[0],5.2,220+i*this.routes.water[0].length*.48,{ferry:i});
    const nearField=this.routes.road[2]||this.routes.road[0];
    const ambientRoutes=[nearField,nearField,nearField,this.routes.road[0],this.routes.road[1],nearField,
      this.routes.road[3],this.routes.road[0],nearField,this.routes.road[1],nearField,this.routes.road[3]].filter(Boolean);
    for(let i=0;i<ambientRoutes.length;i++){
      const route=ambientRoutes[i];
      const model=i%3===0?this._makeCivilCar():this._makeWagon();
      model.scale.setScalar(1.22);
      this._addEntity(i%3===0?'civil':'wagon',model,route,i%3===0?6.5:3.1,430+i*211,{ambient:true});
    }
  }

  // Replace temporary low-poly silhouettes without replacing the stable entity
  // wrapper referenced by mission targets, the HUD and the minimap. Repository
  // GLBs share geometry/material resources across all clones.
  installVehicleModels(templates){
    let replaced=0;
    for(const e of this.entities){
      const source=e.kind==='truck'?'tiger':(e.kind==='ferry'?'merchant':null);
      const template=source&&templates&&templates.get(source);
      if(!template||e.visual.userData.sourceModel===source)continue;
      const visual=template.clone(true);visual.userData.sourceModel=source;
      if(source==='merchant')visual.scale.y=.55;
      this._rememberMaterials(visual);
      e.model.remove(e.visual);e.visual=visual;e.model.add(visual);replaced++;
    }
    return replaced;
  }

  _sample(route,distance){
    const L=route.length;if(!L)return {x:0,z:0,yaw:0};
    let d=((distance%(2*L))+2*L)%(2*L),reverse=d>L;if(reverse)d=2*L-d;
    let lo=0,hi=route.cumulative.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(route.cumulative[mid]<=d)lo=mid;else hi=mid;}
    const a=route.points[lo],b=route.points[Math.min(lo+1,route.points.length-1)];
    const seg=Math.max(.001,route.cumulative[Math.min(lo+1,route.cumulative.length-1)]-route.cumulative[lo]);
    const t=Math.max(0,Math.min(1,(d-route.cumulative[lo])/seg));
    const dx=b[0]-a[0],dz=b[1]-a[1];
    return {x:a[0]+dx*t,z:a[1]+dz*t,yaw:Math.atan2(reverse?-dx:dx,reverse?-dz:dz)};
  }
  _groundEntity(e,p){
    const water=e.kind==='ferry';
    return this.terrain.getRenderedHeight(p.x,p.z)+(water?1.15:.18);
  }
  update(dt,focusX,focusZ,emitSmoke=null){
    for(const e of this.entities){
      if(e.alive)e.phase+=dt*e.speed;
      if(e.alive||!Number.isFinite(e.last.x))e.last=this._sample(e.route,e.phase);
      const p=e.last,near=Math.hypot(p.x-focusX,p.z-focusZ)<e.visibleRadius;
      e.model.visible=near;
      if(near&&e.alive){e.model.position.set(p.x,this._groundEntity(e,p),p.z);e.model.rotation.y=p.yaw;}
    }
    this._smokeClock-=dt;
    if(emitSmoke&&this._smokeClock<=0){
      this._smokeClock=.42;
      for(const s of this.smokeSources){
        if(Math.hypot(s.x-focusX,s.z-focusZ)>2600)continue;
        s.tick=(s.tick+1)%s.every;if(s.tick)continue;
        emitSmoke({x:s.x+(osmHash(s.x,s.tick,211)-.5)*5,y:s.y,z:s.z,color:s.color,scale:s.scale});
      }
    }
  }

  resetForMission(id){
    this._mission=id;
    for(const e of this.entities){
      e.alive=true;e.phase=e.initialPhase;e.last=this._sample(e.route,e.phase);e.model.rotation.z=0;
      e.model.position.set(e.last.x,this._groundEntity(e,e.last),e.last.z);e.model.rotation.y=e.last.yaw;
      e.model.traverse(o=>{if(o.isMesh&&o.userData.baseMaterial)o.material=o.userData.baseMaterial;});
    }
  }
  missionTargets(id){
    if(id==='convoy')return this.entities.filter(e=>e.kind==='truck'&&e.meta.convoy===0);
    if(id==='train')return this.entities.filter(e=>e.kind==='train').slice(0,1);
    if(id==='ferry')return this.entities.filter(e=>e.kind==='ferry').slice(0,1);
    return [];
  }
  destroyEntity(e){
    if(!e||!e.alive)return;e.alive=false;
    e.model.traverse(o=>{if(o.isMesh){
      const darken=m=>{const copy=m.clone();copy.color.multiplyScalar(.28);return copy;};
      o.material=Array.isArray(o.material)?o.material.map(darken):darken(o.material);
    }});
    e.model.rotation.z=e.kind==='ferry'?.12:(e.kind==='train'?-.08:.18);
    e.model.position.y-=e.kind==='ferry'?.55:.35;
  }

  _buildingClear(data,ox,oz,x,z,r){
    for(const b of data.buildings||[]){
      const dx=x-(ox+b.x),dz=z-(oz+b.z),c=Math.cos(b.rotY),s=Math.sin(b.rotY);
      if(Math.abs(dx*c-dz*s)<b.w/2+r&&Math.abs(dx*s+dz*c)<b.d/2+r)return false;
    }
    return true;
  }
  _fieldPlacements(limit){
    const out=[];
    for(const [key,data] of this.osm.sourceTiles){
      const [tx,tz]=key.split(',').map(Number),ox=tx*this.osm.tileSize,oz=tz*this.osm.tileSize;
      for(const local of data.farmland||[]){
        if(out.length>=limit)break;
        const ring=cleanPolygonRing(local.map(([x,z])=>[ox+x,oz+z]));if(ring.length<3)continue;
        const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
        if((maxX-minX)*(maxZ-minZ)<900)continue;
        for(let a=0;a<5;a++){
          const x=minX+(maxX-minX)*(.16+.68*osmHash(minX+a,maxZ,201));
          const z=minZ+(maxZ-minZ)*(.16+.68*osmHash(maxX,minZ+a,202));
          if(!pointInPolygon(x,z,ring)||this._pointOnWater(x,z)||!this._buildingClear(data,ox,oz,x,z,12))continue;
          out.push({x,z,y:this.terrain.getRenderedHeight(x,z),rot:osmHash(x,z,203)*Math.PI*2,scale:.75+osmHash(x,z,204)*.55});break;
        }
      }
      if(out.length>=limit)break;
    }
    return out;
  }
  _hedgePlacements(limit){
    const out=[];
    for(const [key,data] of this.osm.sourceTiles){
      const [tx,tz]=key.split(',').map(Number),ox=tx*this.osm.tileSize,oz=tz*this.osm.tileSize;
      for(const ring of data.farmland||[])for(let i=1;i<ring.length;i++){
        if(out.length>=limit)return out;
        const a=ring[i-1],b=ring[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<55||osmHash(ox+a[0],oz+a[1],205)>.22)continue;
        const steps=Math.min(4,Math.floor(len/42));
        for(let j=1;j<=steps&&out.length<limit;j++){
          const t=j/(steps+1),x=ox+a[0]+(b[0]-a[0])*t,z=oz+a[1]+(b[1]-a[1])*t;
          if(this._pointOnWater(x,z)||!this._buildingClear(data,ox,oz,x,z,7))continue;
          out.push({x,z,y:this.terrain.getRenderedHeight(x,z),rot:Math.atan2(b[0]-a[0],b[1]-a[1]),scale:.75+osmHash(x,z,206)*.55});
        }
      }
    }
    return out;
  }
  _polePlacements(limit){
    const out=[],seen=new Set();
    const preferred=this.routes.road.concat(this._collectLines('roads',1100).sort((a,b)=>b.length-a.length));
    for(const route of preferred){
      const routeKey=Math.round(route.mid[0]/50)+','+Math.round(route.mid[1]/50);if(seen.has(routeKey))continue;seen.add(routeKey);
      if(out.length>=limit)break;
      for(let d=70;d<route.length-60&&out.length<limit;d+=105){
        const p=this._sample(route,d),side=(Math.floor(d/105)%2?1:-1),x=p.x+Math.cos(p.yaw)*9*side,z=p.z-Math.sin(p.yaw)*9*side;
        if(this._pointOnWater(x,z))continue;
        out.push({x,z,y:this.terrain.getRenderedHeight(x,z),rot:p.yaw,scale:1+osmHash(x,z,207)*.16});
      }
    }
    return out;
  }
  _instances(name,geometry,material,items,transform){
    if(!items.length)return null;
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);mesh.name=name;
    // Instances span the whole 28x32km region. The mesh object's own transform
    // remains at the origin, so a unit-geometry frustum test would incorrectly
    // hide every distant instance at once. Eight bounded draw calls are cheaper
    // and correct; moving entity groups retain normal per-object culling.
    mesh.frustumCulled=false;
    const m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3();
    items.forEach((item,i)=>{transform(item,p,q,s);m.compose(p,q,s);mesh.setMatrixAt(i,m);});
    mesh.instanceMatrix.needsUpdate=true;this.details.add(mesh);return mesh;
  }
  _buildRuralDetails(){
    const fields=this._fieldPlacements(230),hedges=this._hedgePlacements(420),poles=this._polePlacements(180);
    const orchards=fields.filter((_,i)=>i%3===0),hay=fields.filter((_,i)=>i%5===1),cows=fields.filter((_,i)=>i%7===2).slice(0,36);
    const up=new THREE.Vector3(0,1,0),basic=(y,scaleY=1)=>(o,p,q,s)=>{p.set(o.x,o.y+y*o.scale,o.z);q.setFromAxisAngle(up,o.rot);s.set(o.scale,o.scale*scaleY,o.scale);};
    this._instances('ruralHedges',new THREE.DodecahedronGeometry(2.4,0),this.mat.hedge,hedges,basic(1.35,.72));
    this._instances('orchardTrunks',new THREE.CylinderGeometry(.26,.36,4.2,6),this.mat.trunk,orchards,basic(2.1,1));
    this._instances('orchardCrowns',new THREE.DodecahedronGeometry(2.3,0),this.mat.leaf,orchards,basic(5.0,.82));
    this._instances('haystacks',new THREE.ConeGeometry(1.7,3.2,8),this.mat.hay,hay,basic(1.6,1));
    this._instances('telegraphPoles',new THREE.CylinderGeometry(.25,.34,11.5,7),this.mat.wood,poles,basic(5.75,1));
    this._instances('telegraphCrossbars',new THREE.BoxGeometry(6.4,.34,.34),this.mat.dark,poles,(o,p,q,s)=>{p.set(o.x,o.y+10.7*o.scale,o.z);q.setFromAxisAngle(up,o.rot);s.set(o.scale,o.scale,o.scale);});
    this._instances('cattleBodies',new THREE.DodecahedronGeometry(1,0),this.mat.cow,cows,(o,p,q,s)=>{p.set(o.x,o.y+1.25,o.z);q.setFromAxisAngle(up,o.rot);s.set(1.5*o.scale,.75*o.scale,.68*o.scale);});
    this._instances('cattleHeads',new THREE.BoxGeometry(1,1,1),this.mat.dark,cows,(o,p,q,s)=>{p.set(o.x+Math.sin(o.rot)*1.35,o.y+1.35,o.z+Math.cos(o.rot)*1.35);q.setFromAxisAngle(up,o.rot);s.set(.62*o.scale,.58*o.scale,.62*o.scale);});
    this.detailCounts={fields:fields.length,hedges:hedges.length,poles:poles.length,orchards:orchards.length,hay:hay.length,cows:cows.length,buckets:this.details.children.length};
  }
  _buildAtmosphere(){
    const factory=this.landmarks.factory||[13201,20490];
    const rail=this.routes.rail[0]&&this._sample(this.routes.rail[0],this.routes.rail[0].length*.62);
    this.smokeSources.push({x:factory[0],z:factory[1],y:this.terrain.getRenderedHeight(factory[0],factory[1])+30,color:0x55514a,scale:.42,every:3,tick:0});
    if(rail)this.smokeSources.push({x:rail.x,z:rail.z,y:this.terrain.getRenderedHeight(rail.x,rail.z)+2,color:0x423f39,scale:.34,every:5,tick:1});
  }
}
