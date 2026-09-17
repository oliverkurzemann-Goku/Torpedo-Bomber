// Remagen's fictional forward strip. Ordinary Lambert meshes only: no new shader
// defines, instance colours, aircraft hooks or changes to global terrain materials.
class AirfieldDetails {
  constructor(terrain,osm,x,z,length,width){
    this.terrain=terrain; this.osm=osm; this.x=x; this.z=z;
    this.group=new THREE.Group(); this.group.name='remagenForwardStrip';
    this.ground=[]; this.parts=[]; this.buckets=new Map(); this.lastSegments=-1;
    const patches=new Map();
    const patch=(colour,dx,dz,w,d,offset)=>{
      if(!patches.has(colour))patches.set(colour,{positions:[],indices:[],offset});
      const p=patches.get(colour),n=p.positions.length/3;
      p.positions.push(x+dx-w/2,0,z+dz-d/2, x+dx-w/2,0,z+dz+d/2,
        x+dx+w/2,0,z+dz-d/2, x+dx+w/2,0,z+dz+d/2);
      p.indices.push(n,n+1,n+2,n+1,n+3,n+2);
    };
    // A broad, worn strip, two wheel ruts, a parallel service track and apron.
    // No concrete, modern runway numbers or centre-line lighting.
    patch(0x77755a,0,0,length+18,width+16,.10);
    patch(0x82745b,0,0,length,width,.16);
    for(const dz of [-5,5])patch(0x685d49,0,dz,length-12,2.5,.22);
    patch(0x82745b,-60,-65,length-140,9,.16);
    for(const dx of [-360,-60,260])patch(0x82745b,dx,-39,10,48,.16);
    patch(0x82745b,-290,-100,145,62,.16);
    for(const [colour,p] of patches){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(p.positions,3));
      geo.setIndex(p.indices);
      const mat=new THREE.MeshLambertMaterial({color:colour,map:terrain.material.map||null});
      const mesh=new THREE.Mesh(geo,mat); mesh.name='airfieldGround';
      // Reuse the established grid/diagonal clipping, not a centre-height ribbon.
      osm._prepareWaterSurface(mesh,Math.floor(x/4000)*4000,Math.floor(z/4000)*4000,p.offset);
      this.ground.push(mesh); this.group.add(mesh);
    }
    const wood=0x655a43,roof=0x4f5349,dark=0x303630,trim=0x968b70;
    // Low timber barracks, real pitched roofs, framed windows and a front door.
    for(const [dx,dz,w,d] of [[-380,-145,24,12],[-250,-150,20,10],[-115,-155,26,12],[55,-145,20,10],[215,-130,18,10]]){
      const b=this.base(dx,dz,w,d),eave=b.top+3.4;
      this.box(w,eave-b.bottom,d,wood,x+dx,(eave+b.bottom)/2,z+dz,'hut');
      this.gable(w+1,d+1,2.6,roof,x+dx,eave,z+dz);
      for(const side of [-1,1]){
        for(let wx=-w/2+3;wx<w/2-1;wx+=4){
          this.box(1.65,1.6,.12,trim,x+dx+wx,b.top+2,z+dz+side*(d/2+.07));
          this.box(1.3,1.25,.14,dark,x+dx+wx,b.top+2,z+dz+side*(d/2+.15));
          this.box(.08,1.25,.16,trim,x+dx+wx,b.top+2,z+dz+side*(d/2+.23));
        }
      }
      this.box(1.4,2.65,.14,dark,x+dx+w/2-2,b.top+1.325,z+dz+d/2+.16);
      this.box(2,.2,1,trim,x+dx+w/2-2,b.top+.1,z+dz+d/2+.5);
      this.box(.5,2,.5,dark,x+dx-w/4,eave+2,z+dz);
    }
    // Timber maintenance shelter with dark open bays facing the service apron.
    const shelter=this.base(-295,-115,40,20),sy=shelter.top;
    this.box(40,sy+6-shelter.bottom,20,wood,x-295,(sy+6+shelter.bottom)/2,z-115,'shelter');
    this.gable(42,22,4,roof,x-295,sy+6,z-115);
    for(const dx of [-306,-284]){
      this.box(15,5.1,.16,dark,x+dx,sy+2.55,z-104.85);
      this.box(.3,5.5,.3,trim,x+dx-7.6,sy+2.75,z-104.7);
      this.box(.3,5.5,.3,trim,x+dx+7.6,sy+2.75,z-104.7);
    }
    // Supplies remain well outside the active runway and taxiways.
    for(let i=0;i<12;i++){
      const dx=-210+(i%4)*2.3,dz=-110-Math.floor(i/4)*2.1,b=this.base(dx,dz,1.8,1.5);
      this.box(1.8,b.top+1.4-b.bottom,1.5,trim,x+dx,(b.top+1.4+b.bottom)/2,z+dz,'crate');
      this.box(1.85,.12,1.55,wood,x+dx,b.top+1.05,z+dz);
    }
    for(let i=0;i<8;i++){
      const dx=95+i*1.1,dz=-135,b=this.base(dx,dz,.8,.8);
      this.add(new THREE.CylinderGeometry(.38,.38,1.1,8),roof,x+dx,b.top+.55,z+dz,'barrel');
    }
    // Small edge markers, not a white painted modern runway.
    for(let dx=-length/2+20;dx<length/2;dx+=100)for(const dz of [-width/2-3,width/2+3]){
      const b=this.base(dx,dz,1.4,.65);
      this.box(1.4,.3,.65,0xb3ac91,x+dx,b.top+.15,z+dz,'marker');
    }
    const wh=terrain.getRenderedHeight(x+150,z+100);
    this.add(new THREE.CylinderGeometry(.10,.14,7,8),trim,x+150,wh+3.5,z+100,'windsock');
    // A narrow tapered windsock; its length and height are in metres.
    const sock=new THREE.CylinderGeometry(.16,.5,2.8,8,1,true);
    sock.rotateZ(-Math.PI/2);
    this.add(sock,0xb78153,x+151.4,wh+6.6,z+100);
    for(const [colour,positions] of this.buckets){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:colour}));
      mesh.name='airfieldObjects'; this.group.add(mesh);
    }
    this.buckets.clear(); this.refresh();
  }
  base(dx,dz,w,d){
    const heights=[];
    // Foundation includes edge samples, not only the centre of a wide shed.
    for(let i=0;i<=4;i++)for(let j=0;j<=2;j++)
      heights.push(this.terrain.getRenderedHeight(this.x+dx-w/2+w*i/4,this.z+dz-d/2+d*j/2));
    return {bottom:Math.min(...heights)-.5,top:Math.max(...heights)+.12};
  }
  box(w,h,d,c,x,y,z,name){this.add(new THREE.BoxGeometry(w,h,d),c,x,y,z,name);}
  gable(w,d,h,c,x,y,z){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute([
      -w/2,0,-d/2,-w/2,0,d/2,-w/2,h,0,
      w/2,0,-d/2,w/2,0,d/2,w/2,h,0],3));
    geo.setIndex([0,1,2,3,5,4,0,5,3,0,2,5,2,4,5,2,1,4]);
    this.add(geo,c,x,y,z,'roof');
  }
  add(geo,c,x,y,z,name){
    const flat=geo.index?geo.toNonIndexed():geo;
    const p=flat.attributes.position;
    if(!this.buckets.has(c))this.buckets.set(c,[]);
    const out=this.buckets.get(c);
    for(let i=0;i<p.count;i++)out.push(p.getX(i)+x,p.getY(i)+y,p.getZ(i)+z);
    geo.computeBoundingBox();
    if(name)this.parts.push({name,bounds:geo.boundingBox.clone().translate(new THREE.Vector3(x,y,z))});
    if(flat!==geo)flat.dispose(); geo.dispose();
  }
  refresh(){
    const tile=this.terrain.tiles.get(Math.floor(this.x/4000)+','+Math.floor(this.z/4000));
    if(!tile||tile.morphing||tile._renderSeg===this.lastSegments)return;
    for(const mesh of this.ground){
      this.osm.redrapeWater(mesh);
      const p=mesh.geometry.attributes.position,uv=[];
      for(let i=0;i<p.count;i++)uv.push(p.getX(i)/4000,p.getZ(i)/4000);
      mesh.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    }
    this.lastSegments=tile._renderSeg;
  }
}
