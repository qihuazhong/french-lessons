#!/usr/bin/env python3
"""Generate parcours.html — the CEFR grammar roadmap (A1 → C2).

Inputs: content/curriculum.json (the canonical inventory) and the data-gp tags
on every lesson's grammar <h3> (see tools/tag_grammar.py), read from the built
lesson pages listed in lessons.json. Each curriculum point lists the lessons
(and parcours) where it is taught, with a deep link
`lecon-x.html?niveau=b1#gram-b1-G2`; untaught points show « Bientôt ».

The page is fully readable without JS (generic roadmap). Every point is an
<article class="gp" data-gp="<id>"> so the personal mastery overlay (next
step) can decorate it client-side.

Run from the repo root:  python3 tools/build_roadmap.py
(also run by tools/add_lessons_nav.py)
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = 'parcours.html'

LEVEL_INFO = {
    'A1': ('Découverte', '#b5530f', 'Se présenter, parler de ses goûts, poser des questions simples.'),
    'A2': ('Survie', '#1e7a46', 'Raconter au passé, décrire son quotidien, faire des projets.'),
    'B1': ('Seuil', '#16357a', 'Relier ses idées, donner son avis, exprimer regrets et hypothèses.'),
    'B2': ('Avancé', '#6b3fa0', 'Argumenter avec nuance, comprendre la presse, varier les registres.'),
    'C1': ('Autonome', '#0e6b62', 'Lire entre les lignes du discours public, écrire un français soutenu.'),
    'C2': ('Maîtrise', '#8a1c2b', 'Saisir l\'implicite, le style littéraire et toutes les variations.'),
}


def esc(s):
    return html.escape(s, quote=True)


def lesson_coverage(lessons):
    """concept id -> [(lesson entry, level, G#, h3 id, title)]"""
    cov = {}
    for entry in lessons:
        src = open(os.path.join(ROOT, entry['file']), encoding='utf-8').read()
        s = src.find('<section id="grammaire">')
        sec = src[s:src.find('</section>', s)]
        for m in re.finditer(r'<h3 id="(gram-(\w+)-(G\d+))" data-gp="([^"]+)">(.*?)</h3>', sec, re.S):
            anchor, lv, g, ids, title = m.groups()
            title = re.sub(r'<[^>]+>', '', title).strip()
            for cid in ids.split():
                cov.setdefault(cid, []).append((entry, lv, g, anchor, title))
    return cov


def mastery_map(lessons):
    """Evidence sources for the personal overlay (see SRS.mastery):
    exo:   "<lesson>|<exoId>"        -> [concept ids]   (exercise "concepts")
    cards: "<lesson>|gram:<lv>:<G#>" -> [concept ids]   (grammar review cards)"""
    exo, cards = {}, {}
    for entry in lessons:
        src = open(os.path.join(ROOT, entry['file']), encoding='utf-8').read()
        for m in re.finditer(r'<div class="exo"><script type="application/json">(.*?)</script>', src, re.S):
            spec = json.loads(m.group(1))
            if spec.get('concepts'):
                exo['%s|%s' % (entry['file'], spec['id'])] = spec['concepts']
        for m in re.finditer(r'<h3 id="gram-(\w+)-(G\d+)" data-gp="([^"]+)">', src):
            cards['%s|gram:%s:%s' % (entry['file'], m.group(1), m.group(2))] = m.group(3).split()
    return {'exo': exo, 'cards': cards}


def point_html(p, by_id, cov):
    taught = cov.get(p['id'], [])
    if taught:
        links = []
        for entry, lv, g, anchor, title in taught:
            links.append('<a class="where" href="%s?niveau=%s#%s" title="%s">%s <span>parcours %s</span></a>'
                         % (esc(entry['file']), lv, anchor, esc(title), esc(entry['nav']), lv.upper()))
        where = '<div class="study"><span class="lbl">Étudier dans</span>' + ''.join(links) + '</div>'
    else:
        where = '<div class="study"><span class="soon">Bientôt — pas encore de leçon</span></div>'
    pre = ''
    if p.get('prereq'):
        pre = '<p class="pre">Avant : ' + ', '.join(
            '<a href="#gp-%s">%s</a>' % (q, esc(by_id[q]['title'])) for q in p['prereq']) + '</p>'
    return ('<article class="gp%s" id="gp-%s" data-gp="%s">'
            '<div class="gp-head"><h4>%s</h4><span class="gp-state" hidden></span></div>'
            '<p class="sum">%s</p>%s%s</article>'
            % ('' if taught else ' uncovered', p['id'], p['id'], esc(p['title']), esc(p['summary']), pre, where))


def build(cur, lessons):
    by_id = {p['id']: p for p in cur['points']}
    cov = lesson_coverage(lessons)
    cats = list(cur['categories'].keys())

    nav, sections = [], []
    total_cov = 0
    for lv in cur['levels']:
        name, color, can = LEVEL_INFO[lv]
        pts = [p for p in cur['points'] if p['level'] == lv]
        n_cov = sum(1 for p in pts if p['id'] in cov)
        total_cov += n_cov
        nav.append('<a href="#niveau-%s" style="--lv:%s"><b>%s</b><small>%s</small></a>'
                   % (lv.lower(), color, lv, name))
        groups = []
        for c in cats:
            cp = [p for p in pts if p['cat'] == c]
            if not cp:
                continue
            groups.append('<div class="cat"><h3>%s</h3><div class="pts">%s</div></div>'
                          % (esc(cur['categories'][c]), ''.join(point_html(p, by_id, cov) for p in cp)))
        sections.append('''<section class="level" id="niveau-%s" style="--lv:%s">
  <div class="level-head">
    <div class="badge">%s</div>
    <div><h2>%s · %s</h2><p>%s</p></div>
    <div class="count"><b>%d</b> points<br><span>%d étudiés dans une leçon</span></div>
    <div class="lv-prog" hidden></div>
  </div>
  %s
</section>''' % (lv.lower(), color, lv, lv, name, esc(can), len(pts), n_cov, '\n  '.join(groups)))

    data = {
        'map': mastery_map(lessons),
        'points': [{'id': p['id'], 'lv': p['level'], 'title': p['title'], 'pre': p.get('prereq', []),
                    'href': ('%s?niveau=%s#%s' % (cov[p['id']][0][0]['file'], cov[p['id']][0][1], cov[p['id']][0][3])
                             if p['id'] in cov else None)}
                   for p in cur['points']],
    }
    page = TEMPLATE
    for k, v in {
        '{DATA}': json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'),
        '{NAV}': '\n    '.join(nav),
        '{SECTIONS}': '\n'.join(sections),
        '{N}': str(len(cur['points'])),
        '{NCOV}': str(total_cov),
        '{NLESSONS}': str(len(lessons)),
    }.items():
        page = page.replace(k, v)
    return page


TEMPLATE = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Parcours de grammaire A1 → C2</title>
<!-- Generated by tools/build_roadmap.py from content/curriculum.json — do not edit by hand. -->
<style>
  :root { --bleu: #16357a; --bleu-clair: #e8eefb; --rouge: #c8102e; --texte: #22262e;
          --gris: #5c6470; --fond: #f6f7fb; --carte: #ffffff; --bordure: #dde3ee; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: 76px; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: var(--fond); color: var(--texte); line-height: 1.55; font-size: 16px; }
  a { color: var(--bleu); }
  header { background: linear-gradient(135deg, #16357a 0%, #1d4aa3 60%, #2a5cc4 100%);
           color: #fff; padding: 2.4rem 1rem 2rem; position: relative; overflow: hidden; }
  header::after { content: ""; position: absolute; inset: auto 0 0 0; height: 6px;
           background: linear-gradient(90deg, var(--bleu) 0 33%, #fff 33% 66%, var(--rouge) 66% 100%); opacity: .9; }
  .head-inner, main, footer, .lvnav-inner { max-width: 1040px; margin: 0 auto; }
  .kicker { text-transform: uppercase; letter-spacing: .14em; font-size: .78rem; font-weight: 700;
            color: #bcd0f7; margin: 0 0 .6rem; }
  header h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.7rem, 4vw, 2.5rem);
              margin: 0 0 .6rem; line-height: 1.15; }
  header p { margin: 0; color: #dbe5fa; max-width: 68ch; }
  header p a { color: #fff; }

  .lvnav { position: sticky; top: 0; z-index: 20; background: rgba(246,247,251,.94);
           backdrop-filter: blur(6px); border-bottom: 1px solid var(--bordure); }
  .lvnav-inner { display: flex; gap: .4rem; padding: .55rem 1rem; overflow-x: auto; align-items: center; }
  .lvnav a { flex: 0 0 auto; display: flex; align-items: baseline; gap: .35rem; text-decoration: none;
             color: var(--lv); border: 1.5px solid color-mix(in srgb, var(--lv) 35%, #fff);
             background: #fff; border-radius: 999px; padding: .2rem .75rem; }
  .lvnav a b { font-weight: 800; }
  .lvnav a small { color: var(--gris); font-size: .74rem; }
  .lvnav a.on { background: var(--lv); border-color: var(--lv); color: #fff; }
  .lvnav a.on small { color: rgba(255,255,255,.85); }
  .lvnav .filter { margin-left: auto; flex: 0 0 auto; font-size: .82rem; color: var(--gris);
                   display: flex; align-items: center; gap: .35rem; white-space: nowrap; cursor: pointer; }
  .lvnav .filter .short { display: none; }

  main { padding: 1.6rem 1rem 3rem; }
  .intro { background: #eef3ff; border: 1px solid #c9d6f2; border-radius: 14px; padding: .9rem 1.1rem;
           color: var(--bleu); margin-bottom: 1.6rem; font-size: .95rem; }
  .level { margin-bottom: 2.4rem; }
  .level-head { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center;
                border-left: 6px solid var(--lv); background: var(--carte); border-radius: 12px;
                padding: .9rem 1.1rem; box-shadow: 0 1px 3px rgba(20,40,90,.06); margin-bottom: 1rem; }
  .level-head .badge { width: 54px; height: 54px; border-radius: 12px; background: var(--lv); color: #fff;
                       display: grid; place-items: center; font-weight: 800; font-size: 1.25rem; }
  .level-head h2 { font-family: Georgia, "Times New Roman", serif; color: var(--lv); margin: 0; font-size: 1.35rem; }
  .level-head p { margin: .1rem 0 0; color: var(--gris); font-size: .92rem; }
  .level-head .count { text-align: right; font-size: .85rem; color: var(--gris); line-height: 1.3; }
  .level-head .count b { font-size: 1.5rem; color: var(--lv); }
  .cat h3 { font-size: .76rem; text-transform: uppercase; letter-spacing: .1em; color: var(--gris);
            margin: 1.1rem 0 .5rem; font-weight: 800; }
  .pts { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: .7rem; }
  .gp { background: var(--carte); border: 1px solid var(--bordure); border-radius: 12px;
        padding: .8rem .95rem .75rem; display: flex; flex-direction: column; gap: .35rem; }
  .gp:target { outline: 3px solid var(--lv); outline-offset: 2px; }
  .gp.uncovered { background: #fbfcfe; }
  .gp.uncovered h4 { color: #3d4452; }
  .gp-head { display: flex; justify-content: space-between; gap: .5rem; align-items: flex-start; }
  .gp h4 { margin: 0; font-size: 1rem; color: var(--texte); line-height: 1.3; }
  .gp .sum { margin: 0; color: var(--gris); font-size: .88rem; }
  .gp .pre { margin: 0; font-size: .78rem; color: var(--gris); }
  .gp .pre a { color: var(--gris); }
  .study { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; margin-top: auto; padding-top: .25rem; }
  .study .lbl { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
                color: var(--lv); margin-right: .1rem; }
  .where { font-size: .8rem; text-decoration: none; background: var(--bleu-clair); color: var(--bleu);
           border-radius: 999px; padding: .1rem .6rem; font-weight: 600; }
  .where span { opacity: .7; font-weight: 500; }
  .where:hover { background: #d6e1f8; }
  .soon { font-size: .78rem; color: #8a92a0; font-style: italic; }
  body.only-covered .gp.uncovered { display: none; }
  body.only-covered .cat:not(:has(.gp:not(.uncovered))) { display: none; }

  footer { padding: 0 1rem 3rem; color: var(--gris); font-size: .85rem; }

  /* personal mastery overlay (parcours.js) */
  :root { --m0: #c3cad6; --m1: #8792a6; --m2: #2b6cb0; --m3: #2f9461; --m4: #1b5e3b; --mr: #b45309; }
  .me { background: var(--carte); border: 1px solid var(--bordure); border-radius: 14px;
        padding: 1rem 1.15rem; margin-bottom: 1.6rem; box-shadow: 0 1px 3px rgba(20,40,90,.06); }
  .me.quiet { background: #eef3ff; border-color: #c9d6f2; color: var(--bleu); font-size: .93rem; padding: .8rem 1.1rem; }
  .me h2 { font-family: Georgia, "Times New Roman", serif; color: var(--bleu); margin: 0; font-size: 1.25rem; }
  .me-top { display: flex; justify-content: space-between; align-items: center; gap: .8rem; flex-wrap: wrap; }
  .me-btn { background: #fff; border: 1.5px solid #c9d6f2; color: var(--bleu); border-radius: 999px;
            padding: .2rem .8rem; font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; }
  .me-btn:hover { background: var(--bleu-clair); }
  .me-legend { display: flex; flex-wrap: wrap; gap: .4rem .9rem; margin: .7rem 0 .2rem; font-size: .85rem; color: var(--gris); }
  .me-legend b { color: var(--texte); }
  .dot { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; margin-right: .3rem; vertical-align: -.05rem; }
  .me-next { margin: .8rem 0 0; padding: 0; list-style: none; display: grid; gap: .35rem; }
  .me-next li { font-size: .9rem; }
  .me-next .why { color: var(--gris); font-size: .8rem; }
  .me-sub { margin: .7rem 0 0; font-size: .82rem; color: var(--gris); }
  .gp-state { font-size: .7rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;
              border-radius: 999px; padding: .08rem .5rem; white-space: nowrap; color: #fff; background: var(--m0); }
  .gp.m-1 { border-left: 4px solid var(--m1); } .gp.m-1 .gp-state { background: var(--m1); }
  .gp.m-2 { border-left: 4px solid var(--m2); } .gp.m-2 .gp-state { background: var(--m2); }
  .gp.m-3 { border-left: 4px solid var(--m3); } .gp.m-3 .gp-state { background: var(--m3); }
  .gp.m-4 { border-left: 4px solid var(--m4); background: #f3faf6; } .gp.m-4 .gp-state { background: var(--m4); }
  .gp.m-stale { border-left-color: var(--mr); } .gp.m-stale .gp-state { background: var(--mr); }
  .gp.m-0 .gp-state { background: transparent; color: #8a92a0; border: 1px solid var(--bordure); }
  .gp .gp-evid { margin: 0; font-size: .78rem; color: var(--gris); }
  .lv-prog { grid-column: 1 / -1; display: flex; align-items: center; gap: .7rem; font-size: .82rem; color: var(--gris); }
  .lv-bar { flex: 1; display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: #edf0f5; }
  .lv-bar span { display: block; height: 100%; }
  @media (max-width: 640px) {
    .level-head { grid-template-columns: auto 1fr; }
    .level-head .count { grid-column: 1 / -1; text-align: left; }
    .lvnav .filter .long { display: none; }
    .lvnav .filter .short { display: inline; }
    .pts { grid-template-columns: 1fr; }
  }
  @media print { .lvnav { position: static; } .gp { break-inside: avoid; } }
</style>
</head>
<body>
<header>
  <div class="head-inner">
    <p class="kicker">Français avec un tuteur · Parcours</p>
    <h1>La grammaire à maîtriser, du A1 au C2</h1>
    <p>{N} points de grammaire et de discours, niveau par niveau, selon le Cadre européen (CECRL).
    Pour chacun : ce qu'il faut savoir, ce qu'il faut voir avant, et la leçon où l'étudier.
    <a href="index.html">← Toutes les leçons</a> · <a href="progres.html">Mes progrès</a></p>
  </div>
</header>
<nav class="lvnav" aria-label="Niveaux">
  <div class="lvnav-inner">
    {NAV}
    <label class="filter"><input type="checkbox" id="onlyCovered"> <span class="long">Seulement les points étudiés dans une leçon</span><span class="short">Avec leçon</span></label>
  </div>
</nav>
<main>
  <div id="me" class="me quiet" hidden aria-live="polite"></div>
  <p class="intro">{NCOV} points sur {N} sont déjà travaillés dans les {NLESSONS} leçons.
  « Étudier dans » ouvre la leçon au bon parcours et au bon point de grammaire.
  Le niveau indiqué est celui du CECRL : une leçon peut aborder un point plus tôt.</p>
{SECTIONS}
</main>
<footer>
  Inventaire inspiré des référentiels du CECRL pour le français. Ce fichier est généré
  (<code>content/curriculum.json</code> + <code>tools/build_roadmap.py</code>).
</footer>
<script type="application/json" id="gp-data">{DATA}</script>
<script src="config.js"></script>
<script src="srs.js"></script>
<script src="parcours.js"></script>
<script>
(function () {
  var KEY = 'fr-parcours-only-covered';
  var cb = document.getElementById('onlyCovered');
  function apply() { document.body.classList.toggle('only-covered', cb.checked); }
  try { cb.checked = localStorage.getItem(KEY) === '1'; } catch (e) {}
  apply();
  cb.addEventListener('change', function () {
    apply();
    try { localStorage.setItem(KEY, cb.checked ? '1' : '0'); } catch (e) {}
  });

  var links = {};
  Array.prototype.forEach.call(document.querySelectorAll('.lvnav a'), function (a) {
    links[a.getAttribute('href').slice(1)] = a;
  });
  if (!('IntersectionObserver' in window)) return;
  var visible = {};
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
    var first = null;
    Array.prototype.some.call(document.querySelectorAll('section.level'), function (s) {
      if (visible[s.id]) { first = s.id; return true; }
      return false;
    });
    Object.keys(links).forEach(function (id) { links[id].classList.toggle('on', id === first); });
  }, { rootMargin: '-80px 0px -55% 0px' });
  Array.prototype.forEach.call(document.querySelectorAll('section.level'), function (s) { io.observe(s); });
})();
</script>
</body>
</html>
'''


def main():
    cur = json.load(open(os.path.join(ROOT, 'content', 'curriculum.json'), encoding='utf-8'))
    lessons = json.load(open(os.path.join(ROOT, 'lessons.json'), encoding='utf-8'))
    page = build(cur, lessons)
    with open(os.path.join(ROOT, OUT), 'w', encoding='utf-8') as f:
        f.write(page)
    print('wrote %s: %d points, %d linked to a lesson' % (OUT, len(cur['points']), page.count('class="gp"')))


if __name__ == '__main__':
    main()
