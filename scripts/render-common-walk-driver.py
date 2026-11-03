"""Blender motion reference, not final character art.

One deterministic IK gait and camera projection for all four directions.
Run with Blender --background --factory-startup --python this_file -- E.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/walk-standard-v1'
direction=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'E'
DEST=OUT/direction;DEST.mkdir(parents=True,exist_ok=True)
H=1.8;N=32;CYCLE_MS=800
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True;scene.world.color=(.25,.25,.25)
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.35,.35,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.render.fps=40


def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.8
    return m


skin=material('neutral mannequin',(.46,.52,.57));boots=material('boots',(.19,.23,.28))
joint=material('joint',(.30,.35,.40))


def sphere(name,r,mat,scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def rod(name,r,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=1)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def segment(o,a,b):
    a,b=Vector(a),Vector(b);delta=b-a;o.location=(a+b)/2;o.rotation_mode='QUATERNION'
    o.rotation_quaternion=Vector((0,0,1)).rotation_difference(delta);o.scale.z=delta.length


pelvis=sphere('pelvis',.17,skin,(.9,1.1,.8));torso=sphere('torso',.24,skin,(.72,1,.95))
head=sphere('head',.255,skin,(1,.94,1.04));nose=sphere('front marker nose',.045,skin,(1.4,.8,.8))
limbs={}
for side in [-1,1]:
    limbs[side]={'thigh':rod('thigh',.075,skin),'shin':rod('shin',.060,skin),
                 'knee':sphere('knee',.077,joint),'foot':sphere('foot',.085,boots,(1.75,.8,.56)),
                 'upperArm':rod('upper arm',.05,skin),'forearm':rod('forearm',.045,skin),'hand':sphere('hand',.06,skin)}

bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera
xy={'E':(6,-8),'N':(-6,-8),'S':(6,8),'W':(-6,8)}[direction]
camera.location=(xy[0],xy[1],6.5);target=Vector((0,0,.90));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=2.8
for pos,power,size in [((4,-4,7),500,5),((-3,4,5),350,4)]:
    bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size


def gait_foot(phase):
    phase%=1;span=.30*H
    if phase<.6:
        u=phase/.6;x=span/2-span*u;lift=0
        pitch=(max(0,1-u/.16)*.18-max(0,(u-.82)/.18)*.18)
    else:
        u=(phase-.6)/.4;s=u*u*(3-2*u);x=-span/2+span*s;lift=.055*H*math.sin(math.pi*u)
        pitch=-.12*math.sin(math.pi*u)
    return x,lift,pitch


def knee_position(hip,ankle):
    # Equal two-segment leg with a consistent forward-facing knee plane.
    delta=ankle-hip;distance=delta.length;half=distance/2
    length=.43;perp=Vector((1,0,0));perp-=delta.normalized()*perp.dot(delta.normalized());perp.normalize()
    bend=math.sqrt(max(0,length*length-half*half))
    return (hip+ankle)/2+perp*bend


landmarks=[]
for frame in range(N):
    phase=frame/N;bounce=.008*H*(1-math.cos(phase*4*math.pi))/2
    sway=.004*H*math.sin(phase*2*math.pi)
    pelvis.location=(0,sway,.89+bounce);torso.location=(0,sway,1.16+bounce)
    head.location=(.025,sway,1.56+bounce);nose.location=(.28,sway,1.56+bounce)
    points={}
    for side in [-1,1]:
        p=(phase+(0 if side==1 else .5))%1;x,lift,pitch=gait_foot(p)
        hip=Vector((0,side*.115+sway,.89+bounce));ankle=Vector((x,side*.115,.085+lift))
        knee=knee_position(hip,ankle);l=limbs[side]
        segment(l['thigh'],hip,knee);segment(l['shin'],knee,ankle);l['knee'].location=knee
        l['foot'].location=(x+.045,side*.115,.050+lift);l['foot'].rotation_euler=(0,pitch,0)
        shoulder=Vector((0,side*.245+sway,1.31+bounce));angle=-math.radians(8)*math.cos((phase+(0 if side==1 else .5))*2*math.pi)
        elbow=shoulder+Vector((math.sin(angle)*.28,0,-math.cos(angle)*.28))
        hand=elbow+Vector((math.sin(angle+.10)*.23,0,-math.cos(angle+.10)*.23))
        segment(l['upperArm'],shoulder,elbow);segment(l['forearm'],elbow,hand);l['hand'].location=hand
        points['L' if side==1 else 'R']={'hip':list(hip),'knee':list(knee),'ankle':list(ankle),'contact':p<.6}
    landmarks.append({'frame':frame,'phase':phase,'feet':points,'bounce':bounce,'sway':sway})
    scene.render.filepath=str(DEST/f'frame_{frame:03d}.png');bpy.ops.render.render(write_still=True)
(DEST/'kinematics.json').write_text(json.dumps({'direction':direction,'cycleMs':CYCLE_MS,'frames':N,'fps':40,
    'stepsPerCycle':2,'bodyHeight':H,'footStrokeBodyHeights':.30,'footLiftBodyHeights':.055,
    'hipBounceBodyHeights':.008,'armSwingDegrees':8,'landmarks':landmarks},indent=2)+'\n')
