/* A6M: separate the existing canopy UV islands; retain the original painted frames.
 * Coordinates refer only to the shipped a6m_lowpoly_texture model. */
(function(root){
 'use strict';
 const T=root.THREE;
 function apply(model){
  if(model.userData.zeroCanopy)return;
  let body=null;model.traverse(o=>{if(o.isMesh&&o.material?.name==='a6m_lowpoly_texture'&&o.geometry.index?.count>1500)body=o;});
  if(!body)throw Error('Expected A6M fuselage for canopy');
  const original=body.geometry,uv=original.attributes.uv,index=original.index,panes=[],skin=[];
  const island=i=>{const u=uv.getX(i)*1024,v=uv.getY(i)*1024;
   return u>35&&u<101&&v>525&&v<728 || u>425&&u<641&&v>436&&v<500;};
  for(let i=0;i<index.count;i+=3){const tri=[index.getX(i),index.getX(i+1),index.getX(i+2)];(tri.every(island)?panes:skin).push(...tri);}
  if(panes.length!==56*3)throw Error('A6M canopy layout changed: '+panes.length/3);
  body.geometry=original.clone();body.geometry.setIndex(skin);
  const indexed=original.clone();indexed.setIndex(panes);const geometry=indexed.toNonIndexed();indexed.dispose();
  const frameMat=body.material.clone();frameMat.name='Zero original canopy frames';
  frameMat.alphaMap=frameMat.map;frameMat.alphaTest=.24;frameMat.transparent=false;frameMat.opacity=1;frameMat.side=T.DoubleSide;
  const frames=new T.Mesh(geometry,frameMat);frames.name='zeroCanopyFrames';frames.castShadow=true;body.add(frames);
  const glass=new T.Mesh(geometry,new T.MeshStandardMaterial({name:'Zero clear canopy glass',color:0x9db9c2,
   transparent:true,opacity:.18,depthWrite:false,roughness:.10,metalness:.08,side:T.DoubleSide}));
  glass.name='zeroCanopyGlass';glass.renderOrder=2;body.add(glass);
  const cockpit=new T.Group();cockpit.name='zeroCockpitInterior';body.add(cockpit);
  const material=c=>{const m=new T.MeshStandardMaterial({color:c,roughness:.86});m.color.convertSRGBToLinear();return m;};
  const green=material(0x353e2d),leather=material(0x4b3828);
  const box=(name,size,p,mat)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.name=name;m.position.set(...p);cockpit.add(m);return m;};
  box('zeroCockpitFloor',[.43,.045,1.45],[0,.38,1.05],green);
  for(const s of [-1,1])box('zeroCockpitSide',[.035,.16,1.22],[s*.22,.46,1.03],green);
  box('zeroSeat',[.30,.055,.31],[0,.46,.88],leather);box('zeroSeatBack',[.30,.31,.045],[0,.59,.70],leather);
  box('zeroInstrumentPanel',[.39,.17,.045],[0,.57,1.65],material(0x1b2220));
  const pilot=root.CrewVisuals.create(T,{service:'ijn',srgbOutput:true});pilot.name='zeroSeatedPilot';pilot.scale.setScalar(.46);pilot.position.set(0,.04,.94);
  for(const leg of pilot.userData.legs)leg.rotation.x=-1.35;
  for(const arm of pilot.userData.arms)arm.rotation.x=-.85;
  pilot.userData={service:'ijn'};cockpit.add(pilot);
  model.userData.zeroCanopy={triangles:56,glassOpacity:.18};
 }
 root.ZeroCanopy={apply};if(typeof module==='object'&&module.exports)module.exports=root.ZeroCanopy;
})(typeof window==='undefined'?globalThis:window);
