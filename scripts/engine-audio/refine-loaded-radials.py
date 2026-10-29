"""Build215: reduce recorded cabin tones/hiss and remove loop-seam level dips.
Uses verified licensed source WAVs outside the repository. No oscillator/LFO bed.
"""
import argparse,pathlib,json,hashlib,subprocess
import numpy as np
from scipy import signal,ndimage
from scipy.io import wavfile
r=pathlib.Path(__file__).resolve().parents[2];out=r/'audio/engines';rate=32000
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=pathlib.Path,required=True);arg=p.parse_args()
old=json.loads((out/'loaded-provenance.json').read_text())
def decode(key):
 s=old['sources'][key];f=arg.source_dir/s['file'];assert hashlib.sha256(f.read_bytes()).hexdigest()==s['sha256']
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-ss','215' if key=='bearcat' else '35','-t','26','-i',str(f),'-f','f32le','-ac','1','-ar',str(rate),'-']),np.float32).astype(float)
def band(x,lo,hi):return signal.sosfiltfilt(signal.butter(3,[lo,hi],fs=rate,btype='bandpass',output='sos'),x)
def rms(x):return float(np.sqrt(np.mean(x*x)))
def norm(x,level):return x*(level/rms(x))
bear=decode('bearcat');wright=decode('b25')
# Measured persistent onboard tones; not a claimed engine firing-order model.
clean=band(bear,55,3600)
for freq,q in [(80,1.8),(138,5),(216,6)]:
 b,a=signal.iirnotch(freq,q,fs=rate);clean=signal.filtfilt(b,a,clean)
# Retain recorded broad exhaust transients. Reduce high hiss rather than add distortion.
clean=norm(clean,.18)+norm(band(clean,250,1500),.045)
# The 14-cylinder game voice remains an explicit adapted recording, not BMW/Sakae/R2600 full-power provenance.
ratio=14/18;pitched=np.interp(np.arange(len(clean))*ratio,np.arange(len(clean)),clean)
r14=norm(band(pitched,70,3000),.18)+norm(band(wright,50,145),.035)
report={**{k:v for k,v in old.items() if k!='loops'},'build':215,'parentBuild':214,'loops':[],'processing':'Measured onboard tones 80/138/216Hz reduced; upper-band hiss reduced, recorded exhaust mid-band retained. Circular envelope leveling after a one-second equal-power seam. No periodic modulation. Sources retain prior adaptation limits.'}
for name,x in [('r2800-detail-power',clean),('radial14-detail-power',r14)]:
 x=x-x.mean();n=rate;theta=np.arange(n)/n*np.pi/2
 y=x[:-n].copy();y[:n]=x[-n:]*np.cos(theta)+x[:n]*np.sin(theta)
 # Correct the finished loop, including the seam. Circular smoothing prevents a periodic low-energy patch.
 # 0.22s RMS and 0.08s gain smoothing preserve individual engine pulses while leveling recording drift.
 envelope=np.sqrt(ndimage.uniform_filter1d(y*y,round(rate*.22),mode='wrap')+1e-12)
 gain=ndimage.gaussian_filter1d(rms(y)/envelope,rate*.08,mode='wrap');y*=gain
 y=norm(y,.205);mag=np.abs(y);limited=mag>.64
 # Soften only rare safety peaks; do not flatten the entire waveform with tanh.
 y=np.sign(y)*np.where(limited,.64+.12*(-np.expm1(-np.maximum(0,mag-.64)/.12)),mag)
 limited_fraction=float(np.mean(limited))
 file=out/(name+'.wav');wavfile.write(file,rate,np.round(y*32767).astype('<i2'))
 f,power=signal.welch(y,rate,nperseg=32768);env=np.sqrt(signal.fftconvolve(np.tile(y,3)**2,np.ones(rate//4)/(rate//4),mode='valid'))[len(y):2*len(y):rate//4]
 report['loops'].append({'path':str(file.relative_to(r)),'seconds':len(y)/rate,'sampleRate':rate,'sourceCuts':{'bearcat':[215,241],'b25':[35,61]} if name.startswith('radial') else {'bearcat':[215,241]},'crossfadeSeconds':1,'rms':rms(y),'peak':float(np.max(abs(y))),'quarterSecondRangeDb':float(20*np.log10(env.max()/env.min())),'peakLimitedFraction':limited_fraction,'above4kFraction':float(power[f>4000].sum()/power.sum()),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out/'detail-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['loops'],indent=2))
