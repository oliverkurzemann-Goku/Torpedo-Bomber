// Local detail for two sites. Each site's gardens share one terrain-draped mesh.
class RhineVillage {
  constructor(scene,terrain,osm,landmarks,route){
    this.terrain=terrain;this.osm=osm;this.sites=[];this.flocks=[];
    const bridge=landmarks.bridge||[13805,15770],field=landmarks.field||[6000,15800];
    const airfields=landmarks.airfields||[field];
    const village=this._plots(bridge,2050,8,airfields);
    const farm=this._plots([field[0]+1450,field[1]+650],3200,1,airfields,true);
    for(const [name,plots] of [['remagen-village',village],['rural-farm',farm]]){
      if(!plots.length)continue;
      const site=this._makeSite(name,plots);
      scene.add(site.group);this.sites.push(site);
    }
    if(farm.length)this.flocks.push(this._flock(scene,farm[0],false));
    if(route?.length>250){
      let nearest=0;
      const distance=p=>Math.hypot(p[0]-bridge[0],p[1]-bridge[1]);
      route.points.forEach((p,i)=>{if(distance(p)<distance(route.points[nearest]))nearest=i;});
      const i=Math.min(route.points.length-2,nearest+3);
      const [x,z]=route.points[i],[nx,nz]=route.points[i+1];
      this.flocks.push(this._flock(scene,{x,z,heading:Math.atan2(nx-x,nz-z)},true));
    }
    this.reset();
  }

  _plots(anchor,range,limit,airfields,farm=false){
    const candidates=[],size=this.osm.tileSize;
    for(const [key,data] of this.osm.sourceTiles){
      const [tx,tz]=key.split(',').map(Number),ox=tx*size,oz=tz*size;
      if(Math.hypot(ox+size/2-anchor[0],oz+size/2-anchor[1])>range+size)continue;
      for(const b of data.buildings||[]){
        if(b.w<7||b.d<6||b.w>23||b.d>20)continue;
        const x=ox+b.x,z=oz+b.z,dist=Math.hypot(x-anchor[0],z-anchor[1]);
        if(dist>range||airfields.some(([ax,az])=>Math.abs(x-ax)<680&&Math.abs(z-az)<410))continue;
        if(this.osm.churchKeys.has(osmBuildingKey(x,z)))continue;
        candidates.push({x,z,ox,oz,b,data,key,dist});
      }
    }
    candidates.sort((a,b)=>a.dist-b.dist);
    const plots=[],indices=new Map();
    for(const {x,z,ox,oz,b,key,data} of candidates){
      if(plots.some(p=>Math.hypot(x-p.houseX,z-p.houseZ)<18))continue;
      if(!indices.has(key))indices.set(key,this.osm._buildForestExclusion(data,ox,oz));
      const index=indices.get(key);
      for(const direction of [b.rotY,b.rotY+Math.PI]){
        const c=Math.cos(direction),s=Math.sin(direction);
        const depth=farm?15:10,width=farm?15:Math.max(8,Math.min(b.w,12));
        const point=(u,v)=>[x+u*c+(b.d/2+1.4+v)*s,z-u*s+(b.d/2+1.4+v)*c];
        const probes=[];
        for(const u of [-width/2-1,0,width/2+1]){
          for(const v of [-.7,depth/2,depth+1.2])probes.push(point(u,v));
        }
        if(probes.some(([px,pz])=>px<ox+2||px>ox+size-2||pz<oz+2||pz>oz+size-2||
          osmWaterOverlaps([[px,pz]],2,index.water)||
          (data.forests||[]).some(ring=>pointInPolygon(px-ox,pz-oz,ring))||
          this._blocked(px,pz,index,x,z)))continue;
        const heights=probes.map(([px,pz])=>this.terrain.getRenderedHeight(px,pz));
        if(Math.max(...heights)-Math.min(...heights)>(farm?2.8:2.3))continue;
        const [px,pz]=point(0,depth/2);
        if(plots.some(p=>Math.hypot(px-p.x,pz-p.z)<17))continue;
        plots.push({x:px,z:pz,houseX:x,houseZ:z,depth,width,point,farm});
        break;
      }
      if(plots.length>=limit)break;
    }
    return plots;
  }
  _blocked(x,z,index,houseX,houseZ){
    const cell=index.cells.get(Math.floor(x/index.cellSize)+','+Math.floor(z/index.cellSize))||[];
    for(const f of cell){
      if(f.kind==='segment'&&pointSegmentDistanceSq(x,z,f.ax,f.az,f.bx,f.bz)<=f.r2)return true;
      if(f.kind==='polygon'&&pointInPolygon(x,z,f.ring))return true;
      if(f.kind==='building'&&(f.x!==houseX||f.z!==houseZ)){
        const dx=x-f.x,dz=z-f.z;
        if(Math.abs(dx*f.c-dz*f.s)<f.hw-5&&Math.abs(dx*f.s+dz*f.c)<f.hd-5)return true;
      }
    }
    return false;
  }

  _makeSite(name,plots){
    const group=new THREE.Group();group.name=name;
    const positions=[],colors=[],indices=[],offsets=[],color=new THREE.Color();
    const quad=(plot,x0,z0,x1,z1,height,tint)=>{
      const start=positions.length/3;
      color.setHex(tint).convertSRGBToLinear();
      for(const [x,z] of [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]){
        const [px,pz]=plot.point(x,z);
        positions.push(px,0,pz);offsets.push(height);colors.push(color.r,color.g,color.b);
      }
      return start;
    };
    const top=start=>indices.push(start,start+2,start+1,start,start+3,start+2);
    const plane=(plot,x0,z0,x1,z1,tint,h=.16)=>top(quad(plot,x0,z0,x1,z1,h,tint));
    const wall=(plot,x0,z0,x1,z1,rise,tint)=>{
      const first=quad(plot,x0,z0,x1,z1,0,tint),roof=quad(plot,x0,z0,x1,z1,rise,tint);
      top(roof);
      for(let i=0;i<4;i++){
        const a=first+i,b=first+(i+1)%4;
        indices.push(a,b,a+4,b,b+4,a+4);
      }
    };
    for(const [i,p] of plots.entries()){
      const w=p.width/2,d=p.depth;
      for(let z=-.7;z<d+1.2;z+=2.5)plane(p,-.72,z,.72,Math.min(d+1.2,z+2.5),0xb39b79,.20);
      plane(p,-w,.15,w,2.9,0x998367);
      for(const sign of [-1,1]){
        const x0=sign<0?-w+.55:1.05,x1=sign<0?-1.05:w-.55;
        for(let z=3;z<d-.8;z+=2.5)plane(p,x0,z,x1,Math.min(d-.8,z+2.5),0x75583b);
        for(let row=0;row<5;row++){
          const f=(x1-x0)/5,rowX=x0+row*f;
          const tint=[0x718243,0x4d6634,0x8a8c4d][(row+i)%3];
          for(let z=3.4;z<d-1.2;z+=2.5)plane(p,rowX+.12,z,rowX+f*.65,Math.min(d-1.2,z+2.5),tint,.24);
        }
        const l=sign<0?-w:w-.45,r=l+.45;
        for(let z=2.7;z<d;z+=2.2){
          const hedge=i%3===1;
          const tint=hedge?(z%3>1.5?0x58723a:0x486333):(z%3>1.5?0x888274:0x746a5d);
          wall(p,l,z,r,Math.min(d,z+2.2),hedge?1.24:.85,tint);
        }
        wall(p,sign<0?-w:1.05,d-.35,sign<0?-1.05:w,d,.83,0x837869);
      }
      if(p.farm){
        wall(p,-w,0,-w+2,2.7,1.30,0x634c33);
        wall(p,w-1.8,.5,w,2.25,1.10,0x806047);
      }
    }
    // One orchard tree per selected plot: a square trunk and two pyramids.
    for(const [i,p] of plots.entries()){
      if(i%2&&!p.farm)continue;
      const u=-p.width/2+1.15,v=1.4;
      wall(p,u-.15,v-.15,u+.15,v+.15,2.5,0x675038);
      const add=(dx,dz,h,tint)=>{
        const [px,pz]=p.point(u+dx,v+dz);
        positions.push(px,0,pz);offsets.push(h);color.setHex(tint).convertSRGBToLinear();colors.push(color.r,color.g,color.b);
        return positions.length/3-1;
      };
      const base=positions.length/3;
      for(const [x,z,h,tint] of [[0,-1.6,3.0,0x61794a],[1.6,0,3.0,0x76915b],[0,1.6,3.0,0x557345],[-1.6,0,3.0,0x6f8652],[0,0,5.0,0x829960],[0,0,1.8,0x3e5733]])add(x,z,h,tint);
      for(let j=0;j<4;j++){
        const a=base+j,b=base+(j+1)%4;
        indices.push(a,base+4,b,a,b,base+5);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
    mesh.name='rhineGardenDetails';group.add(mesh);
    const site={name,group,mesh,offsets,plots,revisions:new Map(),x:plots[0].x,z:plots[0].z};
    this._groundSite(site);group.visible=false;
    return site;
  }
  _groundSite(site){
    let changed=false;
    for(const plot of site.plots){
      const key=Math.floor(plot.x/this.osm.tileSize)+','+Math.floor(plot.z/this.osm.tileSize);
      const revision=this.terrain.tiles.get(key)?.surfaceRevision??0;
      if(site.revisions.get(key)!==revision){site.revisions.set(key,revision);changed=true;}
    }
    if(!changed)return;
    const p=site.mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,this.terrain.getRenderedHeight(p.getX(i),p.getZ(i))+site.offsets[i]);
    p.needsUpdate=true;site.mesh.geometry.computeVertexNormals();site.mesh.geometry.computeBoundingSphere();
  }

  _flock(scene,point,river){
    const count=river?9:12,geometry=new THREE.BufferGeometry();
    const position=new THREE.BufferAttribute(new Float32Array(count*18),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',position);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:river?0xd9d8cd:0x292d2c,side:THREE.DoubleSide}));
    mesh.name=river?'Rhine waterfowl':'Field crows';mesh.frustumCulled=false;scene.add(mesh);
    return {mesh,count,point,river,age:0,cooldown:0,heading:point.heading||0,
      seeds:Array.from({length:count},(_,i)=>osmHash(i,7,river?143:144))};
  }
  reset(){
    this.groundClock=0;
    for(const f of this.flocks){f.age=0;f.cooldown=0;f.mesh.visible=false;}
  }
  update(dt,x,z,altitude){
    if((this.groundClock-=dt)<=0){
      this.groundClock=.25;
      for(const site of this.sites){
        site.group.visible=Math.hypot(x-site.x,z-site.z)<1200;
        if(site.group.visible)this._groundSite(site);
      }
    }
    const flying=Number.isFinite(altitude);
    const agl=flying?altitude-this.terrain.getRenderedHeight(x,z):Infinity;
    for(const f of this.flocks){
      const distance=Math.hypot(x-f.point.x,z-f.point.z);
      f.cooldown=Math.max(0,f.cooldown-dt);
      if(!flying||distance>950){f.mesh.visible=false;continue;}
      if(!f.mesh.visible){
        if(f.cooldown>0||distance>(f.river?650:370)||agl>(f.river?330:155))continue;
        f.mesh.visible=true;f.age=0;
        if(!f.river)f.heading=Math.atan2(f.point.x-x,f.point.z-z);
      }
      f.age+=dt;
      if(f.age>(f.river?26:13)){f.mesh.visible=false;f.cooldown=f.river?12:23;continue;}
      this._poseFlock(f);
    }
  }
  _poseFlock(f){
    const p=f.mesh.geometry.attributes.position,age=f.age;
    const heading=f.heading+(f.river?.15:.58)*Math.sin(age*.38),c=Math.cos(heading),s=Math.sin(heading);
    const d=age*(f.river?12:14),baseX=f.point.x+Math.sin(f.heading)*d,baseZ=f.point.z+Math.cos(f.heading)*d;
    const height=this.terrain.getRenderedHeight(baseX,baseZ)+(f.river?22:3+Math.min(36,age*4.7));
    for(let i=0;i<f.count;i++){
      const seed=f.seeds[i],side=i%2?1:-1,row=Math.floor(i/2)+1;
      const spread=side*(row*2.35+3*seed)+(f.river?0:Math.sin(age*.9+i)*3.4);
      const trail=-row*(f.river?3.2:1.6)+seed*7;
      const x=baseX+spread*c+trail*s,z=baseZ-spread*s+trail*c;
      const y=height+seed*4+(f.river?1.4:2.4)*Math.sin(age+i*.7);
      const span=(f.river?1.22:.83)*(.82+seed*.3),flap=Math.sin(age*(f.river?13:20)+i*2.1)*span*.70;
      for(let k=0;k<2;k++){
        const wing=k?span:-span,at=i*6+k*3;
        p.setXYZ(at,x+s*.45,y,z+c*.45);
        p.setXYZ(at+1,x+c*wing-s*.33,y+flap,z-s*wing-c*.33);
        p.setXYZ(at+2,x-s*.36,y,z-c*.36);
      }
    }
    p.needsUpdate=true;
  }
}
