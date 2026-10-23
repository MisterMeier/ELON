"""Elo aus Greenscreen- oder Weiß-Bild freistellen (aus Flow/Gemini).
Aufruf: python3 tools/elo_keyen.py quelle.jpg ziel.png|ziel.webp [q] [loecher]
Mit „q“: auf 512x512 zuschneiden, Elo steht unten auf dem Rand (wie assets/elo/*-512.webp). Sonst: nur zugeschnitten.
Mit „loecher“: auch eingeschlossenes Grün (z. B. durch ein Geodreieck) wird durchsichtig. Nicht bei grünen Gegenständen."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from collections import deque
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int); H, W, _ = a.shape
r, g, b = a[..., 0], a[..., 1], a[..., 2]
green = (g - np.maximum(r, b)) > 45
white = a.min(2) > 238
bg = green | white
mask = np.zeros((H, W), bool); q = deque()
for x in range(W):
    for y in (0, H - 1):
        if bg[y, x] and not mask[y, x]: mask[y, x] = 1; q.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if bg[y, x] and not mask[y, x]: mask[y, x] = 1; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and not mask[ny, nx] and bg[ny, nx]: mask[ny, nx] = 1; q.append((ny, nx))
if 'loecher' in sys.argv: mask |= green
alpha = Image.fromarray(((~mask) * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
# Grünsaum entfernen: grüne Anteile an halbtransparenten Kanten auf Grau der anderen Kanäle zurücksetzen
al = np.asarray(alpha).astype(int); edge = (al > 0) & (al < 255) | (np.asarray(Image.fromarray(((~mask) * 255).astype('uint8')).filter(ImageFilter.MinFilter(5))) < 255) & ~mask
cap = np.maximum(r, b); a2 = a.copy(); a2[..., 1] = np.where(edge & (g > cap), cap, g)
rgba = Image.fromarray(a2.astype('uint8')).convert('RGBA'); rgba.putalpha(alpha)
rgba = rgba.crop(rgba.getbbox())
if 'q' in sys.argv[3:]:
    w, h = rgba.size; s = max(w, h); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c.paste(rgba, ((s - w) // 2, s - h))
    rgba = c.resize((512, 512), Image.LANCZOS)
rgba.save(dst, **({'quality': 88, 'method': 6} if dst.endswith('.webp') else {}))
print(dst, rgba.size)
