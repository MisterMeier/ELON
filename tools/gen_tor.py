"""Tor-Jubel für Kopfrechenfußball: ein gesungenes „Goooooaal!“ aus vielen Stimmen plus Stadion-Jubel.
Alles selbst synthetisiert (Formant-Synthese), keine fremden Aufnahmen. Aufruf: python3 tools/gen_tor.py (braucht numpy und ffmpeg)."""
import json, subprocess, os, numpy as np
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(11)
D = 4.2
N = int(SR * D)
T = np.arange(N) / SR

# Vokale als Formanten (Frequenz, Bandbreite, Pegel)
V = {
    'o': [(450, 80, 1.0), (800, 90, .6), (2600, 140, .12)],
    'a': [(780, 90, 1.0), (1200, 100, .7), (2700, 150, .18)],
    'l': [(360, 70, 1.0), (950, 110, .25), (2500, 160, .06)],
}

def track(points):
    """Stückweise lineare Kurve über die Zeit: [(t, wert), ...]."""
    ts, vs = zip(*points); return np.interp(T, ts, vs)

def voice(f0, start, scale=1.0, lead=False):
    """Eine Stimme ruft „Goooaal“. f0 = Grundton, scale verschiebt die Formanten (Körpergröße)."""
    s = start
    # Vokalverlauf: o lang halten, dann zu a, am Ende l
    mo = track([(0, 1), (s + 1.7, 1), (s + 2.15, 0), (D, 0)])
    ml = track([(0, 0), (s + 2.45, 0), (s + 2.75, 1), (D, 1)])
    ma = np.clip(1 - mo - ml, 0, 1)
    # Tonhöhe: Anstieg, Halten mit Vibrato, am Ende leicht fallend
    p = track([(0, f0 * .8), (s, f0 * .8), (s + .25, f0 * 1.15), (s + 2.2, f0 * 1.22), (s + 2.9, f0 * .95), (D, f0 * .9)])
    p *= 1 + .025 * np.sin(2 * np.pi * rng.uniform(5, 6.5) * T + rng.uniform(0, 6)) + .006 * np.convolve(rng.standard_normal(N), np.ones(400) / 20, 'same')
    ph = 2 * np.pi * np.cumsum(p) / SR
    y = np.zeros(N)
    for k in range(1, 40):
        fk = k * p
        if fk.min() > 5500: break
        amp = np.zeros(N)
        for mix_, vow in ((mo, 'o'), (ma, 'a'), (ml, 'l')):
            a = sum(g / (1 + ((fk - F * scale) / B) ** 2) for F, B, g in V[vow])
            amp += mix_ * a
        y += amp / k ** .3 * np.sin(k * ph + rng.uniform(0, 6))
    # Lautstärke: „G“-Einsatz, lautes Halten, Abklingen
    e = track([(0, 0), (s, 0), (s + .06, 1), (s + 2.3, .95), (s + 2.9, .55), (s + 3.3, 0), (D, 0)])
    y *= e
    # „G“: kurzer gedämpfter Knack vor dem Vokal
    gi = int(s * SR); g = np.convolve(rng.standard_normal(int(.035 * SR)), np.ones(12) / 12, 'same') * np.hanning(int(.035 * SR)) * .5
    y[gi:gi + len(g)] += g[:max(0, min(len(g), N - gi))]
    # leichte Heiserkeit beim Schreien
    y += .04 * np.convolve(rng.standard_normal(N), np.ones(6) / 6, 'same') * e * (2 if lead else 1)
    return y

def bandnoise(lo, hi):
    """Rauschen nur zwischen lo und hi Hz (über FFT), klingt wie Menge statt Rascheln."""
    X = np.fft.rfft(rng.standard_normal(N)); f = np.fft.rfftfreq(N, 1 / SR)
    X *= np.clip((f - lo) / 100, 0, 1) * np.clip((hi - f) / 300, 0, 1); return np.fft.irfft(X, N)

# Vorsänger (Kommentator) plus Chor aus vielen Fans
y = 1.4 * voice(185, .15, 1.0, lead=True)
for _ in range(14):
    y += voice(185 * rng.choice([1, 1, 1, 2]) * rng.uniform(.95, 1.06), .15 + rng.uniform(0, .08), rng.uniform(.92, 1.12)) * rng.uniform(.2, .4)
# Stadion: „Aaah“-Menge aus vielen leisen Stimmen + Rauschband, schwillt mit an
crowd = np.zeros(N)
for _ in range(10):
    f0 = rng.uniform(140, 320); p = f0 * (1 + .03 * np.sin(2 * np.pi * rng.uniform(3, 7) * T)); ph = 2 * np.pi * np.cumsum(p) / SR
    for k in range(1, 18):
        fk = k * f0; a = sum(g / (1 + ((fk - F) / B) ** 2) for F, B, g in V['a'])
        crowd += .15 * a / k ** .3 * np.sin(k * ph + rng.uniform(0, 6))
crowd += .8 * bandnoise(250, 2200) * (1 + .2 * np.sin(2 * np.pi * 1.3 * T))
crowd *= track([(0, 0), (.1, .5), (.6, 1), (3.2, .9), (D, 0)])
y = y / np.max(np.abs(y)) + .35 * crowd / np.max(np.abs(crowd))
y[-int(.3 * SR):] *= np.linspace(1, 0, int(.3 * SR))
y = np.tanh(1.2 * y) / np.tanh(1.2)  # etwas Druck wie aus dem Stadionlautsprecher
y = y / np.max(np.abs(y)) * .89

f = os.path.join(OUT, 'tor.mp3')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '112k', f], input=(y * 32767).astype('<i2').tobytes(), check=True)
cp = os.path.join(OUT, 'credits.json'); cr = [c for c in json.load(open(cp)) if c['id'] != 'tor']
cr.append({'id': 'tor', 'datei': 'assets/audio/tor.mp3', 'titel': 'Tor! (Goooal)', 'kategorie': 'Belohnung', 'stichworte': 'Tor, Fußball, Kopfrechenfußball, Jubel',
           'dauer': round(D, 1), 'quelle': 'tools/gen_tor.py', 'urheber': 'ELIO (selbst synthetisiert)', 'lizenz': 'Eigene Synthese, frei nutzbar',
           'erzeugt_am': '2026-10-10', 'bearbeitet': '', 'loop': False})
json.dump(cr, open(cp, 'w'), ensure_ascii=False, indent=1)
print('tor.mp3 ok')
