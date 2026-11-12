'use strict';
const meshes = [];
const measure = {span:14.25, prop:2.60, track:3.40, wheelDiameter:.50, wheelWidth:.18, tailSpan:4.75, incidence:2+20/60, dihedral:.5, parkedPitch:13.5};
// Coordinates in metres. X is span, Y runs aft, Z is height above the main
// wheel datum. Stations below were measured from the C-2 three-view, not the old mesh.
const add = (name, material, vertices, faces) => meshes.push({name, material, vertices, faces});
const range = (n, f) => Array.from({length:n}, (_,i) => f(i));
const mix = (a,b,t) => a+(b-a)*t;
function vsub(a,b){return a.map((v,i)=>v-b[i]);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(a){const length=Math.hypot(...a); return a.map(v=>v/length);}
function linkSections(name, material, sections, caps=true){
  const n=sections[0].length, faces=[];
  for(let j=1;j<sections.length;j++) for(let i=0;i<n;i++)
    faces.push([(j-1)*n+i,(j-1)*n+(i+1)%n,j*n+(i+1)%n,j*n+i]);
  if(caps){faces.push(range(n,i=>n-1-i));faces.push(range(n,i=>(sections.length-1)*n+i));}
  add(name,material,sections.flat(),faces);
}
function fuselage(name, stations, material, shape){
  const ring = ([y,w,lo,hi]) => range(24,i=>{
    const a=i/24*Math.PI*2, cs=Math.cos(a), sn=Math.sin(a);
    return [w*Math.sign(cs)*Math.abs(cs)**shape,y,(hi+lo)/2+(hi-lo)/2*Math.sign(sn)*Math.abs(sn)**shape];
  });
  linkSections(name,material,stations.map(ring));
}
function rod(name,a,b,ra,rb,material,n=10){
  const along=unit(vsub(b,a)), right=unit(cross(along,Math.abs(along[2])<.9?[0,0,1]:[0,1,0])), up=cross(along,right);
  const section=(p,r)=>range(n,i=>p.map((v,k)=>v+r*(right[k]*Math.cos(i/n*2*Math.PI)+up[k]*Math.sin(i/n*2*Math.PI))));
  linkSections(name,material,[section(a,ra),section(b,rb)]);
}
function ellipsoid(name,center,radii,material){
  const rings=range(11,j=>{
    const a=Math.PI*(j+.001)/10.002;
    return range(24,i=>{
      const b=2*Math.PI*i/24;
      return [center[0]+radii[0]*Math.sin(a)*Math.cos(b),center[1]+radii[1]*Math.sin(a)*Math.sin(b),center[2]+radii[2]*Math.cos(a)];
    });
  });
  linkSections(name,material,rings);
}
function quad(name,material,vertices){add(name,material,vertices,[[0,1,2,3]]);}
function doorPart(from){for(const mesh of meshes.slice(from)) mesh.door=true;}
fuselage('Argus cowling',[
 [.425,.21,1.48,1.97],[.49,.32,1.35,2.00],[.59,.423,1.31,2.03],
 [.73,.447,1.30,2.05],[1.04,.455,1.29,2.09],[1.44,.464,1.29,2.15],
 [1.72,.435,1.29,2.20],[1.78,.42,1.30,2.20],
],'metal',.57);
fuselage('Steel tube and fabric fuselage',[
 [1.77,.427,1.29,2.20],[1.99,.435,1.31,2.05],
 [2.22,.469,1.29,1.96],[2.65,.512,1.24,1.97],
 [3.18,.530,1.21,1.99],[3.74,.525,1.23,1.98],
 [4.10,.494,1.25,1.99],[4.42,.456,1.28,2.37],[4.59,.424,1.30,2.40],
 [5.28,.367,1.38,2.40],[6.08,.291,1.48,2.41],[6.91,.222,1.58,2.41],
 [7.71,.145,1.71,2.40],[8.51,.106,1.85,2.39],[8.92,.076,1.98,2.33],
 [9.38,.040,2.13,2.29],[9.50,.018,2.20,2.24],
],'fabric',.70);
fuselage('Air inlet surround',[[.397,.15,1.53,1.73],[.44,.205,1.49,1.78],[.48,.22,1.48,1.80]],'metal',.48);
ellipsoid('Oval air intake',[0,.397,1.634],[.132,.012,.058],'inlet');
rod('Propeller hub',[0,.300,1.79],[0,.465,1.79],.104,.088,'hub',24);
ellipsoid('Propeller boss',[0,.305,1.79],[.102,.073,.102],'hub');

const frames=[
 {y:1.80,b:.393,bl:1.99,t:.355,tl:2.22,r:2.34},
 {y:2.27,b:.53,bl:1.98,t:.481,tl:2.67,r:2.79},
 {y:2.90,b:.586,bl:1.94,t:.490,tl:2.69,r:2.81},
 {y:3.47,b:.604,bl:1.95,t:.480,tl:2.66,r:2.77},
 {y:3.97,b:.562,bl:1.99,t:.422,tl:2.59,r:2.68},
 {y:4.41,b:.442,bl:2.03,t:.319,tl:2.50,r:2.63},
];
const section = (p,s) => [[s*p.b,p.y,p.bl],[s*p.t,p.y,p.tl],[0,p.y,p.r]];
for (const s of [-1,1]){
  const shape=frames.map(p=>section(p,s));
  for(let i=1;i<shape.length;i++){
    const [a,b]=[shape[i-1],shape[i]];
    for(let j=0;j<2;j++){
      const patch=[a[j],b[j],b[j+1],a[j+1]];
      if(i===1&&j===0) patch[0]=[s*.342,1.80,1.99];
      const paneStart=meshes.length;
      quad(i===1?'Windshield':'Cabin glazing','glass',patch);
      rod('Glazing longeron',a[j],b[j],.018,.016,'frame',8);
      if(s<0&&i===3&&j===0) doorPart(paneStart);
      if(i===shape.length-1) rod('Aft glazing frame',b[j],b[j+1],.016,.015,'frame',8);
    }
    const sill = ([x,y]) => [Math.sign(x)*Math.min(.438,Math.abs(x)*.94),y,1.466];
    quad('Cabin sill skin','fabric',[a[0],b[0],sill(b[0]),sill(a[0])]);
    const mullionStart=meshes.length;
    rod('Window mullion',a[0],a[1],.018,.017,'frame',8);
    if(s<0&&i===4) doorPart(mullionStart);
    rod('Roof frame',a[1],a[2],.014,.012,'frame',8);
  }
  quad('Aft glazing','glass',[shape.at(-1)[0],[0,4.51,2.385],[0,4.48,2.60],shape.at(-1)[1]]);
  if(s===1) for(const [y,z] of [[2.42,2.05],[3.14,2.02]]) {
    ellipsoid('Seat cushion',[0,y,z],[.235,.17,.048],'seat');
    rod('Seat back',[0,y+.128,z+.06],[0,y+.14,z+.35],.16,.145,'seat',12);
  }
}
quad('Windshield lower pane','glass',[[.394,1.80,1.99],[-.394,1.80,1.99],[-.351,1.80,2.225],[.351,1.80,2.225]]);
quad('Windshield upper panes','glass',[[.351,1.80,2.225],[-.351,1.80,2.225],[-.471,2.27,2.670],[.471,2.27,2.670]]);
rod('Windshield center post',[0,1.80,2.19],[0,2.28,2.805],.021,.018,'frame',8);
fuselage('Instrument coaming',[[1.94,.36,1.87,2.01],[2.06,.365,1.91,2.075]],'inlet',.72);
rod('Stick',[0,2.50,1.97],[0,2.41,2.28],.018,.018,'inlet',8);
rod('Cabin aerial mast',[0,3.21,2.78],[0,3.32,3.54],.026,.012,'frame',8);
fuselage('Cabin roof and wing centre',[[2.26,.375,2.71,2.79],[2.50,.476,2.69,2.82],[3.35,.467,2.66,2.80],[3.88,.369,2.60,2.72]],'metal',.62);

function foil(name,material, stations, sign, ratio, camber){
  // Smooth analytic thickness profile lofted between dimensioned span stations.
  const pts=stations.map(([s,le,te,h])=>range(32,i=>{
    const u=(1-Math.cos(i/16*Math.PI))/2, c=te-le;
    const curve=5*ratio*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u**3-.1036*u**4);
    return [s*sign,le+c*u,h + camber*Math.sin(u*Math.PI)*c + c*(i<16?1:-1)*curve];
  }));
  linkSections(name,material,pts);
}
const tilt=Math.tan(measure.incidence*Math.PI/180), rise=Math.tan(measure.dihedral*Math.PI/180);
const height = (x,y)=>2.77+rise*(x-.55)-tilt*(y-2.34);
for(const sign of [-1,1]){
  foil('Main wing','wing',[
    [.54,2.327,3.692],[.75,2.307,3.696],[2.04,2.295,3.696],
    [4.16,2.295,3.694],[6.49,2.304,3.688],[6.84,2.339,3.666],
    [7.036,2.46,3.56],[7.113,2.66,3.31],[measure.span/2,2.89,2.98],
  ].map(([x,a,b])=>[x,a,b,height(x,a)]),sign,.174,.035);
  foil('Fixed slat','slat',[
    [.58,2.111,2.302],[.70,2.105,2.292],[4.12,2.078,2.288],
    [6.75,2.11,2.304],[6.916,2.17,2.335],
  ].map(([x,a,b])=>[x,a,b,height(x,a)+.013]),sign,.24,.015);
  for(const x of [1,2.48,3.92,5.33,6.72])
    rod('Slat bracket',[sign*x,2.185,height(x,2.22)-.018],[sign*x,2.382,height(x,2.22)-.010],.017,.021,'frame',8);
  foil('Inboard slotted flap','control',[
    [.627,3.663,4.064],[.83,3.66,4.068],[3.90,3.66,4.061],[3.941,3.66,4.055],
  ].map(([x,a,b])=>[x,a,b,height(x,a)-.023]),sign,.24,.018);
  foil('Outboard slotted aileron','control',[
    [3.965,3.665,3.965],[4.84,3.665,3.965],[4.96,3.665,4.06],
    [6.44,3.657,4.055],[6.78,3.61,3.97],[7.009,3.53,3.77],
  ].map(([x,a,b])=>[x,a,b,height(x,a)-.023]),sign,.22,.016);
  const axle=[sign*measure.track/2,2.14,.25];
  const p=[sign*.631,2.50,2.706], knee=axle.map((v,i)=>mix(v,p[i],.55));
  rod('Main oleo piston',axle,p,.061,.044,'metal');
  rod('Shock-absorber cylinder',axle.map((v,i)=>mix(v,p[i],.24)),knee,.086,.086,'metal');
  rod('Forward axle link',[sign*.20,1.84,1.225],axle,.036,.043,'frame');
  rod('Rear axle link',[sign*.24,3.12,1.209],axle,.041,.039,'frame');
  rod('Forward wing strut',[sign*.47,2.046,1.403],[sign*3.44,2.701,2.743],.039,.046,'metal');
  rod('Aft wing strut',[sign*.47,2.046,1.403],[sign*3.44,3.555,2.714],.035,.041,'metal');
  rod('Jury strut',[sign*1.96,2.382,2.105],[sign*1.98,2.674,2.733],.023,.021,'frame');
  const r=measure.wheelDiameter/2,w=measure.wheelWidth;
  linkSections('Main tyre','rubber',[
    [-w/2,.179],[-.080,.211],[-.061,.241],[-.034,r],[.034,r],[.061,.241],[.080,.211],[w/2,.179],
  ].map(([x,rr])=>range(40,i=>{const a=i*2*Math.PI/40;return [axle[0]+x,axle[1]+rr*Math.cos(a),axle[2]+rr*Math.sin(a)];})));
  rod('Wheel hub',[axle[0]-.094,axle[1],axle[2]],[axle[0]+.094,axle[1],axle[2]],.116,.116,'hub',28);
  for(const y of [.75,.95,1.13,1.32])
    rod('Exhaust stub',[sign*.402,y,1.55],[sign*.485,y+.073,1.49],.034,.029,'exhaust',10);
  rod('Cabin step',[sign*.504,2.88,1.44],[sign*.68,2.88,1.38],.018,.017,'frame',8);
  rod('Cabin step',[sign*.68,2.73,1.37],[sign*.68,3.01,1.39],.017,.017,'frame',8);
  foil('Fixed horizontal stabilizer','control',[
    [.10,7.826,8.567,2.31],[.82,8.055,8.568,2.31],[1.31,8.215,8.574,2.31],[1.58,8.294,8.575,2.31],
  ],sign,.125,.008);
  foil('Rounded elevator','control',[
    [.12,8.590,8.74,2.31],[.27,8.577,9.00,2.31],[.59,8.575,9.235,2.31],
    [.98,8.573,9.335,2.31],[1.35,8.565,9.351,2.31],[1.58,8.558,9.312,2.31],
    [1.62,8.44,9.30,2.31],[1.93,8.437,9.176,2.31],[2.17,8.48,9.025,2.31],[2.30,8.55,8.88,2.31],
    [measure.tailSpan/2,8.67,8.717,2.31],
  ],sign,.11,.006);
  rod('Tail brace',[0,8.54,1.91],[sign*1.34,8.54,2.30],.020,.019,'frame',8);
}

function fin(name,stations,material){
  // Fin stations encode height, leading and trailing positions, and half-width.
  linkSections(name,material,stations.map(([z,le,te,w])=>range(24,i=>{
    const a=i*2*Math.PI/24;
    return [w*Math.sin(a),mix(le,te,(1-Math.cos(a))/2),z];
  })));
}
fin('Fin',[[2.16,7.88,8.796,.047],[2.39,7.90,8.794,.073],[2.69,8.05,8.791,.069],
 [3.02,8.19,8.791,.061],[3.28,8.31,8.789,.052],[3.34,8.37,8.789,.046]],'control');
fin('Rudder',[[2.00,8.78,9.00,.032],[2.14,8.80,9.36,.040],[2.28,8.81,9.62,.055],
 [2.46,8.81,9.67,.056],[2.74,8.81,9.65,.056],[3.02,8.81,9.59,.051],[3.28,8.81,9.48,.047],
 [3.34,8.38,9.44,.042],[3.49,8.43,9.32,.039],[3.62,8.52,9.23,.034],[3.73,8.63,9.10,.031],
 [3.795,8.77,8.98,.023],[3.81,8.86,8.906,.009]],'control');
rod('Tail skid oleo',[0,8.45,2.07],[0,8.61,1.59],.050,.045,'metal');
rod('Tail skid forward link',[0,8.055,1.87],[0,8.61,1.57],.027,.029,'frame');
fuselage('Spring-loaded tail skid',[
 [8.46,.02,1.58,1.631],[8.51,.061,1.549,1.597],[8.65,.068,1.527,1.57],[8.76,.061,1.55,1.589],[8.82,.037,1.58,1.616],
],'hub',.68);
for(const sign of [-1,1]){
  const a=17*Math.PI/180;
  const blade=[[.086,.053,.038],[.21,.093,.044],[.42,.103,.035],[.68,.097,.027],
    [.94,.084,.018],[1.15,.055,.013],[1.266,.032,.011],[measure.prop/2,.006,.005]];
  linkSections('Two-blade Schwarz propeller','prop',blade.map(([r,c,t])=>range(16,i=>{
    const phi=2*Math.PI*i/16, delta=c*Math.cos(phi), sweep=.048*(r/1.30)**1.7;
    return [sign*(r*Math.sin(a)+(sweep+delta)*Math.cos(a)),.298 + t*Math.sin(phi)+delta*.28,
      1.79+sign*(r*Math.cos(a)-(sweep+delta)*Math.sin(a))];
  })));
}
// Calibrate the foremost boss to the 9.670 m level datum in Anlage 2.
// The taper returns to the unchanged firewall station.
for(const m of meshes) {
  if(m.name==='Argus cowling'||m.name==='Air inlet surround'||m.name==='Oval air intake'||m.name==='Exhaust stub') {
    for(const v of m.vertices) v[1]-=.232*Math.max(0,(1.78-v[1])/(1.78-.425));
  } else if(m.material==='prop'||m.name==='Propeller hub'||m.name==='Propeller boss') {
    for(const v of m.vertices) v[1]-=.232;
  }
}
module.exports = { measure, meshes };
