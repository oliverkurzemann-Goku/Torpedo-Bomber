"""Build mono PCM loops from the credited recordings, never oscillator synthesis.
Python + NumPy/SciPy + ffmpeg. Source hashes and selected intervals are audited.
"""
import hashlib,json,pathlib,subprocess
import numpy as np
from scipy import signal,ndimage
from scipy.io import wavfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'audio/engines'; RATE=24000
SOURCES=[
 ('p47-idle',142900,'Fight2FlyPhoto','P-47 Thunderbolt Startup','CC BY 3.0'),
 ('p47-fly',143560,'Fight2FlyPhoto','P-47 Flyby','CC BY 3.0'),
 ('fw190-idle',143556,'Fight2FlyPhoto','Fw-190 Taxiing','CC BY 3.0'),
 ('fw190-fly',143562,'Fight2FlyPhoto','Fw-190 Flyby','CC BY 3.0'),
 ('db601',142898,'Fight2FlyPhoto','Bf-109 - Daimler-Benz Run-Up','CC BY 3.0'),
 ('tbf',437778,'craigsmith','G04-14-TBF Avenger Engine Drone.wav','CC0 1.0'),
 ('stuka',437771,'craigsmith','G04-07-WWII Stuka engine drone.wav','CC0 1.0'),
 ('r1820',437862,'craigsmith','G07-18_B-17 4 Engine Prop Steady Engine Noise.wav','CC0 1.0')]
# Pre/post-pass pitch ridges measured from source STFT, not engine RPM claims.
# Resampling removes the recorded observer's Doppler sweep from a stationary voice.
P47_CURVE=([4.5,5,5.5,6,6.5,7,7.5,8,8.3],[124,123,123,121,117,110,96.5,82,77])
FW_CURVE=([.4,1,1.5,2,2.5,3,3.5,4.2],[227,220,211,193,173,153,138,122])
SPECS=[
 ('r2800-idle','p47-idle',40,50,.55,None),
 ('r2800-power','p47-fly',4.5,8.3,.55,(P47_CURVE,110)),
 ('bmw801-idle','fw190-idle',2,8,.45,None),
 ('bmw801-power','fw190-fly',.4,4.2,.45,(FW_CURVE,190)),
 ('db601-idle','db601',4,12,.5,None),
 ('db601-power','db601',56,65,.5,None),
 ('r2600-idle','tbf',3,9,.5,None),
 ('r2600-power','tbf',5,12,.5,None),
 ('jumo-idle','stuka',3,10,.5,None),
 ('jumo-power','stuka',23,32,.5,None),
 ('r1820-idle','r1820',9,16,.5,None),
 ('r1820-power','r1820',22,31,.5,None)]
def decode(file):
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-f','f32le','-ac','1','-ar',str(RATE),'-']),np.float32).astype(float)
report={'schema':1,'build':212,'checkedOn':'2026-10-28','sources':[],'loops':[]}
cache={}
for name,id,author,title,license in SOURCES:
 file=OUT/'source'/(name+'.mp3');raw=file.read_bytes();cache[name]=decode(file)
 report['sources'].append({'key':name,'path':str(file.relative_to(ROOT)),'title':title,'author':author,'url':f'https://freesound.org/people/{author}/sounds/{id}/','downloadUrl':f'https://cdn.freesound.org/previews/{id//1000}/{id}_{2579915 if author=="Fight2FlyPhoto" else 2524442}-hq.mp3','download':'Public full-duration HQ MP3 preview, not the uncompressed WAV original','license':license,'licenseUrl':'https://creativecommons.org/licenses/by/3.0/' if license.startswith('CC BY') else 'https://creativecommons.org/publicdomain/zero/1.0/','sha256':hashlib.sha256(raw).hexdigest()})
for name,source,start,end,overlap,warp in SPECS:
 x=cache[source][round(start*RATE):round(end*RATE)].copy();x-=x.mean()
 # Remove subsonic rumble and archival hiss, retain exhaust transients/harmonics.
 x=signal.sosfiltfilt(signal.butter(2,[28,6500],fs=RATE,btype='bandpass',output='sos'),x)
 if warp:
  (times,freqs),reference=warp
  times=np.array(times)-start;freq=np.interp(np.arange(len(x))/RATE,times,freqs)
  output_time=np.cumsum(freq/reference)/RATE
  x=np.interp(np.arange(int(output_time[-1]*RATE))/RATE,output_time,x)
 # Slow, bounded levelling removes distance changes; no fast compressor that
 # erases the individual combustion beats. Never invent low-frequency tones.
 rms=np.sqrt(ndimage.uniform_filter1d(x*x,round(RATE*.60))+1e-9)
 x*=np.clip(np.median(rms)/rms,.35,3)
 count=round(overlap*RATE);fade=np.arange(count)/count
 y=x[:-count].copy();y[:count]=x[-count:]*(1-fade)+x[:count]*fade
 y-=y.mean();y*=.22/np.sqrt(np.mean(y*y))
 # Very rare recording overload spikes: smooth peak control, documented.
 y=np.tanh(y*1.12)/1.12
 y*=min(1,.83/np.max(abs(y)))
 pcm=(y*32767).round().astype('<i2');file=OUT/(name+'.wav');wavfile.write(file,RATE,pcm)
 f,p=signal.welch(y,RATE,nperseg=8192)
 report['loops'].append({'path':str(file.relative_to(ROOT)),'source':source,'interval':[start,end],'crossfadeSeconds':overlap,'dopplerRidge':{'time':warp[0][0],'hz':warp[0][1],'referenceHz':warp[1]} if warp else None,'sampleRate':RATE,'seconds':len(y)/RATE,'rms':float(np.sqrt(np.mean(y*y))),'peak':float(max(abs(y))),'seamStep':float(abs(y[0]-y[-1])),'bassFraction':float(p[(f>=35)&(f<250)].sum()/p.sum()),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/'provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['loops'],indent=2))
