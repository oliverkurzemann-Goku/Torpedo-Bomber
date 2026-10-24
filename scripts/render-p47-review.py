import bpy,math,pathlib,sys,json
from mathutils import Vector
r=pathlib.Path(__file__).resolve().parent.parent;out=r/'build/p47-independent';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(out/'p47-independent.glb'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
# Blender Z-up; GLB runtime remains glTF Y-up.
world=bpy.data.worlds.new('ReviewWorld');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.52,.62,.70,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
for name,pos,power,size in [('Key',(8,-10,13),2200,10),('Fill',(-10,-3,7),1100,8),('Rim',(1,9,10),1500,8)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='ReviewCamera';scene.camera=camera
for name,pos in [('hero',(13,-17,7)),('side',(20,0,0)),('front',(0,-20,0)),('top',(0,0,22))]:
 camera.location=pos;camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=20 if name=='top' else 15;scene.render.filepath=str(out/('p47-'+name+'.png'));bpy.ops.render.render(write_still=True)
bpy.ops.file.pack_all()
for name,file in [('SOURCE.json',r/'assets/aircraft/source/p47-independent/SOURCE.json'),('PROVENANCE.json',out/'provenance.json')]:
 text=bpy.data.texts.new(name);text.write(file.read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(out/'P47D-Independent-Review.blend'))
