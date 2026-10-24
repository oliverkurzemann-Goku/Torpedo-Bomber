"""Inspect an actual .ipa/.zip, .app or payload directory without trusting filenames.
Uses the dated review allow/deny hashes. Unknown model hashes fail closed.
This does not substitute for rendering/performance on a physical iPad.
"""
import argparse,hashlib,json,pathlib,zipfile,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('package');p.add_argument('--p47-only',action='store_true');p.add_argument('--report');a=p.parse_args()
audit=json.loads((ROOT/'app/release/model-review/delivery-audit.json').read_text())
deny=json.loads((ROOT/'app/release/model-review/blocked-baseline-hashes.json').read_text())['models']
if a.p47_only:deny=[m for m in deny if 'p47' in m['path'].lower()]
blocked={m['sha256']:m for m in deny};allowed={m['sha256']:m for m in audit['models'] if m['category']=='documented-compatible-license'}
target=pathlib.Path(a.package);rows=[]
def inspect(name,b):
 h=hashlib.sha256(b).hexdigest();m=blocked.get(h);model=name.lower().endswith(('.glb','.fbx'));status='BLOCKED' if m else 'UNKNOWN' if model and h not in allowed and not a.p47_only else 'PASS'
 if model or m:rows.append({'file':name,'bytes':len(b),'sha256':h,'status':status,'knownBlockedSource':m})
if target.is_dir():
 for f in target.rglob('*'):
  if f.is_file():inspect(f.relative_to(target).as_posix(),f.read_bytes())
else:
 with zipfile.ZipFile(target) as z:
  for info in z.infolist():
   if not info.is_dir():inspect(info.filename,z.read(info))
fail=[r for r in rows if r['status']!='PASS'];report={'package':target.name,'scope':'P47 superseded binary exclusion only' if a.p47_only else 'All models, exact allow/deny hash review; unknown hashes rejected','modelFiles':len(rows),'pass':not fail,'failures':len(fail),'files':rows,'physicalIpadTest':'NOT PERFORMED'}
text=json.dumps(report,indent=2)+'\n'
if a.report:pathlib.Path(a.report).write_text(text)
print(json.dumps({k:v for k,v in report.items() if k!='files'}));sys.exit(2 if fail else 0)
