"""P-47 photo-livery derivative. Uses the supplied detailed model, NOT original geometry.
Axes X span, Y up, Z nose; dimensions normalized to 12.42 x 11.02 metres.
Requires numpy, scipy, Pillow. The original GLB must accompany this source.
"""
from pathlib import Path
import struct, json, io, hashlib, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.ndimage import distance_transform_edt

ROOT=Path(__file__).parent
OUT=Path(next((a.split('=',1)[1] for a in sys.argv[1:] if a.startswith('--output=')),str(ROOT.parent/'build/p47-weathered')));OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT.parent/'p47new.glb'
if not SOURCE.exists(): SOURCE=ROOT/'source-p47.glb'
raw=SOURCE.read_bytes();jl=struct.unpack_from('<I',raw,12)[0]
src=json.loads(raw[20:20+jl]);binary=raw[28+jl:]
def read(i):
 a=src['accessors'][i];v=src['bufferViews'][a['bufferView']]
 k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
 dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']])
 return np.ndarray((a['count'],k),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',k*dt.itemsize),dt.itemsize)).copy()
def image_read(i):
 v=src['bufferViews'][src['images'][i]['bufferView']]
 return Image.open(io.BytesIO(binary[v['byteOffset']:v['byteOffset']+v['byteLength']])).copy()
def components(p,f):
 graph=coo_matrix((np.ones(len(f)*3),(f[:,[0,1,2]].ravel(),f[:,[1,2,0]].ravel())),shape=(len(p),len(p)))
 _,lab=connected_components(graph,directed=False)
 return [np.where(lab[f[:,0]]==k)[0] for k in np.unique(lab[f[:,0]])]

allp=np.concatenate([read(m['primitives'][0]['attributes']['POSITION']) for m in src['meshes']])
scale=float(12.42/np.ptp(allp[:,0]));zs=float(11.02/np.ptp(allp[:,1]));zc=float((allp[:,1].min()+allp[:,1].max())/2)
def transform(p):return p[:,[0,2,1]]*np.array([scale,scale,-zs])+[0,0,zc*zs]
def transform_normal(n):
 n=n[:,[0,2,1]]*np.array([1/scale,1/scale,-1/zs]);return n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-9)

star=Image.new('RGBA',(1000,500));d=ImageDraw.Draw(star)
d.rectangle((30,169,970,331),fill=(14,28,45,255));d.rectangle((54,193,946,307),fill=(236,236,225,255));d.ellipse((260,10,740,490),fill=(14,28,45,255))
pts=[]
for i in range(10):
 a=-math.pi/2+i*math.pi/5;r=213 if i%2==0 else 82;pts.append((500+math.cos(a)*r,250+math.sin(a)*r))
d.polygon(pts,fill=(236,236,225,255));star=np.asarray(star)
fontfile=str(ROOT/'DejaVuSans.ttf') if (ROOT/'DejaVuSans.ttf').exists() else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def text_image(text):
 im=Image.new('RGBA',(1200,280));d=ImageDraw.Draw(im);font=ImageFont.truetype(fontfile,240);b=d.textbbox((0,0),text,font=font);d.text(((1200-b[2])/2,-b[1]+8),text,font=font,fill=(15,18,18,255));return np.asarray(im.crop(im.getbbox()))
texts={t:text_image(t) for t in ['B','WZ','A','549385']}
def stamp(rgb,pos,bitmap,u,v,where):
 h,w=bitmap.shape[:2];valid=where&(u>=0)&(u<=1)&(v>=0)&(v<=1)
 if not np.any(valid):return
 ix=np.clip((u[valid]*(w-1)).astype(int),0,w-1);iy=np.clip((v[valid]*(h-1)).astype(int),0,h-1)
 c=bitmap[iy,ix];alpha=c[:,3:4]/255;rgb[valid]=rgb[valid]*(1-alpha)+c[:,:3]*alpha

def paint(p,n,kind):
 x,y,z=p.T;nx,ny,nz=n.T
 # Subtle sheet-to-sheet tone and brushed grain; actual rivets/panels remain in the source normal map.
 tone=1+.016*np.sin(z*8.4+x*.3)+.008*np.sin(x*90+y*73+z*32)
 rgb=np.array([187,188,181])[None,:]*tone[:,None]
 angle=np.arctan2(y+.11,x)
 cowl=(z>3.77)&(z<4.91)&(np.abs(x)<.95)
 checks=(np.floor((z-3.77)/.228).astype(int)+np.floor((angle+math.pi)/(2*math.pi)*28).astype(int))%2
 rgb[cowl&(checks==0)]=[21,23,22];rgb[cowl&(checks==1)]=[226,225,211]
 olive=((z>1.73)&(z<3.77)&(y>.4)&(np.abs(x)<.48))|((z<-.29)&(z>-3.8)&(y>.35)&(y<.68)&(np.abs(x)<.28))
 rgb[olive]=[57,62,37]
 fin=(z<-3.4)&(np.abs(x)<.20)&(y>.45)
 rgb[fin&(y>1.05)&(y<1.29)]=[20,22,21]
 stab=(z<-3.65)&(np.abs(x)>.28)&(y>.18)&(y<.55)
 rgb[stab&(z>-4.87)&(z<-4.57)]=[20,22,21]
 side=(np.abs(nx)>.45)&(z<.25)&(np.abs(x)<.9)&(y>-.55)&(y<.6)
 # Independent side mappings keep the lettering readable, never mirrored.
 for sign in [-1,1]:
  w=side&(x*sign>0)
  def uv(z0,z1,y0,y1):
   u=(z-z0)/(z1-z0);return (1-u if sign>0 else u),(y1-y)/(y1-y0)
  u,v=uv(-2.98,-1.25,-.45,.40);stamp(rgb,p,star,u,v,w)
  if sign<0:
   for t,lo,hi in [('B',-3.88,-3.03),('WZ',-1.20,.10)]:
    u,v=uv(lo,hi,-.35,.38);stamp(rgb,p,texts[t],u,v,w)
  else:
   for t,lo,hi in [('WZ',-1.18,.10),('A',-3.88,-3.05)]:
    u,v=uv(lo,hi,-.35,.38);stamp(rgb,p,texts[t],u,v,w)
  u,v=uv(-5.09,-3.94,.66,.84);stamp(rgb,p,texts['549385'],u,v,fin&(x*sign>=0))
 # One upper and the opposite lower wing marking, measured in the aircraft's coordinate frame.
 upper=(x< -2.6)&(ny>.45);lower=(x>2.6)&(ny<-.45)
 u=(x+5.55)/2.3;v=(z-.80)/1.15;stamp(rgb,p,star,u,v,upper)
 u=(5.55-x)/2.3;v=(2.00-z)/1.15;stamp(rgb,p,star,u,v,lower)
 # Baked, deterministic service wear: no runtime decals or extra draw calls.
 grain=.5+.5*np.sin(x*143.7+y*71.3+z*107.9)*np.sin(x*61.1-y*97.7+z*47.3)
 blotch=np.clip(.55+.25*np.sin(x*13.4+z*7.9)+.2*np.sin(y*23.1-z*18.7),.1,1)
 aft=np.maximum(0,3.55-z)
 side_skin=(np.abs(x)>.42)&(np.abs(x)<1.02)&(z<3.55)&(z>-.6)
 exhaust=np.exp(-((y+.43+.045*aft)/(.10+.06*aft))**2)*np.exp(-aft/1.25)*side_skin
 exhaust*=np.clip(1.1+.3*np.sin(z*18+y*35)+.25*np.sin(z*41-y*17),.35,1.4)
 belly=(np.abs(x)<.61)&(y<-.52)&(z<3.8)&(z>-2.3)
 oil=np.exp(-((x-.16*np.sin(z*1.7))/.19)**2)*np.exp(-np.maximum(0,3.3-z)/2.8)*belly
 oil+=.6*np.exp(-((np.abs(x)-.51)/.065)**2)*np.exp(-np.maximum(0,3.6-z)/1.6)*(y<-.42)*(z<3.6)*(z>1.0)
 walk=(np.abs(x)>.78)&(np.abs(x)<1.42)&(z>.55)&(z<1.70)&(y>-.52)&(y<.2)
 dust=np.clip((-y-.13)*.14,0,.15)*(z>-4.9)*(z<4.8)
 grime=np.clip(.47*exhaust+.31*oil+.18*walk*blotch+dust*blotch,0,.62)
 rgb=rgb*(1-grime[:,None])+np.array([43,36,27])*grime[:,None]
 # Thin aft-running fluid threads, worn walkways, scuffed access panels and paint edges.
 threads=(np.sin(x*136+y*23+z*5)>.94)*(oil>.15)*(grain>.45)
 rgb[threads]=rgb[threads]*.65
 scratch=(grain>.87)&walk;rgb[scratch]=np.minimum(220,rgb[scratch]+39)
 chipped=(grain>.91)&(cowl|olive|fin)&(np.sin(z*91+x*57)>.35)
 rgb[chipped]=np.array([168,169,161])
 # Residue behind the eight .50-calibre ports, confined to their wing surfaces.
 gun=np.zeros(len(p))
 for station in [2.04,2.28,2.52,2.76]:
  gun+=np.exp(-((np.abs(x)-station)/.052)**2)*np.exp(-((z-2.02)/.55)**2)
 gun*=((np.abs(x)>1.7)&(np.abs(x)<3.2)&(y>-.5)&(y<.13)&(z<2.65))
 rgb*=1-np.minimum(.29,gun*.24)[:,None]
 rough=np.clip(.43+grime*.48+walk*.13+grain*.045,.40,.83)
 metal=np.clip(.68-grime*.7-walk*.15,.12,.68)
 rough[cowl|olive|fin&(y>1.05)&(y<1.29)]=.63
 metal[cowl|olive|fin&(y>1.05)&(y<1.29)]=.12
 return np.clip(rgb,0,255).astype(np.uint8),np.stack([np.ones(len(p)),rough,metal],axis=1)*255

def bake_atlas(records):
 size=2048;original=np.asarray(image_read(1).convert('RGB')).copy();atlas=original.copy();mr=np.zeros((size,size,3),np.uint8);mr[:]=[255,155,75];covered=np.zeros((size,size),bool)
 for mi,p,n,uv,f in records:
  for fs in components(p,f):
   verts=np.unique(f[fs]);q=p[verts];lo=q.min(0);hi=q.max(0);span=hi-lo
   # Exterior skins, control surfaces and cowl; preserve cockpit internals and tiny fittings.
   exterior=(len(fs)>100 and (span[0]>1.0 or span[2]>1.2 or (lo[2]<-3.4 and hi[1]>.9)))
   exterior|=(lo[2]>3.5 and hi[2]<4.94 and len(fs)>24 and span.max()>.3)
   if lo[2]>4.90 or not exterior:continue
   for tri in f[fs]:
    # The supplied OBJ-to-GLB uses V in [-1,0] with REPEAT wrapping.
    t=(uv[tri]+[0,1])*(size-1);xmin=max(0,int(np.floor(t[:,0].min())));xmax=min(size-1,int(np.ceil(t[:,0].max())));ymin=max(0,int(np.floor(t[:,1].min())));ymax=min(size-1,int(np.ceil(t[:,1].max())))
    if xmin>xmax or ymin>ymax:continue
    xx,yy=np.meshgrid(np.arange(xmin,xmax+1),np.arange(ymin,ymax+1));a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(den)<1e-7:continue
    w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1;inside=(w0>=-.002)&(w1>=-.002)&(w2>=-.002)
    if not inside.any():continue
    weights=np.stack([w0[inside],w1[inside],w2[inside]],axis=1);wp=weights@p[tri];wn=weights@n[tri]
    colour,surface=paint(wp,wn,'skin');atlas[yy[inside],xx[inside]]=colour;mr[yy[inside],xx[inside]]=surface;covered[yy[inside],xx[inside]]=True
 # 3px colour dilation suppresses UV-seam bleed without painting adjacent unrelated islands.
 dist,nearest=distance_transform_edt(~covered,return_indices=True);pad=(dist<=3)&~covered
 atlas[pad]=atlas[nearest[0][pad],nearest[1][pad]];mr[pad]=mr[nearest[0][pad],nearest[1][pad]]
 im=Image.fromarray(atlas);im.save(OUT/'p47-weathered-albedo.png');surface=Image.fromarray(mr);surface.save(OUT/'p47-weathered-metalrough.png');return im,surface

records=[]
for mi in [1,2]:
 pr=src['meshes'][mi]['primitives'][0];attrs=pr['attributes'];records.append((mi,transform(read(attrs['POSITION'])),transform_normal(read(attrs['NORMAL'])),read(attrs['TEXCOORD_0']),read(pr['indices']).reshape(-1,3)))
print('Baking service wear and photo livery onto existing UVs',flush=True);newskin,metalrough=bake_atlas(records)

g={'asset':{'version':'2.0','generator':'P47 photo-livery rebuild v2','extras':{'title':'P-47D Bubble Canopy — photo livery v2','provenance':'DERIVATIVE of supplied KojfDiscord/War Thunder model; not independent original geometry. New livery baked procedurally from user photo, source normal and interior textures retained.','sourceAsset':src['asset'].get('extras',{}),'changes':'Normalized axes/dimensions, replaced exterior paint, separated original rotor/control surfaces, added articulated gear.','units':'metres','axes':'X span, Y up, +Z nose'}} ,'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'P47D_PhotoLivery_v2','children':[]}],'meshes':[],'materials':[],'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'accessors':[],'bufferViews':[],'buffers':[{}]}
data=bytearray()
g['asset']['generator']='P47 weathered native game asset v3'
g['asset']['extras'].update(title='P-47D Bubble Canopy — operational wear v3 (War Thunder derivative)',author=src['asset']['extras']['author'],license=src['asset']['extras']['license'],source=src['asset']['extras']['source'],sourceSha256=hashlib.sha256(raw).hexdigest(),derivative=True,changes='Photo livery with baked oil/exhaust/dust/walkway wear, PBR roughness/metalness map, round tyres and forward-raked articulated gear with trapezoid covers; native game rig.')
g['nodes'][0].update(name='P47D_Weathered_v3',extras={'nativeAircraft':'p47-v3'})
def view(payload,target=None):
 while len(data)%4:data.append(0)
 v={'buffer':0,'byteOffset':len(data),'byteLength':len(payload)};data.extend(payload)
 if target:v['target']=target
 g['bufferViews'].append(v);return len(g['bufferViews'])-1
def accessor(a,kind,indices=False,animation=False):
 a=np.asarray(a,dtype='<u4' if indices else '<f4');v=view(a.tobytes(),None if animation else (34963 if indices else 34962));ac={'bufferView':v,'componentType':5125 if indices else 5126,'count':len(a),'type':kind}
 if kind in ['VEC3','SCALAR']:ac.update(min=np.atleast_1d(a.min(0)).tolist(),max=np.atleast_1d(a.max(0)).tolist())
 g['accessors'].append(ac);return len(g['accessors'])-1
def addimage(im):
 b=io.BytesIO();im.save(b,format='PNG',optimize=True);i=len(g['images']);g['images'].append({'bufferView':view(b.getvalue()),'mimeType':'image/png'});g['textures'].append({'source':i,'sampler':0});return i
image_map={i:addimage(newskin if i==1 else image_read(i)) for i in [0,1,3,10,12,13,15]}
surface_texture=addimage(metalrough)
names=['Antenna details','Photo-livery natural metal','External fittings','Gun barrels','Radial engine and cockpit','Interior green','Clear bubble canopy']
material_map={}
for i,old in enumerate(src['materials']):
 if i in [2,3]:continue
 sg=old.get('extensions',{}).get('KHR_materials_pbrSpecularGlossiness',{});pbr={'baseColorFactor':sg.get('diffuseFactor',[1,1,1,1]),'metallicFactor':.65 if i==1 else .15,'roughnessFactor':.43 if i==1 else .64}
 if 'diffuseTexture' in sg:pbr['baseColorTexture']={'index':image_map[sg['diffuseTexture']['index']]}
 m={'name':names[i],'pbrMetallicRoughness':pbr,'doubleSided':True}
 if 'normalTexture'in old:m['normalTexture']={'index':image_map[old['normalTexture']['index']]}
 if i in [0,5]:m['alphaMode']='MASK';m['alphaCutoff']=.45
 if i==6:m['alphaMode']='BLEND';pbr.update(baseColorFactor=[.52,.65,.67,.16],metallicFactor=0,roughnessFactor=.10)
 if i==1:pbr.update(metallicFactor=1,roughnessFactor=1,metallicRoughnessTexture={'index':surface_texture})
 material_map[i]=len(g['materials']);g['materials'].append(m)
def material(name,color,metal=.0,rough=.6):
 i=len(g['materials']);g['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':metal,'roughnessFactor':rough}});return i
rubber=material('Tyre rubber',[.025,.029,.026]);steel=material('Landing gear steel',[.40,.44,.43],.7,.32);silver=material('Landing gear polished oleos',[.67,.70,.71],.85,.22)
nodes={};stats={}
def addmesh(name,p,n,uv,f,mat,pivot=(0,0,0),parent=None,extra=None,tangent=None):
 if not len(f):return
 ids,remap=np.unique(f,return_inverse=True);p=np.asarray(p)[ids];n=np.asarray(n)[ids];uv=np.asarray(uv)[ids];f=remap.reshape(-1,3);pi=np.asarray(pivot)
 attrs={'POSITION':accessor(p-pi,'VEC3'),'NORMAL':accessor(n,'VEC3')}
 material=g['materials'][mat]
 if 'baseColorTexture' in material['pbrMetallicRoughness'] or 'normalTexture' in material:attrs['TEXCOORD_0']=accessor(uv,'VEC2')
 if tangent is not None and 'normalTexture' in material:
  t=tangent[ids].copy();t[:,:3]-=n*np.sum(t[:,:3]*n,axis=1,keepdims=True);t[:,:3]/=np.maximum(np.linalg.norm(t[:,:3],axis=1,keepdims=True),1e-9);attrs['TANGENT']=accessor(t,'VEC4')
 prim={'attributes':attrs,'indices':accessor(f.ravel(),'SCALAR',True),'material':mat}
 meshid=len(g['meshes']);g['meshes'].append({'name':name,'primitives':[prim]})
 if name in nodes:node=g['nodes'][nodes[name]];node.setdefault('children',[]);sub={'name':name+' surface '+str(meshid),'mesh':meshid};g['nodes'].append(sub);node['children'].append(len(g['nodes'])-1)
 else:
  idx=len(g['nodes']);nodes[name]=idx;g['nodes'].append({'name':name,'mesh':meshid,'translation':pi.tolist(),'extras':extra or {}});g['nodes'][nodes.get(parent,0)]['children'].append(idx)
 stats[name]=stats.get(name,0)+len(f)
def group(name,pivot):
 nodes[name]=len(g['nodes']);g['nodes'].append({'name':name,'translation':list(pivot),'children':[]});g['nodes'][0]['children'].append(nodes[name])
pivots={'Propeller':(0,-.005,5.04),'FlapLeft':(-2,-.47,.91),'FlapRight':(2,-.47,.91),'AileronLeft':(-4.5,-.18,1.45),'AileronRight':(4.5,-.18,1.45),'ElevatorLeft':(-1.2,.33,-4.78),'ElevatorRight':(1.2,.33,-4.78),'Rudder':(0,.8,-4.75)}
for mi,m in enumerate(src['meshes']):
 if mi in [3,4]:continue # Remove external rocket/tube assemblies: clean configuration in the reference.
 pr=m['primitives'][0];a=pr['attributes'];p=transform(read(a['POSITION']));n=transform_normal(read(a['NORMAL']));uv=read(a['TEXCOORD_0']);f=read(pr['indices']).reshape(-1,3);mat=material_map[pr['material']];batches={};tangent=None
 if 'TANGENT' in a:
  tangent=read(a['TANGENT']);tangent[:,:3]=tangent[:,[0,2,1]]*np.array([scale,scale,-zs])
 for fs in components(p,f):
  q=p[np.unique(f[fs])];lo=q.min(0);hi=q.max(0);name={0:'Antenna',3:'ExternalFittings',4:'GunBarrels',5:'Interior',6:'RadialEngine',7:'Cockpit',8:'BubbleCanopy'}.get(mi,'Airframe')
  if mi in [1,2]:
   if lo[2]>4.90:name='Propeller'
   elif lo[2]<-4.7 and hi[2]<-4.6 and hi[1]<.5 and (lo[0]>.05 or hi[0]<-.05):name='ElevatorRight' if lo[0]>0 else 'ElevatorLeft'
   elif lo[2]<-5.0 and hi[2]<-4.7 and hi[1]>.8:name='Rudder'
   elif len(fs)>20 and (lo[0]>3.2 or hi[0]<-3.2) and hi[2]<1.55 and hi[2]>1.4:name='AileronRight' if lo[0]>0 else 'AileronLeft'
   elif len(fs)>20 and .60<max(abs(lo[0]),abs(hi[0]))<3.5 and hi[2]<1.0 and lo[2]>.05:name='FlapRight' if lo[0]>0 else 'FlapLeft'
  batches.setdefault(name,[]).extend(fs.tolist())
 for name,fs in batches.items():addmesh(name,p,n,uv,f[fs],mat,pivots.get(name,(0,0,0)),tangent=tangent)

# New round-wheel gear. No stretching of an existing tyre and no old model dependency.
door=material('Worn aluminium gear covers',[.47,.48,.43],.48,.64)
inner=material('Dirty zinc chromate gear bay',[.14,.18,.073],.12,.83)
gear_buffers={}
def queue_gear(name,p,n,uv,f,mat,parent,extra=None):
 key=(name if extra else parent+' material '+str(mat),mat,parent)
 item=gear_buffers.setdefault(key,{'p':[],'n':[],'f':[],'extra':extra});offset=len(item['p']);item['p'].extend(p);item['n'].extend(n);item['f'].extend(np.asarray(f)+offset)
def surface(name,rows,mat,parent,flip=False,extra=None):
 rows=np.asarray(rows);nr,nc=rows.shape[:2];p=rows.reshape(-1,3);faces=[]
 for i in range(nr-1):
  for j in range(nc-1):
   a=i*nc+j;b=a+1;c=a+nc;d=c+1;faces.extend([(a,b,c),(b,d,c)])
 f=np.array(faces,np.uint32)
 if flip:f=f[:,::-1]
 area=np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1);f=f[area>1e-10]
 n=np.zeros_like(p);fn=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
 for k in range(3):np.add.at(n,f[:,k],fn)
 n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-9);queue_gear(name,p,n,np.zeros((len(p),2)),f,mat,parent,extra)
def cylinder(name,a,b,r,mat,parent,sides=12):
 a=np.asarray(a,float);b=np.asarray(b,float);axis=b-a;axis/=np.linalg.norm(axis);u=np.cross(axis,[0,1,0] if abs(axis[1])<.9 else [1,0,0]);u/=np.linalg.norm(u);v=np.cross(axis,u)
 rings=[[c+r*(math.cos(t)*u+math.sin(t)*v) for t in np.linspace(0,math.tau,sides+1)] for c in [a,b]];surface(name,rings,mat,parent)
 for center,ring,flip in [(a,rings[0],True),(b,rings[1],False)]:surface(name,[[center]*len(ring),ring],mat,parent,flip)
def cover(name,side,parent):
 polygon=[(-.10,-.10),(-.06,-.58),(-.24,-.80),(-.18,-1.10),(.53,-1.10),(.25,-.68)] # z,y
 for sign,mat in [(1,door),(-1,inner)]:
  x=side*(.17+sign*.012);p=np.array([[x,y,z] for z,y in polygon]);f=np.array([[0,i,i+1] for i in range(1,len(p)-1)])
  if side*sign<0:f=f[:,::-1]
  n=np.tile([side*sign,0,0],(len(p),1));queue_gear(name,p,n,np.zeros((len(p),2)),f,mat,parent)
def wheel(name,center,radius,width,parent):
 c=np.array(center);major=radius-width*.43;minor=width*.43
 rows=[[c+[width*.5*math.sin(b),(major+minor*math.cos(b))*math.cos(a),(major+minor*math.cos(b))*math.sin(a)] for b in np.linspace(0,math.tau,11)] for a in np.linspace(0,math.tau,33)]
 surface(name,rows,rubber,parent,flip=True,extra={'groundWheel':True})
 for sign in [-1,1]:
  xx=c[0]+sign*width*.39;cylinder(name+' hub',c+[sign*width*.32,0,0],c+[sign*width*.43,0,0],radius*.49,steel,parent,16)
  for i in range(8):
   a=i*math.tau/8;q=np.array([xx,c[1]+radius*.32*math.cos(a),c[2]+radius*.32*math.sin(a)]);cylinder(name+' brake recess',q+[sign*.012,0,0],q+[sign*.019,0,0],radius*.065,rubber,parent,7)
  cylinder(name+' axle cap',c+[sign*width*.43,0,0],c+[sign*width*.48,0,0],radius*.16,silver,parent,12)
for name,side in [('GearLeft',-1),('GearRight',1),('TailGear',0)]:
 if side:
  group(name,[side*2.40,-.40,1.95]);axle=[side*.045,-1.10,.30]
  cylinder(name+' main leg',[0,.03,0],[side*.015,-.69,.19],.067,steel,name)
  cylinder(name+' oleo',[side*.015,-.57,.15],axle,.046,silver,name)
  cylinder(name+' black sleeve',[side*.01,-.40,.11],[side*.018,-.66,.18],.076,rubber,name)
  cylinder(name+' drag brace',[-side*.25,-.02,-.24],[0,-.79,.22],.029,steel,name)
  cylinder(name+' torque upper',[0,-.60,.23],[0,-.78,.39],.025,steel,name)
  cylinder(name+' torque lower',[0,-.78,.39],[0,-.99,.30],.025,steel,name)
  cylinder(name+' brake line',[-side*.08,-.15,.07],[-side*.08,-1.05,.29],.009,rubber,name,6)
  cover(name+' trapezoid cover',side,name);wheel('TyreLeft' if side<0 else 'TyreRight',axle,.44,.245,name)
 else:
  group(name,[0,-.25,-4.65]);cylinder(name+' strut',[0,.02,.05],[0,-.28,-.12],.035,steel,name)
  for sign in [-1,1]:cylinder(name+' fork',[sign*.08,-.25,-.12],[sign*.08,-.40,-.17],.023,steel,name)
  wheel('TyreTail',[0,-.40,-.17],.165,.12,name)
for (name,mat,parent),item in gear_buffers.items():
 p=np.array(item['p']);addmesh(name,p,np.array(item['n']),np.zeros((len(p),2)),np.array(item['f']),mat,parent=parent,extra=item['extra'])

def quat(axis,angle):a=np.array(axis);return [*(a*math.sin(angle/2)),math.cos(angle/2)]
g['animations']=[]
animations=[('PropellerSpin', [('Propeller',[0,.125,.25,.375,.5],[quat([0,0,1],t) for t in np.linspace(0,2*math.pi,5)],'rotation')]),('GearRetract',[(n,[0,1.6],[[0,0,0,1],quat([0,0,1] if s else [1,0,0],-s*1.48 if s else 1.3)],'rotation') for n,s in [('GearLeft',-1),('GearRight',1),('TailGear',0)]]+[(n,[0,1.55,1.6],[[1,1,1],[1,1,1],[0,0,0]],'scale') for n in ['GearLeft','GearRight','TailGear']]),('FlapsDown',[(n,[0,1],[[0,0,0,1],quat([1,0,0],-.66)],'rotation') for n in ['FlapLeft','FlapRight']]),('ControlCheck',[(n,[0,.4,.8,1.2],[[0,0,0,1],quat(axis,t),quat(axis,-t),[0,0,0,1]],'rotation') for n,axis,t in [('AileronLeft',[1,0,0],.20),('AileronRight',[1,0,0],-.20),('ElevatorLeft',[1,0,0],.24),('ElevatorRight',[1,0,0],.24),('Rudder',[0,1,0],.28)]])]
for name,tracks in animations:
 an={'name':name,'samplers':[],'channels':[]}
 for node,times,values,path in tracks:
  if node not in nodes:raise ValueError('Missing animated part '+node)
  an['samplers'].append({'input':accessor(times,'SCALAR',animation=True),'output':accessor(values,'VEC3' if path=='scale' else 'VEC4',animation=True),'interpolation':'LINEAR'});an['channels'].append({'sampler':len(an['samplers'])-1,'target':{'node':nodes[node],'path':path}})
 g['animations'].append(an)
while len(data)%4:data.append(0)
g['buffers'][0]['byteLength']=len(data);js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
glb=struct.pack('<4sII',b'glTF',2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
filename=OUT/'p47-weathered.glb';filename.write_bytes(glb)
report={'file':filename.name,'bytes':len(glb),'sha256':hashlib.sha256(glb).hexdigest(),'sourceSHA256':hashlib.sha256(raw).hexdigest(),'derivative':True,'sourceMetadata':src['asset']['extras'],'spanMetres':12.42,'lengthMetres':11.02,'sourceScaling':[scale,scale,zs],'triangles':sum(stats.values()),'parts':stats,'animations':[a[0] for a in animations],'photoLimitations':'D-28 source mesh, D-40-like photo livery; unseen port side WZ-A inferred, not certified exact factory geometry.','integratedIntoGame':False}
(OUT/'model-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
