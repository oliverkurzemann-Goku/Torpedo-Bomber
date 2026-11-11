'use strict';

// Authoring frame, in metres: +Y up, +Z bow, -X starboard.
// The same right-handed frame is written into the GLB. No mirrored transforms.
const fs = require('node:fs');
const path = require('node:path');
const {Ship,PAINT,add,sub,scale,cross,unit,lerp} = require('./build-own-ships.cjs');
const {createCarrierPaint,carrierUV} = require('./lib/carrier-paint.cjs');

const ROOT = path.resolve(__dirname,'..');
Object.assign(PAINT,{
  usSteel:'#536171',usDark:'#414e60',usLight:'#788391',jpSteel:'#717b7e',jpDark:'#535e62',
  jpLight:'#8c9694',underside:'#444e54',interior:'#b3b5aa',interiorDark:'#434b4b',
  wire:'#303739',rubber:'#2c3030',brass:'#8b7a50',redHull:'#6b3d35',
  glass:'#1b2a32',liferaft:'#8c8c74',deckEdge:'#59636b',whiteMark:'#b7b9aa',soot:'#12191c'
});

const SPECS = {
  enterprise: {
    title:'USS Enterprise CV-6, June 1942',navy:'usa',hullLength:246.74,waterlineLength:234.70,
    beam:25.374,deckLength:244.4496,deckBeam:26.2128,draft:7.911,deckY:16.85,freeboard:7.25,
    islandX:-14.1,islandZ:10,paint:'usSteel',dark:'usDark',light:'usLight',
    elevators:[{z:-94,w:13.4112,l:14.6304},{z:-24,w:13.4112,l:14.6304},{z:78,w:13.4112,l:14.6304}],
    sources:[
      'https://www.navsource.net/archives/02/06.htm',
      'https://www.navsource.net/archives/02/06a.htm',
      'https://www.history.navy.mil/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/80-G-10000/80-G-10150.html',
      'https://mommtx.org/uss-enterprise-cv-6'
    ],
    file:'enterprise-cv6-1942.glb'
  },
  kaga: {
    title:'IJN Kaga, June 1942',navy:'japan',hullLength:247.65,waterlineLength:240.30,
    beam:32.50,deckLength:248.58,deckBeam:30.48,draft:9.48,deckY:21.2,freeboard:8.0,
    islandX:-13.7,islandZ:48,paint:'jpSteel',dark:'jpDark',light:'jpLight',
    elevators:[{z:-79,w:12.8,l:9.9},{z:-5,w:10.7,l:15.9},{z:69,w:11.5,l:12.0}],
    sources:[
      'https://www.navypedia.org/ships/japan/jap_cv_kaga.htm',
      'https://japanese-warship.com/carrier/kaga/',
      'https://historynet.com/kaga-aircraft-carrier/',
      'https://nauticos.com/ijn-carrier-wreckage-identification-analysis-report/'
    ],
    file:'kaga-1942.glb'
  }
};

class Carrier extends Ship {
  constructor(spec) {
    super(spec.title,spec.sources[0]);
    this.spec=spec;this.section='structure';this.markers=[];
    this.paintProfile={navy:spec.navy,length:spec.deckLength,deckBeam:spec.deckBeam,
      draft:spec.draft,top:45,hull:spec.paint,deck:spec.navy==='japan'?'wood':'flightBlue',theme:'historical-carrier'};
  }
  batch(paint,visualOnly) {
    visualOnly ||= this.detailOnly;
    const key=this.section+'-'+(visualOnly?'detail-':'')+paint;
    if(!this.parts.has(key))this.parts.set(key,{paint,visualOnly,positions:[],normals:[],indices:[]});
    return this.parts.get(key);
  }
  withSection(name,draw) {
    const previous=this.section;this.section=name;
    try {draw();} finally {this.section=previous;}
  }
  prism(paint,outline,y,height,visualOnly=false) {
    const lower=outline.map(([x,z])=>[x,y,z]),upper=outline.map(([x,z])=>[x,y+height,z]);
    this.panel(paint,upper,visualOnly);this.panel(paint,lower.slice().reverse(),visualOnly);
    for(let i=0;i<lower.length;i++){
      const j=(i+1)%lower.length;
      this.panel(paint,[lower[i],lower[j],upper[j],upper[i]],visualOnly);
    }
  }
  roundedBox(paint,x,y,z,w,h,l,corner=.4) {
    const a=x-w/2,b=x+w/2,c=z-l/2,d=z+l/2,r=Math.min(corner,w/3,l/3);
    this.prism(paint,[[a+r,c],[a,c+r],[a,d-r],[a+r,d],[b-r,d],[b,d-r],[b,c+r],[b-r,c]],y,h);
  }
  ovalDuct(paint,a,b,radius,longRadius) {
    const axis=unit(sub(b,a)),u=[0,0,1],v=unit(cross(axis,u)),count=20;
    const ring=p=>Array.from({length:count},(_,i)=>{
      const t=i*Math.PI*2/count;
      return add(p,add(scale(u,longRadius*Math.cos(t)),scale(v,radius*Math.sin(t))));
    });
    const low=ring(a),high=ring(b);
    for(let i=0;i<count;i++){
      const j=(i+1)%count;this.panel(paint,[low[i],low[j],high[j],high[i]]);
    }
    this.panel(paint,low.slice().reverse());this.panel(paint,high);
  }
  marker(name,point,properties={}) {this.markers.push({name,point,properties});}
  finish() {
    const spec=this.spec;
    this.save('assets/ships/'+spec.file,{paintFactory:createCarrierPaint,uvMapper:carrierUV,
      extras:{nativeNaval:'historical-carrier-1942-v1',units:'metres',bow:[0,0,1],starboard:[-1,0,0],
        dimensions:{hullLength:spec.hullLength,waterlineLength:spec.waterlineLength,waterlineBeam:spec.beam,
          flightDeckLength:spec.deckLength,flightDeckBeam:spec.deckBeam,draft:spec.draft},
        referenceDate:'June 1942',sources:spec.sources,
        reconstruction:'Published principal dimensions. Hull stations, deck height, minor fittings and their locations are photo-based reconstructions.',
        island:{center:[spec.islandX,spec.deckY+4,spec.islandZ],side:'starboard'},
        elevators:spec.elevators,markers:this.markers,textureSize:[2048,1024]}});
  }
}

function interpolate(stations,t) {
  const index=Math.max(1,stations.findIndex(p=>p[0]>=t));
  if(t>=stations.at(-1)[0])return stations.at(-1)[1];
  const a=stations[index-1],b=stations[index];
  const f=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f;
}

function shell(ship) {
  const s=ship.spec,japanese=s.navy==='japan';
  const stations=japanese
    ? [[-1,.08],[-.98,.34],[-.93,.65],[-.84,.87],[-.67,.98],[-.40,1],[.20,1],[.50,.94],[.72,.76],[.86,.52],[.94,.29],[.985,.085],[1,.002]]
    : [[-1,.06],[-.98,.24],[-.94,.50],[-.85,.78],[-.67,.96],[-.35,1],[.10,.98],[.40,.91],[.64,.76],[.81,.54],[.91,.34],[.97,.16],[1,.002]];
  const rings=[];
  for(let iz=0;iz<=64;iz++){
    const t=iz/32-1,w=interpolate(stations,t)*s.beam/2;
    const top=s.freeboard+Math.pow(Math.max(0,(t-.55)/.45),2)*(japanese?1.8:2.2);
    const points=[[w,top,t*s.hullLength/2],[w,0,t*s.waterlineLength/2]];
    for(let j=1;j<20;j++){
      const theta=j*Math.PI/20;
      points.push([w*Math.cos(theta),-s.draft*Math.pow(Math.sin(theta),.64),t*s.waterlineLength*.493]);
    }
    points.push([-w,0,t*s.waterlineLength/2],[-w,top,t*s.hullLength/2]);
    rings.push(points);
  }
  ship.withSection('hull',()=>{
    const mesh=ship.batch('hullPaint',false),rows=rings.length,cols=rings[0].length;
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
      const before=rings[Math.max(0,i-1)][j],after=rings[Math.min(rows-1,i+1)][j];
      const across=sub(rings[i][Math.min(cols-1,j+1)],rings[i][Math.max(0,j-1)]);
      const n=unit(cross(sub(after,before),across));
      mesh.positions.push(...rings[i][j]);mesh.normals.push(...n);
    }
    for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){
      const a=i*cols+j,b=a+cols;
      mesh.indices.push(a,b,b+1,a,b+1,a+1);
    }
    for(const index of [0,rows-1]){
      const p=rings[index];ship.panel('hullPaint',index===0?p.slice().reverse():p);
    }
    // The main deck closes the hull. Its detailed ends are visible below the flight deck.
    for(let i=0;i<rings.length-1;i++){
      const a=rings[i],b=rings[i+1];ship.panel(s.dark,[a[0],a.at(-1),b.at(-1),b[0]]);
    }
  });
}

function rail(ship,points,height=.95) {
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],n=Math.max(1,Math.ceil(Math.hypot(...sub(a,b))/1.8));
    for(let j=0;j<=n;j++){
      const p=lerp(a,b,j/n);ship.tube(ship.spec.light,p,add(p,[0,height,0]),.032,.032,5);
    }
    for(const y of [height*.48,height])ship.tube(ship.spec.paint,add(a,[0,y,0]),add(b,[0,y,0]),.024,.024,5);
  }
}

function ladder(ship,x,y,z,height,wide=.55) {
  for(const side of [-1,1])ship.tube(ship.spec.light,[x,y,z+side*wide/2],[x,y+height,z+side*wide/2],.038,.038,5);
  for(let dy=.23;dy<height;dy+=.29)ship.tube(ship.spec.paint,[x,y+dy,z-wide/2],[x,y+dy,z+wide/2],.026,.026,5);
}

function stairs(ship,x,y,z,height,length,side=1) {
  const n=Math.ceil(height/.22);
  for(let i=0;i<n;i++)ship.block(ship.spec.light,x+side*length*i/n,y+height*i/n,z,length/n+.04,.055,.65);
  for(const dz of [-.37,.37]){
    ship.tube(ship.spec.paint,[x,y+.85,z+dz],[x+side*length,y+height+.85,z+dz],.035,.035,5);
    for(let i=0;i<=4;i++){
      const p=[x+side*length*i/4,y+height*i/4,z+dz];ship.tube(ship.spec.paint,p,add(p,[0,.85,0]),.032,.032,5);
    }
  }
}

function panelLines(ship,x,y,z,w,h,l) {
  const p=ship.spec.paint;
  for(let dy=1.6;dy<h;dy+=1.8){
    ship.tube(ship.spec.dark,[x-w/2-.02,y+dy,z-l/2],[x-w/2-.02,y+dy,z+l/2],.015,.015,4);
    ship.tube(ship.spec.dark,[x+w/2+.02,y+dy,z-l/2],[x+w/2+.02,y+dy,z+l/2],.015,.015,4);
  }
  for(const side of [-1,1]){
    for(let dz=-l/2+2;dz<l/2;dz+=4.5){
      ship.block(ship.spec.dark,x+side*(w/2+.018),y+.25,z+dz,.018,1.55,.68);
      ship.block(p,x+side*(w/2+.033),y+.31,z+dz,.018,1.43,.57);
      ship.block(ship.spec.light,x+side*(w/2+.055),y+1.05,z+dz+.19,.035,.06,.11);
    }
  }
}

function flightDeck(ship) {
  const s=ship.spec,w=s.deckBeam/2,l=s.deckLength/2;
  const outline=[[-w+2.5,-l],[-w,-l+2.6],[-w,l-14],[-w+2.6,l],[w-2.6,l],[w,l-14],[w,-l+2.6],[w-2.5,-l]];
  ship.withSection('flight-deck',()=>{
    ship.prism(s.dark,outline,s.deckY-.56,.55);
    ship.panel('deckPaint',outline.map(([x,z])=>[x,s.deckY,z]));
  });
  ship.marker('flight-deck',[0,s.deckY,0],{shipDeckSurface:true});
  ship.withSection('deck-fittings',()=>ship.decoration(()=>{
    for(const e of s.elevators){
      const x=0,y=s.deckY+.012;
      ship.block(s.dark,x,y,e.z,e.w+.13,.022,e.l+.13);
      ship.block('deckPaint',x,y+.024,e.z,e.w-.09,.012,e.l-.09);
      for(const side of [-1,1]){
        ship.block(s.light,side*(e.w/2-.15),y+.038,e.z,.04,.014,e.l-.45);
        for(let z=e.z-e.l*.44;z<e.z+e.l*.47;z+=1.2)ship.block('wire',side*(e.w/2-.25),y+.06,z,.16,.035,.20);
      }
      ship.marker('aircraft-elevator',[0,s.deckY,e.z],{widthM:e.w,lengthM:e.l});
    }
    const wires=s.navy==='japan'?[-110,-103,-96,-89,-82,-75,-68,-61,-54]:[-114,-108,-102,-86,-80,-74,-68,-62,-56];
    for(const z of wires){
      ship.tube('wire',[-w+.6,s.deckY+.045,z],[w-.6,s.deckY+.045,z],.021,.021,5);
      for(const side of [-1,1])ship.block(s.dark,side*(w-.32),s.deckY-.02,z,.49,.22,.46);
    }
    if(s.navy==='usa'){
      for(const x of [-5.4,5.4]){
        ship.block('wire',x,s.deckY+.014,84,.11,.015,66);
        ship.block(s.light,x+.14,s.deckY+.013,84,.052,.012,66);
      }
    }
    // Perimeter catwalks, stowed horizontal safety nets and their braces.
    for(const side of [-1,1]){
      for(const [start,end] of [[-115,-35],[-28,47],[58,104]]){
        const x=side*(w+.43),y=s.deckY-.88;
        ship.block(s.dark,x,y,start+(end-start)/2,.84,.17,end-start);
        rail(ship,[[x+side*.42,y+.17,start],[x+side*.42,y+.17,end]],.65);
        for(let z=start+.5;z<end;z+=3.4){
          ship.tube(s.paint,[side*(w-.4),y-1.8,z],[side*(w+.8),y,z],.060,.045,5);
        }
        for(let z=start;z<end;z+=9.0){
          const z1=Math.min(z+7.8,end),inner=side*(w+.85),outer=side*(w+1.65);
          ship.tube(s.paint,[inner,s.deckY-.23,z],[outer,s.deckY-.23,z],.034,.034,5);
          ship.tube(s.paint,[inner,s.deckY-.23,z1],[outer,s.deckY-.23,z1],.034,.034,5);
          ship.tube('wire',[outer,s.deckY-.23,z],[outer,s.deckY-.23,z1],.020,.020,4);
          for(let a=z+.40;a<z1;a+=.55)ship.tube('wire',[inner,s.deckY-.23,a],[outer,s.deckY-.23,a],.010,.010,4);
        }
      }
    }
  }));
}

function portholes(ship,x,y,start,end,spacing=2.25) {
  const sign=Math.sign(x);
  for(let z=start;z<=end;z+=spacing){
    ship.tube(ship.spec.dark,[x-sign*.015,y,z],[x+sign*.022,y,z],.155,.155,8);
    ship.tube('glass',[x+sign*.025,y,z],[x+sign*.035,y,z],.105,.105,8);
    ship.tube(ship.spec.light,[x+sign*.045,y+.15,z-.18],[x+sign*.045,y+.15,z+.18],.023,.023,5);
  }
}

function hullFittings(ship) {
  const s=ship.spec,half=s.beam/2;
  ship.withSection('hull-fittings',()=>ship.decoration(()=>{
    for(const side of [-1,1]){
      portholes(ship,side*(half+.045),s.freeboard-1.1,-55,35,2.1);
      for(const z of [-54,-30,-6,18,42]){
        const x=side*(half+.04),y=s.freeboard;
        ship.block(s.light,x,y-1.5,z,.08,1.1,.58);
        ladder(ship,x+side*.11,y-2.8,z+1.0,2.8);
      }
      for(const z of [103,110]){
        const width=interpolate(s.navy==='japan'?[[0,1],[.65,.80],[1,.01]]:[[0,1],[.65,.74],[1,.01]],z/(s.hullLength/2))*half;
        ship.tube(s.dark,[side*(width-.12),s.freeboard+.45,z],[side*(width+.05),s.freeboard+.45,z],.30,.29,10);
        ship.tube('wire',[side*(width+.09),s.freeboard+.49,z],[side*(width-.2),s.freeboard+2.4,z+.4],.078,.078,6);
      }
    }
    for(const z of [-113,110])for(const x of [-2.3,2.3]){
      ship.block(s.dark,x,s.freeboard+.15,z,1.5,.25,2.4);
      for(const dz of [-.55,.55])ship.tube(s.paint,[x,s.freeboard+.4,z+dz],[x,s.freeboard+.9,z+dz],.25,.25,8);
    }
    for(const x of [-1.6,1.6]){
      ship.tube('wire',[x,s.freeboard+.20,108],[x*.8,s.freeboard+.17,119],.12,.12,8);
      ship.tube('brass',[x,s.freeboard+.12,106],[x,s.freeboard+.65,106],.56,.52,12);
    }
    // Four shafts, supports and individually modelled four-bladed propellers.
    for(const x of [-5.4,-2.4,2.4,5.4]){
      const y=-s.draft*.65,z=-s.waterlineLength*.47;
      ship.tube(s.dark,[x*.6,y+1.1,z+16],[x,y,z],.25,.23,10);
      ship.tube('brass',[x,y,z-.65],[x,y,z+.75],.61,.37,12);
      ship.tube(s.paint,[x*.63,-s.draft*.31,z+6],[x,y,z+1.4],.19,.19,7);
      for(let blade=0;blade<4;blade++){
        const t=blade*Math.PI/2+.25,u=[Math.cos(t),Math.sin(t),0],v=[-Math.sin(t),Math.cos(t),0];
        const c=[x,y,z],points=[add(c,add(scale(u,.42),scale(v,-.18))),
          add(c,add(scale(u,1.45),scale(v,-.45))),add(c,add(scale(u,1.80),scale(v,.10))),
          add(c,add(scale(u,1.25),scale(v,.55))),add(c,add(scale(u,.35),scale(v,.27)))];
        ship.panel('brass',points);ship.panel('brass',points.slice().reverse().map(p=>add(p,[0,0,.065])));
      }
    }
    ship.block(s.paint,0,-s.draft*.88,-s.waterlineLength*.48,.28,3.8,5.1);
  }));
}

function supportFraming(ship) {
  const s=ship.spec,half=s.deckBeam/2;
  ship.withSection('deck-supports',()=>{
    for(const end of [-1,1]){
      const positions=end===-1?[-119,-111,-103]:[99,110,119];
      for(const z of positions){
        const base=s.freeboard+(end===1?1.2:.4);
        ship.block(s.dark,0,s.deckY-.96,z,s.deckBeam-1.0,.48,.45);
        for(const side of [-1,1]){
          const x=side*half*.72;
          ship.block(s.paint,x,base,z,.34,s.deckY-.96-base,.40);
          ship.tube(s.paint,[x,base+1,z],[x-side*half*.45,s.deckY-.96,z],.17,.14,6);
          if(s.navy==='japan')ship.tube(s.paint,[x,base+1,z],[x,s.deckY-.96,z+end*6],.17,.14,6);
        }
      }
    }
    for(const side of [-1,1]){
      const x=side*(half-.38);
      ship.block(s.dark,x,s.deckY-1.05,0,.22,.52,230);
      for(let z=-110;z<109;z+=4.2){
        ship.block(s.paint,x,s.deckY-1.12,z,.34,.70,.12);
        ship.tube(s.dark,[side*(s.beam/2-2.4),s.deckY-3.8,z],[x,s.deckY-.6,z],.075,.075,5);
      }
    }
  });
}

function gun(ship,x,y,z,naval=false,large=false,barrels=naval?2:large?1:2) {
  const s=ship.spec,side=Math.sign(x),r=large?1.72:naval?1.55:barrels===1?.47:.85;
  ship.tube(s.dark,[x,y-.4,z],[x,y,z],r+.28,r+.28,14);
  ship.tube(s.paint,[x,y,z],[x,y+.29,z],r,r,14);
  const length=large?4.9:naval?3.55:1.65;
  ship.block(s.dark,x,y+.29,z,r*.90,.76,r*.95);
  // Open splinter shields and breeches, with distinct gun silhouettes.
  ship.block(s.paint,x,y+.34,z-r*.65,r*1.65,1.0,.09);
  for(const sign of [-1,1])ship.block(s.paint,x+sign*r*.83,y+.34,z,.09,1.0,r*1.40);
  for(let i=0;i<barrels;i++){
    const dz=(i-(barrels-1)/2)*(large?.65:.51);
    ship.tube(s.dark,[x,y+.74,z+dz],[x+side*length,y+1.18,z+dz],large?.13:naval?.10:.055,large?.09:naval?.065:.035,8);
    ship.tube(s.light,[x-side*.3,y+.75,z+dz],[x+side*.9,y+.91,z+dz],large?.23:.14,large?.19:.12,8);
  }
  ship.block('rubber',x-side*.4,y+.61,z+.55,.32,.14,.44);
  ship.marker('gun-mount',[x,y,z],{barrels,calibreMm:large?127:naval?127:barrels===4?27.94:s.navy==='japan'?25:20});
}

function gunGallery(ship,side,z,y,large=false,naval=false,barrels) {
  const s=ship.spec,x=side*(s.deckBeam/2+.80),r=large?2.4:naval?2.3:barrels===1?.85:1.40;
  ship.tube(s.paint,[x,y-.42,z],[x,y-.10,z],r,r,16);
  const inner=side*(s.beam/2-2.4);
  for(const dz of [-r*.6,r*.6])ship.tube(s.dark,[inner,y-3.0,z+dz],[x+side*r*.6,y-.38,z+dz],.13,.10,6);
  gun(ship,x,y-.10,z,naval,large,barrels);
  const points=[];
  for(let i=0;i<=12;i++){
    const t=-Math.PI*.70+i*Math.PI*1.4/12;
    points.push([x+side*Math.cos(t)*(r-.05),y-.09,z+Math.sin(t)*(r-.05)]);
  }
  rail(ship,points,.64);
}

function lifeboat(ship,x,y,z,length=8.2) {
  const s=ship.spec;
  const stations=[[-.5,.03],[-.43,.54],[-.24,.78],[.2,.76],[.40,.48],[.5,.02]];
  for(let i=0;i<stations.length-1;i++){
    const [a,w]=stations[i],[b,v]=stations[i+1];
    ship.panel(s.light,[[x-w,y+.49,z+a*length],[x-w*.6,y,z+a*length],
      [x-v*.6,y,z+b*length],[x-v,y+.49,z+b*length]]);
    ship.panel(s.light,[[x+w*.6,y,z+a*length],[x+w,y+.49,z+a*length],
      [x+v,y+.49,z+b*length],[x+v*.6,y,z+b*length]]);
    ship.panel('interiorDark',[[x-w,y+.49,z+a*length],[x+w,y+.49,z+a*length],
      [x+v,y+.49,z+b*length],[x-v,y+.49,z+b*length]]);
  }
  for(let p=-.31;p<=.32;p+=.13)ship.block('liferaft',x,y+.50,z+p*length,1.0,.08,.19);
  for(const end of [-1,1]){
    const a=[x-Math.sign(x)*1.1,y-.7,z+end*length*.28],b=[x,y+2,z+end*length*.28];
    ship.tube(s.paint,a,b,.085,.07,7);
    ship.tube('wire',b,[x,y+.55,z+end*length*.28],.022,.022,4);
  }
}

function raft(ship,x,y,z,side=1) {
  const s=ship.spec;
  ship.roundedBox('liferaft',x,y,z,.32,1.08,2.30,.18);
  ship.roundedBox(s.dark,x+side*.025,y+.20,z,.34,.68,1.85,.16);
  ship.block('liferaft',x+side*.18,y+.25,z,.13,.58,.13);
  for(const dz of [-.6,0,.6])ship.block('rope',x+side*.20,y+.06,z+dz,.12,1.0,.045);
}

function bridgeLevel(ship,x,y,z,w,h,l) {
  const s=ship.spec;
  ship.roundedBox('hullPaint',x,y,z,w,h,l,.45);
  ship.roundedBox(s.dark,x,y+h,z,w+.55,.18,l+.6,.60);
  const count=Math.floor(l/.78);
  for(const side of [-1,1])for(let i=0;i<count;i++){
    ship.block('glass',x+side*(w/2+.018),y+h*.53,z-l/2+.6+i*.78,.027,.59,.55);
    ship.block(s.light,x+side*(w/2+.052),y+h*.83,z-l/2+.6+i*.78,.10,.06,.65);
  }
  for(let dx=-w*.38;dx<w*.40;dx+=.78)ship.block('glass',x+dx,y+h*.53,z+l/2+.018,.55,.59,.027);
}

function vent(ship,x,y,z,width,height,side=-1) {
  const s=ship.spec;
  ship.block(s.dark,x,y,z,.10,height,width);
  for(let dy=.12;dy<height-.06;dy+=.18)ship.block(s.light,x+side*.065,y+dy,z,.09,.045,width-.15);
}

function searchlight(ship,x,y,z,side=-1) {
  const s=ship.spec;
  ship.tube(s.dark,[x,y,z],[x,y+.66,z],.18,.14,8);
  ship.tube(s.paint,[x-side*.28,y+1.10,z],[x+side*.29,y+1.10,z],.43,.43,14);
  ship.tube('glass',[x+side*.30,y+1.10,z],[x+side*.33,y+1.10,z],.35,.35,14);
  for(const dz of [-.36,.36])ship.tube(s.light,[x,y+.48,z+dz],[x,y+1.12,z+dz],.045,.045,6);
}

function islandFittings(ship,x,y,z,length,width) {
  const s=ship.spec;
  ship.decoration(()=>{
    panelLines(ship,x,y,z,width,4.6,length);
    for(const side of [-1,1]){
      const edge=x+side*(width/2+.04);
      portholes(ship,edge,y+1.8,z-length*.39,z+length*.38,1.85);
      for(const dz of [-length*.29,length*.22])vent(ship,edge,y+3.3,z+dz,2.5,.85,side);
      for(const dz of [-length*.34,length*.05]){
        ship.tube(s.dark,[edge+side*.10,y+.32,z+dz],[edge+side*.10,y+4.6,z+dz],.07,.07,7);
        ship.tube(s.light,[edge+side*.10,y+4.6,z+dz],[edge+side*.32,y+4.85,z+dz],.075,.055,7);
      }
    }
    for(const dz of [-length*.35,length*.30]){
      ship.roundedBox(s.dark,x-.5,y+5.2,z+dz,1.1,.53,1.6,.16);
      ship.tube(s.paint,[x-.5,y+5.73,z+dz],[x-.5,y+6.7,z+dz],.12,.10,8);
    }
  });
}

function mast(ship,x,y,z,height,radar=false) {
  const s=ship.spec,foot=height*.095;
  for(const side of [-1,1]){
    ship.tube(s.paint,[x+side*foot,y,z-foot*.7],[x,y+height*.73,z],.14,.065,7);
  }
  ship.tube(s.paint,[x,y,z+foot],[x,y+height*.73,z],.14,.065,7);
  ship.tube(s.dark,[x,y+height*.60,z],[x,y+height,z],.105,.045,7);
  for(const fraction of [.46,.65,.79]){
    const yy=y+height*fraction,w=height*(fraction===.65?.28:.19);
    ship.tube(s.paint,[x-w,yy,z],[x+w,yy,z],.065,.065,6);
    for(const side of [-1,1])ship.tube('wire',[x,yy+height*.10,z],[x+side*w,yy,z],.015,.015,4);
  }
  if(radar){
    const yy=y+height*.76,w=4.6,h=1.75;
    ship.block(s.dark,x,yy-.4,z,.9,.40,.7);
    for(let i=0;i<=8;i++)ship.tube(s.light,[x-w/2+i*w/8,yy,z],[x-w/2+i*w/8,yy+h,z],.028,.028,5);
    for(const dy of [0,h/2,h])ship.tube(s.light,[x-w/2,yy+dy,z],[x+w/2,yy+dy,z],.032,.032,5);
    ship.tube(s.dark,[x-w/2,yy,z],[x+w/2,yy+h,z],.023,.023,5);
    ship.tube(s.dark,[x+w/2,yy,z],[x-w/2,yy+h,z],.023,.023,5);
  }
}

function crane(ship,x,y,z,height,length) {
  const s=ship.spec;
  ship.tube(s.paint,[x,y,z],[x,y+height,z],.32,.18,10);
  const tip=[x-1.2,y+height+2,z-length];
  for(const side of [-1,1]){
    const a=[x+side*.36,y+height-1.2,z],b=[tip[0]+side*.18,tip[1],tip[2]];
    ship.tube(s.paint,a,b,.10,.07,6);
    for(let i=0;i<9;i++){
      const p=lerp(a,b,i/9),q=lerp(a,b,(i+1)/9);
      ship.tube(s.light,add(p,[0,0,0]),add(q,[0,.46,0]),.035,.035,5);
    }
  }
  ship.tube('wire',[x,y+height+2.5,z],tip,.024,.024,5);
  ship.tube('wire',tip,add(tip,[0,-5,0]),.024,.024,5);
  ship.tube('wire',add(tip,[0,-5,0]),add(tip,[.32,-5.3,0]),.055,.045,7);
}

function enterprise() {
  const ship=new Carrier(SPECS.enterprise),s=ship.spec,d=s.deckY;
  shell(ship);supportFraming(ship);
  ship.withSection('hangar',()=>{
    ship.block(s.dark,0,7.35,-2,22.8,.35,191);
    ship.block('interior',0,7.72,-2,22.3,.08,191);
    ship.block('interior',0,15.96,-2,22.8,.11,192);
    const bays=[[-94,-69],[-64,-43],[-38,-15],[-10,12],[17,37],[42,65],[70,90]];
    for(const side of [-1,1]){
      const x=side*11.45;
      for(const [a,b] of bays){
        ship.block(s.paint,x,7.72,a,.40,8.17,.72);
        ship.block(s.paint,x,7.72,b,.40,8.17,.72);
        ship.block(s.paint,x,14.72,(a+b)/2,.42,1.25,b-a);
        ship.block(s.dark,x+side*.04,8.05,(a+b)/2,.20,.65,b-a);
        // Roll-up doors are partly lowered, exposing the real hangar recess.
        const lower=(Math.abs(a)>65?2.15:1.0);
        for(let dy=0;dy<lower;dy+=.18)ship.block(s.light,x+side*.11,14.72-dy,(a+b)/2,.12,.072,b-a-.8);
        ship.tube(s.paint,[x,8.7,a+1],[x,14.8,a+3.9],.10,.10,6);
        ship.tube(s.paint,[x,8.7,b-1],[x,14.8,b-3.9],.10,.10,6);
      }
      ship.block(s.paint,x,8.0,99,.45,7.9,11);
      ship.block(s.paint,x,8.0,-100,.45,7.9,10);
      portholes(ship,x+side*.26,10.6,94,103,2.0);
      const outer=side*12.05;
      ship.block(s.dark,outer,9.4,-5,1.20,.19,161);
      rail(ship,[[outer+side*.6,9.59,-85],[outer+side*.6,9.59,75]],.87);
      for(const z of [-82,-46,-7,30,66]){
        ladder(ship,outer+side*.67,9.7,z,5.6);
        stairs(ship,side*12.0,7.8,z+2.8,1.6,2.1,side);
      }
      for(const z of [-79,-56,35,59])lifeboat(ship,side*12.8,10.2,z,7.8);
      for(const z of [-39,-35,-31,-27,20,24,28,32])raft(ship,side*12.4,12.8,z,side);
      for(let z=-89;z<90;z+=13){
        ship.tube(s.dark,[side*11.73,14.2,z],[side*11.73,15.0,z],.28,.28,10);
        ship.tube(s.paint,[side*11.73,15.0,z],[side*12.3,15.0,z],.29,.25,10);
      }
    }
    for(const z of [-92,-54,-15,24,63,91]){
      ship.block('interior',0,8,z,20.6,7.6,.22);
      ship.block('interiorDark',0,8.05,z-.13,6.8,4.0,.05);
    }
  });
  flightDeck(ship);
  ship.withSection('island',()=>{
    const x=-14.1;
    ship.roundedBox('hullPaint',x,13.5,6,5.6,6.1,47,.65);
    bridgeLevel(ship,x,19.6,21,5.7,2.05,23);
    bridgeLevel(ship,x,21.83,23,6.1,2.05,19);
    bridgeLevel(ship,x-.20,24.06,25,5.6,1.87,15);
    ship.roundedBox(s.paint,x,26.12,25,3.6,1.2,8.0,.5);
    // Broad rectangular funnel with six individually recessed uptakes.
    ship.roundedBox('hullPaint',x-0.3,20.7,-.6,5.4,10.0,15.5,.7);
    ship.roundedBox('soot',x-0.3,29.9,-.6,5.5,1.28,15.7,.65);
    for(const xx of [-1.25,1.25])for(const z of [-5.1,-.6,3.9]){
      ship.tube(s.dark,[x+xx,31.17,z],[x+xx,31.28,z],1.06,1.06,12,.80);
      ship.tube('soot',[x+xx,31.29,z],[x+xx,31.31,z],.82,.82,12,.80);
      ship.exhaust([x+xx,31.4,z],.85);
    }
    panelLines(ship,x-.3,20.7,-.6,5.4,10,15.5);
    islandFittings(ship,x,14.0,6,47,5.6);
    for(const z of [-5.2,-3.7,-2.2]){
      ship.tube(s.light,[-17.2,18.9,z],[-17.2,31.1,z],.11,.11,8);
      ship.tube(s.dark,[-17.2,31.1,z],[-17.2,31.7,z],.13,.13,8);
    }
    for(const z of [15,29])searchlight(ship,-17.9,24.1,z,-1);
    for(const dz of [-3.6,3.6])vent(ship,-17.13,22.0,dz,2.0,2.5,-1);
    for(const y of [21.6,24.0,26.1]){
      rail(ship,[[-17.5,y,14],[-17.5,y,32],[-11.0,y,32]],.82);
      ship.block(s.dark,-17.4,y-.12,23,.8,.14,18);
    }
    ladder(ship,-17.02,20.3,10.5,8.8);
    mast(ship,-14.2,26.0,18,15.4,true);
    mast(ship,-14.1,26.6,-9.6,11.6,false);
    for(const z of [33,-17]){
      ship.tube(s.dark,[-14.1,21.5,z],[-14.1,24.4,z],1.38,1.28,16);
      ship.roundedBox(s.light,-14.1,24.4,z,2.55,.71,2.25,.45);
      ship.tube(s.dark,[-15.7,24.8,z],[-12.5,24.8,z],.15,.15,8);
    }
    crane(ship,-14.3,17.0,-24.5,9.0,12.0);
    ship.marker('island-starboard',[-14.1,d+2,10],{side:'starboard'});
  });
  ship.withSection('armament',()=>ship.decoration(()=>{
    for(const side of [-1,1]){
      for(const z of [-99,-87,79,91])gunGallery(ship,side,z,14.1,true,false);
      for(const z of [-43,57])gunGallery(ship,side,z,15.8,false,false,4);
      for(const z of [-111,-106,-69,-63,-54,-28,-20,-12,5,12,27,34,48,66,101,106])gunGallery(ship,side,z,16.0,false,false,1);
    }
  }));
  hullFittings(ship);return ship;
}

function kaga() {
  const ship=new Carrier(SPECS.kaga),s=ship.spec,d=s.deckY;
  shell(ship);supportFraming(ship);
  ship.withSection('hangar',()=>{
    // Kaga's tall enclosed, stacked hangars taper at the bow and stern.
    ship.roundedBox('hullPaint',0,7.95,-2.0,27.3,6.15,196,2.0);
    ship.roundedBox('hullPaint',0,14.1,17.5,26.4,6.48,158,1.8);
    ship.block(s.dark,0,14.1,-81.5,25.8,.20,40.0);
    ship.block(s.dark,0,20.25,-81.5,25.8,.20,40.0);
    ship.block('interior',0,14.3,-61.8,25.8,5.9,.20);
    for(const z of [-101,-93,-85,-77,-69]){
      ship.block(s.paint,0,19.9,z,25.8,.31,.25);
      for(const side of [-1,1]){
        const x=side*12.65;
        ship.block(s.paint,x,14.2,z,.27,6.0,.31);
        ship.tube(s.dark,[x,14.7,z],[x,19.9,z+5.5],.10,.10,6);
      }
    }
    for(const side of [-1,1]){
      const x=side*13.74;
      for(const y of [9.1,12.0,16.4,19.0])portholes(ship,x,y,-78,75,3.25);
      for(const y of [12.7,17.0]){
        const walk=side*14.2;
        ship.block(s.dark,walk,y,-2,1.15,.20,163);
        rail(ship,[[walk+side*.55,y+.2,-83],[walk+side*.55,y+.2,79]],.85);
        for(const z of [-77,-58,-39,-20,0,20,40,60,76]){
          ship.tube(s.paint,[side*13.2,y-2.3,z],[side*14.7,y,z],.10,.075,6);
          if(y<15)ladder(ship,side*14.75,y+.2,z,4.1);
        }
      }
      for(const z of [-70,-52,-34,-16,2,20,38,56,72]){
        ship.block(s.light,x,8.0,z,.16,11.0,.18);
        ship.block(s.dark,x+side*.08,14.0,z+1.3,.08,.8,1.4);
        for(let dz=-.55;dz<.6;dz+=.22)ship.block(s.paint,x+side*.14,14.08,z+1.3+dz,.045,.63,.065);
      }
      // The aft hangar floor is open above, exposing the framing added earlier.
      for(const z of [90]){
        if(side===1)continue;
        ship.block(s.dark,0,9.2,z,22.6,.27,13);
        ship.block('interiorDark',0,9.47,z,20.8,7.8,13);
        for(const xx of [-10.7,-5.35,0,5.35,10.7]){
          ship.block(s.paint,xx,9.4,z-6.5,.23,7.9,.24);
          ship.block(s.paint,xx,9.4,z+6.5,.23,7.9,.24);
        }
        ship.block(s.paint,0,17.1,z,22.6,.23,13);
        ship.block(s.dark,0,17.35,z,20.4,3.2,13);
        for(const xx of [-10.7,-5.35,0,5.35,10.7])ship.block(s.paint,xx,17.2,z-6.5,.22,3.3,.24);
      }
      for(const z of [-61,-45,-28,49,64])lifeboat(ship,side*15.2,10.0,z,8.4);
      for(const z of [-73,-69,-65,25,29,33])raft(ship,side*15.4,14.3,z,side);
      for(const z of [-90,-58,7,81])stairs(ship,side*13.8,8.2,z,4.4,3.1,side);
    }
    for(const z of [-103,102]){
      ship.block(s.paint,0,8.9,z,20.1,8.0,.35);
      ship.block(s.light,0,16.9,z,20.3,.22,1.0);
      for(const side of [-1,1])portholes(ship,side*10.2,13.3,z-1,z+1,1.0);
    }
  });
  flightDeck(ship);
  ship.withSection('island',()=>{
    const x=s.islandX,z=s.islandZ;
    ship.roundedBox('hullPaint',x,d-1.0,z,4.2,3.0,13.0,.55);
    bridgeLevel(ship,x,d+2.2,z+1.0,4.8,1.76,10.2);
    bridgeLevel(ship,x,d+4.15,z+1.5,4.3,1.70,8.6);
    ship.roundedBox(s.dark,x,d+6.05,z+2.0,3.7,.18,7.2,.35);
    ship.roundedBox(s.paint,x,d+6.23,z+2.0,2.7,1.05,4.8,.35);
    ship.tube(s.light,[x,d+7.28,z+2],[x,d+8.1,z+2],.65,.58,12);
    rail(ship,[[x-2.6,d+4.1,z-4.5],[x-2.6,d+4.1,z+5.6],[x+2.3,d+4.1,z+5.6]],.82);
    ladder(ship,x-2.2,d+.2,z-3.4,6.0);
    mast(ship,x,d+5.2,z-4.7,9.2,false);
    islandFittings(ship,x,d-1.0,z,13,4.2);
    for(const dz of [-3.6,3.6])searchlight(ship,x-2.6,d+4.3,z+dz,-1);
    ship.marker('island-starboard',[x,d+3,z],{side:'starboard'});
  });
  ship.withSection('funnel',()=>{
    // One large downward trunk on the starboard side, with a recessed black outlet.
    const centers=[[-12.6,16.7,20],[-15.3,16.7,20],[-17.3,15.7,20],[-18.2,13.8,20]];
    for(let i=0;i<centers.length-1;i++)ship.ovalDuct(s.dark,centers[i],centers[i+1],1.95,4.68);
    ship.ovalDuct(s.paint,[-18.2,13.8,20],[-18.40,13.30,20],1.95,4.68);
    ship.ovalDuct('wire',[-18.43,13.22,20],[-18.45,13.16,20],1.70,4.35);
    for(const z of [16.5,18.25,20,21.75,23.5]){
      ship.tube(s.dark,[-18.6,13.12,z],[-18.6,16.7,z],.045,.045,5);
    }
    ship.exhaust([-18.6,12.95,20],1.9,[-.42,-.86,-.05]);
  });
  ship.withSection('armament',()=>ship.decoration(()=>{
    for(const side of [-1,1]){
      for(const z of [-91,-65,61,81])gunGallery(ship,side,z,16.3,false,true);
      const light=side===-1?[-105,-44,-29,2,98]:[-105,-48,-29,-10,18,98];
      for(const z of light)gunGallery(ship,side,z,19.6,false,false);
      for(const z of [-72,-54,-36,65,82]){
        const x=side*14.25;
        ship.roundedBox(s.dark,x,6.6,z,2.0,2.65,4.0,.35);
        ship.tube('wire',[x+side*1.02,7.85,z],[x+side*1.07,7.85,z],.58,.58,14);
        ship.tube(s.dark,[x+side*.8,7.85,z],[x+side*4.1,8.05,z],.18,.13,10);
      }
    }
  }));
  ship.withSection('deck-service',()=>ship.decoration(()=>{
    for(const side of [-1,1]){
      for(const z of [-83,15,74]){
        const x=side*(s.deckBeam/2+.8),y=d-1.3;
        ship.tube(s.paint,[x,y,z],[x,y+6.2,z],.10,.06,6);
        ship.tube(s.paint,[x,y+5,z],[x+side*2.4,y+5,z],.06,.06,5);
        ship.tube('wire',[x,y+6,z],[x+side*2.4,y+5,z],.018,.018,4);
      }
      crane(ship,side*13.7,13.3,-99,5.0,6.0);
    }
  }));
  hullFittings(ship);return ship;
}

fs.mkdirSync(path.join(ROOT,'assets/ships'),{recursive:true});
for(const build of [enterprise,kaga])build().finish();

module.exports={SPECS};
