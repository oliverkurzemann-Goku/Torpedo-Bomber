// Visual ground stance from the actual tyre/skid vertices. Flight state and
// airborne model alignment remain independent of this rendered-ground pose.
const AircraftGround={
  height(terrain,x,z){
    let offset=0;
    for(const r of terrain.airfieldGroundRegions||[])if(x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ)offset=Math.max(offset,r.offset);
    return terrain.getRenderedHeight(x,z)+offset+.02;
  },
  supports(model,kind){
    if(model.userData.groundSupports)return model.userData.groundSupports;
    model.updateWorldMatrix(true,true);
    const inverse=new THREE.Matrix4().copy(model.matrixWorld).invert(),point=new THREE.Vector3(),wheels=[];
    const visible=o=>{for(let p=o;p&&p!==model;p=p.parent)if(!p.visible)return false;return true;};
    const vertices=o=>{
      const p=o.geometry.attributes.position,m=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),out=[];
      const ids=o.geometry.index?new Set(o.geometry.index.array):Array.from({length:p.count},(_,i)=>i);
      for(const i of ids){point.fromBufferAttribute(p,i);
        if(p.normalized){const div=p.array instanceof Int16Array?32767:p.array instanceof Uint16Array?65535:p.array instanceof Int8Array?127:255;
          point.set(Math.max(-1,point.x/div),Math.max(-1,point.y/div),Math.max(-1,point.z/div));}
        point.applyMatrix4(m);out.push(point.x,point.y,point.z);
      }return out;
    };
    model.traverse(o=>{if(o.isMesh&&visible(o)&&o.userData.groundWheel)wheels.push(vertices(o));});
    if(wheels.length===3)return model.userData.groundSupports=wheels;
    // Original fixed-wheel GLBs (Stuka) and simple stand-ins have no generated
    // tyre tags. Locate the low support in each main-wheel and small-wheel zone.
    const points=[];model.traverse(o=>{if(o.isMesh&&visible(o))for(const v of vertices(o))points.push(v);});
    if(!points.length)return [];
    const box=new THREE.Box3();for(let i=0;i<points.length;i+=3)box.expandByPoint(point.fromArray(points,i));
    const size=box.getSize(new THREE.Vector3()),jet=kind==='me262'||kind==='b24';
    const zones=[p=>p.x<-size.x*.04&&p.x>-size.x*.32&&p.z>box.min.z+size.z*.3&&p.z<box.min.z+size.z*.8,
      p=>p.x>size.x*.04&&p.x<size.x*.32&&p.z>box.min.z+size.z*.3&&p.z<box.min.z+size.z*.8,
      p=>Math.abs(p.x)<size.x*.10&&(jet?p.z>box.min.z+size.z*.8:p.z<box.min.z+size.z*.25)];
    // A skid spans a narrow runner rather than a pair of tyres.
    if(kind==='me163'){
      const runner=model.getObjectByName('gear');
      if(runner){const b=new THREE.Box3();runner.traverse(o=>{if(o.isMesh&&visible(o)){
        const v=vertices(o);for(let i=0;i<v.length;i+=3)b.expandByPoint(point.fromArray(v,i));
      }});return model.userData.groundSupports=[
        [b.min.x,b.min.y,b.min.z],[b.max.x,b.min.y,b.min.z],[(b.min.x+b.max.x)/2,b.min.y,b.max.z]];}
    }
    for(const zone of zones){let low=null;
      for(let i=0;i<points.length;i+=3){point.fromArray(points,i);if(zone(point)&&(!low||point.y<low.y))low=point.clone();}
      if(low)wheels.push(low.toArray());
    }
    return model.userData.groundSupports=wheels;
  },
  fit(model,kind,x,z,heading,height){
    const supports=this.supports(model,kind);if(supports.length!==3)return null;
    const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
    const p=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),tilt=new THREE.Quaternion(),contacts=[];
    // Each tyre uses its real lowest vertex after rotation, rather than a
    // rotated bounding-box corner that would hold the wheel above the soil.
    const sample=()=>supports.map(vertices=>{let low=null;
      for(let i=0;i<vertices.length;i+=3){p.fromArray(vertices,i).applyQuaternion(q);if(!low||p.y<low.y)low=p.clone();}
      return low;
    });
    for(let iteration=0;iteration<5;iteration++){
      const c=sample(),d=c.map(p=>height(x+p.x,z+p.z)-p.y);
      const ax=c[1].x-c[0].x,az=c[1].z-c[0].z,bx=c[2].x-c[0].x,bz=c[2].z-c[0].z,det=ax*bz-bx*az;
      if(Math.abs(det)<1e-6)break;
      const a=((d[1]-d[0])*bz-(d[2]-d[0])*az)/det,b=(ax*(d[2]-d[0])-bx*(d[1]-d[0]))/det;
      tilt.setFromUnitVectors(up,p.set(-a,1,-b).normalize());q.premultiply(tilt);
    }
    contacts.push(...sample());
    const y=contacts.reduce((sum,p)=>sum+height(x+p.x,z+p.z)-p.y,0)/3;
    return {y,quaternion:q,contacts};
  }
};
