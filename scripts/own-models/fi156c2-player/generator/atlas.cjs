'use strict';
const {deflateSync} = require('node:zlib');

const size = 2048, cell = 512, pad = 12, useful = cell - 2 * pad;
const palettes = {
  light:[159,179,200], green:[78,91,60], dark:[58,70,54],
  rubber:[43,43,38], prop:[54,55,39], hub:[98,103,92],
  inlet:[40,44,38], exhaust:[78,57,43], seat:[84,74,55], glass:[157,191,203],
};
const tiles = ['bodyLeft','bodyRight','upperLeft','upperRight','lowerLeft','lowerRight',
  'plainGreen','plainLight','rubber','prop','hub','inlet','exhaust','seat','glass','trim'];
const clamp = x => Math.min(1,Math.max(0,x));
const smooth = x => { x=clamp(x); return x*x*(3-2*x); };
const blend = (a,b,f) => a.map((x,k)=>x+(b[k]-x)*clamp(f));
const seed = 1561940;
function hash(x,y) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y,668265263);
  n = Math.imul(n ^ n>>>13, 1274126177);
  return ((n ^ n>>>16) >>> 0)/4294967295;
}
function uv(name,u,v) {
  const k=tiles.indexOf(name);
  if(k<0) throw Error('Unknown paint tile '+name);
  return [((k%4)*cell+pad+clamp(u)*(useful-1)+.5)/size,
          (Math.floor(k/4)*cell+pad+clamp(v)*(useful-1)+.5)/size];
}
function cross(u,v,du,dv) {
  const x=Math.abs(u/du), y=Math.abs(v/dv);
  return [Math.min(Math.max(x,y/.24),Math.max(x/.24,y)),Math.min(Math.max(x,y/.38),Math.max(x/.38,y))];
}
const glyphs = { G:['0111','1000','1011','1001','0111'], '7':['1111','0001','0010','0100','0100'],
                 T:['111','010','010','010','010'], K:['1001','1010','1100','1010','1001'] };
function stencil(text,u,v,w,h) {
  const x=Math.floor(u/w), y=Math.floor(v/h), c=text[Math.floor(x/5)];
  return x>=0 && y>=0 && y<5 && c && glyphs[c][y][x%5]==='1';
}
function paint(name,u,v) {
  const body=name.startsWith('body');
  const wing=name.startsWith('upper')||name.startsWith('lower');
  const bottom=name.startsWith('lower')||name==='plainLight';
  const camo=[.12,.27,.37,.52,.66,.78,.91];
  let c=palettes[name]||palettes.green;
  if(body||wing||name==='plainGreen'||name==='trim'){
    const p=u+.14*(Math.abs(v-.36)-.23)+.015*Math.sin(v*13+u*11);
    const edges=camo.map((x,i)=>smooth((p-x+.016+(i%2?.08*v:0))/.032));
    c=blend(palettes.green,palettes.dark,edges.reduce((a,x,i)=>a+(i%2?-x:x),0));
  }
  if(bottom) c=palettes.light;
  if(body){
    c=blend(palettes.light,c,1-smooth((v-.65)/.12));
    const soot=Math.exp(-((v-.72)**2*180))*smooth((u-.063)/.035)*(1-smooth((u-.14)/.28));
    c=blend(c,[58,54,45],soot*.48);
    const oil=Math.exp(-((v-.85)**2*220))*smooth((u-.075)/.035)*(1-smooth((u-.20)/.17));
    c=blend(c,[71,65,52],oil*.41);
    const [black,white]=cross(u-.654,v-.49,.046,.297);
    c=blend(c,[221,222,211],1-smooth((white-1.01)/.045));
    c=blend(c,[34,36,31],1-smooth((black-.88)/.065));
    const letterU=(start)=>name==='bodyLeft'?start+.081-u:u-start;
    if(stencil('G7',letterU(.505),v-.39,.009,.049)||stencil('TK',letterU(.718),v-.39,.009,.049))c=[44,48,39];
    for(const seam of [.181,.463,.837]){
      c=blend(c,[34,39,34],.22*Math.exp(-((u-seam)**2*560000)));
    }
    c=blend(c,[132,121,94],.22*(smooth((v-.78)/.22)));
  }
  if(wing){
    const [black,white]=cross(u-.735,v-.48,.082,.27);
    c=blend(c,[220,221,210],1-smooth((white-1)/.04));
    c=blend(c,[35,36,32],1-smooth((black-.91)/.055));
    c=blend(c,[47,50,40],.25*Math.exp(-((v-.82)**2*1900)));
    const abrasion=.16*(1-smooth((u-.1)/.12))*Math.exp(-((v-.68)**2*16));
    c=blend(c,[140,135,105],abrasion);
  }
  if(name==='rubber') {
    const tread=(Math.sin(u*250)+Math.sin(v*37+u*125))*.035+.11*Math.abs(2*v-1);
    c=blend(c,[103,91,69],tread);
  }
  if(name==='trim') c=blend(c,[30,34,29],.29);
  return c;
}
const table = Array.from({length:256},(_,i)=>{
  for(let n=0;n<8;n++) i=i&1?0xedb88320^(i>>>1):i>>>1;
  return i>>>0;
});
function chunk(name,data) {
  const buf=Buffer.alloc(data.length+12);
  buf.writeUInt32BE(data.length,0);buf.write(name,4);data.copy(buf,8);
  let crc=0xffffffff;
  for(let i=4;i<buf.length-4;i++)crc=table[(crc^buf[i])&255]^(crc>>>8);
  buf.writeUInt32BE((crc^0xffffffff)>>>0,buf.length-4);
  return buf;
}
function png() {
  const step=1+size*3, raw=Buffer.alloc(step*size), header=Buffer.alloc(13);
  header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  for(let y=0;y<size;y++){
    const row=Math.floor(y/cell),v=clamp(((y%cell)-pad)/(useful-1));
    for(let x=0;x<size;x++){
      const col=Math.floor(x/cell),u=clamp(((x%cell)-pad)/(useful-1));
      const name=tiles[row*4+col], c=paint(name,u,v);
      const amount=['glass','seat'].includes(name)?1:1.6;
      const grain=(hash(Math.floor(u*119),Math.floor(v*119))-.5)*amount;
      const at=y*step+1+x*3;
      c.forEach((value,i)=>{raw[at+i]=Math.round(value+grain);});
    }
    for(let x=step-1;x>3;x--)raw[y*step+x]-=raw[y*step+x-3];
    raw[y*step]=1;
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={uv,png};
