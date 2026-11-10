'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GlbWriter, box } = require('./lib/glb-writer.cjs');

const ROOT = path.resolve(__dirname, '..');
const AUTHOR = 'Torpedo-Bomber project';
const NHHC = 'https://www.history.navy.mil';
const REFS = {
  cargo: NHHC + '/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-86000/NH-86280.html',
  liberty: 'https://www.nps.gov/places/ss-jeremiah-o-brien.htm',
  landing: NHHC + '/our-collections/photography/numerical-list-of-images/nara-series/80-g/80-g-k-13000/80-G-K-13669.html',
  samidare: NHHC + '/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-86000/NH-86302.html',
  fletcher: NHHC + '/browse-by-topic/ships/modern-ships/uss-fletcher.html',
  submarine: NHHC + '/our-collections/photography/wars-and-events/world-war-ii/pearl-harbor-raid/japanese-forces-in-the-pearl-harbor-attack/japanese-midget-submarines-used-in-the-attack-on-pearl-harbor.html',
  midway: NHHC + '/browse-by-topic/ships/aircraft-carriers/uss-midway.html',
  zuiho: NHHC + '/content/history/museums/nmusn/explore/photography/wwii/wwii-pacific/leyte/sibuyan-sulu-seas/80-g-272552.html'
};

const PAINT = {
  redLead: '#683f37', boot: '#292f33', steel: '#717d83', shade: '#555f65',
  light: '#879194', blue: '#465766', dark: '#333d43', deck: '#596468',
  wood: '#7c7567', plank: '#898071', pale: '#c2c4b3', window: '#18252c',
  rust: '#79584a', faded: '#83716a', canvas: '#79745c', rope: '#51504b',
  cargo: '#4c5148', cargoDark: '#414941', maroon: '#7e5347', hatch: '#68685e',
  green: '#59645a', greenDark: '#424d46', tan: '#948876', ink: '#333c42'
};

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, n) => a.map(x => x * n);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => scale(a, 1 / Math.hypot(...a));
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const rgb = hex => hex.slice(1).match(/../g).map(x => {
  const c = parseInt(x, 16) / 255;
  return c < .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
});

class Ship {
  constructor(title, source, yaw = 0, transform = { scale: 1, y: 0 }) {
    this.title = title;
    this.source = source;
    this.yaw = yaw;
    this.transform = transform;
    this.parts = new Map();
  }

  batch(paint, visualOnly) {
    const key = visualOnly ? 'deck-marking-' + paint : paint;
    if (!this.parts.has(key)) {
      this.parts.set(key, { paint, visualOnly, positions: [], normals: [], indices: [] });
    }
    return this.parts.get(key);
  }

  panel(paint, points, visualOnly = false) {
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    if (Math.hypot(...normal) < 1e-8) return;
    const mesh = this.batch(paint, visualOnly);
    const base = mesh.positions.length / 3;
    const n = unit(normal);
    for (const point of points) {
      mesh.positions.push(...point);
      mesh.normals.push(...n);
    }
    for (let i = 1; i < points.length - 1; i++) mesh.indices.push(base, base + i, base + i + 1);
  }

  block(paint, x, base, z, width, height, length, visualOnly = false) {
    const mesh = this.batch(paint, visualOnly);
    const b = box([x, base + height/2, z], [width, height, length]);
    const offset = mesh.positions.length / 3;
    mesh.positions.push(...b.positions);
    mesh.normals.push(...b.normals);
    mesh.indices.push(...b.indices.map(i => i + offset));
  }

  tube(paint, a, b, radius, end = radius, sides = 8, oval = 1) {
    const axis = unit(sub(b, a));
    const ref = Math.abs(axis[1]) > .9 ? [0,0,1] : [0,1,0];
    const u = unit(cross(ref, axis));
    const v = scale(cross(axis, u), oval);
    const ring = (p, r) => Array.from({length: sides}, (_, i) => {
      const t = i * Math.PI * 2 / sides;
      return add(p, add(scale(u, r * Math.cos(t)), scale(v, r * Math.sin(t))));
    });
    const low = ring(a, radius), high = ring(b, end);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.panel(paint, [low[i], low[j], high[j], high[i]]);
    }
    this.panel(paint, low.slice().reverse());
    this.panel(paint, high);
  }

  save(relative) {
    const glb = new GlbWriter({ generator: 'Torpedo-Bomber original naval mesh generator', extras: {
      title: this.title, author: AUTHOR, license: 'project-own (original mesh and paint)',
      source: this.source, changes: 'Independently generated geometry and paint; historical silhouette reference only.'
    }});
    const root = glb.node({name: this.title});
    const cosine = Math.cos(this.yaw), sine = Math.sin(this.yaw);
    const rotate = (x, y, z) => [x*cosine + z*sine, y, z*cosine - x*sine];
    const { scale: factor, y: height } = this.transform;
    for (const [key, mesh] of this.parts) {
      const {paint, visualOnly} = mesh;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const p = rotate(...mesh.positions.slice(i,i+3));
        const n = rotate(...mesh.normals.slice(i,i+3));
        mesh.positions[i] = p[0] * factor;
        mesh.positions[i+1] = p[1] * factor + height;
        mesh.positions[i+2] = p[2] * factor;
        mesh.normals[i] = n[0];
        mesh.normals[i+1] = n[1];
        mesh.normals[i+2] = n[2];
      }
      const material = glb.material({name: paint, pbrMetallicRoughness: {
        baseColorFactor: [...rgb(PAINT[paint]), 1], roughnessFactor: .87, metallicFactor: .04
      }});
      glb.node({name: key, mesh: glb.mesh(key, {...mesh, material}),
        extras: visualOnly ? {shipVisualOnly: true} : undefined}, root);
    }
    const bytes = glb.glb();
    fs.writeFileSync(path.join(ROOT, relative), bytes);
    console.log(relative, bytes.length, 'bytes');
  }
}

// Station coordinates are normalized half-length, beam factor, and local deck sheer.
const MERCHANT = [[-1,.035,1.24],[-.96,.33,.83],[-.88,.64,.42],[-.74,.88,.12],
  [-.53,.98,0],[-.27,1,0],[0,1,0],[.25,1,0],[.51,.96,.06],[.70,.83,.28],
  [.83,.62,.62],[.92,.36,1.12],[.98,.13,1.52],[1,.025,1.7]];
const ESCORT = [[-1,.07,.30],[-.96,.38,.13],[-.86,.70,0],[-.68,.88,0],
  [-.45,.97,0],[-.21,1,0],[.02,.98,0],[.24,.92,.05],[.43,.83,.25],
  [.62,.67,.75],[.78,.51,1.36],[.89,.33,1.76],[.96,.16,2.1],[1,.015,2.42]];
const LANDING = [[-1,.67,.1],[-.95,.88,0],[-.82,1,0],[-.4,1,0],[0,1,0],
  [.42,1,0],[.72,.96,0],[.87,.86,.12],[.96,.72,.29],[1,.56,.46]];
const CARRIER = [[-1,.07,.30],[-.95,.34,.10],[-.86,.70,0],[-.72,.91,0],
  [-.50,.99,0],[-.25,1,0],[0,1,0],[.25,1,0],[.53,.95,0],[.70,.85,0],
  [.83,.67,.28],[.92,.43,.62],[.97,.20,.90],[1,.025,1.3]];

function hull(ship, stations, {length, beam, draft, freeboard, color, deck = 'deck', wear = true}) {
  const rings = stations.map(([fraction, width, sheer]) => {
    const z = fraction * length/2, x = width * beam/2, y = freeboard + sheer;
    const r = Math.min(draft * .19, .85);
    return [[-x,y,z],[-x*.95,.75,z],[-x*.91,-.23,z],[-x*.69,-draft+r,z],
      [-x*.34,-draft,z],[x*.34,-draft,z],[x*.69,-draft+r,z],[x*.91,-.23,z],
      [x*.95,.75,z],[x,y,z]];
  });
  const colors = [color,'boot','redLead','redLead','redLead','redLead','redLead','boot',color,deck];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i+1];
    for (let j = 0; j < a.length; j++) {
      const next = (j+1) % a.length;
      ship.panel(colors[j], [a[j], a[next], b[next], b[j]]);
    }
    if (!wear || i < 1 || i >= rings.length - 2) continue;
    for (const [top,bottom,dir] of [[0,1,-1],[9,8,1]]) {
      for (let k = 0; k < 3; k++) {
        const t = (k + .37 + ((i * 17 + k * 7) % 10) * .03) / 3;
        const p = lerp(a[top], b[top], t), q = lerp(a[bottom], b[bottom], t);
        const start = add(lerp(p,q,.05+(i+k)%4*.055),[dir*.025,0,0]);
        const end = add(lerp(p,q,.23+(i*3+k)%5*.067),[dir*.025,0,0]);
        const streak = [start,end,add(end,[0,0,.045]),add(start,[0,0,.16])];
        ship.panel(k===1?'faded':'rust', dir<0?streak:streak.reverse());
      }
    }
  }
  const cap = (ring, backwards) => {
    const center = [0,freeboard*.35,ring[0][2]];
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      ship.panel(colors[i], backwards ? [center,ring[j],ring[i]] : [center,ring[i],ring[j]]);
    }
  };
  cap(rings[0], true);
  cap(rings.at(-1), false);
}

function cabin(ship, x, y, z, w, h, l, paint = 'steel') {
  ship.block(paint,x,y,z,w,h,l);
  ship.block('shade',x,y+h,z,w+.35,.17,l+.38);
  const count = Math.max(3, Math.round(w/1.25));
  for (let i = 1; i <= count; i++) {
    ship.block('window',x + (i/(count+1)-.5)*w,y+h*.59,z+l/2+.018,w/(count+1)*.65,h*.26,.06);
  }
  for (const side of [-1,1]) {
    for (let i=1; i<=Math.max(2,Math.floor(l/2.6)); i++) {
      const n = Math.max(2,Math.floor(l/2.6));
      ship.block('window',x+side*(w/2+.018),y+h*.59,z+(i/(n+1)-.5)*l,.06,h*.26,.65);
    }
  }
}

function stack(ship, x, y, z, radius, height, paint = 'steel') {
  const base = [x,y,z], neck = [x,y+height*.84,z-height*.13], lip = [x,y+height,z-height*.16];
  ship.tube(paint,base,neck,radius*1.09,radius,12,1.4);
  ship.tube('dark',neck,lip,radius,radius*1.01,12,1.4);
  ship.tube('ink',lip,add(lip,[0,.08,0]),radius*.81,radius*.81,12,1.4);
}

function mast(ship, x, y, z, height, broad = false) {
  const head = [x,y+height,z-.85], armY=y+height*.75;
  ship.tube('shade',[x,y,z],head,.23,.095,7);
  ship.tube('shade',[x-2.2,armY,z-.58],[x+2.2,armY,z-.58],.105,.105,6);
  if (broad) {
    ship.tube('rope',[x-2.3,y,z-2],[x,armY,z-.58],.13,.13,5);
    ship.tube('rope',[x+2.3,y,z-2],[x,armY,z-.58],.13,.13,5);
    ship.block('dark',x,head[1]-.55,head[2],2.2,.5,.21);
  }
  ship.tube('rope',head,add(head,[0,1.1,-.12]),.048,.04,5);
}

function rail(ship, x, y, start, end, segments, spanEnd = x) {
  const a=[x,y,start], b=[spanEnd,y,end];
  for (let i=0; i<=segments; i++) {
    const p=lerp(a,b,i/segments);
    ship.tube('steel',p,add(p,[0,.78,0]),.061,.051,5);
  }
  for (const level of [.43,.77]) {
    ship.tube('shade',add(a,[0,level,0]),add(b,[0,level,0]),.037,.037,5);
  }
}

function boat(ship, x, y, z, length) {
  ship.tube('shade',[x,y+.25,z-length*.50],[x,y+.25,z-length*.32],.13,.57,8,.63);
  ship.tube('shade',[x,y+.25,z-length*.32],[x,y+.25,z+length*.29],.57,.55,8,.63);
  ship.tube('shade',[x,y+.25,z+length*.29],[x,y+.25,z+length*.5],.55,.06,8,.63);
  ship.block('canvas',x,y+.48,z,.83,.13,length*.67);
  for (const sign of [-1,1]) {
    ship.tube('steel',[x+1,y,z+sign*length*.27],[x+.22,y+1.05,z+sign*length*.27],.105,.075,6);
  }
}

function bollards(ship, x, y, z) {
  for (const side of [-1,1]) {
    ship.tube('dark',[side*x-.23,y,z],[side*x-.23,y+.43,z],.18,.15,8);
    ship.tube('dark',[side*x+.23,y,z],[side*x+.23,y+.43,z],.18,.15,8);
  }
}

// These exterior shapes are decorative game scenery. All game logic stays in the existing ship code.
function mount(ship, x, y, z, w, stern = false, twin = false) {
  const sign = stern ? -1 : 1;
  ship.tube('shade',[x,y,z],[x,y+.29,z],w*.57,w*.57,12);
  ship.block('shade',x,y+.29,z,w,w*.47,w*.77);
  ship.block('steel',x,y+.76*w/1.45,z-sign*w*.08,w*.89,.17,w*.63);
  for (const dx of twin?[-w*.19,w*.19]:[0]) {
    ship.tube('dark',[x+dx,y+.36*w,z+sign*w*.30],
      [x+dx,y+.41*w,z+sign*w*1.02],w*.055,w*.036,7);
  }
}

function merchant(liberty) {
  const ship = new Ship(liberty?'Liberty cargo transport':'Japanese wartime cargo transport',
    liberty?REFS.liberty:REFS.cargo, liberty?0:-Math.PI/2);
  const l=liberty?135:132, deck=liberty?5.4:5.15;
  const hullPaint=liberty?'shade':'cargoDark';
  hull(ship,MERCHANT,{length:l,beam:liberty?17.4:17.9,draft:liberty?5.8:3.5,
    freeboard:deck,color:hullPaint,deck:liberty?'wood':'deck'});
  const house=liberty?-4:-10;
  ship.block(liberty?'steel':'cargo',0,deck,house,12.4,2.3,22);
  ship.block('shade',0,deck+2.3,house,12.8,.16,22.2);
  cabin(ship,0,deck+2.46,house+2.6,9.8,2.32,10.4,liberty?'light':'cargo');
  cabin(ship,0,deck+4.95,house+5,7.6,1.72,4.8,liberty?'light':'cargo');
  stack(ship,0,deck+2.5,house-4.6,liberty?1.47:1.59,liberty?7.9:9.1,liberty?'steel':'maroon');
  mast(ship,0,deck+6.9,house+4.6,6.1);
  const hatches=liberty?[-44,-28,15,32,48]:[-42,-28,12,29,46];
  for (const [index,z] of hatches.entries()) {
    const width=index===0?7.1:8.6;
    ship.block('dark',0,deck+.10,z,width+.5,.73,10.6);
    ship.block(liberty?'hatch':'canvas',0,deck+.83,z,width,.17,10);
    for (let i=-2;i<=2;i++) ship.block('shade',0,deck+1.001,z+i*1.8,width,.065,.085);
  }
  for (const [index,z] of [-36,21,39].entries()) {
    const h=index===1?14:11.5;
    mast(ship,0,deck+.18,z,h,index===1);
    for (const side of [-1,1]) {
      const base=[side*.57,deck+2.15,z];
      const tip=[side*3.65,deck+7.35,z+(side===1?8:-7)];
      ship.tube('shade',base,tip,.17,.105,7);
      ship.tube('rope',tip,[0,deck+h-.45,z-.58],.035,.035,5);
      ship.tube('rope',tip,add(tip,[0,-1.65,0]),.043,.043,5);
    }
  }
  for (const side of [-1,1]) {
    boat(ship,side*6,deck+2.25,house-1.4,5.9);
    rail(ship,side*8.0,deck,-33,35,15);
    rail(ship,side*8.0,deck,35,57,6,side*4.7);
    rail(ship,side*8.0,deck,-33,-54,6,side*5);
    for (let z=-23;z<=43;z+=11) {
      ship.block('shade',side*8.19,deck+.08,z,.15,.49,1.3);
    }
  }
  bollards(ship,1.5,deck+1.2,59);
  bollards(ship,2.35,deck+.58,-58);
  return ship;
}

function destroyer(us) {
  const ship = new Ship(us?'Fletcher class escort':'Samidare, Shiratsuyu class destroyer',
    us?REFS.fletcher:REFS.samidare,Math.PI/2);
  const d=us?3.15:2.85;
  hull(ship,ESCORT,{length:us?115:110,beam:us?12.05:10.15,draft:us?3.5:3.3,
    freeboard:d,color:us?'blue':'steel'});
  const w=us?7.2:6.45;
  ship.block(us?'blue':'shade',0,d,-3,w,1.8,53);
  ship.block('deck',0,d+1.8,-3,w+.19,.14,53.2);
  ship.block('steel',0,d+1.94,15, w-1.1,2,13);
  cabin(ship,0,d+3.94,18,w-.8,1.8,7.9,us?'blue':'steel');
  ship.block('light',0,d+5.92,18,w-1.2,.39,4.3);
  mast(ship,0,d+5.05,11.7,10.4,true);
  stack(ship,0,d+1.94,5.6,us?1.47:1.33,us?7.1:7.8,us?'blue':'steel');
  stack(ship,0,d+1.94,-9.5,us?1.30:1.02,us?6.5:6,us?'blue':'steel');
  mast(ship,0,d+1.94,-17.3,7.6);
  for (const side of [-1,1]) {
    boat(ship,side*(w/2-.08),d+1.94,-1.2,4.8);
    rail(ship,side*(us?5.68:4.77),d,-29,25,15,side*(us?5:4.25));
    rail(ship,side*(us?5.45:4.65),d,-29,-46,5,side*3.2);
  }
  mount(ship,0,d+1.02,35.4,2.5,false,!us);
  if (us) mount(ship,0,d+3.15,28.4,2.34);
  mount(ship,0,d+1.94,-24.4,2.38,true,!us);
  if (us) mount(ship,0,d+.30,-34.6,2.42,true);
  mount(ship,0,d+.22,-43.8,2.38,true);
  bollards(ship,1.15,d+1.89,49);
  return ship;
}

function landing() {
  const ship = new Ship('LST tank landing ship',REFS.landing,Math.PI/2);
  const d=3.6;
  hull(ship,LANDING,{length:100,beam:15.1,draft:2.3,freeboard:d,color:'steel'});
  for (const side of [-1,1]) {
    ship.block('shade',side*4.75,d,7.6,1.15,1.14,73.4);
    rail(ship,side*6.95,d,-35,36,20,side*6.65);
    ship.block('steel',side*2.11,d+.31,47.75,3.95,2.46,2.66);
    ship.block('dark',side*2.05,d+.58,49.11,.27,1.7,.10);
    ship.block('light',side*1.55,d+.35,49.115,1.3,.16,.11);
  }
  ship.block('shade',0,d+.07,9.1,8.1,.13,76.0);
  for(let i=-32;i<=40;i+=3.2){
    ship.block('steel',0,d+.211,i,7.95,.022,.10);
    for(const side of [-1,1]) ship.block('pale',side*3.75,d+.222,i,.105,.016,1.22);
  }
  ship.block('steel',0,d,-35,12,2.3,15.7);
  cabin(ship,0,d+2.3,-35,8.2,2.45,7.2);
  cabin(ship,0,d+4.92,-33.8,6.2,1.65,4.65);
  for(const side of [-1,1]){
    stack(ship,side*4.8,d+2.3,-38.7,.57,3.9);
    boat(ship,side*4.52,d+2.25,-31,4.1);
  }
  mast(ship,0,d+6.65,-35.1,6.2,true);
  bollards(ship,3.1,d+.22,-46);
  return ship;
}

function submarine() {
  const ship = new Ship('Type A Kō-hyōteki midget submarine',REFS.submarine);
  const sections=[[-12,.04],[-11.58,.25],[-10.75,.48],[-9.6,.71],[-7.4,.92],[-5.2,1],
    [3.4,1],[7.6,.96],[9.5,.81],[10.95,.58],[11.68,.34],[12,.08]];
  for (let i=0;i<sections.length-1;i++) {
    const [a,r]=sections[i], [b,s]=sections[i+1];
    ship.tube('dark',[0,-.12,a],[0,-.12,b],r*.92,s*.92,20,.98);
  }
  ship.tube('shade',[0,.46,-.58],[0,1.84,-.36],.59,.49,12,1.42);
  ship.tube('dark',[0,1.84,-.36],[0,1.95,-.36],.49,.49,12,1.42);
  ship.tube('steel',[.16,1.94,-.18],[.16,2.89,-.18],.046,.046,7);
  ship.tube('shade',[.16,2.88,-.18],[.16,2.88,.02],.048,.048,7);
  ship.block('dark',0,.05,-10.24,.13,.86,1.23);
  ship.block('shade',0,-.24,-9.9,2.7,.13,1.05);
  ship.block('shade',0,-.21,9.1,2.1,.12,.60);
  return ship;
}

// Game deck surface in world coordinates before applying the carrier loader's transform.
const DECK_Y = 16.85;

function flightDeck(ship, japanese) {
  const sections=[[-125,12.5],[-122.5,16.4],[-117,17.2],[-104,17.35],[-67,17.35],
    [-28,17.75],[15,17.75],[58,17.3],[98,17.3],[117,17.1],[122.5,16.4],[125,12.4]];
  for (let i=0; i<sections.length-1; i++) {
    const [a,w]=sections[i], [b,v]=sections[i+1], h=DECK_Y-.66;
    ship.panel(japanese?'tan':'blue',[[-w,DECK_Y,a],[-v,DECK_Y,b],[v,DECK_Y,b],[w,DECK_Y,a]]);
    ship.panel('shade',[[-w,h,a],[-v,h,b],[-v,DECK_Y,b],[-w,DECK_Y,a]]);
    ship.panel('shade',[[w,h,a],[w,DECK_Y,a],[v,DECK_Y,b],[v,h,b]]);
  }
  for (const [i,dir] of [[0,-1],[sections.length-1,1]]) {
    const [z,w]=sections[i];
    const face=[[-w,DECK_Y-.66,z],[w,DECK_Y-.66,z],[w,DECK_Y,z],[-w,DECK_Y,z]];
    ship.panel('shade',dir===1?face:face.reverse());
  }
  // Paint sits slightly above the mesh to avoid z-fighting. Its visual nodes
  // are excluded from ShipContact so tyres meet the continuous deck surface.
  const mark = (paint, x, y, z, width, height, length) =>
    ship.block(paint,x,y,z,width,height,length,true);
  for (let z=-112;z<=114;z+=2.12) {
    mark(japanese?'wood':'deck',0,DECK_Y+.001,z,32.9,.007,.055);
  }
  for (let z=-116;z<115;z+=8.3) mark('pale',0,DECK_Y+.009,z,.19,.012,4.3);
  for (const side of [-1,1]) {
    mark('pale',side*15.69,DECK_Y+.009,0,.16,.012,237.2);
    for (let z=-112;z<119;z+=8.8) {
      mark('shade',side*16.28,DECK_Y+.005,z,.46,.012,3.5);
    }
  }
  for(const z of [-115,115]){
    for(let i=-4;i<=4;i++) mark('pale',i*2.38,DECK_Y+.009,z,.42,.012,4.0);
  }
  for (const z of [-53,44]) {
    for (const side of [-1,1]) mark('deck',side*5.65,DECK_Y+.014,z,.105,.012,14.0);
    for (const end of [-1,1]) mark('deck',0,DECK_Y+.014,z+end*7,11.4,.012,.105);
  }
  if (japanese) {
    const z=88,r=5.0;
    for(let i=0;i<40;i++){
      const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
      ship.panel('maroon',[[0,DECK_Y+.032,z],[r*Math.cos(a),DECK_Y+.032,z+r*Math.sin(a)],
        [r*Math.cos(b),DECK_Y+.032,z+r*Math.sin(b)]].reverse(),true);
    }
  } else {
    for (const z of [-103.4,99]) {
      mark('pale',-7.9,DECK_Y+.020,z,.34,.012,5.1);
      mark('pale',-9.95,DECK_Y+.020,z+1.2,.34,.012,2.68);
      mark('pale',-8.85,DECK_Y+.020,z-.02,2.2,.012,.32);
      mark('pale',-6.35,DECK_Y+.020,z,.36,.012,5.1);
      mark('pale',-6.67,DECK_Y+.020,z+2.4,.98,.012,.30);
    }
  }
}

function carrier(japanese) {
  const factor = japanese ? 1.744 : 1.35;
  const rawDeck = japanese ? 8.01 : 10.45;
  const ship=new Ship(japanese?'Zuihō light carrier':'USS Midway straight-deck carrier',
    japanese?REFS.zuiho:REFS.midway,0,{scale:1/factor,y:rawDeck-DECK_Y/factor});
  hull(ship,CARRIER,{length:japanese?232:246,beam:japanese?22.0:31.8,
    draft:japanese?6.4:8,freeboard:japanese?7.6:9,color:japanese?'greenDark':'blue'});
  const beam=japanese?10.4:13.5;
  ship.block(japanese?'green':'steel',0,japanese?7.6:9,-3,beam*2,japanese?8.59:7.19,191);
  for(const side of [-1,1]){
    for(let i=-4;i<=4;i++){
      ship.block('window',side*beam,12.40,i*18.6,.15,1.74,japanese?5.6:8.9);
      ship.block('shade',side*(beam+.19),12.11,i*18.6,.56,.25,japanese?6.8:10.5);
    }
    for (const z of [-91,-73,80,93]) {
      ship.tube('shade',[side*(beam-1),9.0,z],[side*14.86,DECK_Y-.73,z],.24,.17,7);
    }
    for (const z of [-79,-43,48,83]) {
      ship.block(japanese?'greenDark':'blue',side*15.60,11.6,z,4.8,.80,9.2);
      rail(ship,side*17.83,12.4,z-3.5,z+3.5,3);
    }
    boat(ship,side*(beam+.23),10.2,-27,7.3);
  }
  if(japanese){
    cabin(ship,0,10.52,91.5,9.5,2.22,6.15,'green');
    ship.tube('greenDark',[9.1,11.9,-1.4],[15.7,9.45,-3.1],1.19,1.18,12,1.37);
    ship.tube('ink',[15.6,9.47,-3.08],[16.0,9.34,-3.16],1.18,1.16,12,1.37);
    mast(ship,18.4,12.8,-35.5,5.0);
  }else{
    const x=19.6, z=16.5;
    ship.block('blue',x,13.4,z,6.8,3.48,33.5);
    ship.block('steel',x,DECK_Y,z,6.25,3.75,30.4);
    cabin(ship,x,DECK_Y+3.75,z+6.0,5.78,2.64,13.5);
    cabin(ship,x,DECK_Y+6.57,z+5.1,4.28,1.72,8.4);
    stack(ship,x,DECK_Y+3.75,z-6.8,1.73,8.1);
    mast(ship,x,DECK_Y+8.46,z+4.4,10.4,true);
    for (const offset of [-1.8,1.8]) {
      ship.tube('shade',[x+offset,DECK_Y+14.5,z+4.2],[x+offset,DECK_Y+17.4,z+4.2],.08,.065,6);
    }
    ship.block('pale',x+3.135,DECK_Y+1.05,z+7.5,.04,1.4,1.7);
    ship.block('blue',x+3.168,DECK_Y+1.46,z+7.55,.03,.40,.68);
  }
  flightDeck(ship,japanese);
  return ship;
}

fs.mkdirSync(path.join(ROOT,'assets/ships'),{recursive:true});
merchant(false).save('assets/ships/japanese-cargo.glb');
merchant(true).save('assets/ships/liberty.glb');
destroyer(false).save('assets/ships/samidare.glb');
destroyer(true).save('assets/ships/fletcher.glb');
landing().save('assets/ships/landing-ship.glb');
submarine().save('assets/ships/ko-hyoteki.glb');
carrier(false).save('uss_midway.glb');
carrier(true).save('ijn carrier.glb');
