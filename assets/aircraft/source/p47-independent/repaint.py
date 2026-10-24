"""Original, deterministic paint authored on the independent P-47 UVs.
Uses only the independent GLB; no image or geometry from former game assets.
"""
from pathlib import Path
import numpy as np,struct,json,math,io
from scipy.spatial.transform import Rotation
from scipy.ndimage import distance_transform_edt,gaussian_filter
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'v2';OUT.mkdir(exist_ok=True)
b=(ROOT/'review-v1.glb').read_bytes()
jslen=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+jslen]);binary=bytearray(b[28+jslen:])
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]);k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
 return np.ndarray((a['count'],k),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',k*dt.itemsize),dt.itemsize)).copy()
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def text_image(t):
 im=Image.new('RGBA',(1200,320));d=ImageDraw.Draw(im);f=ImageFont.truetype(font,240);bb=d.textbbox((0,0),t,font=f);d.text((12,-bb[1]+12),t,font=f,fill=(18,21,21,255));return np.asarray(im.crop(im.getbbox()))
texts={t:text_image(t) for t in ['WZ','B','A','549385','NO STEP','FUEL','100/130','OIL','LIFT HERE']}
im=Image.new('RGBA',(1200,600));d=ImageDraw.Draw(im)
d.rectangle((28,192,1172,408),fill=(17,29,44,255));d.rectangle((58,221,1142,379),fill=(231,230,216,255));d.ellipse((310,10,890,590),fill=(17,29,44,255))
pts=[]
for i in range(10):
 a=-math.pi/2+i*math.pi/5;r=254 if i%2==0 else 97;pts.append((600+math.cos(a)*r,300+math.sin(a)*r))
d.polygon(pts,fill=(231,230,216,255));star=np.asarray(im)
def stamp(rgb,bitmap,u,v,where):
 valid=where&(u>=0)&(u<=1)&(v>=0)&(v<=1)
 if not valid.any():return
 h,w=bitmap.shape[:2];c=bitmap[np.clip((v[valid]*(h-1)).astype(int),0,h-1),np.clip((u[valid]*(w-1)).astype(int),0,w-1)];a=c[:,3:4]/255;rgb[valid]=rgb[valid]*(1-a)+c[:,:3]*a
def periodic(v,p):return np.abs((v+p*.5)%p-p*.5)
def paint(p,n):
 x,y,z=p.T;nx,ny,nz=n.T;ax=np.abs(x)
 grain=.5+.5*np.sin(x*371+y*291+z*413)*np.sin(x*149-y*177+z*217)
 cloudy=.52+.24*np.sin(x*16+z*8)+.16*np.sin(z*29+y*22)+.08*np.sin(z*76-x*52)
 # Final glTF model coordinates, metres, with fuselage datum horizontal.
 side=(ax<.92)&(np.abs(nx)>.38)&(z<4.2)&(z>-4.5)
 wing=(ax>.85)&(z>-1)&(z<3.4)&(np.abs(ny)>.38)
 fin=(ax<.15)&(z<-3.6)&(y>-.5)
 stab=(ax>.23)&(z<-3.7)&(np.abs(ny)>.38)
 panel_id=np.floor(z/.54)*7+np.floor(ax/.62)*13+np.floor(y/.42)*3
 tone=1+.027*np.sin(panel_id*7.31)+.009*np.sin(z*35+ax*12)+.008*(grain-.5)
 rgb=np.array([187,188,181])[None,:]*tone[:,None]
 angle=np.arctan2(y+.76,x)
 cowl=(z>3.48)&(z<4.75)&(ax<.94)
 check=(np.floor((z-3.48)/.254).astype(int)+np.floor((angle+math.pi)/(2*math.pi)*28).astype(int))%2
 rgb[cowl&(check==0)]=[22,24,23];rgb[cowl&(check==1)]=[224,223,210]
 hood=(z>1.45)&(z<3.48)&(ax<.44)&(ny>.55)&(y>-.18)
 spine=(z<-.60)&(z>-3.85)&(ax<.25)&(ny>.55)&(y>-.45)
 olive=hood|spine;rgb[olive]=[57,62,37]
 tailband=(fin&(y>.47)&(y<.70))|(stab&(z>-5.05)&(z<-4.76))
 rgb[tailband]=[20,23,22]
 for sign in [-1,1]:
  s=side&(x*sign>0)&(y>-1.35)&(y<-.25)
  def uv(lo,hi,bottom,top):
   u=(z-lo)/(hi-lo);return (1-u if sign>0 else u),(top-y)/(top-bottom)
  u,v=uv(-3.28,-1.60,-1.24,-.42);stamp(rgb,star,u,v,s)
  for t,lo,hi in [('WZ',-1.48,-.15),('B' if sign<0 else 'A',-4.10,-3.40)]:
   u,v=uv(lo,hi,-1.16,-.45);stamp(rgb,texts[t],u,v,s)
  u,v=uv(-5.02,-4.04,.08,.28);stamp(rgb,texts['549385'],u,v,fin&(x*sign>=0))
  for t,lo,hi,bot,top in [('LIFT HERE',-3.74,-3.35,-1.23,-1.18),('OIL',2.83,3.02,-.28,-.22)]:
   u,v=uv(lo,hi,bot,top);stamp(rgb,texts[t],u,v,side&(x*sign>0))
 stamp(rgb,star,(x+5.68)/2.3,(2.78-z)/1.18,wing&(x<0)&(ny>.4))
 stamp(rgb,star,(5.68-x)/2.3,(z-1.50)/1.18,wing&(x>0)&(ny<-.4))
 # Original panel seams and rivet rows: recessed lines in colour and tangent normals.
 body_z=periodic(z+.12,.54);body_a=periodic(angle+.03,math.pi/6)*.79
 wing_x=periodic(ax-.18,.59);wing_z=periodic(z-.19,.51)
 fin_z=periodic(z+.07,.43);fin_y=periodic(y+.05,.38)
 seam=np.zeros(len(p));riv=np.zeros(len(p))
 def lines(a,b,where):
  line=np.exp(-(a/.0038)**2)+np.exp(-(b/.0038)**2)
  # Rivets 20 mm from panel seam, spaced 70 mm; each dot about 4 mm wide.
  dots=np.exp(-((np.abs(a-.021)/.0035)**2+(periodic(z+x+y,.070)/.0048)**2))
  return np.minimum(1,line)*where,np.minimum(1,dots)*where
 for a,bb,w in [(body_z,body_a,side&~cowl),(wing_x,wing_z,wing),(fin_z,fin_y,fin|stab)]:
  s,r=lines(a,bb,w);seam=np.maximum(seam,s);riv=np.maximum(riv,r)
 rgb*=1-(.25*seam+.37*riv)[:,None]
 # Dirt follows airflow aft, with extra build-up in panel recesses.
 aft=np.maximum(0,3.48-z)
 exhaust=np.exp(-((y+1.20+.025*aft)/(.10+.042*aft))**2)*np.exp(-aft/1.8)*side*(z<3.48)*(z>-.9)
 oil=np.exp(-((x-.1*np.sin(z*1.6))/.20)**2)*np.exp(-np.maximum(0,3.5-z)/3.5)*(y<-1.42)*(z<3.5)*(z>-3.9)
 walk=wing&(ny>.5)&(ax>.79)&(ax<1.48)&(z>-.20)&(z<1.32)
 walkway=walk&(ax<1.20);rgb[walkway]=rgb[walkway]*.38
 dust=np.clip((-y-1.1)*.10,0,.13)*cloudy
 gun=np.zeros(len(p))
 for st in [2.07,2.29,2.51,2.73]:
  gun+=np.exp(-((ax-st)/.06)**2)*np.exp(-np.maximum(0,2.45-z)/.63)*(z<2.6)*(z>1.0)*wing*(ny>.45)
 grime=np.clip(.70*exhaust*(.6+.7*cloudy)+.54*oil+.18*walk*cloudy+.48*gun+dust+.05*seam,0,.79)
 rgb=rgb*(1-grime[:,None])+np.array([40,34,27])*grime[:,None]
 threads=(np.sin(x*185+y*28+z*3)>.94)&(oil>.13)&(grain>.5);rgb[threads]*=.5
 scuff=(grain>.85)&walk;rgb[scuff]=[169,170,160]
 chipped=(grain>.948)&(cowl|olive|tailband)&(cloudy>.55);rgb[chipped]=[164,168,164]
 # Exposed metal at regularly handled panel corners, restrained leading-edge scuff.
 leading=wing&(nz>.55)&(grain>.93);rgb[leading]=[195,195,184]
 stamp(rgb,texts['NO STEP'],(ax-.95)/.48,(.52-z)/.10,wing&(ny>.6)&(ax<1.5)&(z>.35)&(z<.6))
 rough=np.clip(.55+grime*.36+walk*.12+.055*grain+.025*np.sin(panel_id),.48,.94)
 metal=np.clip(.62-grime*.67-walk*.21,.08,.68)
 painted=cowl|olive|tailband;rough[painted]=.72+grime[painted]*.16;metal[painted]=.08
 height=-seam*.6-riv*.45+grain*.018
 return np.clip(rgb,0,255).astype('uint8'),np.stack([np.ones(len(p)),rough,metal],1)*255,height
S=4096;atlas=np.full((S,S,3),[187,188,181],np.uint8);mr=np.full_like(atlas,[255,160,145]);height=np.zeros((S,S),np.float32);mask=np.zeros((S,S),bool)
def walk(i,M):
 nd=doc['nodes'][i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(nd.get('rotation',[0,0,0,1])).as_matrix()*nd.get('scale',[1,1,1]);m[:3,3]=nd.get('translation',[0,0,0]);m=M@m
 if 'mesh'in nd:
  for pr in doc['meshes'][nd['mesh']]['primitives']:
   if pr.get('material')!=0:continue
   p=read(pr['attributes']['POSITION'])@m[:3,:3].T+m[:3,3];n=read(pr['attributes']['NORMAL'])@m[:3,:3].T;uv=read(pr['attributes']['TEXCOORD_0'])*(S-1);faces=read(pr['indices']).reshape(-1,3)
   for f in faces:
    a,bb,c=uv[f];lo=np.maximum(0,np.floor(np.minimum(np.minimum(a,bb),c)).astype(int));hi=np.minimum(S-1,np.ceil(np.maximum(np.maximum(a,bb),c)).astype(int))
    if (hi<lo).any():continue
    yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];v0=bb-a;v1=c-a;det=v0[0]*v1[1]-v0[1]*v1[0]
    if abs(det)<1e-10:continue
    dx=xx-a[0];dy=yy-a[1];u=(dx*v1[1]-dy*v1[0])/det;v=(v0[0]*dy-v0[1]*dx)/det;inside=(u>=-1e-4)&(v>=-1e-4)&(u+v<=1.0001)
    if not inside.any():continue
    bary=np.stack([1-u[inside]-v[inside],u[inside],v[inside]],1);rgb,srf,h=paint(bary@p[f],bary@n[f]);ys=yy[inside];xs=xx[inside];atlas[ys,xs]=rgb;mr[ys,xs]=srf;height[ys,xs]=h;mask[ys,xs]=True
   print('Painted',nd['name'],flush=True)
 for c in nd.get('children',[]):walk(c,m)
walk(0,np.eye(4))
# Limited seam padding; never bleed one UV quadrant into another.
dist,ix=distance_transform_edt(~mask,return_indices=True);pad=(dist<=6)&~mask
for arr in [atlas,mr,height]:arr[pad]=arr[ix[0][pad],ix[1][pad]]
dy,dx=np.gradient(gaussian_filter(height,.45));normal=np.stack([-dx*.8,dy*.8,np.ones_like(dx)],2);normal/=np.linalg.norm(normal,axis=2,keepdims=True);normal=np.clip((normal*.5+.5)*255,0,255).astype('uint8')
Image.fromarray(atlas).save(OUT/'P47-livery-v2.jpg',quality=96,subsampling=0)
Image.fromarray(mr).save(OUT/'P47-surface-v2.png',optimize=True)
Image.fromarray(normal).save(OUT/'P47-panels-rivets-v2.png',optimize=True)
def add_image(path,name):
 while len(binary)%4:binary.append(0)
 data=path.read_bytes();bv=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data)
 doc['images'].append({'bufferView':bv,'mimeType':'image/jpeg' if path.suffix=='.jpg' else 'image/png','name':name});doc['textures'].append({'sampler':0,'source':len(doc['images'])-1});return len(doc['textures'])-1
mat=doc['materials'][0];mat['name']='Original game-scheme repaint — panels, rivets, service wear v2'
mat['pbrMetallicRoughness']['baseColorTexture']={'index':add_image(OUT/'P47-livery-v2.jpg','Oliver original livery v2')}
mat['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':add_image(OUT/'P47-surface-v2.png','Oliver original wear PBR v2')}
mat['normalTexture']={'index':add_image(OUT/'P47-panels-rivets-v2.png','Oliver original panel and rivet normal'),'scale':.65}
doc['asset']['extras']['changes']='Independent geometry retained; newly painted to match existing game scheme including WZ-B / WZ-A, 549385, 28-sector checker nose and tail bands; original panel/rivet normal, soot, oil, dust and walkway wear.'
doc['buffers'][0]['byteLength']=len(binary);s=json.dumps(doc,separators=(',',':')).encode();s+=b' '*((-len(s))%4);binary+=b'\0'*((-len(binary))%4)
(OUT/'painted-intermediate.glb').write_bytes(struct.pack('<III',0x46546c67,2,28+len(s)+len(binary))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(binary),0x004e4942)+binary)
print('Paint complete',flush=True)
