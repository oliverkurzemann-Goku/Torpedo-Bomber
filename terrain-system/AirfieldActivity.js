// Period-inspired service activity beside the runway. Parked aircraft reuse
// existing sortie templates, and each service shares its two truck models.
class AirfieldActivity {
  static get routeLength(){return 896+14*Math.PI;}
  static routeAt(distance){
    const lap=this.routeLength,d=((distance%lap)+lap)%lap,radius=7,straight=448;
    if(d<straight)return {x:224-d,z:-48,yaw:-Math.PI/2};
    if(d<straight+Math.PI*radius){
      const a=(d-straight)/radius;
      return {x:-224-radius*Math.sin(a),z:-55+radius*Math.cos(a),yaw:-Math.PI/2-a};
    }
    const back=d-straight-Math.PI*radius;
    if(back<straight)return {x:-224+back,z:-62,yaw:Math.PI/2};
    const a=(back-straight)/radius;
    return {x:224+radius*Math.sin(a),z:-55-radius*Math.cos(a),yaw:Math.PI/2-a};
  }
  static vehicleModels={
    usaaf:['gmc-cckw-tanker','gmc-cckw-cargo'],
    luftwaffe:['opel-blitz-tanker','opel-blitz-cargo'],
    ijn:['isuzu-type94-fuel','isuzu-type94-cargo'],
  };
  static vehicleTemplates=new Map();
  static vehicleTemplate(name){
    const cache=this.vehicleTemplates;
    if(!cache.has(name)){
      const path='assets/ground-vehicles/'+name+'.glb?v=242';
      const pending=new Promise((resolve,reject)=>new THREE.GLTFLoader().load(path,g=>resolve(g.scene),undefined,reject));
      cache.set(name,pending.catch(error=>{cache.delete(name);throw error;}));
    }
    return cache.get(name);
  }
  async loadVehicleModels(){
    const files=AirfieldActivity.vehicleModels[this.service]||AirfieldActivity.vehicleModels.usaaf;
    const templates=await Promise.allSettled(files.map(file=>AirfieldActivity.vehicleTemplate(file)));
    if(this.disposed)return;
    for(const [i,result] of templates.entries()){
      const holder=this.trucks[i].model;
      if(result.status!=='fulfilled'||holder.userData.sharedVehicle)continue;
      const fallback=holder.children[0];
      holder.remove(fallback);
      fallback.traverse(o=>o.geometry?.dispose());
      holder.add(result.value.clone(true));
      holder.userData.sharedVehicle=true;
    }
  }
  constructor(terrain,x,z,options={}){
    this.service=options.service||'usaaf';
    this.maxRange=options.maxRange||6500;
    this.practiceLoading=this.service!=='ijn';
    this.terrain=terrain;this.x=x;this.z=z;this.time=0;this.aircraftKind='';
    this.group=new THREE.Group();this.group.name='airfieldActivity';
    this.group.position.set(x,0,z);this.parts=[];this.crew=[];this.parked=[];this.trucks=[];
    const mat=c=>new THREE.MeshLambertMaterial({color:c});
    this.mat={olive:mat(0x535942),canvas:mat(0x8a8064),wood:mat(0x69523c),
      dark:mat(0x272c29),rubber:mat(0x171a19),metal:mat(0x7b8074)};
    this._cube=new THREE.BoxGeometry(1,1,1);this._matrix=new THREE.Matrix4();
    this._position=new THREE.Vector3();this._rotation=new THREE.Quaternion();this._scale=new THREE.Vector3();this._bodyMatrix=new THREE.Matrix4();this._jointPosition=new THREE.Vector3();this._ankle=new THREE.Vector3();this._legDirection=new THREE.Vector3();this._yaw=new THREE.Quaternion();
    this._euler=new THREE.Euler();
    this._up=new THREE.Vector3(0,1,0);this._down=new THREE.Vector3(0,-1,0);
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
    if(!this.practiceLoading){
      payload.clear();bomb.geometry.dispose();
      this.box(payload,.72,.48,.55,this.mat.wood,0,-.22,0);
    }
    this.payload=this.merge(payload);this.payload.name=this.practiceLoading?'serviceBomb':'serviceCrate';this.group.add(this.payload);
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
    const figure=CrewFigures.create(THREE,{service:this.service,role:'groundCrew',variant:this.service==='ijn'?1:this.service==='luftwaffe'?2:0,srgbOutput:options.srgbOutput});
    const {arms,legs,head,hands,shins}=figure.userData,arm=arms[0],hand=hands[0],leg=legs[0],shin=shins[0],boot=shin.getObjectByName('leftBoot');
    const hipHeight=leg.parent.position.y,headOffset=head.position.clone();
    const wrist=arm.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
    const bake=(node,omit)=>CrewFigures.bake(THREE,node,omit);
    const bootGeometry=bake(boot);bootGeometry.computeBoundingBox();
    this.crewRig={hipHeight,headOffset,wrist,shoulder:arm.position.clone(),hipOffset:Math.abs(leg.position.x),
      legLength:-shin.position.y-boot.position.y,soleOffset:-bootGeometry.boundingBox.min.y};
    const cloth=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    const body=bake(figure,[...arms,...legs,head]).translate(0,-hipHeight,0);
    const sections=[['bodies',body,cloth,12],['heads',bake(head),cloth,12],['arms',bake(arm,[hand]),cloth,24],
      ['legs',bake(leg,[boot]),cloth,24],['boots',bootGeometry,cloth,24],['hands',bake(hand),cloth,24],['cargo',this._cube,this.mat.wood,2]];
    for(const [name,geometry,material,count] of sections){
      const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name='airfieldCrew-'+name;
      mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.people[name]=mesh;this.group.add(mesh);
    }
    CrewFigures.dispose(figure);
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
      const holder=new THREE.Group();holder.name=i?'airfieldSupplyTruck':'airfieldFuelTruck';
      holder.add(this.merge(truck));this.group.add(holder);
      this.trucks.push({model:holder,phase:i*AirfieldActivity.routeLength/2});
    }
    this.loading={x:-300,z:-64,mounted:false,progress:0,unloading:false};
    this.update(0,x,z);
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
    this.payload.visible=!this.practiceLoading||['p47','fw190','ju87'].includes(kind);
    this.time=0;
    for(const pad of this.parked){
      const old=pad.children[0];pad.remove(old);
      if(old.userData.serviceFallback)old.traverse(o=>o.geometry?.dispose());
      const model=template.clone(true),gear=model.getObjectByName(kind==='zero'?'zeroGear':'gear');if(gear)gear.visible=true;
      // The shared template owns its materials/geometries. Never dispose them.
      model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);
      pad.userData.crewBounds=box;pad.userData.crewBox=new THREE.Box3();
      pad.add(model);this.groundAircraft(pad);
      pad.userData.mountHeight=pad.position.y+box.min.y+1.8;
      if(pad===this.parked[0]&&this.practiceLoading&&this.payload.visible){
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
    // Parked aircraft are stationary. Refitting every tyre vertex five times
    // per frame was far more expensive than the crew animation. Refit only
    // when the actual terrain under the entire aircraft changes or a model swaps.
    const x=this.x+pad.position.x,z=this.z+pad.position.z;
    let revision='';
    for(const dx of [-64,64])for(const dz of [-64,64]){
      const tile=this.terrain.tiles.get(Math.floor((x+dx)/4000)+','+Math.floor((z+dz)/4000));
      revision+=(tile?.surfaceRevision||0)+':';
    }
    if(!this._groundFits)this._groundFits=new WeakMap();
    const cache=this._groundFits.get(pad);
    if(cache&&cache.model===model&&cache.revision===revision&&cache.x===x&&cache.z===z&&cache.heading===heading)return;
    const fit=typeof AircraftGround!=='undefined'?AircraftGround.fit(model,this.aircraftKind,
      this.x+pad.position.x,this.z+pad.position.z,heading,(x,z)=>AircraftGround.height(this.terrain,x,z)):null;
    if(fit){pad.position.y=fit.y;pad.quaternion.copy(fit.quaternion);}
    else {model.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(pad.matrixWorld).invert();
      const box=new THREE.Box3().setFromObject(model).applyMatrix4(inverse);pad.position.y=this.ground(pad.position.x,pad.position.z)-box.min.y;}
    if(pad.userData.crewBounds){pad.updateMatrix();pad.userData.crewBox.copy(pad.userData.crewBounds).applyMatrix4(pad.matrix).expandByScalar(.85);}
    if(pad.userData.mountOffset!=null)pad.userData.mountHeight=pad.position.y+pad.userData.mountOffset;
    this._groundFits.set(pad,{model,revision,x,z,heading});
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
    if(!this.practiceLoading){
      this.payload.position.set(x,y+.98,z);this.payload.rotation.y=yaw;this.jack.visible=false;
      Object.assign(this.loading,{x,z,walking:t>6&&t<24||t>42&&t<60,servicing:t>=24&&t<=42});
      return;
    }
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
  pose(mesh,index,x,y,z,w,h,d,yaw=0,pitch=0){
    this._position.set(x,y,z);this._rotation.setFromEuler(this._euler.set(pitch,yaw,0,'YXZ'));this._scale.set(w,h,d);
    this._matrix.compose(this._position,this._rotation,this._scale);mesh.setMatrixAt(index,this._matrix);
  }
  update(dt,focusX,focusZ,options={}){
    this.group.visible=Math.hypot(focusX-this.x,focusZ-this.z)<this.maxRange;
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
      const {hipHeight,headOffset,wrist,shoulder,hipOffset,soleOffset,legLength}=this.crewRig;
      const pitch=p.job==='repair'?.14:0;
      this.pose(this.people.bodies,i,x,y+hipHeight,z,1,1,1,yaw,pitch);
      this._bodyMatrix.copy(this._matrix);
      const joint=this._jointPosition.copy(headOffset).applyMatrix4(this._bodyMatrix);
      this.pose(this.people.heads,i,joint.x,joint.y,joint.z,1,1,1,yaw,pitch);
      this._yaw.setFromAxisAngle(this._up,yaw);
      for(const side of [-1,1]){
        const signal=p.job==='signal'&&options.launching&&side===1;
        const j=i*2+(side===-1?0:1),mirror=-side;
        let armRotation=stride*side;
        if(signal)armRotation=-2.1-Math.sin(time*3)*.2;
        else if(loader)armRotation=-.5+(this.loading.servicing?Math.sin(a*2)*.22:0);
        else if(p.job==='carry')armRotation=-.7;
        else if(p.job==='repair'&&side===1)armRotation=-.54+Math.sin(a*2.4)*.26;
        joint.set(side*Math.abs(shoulder.x),shoulder.y,shoulder.z).applyMatrix4(this._bodyMatrix);
        this.pose(this.people.arms,j,joint.x,joint.y,joint.z,mirror,1,1,yaw,pitch+armRotation);
        joint.copy(wrist).applyMatrix4(this._matrix);
        this.pose(this.people.hands,j,joint.x,joint.y,joint.z,mirror,1,1,yaw,pitch+armRotation);
        // Point each trouser leg at its actual boot, including on uneven ground.
        const step=stride*side,forward=step*.40;
        joint.set(side*hipOffset,0,0).applyQuaternion(this._yaw);
        const footX=x+joint.x+Math.sin(yaw)*forward,footZ=z+joint.z+Math.cos(yaw)*forward;
        const ankle=this._ankle.set(footX,this.ground(footX,footZ)+soleOffset+Math.max(0,step)*.15,footZ);
        this.pose(this.people.boots,j,ankle.x,ankle.y,ankle.z,mirror,1,1,yaw);
        const hip=this._position.set(x+joint.x,y+hipHeight,z+joint.z),direction=this._legDirection.copy(ankle).sub(hip);
        this._scale.set(mirror,direction.length()/legLength,1);
        direction.applyAxisAngle(this._up,-yaw).normalize();
        this._rotation.setFromUnitVectors(this._down,direction).premultiply(this._yaw);
        this._matrix.compose(hip,this._rotation,this._scale);this.people.legs.setMatrixAt(j,this._matrix);
      }
    });
    for(let i=0;i<2;i++){
      const p=this.crew[[5,6][i]],x=p.drawX,z=p.drawZ;
      this.pose(this.people.cargo,i,x,this.ground(x,z)+.93,z+.38,.55,.4,.45);
    }
    for(const mesh of Object.values(this.people))mesh.instanceMatrix.needsUpdate=true;
    for(const e of this.trucks){
      const {x,z,yaw}=AirfieldActivity.routeAt(time*4.2+e.phase);
      e.model.position.set(x,this.ground(x,z),z);e.model.rotation.y=yaw;
    }
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.group.parent?.remove(this.group);
    for(const pad of this.parked)if(!pad.children[0]?.userData.serviceFallback)pad.clear();
    for(const e of this.trucks)if(e.model.userData.sharedVehicle)e.model.clear();
    const geometry=new Set([this._cube]),materials=new Set(Object.values(this.mat));
    this.group.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)materials.add(o.material);});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
}
