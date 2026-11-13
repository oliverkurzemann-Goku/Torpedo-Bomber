/* Secret Jet bonus sortie. The arcade scene owns its geometry and never mutates the Pacific world. */
(function(root){
 'use strict';
 const GOAL=6,MAX_HULL=4,BOOST_TIME=.65,BOOST_CYCLE=3.2;
 const LIMIT_X=54,LIMIT_Y=29,AIM_DEPTH=200;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const smoothstep=t=>t*t*(3-2*t);
 function segmentHits(from,to,previous,current,radius){
  const ax=from.x-previous.x,ay=from.y-previous.y,az=from.z-previous.z;
  const dx=to.x-current.x-ax,dy=to.y-current.y-ay,dz=to.z-current.z-az;
  const length=dx*dx+dy*dy+dz*dz;
  const t=length?clamp(-(ax*dx+ay*dy+az*dz)/length,0,1):0;
  return (ax+t*dx)**2+(ay+t*dy)**2+(az+t*dz)**2<=radius*radius;
 }
 function ascent(altitude,ceiling){
  return smoothstep(clamp((altitude-(ceiling-762))/762,0,1));
 }
 function moveAxis(position,velocity,axis,command,maxSpeed,limit,dt){
  const target=command*maxSpeed;
  const response=Math.abs(target)<Math.abs(velocity[axis])||target*velocity[axis]<0?.055:.095;
  const blend=1-Math.exp(-dt/response);
  const next=position[axis]+target*dt+(velocity[axis]-target)*response*blend;
  position[axis]=clamp(next,-limit,limit);
  velocity[axis]=next===position[axis]?velocity[axis]+(target-velocity[axis])*blend:0;
  if(!command&&Math.abs(velocity[axis])<.02)velocity[axis]=0;
 }
 function create(T,template,options={}){
  const random=options.random||Math.random,signal=options.onEvent||(()=>{});
  const range=(a,b)=>a+(b-a)*random();
  const scene=new T.Scene();scene.name='secretJetSpace';scene.background=new T.Color(0x02050e);
  scene.add(new T.HemisphereLight(0xb2d1ff,0x3f374e,1.35));
  const rim=new T.DirectionalLight(0xc2d8ff,1.6);rim.position.set(45,55,-80);scene.add(rim);
  const fill=new T.DirectionalLight(0xffbf8f,.9);fill.position.set(-40,20,50);scene.add(fill);
  const camera=new T.PerspectiveCamera(49,1,.6,2200),ship=new T.Group();ship.name='SpaceJet';
  const jet=template.clone(true);jet.rotation.y=Math.PI;ship.add(jet);scene.add(ship);
  const muzzles=['JetNoseLeft','JetNoseRight'].map(name=>jet.getObjectByName(name));
  const owned=new Set();
  const own=asset=>(owned.add(asset),asset);
  const mesh=(geometry,material)=>new T.Mesh(geometry,material);
  const material=(color,emissive=0)=>own(new T.MeshStandardMaterial({color,emissive,roughness:.65,metalness:.25}));
  const glow=(color,opacity=1)=>own(new T.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity===1,blending:opacity<1?T.AdditiveBlending:T.NormalBlending}));
  const sphere=own(new T.SphereGeometry(1,10,7));
  const drive=mesh(sphere,glow(0x777dff,.76));drive.position.set(0,0,7.7);ship.add(drive);
  const rockMaterial=material(0x79758a,0x101018),cometMaterial=material(0xacdfff,0x326294);
  const starCore=glow(0xffe1a3),starHalo=glow(0xffad57,.18),cometHalo=glow(0x86ddff,.21);
  const alienShell=material(0x424a72,0x181a37),alienTrim=material(0x9e609a,0x3d163d);
  const alienLight=glow(0xff6dba),alienGlass=material(0x181936,0x1f1549);
  const laser=glow(0xb6f8ff),enemyLaser=glow(0xff64a4),burst=glow(0xffac85,.56);
  const boltsGeometry=own(new T.BoxGeometry(.30,.30,7));
  const saucer=own(new T.CylinderGeometry(.68,1,.23,8));
  const wing=own(new T.BufferGeometry());
  wing.setAttribute('position',new T.Float32BufferAttribute([
   1,.05,3, 5,1.2,2, 12,1.4,-4,  1,.05,3, 12,1.4,-4, 5,-.10,-3,
   1,-.6,3, 12,1.4,-4, 5,.65,1,  1,-.6,3, 5,-.10,-3, 12,1.4,-4,
   1,.05,3, 1,-.6,3, 5,.65,1,  1,.05,3, 5,.65,1, 5,1.2,2
  ],3));
  wing.computeVertexNormals();
  alienShell.side=T.DoubleSide;
  const rocks=Array.from({length:4},(_,variant)=>{
   const g=own(new T.IcosahedronGeometry(1,1)),p=g.attributes.position;
   const colors=new Float32Array(p.count*3);
   for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const size=.87+.19*Math.sin(x*8+y*4+z*6+variant*2)+.14*Math.cos(z*9-y*11+variant);
    p.setXYZ(i,x*size,y*size,z*size);
    const shade=.71+.17*Math.sin(x*12+z*8+variant)+.12*Math.cos(y*9-z*6);
    colors.set([shade,shade*.96,shade*.92],i*3);
   }
   g.setAttribute('color',new T.BufferAttribute(colors,3));
   g.computeVertexNormals();return g;
  });
  rockMaterial.vertexColors=true;cometMaterial.vertexColors=true;

  const planet=mesh(own(new T.SphereGeometry(470,48,24)),own(new T.ShaderMaterial({
   vertexShader:`
    varying vec3 surface,normalView;
    void main(){
     surface=normal;
     normalView=normalize(normalMatrix*normal);
     gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
   fragmentShader:`
    varying vec3 surface,normalView;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float noise(vec3 p){
     vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
     return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
       mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
       mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
       mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
    }
    void main(){
     vec3 n=normalize(surface);
     float continents=noise(n*8.)*.67+noise(n*24.)*.23+noise(n*81.)*.10;
     float clouds=smoothstep(.57,.79,noise(n*vec3(13.,32.,13.)+vec3(0.,continents*2.,0.))*.71+noise(n*68.)*.29);
     float sun=max(0.,dot(n,normalize(vec3(-.56,.59,.36))));
     float rim=pow(1.-clamp(normalize(normalView).z,0.,1.),4.);
     vec3 ocean=mix(vec3(.014,.038,.088),vec3(.085,.23,.26),smoothstep(.41,.64,continents));
     vec3 color=(ocean+clouds*vec3(.28,.39,.44))*(.15+.85*sun);
     gl_FragColor=vec4(color+rim*vec3(.09,.41,.80)*(.35+.65*sun),1.);
    }`
  })));
  planet.name='PlanetLimb';planet.position.set(426,-470,-1200);scene.add(planet);
  const atmosphere=mesh(own(new T.SphereGeometry(481,48,24)),own(new T.ShaderMaterial({
   transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.BackSide,
   vertexShader:`varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);v=-p.xyz;n=normalMatrix*normal;gl_Position=projectionMatrix*p;}`,
   fragmentShader:`varying vec3 n,v;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),8.);gl_FragColor=vec4(.14,.48,.94,rim*.43);}`
  })));
  atmosphere.position.copy(planet.position);scene.add(atmosphere);

  let starSeed=2341;
  function backgroundRandom(min,max){
   starSeed=(Math.imul(starSeed,1664525)+1013904223)>>>0;
   return min+(max-min)*starSeed/4294967296;
  }
  const starLayers=[
   {count:1050,near:-1660,far:-2050,size:1.1,scroll:.012,name:'Starfield'},
   {count:380,near:-380,far:-850,size:1.5,scroll:.14,name:'MidfieldStars'},
   {count:140,near:-70,far:-380,size:2.0,scroll:.39,name:'NearStars'}
  ].map(layer=>{
   const data=new Float32Array(layer.count*3),colors=new Float32Array(data.length);
   for(let i=0;i<data.length;i+=3){
    const z=backgroundRandom(layer.far,layer.near);
    data.set([backgroundRandom(-1.05,1.05)*-z,backgroundRandom(-.56,.56)*-z,z],i);
    const light=backgroundRandom(.25,.91),warm=backgroundRandom(0,1)>.82;
    colors.set([light*(warm?1:.72),light*(warm?.79:.88),light*(warm?.61:1)],i);
   }
   const geometry=own(new T.BufferGeometry());
   const positions=new T.BufferAttribute(data,3).setUsage(T.DynamicDrawUsage);
   geometry.setAttribute('position',positions);geometry.setAttribute('color',new T.BufferAttribute(colors,3));
   const stars=new T.Points(geometry,own(new T.PointsMaterial({size:layer.size,sizeAttenuation:false,vertexColors:true,depthWrite:false})));
   stars.name=layer.name;stars.frustumCulled=false;scene.add(stars);
   return {...layer,data,positions,stars};
  });
  const belt=rocks.map((geometry,index)=>{
   const pebbles=new T.InstancedMesh(geometry,rockMaterial,12);pebbles.name='BeltRocks';pebbles.frustumCulled=false;
   pebbles.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(pebbles);
   const bodies=Array.from({length:12},(_,i)=>({
    side:(i+index)%2?1:-1,offset:backgroundRandom(0,100),y:backgroundRandom(-110,100),
    z:backgroundRandom(-690,15),size:backgroundRandom(1.4,8.5),spin:backgroundRandom(-1,1)
   }));
   return {pebbles,bodies};
  });
  const dummy=new T.Object3D();
  function updateBackdrop(dt){
   for(const layer of starLayers){
    const {data,near,far,scroll,positions,stars}=layer;
    for(let i=2;i<data.length;i+=3){
     data[i]+=speed*scroll*dt;
     if(data[i]>near){
      data[i]+=far-near;
      data[i-2]=backgroundRandom(-1.05,1.05)*-data[i];
      data[i-1]=backgroundRandom(-.56,.56)*-data[i];
     }
    }
    positions.needsUpdate=true;
    stars.position.set(-ship.position.x*scroll*.19,-ship.position.y*scroll*.19,0);
   }
   for(const {pebbles,bodies} of belt){
    for(let i=0;i<bodies.length;i++){
     const rock=bodies[i];
     rock.z+=speed*.72*dt;if(rock.z>28)rock.z-=718;
     dummy.position.set(rock.side*(82+rock.offset+Math.max(0,-rock.z)*.12),rock.y,rock.z);
     dummy.rotation.set(time*rock.spin+i,time*.32+i*.8,i);
     dummy.scale.set(rock.size,rock.size*.72,rock.size*.9);dummy.updateMatrix();
     pebbles.setMatrixAt(i,dummy.matrix);
    }
    pebbles.instanceMatrix.needsUpdate=true;
   }
  }

  const tailGeometry=own(new T.PlaneGeometry(2,1,1,1));
  const tail=own(new T.ShaderMaterial({
   transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,
   vertexShader:`varying vec2 trail;void main(){trail=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`
    varying vec2 trail;
    void main(){
     float age=1.-trail.y;
     float edge=abs(trail.x*2.-1.);
     float width=mix(.35,1.,age);
     float fade=(1.-smoothstep(0.,width,edge))*pow(trail.y,1.5);
     float strands=.67+.33*cos(trail.x*75.+age*16.);
     gl_FragColor=vec4(mix(vec3(.18,.55,1.),vec3(.60,.90,1.),trail.y),fade*strands*.48);
    }`
  }));

  const threats=[],shots=[],particles=[],previousShip=new T.Vector3(),look=new T.Vector3(),aim=new T.Vector3();
  const velocity=new T.Vector3(),start=new T.Vector3(),fireTarget=new T.Vector3();
  let time=0,hull=MAX_HULL,kills=0,dodged=0,status='flying',hitDelay=0,fireDelay=0;
  let rockDelay=options.retry?.8:1.8,alienDelay=options.retry?1.6:3.8,wave=0;
  let speed=135,disposed=false,boostUntil=0,boostReadyAt=0,boostX=0,boostY=0;
  const boosting=()=>time<boostUntil;
  const boostRemaining=()=>Math.max(0,boostReadyAt-time);
  function requestBoost(){
   if(status!=='flying'||disposed||boostRemaining()>0)return false;
   boostUntil=time+BOOST_TIME;boostReadyAt=time+BOOST_CYCLE;
   const length=Math.hypot(velocity.x,velocity.y);
   boostX=length>5?velocity.x/length:0;boostY=length>5?velocity.y/length:0;
   signal('boost');return true;
  }
  function targetPoint(out){return out.set(ship.position.x,ship.position.y+.3,-AIM_DEPTH);}
  updateBackdrop(0);
  function hazard(){
   const pattern=wave++%5,comet=pattern===1||pattern===3,star=pattern===4;
   const kind=star?'star':comet?'comet':'rock',size=comet?range(4.5,7):range(6,11);
   const model=new T.Group();model.name=star?'StarCore':comet?'Comet':'Asteroid';
   const core=star?mesh(sphere,starCore):mesh(rocks[Math.floor(random()*rocks.length)],comet?cometMaterial:rockMaterial);
   core.scale.set(size,star?size:size*.84,star?size:size*1.13);model.add(core);
   if(star){const halo=mesh(sphere,starHalo);halo.scale.setScalar(size*1.55);model.add(halo);}
   if(comet){
    const length=size*12;
    for(const angle of [0,Math.PI/2]){
     const trail=mesh(tailGeometry,tail);trail.scale.set(size*1.55,length,1);
     trail.rotation.order='ZXY';trail.rotation.x=Math.PI/2;trail.rotation.z=angle;
     trail.position.z=-length*.5;model.add(trail);
    }
    const coma=mesh(sphere,cometHalo);coma.scale.setScalar(size*1.19);model.add(coma);
   }
   const centre=wave%4!==0;
   model.position.set(clamp((centre?ship.position.x:0)+range(-34,34),-53,53),clamp((centre?ship.position.y:0)+range(-24,24),-27,27),-560);
   scene.add(model);
   threats.push({kind,model,core,previous:model.position.clone(),radius:size*.90,drift:range(-9,9),spin:range(-.8,.8)});
  }
  function alien(){
   const model=new T.Group();model.name='AlienShip';
   const hull=mesh(saucer,alienShell);hull.scale.set(6.5,9,6);hull.rotation.y=Math.PI/8;model.add(hull);
   const dome=mesh(sphere,alienGlass);dome.scale.set(3.4,1.9,2.8);dome.position.y=1.25;model.add(dome);
   for(const side of [-1,1]){
    const panel=mesh(wing,alienShell);panel.scale.x=side;model.add(panel);
    const fin=mesh(sphere,alienTrim);fin.position.set(side*7,.55,-.85);fin.scale.set(3.3,.36,.38);fin.rotation.y=side*.63;model.add(fin);
    const lamp=mesh(sphere,alienLight);lamp.position.set(side*4.1,.1,3.4);lamp.scale.set(1.35,.27,.43);lamp.rotation.y=side*.35;model.add(lamp);
   }
   const lane=clamp(ship.position.x+range(-31,31),-42,42),level=clamp(ship.position.y+range(-19,19),-23,23);
   model.position.set(lane,level,-510);scene.add(model);
   threats.push({kind:'alien',model,previous:model.position.clone(),radius:8.6,life:2,lane,level,phase:range(0,Math.PI*2),shotDelay:range(1.2,2.4)});
  }
  function projectile(start,velocity,hostile){
   const model=mesh(boltsGeometry,hostile?enemyLaser:laser);model.position.copy(start);model.name=hostile?'AlienBolt':'PlayerBolt';
   model.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),velocity.clone().normalize());scene.add(model);
   shots.push({model,velocity,hostile,remaining:hostile?3.8:1.65,previous:start.clone()});
  }
  function effect(at,big){
   if(particles.length>=20)return;
   const model=mesh(sphere,burst);model.position.copy(at);model.scale.setScalar(big?4.6:1.8);scene.add(model);
   particles.push({model,remaining:big?.36:.18});
  }
  function remove(list,i){scene.remove(list[i].model);list.splice(i,1);}
  function damage(){
   if(hitDelay>0)return;
   hull--;hitDelay=1.05;effect(ship.position,true);signal('damage');
   if(!hull)status='lost';
  }
  function update(dt,input={}){
   if(status!=='flying'||disposed)return;
   dt=clamp(dt,0,.05);if(!dt)return;
   time+=dt;hitDelay=Math.max(0,hitDelay-dt);fireDelay-=dt;rockDelay-=dt;alienDelay-=dt;
   const roll=clamp(input.roll||0,-1,1),pitch=clamp(input.pitch||0,-1,1),throttle=clamp(input.throttle??.75,0,1);
   previousShip.copy(ship.position);
   const boost=boosting(),moving=!!(roll||pitch),directionalBoost=boost&&(moving||boostX||boostY);
   const magnitude=Math.max(1,Math.hypot(roll,pitch)),x=moving?roll/magnitude:boostX,y=moving?pitch/magnitude:boostY;
   speed=95+85*throttle;
   moveAxis(ship.position,velocity,'x',boost?x:roll/magnitude,directionalBoost?118:63,LIMIT_X,dt);
   moveAxis(ship.position,velocity,'y',boost?y:pitch/magnitude,directionalBoost?88:46,LIMIT_Y,dt);
   const bank=1-Math.exp(-dt*9);
   ship.rotation.z+=(-velocity.x*.004-ship.rotation.z)*bank;
   ship.rotation.x+=(velocity.y*.003-ship.rotation.x)*bank;
   drive.scale.set(.65,.6,(boost?2.4:1.1)+.25*Math.sin(time*22));
   drive.position.z=7.7+drive.scale.z*.40;
   jet.visible=hitDelay===0||Math.floor(hitDelay*18)%2===0;
   updateBackdrop(dt);
   if(rockDelay<=0){if(threats.length<16)hazard();rockDelay=range(.85,1.45);}
   if(alienDelay<=0){if(threats.filter(t=>t.kind==='alien').length<3)alien();alienDelay=range(2,3.6);}
   if(input.fire&&fireDelay<=0){
    fireDelay=.14;
    targetPoint(fireTarget);
    for(let i=0;i<muzzles.length;i++){
     if(muzzles[i])muzzles[i].getWorldPosition(start);
     else ship.localToWorld(start.set(i?1.9:-1.9,.18,-7));
     projectile(start,fireTarget.clone().sub(start).normalize().multiplyScalar(660),false);
    }
    signal('fire');
   }
   for(let i=threats.length-1;i>=0;i--){
    const t=threats[i],p=t.model.position;t.previous.copy(p);
    if(t.kind==='alien'){
     p.z+=(speed*.57+30)*dt;p.x=t.lane+Math.sin(time*1.85+t.phase)*11;p.y=t.level+Math.sin(time*1.15+t.phase)*6;
     t.model.rotation.z=Math.cos(time*1.85+t.phase)*.23;
     t.shotDelay-=dt;
     if(p.z>-360&&p.z<-75&&t.shotDelay<=0){
      const velocity=ship.position.clone().sub(p).normalize().multiplyScalar(225+speed*.28);
      projectile(p.clone().addScaledVector(velocity,4/velocity.length()),velocity,true);t.shotDelay=range(1.3,2.7);
     }
    }else{
     p.z+=(speed+(t.kind==='comet'?70:0))*dt;p.x+=t.drift*dt;t.core.rotation.x+=t.spin*dt;t.core.rotation.y+=.68*dt;
     if(t.kind==='star')t.model.children[1].scale.setScalar(t.radius*(1.68+.1*Math.sin(time*5+t.spin)));
    }
    if(segmentHits(previousShip,ship.position,t.previous,p,t.radius+1.7)){damage();remove(threats,i);}
    else if(p.z>22){if(t.kind!=='alien')dodged++;remove(threats,i);}
   }
   for(let i=shots.length-1;i>=0;i--){
    const shot=shots[i],p=shot.model.position;shot.previous.copy(p);p.addScaledVector(shot.velocity,dt);shot.remaining-=dt;
    if(shot.remaining<=0||p.z>35){remove(shots,i);continue;}
    if(shot.hostile){if(segmentHits(shot.previous,p,previousShip,ship.position,2.5)){damage();remove(shots,i);}continue;}
    for(let j=threats.length-1;j>=0;j--){
     const t=threats[j];if(!segmentHits(shot.previous,p,t.previous,t.model.position,t.radius))continue;
     if(t.kind==='alien'){
      t.life--;effect(p,t.life===0);
      if(!t.life){kills++;signal('kill');remove(threats,j);}
     }
     remove(shots,i);break;
    }
   }
   for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.remaining-=dt;p.model.scale.multiplyScalar(1+dt*2);if(p.remaining<=0)remove(particles,i);}
   if(kills>=GOAL&&hull>0)status='won';
  }
  function view(aspect){
   if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix();}
   const distance=Math.max(84,145/aspect);
   camera.position.set(ship.position.x*.055,9+ship.position.y*.045,distance);
   camera.lookAt(look.set(ship.position.x*.026,1,-180));camera.updateMatrixWorld(true);
   targetPoint(aim).project(camera);
   return {x:(1+aim.x)*.5,y:(1-aim.y)*.5};
  }
  return {scene,camera,update,view,requestBoost,get boosting(){return boosting();},get boostRemaining(){return boostRemaining();},get entryVeil(){return options.retry?0:1-smoothstep(clamp(time/.83,0,1));},get status(){return status;},get hull(){return hull;},get kills(){return kills;},get dodged(){return dodged;},get time(){return time;},
   dispose(){if(disposed)return;disposed=true;scene.clear();for(const asset of owned)asset.dispose();threats.length=shots.length=particles.length=0;}};
 }
 const api={GOAL,MAX_HULL,create,segmentHits,ascent};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SecretSpace=api;
})(typeof globalThis==='undefined'?window:globalThis);
