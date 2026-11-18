from PIL import Image; import numpy as np; from scipy import ndimage as nd
SRC=r"C:/Projetos/Web/Vuumbora/Imagens/LogoMarca.png"
a=np.asarray(Image.open(SRC).convert('RGB')).astype(float); H,W,_=a.shape
mx=a.max(2)
# ---------- 1) badge alpha (rounded corners) ----------
dark=a.sum(2)<=12
lab0,_=nd.label(dark)
box=np.zeros((H,W),bool); K=280
for (y,x) in [(0,0),(0,W-1),(H-1,0),(H-1,W-1)]:
    box[max(0,y-K+1) if y else 0:(y+1 if y else K), (x-K+1 if x else 0):(x+1 if x else K)]=True
outside=np.zeros((H,W),bool)
for (y,x) in [(0,0),(0,W-1),(H-1,0),(H-1,W-1)]:
    outside|=(lab0==lab0[y,x])&box
print('outside px per corner',[int(outside[sl].sum()) for sl in [np.s_[:K,:K],np.s_[:K,-K:],np.s_[-K:,:K],np.s_[-K:,-K:]]])
interior=~nd.binary_dilation(outside,iterations=4)
d,(iy,ix)=nd.distance_transform_edt(~interior,return_indices=True)
N=a[iy,ix]                      # nearest interior colour
alpha_b=np.where(interior,1.0,np.clip(a.max(2)/np.maximum(N.max(2),1),0,1))
alpha_b[d>6]=0                  # deep corner = pure black -> transparent
rgb_b=np.where(interior[...,None],a,N)
np.save('badge_rgb.npy',rgb_b); np.save('badge_a.npy',alpha_b); deep=nd.binary_erosion(interior,iterations=18)
fill=a.copy()
for sg in (10,25,60):
    wd=nd.gaussian_filter(deep.astype(float),sg)
    Cf=np.stack([nd.gaussian_filter(a[...,c]*deep,sg) for c in range(3)],-1)/np.maximum(wd,1e-9)[...,None]
    todo=(~interior)&(fill.sum(2)<0)|(~interior)&(wd<1e-3)
    if sg==10: fill[~interior]=Cf[~interior]; bad=(~interior)&(wd<1e-3)
    else: fill[bad]=Cf[bad]; bad=bad&(wd<1e-3)
print('unfilled',int(bad.sum()))
np.save('ext_rgb.npy',fill)
# ---------- 2) foreground keying ----------
fg=mx>90
lab,n=nd.label(fg,structure=np.ones((3,3)))
sizes=nd.sum(fg,lab,range(1,n+1))
wave=sizes.argmax()+1
objs=nd.find_objects(lab)
assert objs[wave-1][0].start>900, objs[wave-1]
keep=np.zeros_like(fg)
groups={'symbol':(150,670),'wordmark':(670,860),'swoosh':(860,950),'tagline':(950,1000)}
for i in range(1,n+1):
    if i==wave or sizes[i-1]<30: continue
    keep|=lab==i
wavem=nd.binary_dilation(lab==wave,iterations=8)
band=nd.binary_dilation(keep,iterations=5)&~wavem
bgsamp=~nd.binary_dilation(keep|(lab==wave),iterations=7)&interior
# normalized convolution for smooth local background
s=12
w=nd.gaussian_filter(bgsamp.astype(float),s)
B=np.stack([nd.gaussian_filter(a[...,c]*bgsamp,s) for c in range(3)],-1)/np.maximum(w,1e-6)[...,None]
alpha=np.max((a-B)/np.maximum(255-B,1),axis=2)
alpha=np.clip((alpha-0.06)/0.94,0,1)
alpha[~band]=0
alpha=np.clip(alpha,0,1)
U=np.clip((a-(1-alpha[...,None])*B)/np.maximum(alpha[...,None],1e-3),0,255)
solid=alpha>0.92
blab,bn=nd.label(band,structure=np.ones((3,3)))
NS=U.copy()
for i,sl in enumerate(nd.find_objects(blab)):
    comp=blab[sl]==i+1; sc=solid[sl]&comp
    if not sc.any(): continue
    _,(yy,xx)=nd.distance_transform_edt(~sc,return_indices=True)
    sub=U[sl][yy,xx]; NS[sl][comp]=sub[comp]
wgt=np.clip((alpha-0.2)/0.5,0,1)[...,None]
F=np.where(solid[...,None],U,wgt*U+(1-wgt)*NS)
F=np.clip(F,0,255)
# residual check: recomposite vs original inside band
rec=alpha[...,None]*F+(1-alpha[...,None])*B
err=np.abs(rec-a).max(2)[band]
print('recomp err band: mean %.2f p95 %.2f p99 %.2f max %.1f'%(err.mean(),np.percentile(err,95),np.percentile(err,99),err.max()))
print('B in band median',np.median(B[band],axis=0).round(1),' bg samp median',np.median(a[bgsamp],axis=0))
np.save('fg_rgb.npy',F); np.save('fg_a.npy',alpha)
rgba=np.dstack([F,alpha*255]).round().astype(np.uint8)
Image.fromarray(rgba,'RGBA').save('fg_full.png')
for k,(y0,y1) in groups.items():
    m=np.zeros_like(alpha); m[y0:y1]=alpha[y0:y1]; np.save(f'a_{k}.npy',m)
    ys,xs=np.where(m>0.02); print(k,'bbox x',xs.min(),xs.max(),'y',ys.min(),ys.max())
