"""ELIO Audio-Mediathek: alle Geräusche werden hier selbst synthetisiert.
Keine fremden Aufnahmen, deshalb frei nutzbar. Aufruf: python3 tools/gen_audio.py (braucht numpy und ffmpeg)."""
import json, subprocess, os, numpy as np
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(7)
t = lambda d: np.arange(int(SR * d)) / SR

def env(n, a=0.005, r=0.3, d=None):
    x = np.ones(n); ai = max(1, int(a * SR)); x[:ai] = np.linspace(0, 1, ai)
    if d is not None: x *= np.exp(-np.arange(n) / SR / d)
    ri = min(n, int(r * SR)); x[n - ri:] *= np.linspace(1, 0, ri); return x

def bell(f, d, partials=((1, 1), (2.76, .5), (5.4, .25), (8.93, .12)), decay=1.2):
    x = t(d); y = sum(a * np.sin(2 * np.pi * f * p * x) * np.exp(-x * p / decay) for p, a in partials); return y * env(len(x), .002, .05)

def lp(y, k):  # einfacher Tiefpass (gleitender Mittelwert)
    return np.convolve(y, np.ones(k) / k, mode='same')

def noise(d): return rng.standard_normal(int(SR * d))

def mix(*parts, d=None):
    n = max(len(p) + int(o * SR) for o, p in parts) if d is None else int(d * SR); y = np.zeros(n)
    for o, p in parts:
        i = int(o * SR); m = min(len(p), n - i)
        if m > 0: y[i:i + m] += p[:m]
    return y

def fade_loop(y, f=0.5):  # weicher Übergang für Schleifen
    k = int(f * SR); y = y.copy(); y[:k] *= np.linspace(0, 1, k); y[-k:] *= np.linspace(1, 0, k); return y

S = {}
S['gong'] = bell(110, 6, ((1, 1), (1.49, .6), (2.0, .4), (2.97, .3), (4.1, .15)), 2.5) + .3 * bell(55, 6, ((1, 1),), 3)
S['klangschale'] = bell(392, 8, ((1, 1), (2.71, .35), (5.1, .12)), 3.5) * (1 + .15 * np.sin(2 * np.pi * 4 * t(8)))
S['glocke'] = np.concatenate([mix(*[(i * .09, bell(1320, .5, decay=.4)) for i in range(16)]), np.zeros(SR // 4)])
S['triangel'] = mix((0, bell(2650, 3, ((1, 1), (2.1, .4), (3.3, .2)), 1.6)), (.35, .7 * bell(2650, 3, ((1, 1), (2.1, .4)), 1.4)))
pf = t(1.4); fm = 2400 + 150 * np.sin(2 * np.pi * 28 * pf)
S['pfiff'] = (np.sin(2 * np.pi * np.cumsum(fm) / SR) * .8 + .15 * lp(noise(1.4), 3)) * env(len(pf), .02, .15)
tick = lambda f: mix((0, lp(noise(.03), 2) * env(int(.03 * SR), .001, .02)), (0, .5 * bell(f, .08, ((1, 1),), .03)))
S['uhr'] = mix(*[(i * .5, tick(3000 if i % 2 else 2200)) for i in range(20)])
beep = lambda f, d: np.sin(2 * np.pi * f * t(d)) * env(int(SR * d), .005, .05)
S['countdown'] = mix((0, beep(880, .18)), (1, beep(880, .18)), (2, beep(880, .18)), (3, beep(1320, .6)))
S['zeit-um'] = mix(*[(i * .28, .6 * (beep(988, .12) + beep(1319, .12))) for i in range(6)])

def clap(d=.06):
    y = lp(noise(d), 2); return y * env(len(y), .001, .02, .012)
def crowd(d, dens, vol=.5):
    y = np.zeros(int(SR * d))
    for _ in range(int(dens * d)):
        i = rng.integers(0, len(y) - 4000); c = clap() * rng.uniform(.3, 1); y[i:i + len(c)] += c
    return y * vol
ap = crowd(5, 260); S['applaus'] = ap * env(len(ap), .4, 1.5)
roar = lp(noise(4), 30) * 3 * env(int(4 * SR), .15, 1.5) * (1 + .3 * np.sin(2 * np.pi * .7 * t(4)))
horn = sum(np.sign(np.sin(2 * np.pi * f * t(1.2))) * .08 for f in (233, 294, 349)) * env(int(1.2 * SR), .05, .3)
S['jubel'] = mix((0, roar), (0, crowd(4, 200, .6)), (.2, lp(horn, 6)))

def tone(f, d, a=.5, harm=(1, .5, .3, .2)):
    x = t(d); return a * sum(h * np.sin(2 * np.pi * f * (k + 1) * x) for k, h in enumerate(harm)) * env(len(x), .01, .08)
S['fanfare'] = mix((0, tone(392, .18)), (.2, tone(392, .18)), (.4, tone(392, .18)), (.6, tone(523, .9)), (.6, tone(659, .9, .3)), (.6, tone(784, .9, .25)))
S['erfolg'] = mix(*[(i * .11, bell(f, 1.2, ((1, 1), (2, .3)), .6)) for i, f in enumerate((523, 659, 784, 1047))])
S['funkeln'] = mix(*[(rng.uniform(0, 1.6), .5 * bell(rng.uniform(2000, 4200), .7, ((1, 1),), .25)) for _ in range(22)])
S['hoppla'] = mix((0, tone(392, .22, .5, (1, .2))), (.22, tone(330, .45, .5, (1, .2))))
dr = np.zeros(int(3.2 * SR)); hit = lambda: lp(rng.standard_normal(900), 2) * np.exp(-np.arange(900) / 250)
for i in range(0, len(dr) - 2000, int(SR / 22)): dr[i:i + 900] += hit() * (0.25 + 0.75 * i / len(dr))
S['trommelwirbel'] = mix((0, dr), (3.1, 1.2 * bell(70, 1.5, ((1, 1), (1.6, .5)), .5) + .6 * lp(noise(1.5), 2) * np.exp(-t(1.5) * 6)))
sp = t(6); S['spannung'] = (.4 * np.sin(2 * np.pi * 55 * sp) + .25 * np.sin(2 * np.pi * 58.3 * sp) + .15 * np.sin(2 * np.pi * 110 * sp) * np.sin(2 * np.pi * .5 * sp)) * env(len(sp), 1.5, 1.5)

# Atmosphären (30 s, als Schleife gedacht)
D = 30
rain = lp(noise(D), 4) * .35 + mix(*[(rng.uniform(0, D - .05), .5 * lp(noise(.02), 2) * np.exp(-t(.02) * 200)) for _ in range(1600)], d=D)
S['regen'] = fade_loop(rain)
w = t(D); swell = .55 + .45 * np.sin(2 * np.pi * w / 7.5)
S['meer'] = fade_loop(lp(noise(D), 60) * 6 * swell + lp(noise(D), 8) * .4 * swell ** 3)
def chirp(f0):
    d = rng.uniform(.08, .18); x = t(d); f = f0 * (1 + .4 * np.sin(np.pi * x / d)); return .3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), .01, .03)
birds = mix(*[(o + k * .2, chirp(f)) for o, f in [(rng.uniform(0, D - 2), rng.uniform(2500, 5000)) for _ in range(70)] for k in range(rng.integers(1, 4))], d=D)
S['wald'] = fade_loop(birds + lp(noise(D), 80) * .5)

META = {
 'gong': ('Gong', 'Signale', 'Start, Stundenbeginn, Ruhe'), 'klangschale': ('Klangschale', 'Signale', 'Ruhe, Konzentration, Achtsamkeit'),
 'glocke': ('Schulglocke', 'Signale', 'Pause, Ende'), 'triangel': ('Triangel', 'Signale', 'Aufmerksamkeit, Wechsel'),
 'pfiff': ('Pfiff', 'Signale', 'Bewegung stopp, Sport'), 'uhr': ('Uhr tickt', 'Zeit', 'Arbeitsphase, Zeitdruck'),
 'countdown': ('Countdown 3-2-1', 'Zeit', 'Start, Wettbewerb'), 'zeit-um': ('Zeit ist um', 'Zeit', 'Ende der Arbeitsphase'),
 'applaus': ('Applaus', 'Belohnung', 'Lob, Präsentation'), 'jubel': ('Jubel', 'Belohnung', 'Tor, Sieg, Kopfrechenfußball'),
 'fanfare': ('Fanfare', 'Belohnung', 'Sieger, Mission geschafft'), 'erfolg': ('Erfolg', 'Belohnung', 'richtig, geschafft'),
 'funkeln': ('Funkeln', 'Belohnung', 'Magie, Überraschung, Stern'), 'hoppla': ('Hoppla', 'Hinweis', 'falsch, nochmal versuchen'),
 'trommelwirbel': ('Trommelwirbel', 'Spannung', 'Auflösung, Gewinner, Ergebnis'), 'spannung': ('Spannung', 'Spannung', 'Problemstellung, Rätsel, Krimi'),
 'regen': ('Regen', 'Atmosphäre', 'Stillarbeit, Lesen, Wetter'), 'meer': ('Meeresrauschen', 'Atmosphäre', 'Entspannung, Reise, Urlaub'),
 'wald': ('Wald mit Vögeln', 'Atmosphäre', 'Natur, Frühling, N&T'),
}
os.makedirs(OUT, exist_ok=True); credits = []
for k, y in S.items():
    y = y / (np.max(np.abs(y)) or 1) * .89; pcm = (y * 32767).astype('<i2').tobytes()
    f = os.path.join(OUT, k + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '96k', f], input=pcm, check=True)
    ti, cat, tags = META[k]
    credits.append({'id': k, 'datei': 'assets/audio/' + k + '.mp3', 'titel': ti, 'kategorie': cat, 'stichworte': tags, 'dauer': round(len(y) / SR, 1),
                    'quelle': 'tools/gen_audio.py', 'urheber': 'ELIO (selbst synthetisiert)', 'lizenz': 'Eigene Synthese, frei nutzbar', 'erzeugt_am': '2026-10-10', 'bearbeitet': '', 'loop': cat == 'Atmosphäre'})
json.dump(credits, open(os.path.join(OUT, 'credits.json'), 'w'), ensure_ascii=False, indent=1)
print(len(credits), 'Sounds')
