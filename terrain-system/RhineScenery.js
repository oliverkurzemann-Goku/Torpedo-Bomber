// Additional scenery, loaded independently so Classic uses the original scene.
class RhineScenery {
  static plan(osm,terrain,airfields){
    const finder=Object.create(RhineVillage.prototype);
    Object.assign(finder,{osm,terrain});
    const [west,east]=airfields,bridge=[13805,15770];
    const claimed=new Set(),indices=new Map(),sites=[];
    // Start with routes that players actually fly, then fill inhabited areas.
    const anchors=[
      ['Remagen station',13820,15190,'station',26],['Remagen waterfront',14140,15800,'quay',22],
      ['Ferry approach',12814,16077,'quay',20],['Remagen south',13700,16900,'town',18],
      ['Beaufort west approach',west[0]-1350,west[1],'farm',18],['Beaufort east approach',west[0]+1500,west[1],'farm',18],
      ['Beaufort to Rhine west',8550,15800,'town',18],['Beaufort to Rhine east',10800,15780,'town',18],
      ['Forward Strip west approach',east[0]-1480,east[1],'farm',18],['Forward Strip east approach',east[0]+1480,east[1],'farm',18],
      ['Forward Strip northwest',21100,23700,'town',18],['Rhine north',15800,13200,'quay',18],
      ['Rhine bend',12950,18400,'quay',18],['Factory and railway',13200,20490,'station',22],
      ['Rhine south',12300,22500,'quay',18]
    ];
    for(const [tx,tz] of [...osm.sourceTiles.keys()].map(key=>key.split(',').map(Number))){
      const x=(tx+.5)*osm.tileSize,z=(tz+.5)*osm.tileSize;
      if(anchors.some(([,ax,az])=>Math.hypot(ax-x,az-z)<1900))continue;
      const data=osm.sourceTiles.get(tx+','+tz);
      if((data.buildings||[]).length<90)continue;
      // Concentrate each batch on an existing settlement, rather than the tile midpoint.
      const cells=new Map(),ox=tx*osm.tileSize,oz=tz*osm.tileSize;
      for(const b of data.buildings){
        const key=Math.floor(b.x/550)+','+Math.floor(b.z/550);
        const c=cells.get(key)||{n:0,x:0,z:0};
        c.n++;c.x+=ox+b.x;c.z+=oz+b.z;cells.set(key,c);
      }
      const c=[...cells.values()].sort((a,b)=>b.n-a.n)[0];
      if(c.n>=15)anchors.push(['Village '+tx+'/'+tz,c.x/c.n,c.z/c.n,'town',12]);
    }
    // Reserve the original garden footprints for Classic and Detailed.
    for(const p of [...finder._plots(bridge,2050,8,airfields),
      ...finder._plots([west[0]+1450,west[1]+650],3200,1,airfields,true)]){
      claimed.add(osmBuildingKey(p.houseX,p.houseZ));
    }
    for(const [name,x,z,kind,limit] of anchors){
      const candidates=finder._plots([x,z],name.startsWith('Village ')?850:kind==='farm'?2100:kind==='station'||kind==='quay'?2200:1450,limit,airfields,false,{claimed,indices,compact:true});
      if(candidates.length<3)continue;
      const clusters=new Map();
      for(const p of candidates){
        claimed.add(osmBuildingKey(p.houseX,p.houseZ));
        const cell=Math.floor(p.x/480)+','+Math.floor(p.z/480);
        if(!clusters.has(cell))clusters.set(cell,[]);
        const [px,pz]=p.point(0,0);
        clusters.get(cell).push([px,pz,p.direction,p.width,p.depth]);
      }
      for(const plots of clusters.values()){
        const cx=plots.reduce((n,p)=>n+p[0],0)/plots.length,cz=plots.reduce((n,p)=>n+p[1],0)/plots.length;
        sites.push({name,kind,x:Math.round(cx),z:Math.round(cz),plots:plots.map(p=>p.map(v=>Math.round(v*1000)/1000))});
      }
    }
    for(const [kind,key,radius,limit] of [['railway-yard','rails',2850,3],['river-bank','rivers',4200,5]]){
      const options=[];
      if(key==='rails'){
        for(const [cell,data] of osm.sourceTiles){
          const [tx,tz]=cell.split(',').map(Number),ox=tx*4000,oz=tz*4000;
          if(Math.hypot(ox+2000-bridge[0],oz+2000-bridge[1])>radius+3000)continue;
          for(const line of data.rails||[])for(let i=1;i<line.length;i++){
            const [u,v]=line[i-1],[a,b]=line[i],dx=a-u,dz=b-v;
            if(Math.hypot(dx,dz)<22)continue;
            const mx=ox+(u+a)/2,mz=oz+(v+b)/2,dist=Math.hypot(mx-bridge[0],mz-bridge[1]);
            if(dist<radius)options.push({dist,mx,mz,angle:Math.atan2(-dz,dx),edge:12});
          }
        }
      }else{
        const traffic=Object.create(LivingWorld.prototype);traffic.osm=osm;
        const river=traffic._traceRhineRoute(bridge,[-101.5,-356.1]);
        for(let i=2;i<river.points.length-2;i+=2){
          const [mx,mz]=river.points[i],[nx,nz]=river.points[i+1],angle=Math.atan2(mz-nz,nx-mx);
          for(let edge=20;edge<=160;edge+=9){
            options.push({mx,mz,angle,edge,dist:Math.hypot(mx-bridge[0],mz-bridge[1])+edge*2});
          }
        }
      }
      const picked=[];
      for(const o of options.sort((a,b)=>a.dist-b.dist)){
        if(picked.length>=limit)break;
        for(const sign of [-1,1]){
          const s=Math.sin(o.angle),c=Math.cos(o.angle),x=o.mx+s*o.edge*sign,z=o.mz+c*o.edge*sign;
          const tx=Math.floor(x/4000),tz=Math.floor(z/4000),ox=tx*4000,oz=tz*4000,cell=tx+','+tz;
          const data=osm.sourceTiles.get(cell);if(!data)continue;
          if(!indices.has(cell))indices.set(cell,osm._buildForestExclusion(data,ox,oz));
          const index=indices.get(cell);
          if(picked.some(p=>Math.hypot(p.x-x,p.z-z)<(key==='rails'?170:450)))continue;
          const yaw=o.angle+(sign<0?Math.PI:0);
          const probes=[];
          for(const u of [-10,0,10])for(const v of [-1,3,8])probes.push([x+u*Math.cos(yaw)+v*Math.sin(yaw),z-u*Math.sin(yaw)+v*Math.cos(yaw)]);
          if(probes.some(([px,pz])=>px<ox+2||px>ox+3998||pz<oz+2||pz>oz+3998||
              osmWaterOverlaps([[px,pz]],2,index.water)||finder._blocked(px,pz,index,-1,-1)||
              (data.forests||[]).some(ring=>pointInPolygon(px-ox,pz-oz,ring))))continue;
          const heights=probes.map(([px,pz])=>terrain.getRenderedHeight(px,pz));
          if(Math.max(...heights)-Math.min(...heights)>3.1)continue;
          const site={name:key==='rails'?'Railway goods yard':'Rhine landing',kind,damaged:key==='rails'&&picked.length===0,x:Math.round(x),z:Math.round(z),
            plots:[[x,z,yaw,19,7].map(v=>Math.round(v*1000)/1000)]};
          picked.push(site);break;
        }
      }
      sites.push(...picked);
    }
    const hillside=[];
    for(const [cell,data] of osm.sourceTiles){
      const [tx,tz]=cell.split(',').map(Number),ox=tx*4000,oz=tz*4000;
      if(Math.hypot(ox+2000-bridge[0],oz+2000-bridge[1])>6500)continue;
      for(const ring of data.farmland||[]){
        if(ring.length<4)continue;
        const x=ox+ring.reduce((n,p)=>n+p[0],0)/ring.length,z=oz+ring.reduce((n,p)=>n+p[1],0)/ring.length;
        if(Math.hypot(x-bridge[0],z-bridge[1])>4900||airfields.some(([ax,az])=>Math.hypot(x-ax,z-az)<900))continue;
        const h=(px,pz)=>terrain.getRenderedHeight(px,pz);
        if(x<32||x>27968||z<32||z>31968)continue;
        const dx=h(x+25,z)-h(x-25,z),dz=h(x,z+25)-h(x,z-25),slope=Math.hypot(dx,dz)/50;
        if(slope<.08||slope>.22)continue;
        if(!indices.has(cell))indices.set(cell,osm._buildForestExclusion(data,ox,oz));
        const index=indices.get(cell);
        const angle=Math.atan2(dx,dz),s=Math.sin(angle),c=Math.cos(angle),w=42,d=45;
        const startX=x-s*d*.5,startZ=z-c*d*.5,probes=[];
        for(const u of [-w/2,0,w/2])for(const v of [0,d/2,d])probes.push([startX+u*c+v*s,startZ-u*s+v*c]);
        if(probes.some(([px,pz])=>!pointInPolygon(px-ox,pz-oz,ring)||
          finder._blocked(px,pz,index,-1,-1)||osmWaterOverlaps([[px,pz]],5,index.water)))continue;
        if(hillside.some(p=>Math.hypot(p.x-x,p.z-z)<380))continue;
        hillside.push({name:'Terraced hillside',kind:'vineyard',x:Math.round(x),z:Math.round(z),
          plots:[[startX,startZ,angle,w,d].map(v=>Math.round(v*1000)/1000)]});
        if(hillside.length>=7)break;
      }
      if(hillside.length>=7)break;
    }
    sites.push(...hillside);
    // Broad strips read from the cockpit before individual buildings do.
    for(const [index,[ax,az]] of airfields.entries()){
      const airfieldName=index?'Forward Strip':'Beaufort';
      for(const end of [-1,1]){
        const strips=[];
        for(const distance of [710,925,1190,1460,1750,2030]){
          if(strips.length>=4)break;
          for(const offset of [-135,135,-205,205,-285,285]){
            if(strips.length>=4)break;
            const x=ax+end*distance,z=az+offset;
            if(strips.some(p=>Math.hypot(x-p.x,z-p.z)<220))continue;
            const tx=Math.floor(x/4000),tz=Math.floor(z/4000),ox=tx*4000,oz=tz*4000,cell=tx+','+tz;
            const data=osm.sourceTiles.get(cell);if(!data)continue;
            if(!indices.has(cell))indices.set(cell,osm._buildForestExclusion(data,ox,oz));
            const exclusion=indices.get(cell),probes=[];
            for(let dx=-37;dx<=37;dx+=18.5)for(let dz=-35;dz<=35;dz+=17.5)probes.push([x+dx,z+dz]);
            if(probes.some(([px,pz])=>px<ox+2||px>ox+3998||pz<oz+2||pz>oz+3998||
               finder._blocked(px,pz,exclusion,-1,-1)||osmWaterOverlaps([[px,pz]],3,exclusion.water)||
               (data.forests||[]).some(ring=>pointInPolygon(px-ox,pz-oz,ring))))continue;
            const heights=probes.map(([px,pz])=>terrain.getRenderedHeight(px,pz));
            if(Math.max(...heights)-Math.min(...heights)>9)continue;
            strips.push({name:airfieldName+' field lanes',kind:'field-lanes',x,z,plots:[[x,z-30,0,68,60]]});
          }
        }
        sites.push(...strips);
      }
    }
    return {version:1,sites};
  }
  constructor(parent,terrain,layout,village,river){
    this.terrain=terrain;this.village=village;this.sites=layout.sites;
    this.group=new THREE.Group();this.group.name='Rhine Detailed Scenery';parent.add(this.group);
    this.material=new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-.5});
    this.atlas=null;
    this.flockSites=this.sites.filter(s=>s.kind==='farm').map(s=>({x:s.x,z:s.z}));
    this.waterSites=[];
    if(river)for(let i=2;i<river.points.length-2;i+=5){
      const [x,z]=river.points[i],[nx,nz]=river.points[i+1];
      this.waterSites.push({x,z,heading:Math.atan2(nx-x,nz-z)});
    }
    this.flocks=village?[village._flock(this.group,{x:0,z:0},false),village._flock(this.group,{x:0,z:0},true)]:[];
    this.enabled=false;this.setEnabled(true);
  }

  setEnabled(enabled){
    this.enabled=enabled;this.group.visible=enabled;this.clock=0;
    this.pending=[];
    if(enabled){
      if(!this.atlas){this.atlas=RhineScenery.atlas();this.material.map=this.atlas;this.material.needsUpdate=true;}
    }else{
      for(const site of this.sites)if(site.mesh){
        this.group.remove(site.mesh);site.mesh.geometry.dispose();site.mesh=null;
      }
      if(this.atlas){this.atlas.dispose();this.atlas=null;this.material.map=null;this.material.needsUpdate=true;}
    }
    for(const flock of this.flocks){flock.mesh.visible=false;flock.used=null;flock.cooldown=0;flock.age=0;}
  }

  _choose(x,z,tier,altitude,ultra){
    this.pending=[];
    const reduced=tier>=2,maxBatches=ultra?18:tier>=3?4:reduced?7:12;
    const maxNear=ultra?5:tier===0?3:tier===1?2:0;
    const range=ultra?5000:tier>=3?1000:reduced?1900:3200;
    const detailRange=ultra?2200:1570;
    const agl=Number.isFinite(altitude)?altitude-this.terrain.getRenderedHeight(x,z):0;
    const nearby=this.sites.map(s=>({s,d:Math.hypot(s.x-x,s.z-z)}))
      .filter(e=>e.d<range).sort((a,b)=>a.d-b.d).slice(0,maxBatches);
    let near=0;
    for(const site of this.sites)if(site.mesh)site.mesh.visible=false;
    for(const {s,d} of nearby){
      const level=agl<250&&d<(s.level===2?790:680)&&near<maxNear?2:
        agl<650&&!reduced&&d<detailRange+(s.level===1?160:0)?1:0;
      if(level===2)near++;
      if(s.mesh)s.mesh.visible=true;
      if(!s.mesh||s.level!==level||s.revision!==this._revision(s)){
        this.pending.push({s,level});
      }
    }
  }

  _revision(site){
    return this.terrain.tiles.get(Math.floor(site.x/4000)+','+Math.floor(site.z/4000))?.surfaceRevision??0;
  }

  update(dt,x,z,altitude,tier,ultra=false){
    if(!this.enabled)return;
    if((this.clock-=dt)<=0||tier!==this.tier||ultra!==this.ultra){
      this.clock=.32;this.tier=tier;this.ultra=ultra;this._choose(x,z,tier,altitude,ultra);
    }
    const next=this.pending.shift();
    if(next){
      const {s,level}=next,old=s.mesh;
      if(old&&s.level===level){
        this._ground(old.geometry);s.revision=this._revision(s);
      }else{
        s.mesh=new THREE.Mesh(this._geometry(s,level),this.material);
        s.mesh.name=s.name;this.group.add(s.mesh);
        if(old){this.group.remove(old);old.geometry.dispose();}
        s.level=level;s.revision=this._revision(s);
      }
    }
    if(this.group.children.length>30){
      const hidden=this.sites.filter(s=>s.mesh&&!s.mesh.visible);
      hidden.sort((a,b)=>Math.hypot(b.x-x,b.z-z)-Math.hypot(a.x-x,a.z-z));
      const far=hidden[0];if(far){this.group.remove(far.mesh);far.mesh.geometry.dispose();far.mesh=null;}
    }
    this._birds(dt,x,z,altitude,tier);
  }

  _birds(dt,x,z,altitude,tier){
    const agl=Number.isFinite(altitude)?altitude-this.terrain.getRenderedHeight(x,z):Infinity;
    for(const flock of this.flocks){
      flock.cooldown=Math.max(0,flock.cooldown-dt);
      if(!(agl<(flock.river?290:155))||tier>=2){flock.mesh.visible=false;continue;}
      if(!flock.mesh.visible&&flock.cooldown===0){
        let nearest=null,distance=flock.river?550:420;
        for(const point of flock.river?this.waterSites:this.flockSites){
          const d=Math.hypot(x-point.x,z-point.z);
          if(point!==flock.used&&d<distance){nearest=point;distance=d;}
        }
        if(!nearest)continue;
        flock.point=flock.used=nearest;flock.age=0;flock.mesh.visible=true;
        flock.heading=nearest.heading??Math.atan2(nearest.x-x,nearest.z-z);
      }
      if(!flock.mesh.visible)continue;
      flock.age+=dt;
      if(flock.age>(flock.river?21:13)||Math.hypot(x-flock.point.x,z-flock.point.z)>850){
        flock.mesh.visible=false;flock.cooldown=6;continue;
      }
      this.village._poseFlock(flock);
    }
  }

  _ground(geometry){
    const p=geometry.attributes.position,base=geometry.userData.base;
    const samples=new Float32Array(base.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=this.terrain.getRenderedHeight(base[i*2],base[i*2+1]);
    const heights=geometry.userData.heights,roots=geometry.userData.roots;
    for(let i=0;i<p.count;i++)p.setY(i,samples[roots[i]]+heights[i]);
    p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }

  _geometry(site,level){
    const p=[],uv=[],colors=[],ids=[],offsets=[],base=[],indices=[],rootKeys=new Map(),color=new THREE.Color();
    const surface={soil:0,crops:1,kies:2,stone:3,plaster:4,wood:5,roof:6,ruin:7};
    let x,z,angle,c,s;
    const world=(u,v)=>[x+u*c+v*s,z-u*s+v*c];
    const root=(u,v)=>{
      const key=u+','+v;
      if(!rootKeys.has(key)){rootKeys.set(key,base.length/2);base.push(...world(u,v));}
      return rootKeys.get(key);
    };
    function material(tile,tint){
      color.setHex(tint).convertSRGBToLinear();
      return [tile%4*.25,Math.floor(tile/4)*.5,color.r,color.g,color.b];
    }
    const face=(points,tile,tint,groundAt=null)=>{
      const begin=p.length/3,[u0,v0,r,g,b]=material(tile,tint);
      for(const [i,[u,h,v]] of points.entries()){
        const [px,pz]=world(u,v);p.push(px,0,pz);
        ids.push(groundAt??root(u,v));offsets.push(h);colors.push(r,g,b);
        const [tu,tv]=[[.018,.023],[.982,.023],[.982,.977],[.018,.977]][i];
        uv.push(u0+tu*.25,v0+tv*.5);
      }
      indices.push(begin,begin+1,begin+2);
      if(points.length===4)indices.push(begin,begin+2,begin+3);
    };
    const flat=(u,v,w,d,tile,tint,h=.22)=>face([[u,h,v+d],[u+w,h,v+d],[u+w,h,v],[u,h,v]],tile,tint);
    const box=(u,v,w,d,h,tile,tint,lower=0,groundAt=null)=>{
      const a=[u,lower,v],b=[u+w,lower,v],c=[u+w,lower,v+d],d0=[u,lower,v+d];
      const A=[u,h,v],B=[u+w,h,v],C=[u+w,h,v+d],D=[u,h,v+d];
      for(const f of [[D,C,B,A],[b,a,A,B],[d0,c,C,D],[a,d0,D,A],[c,b,B,C]])face(f,tile,tint,groundAt);
    };
    const house=(u,v,w,d,h,wallColor,roofColor,style)=>{
      const levelGround=root(u+w/2,v+d/2),r=h+Math.min(2.5,d*.29),middle=v+d/2;
      if(style==='ruin'){
        box(u,v,w,.38,h*.60,surface.ruin,0xcbb4a4,0,levelGround);
        box(u+.2,v+.3,.40,d,h*.82,surface.ruin,0xe0c4b1,0,levelGround);
        box(u+w*.58,v+d-.45,w*.42,.44,h*.43,surface.ruin,0xbb9f90,0,levelGround);
        face([[u,.26,v+d*.2],[u+w*.68,.36,v+d*.86],[u+w*.7,.18,v+d*.25]],surface.ruin,0xa29285,levelGround);
        if(level===2)for(let i=0;i<4;i++)box(u+i*w*.19,v+d*(.28+.1*(i%3)),w*.15,.65,.55-i*.07,surface.ruin,0xb9a48e,0,levelGround);
        return;
      }
      box(u,v,w,d,h,style==='shed'?surface.wood:surface.plaster,wallColor,0,levelGround);
      const left=[u-.19,r,middle],right=[u+w+.19,r,middle];
      face([[u-.19,h,v+d+.23],[u+w+.19,h,v+d+.23],right,left],surface.roof,roofColor,levelGround);
      face([left,right,[u+w+.19,h,v-.23],[u-.19,h,v-.23]],surface.roof,roofColor,levelGround);
      face([[u,h,v],[u,h,v+d],[u,r,middle]],surface.plaster,wallColor,levelGround);
      face([[u+w,h,v+d],[u+w,h,v],[u+w,r,middle]],surface.plaster,wallColor,levelGround);
      if(level<2)return;
      const door=style==='shed'?w*.55:.88;
      face([[u+w*.16,.20,v+d+.013],[u+w*.16+door,.20,v+d+.013],
        [u+w*.16+door,Math.min(2.35,h*.70),v+d+.013],[u+w*.16,Math.min(2.35,h*.70),v+d+.013]],surface.wood,0x8b7761,levelGround);
      if(style!=='shed')for(const step of [.54,.75]){
        face([[u+w*step,h*.41,v+d+.014],[u+w*step+.59,h*.41,v+d+.014],
          [u+w*step+.59,h*.72,v+d+.014],[u+w*step,h*.72,v+d+.014]],surface.wood,0x4a4c43,levelGround);
      }
    };
    const tree=(u,v,tall=false)=>{
      const scale=tall?1.35:1;
      box(u-.15,v-.15,.3,.3,2.2*scale,surface.wood,0xa9957e);
      const ring=[[-1.5,0],[0,1.5],[1.5,0],[0,-1.5]],center=root(u,v);
      for(let i=0;i<4;i++){
        const a=ring[i],b=ring[(i+1)%4],tint=i%2?0x718a5a:0x8ca271;
        face([[u+a[0]*scale,3*scale,v+a[1]*scale],[u+b[0]*scale,3*scale,v+b[1]*scale],[u,5.4*scale,v]],surface.crops,tint,center);
        face([[u+b[0]*scale,3*scale,v+b[1]*scale],[u+a[0]*scale,3*scale,v+a[1]*scale],[u,1.3*scale,v]],surface.crops,tint,center);
      }
    };
    for(const plot of site.plots){
      let width,depth;
      [x,z,angle,width,depth]=plot;c=Math.cos(angle);s=Math.sin(angle);rootKeys.clear();
      const w=width/2,seed=osmHash(x,z,1600);
      if(site.kind==='field-lanes'){
        const strip=5.5,alternate=osmHash(x,z,1681)>.5;
        for(let u=-w;u<w;u+=strip){
          const span=Math.min(strip-1,width-(u+w)),odd=Math.round((u+w)/strip)%2;
          for(let v=0;v<depth;v+=10){
            flat(u,v,span+.8,Math.min(10,depth-v),surface.soil,0xbbab8a,.29);
            if(odd||alternate)flat(u+.45,v+.05,Math.max(.2,span-.25),Math.min(9.9,depth-v-.1),surface.crops,
              odd?0x9bac79:0xb1b687,.48);
          }
        }
        const edge=alternate?-w:w-.85;
        for(let v=0;v<depth;v+=6){
          const length=Math.min(6,depth-v);
          if(level>0)box(edge,v,.85,length,level===2?1.08:.67,surface.crops,0x7f966a);
          else flat(edge,v,.85,length,surface.crops,0x7f966a,.42);
        }
        continue;
      }
      if(site.kind==='vineyard'){
        const strips=level===0?6:10;
        for(let row=0;row<strips;row++){
          const v=(row+.2)*depth/strips;
          for(let u=-w;u<w;u+=7){
            const span=Math.min(7,w-u);
            flat(u,v,span,1.9,surface.soil,0xbaab8c,.28);
            if(level>0)box(u,v+.37,span,.85,level===2?.72:.44,surface.crops,0xa4b58a);
            else flat(u,v+.43,span,.75,surface.crops,0xa0b27e,.34);
          }
        }
        if(level>0)for(let u=-w;u<w;u+=7)box(u,depth-1,Math.min(7,w-u),.37,.83,surface.stone,0xb6aa94);
        continue;
      }
      if(site.kind==='railway-yard'||site.kind==='river-bank'){
        const station=site.kind==='railway-yard';
        flat(-w,0,width,depth,station?surface.kies:surface.wood,0xcbba9d,.26);
        if(level>0){
          house(-8,2,8,4,station?3.1:2.3,0xd8cdb7,station?0x776965:0x9b6952,
            site.damaged?'ruin':'shed');
          box(.6,1.1,7.7,1.65,.56,surface.wood,0xa68b6e);
          box(-w,depth-.4,width,.4,.89,surface.stone,0xb3a594);
        }
        if(level===2){
          for(let j=0;j<5;j++)box(1+j*1.40,4.2,.95,1.10,.63+(j%2)*.25,surface.wood,0xbe9d72);
          if(!station)for(let j=0;j<4;j++)box(-8.3+j*5.3,.25,.28,.28,1.05,surface.wood,0x927550);
        }
        continue;
      }
      const farm=site.kind==='farm',quay=site.kind==='quay',station=site.kind==='station';
      const damaged=(station||quay)&&seed>.69;
      flat(-w,.15,width,depth-.2,damaged?surface.ruin:farm?surface.soil:surface.kies,0xd0be9f);
      if(!damaged&&(!station||seed<.65)){
        const rows=level===0?2:4;
        for(let j=0;j<rows;j++){
          const u=-w+.55+j*(w-.6)/rows;
          flat(u,2.6,(w-.6)/rows*.71,depth-3.45,surface.crops,j%2?0x91a26d:0x738754,.29);
        }
      }
      if(level===0)continue;
      box(-w,1,.42,depth-1.4,farm?1.2:.76,farm?surface.crops:surface.stone,0xc0b8a7);
      box(w-.42,1,.42,depth-1.4,.82,surface.stone,0xaba394);
      box(-w,depth-.47,w-.95,.42,.86,surface.stone,0xb0a898);
      box(.95,depth-.47,w-.95,.42,.86,surface.stone,0xb0a898);
      if(damaged||farm||station&&seed>.43||quay&&seed>.43||seed>.74){
        const shedW=w-.97,shedD=Math.min(4.2,depth-2.4);
        const roofs=[0xa76150,0x666868,0x795546];
        house(.78,2.55,shedW,shedD,station&&level===2?3.1:2.3,0xd9cfb9,roofs[Math.floor(seed*3)],
          damaged?'ruin':farm||quay?'shed':'annex');
      }
      if(level===2){
        if(!station&&!damaged){tree(-w+1.85,depth-2.1,farm);if(farm)tree(-w+1.8,3.1);}
        if(quay||station){
          for(let crate=0;crate<3;crate++)box(-w+.8+crate*.61,1.4+crate*.47,.55,.65,.55,surface.wood,0xba9f7b);
          if(!damaged){
            box(-w+.55,depth-1.9,2.35,1.05,.13,surface.wood,0xaa8c6e,1.85);
            box(-w+.59,depth-1.9,.13,.13,1.85,surface.wood,0xa99373);
            box(-w+2.65,depth-1.9,.13,.13,1.85,surface.wood,0xa99373);
          }
        }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);
    geo.userData={base:new Float32Array(base),heights:new Float32Array(offsets),roots:new Uint16Array(ids)};
    this._ground(geo);return geo;
  }

  static atlas(){
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const ctx=canvas.getContext('2d'),size=256;
    for(const [tile,tint] of ['#8b6b48','#718352','#a49378','#9b9688','#ded2b9','#8b785d','#ac9784','#9c8775'].entries()){
      const x=(tile%4)*size,y=(1-Math.floor(tile/4))*size;
      ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,size,size);ctx.clip();
      ctx.fillStyle=tint;ctx.fillRect(0,0,size,size);
      for(let i=0;i<1500;i++){
        const u=osmHash(i,tile,11)*size,v=osmHash(i,tile,12)*size;
        ctx.fillStyle=i%2?'rgba(26,21,13,.10)':'rgba(252,246,224,.14)';
        ctx.fillRect(u,v,1+osmHash(i,tile,13)*6,1+osmHash(i,tile,14)*4);
      }
      if(tile===1){
        for(let row=0;row<size;row+=15){
          ctx.fillStyle='rgba(32,43,21,.42)';ctx.fillRect(0,row,size,4);
          for(let u=0;u<size;u+=7){
            const light=osmHash(u,row,44);
            ctx.fillStyle=light>.45?'#85985c':'#566844';
            ctx.fillRect(u+(row%2)*3,row+5+(light-1)*4,3+light*3,5);
          }
        }
      }
      if(tile===3||tile===6||tile===7){
        const h=tile===6?17:tile===3?25:19,w=tile===6?22:tile===3?50:35;
        for(let v=0;v<size;v+=h)for(let u=-w;u<size;u+=w){
          const shift=(v/h)%2*w*.5,seed=osmHash(u,v,tile+53);
          ctx.fillStyle=seed>.49?'rgba(255,243,216,.14)':'rgba(45,33,26,.13)';
          ctx.fillRect(u+shift,v,w-2,h-2);
          ctx.fillStyle='rgba(54,45,34,.26)';ctx.fillRect(u+shift,v+h-2,w,2);
        }
      }
      if(tile===4){
        const wash=ctx.createLinearGradient(0,0,0,size);
        wash.addColorStop(0,'rgba(88,77,63,.23)');wash.addColorStop(.35,'rgba(224,203,171,0)');
        wash.addColorStop(1,'rgba(89,71,52,.40)');ctx.fillStyle=wash;ctx.fillRect(0,0,size,size);
        ctx.fillStyle='#9e937b';ctx.fillRect(0,221,size,35);
        for(let u=0;u<size;u+=33){ctx.fillStyle='#c5b89d';ctx.fillRect(u,222,2,33);}
        ctx.fillStyle='rgba(243,230,198,.42)';ctx.fillRect(0,14,size,5);
      }
      if(tile===5){
        for(let u=0;u<size;u+=13){
          ctx.fillStyle='#68563f';ctx.fillRect(u,0,2,size);
          ctx.fillStyle='rgba(215,189,146,.22)';ctx.fillRect(u+3,0,3,size);
        }
      }
      if(tile===7){
        for(let i=0;i<30;i++){
          const u=osmHash(i,tile,70)*size,v=osmHash(i,tile,71)*size;
          ctx.fillStyle='rgba(36,27,22,.26)';ctx.fillRect(u,v,3+osmHash(i,tile,73)*15,8+osmHash(i,tile,74)*32);
        }
      }
      ctx.restore();
    }
    return osmCanvasTexture(canvas);
  }
}
