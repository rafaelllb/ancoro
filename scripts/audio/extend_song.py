# -*- coding: utf-8 -*-
"""
Estende AncoroSong_sem_fala.mp3 para a duracao do video demo, saltando entre trechos similares
(beat-sync) em vez de repetir a faixa inteira.

Uso (da raiz do repo):   python scripts/audio/extend_song.py
Depende de: librosa, soundfile, numpy.  Depois, para mixar no video:
  ffmpeg -i demo-video/Ancoro_Demo.mp4 -i AncoroSong_sem_fala_demo.mp3 -filter_complex \
    "[1:a]volume=0.25[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k demo-video/Ancoro_Demo_musica_sem_fala.mp4
"""
# [2026-10-08] Criado: extensao por saltos beat-sync entre trechos similares - Rafael Brito
# [2026-10-08] Alterado: saida do calmo->build movida de 54.68 para 54.20 (silencio): em 54.68 o corte caia entre dois
#   ataques (54.36 e 54.64) e interrompia a frase, soando 'desconectado' - Rafael Brito
# [2026-10-08] Alterado: corte no onset real (menos MARGIN) com crossfade curto; corte na grade de batidas
#   atravessava o ataque da nota e gerava emenda audivel em ~54.7s
import numpy as np
import soundfile as sf
import librosa

SRC = 'AncoroSong_sem_fala.mp3'
OUT = 'AncoroSong_sem_fala_demo.mp3'
TARGET = 178.651        # duracao do Ancoro_Demo.mp4 (ffprobe)
FADE_OUT = 3.0          # s
CROSSFADE = 0.020       # s - emendas curtas preservam ataques; aumente (ex.: 0.08) se ainda soar "cortado"
MARGIN = 0.015          # s - quanto ANTES do onset a emenda termina

# ======================== EDITE AQUI ========================
# Cada salto = (instante de SAIDA na faixa original, instante de CHEGADA na faixa original), em segundos.
# O script puxa cada instante para a batida mais proxima e ajusta ao onset. A musica toca de 0 ate a
# primeira saida, pula para a chegada, segue ate a proxima saida, e assim por diante, ate o fim.
# Os saltos precisam estar em ordem de execucao. Saida e chegada devem estar na mesma posicao do
# compasso (diferenca multipla de 4 batidas = 4 x 0.557 s = 2.23 s).
JUMPS = [
    (54.20, 10.50),   # calmo -> volta ao build; sai DENTRO do silencio (53.3-54.3 s, rms ~0.009)
    (47.04, 37.76),   # repete final do pico (16 batidas)
    (54.20, 10.50),   # calmo -> volta ao build de novo
    (59.813, 51.084), # repete trecho calmo (16 batidas). Escolhido por busca: harmonia/energia/ritmo das duas pontas
                      # (custo 0.09 contra 0.39 do antigo 62.83->55.77, que gerava a "quebra" em ~2:39)
]
# Outras emendas boas (ranking de similaridade harmonica/timbrica), saida -> chegada:
#   (47.04, 37.76) (42.68, 33.39) (43.77, 34.48) (62.83, 55.77) (63.88, 54.68) (62.30, 55.22) (31.76, 13.77)
# ============================================================

y, sr = sf.read(SRC)
if y.ndim == 1:
    y = np.stack([y, y], 1)
dur = len(y) / sr
y22 = librosa.resample(librosa.to_mono(y.T), orig_sr=sr, target_sr=22050)
_, bf = librosa.beat.beat_track(y=y22, sr=22050, units='frames', start_bpm=108, tightness=200)
beats = librosa.frames_to_time(bf, sr=22050)
onsets = librosa.onset.onset_detect(y=y22, sr=22050, hop_length=64, units='time', backtrack=True)


# [2026-10-08] Alterado: cada ponta do salto é cortada no ataque (onset) MAIS PRÓXIMO dela, menos MARGIN, de forma
#   independente. Antes usava "batida + deslocamento comum (o menor dos dois)": o rastreador de batidas estava
#   deslocado de forma diferente nas duas pontas (-4 ms na saída, -48 ms na chegada) e a emenda em ~2:39 ficava ~40 ms
#   fora do ritmo (intervalo entre ataques 0.24 s em vez de 0.275 s) — audível como "quebra" — Rafael Brito
def attack(t):
    o = float(onsets[np.argmin(abs(onsets - t))])
    return o if abs(o - t) < 0.08 else t


def pair(leave, land):
    cl, cn = attack(leave) - MARGIN, attack(land) - MARGIN
    print(f'salto {leave:7.2f} -> {land:7.2f}  (ajustado: {cl:7.3f} -> {cn:7.3f})')
    return cl, cn


cuts = [pair(a, b) for a, b in JUMPS]
path, cur = [], 0.0
for leave, land in cuts:
    path.append((cur, leave))
    cur = land
path.append((cur, dur))

h = int(CROSSFADE * sr / 2)
out = np.zeros((int((sum(b - a for a, b in path) + 2) * sr), 2))
pos = 0
for k, (a, b) in enumerate(path):
    i, j = int(round(a * sr)), int(round(b * sr))
    chunk = y[max(i - h, 0):j + h].copy()
    w = np.ones(len(chunk))
    t = np.linspace(0, np.pi / 2, 2 * h)
    if k > 0:
        w[:2 * h] *= np.sin(t)
    if k < len(path) - 1:
        w[-2 * h:] *= np.cos(t)
    start = pos - h if k > 0 else 0
    out[start:start + len(chunk)] += chunk * w[:, None]
    pos += j - i

print(f'duracao bruta {pos / sr:.2f}s -> alvo {TARGET}s')
N = int(TARGET * sr)
if pos < N:
    raise SystemExit(f'Curto demais por {(N - pos) / sr:.2f}s: adicione um salto em JUMPS.')
out = out[:N]  # o excedente vem da cauda silenciosa do final
f = int(FADE_OUT * sr)
out[-f:] *= np.linspace(1, 0, f)[:, None]
sf.write('_ext_tmp.wav', out, sr)
import subprocess
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', '_ext_tmp.wav', '-c:a', 'libmp3lame', '-q:a', '2', OUT], check=True)
import os
os.remove('_ext_tmp.wav')
print('gerado', OUT)
