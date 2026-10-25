"""Exterior visual model only. Manual trace from supplied Ju 87 B-2 p14, 0 V.
Pixel coordinates refer to the 1344-px-wide page rendering. No imported mesh.
"""
import json,hashlib,pathlib
root=pathlib.Path(__file__).resolve().parents[3]
ref=root.parent/'upload/ju-87b2.pdf'
k=11/(1163-97);z=lambda x:(630-x)*k;y=lambda p:(440-p)*k
# x, upper silhouette y, lower silhouette y, half width in plan-view pixels.
trace=[[160,400,468,40],[200,386,489,43],[270,378,499,44],[350,367,499,44],[402,359,495,45],[450,382,492,45],[550,382,485,43],[662,382,478,42],[770,388,469,33],[870,391,461,24],[950,383,453,18],[1030,373,446,13],[1100,371,440,8],[1160,407,422,1]]
st=[dict(z=z(x),top=y(t),bottom=y(b),half=h*k,wide=(y(t)+y(b))/2,nTop=2,nBot=2.6) for x,t,b,h in trace]
# The drawing has an asymmetric cropped upper wing; use its complete lower half.
wingTrace=[[0,365,695],[1.5,366,660],[4.25,385,590],[6.55,398,492],[6.80,407,465],[6.90,430,438]]
wing=[dict(s=s,le=z(le),te=z(te),y=(-.12-.40*s/1.5 if s<=1.5 else -.52+(s-1.5)*.125),t=.16-(s/6.9)*.07,twist=-s/6.9*1.5) for s,le,te in wingTrace]
S={'title':'Ju 87 B-2, exterior game model','dimensions':{'span':13.8,'lengthApprox':11.0,'propellerDiameter':3.4,'tailSpan':5.0},'reference':{'name':ref.name,'sha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'pages':[11,12,13,14,15],'drawing':'Allgemeines 0 V','renderWidthPx':1344,'scaleMetresPerPixel':k},'traces':{'fuselage':trace,'wing':wingTrace},'fuselage':st,'wing':wing,'assumptions':['Cross-sections, airfoil thickness and camber are visual approximations; the manual overview supplies silhouettes only.','Front-view gull-wing heights estimated from the manual perspective on page 13.','Fictional RLM 70/71/65 finish and S2+AN code, weathering and panel layout authored for the game.','Cockpit detail, seat figures, hinge clearances and small fittings simplified; no engineering certification.']}
(root/'scripts/own-aircraft/ju87b2/shape.json').write_text(json.dumps(S,indent=2)+'\n')
