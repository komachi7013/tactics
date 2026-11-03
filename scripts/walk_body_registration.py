"""Optional body-only registration; execution on art awaits the user's choice.

One monotonic vertical map is shared by all frames. Pixels above the protected
head boundary are copied exactly. No frame-specific sole locking or rescaling.
"""
import numpy as np


def body_factor(peak_y,target_y=280.0,pivot_y=165.0,blend_height=12.0):
    denominator=peak_y-pivot_y-blend_height/2
    if denominator<=0:raise ValueError('sole must be below the protected head region')
    factor=1+(target_y-peak_y)/denominator
    if not .85<=factor<=1.15:raise ValueError('required body deformation exceeds 15 percent; regenerate instead')
    return factor


def inverse_body_y(destination_y,factor,pivot_y=165.0,blend_height=12.0):
    y=np.asarray(destination_y,dtype=np.float64);t=y-pivot_y;result=y.copy()
    boundary=blend_height*(1+factor)/2
    blend=(t>0)&(t<boundary)
    q=(factor-1)/(2*blend_height)
    result[blend]=pivot_y+2*t[blend]/(1+np.sqrt(1+4*q*t[blend]))
    body=t>=boundary
    result[body]=pivot_y+(t[body]-(1-factor)*blend_height/2)/factor
    return result


def register_body(rgba,factor,master_ground,body_reference_height,pivot_y=165.0):
    source=np.asarray(rgba,dtype=np.uint8);height=source.shape[0];scale=180/body_reference_height
    world_y=280+(np.arange(height)-master_ground)*scale
    source_y=master_ground+(inverse_body_y(world_y,factor,pivot_y)-280)/scale
    y0=np.floor(source_y).astype(int);weight=(source_y-y0)[:,None,None]
    a=source.astype(np.float64)/255;a[:,:,:3]*=a[:,:,3:4]
    rows0=a[np.clip(y0,0,height-1)].copy();rows1=a[np.clip(y0+1,0,height-1)].copy()
    rows0[(y0<0)|(y0>=height)]=0;rows1[(y0+1<0)|(y0+1>=height)]=0
    mixed=rows0*(1-weight)+rows1*weight;alpha=mixed[:,:,3:4]
    mixed[:,:,:3]=np.divide(mixed[:,:,:3],alpha,out=np.zeros_like(mixed[:,:,:3]),where=alpha>1e-8)
    output=np.rint(np.clip(mixed,0,1)*255).astype(np.uint8)
    output[world_y<=pivot_y]=source[world_y<=pivot_y]
    return output
