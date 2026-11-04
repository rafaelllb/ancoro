"""Monta o carrossel de LinkedIn (HTML 1080x1350 por lâmina) a partir das capturas de scripts/carousel/capture.js.

[2026-10-29] Criado — Rafael Brito
[2026-10-30] Alterado (pedido do Rafael): rodapé só com "Ancora ReqOps Method" (removido "SAP S/4HANA Utilities"); removida a assinatura
  "Rafael Brito · Ancoro" da última lâmina; novas lâminas 5 (grafo de dependências) e 8 (requisito vinculado ao processo). Total 11.
Uso: python -X utf8 scripts/carousel/build.py <dir_das_capturas> <dir_saida>
Depois: NODE_PATH=<playwright> node scripts/carousel/render.js <dir_saida> <arquivo.pdf>
Decisões:
- Texto em português, escrito para quem decide/implementa SAP Utilities no LinkedIn (gerentes, consultores, TI): uma ideia por lâmina,
  título curto, imagem real do produto (dados fictícios do demo). Nenhuma menção a fornecedor/modelo de IA.
- Recortes feitos aqui (Pillow) para não depender de CSS: enquadram só o conteúdo útil e tiram avisos/margens em branco.
"""
import sys, os, html
from PIL import Image, ImageChops

shots, out = sys.argv[1], sys.argv[2]
# [2026-10-30] recorte do grafo na captura 1920x1000 (x0, y0, x1, y1): REQ-003 no centro com as dependências (esq.) e fornecimentos (dir.)
GRAPH_CROP = (30, 430, 770, 730)
POPUP_CROP = (1612, 176, 1914, 400)   # card do requisito selecionado (canto superior direito do grafo)
os.makedirs(out, exist_ok=True)
img = lambda n: Image.open(os.path.join(shots, n)).convert('RGB')

def save(im, name, maxw=2000, q=88):
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(os.path.join(out, name), 'JPEG', quality=q, optimize=True)
    return name

def content_crop(im, pad=70):
    """recorta pela caixa do conteúdo não-branco (+ margem)"""
    bg = Image.new('RGB', im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 14 else 0)
    box = diff.getbbox() or (0, 0, im.width, im.height)
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))

# ---- recortes
a = save(img('asis.png'), 'asis.jpg')
t = save(img('tobe.png'), 'tobe.jpg')
cmp_ = img('compare.jpg'); s = cmp_.width / 2000
c = save(cmp_.crop((int(533 * s), int(52 * s), int(1467 * s), int(990 * s))), 'compare.jpg')
d = img('generate-dialog.png'); g = save(d.crop((0, 0, d.width, int(d.height * 0.80))), 'dialog.jpg', maxw=1344)
gz = img('generated-zoom.png'); k = gz.width / 2000
z = save(gz.crop((0, int(575 * k), int(1100 * k), int(1015 * k))), 'gen-zoom.jpg')
m = save(img('manual-editor.png'), 'manual.jpg')
v = save(img('versions.png'), 'versions.jpg', maxw=1040)
# [2026-10-30] Criado: grafo (REQ-003 selecionado) e aba Processos do requisito — capturas de scripts/carousel/capture-extra.js
gfull = img('graph-full.png'); gk = gfull.width / 1920
gr = save(gfull.crop(GRAPH_CROP and tuple(int(x * gk) for x in GRAPH_CROP)), 'graph.jpg', maxw=2000)
gpop = save(gfull.crop(tuple(int(x * gk) for x in POPUP_CROP)), 'graph-pop.jpg', maxw=800)
rp = save(img('req-process.png'), 'req-process.jpg', maxw=1000)

LOGO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'logo-new.png')).replace('\\', '/')
TOTAL = 11
E = html.escape

def slide(n, body, cls=''):
    return f'<section class="slide {cls}"><div class="top"><div class="brand"><img src="file:///{LOGO}"><span>Ancoro</span></div><div class="num">{n:02d} / {TOTAL:02d}</div></div>{body}<div class="foot"><span>Ancora ReqOps Method</span></div></section>'

def head(h, sub=''):
    return f'<div class="head"><h1>{h}</h1>' + (f'<p>{sub}</p>' if sub else '') + '</div>'

demo = '<div class="demo">Dados fictícios de demonstração</div>'

S = []
# 1 capa
S.append(f'''<section class="slide cover"><div class="top"><div class="brand"><img src="file:///{LOGO}"><span>Ancoro</span></div><div class="num">01 / {TOTAL:02d}</div></div>
<div class="cover-body"><div class="kicker">ANCORA REQOPS METHOD</div><h1>Do requisito ao processo, sem perder a governança</h1>
<p>Aumente a confiabilidade do seu projeto</p></div>
<div class="swipe">Deslize <span>→</span></div></section>''')
# 2 problema
S.append(slide(2, head('Requisito num lugar.<br>Processo em outro.', 'É assim que a rastreabilidade se perde.') + '''<div class="cards">
<div class="card"><b>01</b><span>Requisitos espalhados em planilhas e e-mails</span></div>
<div class="card"><b>02</b><span>Processo desenhado à parte, sem vínculo com o requisito</span></div>
<div class="card"><b>03</b><span>Ninguém sabe o que cobre o quê — nem o que ficou de fora</span></div></div>''', 'light'))
# 3 as-is / to-be
S.append(slide(3, head('Cada requisito conta duas histórias', 'Como é hoje (AS-IS) e como será (TO-BE), no mesmo lugar.') + f'''<div class="stage"><div class="duo">
<figure><figcaption class="asis">AS-IS · hoje</figcaption><img src="{a}"></figure><figure><figcaption class="tobe">TO-BE · amanhã</figcaption><img src="{t}"></figure></div></div>{demo}''', 'light'))
# 4 comparar
S.append(slide(4, head('Compare campo a campo, antes de construir', 'O que mudou, o que é novo e o que ficou igual.') + f'<div class="stage"><div class="shot clip fade"><img src="{c}"></div></div>{demo}', 'light'))
# 5 grafo (NOVO)
S.append(slide(5, head('Veja como os requisitos se conectam', 'Clique num requisito: de quem ele depende e para quem fornece ficam destacados.') + f'<div class="stage"><div class="shot"><img src="{gr}"></div><div class="row2"><div class="shot small"><img src="{gpop}"></div><div class="chips col"><span>Depende de</span><span>Fornece para</span><span>Impacto visível</span></div></div></div>{demo}', 'light'))
# 6 gerar
S.append(slide(6, head('Marque os requisitos.<br>O processo se desenha.', 'Raias, decisões e subprocessos, gerados automaticamente.') + f'<div class="stage"><div class="shot tall fade"><img src="{g}"></div></div>{demo}', 'light'))
# 7 resultado
S.append(slide(7, head('De 7 requisitos a um processo ponta a ponta', 'Raias por responsável, decisões e subprocessos, com cada passo ligado ao requisito de origem.') + f'<div class="stage"><div class="shot"><img src="{z}"></div><div class="chips"><span>Raias</span><span>Decisões</span><span>Subprocessos</span><span>Vínculo ao requisito</span></div></div>{demo}', 'light'))
# 8 requisito vinculado ao processo (NOVO)
S.append(slide(8, head('O requisito sabe em quais processos está', 'Do requisito ao processo, e do processo de volta ao requisito.') + f'<div class="stage"><div class="shot tall fade" style="width:600px;height:650px"><img src="{rp}"></div><div class="chips"><span>Processo</span><span>Elemento</span><span>Abrir no editor</span></div></div>{demo}', 'light'))
# 9 manual
S.append(slide(9, head('Prefere desenhar?<br>Também dá.', 'Cada elemento pode nascer de três formas:') + f'<div class="stage"><div class="shot"><img src="{m}"></div><div class="steps"><div><b>1</b><span>Arraste da paleta</span></div><div><b>2</b><span>Conecte pela seta</span></div><div><b>3</b><span>Use o <i>+</i> do elemento</span></div></div></div>{demo}', 'light'))
# 10 versões
S.append(slide(10, head('Versões com rastreabilidade', 'Salvar grava o processo (<b>r</b>). A versão é um marco que registra o <b>r</b> em que foi tirada.') + f'<div class="stage"><div class="shot"><img src="{v}"></div><div class="steps two"><div><b>r</b><span>revisão salva, a cada Salvar</span></div><div><b>v</b><span>marco criado por você, com o r registrado</span></div></div></div>{demo}', 'light'))
# 11 CTA
S.append(f'''<section class="slide cover cta"><div class="top"><div class="brand"><img src="file:///{LOGO}"><span>Ancoro</span></div><div class="num">11 / {TOTAL:02d}</div></div>
<div class="cover-body"><div class="kicker">PRÓXIMO PASSO</div><h1>Quer ver com os seus requisitos?</h1>
<p>Do AS-IS ao TO-BE. Do requisito ao processo. Com governança.</p><div class="btn">Chame no direct para uma demonstração</div></div></section>''')

CSS = '''
@page { size: 1080px 1350px; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { background: #fff }
body { font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif; color: #0b1a30; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.slide { width: 1080px; height: 1350px; position: relative; overflow: hidden; display: flex; flex-direction: column; page-break-after: always; break-after: page; padding: 64px 72px 0 }
.light { background: linear-gradient(180deg, #f3f7f9 0%, #e8f0f3 100%) }
.stage { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 34px; margin-bottom: 150px }
.top { display: flex; justify-content: space-between; align-items: center; height: 56px }
.brand { display: flex; align-items: center; gap: 14px; font-weight: 800; font-size: 30px; letter-spacing: -.01em }
.brand img { height: 48px; width: auto; background: #fff; border-radius: 12px; padding: 4px }
.num { font-size: 24px; font-weight: 600; color: #6b7c8f; letter-spacing: .08em }
.head { margin-top: 56px }
.head h1 { font-size: 70px; line-height: 1.04; font-weight: 800; letter-spacing: -.025em; color: #0b1a30 }
.head p { margin-top: 22px; font-size: 32px; line-height: 1.35; color: #3b4d63; font-weight: 500; max-width: 900px }
.head p b { color: #0f766e }
.foot { position: absolute; left: 72px; right: 72px; bottom: 40px; display: flex; justify-content: space-between; font-size: 22px; font-weight: 600; color: #6b7c8f; border-top: 2px solid #d3dee4; padding-top: 18px }
.demo { position: absolute; right: 72px; bottom: 96px; font-size: 20px; color: #6b7c8f; background: rgba(255,255,255,.85); padding: 6px 14px; border-radius: 999px; border: 1px solid #d3dee4 }
/* imagens */
.shot { margin-top: 0; background: #fff; border-radius: 28px; box-shadow: 0 24px 60px rgba(11,26,48,.18); border: 2px solid #dbe6ea; overflow: hidden }
.shot img { display: block; width: 100% }
.steps { display: flex; gap: 20px }
.steps > div { flex: 1; display: flex; align-items: center; gap: 18px; background: #fff; border-radius: 22px; padding: 24px 26px; border: 2px solid #dbe6ea; box-shadow: 0 12px 30px rgba(11,26,48,.1) }
.steps b { width: 54px; height: 54px; border-radius: 50%; background: #0f766e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800; flex: none }
.steps span { font-size: 27px; line-height: 1.2; font-weight: 700 }
.steps i { font-style: normal; color: #0f766e; font-size: 34px; font-weight: 800 }
.steps.two > div { align-items: flex-start }
.steps.two b { font-style: italic }
.shot.clip { height: 800px; position: relative }
.shot.tall { width: 720px; margin-left: auto; margin-right: auto; height: 800px; position: relative }
.shot.fade::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 160px; background: linear-gradient(180deg, rgba(255,255,255,0), #fff 85%) }
.duo { display: flex; gap: 28px }
.duo figure { flex: 1; background: #fff; border-radius: 26px; box-shadow: 0 24px 60px rgba(11,26,48,.18); border: 2px solid #dbe6ea; overflow: hidden; position: relative }
.duo figure::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 150px; background: linear-gradient(180deg, rgba(255,255,255,0), #fff 90%) }
.duo img { display: block; width: 100% }
.duo figcaption { font-weight: 800; font-size: 28px; padding: 14px 22px; color: #fff }
.duo .asis { background: #2563eb } .duo .tobe { background: #ea6a1a }
.row2 { display: flex; gap: 28px; align-items: center }
.shot.small { width: 420px; flex: none }
.chips.col { flex-direction: column; align-items: flex-start }
.chips { display: flex; gap: 14px; flex-wrap: wrap }
.chips span { background: #0f766e; color: #fff; font-weight: 700; font-size: 24px; padding: 10px 22px; border-radius: 999px }
.cards { margin-top: 60px; display: flex; flex-direction: column; gap: 26px }
.card { display: flex; align-items: center; gap: 30px; background: #fff; border-radius: 26px; padding: 40px 44px; box-shadow: 0 16px 44px rgba(11,26,48,.12); border: 2px solid #dbe6ea }
.card b { font-size: 56px; font-weight: 800; color: #14b8a6; min-width: 90px }
.card span { font-size: 38px; line-height: 1.25; font-weight: 700 }
/* capa e CTA */
.cover { background: radial-gradient(1200px 900px at 85% 10%, #134e4a 0%, #0b1a30 55%, #08121f 100%); color: #fff }
.cover .num { color: #8fb3c4 } .cover .brand { color: #fff }
.cover-body { position: absolute; left: 72px; right: 72px; top: 330px }
.kicker { color: #2dd4bf; font-size: 28px; font-weight: 800; letter-spacing: .18em; margin-bottom: 34px }
.cover h1 { font-size: 100px; line-height: 1.02; font-weight: 800; letter-spacing: -.03em }
.cover p { margin-top: 38px; font-size: 38px; line-height: 1.35; color: #c9dde6; font-weight: 500; max-width: 880px }
.swipe { position: absolute; left: 72px; bottom: 70px; font-size: 34px; font-weight: 700; color: #2dd4bf }
.swipe span { margin-left: 10px }
.btn { display: inline-block; margin-top: 56px; background: #14b8a6; color: #04201d; font-size: 36px; font-weight: 800; padding: 28px 44px; border-radius: 22px }
'''
doc = ('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ancoro — carrossel LinkedIn</title>'
       '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">'
       f'<style>{CSS}</style></head><body>' + ''.join(S) + '</body></html>')
open(os.path.join(out, 'carousel.html'), 'w', encoding='utf-8').write(doc)
print('ok', len(S), 'lâminas ->', out)
