'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GlbWriter, box } = require('./lib/glb-writer.cjs');
const { createShipPaint, paintUV } = require('./lib/ship-paint.cjs');

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
  midway: NHHC + '/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-49000/NH-49829.html',
  zuiho: NHHC + '/content/history/nhhc/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-95000/NH-95471.html'
};

const PAINT = {
  redLead: '#68473e', boot: '#303533', steel: '#768087', shade: '#56636a',
  light: '#929a9b', blue: '#4c5f70', dark: '#333c40', deck: '#59666e',
  wood: '#7c7567', plank: '#898071', pale: '#c2c4b3', window: '#18252c',
  rust: '#79584a', faded: '#83716a', canvas: '#79745c', rope: '#51504b',
  cargo: '#4c5148', cargoDark: '#414941', maroon: '#7e5347', hatch: '#68685e',
  green: '#697769', greenDark: '#526050', tan: '#8c8770', ink: '#293034',
  flightBlue: '#48525b', plate: '#667579', cream: '#c9b78b', copper: '#70564b',
  portLamp: '#794b44', starboardLamp: '#4f715d'
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
    this.exhausts = [];
    this.detailOnly = false;
  }

  decoration(draw) {
    const previous = this.detailOnly;
    this.detailOnly = true;
    try { draw(); } finally { this.detailOnly = previous; }
  }

  batch(paint, visualOnly) {
    visualOnly ||= this.detailOnly;
    const key = visualOnly ? 'surface-detail-' + paint : paint;
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

  exhaust(point, radius, direction = [0,1,0]) {
    this.exhausts.push({point,radius,direction});
  }

  save(relative) {
    const glb = new GlbWriter({ generator: 'Torpedo-Bomber original naval mesh generator', extras: {
      title: this.title, author: AUTHOR, license: 'project-own (original mesh and paint)',
      source: this.source, changes: 'Original geometry and procedural weathered paint. Historical photography informs the design; no photograph is embedded.'
    }});
    const atlas = glb.image(createShipPaint(this.paintProfile, PAINT), 'image/jpeg');
    const root = glb.node({name: this.title});
    const cosine = Math.cos(this.yaw), sine = Math.sin(this.yaw);
    const rotate = (x, y, z) => [x*cosine + z*sine, y, z*cosine - x*sine];
    const { scale: factor, y: height } = this.transform;
    for (const [key, mesh] of this.parts) {
      const {paint, visualOnly} = mesh;
      const textured = paint === 'hullPaint' || paint === 'deckPaint';
      const uvs = textured ? [] : undefined;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const point = mesh.positions.slice(i,i+3);
        if (textured) uvs.push(...paintUV(this.paintProfile, paint, ...point, mesh.normals[i]));
        const p = rotate(...point);
        const n = rotate(...mesh.normals.slice(i,i+3));
        mesh.positions[i] = p[0] * factor;
        mesh.positions[i+1] = p[1] * factor + height;
        mesh.positions[i+2] = p[2] * factor;
        mesh.normals[i] = n[0];
        mesh.normals[i+1] = n[1];
        mesh.normals[i+2] = n[2];
      }
      const pbr = {roughnessFactor: textured ? .91 : .83, metallicFactor: .04};
      if (textured) pbr.baseColorTexture = {index: atlas};
      else pbr.baseColorFactor = [...rgb(PAINT[paint]), 1];
      const material = glb.material({name: paint, pbrMetallicRoughness: pbr});
      glb.node({name: key, mesh: glb.mesh(key, {...mesh, material, uvs}),
        extras: visualOnly ? {shipVisualOnly: true} : undefined}, root);
    }
    this.exhausts.forEach(({point,radius,direction},i) => {
      const [x,y,z] = rotate(...point);
      glb.node({
        name: 'funnel-exhaust-' + (i+1),
        translation: [x*factor,y*factor+height,z*factor],
        extras: {shipExhaust: {radius:radius*factor,direction:rotate(...direction)}}
      },root);
    });
    const bytes = glb.glb();
    fs.writeFileSync(path.join(ROOT, relative), bytes);
    console.log(relative, bytes.length, 'bytes');
  }
}

// Station coordinates are normalized half-length, beam factor, and local deck sheer.
const LIBERTY = [[-1,.035,1.24],[-.96,.33,.83],[-.88,.64,.42],[-.74,.88,.12],
  [-.53,.98,0],[-.27,1,0],[0,1,0],[.25,1,0],[.51,.96,.06],[.70,.83,.28],
  [.83,.62,.62],[.92,.36,1.12],[.98,.13,1.52],[1,.025,1.7]];
const FLETCHER = [[-1,.07,.30],[-.96,.38,.13],[-.86,.70,0],[-.68,.88,0],
  [-.45,.97,0],[-.21,1,0],[.02,.98,0],[.24,.92,.05],[.43,.83,.25],
  [.62,.67,.75],[.78,.51,1.36],[.89,.33,1.76],[.96,.16,2.1],[1,.015,2.42]];
const JAPANESE_CARGO = [[-1,.28,.52],[-.96,.65,.40],[-.86,.91,.29],[-.69,1,.16],
  [-.46,1,.04],[-.20,1,0],[.08,.98,0],[.32,.94,.09],[.55,.85,.22],
  [.67,.74,.42],[.70,.70,1.78],[.83,.52,2.10],[.92,.30,2.38],[1,.025,2.68]];
const SHIRATSUYU = [[-1,.026,.06],[-.95,.32,.09],[-.84,.59,.13],[-.66,.79,.04],
  [-.44,.93,0],[-.20,1,0],[.06,.99,0],[.29,.91,.12],[.42,.84,.14],[.45,.81,1.64],
  [.62,.64,1.91],[.78,.47,2.16],[.90,.29,2.69],[.97,.11,3.08],[1,.012,3.3]];
const LANDING = [[-1,.67,.1],[-.95,.88,0],[-.82,1,0],[-.4,1,0],[0,1,0],
  [.42,1,0],[.72,.96,0],[.87,.86,.12],[.96,.72,.29],[1,.56,.46]];
const CARRIER = [[-1,.07,.30],[-.95,.34,.10],[-.86,.70,0],[-.72,.91,0],
  [-.50,.99,0],[-.25,1,0],[0,1,0],[.25,1,0],[.53,.95,0],[.70,.85,0],
  [.83,.67,.28],[.92,.43,.62],[.97,.20,.90],[1,.025,1.3]];

const ZUIHO = [[-1,.21,.34],[-.96,.55,.17],[-.85,.78,0],[-.69,.94,0],
  [-.42,1,0],[-.12,1,0],[.16,.97,0],[.39,.88,.05],[.60,.75,.27],
  [.77,.56,.59],[.91,.32,.97],[.97,.15,1.40],[1,.018,1.82]];

function hull(ship, stations, {length, beam, draft, freeboard, color, deck = 'deck', theme}) {
  ship.paintProfile = {
    length, deckBeam: beam, draft, top: freeboard + Math.max(...stations.map(s => s[2])),
    hull: color, deck, theme, seed: Math.round(length * beam)
  };
  const rings = stations.map(([fraction, width, sheer]) => {
    const z = fraction * length/2, x = width * beam/2, y = freeboard + sheer;
    const r = Math.min(draft * .19, .85);
    return [[-x,y,z],[-x*.95,.75,z],[-x*.91,-.23,z],[-x*.69,-draft+r,z],
      [-x*.34,-draft,z],[x*.34,-draft,z],[x*.69,-draft+r,z],[x*.91,-.23,z],
      [x*.95,.75,z],[x,y,z]];
  });
  const colors = [color,'boot','redLead','redLead','redLead','redLead','redLead','boot',color,deck];
  const carrierHull = theme === 'midway' || theme === 'zuiho';
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i+1];
    for (let j = 0; j < a.length; j++) {
      const next = (j+1) % a.length;
      ship.panel(j===9?(carrierHull?'deck':'deckPaint'):'hullPaint', [a[j], a[next], b[next], b[j]]);
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
  ship.decoration(() => {
    const z = length * .394;
    const index = rings.findIndex(ring => ring[0][2] > z);
    const a = rings[index-1], b = rings[index];
    const t = (z-a[0][2])/(b[0][2]-a[0][2]);
    const lip = lerp(a[9],b[9],t);
    const lower = lerp(a[8],b[8],t);
    for (const side of [-1,1]) {
      const p = lerp(lip,lower,.28);
      const radius = Math.min(beam*.036,.76);
      const at = [p[0]*side,p[1],z];
      const end = add(at,[side*.22,0,0]);
      ship.tube('shade',add(at,[-side*.20,0,0]),end,radius,radius*.96,10,1.23);
      ship.tube('dark',end,add(end,[side*.035,0,0]),radius*.73,radius*.69,10,1.23);
      const anchor = [end[0]+side*.13,end[1]-radius*.55,z];
      ship.block('dark',anchor[0],anchor[1]-radius*.55,z,.25,radius*1.04,radius*.29);
      ship.tube('dark',add(anchor,[0,-radius*.50,0]),add(anchor,[0,-radius*.26,radius*.53]),radius*.10);
      ship.tube('dark',add(anchor,[0,-radius*.50,0]),add(anchor,[0,-radius*.26,-radius*.53]),radius*.10);
    }
  });
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
  ship.exhaust(add(lip,[0,.17,0]),radius);
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

function libertyShip() {
  const ship = new Ship('Liberty cargo transport',REFS.liberty);
  const deck=5.4, house=-4;
  hull(ship,LIBERTY,{length:135,beam:17.4,draft:5.8,freeboard:deck,
    color:'shade',deck:'wood',theme:'liberty'});
  ship.block('steel',0,deck,house,12.4,2.3,22);
  ship.block('shade',0,deck+2.3,house,12.8,.16,22.2);
  cabin(ship,0,deck+2.46,house+2.6,9.8,2.32,10.4,'light');
  cabin(ship,0,deck+4.95,house+5,7.6,1.72,4.8,'light');
  stack(ship,0,deck+2.5,house-4.6,1.47,7.9);
  mast(ship,0,deck+6.9,house+4.6,6.1);
  const hatches=[-44,-28,15,32,48];
  for (const [index,z] of hatches.entries()) {
    const width=index===0?7.1:8.6;
    ship.block('dark',0,deck+.10,z,width+.5,.73,10.6);
    ship.block('hatch',0,deck+.83,z,width,.17,10);
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

function japaneseCargo() {
  const ship = new Ship('Japanese wartime cargo transport',REFS.cargo,-Math.PI/2);
  const deck=4.85;
  hull(ship,JAPANESE_CARGO,{length:132,beam:17.9,draft:3.5,freeboard:deck,
    color:'cargoDark',deck:'deck',theme:'cargo'});
  // The compact machinery and bridge are aft, leaving a long working deck.
  ship.block('cargo',0,deck,-39,12.8,2.44,24);
  cabin(ship,0,deck+2.43,-34,9.9,2.1,9.5,'green');
  cabin(ship,0,deck+4.68,-35,6.15,1.46,5.4,'cargo');
  stack(ship,0,deck+2.43,-45,1.88,6.65,'maroon');
  for (const [z,w,l] of [[-17,8.6,12],[7,10.2,17],[31,9.5,16]]) {
    ship.block('dark',0,deck+.08,z,w+.55,.75,l+.45);
    ship.block('canvas',0,deck+.82,z,w,.18,l);
    for (let offset=-l*.38;offset<l*.41;offset+=1.9) ship.block('rope',0,deck+1,z+offset,w,.085,.12);
  }
  for (const [z,h] of [[-4,12.4],[20,13.5],[42,9.5]]) {
    const y=deck+.34;
    for (const side of [-1,1]) {
      const x=side*4.5;
      ship.tube('shade',[x,y,z],[x,y+h,z-1.0],.29,.19,8);
      const end=[side*3.4,y+h*.69,z+(side>0?9:-8)];
      ship.tube('greenDark',[x,y+1.1,z],end,.16,.10,7);
      ship.tube('rope',end,[x,y+h,z-1.0],.045,.045,5);
      ship.block('shade',x,y,z+1.9,1.45,.59,1.36);
    }
    ship.tube('steel',[-4.5,y+h,z-1],[4.5,y+h,z-1],.17,.17,7);
  }
  for (const side of [-1,1]) {
    boat(ship,side*5.05,deck+2.48,-35,5.6);
    rail(ship,side*8.12,deck,-26,39,13,side*7.0);
  }
  mast(ship,0,deck+6.27,-34.6,6.8);
  bollards(ship,1.85,deck+2.25,56);
  return ship;
}

function fletcher() {
  const ship = new Ship('Fletcher class escort',REFS.fletcher,Math.PI/2);
  const d=3.15;
  hull(ship,FLETCHER,{length:115,beam:12.05,draft:3.5,freeboard:d,color:'blue',theme:'fletcher'});
  ship.block('blue',0,d,-3,7.2,1.8,53);
  ship.block('deck',0,d+1.8,-3,7.39,.14,53.2);
  ship.block('steel',0,d+1.94,15,6.1,2,13);
  cabin(ship,0,d+3.94,18,6.4,1.8,7.9,'blue');
  ship.block('light',0,d+5.92,18,6,.39,4.3);
  mast(ship,0,d+5.05,11.7,10.4,true);
  latticeRadar(ship,0,d+15.1,11,false);
  stack(ship,0,d+1.94,5.6,1.47,7.1,'blue');
  stack(ship,0,d+1.94,-9.5,1.30,6.5,'blue');
  mast(ship,0,d+1.94,-17.3,7.6);
  for (const side of [-1,1]) {
    boat(ship,side*3.52,d+1.94,-1.2,4.8);
    rail(ship,side*5.68,d,-29,25,15,side*5);
    rail(ship,side*5.45,d,-29,-46,5,side*3.2);
  }
  mount(ship,0,d+1.02,35.4,2.5);
  mount(ship,0,d+3.15,28.4,2.34);
  mount(ship,0,d+1.94,-24.4,2.38,true);
  mount(ship,0,d+.30,-34.6,2.42,true);
  mount(ship,0,d+.22,-43.8,2.38,true);
  bollards(ship,1.15,d+1.89,49);
  return ship;
}

function samidare() {
  const ship = new Ship('Samidare, Shiratsuyu class destroyer',REFS.samidare,Math.PI/2);
  const d=2.78;
  hull(ship,SHIRATSUYU,{length:110,beam:10.15,draft:3.3,freeboard:d,
    color:'steel',deck:'wood',theme:'samidare'});
  // Tall forward tower on the raised forecastle, with separated machinery
  // housings and a lower, largely open stern.
  ship.block('shade',0,d+.18,18.5,6.15,2.65,11.5);
  cabin(ship,0,d+2.83,20.7,5.8,2.35,7.9);
  cabin(ship,0,d+5.34,22,4.55,1.94,5.8,'shade');
  mast(ship,0,d+7.45,20.1,9.8,true);
  ship.block('shade',0,d+.08,3.1,6.45,1.35,9.2);
  stack(ship,0,d+1.41,4.0,1.32,8.15);
  ship.block('shade',0,d+.05,-12,5.8,1.05,8.6);
  stack(ship,0,d+1.10,-12.0,.98,5.2,'shade');
  ship.block('steel',0,d+.12,-26,4.8,1.68,7.9);
  mast(ship,0,d+1.78,-25,7.4);
  for (const side of [-1,1]) {
    boat(ship,side*3.88,d+.49,-6.5,5.25);
    rail(ship,side*4.68,d,-28,16,13,side*4.38);
    rail(ship,side*4.55,d,-28,-45,5,side*2.95);
  }
  mount(ship,0,d+1.93,35.4,2.67,false,true);
  mount(ship,0,d+1.78,-32.1,2.45,true);
  mount(ship,0,d+.20,-43.3,2.53,true,true);
  bollards(ship,1.03,d+2.79,48);
  return ship;
}

function landing() {
  const ship = new Ship('LST tank landing ship',REFS.landing,Math.PI/2);
  const d=3.6;
  hull(ship,LANDING,{length:100,beam:15.1,draft:2.3,freeboard:d,color:'steel',theme:'landing'});
  for (const side of [-1,1]) {
    ship.block('shade',side*4.75,d,7.6,1.15,1.14,73.4);
    rail(ship,side*6.95,d,-35,36,20,side*6.65);
    ship.block('steel',side*2.11,d+.31,47.75,3.95,2.46,2.66);
    ship.block('dark',side*2.05,d+.58,49.11,.27,1.7,.10);
    ship.block('light',side*1.55,d+.35,49.115,1.3,.16,.11);
  }
  ship.block('deckPaint',0,d+.07,9.1,8.1,.13,76.0);
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
  ship.paintProfile = {length:24, deckBeam:2.7, draft:1.1, top:1, hull:'dark',
    deck:'shade', theme:'submarine', seed:241};
  const sections=[[-12,.04],[-11.58,.25],[-10.75,.48],[-9.6,.71],[-7.4,.92],[-5.2,1],
    [3.4,1],[7.6,.96],[9.5,.81],[10.95,.58],[11.68,.34],[12,.08]];
  for (let i=0;i<sections.length-1;i++) {
    const [a,r]=sections[i], [b,s]=sections[i+1];
    ship.tube('hullPaint',[0,-.12,a],[0,-.12,b],r*.92,s*.92,20,.98);
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
  const sections=japanese
    ? [[-125,13.7],[-122,16.6],[-109,17.1],[-77,17.55],[-28,17.4],[34,17.2],
       [77,16.85],[113,16.85],[122,16.7],[125,9.2]]
    : [[-125,12.5],[-122.5,16.4],[-117,17.2],[-104,17.35],[-67,17.35],
    [-28,17.75],[15,17.75],[58,17.3],[98,17.3],[117,17.1],[122.5,16.4],[125,12.4]];
  for (let i=0; i<sections.length-1; i++) {
    const [a,w]=sections[i], [b,v]=sections[i+1], h=DECK_Y-.66;
    ship.panel('deckPaint',[[-w,DECK_Y,a],[-v,DECK_Y,b],[v,DECK_Y,b],[w,DECK_Y,a]]);
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
  for (let z=-116;z<115;z+=8.3) mark('pale',0,DECK_Y+.009,z,.19,.012,4.3);
  for (const side of [-1,1]) {
    mark('pale',side*15.69,DECK_Y+.009,0,.16,.012,237.2);
    for (let z=-112;z<119;z+=8.8) {
      mark('shade',side*16.28,DECK_Y+.005,z,.46,.012,3.5);
    }
  }
  for(const z of [-115,115]){
    if (japanese) {
      for (const dz of [-2,0,2]) mark('pale',0,DECK_Y+.013,z+dz,25.4,.011,.47);
    } else {
      for(let i=-4;i<=4;i++) mark('pale',i*2.38,DECK_Y+.009,z,.42,.012,4.0);
    }
  }
  // Lift seams and tiedown holes are visual geometry on the common solid deck.
  for (const z of (japanese?[-53,47]:[-55,48])) {
    mark('deckPaint',0,DECK_Y+.008,z,11.4,.007,14.0);
    for (const side of [-1,1]) {
      mark('ink',side*5.70,DECK_Y+.016,z,.14,.007,14.2);
      for (let d=-6;d<=6;d+=2) {
        mark(japanese?'pale':'cream',side*5.38,DECK_Y+.019,z+d,.36,.008,.12);
      }
    }
    for (const end of [-1,1]) mark('ink',0,DECK_Y+.017,z+end*7.03,11.6,.007,.14);
  }
  for (const side of [-1,1]) {
    for (let z=-113;z<115;z+=4.9) {
      mark('ink',side*12.45,DECK_Y+.010,z,.12,.006,.26);
    }
  }
  if (!japanese) {
    for (const x of [-6.2,6.2]) {
      mark('ink',x,DECK_Y+.010,105.2,.19,.010,29.4);
      mark('shade',x+.29,DECK_Y+.008,105.2,.09,.010,29.4);
    }
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

function gallery(ship, side, x, y, z, length, paint, withPosts = true) {
  const center = side*x;
  ship.block(paint,center,y-.22,z,2.1,.22,length);
  if (withPosts) rail(ship,center+side*.98,y,z-length/2+.2,z+length/2-.2,Math.ceil(length/3.4));
  for (const position of [z-length*.33,z+length*.33]) {
    ship.tube('shade',[center-side*2.0,y-2.15,position],
      [center+side*.83,y-.19,position],.16,.13,6);
  }
}

function ladder(ship, x, y, z, height, width = .55) {
  const rails = [z-width/2,z+width/2];
  for (const end of rails) ship.tube('shade',[x,y,end],[x,y+height,end],.056,.056,5);
  for (let offset=.24;offset<height;offset+=.34) {
    ship.tube('light',[x,y+offset,rails[0]],[x,y+offset,rails[1]],.038,.038,5);
  }
}

function latticeRadar(ship, x, y, z, wide) {
  const w=wide?4.7:2.8, h=wide?1.72:1.07;
  ship.tube('shade',[x,y-.65,z],[x,y+.10,z],.16,.12,7);
  for (const height of [y,y+h]) ship.tube('plate',[x-w/2,height,z],[x+w/2,height,z],.078,.078,6);
  for (let i=0;i<=8;i++) {
    const px=x-w/2+i*w/8;
    ship.tube('shade',[px,y,z],[px,y+h,z],.048,.048,5);
    if (i<8) ship.tube('shade',[px,y,z],[px+w/8,y+h,z],.033,.033,5);
  }
  ship.tube('dark',[x-w*.43,y+h*.49,z-.10],[x+w*.43,y+h*.49,z-.10],.044,.044,5);
}

function carrierGalleries(ship, japanese, beam) {
  const hullPaint=japanese?'green':'steel';
  const supportPaint=japanese?'greenDark':'blue';
  const y=japanese?7.6:9;
  const mainHangarLength=japanese?145:177;
  // Leave a recessed wall behind the galleries. The windows, frames, braces
  // and sponson rails are mesh silhouettes, rather than marks on a slab.
  ship.block(hullPaint,0,y,-4,(beam-2.05)*2,DECK_Y-.66-y,mainHangarLength);
  ship.decoration(() => {
    for (const side of [-1,1]) {
      const frame=side*(beam-1.7);
      for (const z of (japanese?[-58,-37,-16,5,26,47,62]:[-74,-54,-34,-14,6,26,46,66])) {
        const w=japanese?8.7:11.4, h=japanese?2.95:3.65, bottom=y+1.25;
        ship.block('window',frame,bottom,z,1.16,h,w);
        ship.block(hullPaint,frame+side*.68,bottom-.24,z,1.82,.25,w+1.0);
        ship.block(hullPaint,frame+side*.68,bottom+h,z,1.82,.31,w+1.2);
        for (const j of [-1,1]) {
          ship.block(supportPaint,frame+side*.65,bottom,z+j*w*.49,1.60,h,.36);
        }
        for (let n=.32;n<h-.16;n+=.45) {
          ship.block('shade',frame+side*.592,bottom+n,z,.045,.051,w*.86);
        }
      }
      const walkX=japanese?13.9:16.0;
      const walkwayY=japanese?13.45:13.2;
      for (const z of (japanese?[-59,-23,13,52]:[-69,-31,11,57])) {
        gallery(ship,side,walkX,walkwayY,z,japanese?24:27,supportPaint);
        ladder(ship,side*(walkX-.8),walkwayY+.10,z-8.2,2.55);
      }
      // Deck-edge girders and upright columns support the projecting bow/stern.
      for (const z of [-105,-93,-81,78,91,104]) {
        const outside = side*(Math.abs(z)>98?13.5:15.6);
        const inner = side*(beam-3.4);
        const bottom = (Math.abs(z)>98?1.5:.2)+y;
        ship.tube(supportPaint,[inner,bottom,z-2.4],[outside,DECK_Y-.73,z],
          japanese?.25:.33,.19,7);
        ship.tube(hullPaint,[inner,bottom,z+3.5],[outside,DECK_Y-.73,z],
          .16,.12,6);
        ship.block(supportPaint,outside,DECK_Y-.95,z,.29,.34,6.2);
      }
      for (const z of (japanese?[-76,-44,38,70]:[-77,-53,-24,44,76])) {
        const x=side*(japanese?16.45:17.35), sponsonY=11.0+(Math.abs(z)>68?.52:0);
        ship.tube(supportPaint,[x,sponsonY-.58,z],[x,sponsonY,z],2.65,2.84,10,1.46);
        rail(ship,x+side*2.32,sponsonY,z-2.15,z+2.15,3);
        mount(ship,x,sponsonY,z,1.43,z<0,japanese);
      }
      boat(ship,side*(japanese?12.75:14.7),9.8,-22,6.95);
      boat(ship,side*(japanese?12.75:14.7),9.8,-36,5.55);
    }
    // Transverse framing beneath the tips of the two flight decks.
    for (const z of [-114,-100,96,109]) {
      ship.block(supportPaint,0,15.22,z,Math.abs(z)>105?25.5:29.1,.94,.42);
      for (const side of [-1,1]) {
        ship.tube('shade',[side*2.1,10.4,z],[side*12.1,15.68,z],.23,.18,7);
      }
    }
    for (const z of [-102,102]) {
      bollards(ship,2.25,y+1.03,z);
      for (const side of [-1,1]) {
        ship.tube('rope',[side*.53,y+.89,z-5.3],[side*1.12,y+.98,z+2.5],.10,.10,6);
      }
    }
  });
}

function midwayIsland(ship) {
  const x=19.65, z=19.1;
  ship.block('blue',x,13.25,z,7.2,3.6,37.2);
  ship.block('steel',x,DECK_Y,z,6.6,2.6,33);
  cabin(ship,x,DECK_Y+2.6,z+6.0,6.22,2.25,16.8);
  cabin(ship,x,DECK_Y+5.0,z+6.5,5.05,2.06,12.4,'light');
  cabin(ship,x-.37,DECK_Y+7.23,z+6.3,3.88,1.47,7.5);
  stack(ship,x+.16,DECK_Y+2.6,z-6.6,1.82,8.7,'shade');
  ship.decoration(() => {
    for (const side of [-1,1]) {
      gallery(ship,side,side*x+3.96,DECK_Y+5.0,z+5.8,13.5,'shade');
      ship.block('light',x+side*3.70,DECK_Y+5.05,z+9.8,.55,1.14,3.7);
      ship.block(side>0?'starboardLamp':'portLamp',x+side*4.03,DECK_Y+5.34,z+11.1,.25,.35,.46);
      ladder(ship,x+side*3.34,DECK_Y+.15,z-.8,4.4);
    }
    mast(ship,x,DECK_Y+8.86,z+4.0,10.6,true);
    latticeRadar(ship,x,DECK_Y+18.12,z+3.5,true);
    latticeRadar(ship,x+.13,DECK_Y+11.92,z-11.9,false);
    ship.tube('shade',[x,DECK_Y+2.45,z-11.9],[x,DECK_Y+11.92,z-11.9],.24,.13,7);
    for (const offset of [-1.8,1.8]) {
      ship.tube('shade',[x+offset,DECK_Y+13.4,z+3.9],[x+offset,DECK_Y+17.0,z+3.9],.08,.06,5);
      ship.tube('rope',[x+offset,DECK_Y+17.0,z+3.9],[x,DECK_Y+12.4,z-12],.035,.035,5);
    }
    for (const pos of [-14.5,12.8]) {
      ship.tube('light',[x+.65,DECK_Y+3.25,z+pos],[x+.65,DECK_Y+4.35,z+pos],.61,.53,10);
    }
  });
}

function zuihoBridge(ship) {
  // Zuihō's bridge sits under the forward flight deck. The low, bent funnel
  // exits on the starboard side, leaving the flight deck open.
  cabin(ship,0,10.35,88.6,10.0,2.08,7.7,'green');
  cabin(ship,0,12.56,86.8,11.4,2.05,6.6,'green');
  ship.decoration(() => {
    for (const side of [-1,1]) {
      gallery(ship,side,6.1,12.53,88.7,9.6,'greenDark');
      ladder(ship,side*6.76,10.1,85.4,2.52);
    }
    const outlet = [17.2,10.05,-7.3];
    ship.tube('greenDark',[8.9,13.0,-3.4],[12.5,11.65,-5.1],1.42,1.56,12,1.38);
    ship.tube('greenDark',[12.5,11.65,-5.1],outlet,1.56,1.45,12,1.38);
    ship.tube('ink',outlet,add(outlet,[.33,-.12,-.12]),1.46,1.42,12,1.38);
    ship.exhaust(add(outlet,[.49,-.11,-.16]),1.45,[1,.12,-.22]);
    for (const z of [-41,37]) {
      ship.tube('shade',[16.9,12.85,z],[19.25,13.07,z],.14,.08,7);
      mast(ship,18.4,13.0,z,6.6);
      ship.tube('rope',[18.4,18.3,z-.75],[15.9,14.1,z+12],.035,.035,5);
    }
  });
}

function deckCart(ship, x, z, body, long) {
  const y=DECK_Y;
  ship.block('shade',x,y+.31,z,1.45,.25,long);
  ship.block(body,x,y+.56,z-.24,1.32,.51,long*.56);
  ship.block('dark',x,y+.59,z+long*.32,1.24,.30,long*.32);
  for (const shift of [-long*.32,long*.32]) {
    for (const side of [-1,1]) {
      const center=x+side*.68;
      ship.tube('ink',[center-side*.13,y+.31,z+shift],[center+side*.18,y+.31,z+shift],.31,.31,10);
    }
  }
}

function carrierDeckService(ship, japanese) {
  const trim=japanese?'greenDark':'blue';
  ship.decoration(() => {
    // Permanent furniture stays outside the start and landing corridor.
    const platforms=japanese
      ? [[1,-53,16],[-1,53,16],[1,76,11],[-1,-88,12]]
      : [[-1,-15,19],[1,-46,17],[-1,54,15],[1,52,12]];
    for (const [side,z,length] of platforms) {
      const x=side*19.3;
      ship.block(trim,x,DECK_Y-.74,z,4.9,.73,length);
      ship.block('deckPaint',x,DECK_Y-.012,z,4.82,.019,length-.13);
      rail(ship,side*21.60,DECK_Y,z-length*.47,z+length*.47,5);
      for (const dz of [-length*.40,length*.40]) {
        ship.tube('shade',[side*12.2,DECK_Y-3.9,z+dz],[side*20.4,DECK_Y-.75,z+dz],.21,.18,7);
      }
      for(let dz=-length*.40;dz<length*.40;dz+=.85){
        ship.block(japanese?'pale':'cream',side*21.0,DECK_Y+.014,z+dz,.30,.015,.33);
      }
      ship.block(trim,side*20.28,DECK_Y+.05,z+length*.32,1.52,.90,1.74);
      ship.block('rope',side*20.28,DECK_Y+.96,z+length*.32,1.57,.11,1.78);
      ladder(ship,side*21.5,DECK_Y-2.95,z-length*.36,2.95,.70);
    }
    if (japanese) {
      deckCart(ship,19.5,-52,'cargo',2.08);
      for (const z of [49.2,50.25,51.3]){
        ship.tube('canvas',[-19.6,DECK_Y,z],[-19.6,DECK_Y+.84,z],.43,.42,10);
        ship.tube('shade',[-19.6,DECK_Y+.84,z],[-19.6,DECK_Y+.91,z],.44,.44,10);
      }
      gallery(ship,1,8.1,11.15,-94,14.5,trim);
      gallery(ship,-1,8.1,11.15,-94,14.5,trim);
      for(const side of [-1,1]){
        const x=side*12.3;
        ship.tube(trim,[x,13.05,-91],[x+side*3.0,15.72,-94],.13,.11,7);
        ship.tube('rope',[x+side*3.0,15.72,-94],[x+side*3.0,12.1,-94],.048,.048,6);
        ship.block('shade',side*7.25,11.17,-97,2.5,.95,3.7);
      }
    } else {
      // Large service lift at the edge of the flight deck and tow carts.
      ship.block('shade',-19.25,DECK_Y-.55,-15,4.75,.50,17.2);
      deckCart(ship,19.15,-47,'cream',2.6);
      deckCart(ship,-19.30,53,'blue',2.36);
      for (const z of [-53,-50.2,52,55.6]) {
        const x=z<0?20.45:20.14;
        ship.block('canvas',x,DECK_Y+.06,z,1.34,.58,1.62);
        ship.block('rope',x,DECK_Y+.64,z,1.39,.055,.26);
      }
      // Island exterior doors, vents and an elevated signal platform.
      for (const z of [7.1,13.2,20.1,31.6]) {
        ship.block('shade',22.96,DECK_Y+.30,z,.13,1.68,.92);
        ship.block('light',23.035,DECK_Y+1.08,z+.32,.055,.11,.11);
      }
      for (let z=8;z<=16;z+=.66){
        ship.block('ink',22.99,DECK_Y+1.94,z,.12,.11,.41);
      }
      gallery(ship,1,23.45,DECK_Y+7.24,25.4,9.4,trim);
    }
  });
}

function carrier(japanese) {
  const factor = japanese ? 1.744 : 1.35;
  const rawDeck = japanese ? 8.01 : 10.45;
  const ship=new Ship(japanese?'Zuihō light carrier':'USS Midway straight-deck carrier',
    japanese?REFS.zuiho:REFS.midway,0,{scale:1/factor,y:rawDeck-DECK_Y/factor});
  hull(ship,japanese?ZUIHO:CARRIER,{length:japanese?232:246,beam:japanese?22.0:31.8,
    draft:japanese?6.4:8,freeboard:japanese?7.6:9,color:japanese?'green':'blue',
    deck:japanese?'tan':'flightBlue',theme:japanese?'zuiho':'midway'});
  Object.assign(ship.paintProfile,{length:250, deckBeam:35.5});
  carrierGalleries(ship,japanese,japanese?10.4:13.5);
  if (japanese) zuihoBridge(ship);
  else midwayIsland(ship);
  flightDeck(ship,japanese);
  carrierDeckService(ship,japanese);
  return ship;
}

fs.mkdirSync(path.join(ROOT,'assets/ships'),{recursive:true});
japaneseCargo().save('assets/ships/japanese-cargo.glb');
libertyShip().save('assets/ships/liberty.glb');
samidare().save('assets/ships/samidare.glb');
fletcher().save('assets/ships/fletcher.glb');
landing().save('assets/ships/landing-ship.glb');
submarine().save('assets/ships/ko-hyoteki.glb');
carrier(false).save('uss_midway.glb');
carrier(true).save('ijn carrier.glb');
