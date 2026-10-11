"""ELIO: Raketenstart-Geräusch, selbst synthetisiert (Zündung, Grollen, Aufsteigen). Aufruf: python3 tools/gen_rakete.py (braucht numpy, ffmpeg)."""
import json, os, subprocess, numpy as np, wave
SR = 44100; D = 5.5; rng = np.random.default_rng(11)
n = int(SR * D); x = np.arange(n) / SR
def lp(y, a):  # Tiefpass erster Ordnung, a = Glättung pro Probe (kann zeitabhängig sein)
    o = np.empty_like(y); s = 0.0; a = np.broadcast_to(a, y.shape)
    for i in range(len(y)): s += a[i] * (y[i] - s); o[i] = s
    return o
w = rng.standard_normal(n)
# Grollen: Tiefpass-Rauschen, wird lauter und etwas heller
rum = lp(w, 0.012 + 0.02 * np.clip(x / 2.5, 0, 1)); rum /= np.abs(rum).max()
# Zischen: helleres Rauschen, schwillt beim Abheben an und klingt mit der Entfernung ab
hiss = w - lp(w, 0.25); hiss /= np.abs(hiss).max()
# Zündung: kurzes Knistern am Anfang
ign = np.zeros(n); k = int(0.5 * SR); ign[:k] = rng.standard_normal(k) * (rng.random(k) < 0.02) * np.exp(-x[:k] * 4)
lift = np.clip((x - 0.6) / 1.2, 0, 1); away = np.exp(-np.clip(x - 3.2, 0, None) * 1.1)
y = (0.9 * rum * (0.25 + 0.75 * lift) + 0.28 * hiss * lift) * away + 0.6 * ign
y *= np.minimum(1, x / 0.05); y[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))
y = y / np.abs(y).max() * 0.85
out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio'); wav = '/tmp/raketenstart.wav'
with wave.open(wav, 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((y * 32767).astype(np.int16).tobytes())
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-b:a', '96k', os.path.join(out, 'raketenstart.mp3')], check=True)
print('ok')
