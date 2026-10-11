"""Drei neue Signale, komplett selbst synthetisiert (keine fremden Aufnahmen):
blasmusik.mp3 (bayerische Polka mit Tuba, Begleitung, Trompete und Tusch),
dudelsack.mp3 (schottischer Dudelsack: Bordunpfeifen und Spielpfeife mit Verzierungen),
bigben.mp3 (Westminster-Glockenspiel und Stundenschläge).
Aufruf: python3 tools/gen_signale3.py (braucht numpy und ffmpeg)."""
import os, subprocess, numpy as np
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(7)

def save(name, y):
    y = y / (np.abs(y).max() + 1e-9) * .89
    raw = (y * 32767).astype('<i2').tobytes()
    p = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '128k', p], input=raw, check=True)
    return len(y) / SR

def add(buf, x, t):
    i = int(t * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n]

def lowpass(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / fc) ** 4), len(x))

def reverb(x, dec=1.4, mix=.25):
    n = int(SR * dec); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.9 / dec)
    ir = lowpass(ir, 3500); wet = np.fft.irfft(np.fft.rfft(x, len(x) + n) * np.fft.rfft(ir, len(x) + n))[:len(x)]
    return x + mix * wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max()

# ---------- Blech (Blasmusik) ----------
def brass(f, dur, vel=1., bright=1., soft=False):
    n = int(SR * (dur + .12)); t = np.arange(n) / SR
    att = .025 if not soft else .05
    env = np.clip(t / att, 0, 1) * np.where(t < dur, 1 - .15 * t / max(dur, .01), np.exp(-(t - dur) * 30))
    pitch = f * (1 - .03 * np.exp(-t * 40)) * (1 + .004 * np.sin(2 * np.pi * 5.5 * t))
    ph = 2 * np.pi * np.cumsum(pitch) / SR
    y = np.zeros(n)
    for k in range(1, 30):
        if k * f > 7000: break
        # Blech wird bei mehr Lautstärke heller
        a = (env * vel) ** (1 + .35 * (k - 1) / bright) / k ** .6
        y += a * np.sin(k * ph)
    return y * vel

def drum(dur=.35, f=60):
    n = int(SR * dur); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f * (1 + 1.5 * np.exp(-t * 30))) / SR) * np.exp(-t * 9) + .3 * lowpass(rng.standard_normal(n), 1500) * np.exp(-t * 40)

def cymbal(dur=.25):
    n = int(SR * dur); t = np.arange(n) / SR
    x = rng.standard_normal(n); X = np.fft.rfft(x); fr = np.fft.rfftfreq(n, 1 / SR); X *= np.clip((fr - 4000) / 2000, 0, 1)
    return np.fft.irfft(X, n) * np.exp(-t * 22) * .1

def blasmusik():
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    beat = .27  # Achtel bei flotter Polka
    # Melodie (eigene Komposition) in B-Dur, MIDI-Noten, Länge in Achteln
    mel = [(65, 1), (62, 1), (65, 1), (70, 1), (69, 2), (67, 1), (65, 1), (63, 1), (60, 1), (63, 1), (67, 1), (65, 2), (63, 1), (62, 1),
           (65, 1), (62, 1), (65, 1), (70, 1), (74, 2), (72, 1), (70, 1), (69, 1), (72, 1), (70, 1), (67, 1), (65, 2), (70, 2)]
    # Akkorde je Takt (2 Viertel = 4 Achtel): Grundton, Quinte, Dreiklang
    bars = [(46, 53, [58, 62, 65]), (41, 48, [57, 60, 63]), (39, 46, [55, 58, 63]), (46, 53, [58, 62, 65]),
            (46, 53, [58, 62, 65]), (39, 46, [55, 58, 63]), (41, 48, [57, 60, 63]), (46, 53, [58, 62, 65])]
    L = len(bars) * 4 * beat + 2.6
    y = np.zeros(int(SR * L))
    for b, (r, q, ch) in enumerate(bars):
        t0 = b * 4 * beat
        add(y, brass(hz(r - 12), beat * 1.6, .95, .6), t0)            # Tuba „Umm“
        add(y, brass(hz(q - 12), beat * 1.6, .85, .6), t0 + 2 * beat)
        for off in (beat, 3 * beat):                                   # Begleitung „pa“
            for m in ch: add(y, brass(hz(m - 12), beat * .55, .32, .8), t0 + off)
        add(y, drum() * .6, t0); add(y, cymbal(), t0 + beat); add(y, cymbal(), t0 + 3 * beat)
    t = 0.
    for m, d in mel:                                                    # Trompete / Flügelhorn
        add(y, brass(hz(m), beat * d * .9, .75, 1.6), t); add(y, brass(hz(m - 12), beat * d * .9, .3, 1.2), t)
        t += beat * d
    # Schluss-Tusch: Akkord mit Triller
    t0 = len(bars) * 4 * beat
    for m in (46, 58, 62, 65, 70): add(y, brass(hz(m), 1.6, .55, 1.3), t0)
    for k in range(12): add(y, brass(hz(74 if k % 2 else 77), .07, .45, 1.6), t0 + k * .07)
    add(y, brass(hz(82), .9, .5, 1.6), t0 + .84)
    add(y, drum(.6) * .9, t0); add(y, cymbal(.9) * 1.6, t0)
    return reverb(y, 1.1, .18)

# ---------- Dudelsack ----------
def reed(f, n, t, bright=1.):
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.zeros(n)
    for k in range(1, 40):
        fk = k * np.mean(f)
        if fk > 9000: break
        boost = 1 + 1.6 * np.exp(-((fk - 1500) / 700) ** 2) + 1.2 * np.exp(-((fk - 3200) / 900) ** 2)
        y += boost / k ** (.85 / bright) * np.sin(k * ph + k * .7)
    return y

def dudelsack():
    A = 478.
    P = {'G': A * 7 / 8, 'a': A, 'b': A * 9 / 8, 'c': A * 5 / 4, 'd': A * 4 / 3, 'e': A * 3 / 2, 'f': A * 5 / 3, 'g': A * 7 / 4, 'A': A * 2}
    # Melodie im Stil eines traditionellen Marsches, Länge in Achteln
    mel = [('a', 2), ('a', 1), ('b', 1), ('c', 2), ('a', 1), ('c', 1), ('e', 2), ('e', 1), ('f', 1), ('e', 2), ('c', 1), ('a', 1),
           ('A', 3), ('g', 1), ('f', 1), ('e', 1), ('f', 1), ('g', 1), ('A', 2), ('e', 2), ('c', 2), ('b', 2), ('a', 4)]
    beat = .24; lead = .9
    L = lead + sum(d for _, d in mel) * beat + 1.0; n = int(SR * L); t = np.arange(n) / SR
    # Bordun: Bass (A2) und zwei Tenor-Bordune (A3), schwellen am Anfang an
    sw = np.clip(t / .6, 0, 1) ** 2 * np.clip((L - t) / .25, 0, 1)
    dr = reed(np.full(n, A / 4) * (1 + .0015 * np.sin(2 * np.pi * .3 * t)), n, t, .8) * .55
    dr += reed(np.full(n, A / 2 * 1.0012), n, t, .9) * .4 + reed(np.full(n, A / 2 * .9991), n, t, .9) * .4
    # Spielpfeife: Tonhöhenkurve mit Verzierungen (hohes G vor jeder Note)
    f = np.full(n, P['a']); ts = lead
    for i, (nm, d) in enumerate(mel):
        i0, i1 = int(ts * SR), int((ts + d * beat) * SR)
        f[i0:i1] = P[nm]
        if i and mel[i - 1][0] != 'g':
            gn = int(.028 * SR); f[i0:i0 + gn] = P['g'] if nm != 'g' else P['A']
        ts += d * beat
    f[int(ts * SR):] = P['a']
    f = np.convolve(f, np.ones(60) / 60, 'same')
    ch = reed(f, n, t, 1.3) * np.clip((t - lead + .25) / .1, 0, 1) * np.clip((L - t) / .3, 0, 1)
    y = dr * sw + ch * .9
    y = lowpass(y, 6500)
    return reverb(y, 1.6, .22)

# ---------- Big Ben ----------
def bell(f, dur=4., vel=1.):
    n = int(SR * dur); t = np.arange(n) / SR
    parts = [(.5, 1., 1.1), (1., .8, 1.6), (1.19, .55, 2.2), (1.5, .35, 2.8), (2., .6, 2.4), (2.51, .25, 4.), (2.66, .3, 4.5), (3.01, .18, 5.5), (4.07, .12, 7.)]
    y = np.zeros(n)
    for r, a, dcy in parts:
        for det in (-.0009, .0009):
            y += a * np.exp(-t * dcy / 2.2) * np.sin(2 * np.pi * f * r * (1 + det) * t + rng.uniform(0, 6))
    strike = lowpass(rng.standard_normal(n), 3000) * np.exp(-t * 60) * .25
    return (y + strike) * vel * np.clip(t / .003, 0, 1)

def bigben():
    hz = {'G#': 415.3, 'F#': 370., 'E': 329.6, 'B': 246.9}
    phrases = [['E', 'G#', 'F#', 'B'], ['E', 'F#', 'G#', 'E'], ['G#', 'E', 'F#', 'B'], ['B', 'F#', 'G#', 'E']]
    step = .62; t = 0.; ev = []
    for p in phrases[2:]:
        for k, nm in enumerate(p):
            ev.append((t, hz[nm], .55)); t += step * (2 if k == 3 else 1)
        t += .35
    t += .8
    for k in range(2): ev.append((t, 164.8, 1.0)); t += 2.0  # großer Stundenschlag (E3)
    L = t + 2.0; y = np.zeros(int(SR * L))
    for ts, f, v in ev: add(y, bell(f, 5.5 if f < 200 else 3.6, v), ts)
    return reverb(y, 2.4, .3)

if __name__ == '__main__':
    for nm, fn in (('blasmusik', blasmusik), ('dudelsack', dudelsack), ('bigben', bigben)):
        print(nm, round(save(nm, fn()), 1), 's')
