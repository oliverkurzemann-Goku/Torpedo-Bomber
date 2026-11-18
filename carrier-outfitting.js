/* Original visual fittings for the June 1942 carrier models. Model coordinates are metres, +Z bow. */
(function(root){
  'use strict';

  function create(THREE){
    const std=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.12});
    const cloth=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,side:THREE.DoubleSide});
    const lens=new THREE.MeshBasicMaterial({vertexColors:true});
    const box=new THREE.BoxGeometry(1,1,1);
    const sphere=new THREE.SphereGeometry(1,12,8);
    const circle=new THREE.CircleGeometry(1,16).rotateX(-Math.PI/2);
    const cylinder=new THREE.CylinderGeometry(1,1,1,8);
    const parts=new WeakMap(),templates=new Map();
    const point=new THREE.Vector3(),position=new THREE.Vector3(),scale=new THREE.Vector3();
    const rotation=new THREE.Quaternion(),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
    const euler=new THREE.Euler(),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
    const color=value=>new THREE.Color(value).convertSRGBToLinear();

    function batch(){
      const positions=[],normals=[],colors=[];
      const normal=new THREE.Vector3();
      function add(shape,paint,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
        position.set(x,y,z);scale.set(sx,sy,sz);rotation.setFromEuler(euler.set(rx,ry,rz));
        append(shape,paint);
      }
      function append(shape,paint){
        const attributes=shape.attributes,index=shape.index,tint=color(paint);
        matrix.compose(position,rotation,scale);normalMatrix.getNormalMatrix(matrix);
        for(let i=0;i<(index?.count??attributes.position.count);i++){
          const k=index?index.getX(i):i;
          point.fromBufferAttribute(attributes.position,k).applyMatrix4(matrix);
          normal.fromBufferAttribute(attributes.normal,k).applyNormalMatrix(normalMatrix);
          positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);colors.push(tint.r,tint.g,tint.b);
        }
      }
      function beam(paint,a,b,r){
        direction.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
        scale.set(r,direction.length(),r);rotation.setFromUnitVectors(up,direction.normalize());
        position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
        append(cylinder,paint);
      }
      function finish(){
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
        geometry.computeBoundingSphere();
        return geometry;
      }
      return {add,beam,finish};
    }

    const rubber=0x262727,steel=0x505c61,edge=0x909998,brass=0x9a834e;
    function platform(b,x,y,z,width,length,paint){
      b.add(box,paint,x,y-.12,z,width,.24,length);
      const rim=x-width/2;
      for(let dz=-length/2+.18;dz<length/2;dz+=.22)b.add(box,steel,x,y+.012,z+dz,width*.95,.024,.035);
      for(const dx of [-.36,0,.36])b.add(box,edge,x+dx*width,y+.013,z,.025,.026,length*.97);
      for(const dz of [-length*.37,length*.37]){
        b.beam(steel,[x+width*.35,y-1.65,z+dz],[rim+.1,y-.24,z+dz],.065);
      }
      for(const dz of [-length/2,0,length/2])b.beam(edge,[rim,y,z+dz],[rim,y+.88,z+dz],.035);
      for(const h of [.42,.88]){
        b.beam(edge,[rim,y+h,z-length/2],[rim,y+h,z+length/2],.028);
        for(const dz of [-length/2,length/2])b.beam(edge,[rim,y+h,z+dz],[x+width/2,y+h,z+dz],.028);
      }
    }

    function cart(batch,x,y,z,paint,angle=0,load='tools'){
      const cs=Math.cos(angle),sn=Math.sin(angle);
      const transform=(px,py,pz)=>[x+cs*px+sn*pz,y+py,z-sn*px+cs*pz];
      const b={add:(shape,tint,px,py,pz,sx,sy,sz,rx=0,ry=0,rz=0)=>batch.add(shape,tint,...transform(px,py,pz),sx,sy,sz,rx,ry+angle,rz),
        beam:(tint,a,c,r)=>batch.beam(tint,transform(...a),transform(...c),r)};
      b.add(box,steel,0,.37,0,.98,.16,1.55);
      if(load==='hangar')b.add(box,paint,0,.58,0,.88,.27,1.35);
      else if(load==='tools'){
        b.add(box,paint,0,.58,-.12,.88,.27,1.15,0,.12);
        b.add(box,0x595141,.12,.76,-.25,.48,.13,.62);
      }else if(load==='crates'){
        b.add(box,0x836d49,-.16,.60,-.32,.51,.31,.58,0,.12);
        b.add(box,0x6d7153,.12,.55,.33,.65,.23,.54,0,-.16);
        for(const dz of [-.54,-.12])b.add(box,0xac9470,-.16,.76,dz,.47,.022,.047);
      }
      for(const dx of [-.52,.52])for(const dz of [-.53,.53]){
        b.add(cylinder,rubber,dx,.22,dz,.22,.14,.22,0,0,Math.PI/2);
        b.add(cylinder,edge,dx*1.12,.22,dz,.09,.04,.09,0,0,Math.PI/2);
      }
      b.beam(edge,[0,.40,.76],[0,.64,1.41],.043);
      b.beam(edge,[-.23,.64,1.41],[.23,.64,1.41],.034);
    }

    function serviceStation(b,x,y,z,paint,index){
      cart(b,x,y,z,paint,index%2?.32:-.24,index===2?'empty':index?'crates':'tools');
      for(const dz of index===0?[-2.7,-3.5]:index===1?[2.5]:[]){
        b.add(cylinder,paint,x+.17,y+.44,z+dz,.29,.88,.29);
        for(const h of [.16,.73])b.add(cylinder,edge,x+.17,y+h,z+dz,.302,.065,.302);
      }
      if(index!==2)b.add(box,0x777257,x-.14,y+.23,z+3.65,.68,.46,.9,0,-.31);
    }

    function bridgeFittings(b,x,y,z,span){
      for(const f of [-.36,-.06,.28]){
        const p=z+f*span;
        b.add(box,steel,x,y,p,.13,1.24,.70);
        b.add(box,0x6d797e,x-.074,y+.035,p,.04,1.10,.59);
        b.add(box,brass,x-.107,y-.06,p+.18,.036,.09,.10);
        for(const dz of [-.23,.22])b.add(box,edge,x-.096,y+.12,p+dz,.08,.15,.055);
      }
      for(const f of [-.32,.16]){
        const p=z+span*f;
        b.add(box,steel,x-.02,y+.93,p,.19,.51,1.61);
        for(let i=0;i<5;i++)b.add(box,edge,x-.13,y+.76+i*.074,p,.070,.027,1.49,0,0,-.26);
      }
      b.beam(steel,[x-.19,y-.67,z-span*.42],[x-.19,y-.67,z+span*.40],.050);
      b.beam(steel,[x-.19,y-.67,z-span*.42],[x-.19,y+.67,z-span*.42],.050);
    }

    function parkedAircraft(b,x,floor,z,{japan=false,folded=false}={}){
      const skin=japan?0xa8aaa0:0x566c81,under=japan?0xb8b7aa:0x939a99;
      const span=folded?5.8:japan?11.9:12.6,halfSpan=span/2;
      const wingY=floor+1.09,bodyY=floor+1.51,nose=japan?4.1:4.65;
      b.add(sphere,skin,x,bodyY,z,.65,.66,4.7,.045);
      b.add(cylinder,japan?0x232926:skin,x,bodyY+.22,z+nose-1,.65,1.45,.65,Math.PI/2);
      b.add(cylinder,0x394043,x,bodyY+.22,z+nose-.24,.54,.08,.54,Math.PI/2);
      b.add(sphere,under,x,bodyY-.28,z-1.7,.46,.24,2.60);
      b.add(sphere,0x263d46,x,bodyY+.66,z-.08,.42,.48,japan?1.48:1.80);
      for(const dz of [-.82,.28,1.01])b.add(cylinder,skin,x,bodyY+.68,z+dz,.43,.05,.44,Math.PI/2);
      for(const side of [-1,1]){
        const dx=side*(halfSpan*.48+.28);
        b.add(sphere,skin,x+dx,wingY,z+.37,halfSpan*.51,.18,1.39,0,side*.07,side*.031);
        b.add(sphere,skin,x+side*1.12,bodyY-.25,z-3.75,1.24,.09,.71,0,side*.15);
        if(folded){
          b.add(sphere,skin,x+side*(halfSpan-.10),wingY+.93,z-.31,.17,1.28,1.36,.13,0,side*.12);
          b.beam(under,[x+side*1.02,bodyY-.04,z+.85],[x+side*(halfSpan-.25),wingY+.68,z+.30],.042);
        }else{
          b.add(circle,japan?0x94332a:0x20344d,x+side*halfSpan*.65,wingY+.205,z+.40,.61,1,.61);
          if(!japan)b.add(circle,0xd5d3c0,x+side*halfSpan*.65,wingY+.209,z+.40,.37,1,.37);
        }
        const wheelX=x+side*(japan?1.61:1.74);
        b.beam(under,[wheelX,wingY,z+.85],[wheelX,floor+.37,z+.95],.068);
        b.add(cylinder,rubber,wheelX,floor+.36,z+.95,.36,.22,.36,0,0,Math.PI/2);
        b.add(cylinder,under,wheelX+side*.122,floor+.36,z+.95,.15,.040,.15,0,0,Math.PI/2);
      }
      b.add(sphere,skin,x,bodyY+.42,z-3.92,.115,.92,.76,-.26);
      b.add(cylinder,rubber,x,floor+.16,z-3.78,.16,.14,.16,0,0,Math.PI/2);
      b.add(sphere,under,x,bodyY+.22,z+nose,.18,.18,.28);
      for(let i=0;i<3;i++)b.add(box,rubber,x,bodyY+.22,z+nose-.08,.125,2.72,.054,0,0,i*Math.PI/3+.24);
    }

    function fixture(b,lights,x,y,z,ceiling){
      b.add(box,steel,x,y,z,.25,.18,1.24);
      for(const dz of [-.48,.48])b.beam(steel,[x,y,z+dz],[x,ceiling,z+dz],.028);
      lights.add(box,0xb9ac86,x,y-.106,z,.13,.04,1.05);
    }

    const specifications={
      enterprise:{deck:16.85,pole:[-13.1,35.6,18],hull:0x536171,gear:0x826a3e,
        stations:[[11.74,-96],[11.82,-91],[-11.80,43],[-11.84,98]], flags:[[0x9d3d36,0xe3d8b0],[0x405f77,0xc4a552],[0xc4a552,0x36495b]]},
      kaga:{deck:21.2,pole:[-13.7,33.45,43.3],hull:0x717b7e,gear:0x646b54,
        stations:[[-13.45,-65],[13.65,-28],[13.48,-24],[13.78,87]], flags:[[0xc7c1a2,0xa43d34],[0x3d586b,0xd2bc72],[0x96362e,0xe0d4ac]]}
    };

    function build(kind){
      const structure=batch(),detail=batch(),hangar=batch(),lights=batch(),moving=batch(),s=specifications[kind],d=s.deck;
      if(kind==='enterprise'){
        // The upper face of the island is Y=19.6 and the original funnel starts at 20.7.
        // Both members overlap this collar so it has no exposed seam.
        structure.add(box,0x4b5968,-14.4,20.19,-.6,5.38,1.50,15.38);
        structure.add(box,0x566475,-14.35,19.72,-.6,5.68,.28,15.66);
        // The aft mast stands on a deckhouse directly behind the funnel.
        structure.add(box,s.hull,-14.1,23.04,-10.2,3.8,6.96,4.4);
        structure.add(box,steel,-14.1,26.54,-10.2,4.0,.18,4.55);
        structure.add(box,edge,-16.02,25.42,-10.65,.05,.42,1.80);
        for(const z of [-6.7,-3.65,-.6,2.45,5.5]){
          structure.add(box,steel,-17.15,20.23,z,.18,1.45,.17);
        }
        for(const z of [16,29])platform(structure,-17.6,24.1,z,1.75,4.25,s.hull);
        bridgeFittings(structure,-16.90,18.15,10,32);
        for(const z of [-76,-30,8,50,79]){
          const folded=z!==-30&&z!==50;
          parkedAircraft(hangar,z===79?-3.9:z===-76?3.8:-.8,7.80,z,{folded});
          fixture(hangar,lights,-7.8,15.1,z,16.0);
          fixture(hangar,lights,7.8,15.1,z,16.0);
        }
        for(const z of [-74,5,50])cart(hangar,8.15,7.80,z,s.gear,0,'hangar');

      }else{
        structure.add(box,s.hull,-13.7,24.78,43.35,2.7,3.5,3.55);
        structure.add(box,steel,-13.7,26.50,43.35,2.92,.18,3.75);
        for(const z of [44,52])platform(structure,-16.2,d+4.3,z,1.67,3.15,s.hull);
        for(const z of [-88,-53,-19,61,89])platform(structure,-15.1,17.2,z,1.42,3.7,s.hull);
        bridgeFittings(structure,-15.80,d+.44,48,12);
        // Extend the existing upper hangar floor out onto the open stern framing.
        structure.add(box,steel,0,14.17,-110.4,23.0,.28,19.9);
        structure.add(box,s.hull,0,14.24,-120.15,23.1,.15,.42);
        for(const x of [-10.97,10.97]){
          structure.beam(s.hull,[x,8.40,-119],[x*.56,8.25,-108],.15);
          structure.beam(s.hull,[x,8.40,-111],[x*.72,8.25,-104],.15);
        }
        for(const [x,z] of [[-4.7,-111],[5.1,-116]])parkedAircraft(hangar,x,14.31,z,{japan:true});
        cart(hangar,3.6,14.31,-106.2,s.gear,0,'hangar');
        for(const x of [-8,0,8])fixture(hangar,lights,x,20.25,-111,20.68);
      }
      s.stations.forEach(([x,z],i)=>serviceStation(detail,x,d,z,s.gear,i));
      const parkX=kind==='enterprise'?-10.95:-12.18,parkZ=kind==='enterprise'?35:64;
      // A folded-wing aircraft under maintenance at the deck edge. The launch lane is clear.
      const narrow={add:(shape,paint,px,y,pz,sx,sy,sz,...r)=>detail.add(shape,paint,parkX+px*.56,y,pz,sx*.56,sy,sz,...r),
        beam:(paint,a,b,r)=>detail.beam(paint,[parkX+a[0]*.56,a[1],a[2]],[parkX+b[0]*.56,b[1],b[2]],r)};
      parkedAircraft(narrow,0,d,parkZ,{folded:true,japan:kind==='kaga'});
      for(const dz of [0,.88])detail.add(box,0x76654c,parkX+.87,d+.13,parkZ+dz,.31,.26,.28);
      detail.add(box,0x655d45,parkX+.47,d+.18,parkZ+3.38,.53,.33,.64,0,-.3);
      cart(moving,0,0,0,s.gear,0,'crates');
      const [x,y,z]=s.pole;
      const anchor=kind==='enterprise'?[-14.2,36.01,z]:[x,33.67,z];
      structure.beam(edge,anchor,[x,y,z],.045);
      structure.beam(edge,[x,y,z],[x,y,z-1.3],.042);
      structure.beam(steel,[x,y,z-.58],[x,y-3.6,z-.58],.019);
      return {structure:structure.finish(),detail:detail.finish(),hangar:hangar.finish(),lights:lights.finish(),moving:moving.finish()};
    }

    function flags(spec){
      const samples=[],vertices=[],colors=[];
      const segments=6;
      spec.flags.forEach((paints,i)=>{
        const height=.70,length=1.65,y=spec.pole[1]-.23-i*1.06;
        function vertex(j,top,paint){
          const u=j/segments;
          samples.push({u,x:spec.pole[0],y:y-(top?0:height*(1-u*.40)),z:spec.pole[2]-.58-u*length});
          vertices.push(0,0,0);colors.push(paint.r,paint.g,paint.b);
        }
        for(let j=0;j<segments;j++){
          const paint=color(paints[Math.floor(j/3)]);
          vertex(j,true,paint);vertex(j,false,paint);vertex(j+1,false,paint);
          vertex(j,true,paint);vertex(j+1,false,paint);vertex(j+1,true,paint);
        }
      });
      const geometry=new THREE.BufferGeometry(),attribute=new THREE.Float32BufferAttribute(vertices,3);
      attribute.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',attribute);
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(...spec.pole),5);
      return {geometry,samples,time:-1};
    }

    function wave(flag,t){
      const step=Math.floor(t*30);
      if(step===flag.time)return;
      flag.time=step;
      const p=flag.geometry.attributes.position;
      flag.samples.forEach(({x,y,z,u},i)=>p.setXYZ(i,x+u*.32*Math.sin(u*8-t*7),y+u*.13*Math.cos(u*7-t*6),z));
      p.needsUpdate=true;flag.geometry.computeVertexNormals();
    }

    function install(ship,model,kind){
      root.CarrierFinish?.apply(model,kind);
      if(!templates.has(kind)){
        const flag=flags(specifications[kind]);wave(flag,0);
        templates.set(kind,{...build(kind),flag});
      }
      const geometry=templates.get(kind),group=new THREE.Group(),details=new THREE.Group();
      group.name='carrier-outfitting';details.name='carrier-work-areas';
      function add(parent,name,geometry,material,shadow=false){
        const mesh=new THREE.Mesh(geometry,material);
        mesh.name=name;mesh.userData.shipVisualOnly=true;
        mesh.castShadow=shadow;mesh.receiveShadow=material===std;parent.add(mesh);
        return mesh;
      }
      add(group,'carrier-bridge-platforms',geometry.structure,std,true);
      add(details,'carrier-deck-equipment',geometry.detail,std,true);
      add(details,'carrier-hangar-equipment',geometry.hangar,std,true);
      const fixtures=add(details,'carrier-hangar-lanterns',geometry.lights,lens);
      const cartMesh=add(details,'carrier-service-cart',geometry.moving,std,true);cartMesh.visible=false;
      add(details,'carrier-signal-flags',geometry.flag.geometry,cloth);
      group.add(details);model.add(group);parts.set(ship,{details,flag:geometry.flag,cartMesh,fixtures,deck:specifications[kind].deck});
    }

    function update(ship,cameraPosition,time,dark,crew){
      if(!ship?.visible)return;
      const data=parts.get(ship);
      if(!data)return;
      data.details.visible=ship.position.distanceToSquared(cameraPosition)<1600*1600;
      if(!data.details.visible)return;
      data.fixtures.visible=!dark;
      data.cartMesh.visible=!!crew;
      if(crew){
        // Player carriers point along +world X. A cart's handle trails toward the crew.
        data.cartMesh.position.set(-crew.z,data.deck,crew.x+Math.sin(crew.heading)*1.72);
        data.cartMesh.rotation.y=crew.heading+Math.PI/2;
      }
      wave(data.flag,time);
    }

    return {install,update};
  }
  root.CarrierOutfitting={create};
  if(typeof module==='object'&&module.exports)module.exports=root.CarrierOutfitting;
})(typeof window==='undefined'?globalThis:window);
