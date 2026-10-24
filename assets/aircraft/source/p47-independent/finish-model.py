import bpy,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'v2'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'painted-intermediate.glb'))
scene=bpy.context.scene;scene.frame_set(0)
def material(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
steel=material('Own brushed steel fittings',(.29,.32,.32),.7,.4)
rubber=material('Own dusty rubber hoses',(.032,.030,.025),0,.88)
dark=material('Own weathered wheel hubs',(.13,.15,.14),.48,.58)
def link_to(o,parent):
 M=o.matrix_world.copy();o.parent=parent;o.matrix_world=M;return o
def rod(name,a,b,r,mat,parent,vertices=12):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 return link_to(o,parent)
def hose(name,points,r,mat,parent):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2;c.resolution_u=6;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(mat);link_to(o,parent)
 return o
tail=bpy.data.objects['TailGear'];tyre=bpy.data.objects['TailGearTyre1'];fork=bpy.data.objects['TailGearMesh1'];extension=.24
# Extend the strut while retaining fork shapes and the original pivot.
adj=[set() for _ in fork.data.vertices]
for e in fork.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
seen=set()
for i in range(len(adj)):
 if i in seen:continue
 ids=[];stack=[i];seen.add(i)
 while stack:
  k=stack.pop();ids.append(k)
  for q in adj[k]:
   if q not in seen:seen.add(q);stack.append(q)
 zs=[fork.data.vertices[k].co.z for k in ids];lo,hi=min(zs),max(zs)
 for k in ids:
  v=fork.data.vertices[k]
  if hi<-.05:v.co.z-=extension
  elif lo<-.1:v.co.z-=extension*max(0,min(1,(-v.co.z-.01)/.19))
tyre.location.z-=extension
tail['tailWheelExtensionMetres']=extension
bpy.context.view_layer.update()
def bounds(o):
 p=np.asarray([o.matrix_world@v.co for v in o.data.vertices]);return p,p.min(0),p.max(0)
p,lo,hi=bounds(tyre);hub=(lo+hi)/2
rod('Tailwheel exposed oleo',tail.matrix_world@Vector((0,-.025,-.035)),hub+[0,.02,.06],.023,steel,tail)
hose('Tailwheel hydraulic hose',[tail.matrix_world@Vector((.04,0,-.02)),hub+[.06,.02,.18],hub+[.055,-.02,.04]],.006,rubber,tail)
for name in ['GearLeft','GearRight']:
 parent=bpy.data.objects[name];wh=bpy.data.objects[name+'Tyre1'];p,lo,hi=bounds(wh);center=(lo+hi)/2;sign=-1 if name=='GearLeft' else 1
 outer=center.copy();outer[0]=lo[0]-.005 if sign<0 else hi[0]+.005
 # Wheel-hub ring and six axle fasteners, attached to the moving gear.
 bpy.ops.mesh.primitive_torus_add(major_segments=36,minor_segments=8,location=outer,rotation=(0,math.pi/2,0),major_radius=.14,minor_radius=.015);o=bpy.context.object;o.name=name+' rim bead';o.data.materials.append(dark);link_to(o,parent)
 for k in range(6):
  a=k*math.tau/6;pos=outer+np.array([sign*.014,math.sin(a)*.10,math.cos(a)*.10]);rod(name+' axle bolt '+str(k+1),pos-[.007,0,0],pos+[.007,0,0],.012,steel,parent,8)
 upper=np.array(parent.matrix_world.translation);rod(name+' polished oleo',upper+[0,-.015,-.30],upper+[0,-.015,-.67],.031,steel,parent)
 hose(name+' flexible brake hose',[upper+[sign*.06,-.02,-.10],upper+[sign*.09,-.09,-.58],center+[sign*.05,0,.16]],.009,rubber,parent)
# Correct the existing tail retraction action, leaving every articulated part native.
if tail.animation_data:
 tracks=tail.animation_data.nla_tracks
 for track in tracks:
  for strip in track.strips:
   if 'Gear_Retract' not in strip.action.name:continue
   act=strip.action
   slot=strip.action_slot
   for layer in act.layers:
    for st in layer.strips:
     bag=st.channelbag(slot)
     if not bag:continue
     for fc in bag.fcurves:
      if fc.data_path!='rotation_quaternion':continue
      target=[math.cos(-1.55/2),math.sin(-1.55/2),0,0][fc.array_index]
      for kp in fc.keyframe_points:
       if kp.co.x>1:kp.co.y=target;kp.handle_left.y=target;kp.handle_right.y=target
scene.frame_set(0);bpy.context.view_layer.update()
root=bpy.data.objects['P47D_Independent_v1'];root.name='P47D_Independent_v2';root['nativeAircraft']='p47-independent-v1';root['finishVersion']='v2 game scheme, service wear, tailwheel correction';root['newWorkCopyright']='Oliver Kurzemann — all reserved rights';root['tailwheelExtensionMetres']=extension
# Convert only the newly added curves so their hoses are included in GLB.
for o in list(bpy.data.objects):
 if o.type=='CURVE':
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
# Export in neutral flight axes, with original animation clips and pivot names.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'P47D-Independent-Review.glb'),export_format='GLB',export_extras=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_cameras=False,export_lights=False,export_materials='EXPORT',export_image_format='AUTO',export_jpeg_quality=96)
# Measure the common ground tangent of actual tyre meshes, rather than posing by eye.
wheel_objects=[bpy.data.objects[x] for x in ['GearLeftTyre1','GearRightTyre1','TailGearTyre1']]
wheelp=[bounds(o)[0] for o in wheel_objects]
def rotate(p,a):
 r=np.array([[1,0,0],[0,math.cos(a),-math.sin(a)],[0,math.sin(a),math.cos(a)]]);return p@r.T
def contact(a):return rotate(wheelp[0],a)[:,2].min()-rotate(wheelp[2],a)[:,2].min()
low,high=math.radians(-25),math.radians(5)
assert contact(low)*contact(high)<0
for _ in range(60):
 mid=(low+high)/2
 if contact(low)*contact(mid)<=0:high=mid
 else:low=mid
angle=(low+high)/2;level=rotate(wheelp[0],angle)[:,2].min()
static=np.concatenate([bounds(o)[0] for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('StaticMesh0','Rudder','Elevator'))]);posed=rotate(static,angle);aft=posed[:,1]>4
report={'tailWheelExtensionMetres':extension,'parkPitchDegrees':math.degrees(-angle),'groundTangentHeightNeutral':float(level),'threeWheelContactErrorsMetres':[float(rotate(p,angle)[:,2].min()-level) for p in wheelp],'aftAirframeClearanceMetres':float(posed[aft,2].min()-level),'hasOriginalClips':True,'deliveryState':'saved model candidate; not published to the game; physical iPad test not performed'}
(OUT/'geometry-check.json').write_text(json.dumps(report,indent=2));print('GROUND_CHECK',report,flush=True)
# Lighting for actual-model renders. The editable file retains neutral model coordinates.
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Neutral studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.28,.34,.40,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6
for name,pos,power,size in [('Key',(6,-9,12),2000,8),('Fill',(-9,-2,6),1400,9),('Rim',(2,9,9),2200,7)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,-.3))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Preview camera';scene.camera=cam;cam.data.type='ORTHO'
for name,pos,target,scale in [('hero',(13,-17,7),(0,0,-.4),14.6),('side',(20,0,0),(0,0,-.6),13.3),('detail',(7,-9,3.4),(0,-2,-.8),7.2)]:
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;scene.render.filepath=str(OUT/('P47-'+name+'-v2.png'));bpy.ops.render.render(write_still=True)
# Ground preview uses a temporary scene transform, removed before saving the source.
root.rotation_mode='XYZ';root.rotation_euler.x=angle;root.location.z=-level
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Preview floor only';floor.data.materials.append(material('Preview concrete',(.20,.22,.23),0,.9))
cam.location=(18,0,3.8);cam.rotation_euler=(Vector((0,0,1.8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=13.6;scene.render.filepath=str(OUT/'P47-ground-v2.png');bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(floor,do_unlink=True);root.rotation_euler.x=0;root.location.z=0
cam.location=(13,-17,7);cam.rotation_euler=(Vector((0,0,-.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=14.6
for name,path in [('Original provenance',ROOT/'PROVENANCE-v1.json'),('Paint source v2',ROOT/'repaint.py'),('Detail and gear source v2',ROOT/'finish-model.py'),('Measured ground check',OUT/'geometry-check.json')]:
 t=bpy.data.texts.new(name);t.write(path.read_text())
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'P47D-Independent-Review.blend'))
print('SAVED V2',flush=True)
