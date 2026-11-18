from PIL import Image; import numpy as np, glob, os
R=r"C:/Projetos/Web/Vuumbora"
files=sorted(glob.glob(R+"/packages/ui/assets/brand/**/*.png",recursive=True))+sorted(glob.glob(R+"/apps/*/assets/*.png"))
for f in files:
    im=Image.open(f); a=np.asarray(im)
    info=f"{im.size[0]}x{im.size[1]} {im.mode}"
    if im.mode=='RGBA':
        al=a[...,3]; ys,xs=np.where(al>0)
        info+=f" alpha[min {al.min()} max {al.max()}] corners={al[0,0]},{al[0,-1]},{al[-1,0]},{al[-1,-1]} content x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}"
        if f.endswith(('adaptive-icon.png','splash-icon.png')):
            c=im.size[0]/2; r=np.sqrt((xs+.5-c)**2+(ys+.5-c)**2).max(); info+=f" rmax={r:.1f} ({r/im.size[0]*108:.1f}dp de 108)"
    info+=f" {os.path.getsize(f)//1024}KB"
    print(f.replace(R+'/',''),'|',info)
