#!/usr/bin/env python3
"""Cross-lesson navigation, built from lessons.json.

For every registered lesson page this injects (idempotently, between markers):
  - a "Leçons" block at the bottom of the floating Sommaire side panel
    (index link + all other lessons)
  - an "Autres leçons" line in the footer
and regenerates the index.html landing page listing all lessons.

Adding a future lesson: append one entry to lessons.json, run
`python3 add_lessons_nav.py`, done — every page and the index refresh.
"""
import html
import json
import re

REG = 'lessons.json'
SIDE_S = '<!--LESSONS_NAV-->'
SIDE_E = '<!--/LESSONS_NAV-->'
FOOT_S = '<!--LESSONS_NAV_FOOT-->'
FOOT_E = '<!--/LESSONS_NAV_FOOT-->'


def esc(s):
    return html.escape(s, quote=False)


def strip_marked(src, start, end):
    return re.sub(r'\s*' + re.escape(start) + r'[\s\S]*?' + re.escape(end) + r'\s*', '', src)


def side_block(others):
    links = ['<a href="progres.html">Mes progrès</a>', '<a href="index.html">Toutes les leçons</a>']
    links += ['<a href="%s">%s</a>' % (x['file'], esc(x['nav'])) for x in others]
    inner = '\n      '.join(links)
    return (SIDE_S +
            '\n  <div class="sp-title" style="margin-top:.6rem;border-top:1px solid var(--bordure);padding-top:.6rem;">Leçons</div>'
            '\n  <nav>\n      ' + inner + '\n  </nav>\n  ' + SIDE_E)


def foot_block(others):
    parts = ['<a href="progres.html">Mes progrès</a>', '<a href="index.html">Toutes les leçons</a>']
    parts += ['<a href="%s">%s</a>' % (x['file'], esc(x['nav'])) for x in others]
    return (FOOT_S + '\n  <p style="margin-top:.6rem;">Autres leçons : ' +
            ' · '.join(parts) + '</p>\n  ' + FOOT_E)


def inject(lessons, entry):
    path = entry['file']
    src = open(path, encoding='utf-8').read()
    others = [x for x in lessons if x['file'] != entry['file']]

    src = strip_marked(src, SIDE_S, SIDE_E)
    src = strip_marked(src, FOOT_S, FOOT_E)

    # side panel: insert right after the Sommaire </nav> of the side panel
    pat = re.compile(r'(<aside class="sidepanel"[\s\S]*?</nav>\s*)</aside>')
    m = pat.search(src)
    assert m, 'sidepanel anchor not found in %s' % path
    src = src[:m.end(1)] + side_block(others) + '\n</aside>' + src[m.end():]

    # footer: insert before </footer>
    assert src.count('</footer>') == 1, 'footer anchor ambiguous in %s' % path
    src = src.replace('</footer>', foot_block(others) + '\n</footer>', 1)

    open(path, 'w', encoding='utf-8').write(src)
    print('nav injected: %s (+%d other lessons)' % (path, len(others)))


def build_index(lessons):
    cards = []
    for x in lessons:
        cards.append('''      <a class="card" href="{file}">
        <div class="ep">{ep}</div>
        <h2>{title}</h2>
        <p>{desc}</p>
        <div class="meta"><span class="chip">{levels}</span><span class="go">Ouvrir la leçon →</span></div>
      </a>'''.format(file=x['file'], ep=esc(x['ep']), title=esc(x['title']),
                     desc=esc(x['desc']), levels=esc(x.get('levels', ''))))
    cards = '\n'.join(cards)
    doc = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Leçons de français — index</title>
<style>
  :root { --bleu: #16357a; --bleu-clair: #e8eefb; --rouge: #c8102e; --texte: #22262e;
          --gris: #5c6470; --fond: #f6f7fb; --carte: #ffffff; --bordure: #dde3ee; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: var(--fond); color: var(--texte); line-height: 1.6; font-size: 16.5px; }
  header { background: linear-gradient(135deg, #16357a 0%, #1d4aa3 60%, #2a5cc4 100%);
           color: #fff; padding: 2.6rem 1.5rem 2.2rem; position: relative; overflow: hidden; }
  header::after { content: ""; position: absolute; inset: auto 0 0 0; height: 6px;
           background: linear-gradient(90deg, var(--bleu) 0 33%, #fff 33% 66%, var(--rouge) 66% 100%); opacity: .9; }
  .head-inner { max-width: 960px; margin: 0 auto; position: relative; z-index: 1; }
  .kicker { text-transform: uppercase; letter-spacing: .14em; font-size: .78rem; font-weight: 700;
            color: #bcd0f7; margin: 0 0 .6rem; }
  header h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.7rem, 4vw, 2.5rem);
              margin: 0 0 .6rem; line-height: 1.15; }
  header p { margin: 0; color: #dbe5fa; max-width: 66ch; }
  main { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.2rem; }
  .review-banner { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    background: #eef3ff; border: 1px solid #c9d6f2; border-radius: 14px; padding: .9rem 1.2rem;
    margin-bottom: 1.3rem; text-decoration: none; color: var(--bleu); font-weight: 600; flex-wrap: wrap; }
  .review-banner:hover { background: var(--bleu-clair); }
  .review-banner strong { font-weight: 800; }
  .card { display: block; background: var(--carte); border: 1px solid var(--bordure);
          border-radius: 14px; padding: 1.4rem 1.5rem 1.2rem; text-decoration: none;
          color: inherit; box-shadow: 0 1px 3px rgba(20,40,90,.06);
          transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(20,40,90,.14);
                border-color: #c9d6f2; }
  .card .ep { font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
              color: var(--rouge); margin-bottom: .35rem; }
  .card h2 { font-family: Georgia, "Times New Roman", serif; color: var(--bleu);
             font-size: 1.3rem; margin: 0 0 .4rem; }
  .card p { margin: 0 0 .9rem; color: var(--gris); font-size: .93rem; }
  .card .meta { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
  .card .chip { background: var(--bleu-clair); color: var(--bleu); border-radius: 999px;
                padding: .12rem .65rem; font-size: .75rem; font-weight: 700; }
  .card .go { color: var(--bleu); font-weight: 700; font-size: .9rem; }
  footer { max-width: 960px; margin: 0 auto; padding: 0 1.25rem 3rem; color: var(--gris); font-size: .85rem; }
  footer a { color: var(--bleu); }
</style>
</head>
<body>
<header>
  <div class="head-inner">
    <p class="kicker">Français avec un tuteur · Leçons guidées</p>
    <h1>Leçons de français à partir de vraies vidéos</h1>
    <p>Chaque leçon suit la même recette : transcription complète, parcours par niveau
    (A2 · B1 · B2), vocabulaire et expressions avec les <strong>extraits audio de la vidéo</strong>,
    grammaire, français parlé, exercices corrigés — et la vidéo intégrée qui saute au bon passage
    à chaque clic.</p>
  </div>
</header>
<main>
  <a class="review-banner" href="progres.html">
    <span>Révisions espacées : vos mots et expressions reviennent au bon moment.</span>
    <strong>Mes progrès →</strong>
  </a>
  <div class="grid">
{cards}
  </div>
</main>
<footer>
  Vidéos : chaîne <em>Easy French</em> · Ce fichier est généré (voir <code>lessons.json</code>) —
  ajoutez une leçon au registre puis relancez <code>python3 add_lessons_nav.py</code>.
</footer>
</body>
</html>
'''.replace('{cards}', cards)
    open('index.html', 'w', encoding='utf-8').write(doc)
    print('wrote index.html (%d lessons)' % len(lessons))


def main():
    lessons = json.load(open(REG, encoding='utf-8'))
    for entry in lessons:
        inject(lessons, entry)
    build_index(lessons)
    import build_review
    build_review.main()


if __name__ == '__main__':
    main()
