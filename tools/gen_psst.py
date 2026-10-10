"""Elo sagt „Pssst!“: kurzer P-Laut und ein weicher Zischlaut. Selbst synthetisiert, keine fremden Aufnahmen.
Aufruf: python3 tools/gen_psst.py (braucht numpy und ffmpeg)."""
import json, subprocess, os, numpy as np
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(5)

def band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= np.clip((f - lo) / 400, 0, 1) * np.clip((hi - f) / 1500, 0, 1); return np.fft.irfft(X, len(x))

def env(n, pts):
    t = np.arange(n) / SR; ts, vs = zip(*pts); return np.interp(t, ts, vs)

D = 1.5; n = int(SR * D)
p = band(rng.standard_normal(int(.03 * SR)), 300, 3000) * np.hanning(int(.03 * SR)) * .8  # „p“
ss = band(rng.standard_normal(n), 3500, 9000) * env(n, [(0, 0), (.08, .9), (.25, 1), (1.05, .85), (1.45, 0), (D, 0)])
ss *= 1 + .08 * np.sin(2 * np.pi * 6 * np.arange(n) / SR)  # leichtes Lufts-Wackeln wie beim echten Zischen
y = np.zeros(int(.06 * SR) + n); y[:len(p)] += p; y[int(.06 * SR):] += ss
y = y / np.max(np.abs(y)) * .85
f = os.path.join(OUT, 'psst.mp3')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '96k', f], input=(y * 32767).astype('<i2').tobytes(), check=True)
cp = os.path.join(OUT, 'credits.json'); cr = [c for c in json.load(open(cp)) if c['id'] != 'psst']
cr.append({'id': 'psst', 'datei': 'assets/audio/psst.mp3', 'titel': 'Pssst!', 'kategorie': 'Elo', 'stichworte': 'leise, Ruhe, Lautstärke, Elo',
           'dauer': round(len(y) / SR, 1), 'quelle': 'tools/gen_psst.py', 'urheber': 'ELIO (selbst synthetisiert)', 'lizenz': 'Eigene Synthese, frei nutzbar',
           'erzeugt_am': '2026-10-10', 'bearbeitet': '', 'loop': False})
json.dump(cr, open(cp, 'w'), ensure_ascii=False, indent=1)
print('psst.mp3 ok')
