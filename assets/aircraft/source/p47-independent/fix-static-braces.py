"""Reattach two identified residual gear rods; no wing/airframe deletion."""
import bpy
from mathutils import Matrix

def fix_static_braces():
 obj=bpy.data.objects['StaticMesh1'];obj.update_from_editmode();mesh=obj.data
 # UV/normal splits do not define mechanical parts: join only equal positions.
 groups={};key=[]
 for v in mesh.vertices:
  k=tuple(round(x,5) for x in v.co);key.append(k);groups.setdefault(k,len(groups))
 parent=list(range(len(groups)))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for e in mesh.edges:
  a,b=(find(groups[key[i]]) for i in e.vertices);parent[a]=b
 comp={}
 for v in mesh.vertices:comp.setdefault(find(groups[key[v.index]]),[]).append(v.index)
 rods=[]
 for ids in comp.values():
  p=[obj.matrix_world@mesh.vertices[i].co for i in ids]
  lo=[min(v[k] for v in p) for k in range(3)];hi=[max(v[k] for v in p) for k in range(3)]
  # Blender X span, +Y aft, Z height. These two long narrow rods are outside
  # the original extractor's lateral band, and match the actual gear assembly.
  if lo[2]<-2.1 and hi[2]<-1.0 and lo[1]>-2.9 and hi[1]<-2.0 and 2.50<abs((lo[0]+hi[0])/2)<2.65:
   rods.append((ids,'GearLeft' if hi[0]<0 else 'GearRight'))
 assert len(rods)==2,[(len(ids),name) for ids,name in rods]
 # Duplicate the exact faces/UVs into their proper moving parents, then remove
 # those faces from the static mesh. The vertices/materials remain unchanged.
 face_sets=[]
 for ids,name in rods:
  ids=set(ids);faces=[p.index for p in mesh.polygons if all(v in ids for v in p.vertices)];face_sets.append((ids,faces,name))
 for ids,faces,name in face_sets:
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='DESELECT');bpy.ops.object.mode_set(mode='OBJECT')
  for v in obj.data.vertices:v.select=v.index in ids
  before=set(bpy.data.objects);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
  new=next(o for o in set(bpy.data.objects)-before if o.type=='MESH');new.name=name+' original outer brace'
  mat=new.matrix_world.copy();new.parent=bpy.data.objects[name];new.matrix_parent_inverse=Matrix.Identity(4);new.matrix_world=mat
  # Indices in the remaining mesh change after separation; identify the other
  # side afresh instead of reusing stale indices.
  if name==face_sets[0][2]:break
 # Extract the opposite rod from the now reduced static mesh using position.
 other='GearRight' if rods[0][1]=='GearLeft' else 'GearLeft';side=1 if other=='GearRight' else -1
 bpy.context.view_layer.update();obj.update_from_editmode()
 ids=[v.index for v in obj.data.vertices if (lambda p:side*p.x>2.50 and side*p.x<2.65 and -2.9<p.y<-2.0 and p.z<-1.0)(obj.matrix_world@v.co)]
 # All selected vertices belong to the already identified narrow rod; outer
 # wing skin at this station is above -1m and is never selected.
 assert len(ids)>30
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='DESELECT');bpy.ops.object.mode_set(mode='OBJECT')
 for v in obj.data.vertices:v.select=v.index in ids
 before=set(bpy.data.objects);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
 new=next(o for o in set(bpy.data.objects)-before if o.type=='MESH');new.name=other+' original outer brace';mat=new.matrix_world.copy();new.parent=bpy.data.objects[other];new.matrix_parent_inverse=Matrix.Identity(4);new.matrix_world=mat
 bpy.context.view_layer.update();print('Fixed original outer braces:',[(len(ids),name) for ids,name in rods],flush=True)

if __name__=='__main__':fix_static_braces()
