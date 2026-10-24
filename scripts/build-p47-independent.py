"""Prepare an independently published CC0 P-47 for review.
Never opens a former game-derived P-47. Input is the creator-hosted CC0 GLB,
decoded with glTF-Transform (meshopt); geometry/normal/detail provenance retained.
Requires numpy, scipy, Pillow. glTF axes: X span, Y up, +Z forward, metres.
"""
from pathlib import Path
import json,struct,io,hashlib,math,sys,copy
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.ndimage import distance_transform_edt
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parent.parent
args=[a for a in sys.argv[1:] if a!='--reuse-own-paint'];reusePaint='--reuse-own-paint' in sys.argv
SOURCE=Path(args[0]) if len(args)>0 else ROOT/'build/p47-independent/source-decoded.glb'
OUT=Path(args[1]) if len(args)>1 else ROOT/'build/p47-independent'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE_RECORD=ROOT/'assets/aircraft/source/p47-independent/SOURCE.json'
meta=json.loads(SOURCE_RECORD.read_text());raw=SOURCE.read_bytes();
if hashlib.sha256(raw).hexdigest()!=meta['decodedSha256']:raise ValueError('Decoded input does not match the recorded independent source')
original=SOURCE_RECORD.parent/'original-cc0.glb'
if hashlib.sha256(original.read_bytes()).hexdigest()!=meta['sourceSha256']:raise ValueError('Original independent source hash mismatch')
n=struct.unpack_from('<I',raw,12)[0];src=json.loads(raw[20:20+n]);binary=raw[28+n:]
def read(i):
 a=src['accessors'][i];v=src['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1',5122:'<i2',5120:'i1'}[a['componentType']]);k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
 arr=np.ndarray((a['count'],k),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',k*dt.itemsize),dt.itemsize)).copy()
 if a.get('normalized'):arr=np.maximum(-1,arr.astype(float)/np.iinfo(dt).max)
 return arr
records=[];cid=0
for ni,node in enumerate(src['nodes']):
 for pi,prim in enumerate(src['meshes'][node['mesh']]['primitives']):
  p=read(prim['attributes']['POSITION'])*node.get('scale',[1,1,1])+node.get('translation',[0,0,0]);f=read(prim['indices']).reshape(-1,3).astype(int);norm=read(prim['attributes']['NORMAL']);uv=read(prim['attributes']['TEXCOORD_0'])
  _,inv=np.unique(np.round(p,5),axis=0,return_inverse=True);e=inv[f];g=coo_matrix((np.ones(len(f)*3),(e[:,[0,1,2]].ravel(),e[:,[1,2,0]].ravel())),shape=(inv.max()+1,inv.max()+1));_,lab=connected_components(g,directed=False)
  for c in np.unique(lab[e[:,0]]):
   fi=np.flatnonzero(lab[e[:,0]]==c);ids,new=np.unique(f[fi],return_inverse=True);q=p[ids];records.append({'id':cid,'node':ni,'p':q,'f':new.reshape(-1,3),'n':norm[ids],'uv':uv[ids],'mat':prim['material'],'min':q.min(axis=0),'max':q.max(axis=0)});cid+=1
allp=np.concatenate([r['p'] for r in records]);lo=allp.min(axis=0);hi=allp.max(axis=0)
# The author baked the parked aircraft's ten-degree attitude into its vertices.
# Undo that rigid rotation BEFORE measuring; never stretch axes independently.
datum=Rotation.from_euler('x',10,degrees=True)
aligned=datum.apply(allp);alignedLo=aligned.min(axis=0);alignedHi=aligned.max(axis=0)
scale=12.42/(alignedHi[0]-alignedLo[0]);center=np.array([0,2.25,(lo[2]+hi[2])/2])
def transform(p):return datum.apply(p-center)*scale
# Measurements recorded BEFORE painting. These are source-mesh measurements,
# not an assertion of engineering-authentic Republic station dimensions.
sections=[]
for station in [-4.4,-3.5,-2.5,-1.5,-.5,.5,1.5,2.5,3.5,4.5]:
 points=[]
 for r in records:
  if r['id'] not in [10,300]:continue
  tri=transform(r['p'])[r['f']]
  for a,b in [(0,1),(1,2),(2,0)]:
   u,v=tri[:,a],tri[:,b];hit=(u[:,2]-station)*(v[:,2]-station)<0
   t=(station-u[hit,2])/(v[hit,2]-u[hit,2]);points.extend((u[hit]+(v[hit]-u[hit])*t[:,None]).tolist())
 if points:
  p=np.asarray(points);sections.append({'datumZMetres':station,'xMin':float(p[:,0].min()),'xMax':float(p[:,0].max()),'yMin':float(p[:,1].min()),'yMax':float(p[:,1].max()),'width':float(np.ptp(p[:,0])),'height':float(np.ptp(p[:,1])),'sampledPointsXYMetres':np.unique(p[:,:2].round(6),axis=0).tolist(),'independentStationReference':'PENDING'})
measure={'sourceSpan':float(hi[0]-lo[0]),'sourceLengthProjectedInParkedPose':float(hi[2]-lo[2]),'datumCorrectionDegreesX':10,'singleScale':float(scale),'normalizedSpan':float((alignedHi[0]-alignedLo[0])*scale),'targetSpan':12.42,'targetLength':10.9982,'fitMethod':'Rigid ten-degree ground-attitude correction, then one uniform scale to 12.42 m span. No per-axis stretching.','normalizedLength':float((alignedHi[2]-alignedLo[2])*scale),'sourceBounds':[lo.tolist(),hi.tolist()],'sections':sections,'referenceStatus':'Dimensions/sections measured before paint; original station drawing comparison remains open.','sourceVariant':'P-47D-40-RA','reviewVariant':'P-47D bubbletop, D-28 adaptation under review'}
(OUT/'measurements-before-paint.json').write_text(json.dumps(measure,indent=2)+'\n')
# Remove the D-40 dorsal fillet and ALL source RAF decal geometry. The roundels
# are geometry, not dive brakes. No separately identifiable D-40 recovery flaps
# were found: the underside/variant gate remains pending independent drawings.
raf_decals={83,84,85,86,291,292,293,294,107,108,116,264,267,269,
 109,110,268,271,132,139,143,149,151,247,249,253,256,258,
 197,198,200,202,204,217,219,220,221,223}
removed=[]
for r in records:
 p=r['p'];mn,mx=r['min'],r['max'];c=(mn+mx)/2
 r['remove']=r['id'] in {21,301}|raf_decals
 if r['remove']:removed.append(r['id'])
# Original source propeller and mechanically separate surfaces, never generated discs.
rotor={104,156,189,239,161,176,182}
control={24:'AileronLeft',53:'AileronLeft',51:'AileronRight',80:'AileronRight',26:'FlapLeft',55:'FlapLeft',46:'FlapRight',75:'FlapRight',32:'ElevatorLeft',61:'ElevatorLeft',40:'ElevatorRight',69:'ElevatorRight',19:'Rudder',297:'Rudder'}
tailgear={191,193,195,199,203,207,222}
for r in records:
 c=(r['min']+r['max'])/2
 if r['id'] in rotor:r['group']='Propeller'
 elif r['id'] in control:r['group']=control[r['id']]
 elif r['id'] in tailgear:r['group']='TailGear'
 elif r['node']==2 and 2.2<abs(c[0])<2.65 and 2.3<r['min'][2] and r['max'][2]<3.6 and r['max'][1]<1.7:r['group']='GearLeft' if c[0]<0 else 'GearRight'
 else:r['group']='Static'
 r['wheel']=r['id'] in [101,274,199]
# Entire albedo and service-wear field below is authored here. No prior P-47 atlas,
# normal map, mesh or photographed pixels are read.
font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def text_image(text):
 im=Image.new('RGBA',(1000,300));d=ImageDraw.Draw(im);f=ImageFont.truetype(font,230);bb=d.textbbox((0,0),text,font=f);d.text((15,-bb[1]+10),text,font=f,fill=(22,24,23,255));return np.asarray(im.crop(im.getbbox()))
textmaps={t:text_image(t) for t in ['B','WZ','492024']}
star=Image.new('RGBA',(1000,500));d=ImageDraw.Draw(star);d.rectangle((20,155,980,345),fill=(17,29,44,255));d.rectangle((45,183,955,317),fill=(232,231,220,255));d.ellipse((260,10,740,490),fill=(17,29,44,255));poly=[]
for i in range(10):a=-math.pi/2+i*math.pi/5;rr=210 if i%2==0 else 80;poly.append((500+math.cos(a)*rr,250+math.sin(a)*rr))
d.polygon(poly,fill=(232,231,220,255));star=np.asarray(star)
def stamp(rgb,img,u,v,where):
 good=where&(u>=0)&(u<=1)&(v>=0)&(v<=1)
 if not good.any():return
 h,w=img.shape[:2];col=img[np.clip((v[good]*(h-1)).astype(int),0,h-1),np.clip((u[good]*(w-1)).astype(int),0,w-1)];alpha=col[:,3:4]/255;rgb[good]=rgb[good]*(1-alpha)+col[:,:3]*alpha

def paint(p,n,part):
 x,y,z=p.T;nx,ny,nz=n.T;grain=.5+.5*np.sin(x*133.2+y*91.7+z*173.3)*np.sin(x*49.4-y*67.3+z*37.5)
 panel=1+.013*np.sin(z*8.7+x*.3)+.008*np.sin(x*8.5+y*9.1)
 rgb=np.array([184,187,186])[None,:]*panel[:,None]
 angle=np.arctan2(y-2.25,x);cowl=(z>3.72)&(z<4.93)&(np.abs(x)<.8)
 checks=(np.floor((z-3.72)/.242).astype(int)+np.floor((angle+math.pi)/(2*math.pi)*20).astype(int))%2
 rgb[cowl&(checks==0)]=[20,23,23];rgb[cowl&(checks==1)]=[226,225,215]
 hood=(z>1.32)&(z<3.72)&(np.abs(x)<.34)&(y>2.50);rgb[hood]=[55,61,40]
 fin=(z<-3.5)&(np.abs(x)<.10)&(y>1.2)&(part in [19,20,297,298]);rgb[fin&(y>2.1)&(y<2.27)]=[23,25,24]
 # Both sides use independent readable coordinates.
 for side in [-1,1]:
  skin=(x*side>.05)&(np.abs(nx)>.40)&(y>.55)&(y<2.1)&(z<1.2)&(z>-4.4)&(part in [10,300])
  def uv(lo,hi,bottom,top):
   u=(z-lo)/(hi-lo);return (u if side<0 else 1-u),(top-y)/(top-bottom)
  u,v=uv(-3.35,-1.75,.72,1.55);stamp(rgb,star,u,v,skin)
  for t,lo,hi in [('B',-4.10,-3.45),('WZ',-1.65,-.30)]:
   u,v=uv(lo,hi,.83,1.50);stamp(rgb,textmaps[t],u,v,skin)
  u,v=uv(-4.85,-4.05,1.72,1.91);stamp(rgb,textmaps['492024'],u,v,fin&(x*side>=0))
 wing=(np.abs(x)>2.6)&(z>1)&(z<2.8)
 stamp(rgb,star,(x+5.8)/2.35,(2.75-z)/1.15,wing&(x<0)&(ny>.45))
 stamp(rgb,star,(5.8-x)/2.35,(z-1.60)/1.15,wing&(x>0)&(ny<-.45))
 aft=np.maximum(0,3.72-z)
 exhaust=np.exp(-((y-1.52+.04*aft)/(.09+.035*aft))**2)*np.exp(-aft/1.85)*(z<3.72)*(z>-.3)*(np.abs(x)>.35)*(np.abs(x)<.76)
 oil=np.exp(-((x-.14*np.sin(z))/.18)**2)*np.exp(-np.maximum(0,3.6-z)/3.0)*(y<1.1)*(z<3.6)*(z>-3.5)
 walk=(np.abs(x)>.75)&(np.abs(x)<1.5)&(z>-.05)&(z<1.0)&(ny>.35)
 dirt=np.clip(.45*exhaust+.32*oil+.24*walk*(.5+.5*np.sin(z*21+x*13))+.05*(y<.8),0,.65)
 rgb=rgb*(1-dirt[:,None])+np.array([44,38,30])*dirt[:,None]
 scratch=(grain>.91)&walk;rgb[scratch]=[213,213,203]
 chip=(grain>.94)&(cowl|hood)&(np.sin(z*91+x*75)>.65);rgb[chip]=[160,164,159]
 rough=np.clip(.49+dirt*.5+walk*.14+grain*.04,.4,.90);metal=np.clip(.69-dirt*.9,.12,.69);rough[cowl|hood]=.68;metal[cowl|hood]=.07
 return np.clip(rgb,0,255).astype(np.uint8),np.stack([np.ones(len(p)),rough,metal],axis=1)*255
# Rasterize source-coordinate triangles onto four 1024 quadrants of a new atlas.
Q=1024;size=2048;atlas=np.zeros((size,size,3),np.uint8);mr=np.zeros_like(atlas)
for mi in ([] if reusePaint else range(4)):
 col=np.full((Q,Q,3),[184,187,186],np.uint8);rm=np.full((Q,Q,3),[255,145,150],np.uint8);mask=np.zeros((Q,Q),bool)
 for r in records:
  if r['remove'] or r['mat']!=mi:continue
  pixels=r['uv']*(Q-1)
  for f in r['f']:
   a,b,c=pixels[f];low=np.maximum(0,np.floor(np.minimum(np.minimum(a,b),c)).astype(int));high=np.minimum(Q-1,np.ceil(np.maximum(np.maximum(a,b),c)).astype(int))
   if np.any(high<low):continue
   yy,xx=np.mgrid[low[1]:high[1]+1,low[0]:high[0]+1];v0=b-a;v1=c-a;det=v0[0]*v1[1]-v0[1]*v1[0]
   if abs(det)<1e-10:continue
   dx=xx-a[0];dy=yy-a[1];u=(dx*v1[1]-dy*v1[0])/det;v=(v0[0]*dy-v0[1]*dx)/det;inside=(u>=-1e-4)&(v>=-1e-4)&(u+v<=1.0001)
   if not inside.any():continue
   bary=np.stack([1-u[inside]-v[inside],u[inside],v[inside]],1);p=bary@r['p'][f];no=bary@r['n'][f];rgb,rmc=paint(p,no,r['id']);ys=yy[inside];xs=xx[inside];col[ys,xs]=rgb;rm[ys,xs]=rmc;mask[ys,xs]=True
 if mask.any():
  _,ids=distance_transform_edt(~mask,return_indices=True);col=col[ids[0],ids[1]];rm=rm[ids[0],ids[1]]
 row,colq=mi//2,mi%2;atlas[row*Q:(row+1)*Q,colq*Q:(colq+1)*Q]=col;mr[row*Q:(row+1)*Q,colq*Q:(colq+1)*Q]=rm
 print('painted quadrant',mi,flush=True)
if not reusePaint:
 Image.fromarray(atlas).save(OUT/'p47-independent-livery.jpg',quality=94);Image.fromarray(mr).save(OUT/'p47-independent-surface.png',optimize=True)
# New uncompressed GLB writer, keeping reusable source materials only for CC0 detail/glass.
buf=bytearray();doc={'asset':{'version':'2.0','generator':'Squadron independent P-47 preparation','copyright':'Base source CC0 mgg8 / Aviation Gazetteer; new paint and adaptation copyright Oliver Kurzemann. No public dedication of the new project work.','extras':{'title':'P-47D bubbletop — independent CC0-source review model','author':'mgg8 / Aviation Gazetteer (https://sketchfab.com/mgg8)','license':'Base model: CC0-1.0 (http://creativecommons.org/publicdomain/zero/1.0/). New adaptation: original project work; all reserved rights of Oliver Kurzemann.','source':meta['sourceUrl'],'sourceSha256':meta['sourceSha256'],'changes':'New silver/checkerboard livery and service wear; CC0 detail palette retained; original four-blade propeller, gear and control surfaces separated; D-40 dorsal fillet and source RAF decal geometry omitted for D-28 review adaptation. Original Republic cross-sections, underside variant check and physical-iPad acceptance remain pending.'}},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'P47D_Independent_v1','children':[],'extras':{'nativeAircraft':'p47-independent-v1','sourceVariant':'P-47D-40-RA','variantReview':'D-28 adaptation; original station verification pending','spanMetres':float((alignedHi[0]-alignedLo[0])*scale),'calibratedMetres':True,'sourceSha256':meta['sourceSha256']}}],'meshes':[],'materials':[],'bufferViews':[],'accessors':[],'buffers':[{}],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'animations':[]}
def view(data,target=None):
 while len(buf)%4:buf.append(0)
 start=len(buf);buf.extend(data);v={'buffer':0,'byteOffset':start,'byteLength':len(data)}
 if target:v['target']=target
 doc['bufferViews'].append(v);return len(doc['bufferViews'])-1
def accessor(a,kind,target=None):
 a=np.ascontiguousarray(a);ct=5126 if a.dtype.kind=='f' else 5125;v=view(a.tobytes(),target);d={'bufferView':v,'componentType':ct,'count':len(a),'type':kind}
 if kind=='VEC3' and target==34962:d.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
 doc['accessors'].append(d);return len(doc['accessors'])-1
def texture(data,mime,name):
 doc['images'].append({'bufferView':view(data),'mimeType':mime,'name':name});doc['textures'].append({'source':len(doc['images'])-1,'sampler':0});return len(doc['textures'])-1
al=texture((OUT/'p47-independent-livery.jpg').read_bytes(),'image/jpeg','Own checkerboard/silver livery');pr=texture((OUT/'p47-independent-surface.png').read_bytes(),'image/png','Own service-wear surface')
doc['materials'].append({'name':'Own P-47 silver/checkerboard service paint','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':al},'metallicRoughnessTexture':{'index':pr},'metallicFactor':1,'roughnessFactor':1}})
# Retain only palette textures used by the CC0 cockpit, tyres, engine and glass.
textureMap={}
for mi in range(4,10):
 mat=copy.deepcopy(src['materials'][mi]);mat['name']='CC0 source '+mat['name']
 for key in ['baseColorTexture','metallicRoughnessTexture']:
  tx=mat.get('pbrMetallicRoughness',{}).get(key)
  if not tx:continue
  old=tx['index']
  if old not in textureMap:
   t=src['textures'][old];ii=t.get('source',t.get('extensions',{}).get('EXT_texture_webp',{}).get('source'));im=src['images'][ii];bv=src['bufferViews'][im['bufferView']];image=Image.open(io.BytesIO(binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGBA');s=io.BytesIO();image.save(s,format='PNG');textureMap[old]=texture(s.getvalue(),'image/png','CC0 '+im.get('name','detail'))
  tx['index']=textureMap[old]
 doc['materials'].append(mat)
pivots={'Static':[0,0,0],'Propeller':[0,2.545,4.97],'GearLeft':[-2.485,1.588,2.705],'GearRight':[2.485,1.588,2.705],'TailGear':[0,.36,-3.384],'FlapLeft':[-2.185,1.20,.73],'FlapRight':[2.185,1.20,.73],'AileronLeft':[-4.79,1.52,1.45],'AileronRight':[4.79,1.52,1.45],'ElevatorLeft':[-1.285,.80,-4.57],'ElevatorRight':[1.285,.80,-4.57],'Rudder':[0,1.5,-4.65]}
pivots['Propeller']=next(r for r in records if r['id']==161)['p'].mean(axis=0).tolist()
groupNodes={}
# Shaft direction is measured from the original source's cylindrical shaft.
shaft=next(r for r in records if r['id']==176)['p'];vals,vec=np.linalg.eigh(np.cov(shaft.T));axis=vec[:,-1];axis*=1 if axis[2]>0 else -1;axis=datum.apply(axis)
propRest=Rotation.align_vectors([axis],[[0,0,1]])[0]
for name,pivot in pivots.items():
 idx=len(doc['nodes']);groupNodes[name]=idx;doc['nodes'][0]['children'].append(idx);position=np.zeros(3) if name=='Static' else transform(np.array(pivot));doc['nodes'].append({'name':name,'translation':position.tolist(),'children':[],'extras':{'articulationPart':True} if name!='Static' else {}})
 if name=='Propeller':doc['nodes'][-1]['rotation']=propRest.as_quat().tolist()
# Batch static geometry and moving parts per material, retaining individual tyre meshes.
buckets={}
for r in records:
 if r['remove']:continue
 material=0 if r['mat']<4 else r['mat']-3;key=(r['group'],material,r['id'] if r['wheel'] else -1);buckets.setdefault(key,[]).append(r)
for (group,material,wheel),rs in buckets.items():
 ps=[];ns=[];uvs=[];faces=[];offset=0;pivot=np.zeros(3) if group=='Static' else transform(np.array(pivots[group]))
 for r in rs:
  p=transform(r['p'])-pivot;no=datum.apply(r['n']);uv=r['uv'].copy()
  if group=='Propeller':p=propRest.inv().apply(p);no=propRest.inv().apply(no)
  if r['mat']<4:uv=(uv+np.array([r['mat']%2,r['mat']//2]))/2
  ps.append(p);ns.append(no);uvs.append(uv);faces.append(r['f']+offset);offset+=len(p)
 p=np.concatenate(ps).astype('<f4');no=np.concatenate(ns).astype('<f4');uv=np.concatenate(uvs).astype('<f4');f=np.concatenate(faces).astype('<u4').ravel();prim={'attributes':{'POSITION':accessor(p,'VEC3',34962),'NORMAL':accessor(no,'VEC3',34962),'TEXCOORD_0':accessor(uv,'VEC2',34962)},'indices':accessor(f,'SCALAR',34963),'material':material}
 mesh=len(doc['meshes']);doc['meshes'].append({'name':group+(' tyre' if wheel>=0 else ' skin'),'primitives':[prim]});idx=len(doc['nodes']);doc['nodes'][groupNodes[group]]['children'].append(idx);node={'name':group+('Tyre' if wheel>=0 else 'Mesh')+str(material),'mesh':mesh}
 if wheel>=0:node['extras']={'groundWheel':True}
 doc['nodes'].append(node)
# Empty markers are intentionally real model-space attachment points.
for side,ids in [(-1,[94,92,90,88]),(1,[284,286,288,290])]:
 for k,cid in enumerate(ids):
  r=next(r for r in records if r['id']==cid);p=transform(r['p'].mean(axis=0)+[0,0,.005]);doc['nodes'][0]['children'].append(len(doc['nodes']));doc['nodes'].append({'name':('GunMuzzleLeft' if side<0 else 'GunMuzzleRight')+str(k+1),'translation':p.tolist(),'extras':{'sourceMouthComponent':cid}})
def quat(axis,a):
 q=[0,0,0,math.cos(a/2)];q[axis]=math.sin(a/2);return q

def clip(name,tracks,times):
 anim={'name':name,'channels':[],'samplers':[]};ta=accessor(np.asarray(times,dtype='<f4')[:,None],'SCALAR')
 for group,axis,angles in tracks:
  qs=[quat(axis,a) for a in angles]
  if group=='Propeller':qs=[(propRest*Rotation.from_quat(q)).as_quat() for q in qs]
  va=accessor(np.asarray(qs,dtype='<f4'),'VEC4');anim['samplers'].append({'input':ta,'output':va,'interpolation':'LINEAR'});anim['channels'].append({'sampler':len(anim['samplers'])-1,'target':{'node':groupNodes[group],'path':'rotation'}})
 doc['animations'].append(anim)
clip('Propeller_Spin',[('Propeller',2,[0,math.pi/2,math.pi,math.pi*1.5,math.pi*2])],[0,.25,.5,.75,1])
clip('Gear_Retract',[('GearLeft',2,[0,1.48]),('GearRight',2,[0,-1.48]),('TailGear',0,[0,1.30])],[0,3])
clip('Landing_Flaps',[('FlapLeft',0,[0,-.66]),('FlapRight',0,[0,-.66])],[0,2])
clip('Flight_Controls',[('AileronLeft',0,[0,.22,0,-.22,0]),('AileronRight',0,[0,-.22,0,.22,0]),('ElevatorLeft',0,[0,.25,0,-.25,0]),('ElevatorRight',0,[0,.25,0,-.25,0]),('Rudder',1,[0,.20,0,-.20,0])],[0,.5,1,1.5,2])
for node in doc['nodes']:
 if not node.get('children'):node.pop('children',None)
doc['buffers'][0]['byteLength']=len(buf);js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);buf+=b'\0'*((-len(buf))%4);glb=struct.pack('<III',0x46546c67,2,28+len(js)+len(buf))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(buf),0x004e4942)+buf;(OUT/'p47-independent-unsimplified.glb').write_bytes(glb)
provenance={'source':meta,'outputSha256':hashlib.sha256(glb).hexdigest(),'outputBytes':len(glb),'trianglesBeforeOptimization':sum(len(r['f']) for r in records if not r['remove']),'meshes':len(doc['meshes']),'removedSourceComponentIds':removed,'removedRAFDecalIds':sorted(raf_decals),'propellerShaftDirection':axis.tolist(),'measurements':measure,'newPaint':'Own deterministic paint() function; source paint atlas and normal maps not sampled.','retainedCC0Components':'Original body/cockpit/engine/gear/propeller/control geometry and small detail palette.','notUsed':'No former War Thunder P-47 data or texture pixels.','acceptance':'Review candidate; original station comparison, underside variant and physical iPad test pending.'}
(OUT/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n');print(json.dumps({'output':str(OUT/'p47-independent-unsimplified.glb'),'bytes':len(glb),'triangles':provenance['trianglesBeforeOptimization'],'meshes':len(doc['meshes']),'length':measure['normalizedLength'],'removed':removed}),flush=True)
