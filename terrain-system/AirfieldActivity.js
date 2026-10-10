// Visible, period-inspired service activity beside the runway. No extra model
// downloads: parked aircraft reuse the selected sortie's existing GLB template.
class AirfieldActivity {
  constructor(terrain,x,z,options={}){
    this.service=options.service||'usaaf';
    this.terrain=terrain;this.x=x;this.z=z;this.time=0;this.aircraftKind='';
    this.group=new THREE.Group();this.group.name='airfieldActivity';
    this.group.position.set(x,0,z);this.parts=[];this.crew=[];this.parked=[];this.trucks=[];
    const mat=c=>new THREE.MeshLambertMaterial({color:c});
    this.mat={olive:mat(0x535942),canvas:mat(0x8a8064),wood:mat(0x69523c),
      dark:mat(0x272c29),rubber:mat(0x171a19),skin:mat(0xb89771),metal:mat(0x7b8074)};
    this._cube=new THREE.BoxGeometry(1,1,1);this._matrix=new THREE.Matrix4();
    this._position=new THREE.Vector3();this._rotation=new THREE.Quaternion();this._scale=new THREE.Vector3();this._handMatrix=new THREE.Matrix4();this._handPosition=new THREE.Vector3();
    this._euler=new THREE.Euler();
    this._up=new THREE.Vector3(0,1,0);
    const props=new THREE.Group();
    for(let i=0;i<18;i++){
      const px=-242+(i%6)*1.35,pz=-92-Math.floor(i/6)*1.4,y=this.ground(px,pz);
      this.box(props,1.15,.95,1.05,this.mat.wood,px,y+.48,pz,'supplyCrate');
      this.box(props,1.18,.09,1.08,this.mat.metal,px,y+.74,pz);
    }
    for(let i=0;i<8;i++)this.cylinder(props,.38,1.05,this.mat.olive,-267+i*.95,this.ground(-267+i*.95,-104)+.53,-104,'fuelDrum');
    // The trolley, payload and loaders move together in a complete service
    // cycle. Static scenery must not swallow their transforms during merging.
    const cart=new THREE.Group();
    this.box(cart,2.7,.18,1.35,this.mat.metal,0,.68,0);
    for(const dx of [-1,1])for(const dz of [-.65,.65])this.box(cart,.27,.55,.27,this.mat.rubber,dx,.3,dz);
    this.box(cart,.08,.9,.08,this.mat.metal,1.3,1.0,0);
    this.trolley=this.merge(cart);this.trolley.name='movingLoadingTrolley';this.group.add(this.trolley);
    this.jack=new THREE.Mesh(this._cube,this.mat.metal);this.jack.name='trolleyLift';this.group.add(this.jack);
    const payload=new THREE.Group();
    const bomb=new THREE.Mesh(new THREE.CylinderGeometry(.23,.28,1.7,10),this.mat.dark);
    bomb.rotation.x=Math.PI/2;bomb.position.y=.02;payload.add(bomb);
    this.box(payload,.62,.08,.48,this.mat.olive,0,0,-.75);
    this.box(payload,.08,.62,.48,this.mat.olive,0,0,-.75);
    this.box(payload,.12,.3,.12,this.mat.dark,0,.36,.25);
    this.payload=this.merge(payload);this.payload.name='serviceBomb';this.group.add(this.payload);
    this.box(props,3,.16,1.4,this.mat.wood,-333,this.ground(-333,-63)+.95,-63,'maintenanceBench');
    for(const dx of [-1.2,1.2])this.box(props,.15,.95,1.2,this.mat.dark,-333+dx,this.ground(-333,-63)+.47,-63);
    this.props=this.merge(props);this.props.name='airfieldSupplies';this.group.add(this.props);
    for(const [i,px] of [-318,-354].entries()){
      const pad=new THREE.Group();pad.name='parkedServiceAircraft';pad.userData.pad={x:px,z:-83};
      const fallback=new THREE.Group();
      this.box(fallback,1.3,1.4,8.8,this.mat.olive,0,1.5,0);
      this.box(fallback,12.3,.16,2.2,this.mat.olive,0,1.25,.8);
      this.box(fallback,4.3,.12,1.3,this.mat.olive,0,1.6,-3.5);
      this.box(fallback,.12,1.65,1.2,this.mat.olive,0,2.25,-3.4);
      this.box(fallback,.65,.5,1.4,this.mat.dark,0,2.32,.6);
      for(const wx of [-1.8,1.8])this.box(fallback,.4,.9,.75,this.mat.rubber,wx,.45,.7);
      this.box(fallback,.2,.45,.4,this.mat.rubber,0,.22,-3.7);
      const silhouette=this.merge(fallback);silhouette.userData.serviceFallback=true;
      pad.add(silhouette);pad.position.set(px,this.ground(px,-83),-83);
      pad.rotation.y=i?.22:-.1;this.group.add(pad);this.parked.push(pad);
    }
    // Two loaders, two mechanics, a marshaller close to the departure end and
    // walking supply parties. All positions stay on the service side.
    for(const [i,[px,pz,job]] of [[-302,-62,'load'],[-298,-62,'load'],[-324,-81,'repair'],[-351,-80,'repair'],
      [-304,-34,'signal'],[-237,-87,'carry'],[-250,-77,'carry'],[-282,-71,'walk'],
      [-127,-57,'walk'],[87,-60,'walk'],[-354,-88,'repair'],[-257,-96,'carry']].entries())
      this.crew.push({x:px,z:pz,job,phase:i*.73});
    this.people={};
    const german=this.service==='luftwaffe',coat=german?0x616963:0x62664b,pants=german?0x697176:0x8b8869;
    const body=this.crewGeometry('body',coat),head=this.crewGeometry('head',coat),limb=this.crewGeometry('limb',0xffffff),boot=this.crewGeometry('boot',0xffffff),hand=this.crewGeometry('hand',coat);
    const detailMat=()=>new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
    for(const [name,geo,material,count] of [['bodies',body,detailMat(),12],['heads',head,detailMat(),12],
      ['limbs',limb,detailMat(),48],['boots',boot,detailMat(),24],['hands',hand,detailMat(),24],['cargo',this._cube,this.mat.wood,2]]){
      const mesh=new THREE.InstancedMesh(geo,material,count);mesh.name='airfieldCrew-'+name;
      mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.people[name]=mesh;this.group.add(mesh);
    }
    for(let i=0;i<48;i++)this.people.limbs.setColorAt(i,new THREE.Color(i%2?pants:coat));
    for(let i=0;i<24;i++)this.people.boots.setColorAt(i,new THREE.Color(0x3b342c));
    for(let i=0;i<2;i++){
      const truck=new THREE.Group();
      this.box(truck,2.05,.42,5.3,this.mat.dark,0,.64,0);
      this.box(truck,1.92,1.65,1.55,this.mat.olive,0,1.6,1.45);
      this.box(truck,1.7,.5,.03,this.mat.dark,0,1.95,2.25);
      this.box(truck,1.9,1.35,2.9,i?this.mat.canvas:this.mat.metal,0,1.48,-.95);
      for(const wx of [-1.1,1.1])for(const wz of [-1.65,1.5]){
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.25,10),this.mat.rubber);
        wheel.rotation.z=Math.PI/2;wheel.position.set(wx,.46,wz);truck.add(wheel);
      }
      const merged=this.merge(truck);merged.name=i?'airfieldSupplyTruck':'airfieldFuelTruck';this.group.add(merged);
      this.trucks.push({model:merged,phase:i*43});
    }
    this.loading={x:-300,z:-64,mounted:false,progress:0,unloading:false};
    this.update(0,x,z);
  }
  crewGeometry(kind,coat){
    // Bake face, uniform pockets, cap, cuffs and boot seams into four existing
    // instanced buckets. Added detail does not add any crew draw calls.
    const parts=[],matrix=new THREE.Matrix4(),col=new THREE.Color();
    const add=(geo,scale,pos,color)=>{if(geo.index){const original=geo;geo=geo.toNonIndexed();original.dispose();}matrix.makeScale(...scale);matrix.setPosition(...pos);geo.applyMatrix4(matrix);col.setHex(color);const c=[];for(let i=0;i<geo.attributes.position.count;i++)c.push(col.r,col.g,col.b);geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));parts.push(geo);};
    const box=(scale,pos,color)=>add(new THREE.BoxGeometry(1,1,1),scale,pos,color);
    const ball=(scale,pos,color)=>add(new THREE.SphereGeometry(1,10,7),scale,pos,color);
    if(kind==='body'){
      ball([.5,.5,.5],[0,0,0],coat);box([.76,.28,.8],[0,-.34,0],coat);
      box([.82,.07,1.03],[0,-.40,0],0x4a4030);box([.15,.10,.07],[0,-.40,.54],0x979689);
      box([.035,.68,.035],[0,.05,.505],0xada98a);
      for(const side of [-1,1]){box([.25,.22,.055],[side*.27,.08,.45],coat);box([.28,.05,.055],[side*.27,.20,.48],0x85866e);box([.21,.15,.05],[side*.19,.42,.35],0xb7ad90);}
    }else if(kind==='head'){
      ball([.062,.095,.062],[0,-.18,0],0xbc9878);ball([.13,.17,.12],[0,0,0],0xbc9878);ball([.03,.04,.04],[0,-.01,.128],0xb78d6c);
      for(const side of [-1,1]){ball([.025,.045,.025],[side*.13,0,0],0xbc9878);box([.018,.012,.016],[side*.045,.035,.12],0x302c26);}
      box([.043,.009,.01],[0,-.065,.12],0x705143);ball([.144,.063,.132],[0,.13,0],coat);box([.24,.025,.19],[0,.11,.06],coat);
    }else if(kind==='limb'){
      add(new THREE.CylinderGeometry(.42,.48,1,8),[1,1,1],[0,0,0],0xffffff);box([.88,.065,.88],[0,-.36,0],0xb8b4a8);
    }else if(kind==='hand'){
      ball([.055,.085,.046],[0,0,0],0xbc9878);ball([.023,.043,.026],[.047,.01,.025],0xb78d6c);
    }else{
      box([1,.9,1],[0,0,0],0xffffff);box([1.04,.12,1.03],[0,-.43,0],0x77756f);
      for(let i=0;i<3;i++)box([.48,.045,.04],[0,.23-i*.16,.51],0xc8c0a3);
    }
    const out=new THREE.BufferGeometry();for(const name of ['position','normal','color']){const values=[];for(const g of parts)values.push(...g.attributes[name].array);out.setAttribute(name,new THREE.Float32BufferAttribute(values,3));}
    for(const g of parts)g.dispose();out.computeBoundingSphere();return out;
  }
  ground(x,z){return this.terrain.getRenderedHeight(this.x+x,this.z+z)+.08;}
  box(g,w,h,d,mat,x,y,z,name){
    const m=new THREE.Mesh(this._cube,mat);m.scale.set(w,h,d);m.position.set(x,y,z);g.add(m);
    if(name)this.parts.push({name,x,z,w,d});return m;
  }
  cylinder(g,r,h,mat,x,y,z,name){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,10),mat);m.position.set(x,y,z);g.add(m);
    if(name)this.parts.push({name,x,z,w:r*2,d:r*2});return m;
  }
  merge(g){
    const out=WorldVehicles.mergeStaticByMaterial(g);
    g.traverse(o=>{if(o.geometry&&o.geometry!==this._cube)o.geometry.dispose();});return out;
  }
  setAircraft(template,kind){
    if(!template||this.aircraftKind===kind)return;
    this.aircraftKind=kind;
    // Other aircraft receive ammunition crates at the service stand. Do not
    // fit an external bomb to a Komet or a fighter without that loadout.
    this.payload.visible=['p47','fw190','ju87'].includes(kind);
    this.time=0;
    for(const pad of this.parked){
      const old=pad.children[0];pad.remove(old);
      if(old.userData.serviceFallback)old.traverse(o=>o.geometry?.dispose());
      const model=template.clone(true),gear=model.getObjectByName('gear');if(gear)gear.visible=true;
      // The shared template owns its materials/geometries. Never dispose them.
      model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);
      pad.userData.crewBounds=box;pad.userData.crewBox=new THREE.Box3();
      pad.add(model);this.groundAircraft(pad);
      pad.userData.mountHeight=pad.position.y+box.min.y+1.8;
      if(pad===this.parked[0]&&this.payload.visible){
        pad.updateMatrixWorld(true);const mount=this.mountPoint(pad),floor=this.ground(mount.x,mount.z);
        const ray=new THREE.Raycaster(new THREE.Vector3(this.x+mount.x,floor+.25,this.z+mount.z),new THREE.Vector3(0,1,0),0,5);
        const underside=ray.intersectObject(model,true).find(hit=>hit.point.y>floor+1.1);
        if(underside)pad.userData.mountHeight=underside.point.y-.5;
      }
      pad.userData.mountOffset=pad.userData.mountHeight-pad.position.y;
    }
  }
  groundAircraft(pad){
    const model=pad.children[0];if(!model)return;
    const heading=pad.userData.heading??pad.rotation.y;pad.userData.heading=heading;
    const fit=typeof AircraftGround!=='undefined'?AircraftGround.fit(model,this.aircraftKind,
      this.x+pad.position.x,this.z+pad.position.z,heading,(x,z)=>AircraftGround.height(this.terrain,x,z)):null;
    if(fit){pad.position.y=fit.y;pad.quaternion.copy(fit.quaternion);}
    else {model.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(pad.matrixWorld).invert();
      const box=new THREE.Box3().setFromObject(model).applyMatrix4(inverse);pad.position.y=this.ground(pad.position.x,pad.position.z)-box.min.y;}
    if(pad.userData.crewBounds){pad.updateMatrix();pad.userData.crewBox.copy(pad.userData.crewBounds).applyMatrix4(pad.matrix).expandByScalar(.85);}
    if(pad.userData.mountOffset!=null)pad.userData.mountHeight=pad.position.y+pad.userData.mountOffset;
  }
  clearCrewPosition(x,z){
    // The entire aircraft footprint includes wings, tail and turning propeller.
    // Keep bodies and swinging arms outside it, including during terrain morphs.
    const boxes=this.parked.map(p=>p.userData.crewBox).filter(Boolean);
    const inside=(b,x,z)=>x>b.min.x&&x<b.max.x&&z>b.min.z&&z<b.max.z;
    if(boxes.some(b=>inside(b,x,z))){
      const exits=boxes.flatMap(b=>[{x:b.min.x,z},{x:b.max.x,z},{x,z:b.min.z},{x,z:b.max.z}])
        .filter(p=>boxes.every(b=>!inside(b,p.x,p.z)));
      exits.sort((a,b)=>(a.x-x)**2+(a.z-z)**2-((b.x-x)**2+(b.z-z)**2));
      if(exits.length){x=exits[0].x;z=exits[0].z;}
    }
    return {x,z};
  }
  startEngine(){
    const rotor=this.parked[1]?.children[0]?.getObjectByName('prop');
    if(rotor)this.engineStart={rotor,time:0};
  }
  mountPoint(pad){
    const yaw=pad.userData.heading??pad.rotation.y;
    return {x:pad.position.x+Math.cos(yaw)*3.8+Math.sin(yaw)*.6,
      z:pad.position.z-Math.sin(yaw)*3.8+Math.cos(yaw)*.6};
  }
  updateLoading(time){
    // Load on the outbound pass; the next pass removes the practice load.
    // No payload teleport at the loop boundary, and no duplicated ordnance.
    const t=time%72,unloading=Math.floor(time/72)%2===1;
    const travel=Math.max(0,Math.min(1,(t-6)/18));
    const returning=Math.max(0,Math.min(1,(t-42)/18));
    const u=travel*(1-returning),pad=this.parked[0],yaw=pad.userData.heading??pad.rotation.y;
    const end=this.mountPoint(pad),endX=end.x,endZ=end.z;
    const x=-300+(endX+300)*u,z=-64+(endZ+64)*u;
    const y=this.ground(x,z);
    this.trolley.position.set(x,y,z);
    this.trolley.rotation.y=yaw;
    const transfer=Math.max(0,Math.min(1,(t-24)/10));
    const mounted=unloading?1-transfer:transfer;
    const baseY=this.ground(endX,endZ)+.98;
    const mountY=Math.max(baseY+.55,pad.userData.mountHeight||this.ground(endX,endZ)+1.8);
    if((!unloading&&t>=34)||(unloading&&t<24))this.payload.position.set(endX,mountY,endZ);
    else if(t>=24&&t<=34)this.payload.position.set(endX,baseY+(mountY-baseY)*mounted,endZ);
    else this.payload.position.set(x,y+.98,z);
    this.payload.rotation.y=yaw;
    const jackHeight=t>=24&&t<42?Math.max(.15,this.payload.position.y-y-.70):.15;
    this.jack.position.set(x,y+.70+jackHeight*.5,z);this.jack.scale.set(.13,jackHeight,.13);
    Object.assign(this.loading,{x,z,mounted:mounted>.999,progress:mounted,unloading,
      walking:t>6&&t<24||t>42&&t<60,servicing:t>=24&&t<=42});
  }
  pose(mesh,index,x,y,z,w,h,d,yaw=0,roll=0){
    this._position.set(x,y,z);this._rotation.setFromEuler(this._euler.set(0,yaw,roll));this._scale.set(w,h,d);
    this._matrix.compose(this._position,this._rotation,this._scale);mesh.setMatrixAt(index,this._matrix);
  }
  update(dt,focusX,focusZ){
    this.group.visible=Math.hypot(focusX-this.x,focusZ-this.z)<6500;
    if(!this.group.visible)return;this.time+=dt;
    for(const pad of this.parked)if(!pad.children[0]?.userData.serviceFallback)this.groundAircraft(pad);
    const time=this.time;
    this.updateLoading(time);
    if(this.engineStart){
      const e=this.engineStart;e.time+=dt;
      const rate=Math.min(1,e.time/3)*Math.max(0,Math.min(1,(12-e.time)/3));
      e.rotor.rotation.z-=.24*rate*60*dt;
      if(e.time>12)this.engineStart=null;
    }
    this.crew.forEach((p,i)=>{
      const loader=p.job==='load',walking=loader?this.loading.walking:p.job==='walk'||p.job==='carry',a=time*.85+p.phase;
      const proposedX=loader?this.loading.x+(i===0?-1.7:1.7):p.x+(walking?Math.sin(a*.18)*9:0);
      const proposedZ=loader?this.loading.z+.6+(i===0?-.8:.8):p.z+(walking?Math.cos(a*.18)*2:0);
      const {x,z}=this.clearCrewPosition(proposedX,proposedZ),y=this.ground(x,z);
      const yaw=loader?(this.parked[0].userData.heading??this.parked[0].rotation.y):walking?(Math.cos(a*.18)>0?Math.PI/2:-Math.PI/2):Math.PI;
      p.drawX=x;p.drawZ=z;
      const stride=walking?Math.sin(time*5+p.phase)*.35:0;
      this.pose(this.people.bodies,i,x,y+1.12,z,.43,.62,.27,yaw,p.job==='repair'?.16:0);
      this.pose(this.people.heads,i,x,y+1.61,z,1,1,1,yaw);
      for(const side of [-1,1]){
        const j=i*4+(side===-1?0:2),arm=p.job==='signal'?.9+Math.sin(time*2)*.25:loader?-.5+(this.loading.servicing?Math.sin(a*2)*.22:0):p.job==='carry'?-.7:stride*side;
        this.pose(this.people.limbs,j,x+side*.29,y+1.14,z,.14,.59,.15,yaw,arm*side);
        this.people.limbs.getMatrixAt(j,this._handMatrix);this._handPosition.set(0,p.job==='signal'?.59:-.59,0).applyMatrix4(this._handMatrix);
        this.pose(this.people.hands,i*2+(side===-1?0:1),this._handPosition.x,this._handPosition.y,this._handPosition.z,1,1,1,yaw,arm*side);
        this.pose(this.people.limbs,j+1,x+side*.13,y+.48,z+stride*side*.2,.16,.75,.18,yaw,stride*side);
        this.pose(this.people.boots,i*2+(side===-1?0:1),x+side*.13,y+.11,z+stride*side*.2+.08,.18,.2,.32,yaw);
      }
    });
    for(let i=0;i<2;i++){
      const p=this.crew[[5,6][i]],x=p.drawX,z=p.drawZ;
      this.pose(this.people.cargo,i,x,this.ground(x,z)+.93,z+.38,.55,.4,.45);
    }
    for(const mesh of Object.values(this.people))mesh.instanceMatrix.needsUpdate=true;
    for(const e of this.trucks){
      const t=(time+e.phase)%150,travel=Math.min(1,Math.max(0,(t-12)/55));
      const returning=t>87,back=Math.min(1,Math.max(0,(t-87)/55));
      const x=returning?-245+back*475:230-travel*475,z=returning?-54:-49;
      e.model.position.set(x,this.ground(x,z),z);e.model.rotation.y=returning?Math.PI/2:-Math.PI/2;
    }
  }
}
