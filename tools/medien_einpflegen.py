"""ELONUKI: extern erzeugte Medien (z. B. aus Gemini) klein machen und in assets/medien/ einpflegen.

Aufruf: python3 tools/medien_einpflegen.py [EINGANG]   (Standard: /mnt/project-files/medien-eingang)
Braucht ffmpeg und Pillow. Dateiname im Eingang: FACH_thema_motiv.ext, z. B. E_london_baeckerei.png
  FACH: E M K D N G I W DZ oder ALLG.  Endung -ton im Motiv (z. B. M_bruch_pizza-ton.mp4) behält den Ton im Video.
Knopf-Icons: Dateiname ICON_<icon-name>.png (z. B. ICON_w-quiz.png, ICON_hilfe.png) landet als assets/icons/<icon-name>.webp (192 px),
  weißer Rand wird freigestellt, der Name kommt in ICO_FILES in app.html und ICO_V wird hochgezählt.
Ergebnis: assets/medien/<fach>/<thema>-<motiv>.webp|.mp4|.svg, bei Videos dazu -poster.webp,
ein Eintrag in assets/medien/medien.json und (außer Videos) in assets/offline.json. Erledigte Dateien wandern nach EINGANG/erledigt/.
Die Dateien kommen über GitHub Pages, nicht über Supabase, kosten also keinen Supabase-Egress."""
import json, os, re, subprocess, sys, datetime
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'medien')
KAT = os.path.join(OUT, 'medien.json')
OFF = os.path.join(ROOT, 'assets', 'offline.json')
FACH = {'E', 'M', 'K', 'D', 'N', 'G', 'I', 'W', 'DZ', 'ALLG'}
BILD_MAX, FREI_MAX, VID_MAX = 1600, 800, 1280      # längste Seite in Pixel (Hintergrund, Freisteller, Video-Breite)
GRENZE = {'bild': 300e3, 'svg': 150e3, 'video': 2.5e6}  # darüber gibt es eine Warnung
UML = str.maketrans({'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue'})

def slug(s): return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.translate(UML).lower())).strip('-')

def run(*a): subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def probe(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
                        '-of', 'json', p], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout); s = (j.get('streams') or [{}])[0]
    return s.get('width', 0), s.get('height', 0), float(j.get('format', {}).get('duration') or 0)

def bild(src, ziel):
    im = Image.open(src); im.load()
    frei = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255  # echte Transparenz = Freisteller
    im = im.convert('RGBA' if frei else 'RGB'); im.thumbnail((FREI_MAX,) * 2 if frei else (BILD_MAX,) * 2, Image.LANCZOS)
    im.save(ziel, 'WEBP', quality=80, method=6)
    return {'typ': 'bild', 'breite': im.width, 'hoehe': im.height, 'frei': frei}

def video(src, ziel, ton):
    vf = f"scale='min({VID_MAX},iw)':-2:flags=lanczos,fps=30,format=yuv420p"
    run('ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
        '-profile:v', 'main', '-movflags', '+faststart', *(['-c:a', 'aac', '-b:a', '96k'] if ton else ['-an']), ziel)
    w, h, d = probe(ziel); poster = ziel[:-4] + '-poster.webp'
    run('ffmpeg', '-y', '-v', 'error', '-ss', f'{min(1.0, d / 2):.2f}', '-i', ziel, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '75', poster)
    return {'typ': 'video', 'breite': w, 'hoehe': h, 'dauer': round(d, 1), 'loop': not ton and d <= 20, 'ton': ton, 'poster': poster}

def svg(src, ziel):
    t = open(src, encoding='utf-8').read()
    t = re.sub(r'<script[\s\S]*?</script>|<foreignObject[\s\S]*?</foreignObject>', '', t, flags=re.I)  # nichts Ausführbares
    t = re.sub(r'\son\w+\s*=\s*("[^"]*"|\'[^\']*\')', '', t, flags=re.I)
    t = re.sub(r'(?:xlink:)?href\s*=\s*("|\')(?:https?:|javascript:)[^"\']*\1', '', t, flags=re.I)  # keine fremden Adressen
    t = re.sub(r'<!--[\s\S]*?-->', '', t); t = re.sub(r'>\s+<', '><', t).strip()
    open(ziel, 'w', encoding='utf-8').write(t)
    m = re.search(r'viewBox\s*=\s*"[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"', t)
    return {'typ': 'svg', **({'breite': round(float(m[1])), 'hoehe': round(float(m[2]))} if m else {})}

ICO = os.path.join(ROOT, 'assets', 'icons'); APP = os.path.join(ROOT, 'app.html')

def freistellen(im):
    """Weißen Hintergrund vom Rand her transparent machen (Gemini liefert oft keine echte Transparenz)."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    if im.getextrema()[3][0] < 250: return im            # schon transparent
    weiss = lambda c: c[0] > 238 and c[1] > 238 and c[2] > 238
    todo = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]; seen = set()
    while todo:
        x, y = todo.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not weiss(px[x, y]): continue
        seen.add((x, y)); px[x, y] = (255, 255, 255, 0)
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im

def icon(src, name):
    im = freistellen(Image.open(src)); im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
    side = max(im.size); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq = sq.resize((192, 192), Image.LANCZOS); os.makedirs(ICO, exist_ok=True); sq.save(os.path.join(ICO, name + '.webp'), 'WEBP', quality=85, method=6)
    a = open(APP, encoding='utf-8').read(); m = re.search(r"const ICO_FILES=new Set\(\[([^\]]*)\]\)", a)
    if m and f"'{name}'" not in m[1]:
        a = a.replace(m[0], m[0][:-2] + f",'{name}'])", 1)
    a = re.sub(r"const ICO_V='[^']*'", "const ICO_V='" + datetime.date.today().strftime('%Y%m%d') + "i'", a, count=1)
    open(APP, 'w', encoding='utf-8').write(a)

def main():
    ein = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/medien-eingang')
    kat = json.load(open(KAT, encoding='utf-8')) if os.path.exists(KAT) else []
    off = json.load(open(OFF, encoding='utf-8')); fertig = os.path.join(ein, 'erledigt'); n = 0
    for f in sorted(os.listdir(ein)):
        src = os.path.join(ein, f); stem, ext = os.path.splitext(f); ext = ext.lower()
        if not os.path.isfile(src) or f.startswith('.') or ext == '.md': continue
        teile = stem.split('_')
        if teile[0].upper() == 'ICON' and len(teile) == 2 and ext in ('.png', '.jpg', '.jpeg', '.webp'):
            nm = re.sub(r'[^a-z0-9-]', '', teile[1].lower())
            try: icon(src, nm)
            except Exception as e: print(f'FEHLER {f}: {e}'); continue
            print(f'OK {f} → assets/icons/{nm}.webp'); n += 1; os.makedirs(fertig, exist_ok=True); os.replace(src, os.path.join(fertig, f)); continue
        if len(teile) < 3 or teile[0].upper() not in FACH:
            print(f'ÜBERSPRUNGEN {f}: Name muss FACH_thema_motiv sein, z. B. E_london_baeckerei.png'); continue
        if ext == '.json':
            print(f'ÜBERSPRUNGEN {f}: Lottie wird nicht eingebaut. Bitte als MP4 oder animiertes SVG anlegen.'); continue
        fach = teile[0].upper(); ton = teile[-1].lower().endswith('-ton')
        if ton: teile[-1] = teile[-1][:-4]
        name = slug(teile[1]) + '-' + slug('-'.join(teile[2:])); ordner = 'allg' if fach == 'ALLG' else fach.lower()
        os.makedirs(os.path.join(OUT, ordner), exist_ok=True); basis = os.path.join(OUT, ordner, name)
        try:
            if ext in ('.png', '.jpg', '.jpeg', '.webp'): info = bild(src, basis + '.webp'); ziel = basis + '.webp'
            elif ext in ('.mp4', '.mov', '.m4v', '.webm', '.gif'): ziel = basis + '.mp4'; info = video(src, ziel, ton)
            elif ext == '.svg': ziel = basis + '.svg'; info = svg(src, ziel)
            else: print(f'ÜBERSPRUNGEN {f}: Format {ext} kenne ich nicht.'); continue
        except Exception as e:
            print(f'FEHLER {f}: {getattr(e, "stderr", b"") or e}'); continue
        rel = lambda p: os.path.relpath(p, ROOT).replace(os.sep, '/')
        mid = f'{ordner}-{name}'; groesse = os.path.getsize(ziel); motiv = ' '.join(teile[2:]).replace('-', ' ')
        e = {'id': mid, 'datei': rel(ziel), 'typ': info['typ'], 'fach': '' if fach == 'ALLG' else fach,
             'titel': ' · '.join(w[:1].upper() + w[1:] for w in (teile[1].replace('-', ' '), motiv)),
             'alt': '', 'stichworte': teile[1].replace('-', ' '),
             **{k: v for k, v in info.items() if k not in ('typ', 'poster')}, 'bytes': groesse,
             'quelle': 'Google Gemini (KI-erzeugt)', 'lizenz': 'Eigene KI-Erzeugung für den Unterricht',
             'erzeugt_am': datetime.date.today().isoformat()}
        if info.get('poster'): e['poster'] = rel(info['poster'])
        kat = [x for x in kat if x['id'] != mid] + [e]
        for p in [rel(ziel)] * (info['typ'] != 'video') + [e.get('poster')]:
            if p and p not in off: off.append(p)
        warn = ' WARNUNG: groß, kürzer oder kleiner erzeugen' if groesse > GRENZE[info['typ']] else ''
        print(f'OK {f} → {rel(ziel)} ({groesse // 1024} KB){warn}'); n += 1
        os.makedirs(fertig, exist_ok=True); os.replace(src, os.path.join(fertig, f))
    json.dump(sorted(kat, key=lambda x: x['id']), open(KAT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(off, open(OFF, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{n} Datei(en) eingepflegt. Titel und alt-Text in assets/medien/medien.json bei Bedarf noch anpassen.')

if __name__ == '__main__':
    main()
