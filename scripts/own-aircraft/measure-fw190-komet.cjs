#!/usr/bin/env node
'use strict';
// Exterior VISUAL game meshes only. Pixel landmarks from the user's four screenshots.
// No engineering/internal construction geometry. Images are not embedded or redistributed.
const fs=require('node:fs'),path=require('node:path');
const dir=__dirname,round=n=>+n.toFixed(5);
const imageHashes={'IMG_0728.jpeg':'171050bb15ceaf37d675734ff65aeec6a1ab42e9873b03249eec549a73e732b5','IMG_0729.jpeg':'9af400a8f430b939c45e4a566bd5e7157993dd1301844610c8739bc5065d2203','IMG_0730.jpeg':'64ae9e2954a6814eb65ee65549d9eb90ebd32ec065b651fdbd1b84e7159c1434','IMG_0731.jpeg':'0e1fd00c4e428eff3b4c977ddd515e364cdb3a2ea4d4392da92336b790bb9a63'};
function save(id,S){fs.writeFileSync(path.join(dir,id,'shape.json'),JSON.stringify(S,null,2)+'\n');}
const fw=JSON.parse(fs.readFileSync(path.join(dir,'fw190a8/shape.json')));
const me=JSON.parse(fs.readFileSync(path.join(dir,'me163b/shape.json')));
const calibration={
 fw190:{side:{file:'IMG_0730.jpeg',nose:468,tail:1060,axisY:183,metres:8.95},top:{file:'IMG_0728.jpeg',nose:765,tail:1258,centreY:461,tipY:177,span:10.5}},
 me163:{side:{file:'IMG_0731.jpeg',nose:820,tail:1099,axisY:163,metres:5.69},top:{file:'IMG_0731.jpeg',crop:[474,207,829,555],rotateDegrees:-45.88,resample:[1000,1000],nose:[510,135],tail:[497,694],halfSpanPixels:441,span:9.32}}
};
const fz=x=>4.05-(x-468)*8.95/592,fy=y=>(183-y)*8.95/592,ftz=x=>4.05-(x-765)*8.95/493,fx=y=>(461-y)*5.25/284;
// Raw side stations: [pixel x, skin top y, skin bottom y, half breadth in metres].
const fbody=[[610,135,222,.64],[650,134,222,.61],[670,137,220,.59],[700,145,218,.55],[735,145,215,.51],[770,137,211,.47],[805,136,207,.42],[840,141,203,.36],[880,148,199,.29],[920,153,195,.23],[950,154,192,.19],[980,151,188,.15],[1010,151,183,.12],[1040,156,174,.065],[1060,161,161,.001]];
fw.fuselage=fbody.map(([x,t,b,w])=>[fz(x),fy(t),fy(b),w].map(round)).reverse();
// Planform: perpendicular pixel row, leading x, trailing x; port wing of IMG_0728.
const fwing=[[461,864,1000],[426,866,988],[400,873,981],[350,878,977],[300,883,974],[250,887,970],[210,892,966],[195,895,960],[185,901,948],[180,910,938],[177,922,922.2]];
fw.wing=fwing.map(([y,l,t])=>{const s=fx(y);return [s,ftz(l),ftz(t),-.37+Math.max(0,s-.5)*.087,.146-s*.0065].map(round);});
const ftail=[[461,1174,1223],[421,1176,1223],[386,1178,1222],[372,1181,1219],[364,1189,1212],[361,1200,1200.2]];
fw.tail=ftail.map(([y,l,t])=>[fx(y),ftz(l),ftz(t),.42,.09].map(round));
const ffin=[[159,946,1060],[149,960,1058],[135,977,1055],[120,988,1051],[105,998,1048],[94,1008,1041],[88,1018,1032],[86,1025,1025.2]];
fw.fin=ffin.map(([y,l,t])=>[fy(y),fz(l),fz(t),.095-(159-y)*.0007].map(round));
const fcanopy=[[667,135,135,.24],[696,145,120,.29],[731,144,120,.31],[751,144,124,.30],[782,142,130,.23],[805,136,136,.08]];
fw.canopy=fcanopy.map(([x,b,t,w])=>[fz(x),fy(b),fy(t),w].map(round)).reverse();
fw.canopyFrames=[fz(696),fz(731),fz(805)];
fw.cowl=[[fz(610),.65],[fz(592),.678],[fz(550),.678],[fz(522),.64],[fz(508),.59],[fz(505),.54],[fz(505),.46]];
fw.canopyStyle='faceted';fw.canopySeat=[0,.10,.18];
fw.muzzles=[[-.22,.69,3.28],[.22,.69,3.28],[-.92,-.27,2.44],[.92,-.27,2.44],[-2.7,-.14,2.18],[2.7,-.14,2.18]];
const mz=x=>2.8-(x-820)*5.69/279,my=y=>(163-y)*5.69/279;
const mbody=[[824,160,167,.05],[838,151,174,.24],[856,142,184,.40],[875,137,191,.52],[896,144,195,.64],[916,139,195,.72],[928,130,195,.75],[954,133,193,.77],[983,137,190,.64],[1010,142,187,.48],[1034,146,185,.33],[1057,147,186,.25],[1081,149,191,.20],[1099,151,193,.18]];
me.fuselage=mbody.map(([x,t,b,w])=>[mz(x),my(t),my(b),w].map(round)).reverse();
// Digitised/averaged port and starboard edges in the rectified top view. The drawing
// has a slight 1.3% centreline skew; the two sides are averaged, not copied asymmetrically.
const mw=[[0,219,512],[.55,244,501],[.85,272,503],[1.4,301,510],[2,335,519],[2.8,379,533],[3.7,426,549],[4.35,461,561],[4.55,474,565],[4.64,488,555],[4.66,512,540]];
me.wing=mw.map(([s,l,t])=>[s,2.8-(l-135)*5.69/559,2.8-(t-135)*5.69/559,-.20+s*.023,.15-s*.011].map(round));
const mfin=[[147,1017,1099],[139,1027,1098],[122,1037,1097],[104,1047,1096],[92,1056,1093],[87,1065,1086],[86,1074,1074.2]];
me.fin=mfin.map(([y,l,t])=>[my(y),mz(l),mz(t),.1-(147-y)*.0008].map(round));
const mcanopy=[[863,139,139,.22],[880,145,130,.35],[897,145,126,.42],[916,145,126,.43],[928,140,130,.36]];
me.canopy=mcanopy.map(([x,b,t,w])=>[mz(x),my(b),my(t),w].map(round)).reverse();
me.canopyFrames=[mz(863),mz(880),mz(928)];me.canopyStyle='rounded-low';me.canopySeat=[0,.02,1.15];
me.muzzles=[[-.86,-.10,1.30],[.86,-.10,1.30]];
for(const [S,id]of [[fw,'fw190a8'],[me,'me163b']]){
 S.title=S.kind==='fw190'?'Focke-Wulf Fw 190 A-8 — reference reconstruction':'Messerschmitt Me 163 B — reference reconstruction';
 S.revision=2;S.units='metres';S.referenceCalibration=calibration[S.kind];
 S.provenance='New exterior lofts and planforms digitised from user-supplied reference screenshots, with original UVs and procedural paint. No imported mesh or source image pixels in runtime assets.';
 S.assumptions=['Overall dimensions calibrated to museum specifications. Screenshot contours are visual reference, not engineering drawings.', 'Unseen cross-sections, surface thickness, internal cockpit and fittings are visual approximations; no claim of engineering accuracy.', S.kind==='fw190'?'A-8 exterior with the yellow 12 colour arrangement from IMG_0730; minor markings simplified.':'B exterior and grey/green camouflage; no trolley in airborne mission.', 'Flight model, damage and ammunition remain unchanged.'];
 S.references=S.references.filter(r=>!r.userSupplied);S.references.push({userSupplied:true,file:S.kind==='fw190'?'IMG_0728.jpeg; IMG_0729.jpeg; IMG_0730.jpeg':'IMG_0731.jpeg',title:S.kind==='fw190'?'User screenshots IMG_0728 / IMG_0729 / IMG_0730':'User screenshot IMG_0731',role:'Exterior contours, canopy, wing tips, tail and colour arrangement',license:'User-supplied reference; screenshots not redistributed',accessedOn:'2026-10-27'});
 save(id,S);
}
fs.writeFileSync(path.join(dir,'fw190-komet-landmarks.json'),JSON.stringify({imageHashes,calibration,fw190:{body:fbody,wing:fwing,tail:ftail,fin:ffin,canopy:fcanopy},me163:{body:mbody,wingRectified:mw,fin:mfin,canopy:mcanopy}},null,2)+'\n');
console.log('Reference stations written in metres.');
