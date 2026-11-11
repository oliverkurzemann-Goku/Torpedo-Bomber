'use strict';
const zlib = require('node:zlib');
const clamp = (v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const rgb = hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
const CRC = Uint32Array.from({length:256},(_,i)=>{
  let x=i;for(let b=0;b<8;b++)x=x&1?0xedb88320^(x>>>1):x>>>1;return x>>>0;
});
function chunk(type,data){
  const tag=Buffer.from(type);
  let crc=0xffffffff;
  for(const source of [tag,data])for(const b of source)crc=CRC[(crc^b)&255]^(crc>>>8);
  const first=Buffer.alloc(4),last=Buffer.alloc(4);
  first.writeUInt32BE(data.length);last.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([first,tag,data,last]);
}
const glyphs={
  'F':['111','100','110','100','100'], '1':['010','110','010','010','111'],
  '+':['000','010','111','010','000'], 'X':['101','101','010','101','101'],
  'R':['110','101','110','101','101'], '4':['101','101','111','001','001'],
  '7':['111','001','010','010','010'], '2':['110','001','010','100','111'],
  '3':['110','001','010','001','110'], 'L':['100','100','100','100','111'], '6':['111','100','111','101','111'],
  '8':['111','101','111','101','111'], '5':['111','100','110','001','110'],
  '0':['111','101','101','101','111'],
  'A':['010','101','111','101','101'], 'B':['110','101','110','101','110'],
  'C':['011','100','100','100','011'], 'G':['011','100','101','101','011'],
  'M':['101','111','111','101','101'], 'N':['101','111','111','111','101'],
  'S':['011','100','010','001','110'], 'T':['111','010','010','010','010'],
  'U':['101','101','101','101','111'], 'Y':['101','101','010','010','010'],
  'I':['111','010','010','010','111'],
};
function letters(text,x,y,x0,y0,w,h){
  const u=(x-x0)/w,v=(y-y0)/h;
  if(u<0||u>=1||v<0||v>=1)return false;
  const col=Math.floor(u*(text.length*4-1)),row=Math.floor(v*5);
  return glyphs[text[Math.floor(col/4)]]?.[row]?.[col%4]==='1';
}
function crossMark(x,y,cx,cy,w,h){
  const a=Math.abs((x-cx)/w),b=Math.abs((y-cy)/h);
  if(Math.min(a,b)<.115&&Math.max(a,b)<.47)return 15;
  if(Math.min(a,b)<.19&&Math.max(a,b)<.55)return 14;
  return -1;
}

class Atlas {
  constructor(size, seed, surfaces){
    [this.width,this.height]=Array.isArray(size)?size:[size,size];this.seed=seed;this.surfaces=Object.entries(surfaces);
    if(this.surfaces.length>16)throw Error('Atlas capacity exceeded');
    this.lookup=new Map(this.surfaces.map(([name],i)=>[name,i]));
  }
  uv(name){
    const i=this.lookup.get(name);
    if(i===undefined)throw Error('Missing paint surface '+name);
    const x=i%4,y=Math.floor(i/4);
    return (u,v)=>[(x+.024+.952*clamp(u))/4,(y+.024+.952*clamp(v))/4];
  }
  hash(x,y,salt=0){
    let n=Math.imul(x|0,0x1f123bb5)^Math.imul(y|0,0x4f1bbcdc)^Math.imul(this.seed+salt,0x6c8e9cf5);
    n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);
    return ((n^(n>>>16))>>>0)/4294967295;
  }
  noise(x,y,salt=0){
    const i=Math.floor(x),j=Math.floor(y);
    const u=smooth(0,1,x-i),v=smooth(0,1,y-j);
    return lerp(lerp(this.hash(i,j,salt),this.hash(i+1,j,salt),u),
      lerp(this.hash(i,j+1,salt),this.hash(i+1,j+1,salt),u),v);
  }
  pixel(spec,u,v,px,py,tile){
    const n=this.noise(u*8.1,v*7.3,tile), fine=this.noise(u*37,v*31,tile+4);
    const field=this.noise(u*4.4+.36,v*4.8+.92,tile+28)*.71+.29*this.noise(u*10.2,v*10.7,tile+32);
    const fleck=this.hash(px,py,tile+100);
    const seam=Math.min((u*6)%1,1-(u*6)%1),edge=Math.min(v,1-v);
    let shade=.52+(n-.5)*.43+(fine-.5)*.21+(fleck-.5)*.065;
    let tone=smooth(.40,.65,field);
    if(spec.sample){
      const ink=spec.sample(u,v);
      if(ink!==undefined)return ink;
    }
    if(spec.mode==='stripe'||spec.mode==='zimmerit'){
      const band=.5+.5*Math.sin((u*2.2+v*1.15+(field-.5)*.52)*Math.PI*2);
      tone=smooth(.24,.79,band);
      shade-=.26*smooth(.50,1,v)*(.45+.55*n);
      shade-=.12*(1-smooth(.003,.022,edge));
      if(spec.mode==='zimmerit')shade-=.15*(1-smooth(.035,.13,(u*43)%1))*smooth(.2,.85,v);
    }else if(spec.mode==='tyre'||spec.mode==='track'){
      const joint=(u*(spec.mode==='track'?38:17))%1;
      shade=.46+(fine-.5)*.37-(1-smooth(.09,.20,joint))*.30;
      if(spec.mode==='tyre')shade+=.14*(1-smooth(.06,.19,Math.abs(v-.52)));
    }else if(spec.mode==='aircraft'){
      tone=smooth(.34,.66,field);
      shade-=.16*(1-smooth(.0,.18,u));
      shade-=.14*(1-smooth(.005,.027,seam));
      if(fleck>.995&&edge<.18)shade+=.24;
    }else if(spec.mode==='hull'){
      shade=.58+(n-.5)*.26+(fine-.5)*.19-.18*smooth(.54,.82,v);
      shade-=.18*this.noise(u*57,v*.95,tile)*smooth(.13,.62,v);
      tone=smooth(.36,.70,field)*.65;
    }else if(spec.mode==='deck'){
      const joint=(u*25)%1;
      shade=.54+(fine-.5)*.22-.17*(1-smooth(.03,.12,joint));
      tone=smooth(.37,.72,this.noise(Math.floor(u*25)*.68,v*11,tile))*.72;
    }else if(spec.mode==='corrugated'){
      shade=.52+(fine-.5)*.29+.17*Math.cos(u*Math.PI*84);
      tone=smooth(.40,.69,field);
    }else if(spec.mode==='aradoBody'){
      tone=smooth(.055,.125,v)*(1-smooth(.385,.455,v))*(.34+.66*tone);
      shade-=.17*smooth(.62,.93,v);
      shade-=.14*(1-smooth(.007,.018,seam));
      let mark=crossMark(u,v,.535,.052,.116,.128);
      if(mark<0)mark=crossMark(u,v,.535,.50,.116,.128);
      if(mark>=0)return mark;
      if(letters('F1',1-u,v,.54,.028,.100,.046)||letters('XX',1-u,v,.29,.028,.096,.046)||
         letters('F1',u,v,.31,.476,.100,.046)||letters('XX',u,v,.58,.476,.096,.046))return 15;
    }else if(spec.mode==='wing'){
      const mark=crossMark(u,v,.75,.48,.204,.54);
      if(mark>=0)return mark;
      shade-=.20*Math.exp(-u*10)*(.5+fine*.6);
      shade-=.18*(1-smooth(.005,.021,Math.abs(v-.73)));
      if(v<.055&&fine>.63)shade+=.16;
    }else if(spec.mode==='engine'){
      shade-=.42*(1-smooth(.04,.30,u));
      shade-=.11*(1-smooth(.008,.023,seam));
      shade-=.17*smooth(.64,.84,v)*(1-smooth(.91,.97,v));
      if(u>.94&&fine>.55)shade+=.17;
    }else if(spec.mode==='drone'){
      shade-=.17*smooth(.61,.85,v);
      shade-=.14*(1-smooth(.007,.025,seam));
      if(u>.735)tone=.82+tone*.18;
      if(spec.stencil&&u>.69&&u<.747&&((v>.027&&v<.075)||(v>.468&&v<.522))&&
         (Math.floor((u-.69)*212)+Math.floor(v*80))%4!==0)return 14;
    }else if(spec.mode==='concrete'){
      shade-=.34*smooth(.32,1,v)*(.5+n*.6);
      shade-=.20*this.noise(u*28,v*.9,tile+1)*smooth(.05,.58,v);
      tone=smooth(.42,.67,field);
    }else if(spec.mode==='metal'||spec.mode==='rust'){
      shade-=.23*smooth(.54,.98,v);
      shade-=.20*(1-smooth(.001,.05,edge));
      shade+=.16*(1-smooth(.008,.024,Math.abs(edge-.045)));
      const streak=this.noise(u*45,v*2.1,tile+71);
      tone=Math.max(tone*(spec.mode==='rust'?1:.83),smooth(.63,.81,streak)*smooth(.06,.67,v));
      if(spec.label&&letters(spec.label,u,v,.28,.39,.49,.24))return 14;
    }else if(spec.mode==='wood'){
      shade-=.16*(1-smooth(.014,.048,(v*9)%1));
      shade+=.24*(this.noise(u*4,v*38,tile+8)-.5);
      shade-=.13*smooth(.2,.9,v);
    }else if(spec.mode==='grid'){
      const a=Math.min((u*19)%1,1-(u*19)%1),b=Math.min((v*19)%1,1-(v*19)%1);
      shade-=.42*(1-smooth(.025,.075,Math.min(a,b)));
      shade-=.18*smooth(.45,.95,Math.hypot(u-.5,v-.5)*1.42);
      tone=.12+.67*field;
    }else if(spec.mode==='lens'){
      const rad=Math.hypot(u-.5,v-.5)*2;
      shade=.75-.32*smooth(.18,.98,rad)+.13*(1-smooth(.12,.38,Math.hypot(u-.32,v-.24)));
      shade-=.18*(1-smooth(.02,.08,Math.abs(rad-.83)));
      tone=smooth(.25,1,rad);
    }else if(spec.mode==='net'){
      const a=(u*38+v*27)%1,b=(u*38-v*27+31)%1;
      if(Math.min(a,1-a,b,1-b)>.085&&field<.59)return 0;
      tone=smooth(.43,.63,field);
    }else if(spec.mode==='wreck'){
      shade-=.30*smooth(.20,.72,n);
      tone=smooth(.38,.62,field);
      if(fleck>.992&&field>.44)shade+=.29;
    }else{
      shade-=.12*smooth(.68,.99,v);
    }
    const limit=spec.toneLimit??(spec.reserve?2:3);
    const q=clamp(Math.round(tone*limit),0,limit);
    const s=clamp(Math.round(shade*(q===3?1:3)),0,q===3?1:3);
    return q===3?12+s:q*4+s;
  }
  png(){
    const sideX=this.width/4,sideY=this.height/4,stride=this.width+1;
    const buffer=Buffer.alloc(stride*this.height);
    const palette=Buffer.alloc(256*3),alpha=Buffer.alloc(256,255);
    for(let i=0;i<this.surfaces.length;i++){
      const [,spec]=this.surfaces[i],base=rgb(spec.a),other=rgb(spec.b??spec.a);
      for(let j=0;j<16;j++){
        const blend=Math.min(3,Math.floor(j/4))/3;
        const weight=j>=12?.77+(j%4)*.34:.72+(j%4)*.14;
        const ink=spec.tones?rgb(spec.tones[Math.floor(j/4)]):base.map((v,k)=>lerp(v,other[k],blend));
        const c=spec.inks?.[j]?rgb(spec.inks[j]):j===14?[221,218,206]:j===15?[31,30,28]:ink.map(v=>v*weight);
        c.forEach((v,k)=>{palette[(16*i+j)*3+k]=clamp(Math.round(v),0,255);});
      }
      if(spec.mode==='net')alpha[16*i]=0;
      for(let y=0;y<sideY;y++)for(let x=0;x<sideX;x++){
        const u=clamp((x/(sideX-1)-.024)/.952),v=clamp((y/(sideY-1)-.024)/.952);
        const offset=(Math.floor(i/4)*sideY+y)*stride+1+(i%4)*sideX+x;
        buffer[offset]=i*16+this.pixel(spec,u,v,x,y,i);
      }
    }
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(this.width,0);ihdr.writeUInt32BE(this.height,4);ihdr[8]=8;ihdr[9]=3;
    const pieces=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('sRGB',Buffer.from([0])),chunk('PLTE',palette)];
    if(alpha.some(x=>x!==255))pieces.push(chunk('tRNS',alpha));
    pieces.push(chunk('IDAT',zlib.deflateSync(buffer,{level:9})),chunk('IEND',Buffer.alloc(0)));
    return Buffer.concat(pieces);
  }
}
module.exports={Atlas,smooth,letters,crossMark};
