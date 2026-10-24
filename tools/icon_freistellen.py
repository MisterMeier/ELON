"""Icon aus Flow/Gemini (heller Hintergrund) freistellen, quadratisch zuschneiden, als WebP speichern.
Aufruf: python3 tools/icon_freistellen.py quelle.jpg ziel.webp [Größe=192]
Weiß und sehr helle Schatten am Rand werden durchsichtig, das Icon wird mit kleinem Rand mittig in ein Quadrat gesetzt."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from collections import deque
src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 192
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int); H, W, _ = a.shape
bg = a.min(2) > 226
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
alpha = Image.fromarray(((~mask) * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
rgba = im.convert('RGBA'); rgba.putalpha(alpha)
rgba = rgba.crop(rgba.getbbox())
w, h = rgba.size; s = int(max(w, h) * 1.08)
c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c.paste(rgba, ((s - w) // 2, (s - h) // 2))
c = c.resize((size, size), Image.LANCZOS)
c.save(dst, quality=90, method=6)
print(dst, c.size)
