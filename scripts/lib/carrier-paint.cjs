'use strict';

const {createCanvas} = require('@napi-rs/canvas');

const WIDTH = 2048, HEIGHT = 1024, SIDE = 256, DECK = SIDE * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));

function random(x, y, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1446648777);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function createCarrierPaint(profile) {
  const canvas = createCanvas(WIDTH, HEIGHT), context = canvas.getContext('2d');
  const data = context.createImageData(WIDTH, HEIGHT);
  const japanese = profile.navy === 'japan';
  const steel = rgb(japanese ? '#727a7d' : '#4f5c6c');
  const underwater = rgb(japanese ? '#693b33' : '#613c39');
  const timber = rgb(japanese ? '#a28c66' : '#536071');
  const deckSteel = rgb(japanese ? '#626d71' : '#4b5665');
  for (let py = 0; py < HEIGHT; py++) {
    const isDeck = py >= DECK;
    const side = Math.floor(py / SIDE);
    const x = ((py-DECK)/(HEIGHT-DECK-1)-.5)*profile.deckBeam;
    const y = profile.top-(py%SIDE)/(SIDE-1)*(profile.top+profile.draft);
    for (let px = 0; px < WIDTH; px++) {
      const z = (px/(WIDTH-1)-.5)*profile.length;
      let base, variation;
      if (isDeck) {
        const wood = !japanese || (z > -94 && z < 50);
        base = wood ? timber : deckSteel;
        const row = Math.floor((x+profile.deckBeam/2)/.1524);
        const plank = Math.floor(z/4.8+random(row,0,42));
        const across = ((x+profile.deckBeam/2)/.1524)%1;
        const along = ((z/4.8+random(row,0,42))%1+1)%1;
        const seam = wood ? (across < .07 || along < .018 ? -12 : 0) : 0;
        const board = wood ? (random(row,plank,17)-.5)*15 : 0;
        const grain = Math.sin(z*71+row*3.71)*1.9+Math.sin(z*15+x*91)*1.8;
        const traffic = Math.exp(-Math.pow((z+79)/31,2))*Math.exp(-x*x/25)*7;
        const tyre = Math.exp(-Math.pow((Math.abs(x)-1.45)/.23,2))*Math.exp(-Math.pow((z+87)/19,2))*9;
        variation = board+grain+seam-traffic-tyre+(random(px,py,72)-.5)*4;
      } else {
        base = y < -.45 ? underwater : y < .70 ? [39,43,45] : steel;
        const plateY = (y+profile.draft)/1.1;
        const plateZ = z/8.1+Math.floor(plateY)*.5;
        const seam = plateY-Math.floor(plateY)<.035 || plateZ-Math.floor(plateZ)<.009 ? 3 : 0;
        variation = (random(Math.floor(plateZ),Math.floor(plateY),side+21)-.5)*5-seam;
        variation += Math.sin(z*.33+y*.71)*2.2+Math.sin(z*1.13-y*2.9)*1.5;
        variation += Math.exp(-Math.pow((y-.8)/.6,2))*8;
      }
      const at = (py*WIDTH+px)*4;
      for (let c = 0; c < 3; c++) data.data[at+c] = clamp(base[c]+variation,0,255);
      data.data[at+3] = 255;
    }
  }
  context.putImageData(data,0,0);

  // Original paint wear, in ship coordinates. Rust follows gravity below drains.
  for (let side = 0; side < 2; side++) {
    context.save();
    context.beginPath();context.rect(0,side*SIDE,WIDTH,SIDE);context.clip();
    for (let i = 0; i < 150; i++) {
      const z = (random(i,side,8)-.5)*profile.length;
      const y = 3+random(i,side,9)*(profile.top-4);
      const px = (z/profile.length+.5)*WIDTH;
      const py = (profile.top-y)/(profile.top+profile.draft)*(SIDE-1)+side*SIDE;
      const length = 3+random(i,side,12)*21;
      const gradient = context.createLinearGradient(0,py,0,py+length);
      gradient.addColorStop(0,'rgba(91,48,29,.39)');gradient.addColorStop(1,'rgba(91,48,29,0)');
      context.fillStyle = gradient;context.fillRect(px,py,.5+random(i,side,13)*2.0,length);
    }
    context.restore();
  }

  const point = (x,z) => [(z/profile.length+.5)*(WIDTH-1),DECK+(x/profile.deckBeam+.5)*(HEIGHT-DECK-1)];
  const line = (points, color, width) => {
    context.strokeStyle=color;context.lineWidth=width;context.beginPath();
    points.forEach(([x,z],i) => {const p=point(x,z);i?context.lineTo(...p):context.moveTo(...p);});
    context.stroke();
  };
  // Steel tie-down strips and individual recessed fittings remain legible up close.
  for (let z = -119; z < 120; z += japanese ? 3.4 : 2.44) {
    line([[-profile.deckBeam/2,z],[profile.deckBeam/2,z]],'rgba(30,38,42,.25)',.75);
    for (let x = -12; x <= 12; x += 2.8) {
      const p = point(x,z);
      context.strokeStyle='rgba(27,34,37,.75)';context.lineWidth=.65;
      context.beginPath();context.ellipse(p[0],p[1],.65,1.25,0,0,Math.PI*2);context.stroke();
    }
  }
  if (japanese) {
    const center = point(0,86), rx = 9.5/profile.length*WIDTH, ry = 9.5/profile.deckBeam*(HEIGHT-DECK);
    context.fillStyle='#b5b4a7';context.beginPath();context.ellipse(center[0],center[1],rx+1.4,ry+1.4,0,0,Math.PI*2);context.fill();
    context.fillStyle='#a33c31';context.beginPath();context.ellipse(center[0],center[1],rx,ry,0,0,Math.PI*2);context.fill();
    for (let x=-15; x<15; x+=1.5) {
      const a=point(x,-124.3),b=point(x+1.5,-117.6);
      context.fillStyle=(Math.round((x+15)/1.5)%2)?'#a24436':'#bcbcaf';
      context.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);
    }
    for (let z=-112;z<58;z+=7.5) line([[0,z],[0,z+4.5]],'rgba(218,216,189,.80)',2.2);
    for (const x of [-9.3,9.3]) line([[x,-110],[x,49]],'rgba(218,216,189,.57)',1.5);
    for (const x of [-6,-3,0,3,6]) line([[x,101],[0,110]],'rgba(224,220,199,.77)',1.5);
    for (const z of [5,24]) line([[-13.9,z],[13.9,z]],'rgba(218,216,189,.59)',1.4);
  } else {
    for (let z=-116;z<114;z+=6.7) line([[0,z],[0,z+3.1]],'rgba(199,200,187,.50)',1.5);
    for (const x of [-10.3,10.3]) line([[x,-115],[x,110]],'rgba(178,184,180,.26)',1.0);
    for (const z of [-119,112]) line([[-11,z],[11,z]],'rgba(201,202,186,.48)',1.4);
    for (let z=-110;z<110;z+=12.2) {
      const p=point(10.9,z);
      context.save();context.translate(...p);context.rotate(-Math.PI/2);
      context.fillStyle='rgba(197,199,188,.45)';context.font='7px monospace';context.fillText(String(Math.round((z+122)*3.28084)),0,0);context.restore();
    }
  }
  return canvas.encodeSync('jpeg',94);
}

function carrierUV(profile, material, x, y, z, normalX) {
  const u = (clamp(z/profile.length+.5,0,1)*(WIDTH-1)+.5)/WIDTH;
  const row = material==='deckPaint'
    ? DECK+clamp(x/profile.deckBeam+.5,0,1)*(HEIGHT-DECK-1)+.5
    : (normalX<0?0:SIDE)+clamp((profile.top-y)/(profile.top+profile.draft),0,1)*(SIDE-1)+.5;
  return [u,row/HEIGHT];
}

module.exports={createCarrierPaint,carrierUV};
