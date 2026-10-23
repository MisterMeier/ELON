# Elo-Bild freistellen: grauen Hintergrund und Bodenschatten entfernen, 512 px WebP.
# Aufruf: python3 tools/elo_freistellen.py quelle.png assets/elo/elo-<name>-real-512.webp
import sys
from PIL import Image, ImageFilter
import numpy as np
from collections import deque
src,dst=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGB');a=np.asarray(im).astype(int);H,W,_=a.shape
mx=a.max(2);mn=a.min(2);sat=mx-mn;lum=a.mean(2)
bgish=(sat<26)&(lum>150)&(mx<240)
mask=np.zeros((H,W),bool);q=deque()
for x in range(W):
  for y in (0,H-1):
    if bgish[y,x]: mask[y,x]=1;q.append((y,x))
for y in range(H):
  for x in (0,W-1):
    if bgish[y,x] and not mask[y,x]: mask[y,x]=1;q.append((y,x))
while q:
  y,x=q.popleft()
  for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
    ny,nx=y+dy,x+dx
    if 0<=ny<H and 0<=nx<W and not mask[ny,nx] and bgish[ny,nx]:
      mask[ny,nx]=1;q.append((ny,nx))
# floor shadow: bottom region, low saturation, mid-lum greys connected to bg
sh=(sat<22)&(lum>110)
m2=mask.copy()
for it in range(40):
  g=np.zeros_like(m2);g[1:]|=m2[:-1];g[:-1]|=m2[1:];g[:,1:]|=m2[:,:-1];g[:,:-1]|=m2[:,1:]
  g&=sh;g[:int(H*.8)]=False
  new=g&~m2
  if not new.any():break
  m2|=new
alpha=Image.fromarray(((~m2)*255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
rgba=im.convert('RGBA');rgba.putalpha(alpha)
bb=rgba.getbbox();rgba=rgba.crop(bb)
w,h=rgba.size;s=max(w,h);c=Image.new('RGBA',(s,s),(0,0,0,0));c.paste(rgba,((s-w)//2,s-h))
c=c.resize((512,512),Image.LANCZOS);c.save(dst,'WEBP',quality=88,method=6)
print(dst,bb)
