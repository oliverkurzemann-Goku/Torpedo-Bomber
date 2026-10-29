"""Build the six user-approved voices from credited ground recordings.
Original procedural exhaust accents are creative game sound design, not measured
historic acoustics. No audition throttle sweep is included in runtime loop files.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from scipy import signal,ndimage
from scipy.io import wavfile
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'audio/engines';OUT=SOURCE/'approved';OUT.mkdir(exist_ok=True)
SR=24000;DUR=20;N=SR*DUR
PROFILES=[
 dict(kind='p47',choice='P47 A',source='r2800',idleRate=1,cylinders=18,inline=False,speed=1.37,prop=82,bank=178,rough=.22,accent=.19,body=145,top=1050,drive=1.6,record=.57,pulse=.33,bark=.10,resonances=[1,1.87,3.4],seed=65,propSeed=535,fireSeed=1005,file='p47-a-power.wav'),
 dict(kind='avenger',choice='P47 C',source='r2800',idleRate=1,cylinders=18,inline=False,speed=1.62,prop=96,bank=214,rough=.31,accent=.33,body=205,top=1800,drive=2.5,record=.44,pulse=.35,bark=.21,resonances=[1,1.87,3.4],seed=67,propSeed=537,fireSeed=1007,file='avenger-c-power.wav'),
 dict(kind='sbd',choice='P47 B',source='r2800',idleRate=1,cylinders=18,inline=False,speed=1.48,prop=90,bank=195,rough=.47,accent=.41,body=175,top=1350,drive=2.2,record=.40,pulse=.45,bark=.15,resonances=[1,1.87,3.4],seed=66,propSeed=536,fireSeed=1006,file='sbd-b-power.wav'),
 dict(kind='fw190',choice='Fw190 Kerniger Sternmotor',source='bmw801',idleRate=1,cylinders=14,inline=False,speed=1.46,prop=73,bank=158,rough=.34,accent=.34,body=178,top=1450,drive=2.1,record=.46,pulse=.39,bark=.15,resonances=[1,1.87,3.4],seed=190,propSeed=660,fireSeed=1130,file='fw190-power.wav'),
 dict(kind='zero',choice='Zero Leicht und lebhaft',source='bmw801',idleRate=1.075,cylinders=14,inline=False,speed=1.64,prop=95,bank=181,rough=.26,accent=.24,body=235,top=1650,drive=1.85,record=.49,pulse=.34,bark=.17,resonances=[1,1.94,3.55],seed=21,propSeed=491,fireSeed=961,file='zero-power.wav'),
 dict(kind='bf109',choice='Me109 Trockenes V12 Knurren',source='db601',idleRate=1,cylinders=12,inline=True,speed=1.30,prop=77,bank=130,rough=.12,accent=.11,body=238,top=1900,drive=1.7,record=.61,pulse=.26,bark=.13,resonances=[1,2.02,3.82],seed=109,propSeed=579,fireSeed=1049,file='bf109-power.wav'),
]
def read(name):
 sr,x=wavfile.read(SOURCE/name);x=x.astype(float)/32768
 if x.ndim>1:x=x.mean(axis=1)
 return x if sr==SR else signal.resample_poly(x,SR,sr)
def band(x,lo,hi,order=2):return signal.sosfilt(signal.butter(order,[lo,hi],fs=SR,btype='bandpass',output='sos'),x)
def rms(x):return float(np.sqrt(np.mean(x*x)))
def norm(x,target=1):return x*(target/(rms(x)+1e-12))
def loop(x,rate,offset=0):
 pos=(np.cumsum(np.full(N,rate))+offset*SR)%len(x);return np.interp(pos,np.arange(len(x)),x,period=len(x))
def level(x,window=.22,circular=False):
 mode='wrap' if circular else 'reflect'
 env=np.sqrt(ndimage.uniform_filter1d(x*x,int(SR*window),mode=mode)+1e-10)
 gain=ndimage.uniform_filter1d(np.clip(rms(x)/env,.5,2),int(SR*.16),mode=mode)
 return norm(x*gain)
def impulses(rate,seed,rough,accent,cylinders,inline=False):
 rng=np.random.default_rng(seed);out=np.zeros(N);time=0.;event=0
 cylinder=rng.uniform(.90 if inline else .68,1.10 if inline else 1.32,cylinders)
 while time<DUR:
  i=int(time*SR)
  if i>=N:break
  cycle=(.64 if event%4==3 else 1.12) if accent>.3 else (1+accent*np.sin(event*2.39996))
  out[i]=max(.12,cycle*cylinder[event%cylinders]*(1+rng.normal(0,rough*.42)))
  time+=(1/rate)*np.clip(1+rng.normal(0,rough*.065),.85,1.15);event+=1
 return out
report={'build':217,'sampleRate':SR,'sourceCredits':'../CREDITS.md and ../provenance.json; original recorded sources by Fight2FlyPhoto, CC BY 3.0. Original procedural accents.','limits':'Creative game voicings adapted from the approved audition settings. Avenger/SBD share the accepted P47 source family. Zero uses a BMW substitute. No calibrated engine RPM or authentic installation claim.','profiles':PROFILES,'sources':[],'loops':[]}
for name in sorted({p['source']+'-'+layer+'.wav' for p in PROFILES for layer in ['idle','power']}):
 report['sources'].append({'path':'audio/engines/'+name,'sha256':hashlib.sha256((SOURCE/name).read_bytes()).hexdigest()})
def save(name,x):
 # Overlap the ends, then level the completed circular loop. Millisecond engine
 # attacks stay intact; only slow recording/overlap energy changes are corrected.
 blend=min(int(SR*.4),len(x)//5);theta=np.arange(blend)/blend*np.pi/2
 y=x[:-blend].copy();y[:blend]=x[-blend:]*np.cos(theta)+x[:blend]*np.sin(theta)
 warm=SR//2;y=band(np.r_[y[-warm:],y],40,4400)[warm:];y=level(y,circular=True);y=norm(y,.20)
 mag=np.abs(y);y=np.sign(y)*np.where(mag>.70,.70+.08*(-np.expm1(-np.maximum(mag-.70,0)/.08)),mag)
 f=OUT/name;wavfile.write(f,SR,np.round(y*32767).astype('<i2'))
 freq,power=signal.welch(y,SR,nperseg=8192)
 envelope=np.sqrt(ndimage.uniform_filter1d(y*y,SR//4,mode='wrap')+1e-12)
 q={'path':'audio/engines/approved/'+name,'seconds':len(y)/SR,'rms':rms(y),'peak':float(abs(y).max()),'seamStep':float(abs(y[0]-y[-1])),'stepP99':float(np.percentile(np.abs(np.diff(y)),99)),'quarterRangeDb':float(20*np.log10(envelope.max()/envelope.min())),'centroid':float((freq*power).sum()/power.sum()),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()};report['loops'].append(q)
for source in ['r2800','bmw801','db601']:
 save(source+'-idle.wav',level(band(read(source+'-idle.wav'),45,3900)))
for v in PROFILES:
 prop=impulses(v['prop'],v['propSeed'],v['rough'],v['accent'],v['cylinders'],v['inline'])
 firing=impulses(v['bank'],v['fireSeed'],v['rough']*.65,v['accent']*.5,v['cylinders'],v['inline'])
 knocks=np.zeros(N)
 for ratio,weight in zip(v['resonances'],[1,.53,.19]):
  b,a=signal.iirpeak(v['body']*ratio,.68,fs=SR);knocks+=weight*signal.lfilter(b,a,prop)
 b,a=signal.iirpeak(v['body']*1.32,.60,fs=SR);knocks+=.31*signal.lfilter(b,a,firing)
 knocks=level(band(knocks,58,v['top']),.28)
 ground=read(v['source']+'-power.wav')
 rec=band(loop(ground,v['idleRate']*v['speed'],1.7),58,v['top']);rec=np.tanh(norm(rec,.36)*v['drive'])
 gate=signal.lfilter([1],[1,-np.exp(-1/(SR*.004))],prop);gate/=np.percentile(gate,99)+1e-9
 rec*=.5+.75*np.minimum(gate,1.7);rec=level(rec,.28)
 bark=band(loop(ground,v['idleRate']*1.75,4.2),280,v['top']*1.25);bark*=.10+np.minimum(gate,1.5)**1.4;bark=level(bark,.30)
 save(v['file'],level(v['record']*rec+v['pulse']*knocks+v['bark']*bark,.30))
(OUT/'provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['loops'],indent=2))
