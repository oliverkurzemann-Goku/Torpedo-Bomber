"""Fetch selected free SONNISS GDC2017 sources, validating ZIP CRC and SHA256."""
import argparse,urllib.request,struct,zlib,hashlib,pathlib,concurrent.futures
arg=argparse.ArgumentParser(description='Acquire the two licensed free GDC2017 source files. Raw recordings must remain outside the public checkout.');arg.add_argument('--dest',type=pathlib.Path,required=True);opt=arg.parse_args();root=opt.dest.resolve();repo=pathlib.Path(__file__).resolve().parents[2]
if root==repo or repo in root.parents:raise SystemExit('Raw sources must remain outside the public checkout')
root.mkdir(parents=True,exist_ok=True)
url='https://ftpmirror.your.org/pub/misc/sonniss2017/Sonniss.com%20-%20GDC%202017%20-%20Game%20Audio%20Bundle%20Part%206of9.zip'
sources=[('Bearcat_t5_onbrd_flybys_cockpit.wav',498241339,218806016,226522926,1766862215,'9c84c4682b34208e2ee6f26a77f17877e52ed26585a444eb7cca0eea165a6003'),('B-25_t1_ext_startup_idle_below_plane.wav',976331934,43351871,45938490,3572946683,'f189a9b26f7515f2f911d48db38af7a0a0332088989a3154cda34affc769ec04')]
def get(a,b):
 req=urllib.request.Request(url,headers={'Range':f'bytes={a}-{b}','User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=60) as r:
  assert r.status==206,(r.status,r.headers)
  data=r.read(b-a+1)
  assert len(data)==b-a+1,len(data)
  return data
def work(s):
 name,offset,compressed,size,crc,sha=s;p=root/name
 if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==sha:return name+' exists'
 h=get(offset,offset+29);assert h[:4]==b'PK\x03\x04';nl,el=struct.unpack_from('<HH',h,26);start=offset+30+nl+el
 raw=zlib.decompress(get(start,start+compressed-1),-15)
 assert len(raw)==size and zlib.crc32(raw)==crc
 assert hashlib.sha256(raw).hexdigest()==sha;p.write_bytes(raw)
 return name+' verified'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
 for result in ex.map(work,sources):print(result,flush=True)
