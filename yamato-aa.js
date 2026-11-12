/* Build 248: the anti-aircraft fit of the battleship Yamato for Sortie 23 "Ten-Go" (a game model, not a rebuild of the real arrangement).
 * The 62 stands are the gun-mount markers of assets/ships/yamato-1945-own.glb (asset.extras.markers: 12 x 127 mm twin, 50 x 25 mm triple; the test compares
 * this table with the model). Starboard is -X, bow +Z, like the model; a bearing is measured from the bow, positive to starboard.
 * Every stand sits on a flank, so its field of fire is derived from its position: abeam, leaning ahead for the bow stands and astern for the stern stands (30 degrees at the ends),
 * +-58 degrees for a 25 mm tub (+-85 for the 127 mm mounts). Nothing fires across the ship (the far-side stands only reach the bow and stern sectors).
 * coverage(b) counts the stands that bear on bearing b; the beams carry all 31 stands of a side, the aft quarters ~18, the stern 4 and the bow no light stand at all; the
 * bow is where the main battery fires its Type 3 scatter shells instead (SANSHIKI: cone, range window, burst radius, damage). Pure data and functions: no THREE, no DOM. */
(function(root){
 'use strict';
 const SANSHIKI={cone:35,minRange:900,maxRange:3500,gap:3.2,radius:90,damage:10,minAlt:20,maxAlt:1200,speed:700,scatter:.02};
 const RANGE={light:2200,heavy:3200};
 const deg=Math.PI/180;
 // starboard stands [calibre mm, x, y, z]; the port side mirrors them
 const STARBOARD=[[127,-9.8,10.72,-34.5],[127,-12.2,13.47,-25.7],[127,-12.7,15.93,-16.5],[127,-12.3,15.64,-4.1],[127,-12.25,14.26,6.9],[127,-12,12.24,16.5],
  [25,-6.8,8.72,-100.5],[25,-10.3,8.82,-90.4],[25,-12.2,8.91,-80.6],[25,-12.9,8.99,-69.9],[25,-14.2,9.01,-60.6],[25,-15.2,9.05,-53.5],[25,-13.6,9.1,-44.7],
  [25,-15.8,9.14,-37.9],[25,-15.9,9.18,-30.9],[25,-16.48,9.21,-25],[25,-16.46,9.24,-18.8],[25,-16.42,9.25,-12.4],[25,-16.28,9.26,-5.83],[25,-16.18,9.25,.92],
  [25,-16.16,9.24,7.8],[25,-16.04,9.25,14.42],[25,-15.8,9.28,21.1],[25,-15.24,9.31,27.97],[25,-15.25,9.41,34.1],[25,-14.71,9.49,40.4],[25,-14.12,9.63,48.5],
  [25,-13.6,9.73,57.1],[25,-12.5,9.86,66.7],[25,-10.7,10.1,76.9],[25,-8.75,10.63,88.8]];
 const wrap=a=>{a=(a+180)%360;if(a<0)a+=360;return a-180;};
 function build(){
  const out=[];
  for(const side of [1,-1]){          // +1 starboard (x < 0), -1 port
   for(const r of STARBOARD){
    const z=r[3],heavy=r[0]===127;
    const centre=side*(90-30*Math.max(-1,Math.min(1,z/100)));       // bow stands lean ahead, stern stands lean astern
    out.push({id:out.length,calibre:r[0],heavy,side,x:side>0?r[1]:-r[1],y:r[2],z,centre,half:heavy?85:58});
   }
  }
  return out;
 }
 const MOUNTS=build();
 const inArc=(m,b)=>Math.abs(wrap(b-m.centre))<=m.half;
 function coverage(bearing,kind){let n=0;for(const m of MOUNTS)if((!kind||(kind==='heavy')===m.heavy)&&inArc(m,bearing))n++;return n;}
 function profile(step=5,kind){const out=[];for(let b=-180;b<180;b+=step)out.push({bearing:b,count:coverage(b,kind)});return out;}
 // thinnest sector outside the bow cone (the bow is the Sanshiki's); ties go to the first found
 function weakest(){let best=null;for(const p of profile(5)){if(Math.abs(p.bearing)<=SANSHIKI.cone)continue;if(!best||p.count<best.count)best=p;}return best;}
 function sector(bearing){const a=Math.abs(wrap(bearing)),s=bearing>0?'starboard':'port';
  return a<=SANSHIKI.cone?'bow':a<=75?s+' bow':a<=105?s+' beam':a<=150?s+' quarter':'stern';}
 // bearing (degrees from the bow, positive to starboard) of a point in the ship frame: local x is positive to port
 const bearingOf=(lx,lz)=>Math.atan2(-lx,lz)/deg;
 const inBowCone=b=>Math.abs(wrap(b))<=SANSHIKI.cone;
 /* One decision step. st = {dead:{mount id:true} of silenced mounts (plain data, survives a checkpoint), lightT, heavyT, sanshikiT}; p = player in the ship frame {x,y,z}.
  * Returns {bearing, sector, bow, light:[mount ids that fire a volley now], heavy:number of 127 mm that fire a burst now (0/1), sanshiki:boolean, engaged:{light,heavy}}.
  * rng() in [0,1). */
 function engage(st,dt,p,rng){
  const bearing=bearingOf(p.x,p.z),out={bearing,sector:sector(bearing),bow:inBowCone(bearing),light:[],heavy:0,sanshiki:false,engaged:{light:0,heavy:0}};
  const lightIn=[],heavyIn=[];
  for(const m of MOUNTS){
   if(st.dead&&st.dead[m.id])continue;
   if(!inArc(m,bearing))continue;
   const d=Math.hypot(p.x-m.x,p.z-m.z);
   if(m.heavy){if(d<RANGE.heavy&&p.y>40)heavyIn.push(m);}
   else if(d<RANGE.light)lightIn.push(m);
  }
  out.engaged.light=lightIn.length;out.engaged.heavy=heavyIn.length;
  st.lightT=(st.lightT??.4)-dt;st.heavyT=(st.heavyT??.8)-dt;st.sanshikiT=(st.sanshikiT??1.2)-dt;
  if(lightIn.length&&st.lightT<=0){
   st.lightT=(5/lightIn.length)*(.8+rng()*.4);          // every stand in its field sends a volley about every 5 s
   out.light.push(lightIn[Math.floor(rng()*lightIn.length)].id);
  }
  if(heavyIn.length&&st.heavyT<=0){
   st.heavyT=(.4+.7*(1-Math.min(1,heavyIn.length/6)))*(.8+rng()*.5);
   out.heavy=1;
  }
  const horiz=Math.hypot(p.x,p.z);
  if(out.bow&&horiz>=SANSHIKI.minRange&&horiz<=SANSHIKI.maxRange&&p.y>=SANSHIKI.minAlt&&p.y<=SANSHIKI.maxAlt&&st.sanshikiT<=0){
   st.sanshikiT=SANSHIKI.gap*(.85+rng()*.3);out.sanshiki=true;
  }
  return out;
 }
 /* A hit silences the stands around it (a bomb or torpedo that opens a flank opens a lane): returns how many were newly silenced. */
 function silence(st,lx,lz,radius){st.dead=st.dead||{};let n=0;for(const m of MOUNTS){if(st.dead[m.id])continue;if(Math.abs(lx)>3&&Math.sign(m.x)!==Math.sign(lx))continue;   // a hit on one flank leaves the other alone
  if(Math.hypot(m.x-lx,m.z-lz)<=radius){st.dead[m.id]=true;n++;}}return n;}
 root.YamatoAA={silence,MOUNTS,SANSHIKI,RANGE,STARBOARD,coverage,profile,weakest,sector,bearingOf,inBowCone,inArc,wrap,engage,count:MOUNTS.length};
 if(typeof module==='object'&&module.exports)module.exports=root.YamatoAA;
})(typeof window!=='undefined'?window:globalThis);
