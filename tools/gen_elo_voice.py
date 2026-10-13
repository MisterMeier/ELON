# Hinweis 13.10.2026: Die Dateien in assets/audio/elo stammen jetzt von ElevenLabs (Stimme „Oswald“). Dieses Skript erzeugt die alte Piper-Fassung; es überschreibt die neuen Dateien.
# Elos Stimme: feste Sätze mit Piper (Stimme „Thorsten“, high, Datensatz CC0) erzeugen und als „weise-tief“ klingen lassen.
# Aufruf: python3 tools/gen_elo_voice.py <pfad/de_DE-thorsten-high.onnx>   (braucht piper-tts und ffmpeg)
import json, subprocess, sys, os, tempfile
PH = [
 ('hallo', 'Hallo zusammen! Schön, dass ihr da seid.'),
 ('bereit', 'Seid ihr bereit? Dann kann es losgehen.'),
 ('super', 'Super gemacht!'),
 ('geloest', 'Das habt ihr richtig gut gelöst.'),
 ('dran', 'Jetzt seid ihr dran.'),
 ('zuhoeren', 'Hört gut zu.'),
 ('nachvorne', 'Schaut mal nach vorne.'),
 ('zeitum', 'Die Zeit ist um.'),
 ('partner', 'Arbeitet jetzt zu zweit.'),
 ('gelernt', 'Was habt ihr heute gelernt?'),
 ('fehler', 'Fehler sind Helfer. Probiert es nochmal.'),
 ('tschuess', 'Tschüss, bis zum nächsten Mal!'),
 ('leiser1', 'Bitte wieder leiser.'),
 ('leiser2', 'Es ist zu laut.'),
 ('leiser3', 'Leise, bitte.'),
 ('leiser4', 'Huhu! Ich kann nichts mehr hören.'),
 ('leiser5', 'Pause für die Ohren, bitte leiser.'),
]
m = sys.argv[1]; out = 'assets/audio/elo'; os.makedirs(out, exist_ok=True); cred = []
FX = 'asetrate=22050*0.89,aresample=22050,atempo=1.1236,equalizer=f=150:t=q:w=1:g=3,aecho=0.8:0.6:40:0.12,loudnorm=I=-16:TP=-1.5'
for k, t in PH:
    w = tempfile.mktemp(suffix='.wav')
    subprocess.run([sys.executable, '-m', 'piper', '-m', m, '-c', m + '.json' if os.path.exists(m + '.json') else sys.argv[2], '-f', w,
                    '--length-scale', '1.15', '--noise-scale', '0.6', '--sentence-silence', '0.3'], input=t.encode(), check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w, '-af', FX, '-ac', '1', '-b:a', '64k', f'{out}/{k}.mp3'], check=True)
    os.remove(w)
    cred.append({'id': 'elo-' + k, 'datei': f'{out}/{k}.mp3', 'text': t, 'quelle': 'tools/gen_elo_voice.py',
                 'urheber': 'ELIO, erzeugt mit Piper (rhasspy) und der Stimme „Thorsten“ (Thorsten Müller)',
                 'lizenz': 'Stimmdatensatz Thorsten-Voice: CC0; Piper: MIT; Ergebnis frei nutzbar'})
json.dump({'stimme': 'de_DE-thorsten-high, Klang „weise-tief“', 'saetze': cred}, open(f'{out}/credits.json', 'w'), ensure_ascii=False, indent=1)
print(len(cred), 'Sätze')
