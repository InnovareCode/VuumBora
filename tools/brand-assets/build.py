from PIL import Image; import numpy as np, os, shutil
ROOT=r"C:/Projetos/Web/Vuumbora"
BR=ROOT+"/packages/ui/assets/brand"; os.makedirs(BR+"/master",exist_ok=True)
F=np.load('fg_rgb.npy'); A={k:np.load(f'a_{k}.npy') for k in ['symbol','wordmark','swoosh','tagline']}
def rgba(alpha): return Image.fromarray(np.dstack([F,alpha*255]).round().clip(0,255).astype(np.uint8),'RGBA')
def bbox(alpha,t=0.004):
    ys,xs=np.where(alpha>t); return xs.min(),ys.min(),xs.max()+1,ys.max()+1
def crop(alpha,pad):
    x0,y0,x1,y1=bbox(alpha); return rgba(alpha).crop((x0-pad,y0-pad,x1+pad,y1+pad))
def rs(im,size):  # premultiplied resampling: no dark fringe
    return im.convert('RGBa').resize(size,Image.LANCZOS).convert('RGBA')
def scales(im,name,w1=None,h1=None):
    W,H=im.size
    if w1 is None: w1=round(h1*W/H)
    if h1 is None: h1=round(w1*H/W)
    for s,suf in [(1,''),(2,'@2x'),(3,'@3x')]:
        tw,th=w1*s,h1*s; assert tw<=W and th<=H, (name,s,'upscale')
        rs(im,(tw,th)).save(f"{BR}/{name}{suf}.png",optimize=True)
    im.save(f"{BR}/master/{name}.png",optimize=True)
lock=A['symbol']+A['wordmark']+A['swoosh']+A['tagline']
P=16
lockup=crop(lock,P); scales(lockup,'vuumbora-lockup',w1=240)
selo=crop(A['symbol'],P); scales(selo,'vuumbora-selo',h1=64)
# horizontal: selo + wordmark (VuumBora), wordmark height = 0.45 x selo height, no upscaling
sym=crop(A['symbol'],0); wm=crop(A['wordmark'],0)
hs=round(wm.height/0.45); sym=rs(sym,(round(sym.width*hs/sym.height),hs))
gap=round(0.12*hs)
Wt=P+sym.width+gap+wm.width+P; Ht=P+hs+P
hor=Image.new('RGBA',(Wt,Ht),(0,0,0,0))
hor.alpha_composite(sym,(P,P)); hor.alpha_composite(wm,(P+sym.width+gap,P+(hs-wm.height)//2))
scales(hor,'vuumbora-horizontal',h1=40)
# badge: full art, rounded corners as alpha
bR=np.load('badge_rgb.npy'); bA=np.load('badge_a.npy')
badge=Image.fromarray(np.dstack([bR,bA*255]).round().clip(0,255).astype(np.uint8),'RGBA')
scales(badge,'vuumbora-badge',w1=96,h1=96)
# ---------- app icons ----------
ext=Image.fromarray(np.load('ext_rgb.npy').round().clip(0,255).astype(np.uint8),'RGB')
icon=ext.resize((1024,1024),Image.LANCZOS)
lk=crop(lock,0)
def fit_circle(im,canvas,radius):
    al=np.asarray(im)[...,3]>1; ys,xs=np.where(al)
    cx,cy=im.width/2,im.height/2; rmax=np.sqrt((xs+.5-cx)**2+(ys+.5-cy)**2).max()
    s=radius/rmax; t=rs(im,(round(im.width*s),round(im.height*s)))
    out=Image.new('RGBA',(canvas,canvas),(0,0,0,0)); out.alpha_composite(t,((canvas-t.width)//2,(canvas-t.height)//2)); return out,s
fg,s1=fit_circle(lk,1024,1024*33/108*0.97)   # adaptive safe zone = 66dp circle of 108dp
sp,s2=fit_circle(lk,1024,1024*0.5*0.96)      # splash: inscribed circle (Android 12 icon mask)
print('scale adaptive',round(s1,3),'splash',round(s2,3))
for app in ['passenger','driver']:
    d=f"{ROOT}/apps/{app}/assets"; os.makedirs(d,exist_ok=True)
    icon.save(d+"/icon.png",optimize=True); fg.save(d+"/adaptive-icon.png",optimize=True); sp.save(d+"/splash-icon.png",optimize=True)
