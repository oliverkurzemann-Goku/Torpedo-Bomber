"""Build project-specific loaded radial voices from GDC2017 licensed recordings.
Raw recordings stay outside this repository. Pass --source-dir to the acquired files.
No oscillator synthesis; 14-cylinder voice is an explicit composite sound design.
"""
import argparse,hashlib,json,pathlib,subprocess
import numpy as np
from scipy import signal,ndimage
from scipy.io import wavfile
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'audio/engines';RATE=32000
arg=argparse.ArgumentParser();arg.add_argument('--source-dir',type=pathlib.Path,required=True);opt=arg.parse_args()
SOURCES={
 'bearcat':{'file':'Bearcat_t5_onbrd_flybys_cockpit.wav','sha256':'9c84c4682b34208e2ee6f26a77f17877e52ed26585a444eb7cca0eea165a6003','archivePath':'Sonniss.com - GDC 2017 - Game Audio Bundle Part 6of9/Pole Position - Grumman F8F Bearcat/Bearcat_t5_onbrd_flybys_cockpit.wav','sourceUrl':'https://sonniss.com/sound-effects/grumman-f8f-bearcat/','description':'Pole Position: onboard flying cockpit; R-2800-30W family; actual source RPM unmeasured','cut':[215,241]},
 'b25':{'file':'B-25_t1_ext_startup_idle_below_plane.wav','sha256':'f189a9b26f7515f2f911d48db38af7a0a0332088989a3154cda34affc769ec04','archivePath':'Sonniss.com - GDC 2017 - Game Audio Bundle Part 6of9/Pole Position - North American B-25 Mitchell/B-25_t1_ext_startup_idle_below_plane.wav','sourceUrl':'https://pole.se/product/north-american-b-25-mitchell/','description':'Pole Position: exterior startup/idle below plane; R-2600 family; used only for low-band radial/prop texture, not presented as a full-power recording','cut':[35,61]}}
def band(x,lo,hi):return signal.sosfiltfilt(signal.butter(2,[lo,hi],fs=RATE,btype='bandpass',output='sos'),x)
def normal(x,rms):return x*(rms/np.sqrt(np.mean(x*x)))
def decode(source):
 file=opt.source_dir/source['file'];raw=file.read_bytes();assert hashlib.sha256(raw).hexdigest()==source['sha256'],file
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-ss',str(source['cut'][0]),'-t',str(source['cut'][1]-source['cut'][0]),'-i',str(file),'-f','f32le','-ac','1','-ar',str(RATE),'-']),np.float32).astype(float)
bear=decode(SOURCES['bearcat']);wright=decode(SOURCES['b25'])
# Aerial R2800 source supplies the running-under-load character, not an idling bed.
# Filter subsonic/cockpit vibration and reduce the dominant low cabin resonance.
r2800=band(bear,50,8000)
# Simple measured cabin boom reduction around 80 Hz, preserving broadband exhaust.
f0=80;bw=1.8;b,a=signal.iirnotch(f0,bw,fs=RATE);r2800=signal.filtfilt(b,a,r2800)
# 14-cylinder game voice: airborne exhaust texture at the firing-count ratio plus
# original R2600 low-band texture. This is a composite, not an original full-power BMW.
exhaust=band(bear,180,8000);ratio=14/18
exhaust=np.interp(np.arange(len(bear))*ratio,np.arange(len(exhaust)),exhaust)
# Extend the source interval used by the slower pitched exhaust naturally; no
# cyclic chopping of a single combustion click or invented resonant oscillator.
r14=normal(exhaust,.17)+normal(band(wright,45,150),.085)
report={'schema':1,'build':214,'acquiredOn':'2026-10-28','publisher':'Pole Position Production / Sonniss','collection':'GameAudioGDC 2017','collectionUrl':'https://sonniss.com/gameaudiogdc/','tracklistUrl':'https://docs.google.com/spreadsheets/d/1aCBw_dNba_ajYziogKdi1nL7JmdggBwbZXBFSoNCAvY/edit','licenseUrl':'https://sonniss.com/gdc-bundle-license/','licenseVersion':'2.0, effective 2026-08-27; downloaded 2026-10-28','distribution':'Derived audio incorporated in this game/interactive project. Raw/source sounds are not redistributed as a sound library. No AI training.','sources':SOURCES,'loops':[]}
report['archiveUrl']='https://ftpmirror.your.org/pub/misc/sonniss2017/Sonniss.com%20-%20GDC%202017%20-%20Game%20Audio%20Bundle%20Part%206of9.zip'
report['sources']['bearcat']['acquisition']={'offset':498241339,'compressed':218806016,'size':226522926,'crc':1766862215}
report['sources']['b25']['acquisition']={'offset':976331934,'compressed':43351871,'size':45938490,'crc':3572946683}

for name,x,description in [('r2800-loaded',r2800,'Airborne R2800 cockpit source; ground warm-up is no longer the powered layer.'),('radial14-loaded',r14,'Composite of airborne R2800 exhaust retimed at 14/18, and R2600 low-band ground texture. Not an original R2600/BMW801 full-power take.')]:
 x-=x.mean();envelope=np.sqrt(ndimage.uniform_filter1d(x*x,round(RATE*.8))+1e-10);x*=np.clip(np.median(envelope)/envelope,.7,1.4)
 blend=RATE;w=np.arange(blend)/blend;y=x[:-blend].copy();y[:blend]=x[-blend:]*(1-w)+x[:blend]*w
 y-=y.mean();y=normal(y,.215);y=np.tanh(y*1.08)/1.08;y*=min(1,.80/np.max(abs(y)))
 file=OUT/(name+'-power.wav');wavfile.write(file,RATE,np.round(y*32767).astype('<i2'))
 f,p=signal.welch(y,RATE,nperseg=8192)
 report['loops'].append({'path':str(file.relative_to(ROOT)),'description':description,'seconds':len(y)/RATE,'sampleRate':RATE,'crossfadeSeconds':1,'rms':float(np.sqrt(np.mean(y*y))),'peak':float(max(abs(y))),'seamStep':float(abs(y[0]-y[-1])),'upperBandFraction':float(p[f>180].sum()/p.sum()),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/'loaded-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['loops'],indent=2))
