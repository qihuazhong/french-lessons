#!/usr/bin/env python3
"""Generate progres.html — the spaced-repetition review page.

Scans every lesson registered in lessons.json, extracts its vocabulary and
expression items (term, gloss, example, audio clip, level), and writes a
self-contained progres.html with the deck embedded as inline JSON. The page
uses srs.js for scheduling (localStorage-first, optional Cloudflare sync).

Run from the repo root:  python3 tools/build_review.py
Also invoked automatically at the end of tools/add_lessons_nav.py.
"""
import html as html_mod
import json
import os
import re

REG = 'lessons.json'
OUT = 'progres.html'


def strip_tags(s):
    s = re.sub(r'<span class="badge[^"]*">.*?</span>', ' ', s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html_mod.unescape(s)
    s = s.replace('«', ' ').replace('»', ' ')
    return ' '.join(s.split()).strip()


def level_at(levels, pos):
    lv = None
    for off, l in levels:
        if off < pos:
            lv = l
        else:
            break
    return lv


def section_of(src, sec_id):
    start = src.find('<section id="%s">' % sec_id)
    if start < 0:
        return ''
    end = src.find('</section>', start)
    return src[start:end]


def extract_vocab(src):
    sec = section_of(src, 'vocabulaire')
    levels = [(m.start(), m.group(1)) for m in re.finditer(r'<div data-lv="(\w+)"', sec)]
    items = []
    for m in re.finditer(r'<tr><td>(.*?)</td><td>(.*?)</td><td class="ex">(.*?)</td></tr>', sec, re.S):
        td1 = m.group(1)
        btn = re.search(r'<button class="say"[^>]*data-say="([^"]*)"([^>]*)>', td1)
        if not btn:
            continue
        attrs = btn.group(1) + btn.group(2)
        audio = re.search(r'data-audio="([^"]*)"', attrs)
        example = strip_tags(m.group(3))
        items.append({
            't': html_mod.unescape(btn.group(1)),
            'g': strip_tags(m.group(2)),
            'e': example,
            'a': audio.group(1) if audio else '',
            'lv': level_at(levels, m.start()),
            'ty': 'mot'
        })
    return items


def extract_exprs(src):
    sec = section_of(src, 'expressions')
    levels = [(m.start(), m.group(1)) for m in re.finditer(r'<div data-lv="(\w+)"', sec)]
    items = []
    base = 0
    for chunk in sec.split('<div class="expr">')[1:]:
        pos = sec.find('<div class="expr">', base)
        base = pos + 1
        btn = re.search(r'<button class="say"[^>]*data-say="([^"]*)"([^>]*)>', chunk)
        if not btn:
            continue
        attrs = btn.group(1) + btn.group(2)
        audio = re.search(r'data-audio="([^"]*)"', attrs)
        sens = re.search(r'<div class="sens">(.*?)</div>', chunk, re.S)
        items.append({
            't': html_mod.unescape(btn.group(1)),
            'g': strip_tags(sens.group(1)) if sens else '',
            'e': '',
            'a': audio.group(1) if audio else '',
            'lv': level_at(levels, pos),
            'ty': 'expression'
        })
    return items


def build_deck():
    reg = json.load(open(REG, encoding='utf-8'))
    deck = {'lessons': [], 'items': []}
    for entry in reg:
        if not os.path.exists(entry['file']):
            continue
        src = open(entry['file'], encoding='utf-8').read()
        items = extract_vocab(src) + extract_exprs(src)
        for it in items:
            it['l'] = entry['file']
            it['lt'] = entry.get('nav', entry['file'])
            deck['items'].append(it)
        deck['lessons'].append({'f': entry['file'], 't': entry.get('nav', entry['file']), 'n': len(items)})
    return deck


TEMPLATE = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mes progrès — révisions espacées</title>
<style>
  :root { --bleu: #16357a; --bleu-clair: #e8eefb; --rouge: #c8102e; --vert: #1e7a46;
          --violet: #6b3fa0; --teal: #0e6b62; --texte: #22262e; --gris: #5c6470;
          --fond: #f6f7fb; --carte: #ffffff; --bordure: #dde3ee; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: var(--fond); color: var(--texte); line-height: 1.6; font-size: 16.5px; }
  header { background: linear-gradient(135deg, #16357a 0%, #1d4aa3 60%, #2a5cc4 100%);
           color: #fff; padding: 2.2rem 1.5rem 1.9rem; position: relative; overflow: hidden; }
  header::after { content: ""; position: absolute; inset: auto 0 0 0; height: 6px;
           background: linear-gradient(90deg, var(--bleu) 0 33%, #fff 33% 66%, var(--rouge) 66% 100%); opacity: .9; }
  .head-inner { max-width: 860px; margin: 0 auto; position: relative; z-index: 1; }
  .kicker { text-transform: uppercase; letter-spacing: .14em; font-size: .78rem; font-weight: 700;
            color: #bcd0f7; margin: 0 0 .6rem; }
  header h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.6rem, 4vw, 2.3rem); margin: 0 0 .5rem; }
  header p { margin: 0; color: #dbe5fa; max-width: 66ch; }
  header a { color: #fff; }
  main { max-width: 860px; margin: 0 auto; padding: 1.8rem 1.25rem 4rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .8rem; margin-bottom: 1.4rem; }
  .stat { background: var(--carte); border: 1px solid var(--bordure); border-radius: 12px; padding: .8rem .9rem; }
  .stat .n { font-size: 1.5rem; font-weight: 800; color: var(--bleu); }
  .stat .l { font-size: .78rem; color: var(--gris); text-transform: uppercase; letter-spacing: .05em; }
  .chips { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1rem; }
  .chip { border: 1.5px solid #c9d6f2; background: #fff; color: var(--bleu); border-radius: 999px;
          padding: .25rem .8rem; font: inherit; font-size: .84rem; font-weight: 700; cursor: pointer; }
  .chip.on { background: var(--bleu); color: #fff; border-color: var(--bleu); }
  .card { background: var(--carte); border: 1px solid var(--bordure); border-radius: 14px;
          padding: 1.6rem 1.5rem; margin-bottom: 1.2rem; box-shadow: 0 1px 3px rgba(20,40,90,.06); }
  .card .tag { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
               color: var(--gris); margin-bottom: .7rem; }
  #review { padding: 2.2rem 1.6rem 1.8rem; }
  #qbody { text-align: center; }
  .front { font-size: 1.7rem; font-weight: 700; color: var(--bleu); min-height: 2.4rem; cursor: pointer; }
  .hint { font-size: .82rem; color: var(--gris); margin-top: .45rem; }
  .back { margin-top: 1.1rem; padding-top: 1.1rem; border-top: 1px dashed var(--bordure); display: none; }
  .back .term { font-size: 1.5rem; font-weight: 800; color: var(--vert); }
  .back .ex { color: var(--gris); font-style: italic; margin-top: .4rem; }
  .back .play { margin-top: .7rem; }
  .reveal { margin-top: 1.2rem; }
  .reveal .btn { padding: .6rem 2rem; font-size: .95rem; }
  .grade { display: none; gap: .6rem; flex-wrap: wrap; margin-top: 1.3rem; }
  .grade button { flex: 1 1 0; min-width: 84px; display: flex; flex-direction: column; align-items: center;
                  gap: .1rem; font: inherit; color: #fff; border: none; border-radius: 12px;
                  padding: .55rem .35rem .5rem; cursor: pointer; }
  .grade button b { font-size: .95rem; }
  .grade button .ivl { font-size: .78rem; opacity: .92; font-weight: 600; }
  .g0 { background: #c0392b; } .g0:hover { background: #a93226; }
  .g1 { background: #cf7a22; } .g1:hover { background: #b26a1e; }
  .g2 { background: #2e8b57; } .g2:hover { background: #287a4c; }
  .g3 { background: #2c6fbb; } .g3:hover { background: #266199; }
  .keys { font-size: .78rem; color: var(--gris); margin-top: .8rem; }
  .btn { font: inherit; font-weight: 700; font-size: .9rem; border-radius: 999px; padding: .45rem 1.1rem;
         cursor: pointer; border: 1.5px solid transparent; background: var(--bleu); color: #fff; }
  .btn.ghost { background: transparent; color: var(--bleu); border-color: #c9d6f2; }
  .btn.danger { background: transparent; color: #a3081f; border-color: #f0c3ca; }
  .play { font: inherit; border: 1.5px solid #c9d6f2; background: #fff; color: var(--bleu);
          border-radius: 999px; padding: .25rem .7rem; font-weight: 700; cursor: pointer; }
  .empty { text-align: center; color: var(--gris); padding: 1.2rem 0 .4rem; }
  .progress-line { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
                   font-size: .85rem; color: var(--gris); margin-bottom: .6rem; }
  .bar { flex: 1; height: 8px; background: var(--bleu-clair); border-radius: 999px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--teal); width: 0; transition: width .2s ease; }
  .chart { display: flex; align-items: flex-end; gap: .6rem; padding: .4rem 0 0; }
  .fbar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .3rem; }
  .fbar-n { font-weight: 800; color: var(--bleu); font-size: .95rem; }
  .fbar-track { width: 100%; max-width: 72px; height: 110px; background: #eef1f8; border-radius: 8px;
                display: flex; align-items: flex-end; overflow: hidden; }
  .fbar-track i { display: block; width: 100%; background: #6f8fd0; border-radius: 8px 8px 0 0;
                  transition: height .25s ease; }
  .fbar.hot .fbar-n { color: var(--rouge); }
  .fbar.hot .fbar-track i { background: var(--rouge); }
  .fbar-l { font-size: .76rem; color: var(--gris); }
  h2 { font-family: Georgia, "Times New Roman", serif; color: var(--bleu); font-size: 1.25rem; margin: 1.8rem 0 .6rem; }
  table.act { width: 100%; border-collapse: collapse; font-size: .88rem; }
  table.act td, table.act th { padding: .4rem .6rem; border-bottom: 1px solid var(--bordure); text-align: left; }
  table.act th { color: var(--bleu); font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
  .score-ok { color: var(--vert); font-weight: 700; }
  .score-ko { color: #a3081f; font-weight: 700; }
  details.sync { background: #f8faff; border: 1px solid var(--bordure); border-radius: 12px; padding: .8rem 1rem; margin-top: 1rem; }
  details.sync summary { cursor: pointer; font-weight: 700; color: var(--bleu); font-size: .92rem; }
  details.sync input { font: inherit; font-size: .88rem; padding: .35rem .6rem; border: 1.5px solid #c9d6f2;
                       border-radius: 8px; width: 100%; margin: .35rem 0; }
  .note { font-size: .84rem; color: var(--gris); }
  footer { max-width: 860px; margin: 0 auto; padding: 0 1.25rem 3rem; color: var(--gris); font-size: .85rem; }
  footer a { color: var(--bleu); }
</style>
</head>
<body>
<header>
  <div class="head-inner">
    <p class="kicker">Français avec un tuteur · Révisions</p>
    <h1>Mes progrès</h1>
    <p>Vos mots et expressions passent en révision espacée : chaque carte revient juste avant que vous ne l'oubliez.
    Vos données restent dans ce navigateur (et peuvent se synchroniser, ci-dessous). <a href="index.html">← Toutes les leçons</a></p>
  </div>
</header>
<main>
  <div class="stats" id="stats"></div>

  <div class="chips" id="filters"></div>

  <div class="card" id="review">
    <div class="progress-line"><span id="qcount"></span><span style="flex:1"></span><span id="qnext"></span></div>
    <div class="bar"><i id="qbar"></i></div>
    <div id="qbody"></div>
  </div>

  <h2>À venir</h2>
  <div class="card">
    <div class="chart" id="forecast"></div>
    <p class="note">Cartes dues dans chaque période — les retards comptent dans « Auj. ».</p>
  </div>

  <h2>Activité récente</h2>
  <div class="card"><table class="act" id="activity"><tbody></tbody></table></div>

  <h2>Sauvegarde</h2>
  <div class="card">
    <p class="note">Exportez régulièrement votre fichier de progrès (il est petit) : c'est votre sauvegarde entre appareils.</p>
    <button class="btn" id="export">Exporter mes progrès (.json)</button>
    <label class="btn ghost" style="display:inline-block;margin-left:.5rem;">Importer…
      <input type="file" id="import" accept="application/json" style="display:none;">
    </label>
    <span id="backup-msg" class="note"></span>
    <button class="btn danger" id="reset" style="margin-left:.5rem;">Réinitialiser</button>
    <details class="sync">
      <summary>Synchronisation Cloudflare (optionnel)</summary>
      <p class="note">Après avoir déployé le Worker (voir <code>cloudflare/README.md</code>), collez son URL et votre jeton secret.
      Les progrès seront alors sauvegardés en ligne à chaque révision.</p>
      <input id="sync-url" placeholder="https://french-progress.votre-compte.workers.dev">
      <input id="sync-token" placeholder="jeton secret (40 caractères hex)">
      <button class="btn" id="sync-save">Enregistrer</button>
      <button class="btn ghost" id="sync-off">Déconnecter</button>
      <span id="sync-msg" class="note"></span>
    </details>
  </div>
</main>
<footer>Progrès stockés localement (localStorage) par <code>srs.js</code> — composant partagé, réutilisé sur chaque page de leçon.</footer>

<script id="deck" type="application/json">{deck}</script>
<script src="srs.js"></script>
<script>
(function () {
  var DECK = JSON.parse(document.getElementById('deck').textContent);
  var GRADES = ['Encore', 'Difficile', 'Bien', 'Facile'];
  var DAY = 86400000;
  var lessonFilter = '';
  var doc = SRS.load();

  function catalogOf(lessonFile) {
    return DECK.items.filter(function (it) { return it.l === lessonFile; })
      .map(function (it) { return { key: it.t, type: it.ty, term: it.t, gloss: it.g, example: it.e, audio: it.a, level: it.lv }; });
  }
  function addLessonToDeck(lessonFile) {
    return SRS.registerItems(doc, lessonFile, catalogOf(lessonFile));
  }

  SRS.pull(function (remote) {
    if (remote && Object.keys(remote).length) {
      doc = SRS.save(SRS.merge(doc, remote));
      renderAll();
    }
  });

  var queue = [];
  var pos = 0;
  var flipped = false;

  function itemsMatching() {
    return SRS.dueItems(doc, lessonFilter || null);
  }

  function buildQueue() {
    queue = itemsMatching();
    pos = 0;
    flipped = false;
  }

  function renderStats() {
    var s = SRS.stats(doc, lessonFilter || null);
    var st = SRS.streak(doc);
    var el = document.getElementById('stats');
    el.innerHTML = '';
    [['À réviser', s.due], ['Nouveaux', s.fresh], ['En cours', s.learning],
     ['Acquis', s.known], ['Révisions', s.reviews], ['Série (jours)', st]]
      .forEach(function (p) {
        var d = document.createElement('div');
        d.className = 'stat';
        d.innerHTML = '<div class="n">' + p[1] + '</div><div class="l">' + p[0] + '</div>';
        el.appendChild(d);
      });
  }

  function renderFilters() {
    var el = document.getElementById('filters');
    el.innerHTML = '';
    var opts = [{ f: '', t: 'Toutes les leçons' }].concat(DECK.lessons.map(function (L) { return { f: L.f, t: L.t }; }));
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'chip' + (lessonFilter === o.f ? ' on' : '');
      b.textContent = o.t;
      b.addEventListener('click', function () {
        lessonFilter = o.f;
        buildQueue();
        renderAll();
      });
      el.appendChild(b);
    });
  }

  function fmtIvl(ms) {
    if (ms < 0) ms = 0;
    var min = Math.round(ms / 60000);
    if (min < 60) return min + ' min';
    var h = Math.round(ms / 3600000);
    if (h < 24) return h + ' h';
    return Math.round(ms / DAY) + ' j';
  }

  function previewIvl(item, g) {
    var c = {};
    for (var k in item) c[k] = item[k];
    SRS.grade(c, g);
    return fmtIvl(c.due - Date.now());
  }

  function renderForecast() {
    var el = document.getElementById('forecast');
    var eod = new Date();
    eod.setHours(23, 59, 59, 999);
    var bounds = [
      ['Auj.', eod.getTime(), 0],
      ['Demain', eod.getTime() + DAY, 0],
      ['2-3 j', eod.getTime() + 3 * DAY, 0],
      ['4-7 j', eod.getTime() + 7 * DAY, 0],
      ['+7 j', Infinity, 0]
    ];
    Object.keys(doc.items).forEach(function (k) {
      var it = doc.items[k];
      if (lessonFilter && it.meta && it.meta.lesson !== lessonFilter) return;
      for (var i = 0; i < bounds.length; i++) {
        if (it.due <= bounds[i][1]) { bounds[i][2]++; break; }
      }
    });
    var max = 1;
    bounds.forEach(function (b) { if (b[2] > max) max = b[2]; });
    el.innerHTML = '';
    bounds.forEach(function (b, i) {
      var d = document.createElement('div');
      d.className = 'fbar' + (i === 0 && b[2] > 0 ? ' hot' : '');
      var pct = b[2] ? Math.max(6, Math.round(100 * b[2] / max)) : 0;
      d.innerHTML = '<div class="fbar-n">' + b[2] + '</div>'
        + '<div class="fbar-track"><i style="height:' + pct + '%"></i></div>'
        + '<div class="fbar-l">' + b[0] + '</div>';
      el.appendChild(d);
    });
  }

  var audioEl = null;
  function playAudio(path) {
    if (!path) return;
    try {
      if (audioEl) audioEl.pause();
      audioEl = new Audio(path);
      var pr = audioEl.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }

  function renderCard() {
    var body = document.getElementById('qbody');
    var count = document.getElementById('qcount');
    var bar = document.getElementById('qbar');
    var next = document.getElementById('qnext');
    if (!queue.length) {
      var deckSize = Object.keys(doc.items).length;
      if (deckSize === 0) {
        body.innerHTML = '<div class="empty">Votre paquet est vide.<br>'
          + 'Ouvrez une leçon et ajoutez des mots : bouton <b>« + Ajouter ces N ... »</b> au-dessus d’un tableau,'
          + ' ou cliquez simplement le haut-parleur d’un mot écouté.'
          + '<br><br><button class="btn" id="add-all">Ou ajouter tout le catalogue (' + DECK.items.length + ' cartes)</button></div>';
        var ab = document.getElementById('add-all');
        if (ab) {
          ab.addEventListener('click', function () {
            DECK.lessons.forEach(function (L) { addLessonToDeck(L.f); });
            SRS.save(doc);
            buildQueue();
            renderAll();
          });
        }
      } else {
        body.innerHTML = '<div class="empty">Rien à réviser pour le moment — revenez plus tard !</div>';
      }
      count.textContent = '';
      bar.style.width = '100%';
      next.textContent = '';
      return;
    }
    if (pos >= queue.length) {
      body.innerHTML = '<div class="empty">Session terminée : ' + queue.length + ' carte(s) révisée(s). Bravo !</div>';
      count.textContent = queue.length + ' / ' + queue.length;
      bar.style.width = '100%';
      next.textContent = '';
      return;
    }
    var item = doc.items[queue[pos]];
    var m = item.meta;
    count.textContent = (pos + 1) + ' / ' + queue.length;
    bar.style.width = (100 * pos / queue.length) + '%';
    next.textContent = '';
    body.innerHTML = '';
    var tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = m.lt + ' · ' + (m.type === 'expression' ? 'expression' : 'mot') + ' · ' + m.level.toUpperCase();
    body.appendChild(tag);
    var front = document.createElement('div');
    front.className = 'front';
    front.textContent = m.gloss || m.term;
    front.title = 'Cliquer pour afficher la réponse';
    front.addEventListener('click', function () { flip(); });
    body.appendChild(front);
    var hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = m.type === 'expression' ? 'Retrouvez l’expression en français' : 'Dites ce mot en français';
    body.appendChild(hint);
    var back = document.createElement('div');
    back.className = 'back';
    var term = document.createElement('div');
    term.className = 'term';
    term.textContent = m.term;
    back.appendChild(term);
    if (m.example) {
      var ex = document.createElement('div');
      ex.className = 'ex';
      ex.textContent = m.example;
      back.appendChild(ex);
    }
    if (m.audio) {
      var pb = document.createElement('button');
      pb.className = 'play';
      pb.textContent = 'Écouter';
      pb.addEventListener('click', function () { playAudio(m.audio); });
      back.appendChild(pb);
    }
    body.appendChild(back);
    var reveal = document.createElement('div');
    reveal.className = 'reveal';
    var rv = document.createElement('button');
    rv.className = 'btn';
    rv.textContent = 'Afficher la réponse (espace)';
    rv.addEventListener('click', function () { flip(); });
    reveal.appendChild(rv);
    body.appendChild(reveal);
    var grade = document.createElement('div');
    grade.className = 'grade';
    GRADES.forEach(function (g, i) {
      var b = document.createElement('button');
      b.className = 'g' + i;
      b.title = 'Touche ' + (i + 1);
      b.innerHTML = '<b>' + g + '</b><span class="ivl">' + previewIvl(item, i) + '</span>';
      b.addEventListener('click', function () { doGrade(i); });
      grade.appendChild(b);
    });
    body.appendChild(grade);
    var keys = document.createElement('div');
    keys.className = 'keys';
    keys.textContent = 'raccourcis : espace = afficher · 1-4 = noter · R = écouter';
    body.appendChild(keys);
    if (flipped) showBack();
  }

  function showBack() {
    flipped = true;
    var back = document.querySelector('#qbody .back');
    var grade = document.querySelector('#qbody .grade');
    var reveal = document.querySelector('#qbody .reveal');
    if (back) back.style.display = 'block';
    if (grade) grade.style.display = 'flex';
    if (reveal) reveal.style.display = 'none';
  }

  function flip() { showBack(); }

  function doGrade(g) {
    var key = queue[pos];
    if (!key) return;
    SRS.grade(doc.items[key], g);
    SRS.recordActivity(doc, { k: 'rev', lesson: doc.items[key].meta.lesson, term: doc.items[key].meta.term, g: g });
    SRS.save(doc);
    pos++;
    flipped = false;
    renderStats();
    renderCard();
    renderForecast();
  }

  function renderActivity() {
    var tb = document.querySelector('#activity tbody');
    tb.innerHTML = '';
    var acts = doc.activity.slice(-400).reverse().filter(function (e) { return e.k === 'exo'; }).slice(0, 15);
    if (!acts.length) {
      tb.innerHTML = '<tr><td class="note">Aucune activité pour le moment — faites un exercice dans une leçon !</td></tr>';
      return;
    }
    acts.forEach(function (e) {
      var tr = document.createElement('tr');
      var d = new Date(e.t);
      var cls = e.score === e.total ? 'score-ok' : 'score-ko';
      tr.innerHTML = '<td>' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
        + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</td>'
        + '<td>' + (e.lesson || '').replace('lecon-', '').replace('.html', '') + '</td>'
        + '<td>' + (e.id || '') + '</td>'
        + '<td class="' + cls + '">' + e.score + '/' + e.total + '</td>';
      tb.appendChild(tr);
    });
  }

  function renderAll() {
    renderStats();
    renderFilters();
    renderCard();
    renderForecast();
    renderActivity();
  }

  document.getElementById('export').addEventListener('click', function () {
    var blob = new Blob([SRS.exportJSON(doc)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'progres-francais-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  });
  document.getElementById('import').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        doc = SRS.importJSON(r.result, doc);
        document.getElementById('backup-msg').textContent = 'Progrès importés.';
        buildQueue();
        renderAll();
      } catch (err) {
        document.getElementById('backup-msg').textContent = ' Fichier illisible.';
      }
    };
    r.readAsText(f);
  });
  var cfg = SRS.syncCfg();
  if (cfg) {
    document.getElementById('sync-url').value = cfg.url || '';
    document.getElementById('sync-token').value = cfg.token || '';
  }
  document.getElementById('sync-save').addEventListener('click', function () {
    SRS.setSync(document.getElementById('sync-url').value.trim(), document.getElementById('sync-token').value.trim());
    document.getElementById('sync-msg').textContent = ' Synchronisation enregistrée.'.trim();
    SRS.pull(function (remote) {
      if (remote && Object.keys(remote).length) { doc = SRS.save(SRS.merge(doc, remote)); renderAll(); }
    });
  });
  document.getElementById('sync-off').addEventListener('click', function () {
    SRS.setSync(null);
    document.getElementById('sync-msg').textContent = 'Synchronisation désactivée.';
  });
  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('Effacer tout votre historique de révision ?')) return;
    doc = SRS.reset();
    document.getElementById('backup-msg').textContent = 'Progrès réinitialisés.';
    buildQueue();
    renderAll();
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === ' ' && !flipped) { e.preventDefault(); flip(); return; }
    if (flipped && e.key >= '1' && e.key <= '4') { e.preventDefault(); doGrade(parseInt(e.key, 10) - 1); return; }
    if (flipped && (e.key === 'r' || e.key === 'R')) {
      var key = queue[pos];
      if (key && doc.items[key] && doc.items[key].meta) playAudio(doc.items[key].meta.audio);
    }
  });

  buildQueue();
  renderAll();
})();
</script>
</body>
</html>
'''


def main():
    deck = build_deck()
    doc = TEMPLATE.replace('{deck}', json.dumps(deck, ensure_ascii=False, separators=(',', ':')))
    open(OUT, 'w', encoding='utf-8').write(doc)
    vocab = sum(1 for i in deck['items'] if i['ty'] == 'mot')
    exprs = sum(1 for i in deck['items'] if i['ty'] == 'expression')
    print('wrote %s: %d items (%d mots, %d expressions), %d lessons' % (
        OUT, len(deck['items']), vocab, exprs, len(deck['lessons'])))


if __name__ == '__main__':
    main()
