/* Original visual fittings for the June 1942 carrier models. Model coordinates are metres, +Z bow. */
(function(root){
  'use strict';

  function create(THREE){
    const std=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.12});
    const cloth=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,side:THREE.DoubleSide});
    const lens=new THREE.MeshBasicMaterial({vertexColors:true});
    const box=new THREE.BoxGeometry(1,1,1);
    const sphere=new THREE.SphereGeometry(1,12,8);
    const cylinder=new THREE.CylinderGeometry(1,1,1,8);
    const circle=new THREE.CircleGeometry(1,16).rotateX(-Math.PI/2);
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
      for(const dz of [-length*.37,length*.37]){
        b.beam(steel,[x+width*.35,y-1.65,z+dz],[rim+.1,y-.24,z+dz],.065);
      }
      for(const dz of [-length/2,0,length/2])b.beam(edge,[rim,y,z+dz],[rim,y+.88,z+dz],.035);
      for(const h of [.42,.88]){
        b.beam(edge,[rim,y+h,z-length/2],[rim,y+h,z+length/2],.028);
        for(const dz of [-length/2,length/2])b.beam(edge,[rim,y+h,z+dz],[x+width/2,y+h,z+dz],.028);
      }
    }

    function cart(b,x,y,z,paint){
      b.add(box,steel,x,y+.37,z,.98,.16,1.55);
      b.add(box,paint,x,y+.58,z,.88,.27,1.35);
      for(const dx of [-.52,.52])for(const dz of [-.53,.53]){
        b.add(cylinder,rubber,x+dx,y+.22,z+dz,.22,.14,.22,0,0,Math.PI/2);
        b.add(cylinder,edge,x+dx*1.12,y+.22,z+dz,.09,.04,.09,0,0,Math.PI/2);
      }
      b.beam(edge,[x,y+.40,z+.76],[x,y+.53,z+1.52],.043);
      b.beam(edge,[x-.23,y+.53,z+1.52],[x+.23,y+.53,z+1.52],.034);
    }

    function serviceStation(b,x,y,z,paint){
      cart(b,x,y,z,paint);
      for(const dz of [-2.7,-3.5]){
        b.add(cylinder,paint,x,y+.44,z+dz,.29,.88,.29);
        for(const h of [.16,.73])b.add(cylinder,edge,x,y+h,z+dz,.302,.065,.302);
        b.add(cylinder,steel,x-.09,y+.91,z+dz,.06,.055,.06);
      }
      b.add(box,0x777257,x,y+.23,z+2.6,.78,.46,.9);
      b.add(box,brass,x,y+.30,z+2.13,.12,.13,.05);
      b.add(cylinder,rubber,x,y+.15,z+3.55,.32,.30,.32);
      b.add(cylinder,brass,x,y+.31,z+3.55,.16,.06,.16);
    }

    function parkedAircraft(b,x,floor,z,{japan=false,folded=false}={}){
      const skin=japan?0xa8aaa0:0x566c81,under=japan?0xb8b7aa:0x939a99;
      const span=japan?11.9:folded?5.8:12.6,halfSpan=span/2;
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
        flags:[[0x9d3d36,0xe3d8b0],[0x405f77,0xc4a552],[0xc4a552,0x36495b]]},
      kaga:{deck:21.2,pole:[-13.7,33.45,43.3],hull:0x717b7e,gear:0x646b54,
        flags:[[0xc7c1a2,0xa43d34],[0x3d586b,0xd2bc72],[0x96362e,0xe0d4ac]]}
    };

    function build(kind){
      const structure=batch(),detail=batch(),lights=batch(),s=specifications[kind],d=s.deck;
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
        for(const z of [-76,-30,8,50,79]){
          const folded=z!==-30&&z!==50;
          parkedAircraft(detail,z===79?-3.9:z===-76?3.8:-.8,7.80,z,{folded});
          fixture(detail,lights,-7.8,15.1,z,16.0);
          fixture(detail,lights,7.8,15.1,z,16.0);
        }
        for(const z of [-74,5,50])cart(detail,8.15,7.80,z,s.gear);
        for(const [x,z] of [[11.65,-91],[-11.65,-55],[11.65,10],[11.65,38],[-11.65,73],[11.65,108]])serviceStation(detail,x,d,z,s.gear);
      }else{
        structure.add(box,s.hull,-13.7,24.78,43.35,2.7,3.5,3.55);
        structure.add(box,steel,-13.7,26.50,43.35,2.92,.18,3.75);
        for(const z of [44,52])platform(structure,-16.2,d+4.3,z,1.67,3.15,s.hull);
        for(const z of [-88,-53,-19,61,89])platform(structure,-15.1,17.2,z,1.42,3.7,s.hull);
        // Extend the existing upper hangar floor out onto the open stern framing.
        structure.add(box,steel,0,14.17,-110.4,23.0,.28,19.9);
        structure.add(box,s.hull,0,14.24,-120.15,23.1,.15,.42);
        for(const x of [-10.97,10.97]){
          structure.beam(s.hull,[x,8.40,-119],[x*.56,8.25,-108],.15);
          structure.beam(s.hull,[x,8.40,-111],[x*.72,8.25,-104],.15);
        }
        for(const [x,z] of [[-4.7,-111],[5.1,-116]])parkedAircraft(detail,x,14.31,z,{japan:true});
        cart(detail,3.6,14.31,-106.2,s.gear);
        for(const x of [-8,0,8])fixture(detail,lights,x,20.25,-111,20.68);
        for(const [x,z] of [[13.65,-91],[-13.65,-75],[13.65,-40],[13.65,30],[-13.65,76],[13.65,108]])serviceStation(detail,x,d,z,s.gear);
      }
      const [x,y,z]=s.pole;
      const anchor=kind==='enterprise'?[-14.2,36.01,z]:[x,33.67,z];
      structure.beam(edge,anchor,[x,y,z],.045);
      structure.beam(edge,[x,y,z],[x,y,z-1.3],.042);
      structure.beam(steel,[x,y,z-.58],[x,y-3.6,z-.58],.019);
      return {structure:structure.finish(),detail:detail.finish(),lights:lights.finish()};
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
      add(details,'carrier-hangar-and-deck-equipment',geometry.detail,std,true);
      const fixtures=add(details,'carrier-hangar-lanterns',geometry.lights,lens);
      add(details,'carrier-signal-flags',geometry.flag.geometry,cloth);
      group.add(details);model.add(group);parts.set(ship,{details,flag:geometry.flag,fixtures});
    }

    function update(ship,cameraPosition,time,dark){
      if(!ship?.visible)return;
      const data=parts.get(ship);
      if(!data)return;
      data.details.visible=ship.position.distanceToSquared(cameraPosition)<1600*1600;
      if(!data.details.visible)return;
      data.fixtures.visible=!dark;
      wave(data.flag,time);
    }

    return {install,update};
  }
  root.CarrierOutfitting={create};
  if(typeof module==='object'&&module.exports)module.exports=root.CarrierOutfitting;
})(typeof window==='undefined'?globalThis:window);
