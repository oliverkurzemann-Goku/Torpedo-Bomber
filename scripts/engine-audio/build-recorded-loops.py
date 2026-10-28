"""Build mono PCM loops from the credited recordings, never oscillator synthesis.
Python + NumPy/SciPy + ffmpeg. Source hashes and selected intervals are audited.
"""
import hashlib,json,pathlib,subprocess,sys
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
# Build 213: continuous ground recordings, no Doppler-corrected flyby voice.
SPECS=[
 ('r2800-idle','p47-idle',40,50,.55,None),
 ('r2800-power','p47-idle',35,50.5,1.0,None),
 ('bmw801-idle','fw190-idle',2,8,.45,None),
 ('bmw801-power','fw190-idle',2,15.3,.8,None),
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
report={'schema':1,'build':213,'checkedOn':'2026-10-28','sources':[],'loops':[]}
cache={}
for name,id,author,title,license in SOURCES:
 file=OUT/'source'/(name+'.mp3');raw=file.read_bytes();cache[name]=decode(file)
 report['sources'].append({'key':name,'path':str(file.relative_to(ROOT)),'title':title,'author':author,'url':f'https://freesound.org/people/{author}/sounds/{id}/','downloadUrl':f'https://cdn.freesound.org/previews/{id//1000}/{id}_{2579915 if author=="Fight2FlyPhoto" else 2524442}-hq.mp3','download':'Public full-duration HQ MP3 preview, not the uncompressed WAV original','license':license,'licenseUrl':'https://creativecommons.org/licenses/by/3.0/' if license.startswith('CC BY') else 'https://creativecommons.org/publicdomain/zero/1.0/','sha256':hashlib.sha256(raw).hexdigest()})
previous=json.loads((OUT/'provenance.json').read_text()) if (OUT/'provenance.json').exists() else None
changed_only='--steady-only' in sys.argv
for name,source,start,end,overlap,warp in SPECS:
 if changed_only and name not in ['r2800-power','bmw801-power']:
  report['loops'].append(next(x for x in previous['loops'] if x['path']==f'audio/engines/{name}.wav'))
  continue
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
report['runtimeVoices']={'p47':'r2800','corsair':'r2800','sbd':'r2800','fw190':'bmw801','avenger':'bmw801','zero':'bmw801','bf109':'db601','ju87':'jumo'}
for loop in report['loops']:loop['runtime']=not any('/'+bank+'-' in loop['path'] for bank in ['r2600','r1820'])
report['retiredReason']='Build 212 flyby-powered layers and TBF/B-17 drone voices rejected in user listening feedback; ground/warm-up radial recordings replace them.'
(OUT/'provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['loops'],indent=2))
