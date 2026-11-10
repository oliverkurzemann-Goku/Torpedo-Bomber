'use strict';

// An original albedo atlas for each hull. Port and starboard are painted
// separately, with coordinates in metres so streaks follow gravity and the
// waterline stays continuous across the hull stations.
const { createCanvas } = require('@napi-rs/canvas');

const WIDTH = 1024;
const HEIGHT = 512;
const SIDE_ROWS = 128;
const DECK_START = 2 * SIDE_ROWS;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, t) => a + (b - a) * t;
const fraction = n => n - Math.floor(n);
const smooth = (lo, hi, n) => {
  const t = clamp((n - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const channels = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));

function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1446648777);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y);
  const a = smooth(0,1,x-i), b = smooth(0,1,y-j);
  return mix(mix(hash(i,j,seed),hash(i+1,j,seed),a),
    mix(hash(i,j+1,seed),hash(i+1,j+1,seed),a),b);
}

function stroke(z, origin, y, top, width, drop, distortion) {
  const run = (top - y) / drop;
  if (run < 0 || run > 2) return 0;
  const center = origin + distortion * run;
  const spread = width * (1 - Math.min(.75, run * .5));
  return (1 - smooth(spread * .25, spread, Math.abs(z-center))) * Math.exp(-2.1 * run);
}

function sidePaint(ctx, profile, paint, side) {
  const { length, draft, top, hull, seed, theme } = profile;
  const submarine = theme === 'submarine';
  const ijCarrier = theme === 'zuiho';
  const usCarrier = theme === 'midway';
  const base = channels(paint[hull]);
  const water = channels(submarine ? '#2d3731' : paint.boot);
  const bottom = channels(submarine ? '#2c3335' : paint.redLead);
  const camo = channels('#48574a');
  const rust = channels('#754534');
  const scaleY = top + draft;
  const data = ctx.createImageData(WIDTH, SIDE_ROWS);
  for (let px=0; px<WIDTH; px++) {
    const z = (px/(WIDTH-1)-.5)*length;
    const cell = Math.floor(z/3.1);
    const dripAt = (cell+.18+hash(cell,side,seed)*.61)*3.1;
    const dripWide = .08+hash(cell,side,seed+2)*.22;
    const dripLen = (.18+hash(cell,side,seed+1)*.49) * top;
    const visibleDrip = hash(cell,side,seed+4) > .29;
    for (let py=0; py<SIDE_ROWS; py++) {
      const y = top - py/(SIDE_ROWS-1)*scaleY;
      const grain = hash(px,py,seed+side)*4-2;
      const mottling = (noise(z*.38,y*.65,seed+side)-.5)*13 + (noise(z*1.9,y*4,seed)-.5)*6;
      const salt = smooth(.46,.78,noise(z*.85,y*2.8,seed+9)) *
        (1 - smooth(.28,1.75,Math.abs(y-.45))) * (submarine?8:15);
      const tide = .10 * Math.sin(z*.9) + (noise(z*.8,side,seed)-.5)*.16;
      const width = submarine ? .25 : .85;
      const bootUpper = width + tide;
      const bootLower = -width*.4 + tide;
      const plankY = fraction((y+draft)/.94);
      const buttZ = fraction(z/7.7 + Math.floor((y+draft)/.94)*.37);
      const seam = Math.max(1 - smooth(.009,.035,plankY), 1 - smooth(.001,.013,buttZ));
      const patch = (hash(Math.floor(z/7.7+Math.floor((y+draft)/.94)*.37),Math.floor((y+draft)/.94),seed)-.5)*5;
      const drain = visibleDrip
        ? stroke(z,dripAt,y,top*(.74+hash(cell,side,seed+7)*.22),dripWide,dripLen,.11)
        : 0;
      const anchor = stroke(z,side*.45+length*.394,y,top*.75,length*.0028,top*.81,-.22);
      const rustAlpha = smooth(.12,1,Math.max(drain*.77,anchor*.78)) * (submarine?.19:.78) *
        (.55+.45*noise(z*5.5,y*8,seed+13));
      const camoEdge = Math.sin(z*.062 + side*.54) + .37*Math.sin(z*.114-y*.28) - y*.024;
      const mask = ijCarrier ? smooth(.05,.14,camoEdge) : 0;
      const darkZone = usCarrier ? (1-smooth(top*.44,top*.63,y))*7 : 0;
      const i=(py*WIDTH+px)*4;
      for (let c=0;c<3;c++) {
        const hullColor=mix(base[c],camo[c],mask);
        let val=mix(bottom[c],water[c],smooth(bootLower-.13,bootLower+.13,y));
        val=mix(val,hullColor,smooth(bootUpper-.09,bootUpper+.09,y));
        val=mix(val,rust[c],rustAlpha);
        data.data[i+c]=clamp(val+grain+mottling+salt+patch-seam*(submarine?2:5)-darkZone,0,255);
      }
      data.data[i+3]=255;
    }
  }
  ctx.putImageData(data,0,side*SIDE_ROWS);
}

function deckPaint(ctx, profile, paint) {
  const { length, deckBeam, deck, seed, theme } = profile;
  const carrier = theme === 'zuiho' || theme === 'midway';
  const timber = ['zuiho','liberty','cargo'].includes(theme);
  const base = channels(paint[deck]);
  const camo = channels('#47534c');
  const bare = channels(timber?'#9d8b6d':'#7b8386');
  const rows = HEIGHT-DECK_START;
  const data = ctx.createImageData(WIDTH, rows);
  for(let py=0;py<rows;py++) {
    const x=(py/(rows-1)-.5)*deckBeam;
    for(let px=0;px<WIDTH;px++) {
      const z=(px/(WIDTH-1)-.5)*length;
      const strip = (x+deckBeam/2)/(timber?.42:2.35);
      const section = z/(timber?4.9:7.8)+hash(Math.floor(strip),0,seed)*.97;
      const seam = Math.max(1-smooth(.005,timber?.07:.055,fraction(strip)),
        (1-smooth(.004,.036,fraction(section)))*.65);
      const stagger = (hash(Math.floor(strip),Math.floor(section),seed+3)-.5)*(timber?16:7);
      const worn = smooth(.51,.79,noise(z*.11,x*.21,seed+9))*.43 +
        (1-smooth(.12,.60,Math.abs(x)))*.075;
      const broad = (noise(z*.34,x*.65,seed)-.5)*15;
      const grain = (noise(z*(timber?2.4:3.8),x*(timber?12:5),seed+6)-.5)*(timber?10:5);
      const runway = carrier ? 1-smooth(1.8,9.1,Math.abs(x)) : 0;
      const tracks = runway * ((1-smooth(12,45,Math.abs(z+67)))*.75 +
        (1-smooth(15,54,Math.abs(z-64)))*.39);
      const drag = (1-smooth(.34,1.7,Math.abs(Math.abs(x)-1.62))) *
        (1-smooth(20,56,Math.abs(z+74))) * (.42+noise(z*.14,x,seed)*.58);
      // Original pattern inspired by late-war Japanese carrier camouflage.
      const curve = .63*x + 4.1*Math.sin(z*.039) + 1.4*Math.sin(z*.083);
      const camoMask = theme==='zuiho' ? Math.max(1-smooth(2.8,3.15,Math.abs(x+curve*.28-5)),
        (1-smooth(3.1,3.45,Math.abs(x-curve*.22+5))) *
        (1-smooth(70,90,Math.abs(z+9)))) : 0;
      const center=(py*WIDTH+px)*4;
      for(let c=0;c<3;c++) {
        const original=mix(base[c],camo[c],camoMask*.89);
        const exposed=mix(original,bare[c],worn*(1-camoMask*.62));
        data.data[center+c]=clamp(exposed+broad+grain+stagger-seam*(timber?13:8)-tracks*14-drag*(carrier?17:0),0,255);
      }
      data.data[center+3]=255;
    }
  }
  ctx.putImageData(data,0,DECK_START);
}

function createShipPaint(profile, palette) {
  const canvas = createCanvas(WIDTH,HEIGHT);
  const ctx = canvas.getContext('2d');
  sidePaint(ctx,profile,palette,0);
  sidePaint(ctx,profile,palette,1);
  deckPaint(ctx,profile,palette);
  return canvas.encodeSync('jpeg',88);
}

function paintUV(profile, part, x, y, z, normalX) {
  // A half-texel inset keeps the UVs within their atlas bands.
  const u = (clamp(z/profile.length+.5)*(WIDTH-1)+.5)/WIDTH;
  if(part==='deckPaint'){
    const row=clamp(x/profile.deckBeam+.5)*(HEIGHT-DECK_START-1)+DECK_START+.5;
    return [u,row/HEIGHT];
  }
  const side = normalX<0 ? 0 : 1;
  const row=clamp((profile.top-y)/(profile.top+profile.draft))*(SIDE_ROWS-1)+side*SIDE_ROWS+.5;
  return [u,row/HEIGHT];
}

module.exports = {createShipPaint,paintUV};
