// Personal mastery overlay for parcours.html.
// Reads the progress doc (srs.js, localStorage-first) and decorates each
// <article class="gp" data-gp="<id>"> with its mastery state. Shown whenever
// this browser has progress, signed in or not; signing in only adds sync.
(function (root) {
  'use strict';

  var HIDE_KEY = 'fr-parcours-hide-mastery';
  var DAY = 86400000;
  var LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var STATE_NAMES = ['Non commencé', 'Découvert', 'En cours', 'Acquis', 'Maîtrisé'];

  function pct(x) { return Math.round(x * 100) + ' %'; }

  function ago(t, now) {
    if (!t) return '';
    var d = Math.floor((now - t) / DAY);
    if (d <= 0) return 'aujourd’hui';
    if (d === 1) return 'hier';
    if (d < 60) return 'il y a ' + d + ' j';
    return 'il y a ' + Math.round(d / 30) + ' mois';
  }

  function evidence(m, now) {
    var parts = [];
    if (m.attempts) parts.push(m.attempts + ' exercice' + (m.attempts > 1 ? 's' : '') + ' · ' + pct(m.acc) + ' de réussite');
    else if (m.partial) parts.push('exercice commencé');
    if (m.cards) parts.push(m.ivl ? 'carte : intervalle ' + m.ivl + ' j' : 'carte en révision');
    if (m.last) parts.push(ago(m.last, now));
    return parts.join(' · ');
  }

  // The learner's current level: the highest level with at least
  // LEVEL_MIN_POINTS points at « En cours » or beyond (or « À revoir »), so one
  // exploratory exercise at a higher level doesn't move it. null if none.
  var LEVEL_MIN_POINTS = 2;
  function currentLevel(points, ms) {
    var count = {};
    points.forEach(function (p) {
      var m = ms[p.id];
      if (m && (m.state >= 2 || m.stale)) count[p.lv] = (count[p.lv] || 0) + 1;
    });
    for (var i = LEVELS.length - 1; i >= 0; i--) {
      if ((count[LEVELS[i]] || 0) >= LEVEL_MIN_POINTS) return LEVELS[i];
    }
    return null;
  }

  // Up to `n` concepts to work on next, among points taught in a lesson and not
  // yet acquired (or due for review):
  //   1. points already in progress or « à revoir », at any level;
  //   2. points at the current level and above, lowest level first;
  //   3. untouched gaps below the current level (only if the list isn't full).
  // A prerequisite blocks a point unless it is acquired — except untouched
  // prerequisites below the current level, which are assumed known.
  function nextUp(points, ms, n) {
    var state = function (id) { return (ms[id] || { state: 0 }).state; };
    var cur = LEVELS.indexOf(currentLevel(points, ms) || 'A1');
    var lvOf = {}, taught = {};
    points.forEach(function (p) { lvOf[p.id] = LEVELS.indexOf(p.lv); if (p.href) taught[p.id] = 1; });
    var ranked = [];
    points.forEach(function (p, i) {
      if (!p.href) return;
      var m = ms[p.id];
      var st = state(p.id);
      if (st >= 3 && !(m && m.stale)) return;
      var ready = (p.pre || []).every(function (q) {
        return !taught[q] || state(q) >= 3 || (lvOf[q] < cur && state(q) === 0);
      });
      if (!ready) return;
      var rank = (st === 2 || (m && m.stale)) ? 0 : (lvOf[p.id] >= cur ? 1 : 2);
      ranked.push({ p: p, rank: rank, lv: lvOf[p.id], i: i });
    });
    ranked.sort(function (a, b) { return a.rank - b.rank || a.lv - b.lv || a.i - b.i; });
    return ranked.slice(0, n).map(function (x) { return x.p; });
  }

  function hidden() {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; }
  }
  function setHidden(v) {
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch (e) {}
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function clearOverlay() {
    Array.prototype.forEach.call(document.querySelectorAll('.gp'), function (a) {
      a.className = a.className.replace(/\s*\bm-(\d|stale)\b/g, '');
      var chip = a.querySelector('.gp-state');
      if (chip) { chip.hidden = true; chip.textContent = ''; chip.removeAttribute('title'); }
      var ev = a.querySelector('.gp-evid');
      if (ev) ev.parentNode.removeChild(ev);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.lv-prog'), function (p) { p.hidden = true; p.textContent = ''; });
  }

  function paint(points, ms, now) {
    var byLevel = {};
    points.forEach(function (p) {
      var m = ms[p.id] || { state: 0, label: STATE_NAMES[0] };
      var a = document.getElementById('gp-' + p.id);
      if (!a) return;
      a.classList.add('m-' + m.state);
      if (m.stale) a.classList.add('m-stale');
      var chip = a.querySelector('.gp-state');
      chip.textContent = m.label;
      chip.hidden = !p.href && !ms[p.id]; // nothing to start yet: no lesson teaches it
      var ev = evidence(m, now);
      if (ev) {
        chip.title = ev;
        var line = el('p', 'gp-evid', ev);
        a.insertBefore(line, a.querySelector('.study'));
      }
      var b = byLevel[p.lv] || (byLevel[p.lv] = [0, 0, 0, 0, 0, 0]);
      b[m.stale ? 5 : m.state]++;
    });
    LEVELS.forEach(function (lv) {
      var sec = document.getElementById('niveau-' + lv.toLowerCase());
      var box = sec && sec.querySelector('.lv-prog');
      var b = byLevel[lv];
      if (!box || !b) return;
      var total = b.reduce(function (x, y) { return x + y; }, 0);
      var bar = el('div', 'lv-bar');
      bar.setAttribute('role', 'img');
      [[4, '--m4'], [3, '--m3'], [5, '--mr'], [2, '--m2'], [1, '--m1']].forEach(function (s) {
        if (!b[s[0]]) return;
        var seg = el('span');
        seg.style.width = (100 * b[s[0]] / total) + '%';
        seg.style.background = 'var(' + s[1] + ')';
        bar.appendChild(seg);
      });
      var acquired = b[3] + b[4];
      bar.setAttribute('aria-label', acquired + ' acquis sur ' + total);
      box.textContent = '';
      box.appendChild(bar);
      box.appendChild(el('span', null, acquired + '/' + total + ' acquis' + (b[5] ? ' · ' + b[5] + ' à revoir' : '')));
      box.hidden = false;
    });
  }

  function renderPanel(box, opts) {
    box.textContent = '';
    box.hidden = false;
    var signed = opts.signed, ms = opts.ms;
    if (!opts.has) {
      box.className = 'me quiet';
      box.appendChild(document.createTextNode('Faites les exercices des leçons ou ajoutez des points de grammaire à vos révisions : votre niveau de maîtrise s’affichera ici, point par point. '));
      if (!signed) {
        var a = el('a', null, 'Se connecter');
        a.href = 'progres.html#sync';
        box.appendChild(a);
        box.appendChild(document.createTextNode(' pour retrouver vos progrès sur tous vos appareils.'));
      }
      return;
    }
    if (opts.hide) {
      box.className = 'me quiet';
      var top0 = el('div', 'me-top');
      top0.appendChild(el('span', null, 'Votre progression est masquée : vous voyez le parcours général.'));
      var show = el('button', 'me-btn', 'Afficher ma progression');
      show.type = 'button';
      show.addEventListener('click', opts.onToggle);
      top0.appendChild(show);
      box.appendChild(top0);
      return;
    }
    box.className = 'me';
    var top = el('div', 'me-top');
    top.appendChild(el('h2', null, 'Ma progression'));
    var hideBtn = el('button', 'me-btn', 'Masquer ma progression');
    hideBtn.type = 'button';
    hideBtn.addEventListener('click', opts.onToggle);
    top.appendChild(hideBtn);
    box.appendChild(top);

    var counts = [0, 0, 0, 0, 0], stale = 0;
    opts.points.forEach(function (p) {
      var m = ms[p.id];
      if (!m) { if (p.href) counts[0]++; return; }
      if (m.stale) stale++; else counts[m.state]++;
    });
    var legend = el('div', 'me-legend');
    [[4, '--m4'], [3, '--m3'], [2, '--m2'], [1, '--m1']].forEach(function (s) {
      var item = el('span');
      var dot = el('span', 'dot');
      dot.style.background = 'var(' + s[1] + ')';
      item.appendChild(dot);
      item.appendChild(el('b', null, String(counts[s[0]])));
      item.appendChild(document.createTextNode(' ' + STATE_NAMES[s[0]].toLowerCase()));
      legend.appendChild(item);
    });
    if (stale) {
      var it = el('span');
      var d = el('span', 'dot');
      d.style.background = 'var(--mr)';
      it.appendChild(d);
      it.appendChild(el('b', null, String(stale)));
      it.appendChild(document.createTextNode(' à revoir'));
      legend.appendChild(it);
    }
    box.appendChild(legend);

    var next = nextUp(opts.points, ms, 3);
    if (next.length) {
      var cl = currentLevel(opts.points, ms);
      box.appendChild(el('p', 'me-sub', cl
        ? 'À travailler ensuite — votre niveau actuel : ' + cl + ' (d’après vos exercices et révisions) :'
        : 'À travailler ensuite :'));
      var ul = el('ul', 'me-next');
      next.forEach(function (p) {
        var li = el('li');
        var a = el('a', null, p.title);
        a.href = p.href;
        li.appendChild(el('b', null, p.lv + ' · '));
        li.appendChild(a);
        var m = ms[p.id];
        li.appendChild(el('span', 'why', ' — ' + (m ? m.label.toLowerCase() : 'pas encore commencé')));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    var sub = el('p', 'me-sub');
    sub.appendChild(document.createTextNode('Calculé à partir de vos exercices (première réponse complète de chaque séance) et de vos cartes de grammaire. '));
    if (signed) {
      sub.appendChild(document.createTextNode(opts.syncText || 'Synchronisation…'));
    } else {
      sub.appendChild(document.createTextNode('Ces données sont dans ce navigateur — '));
      var link = el('a', null, 'connectez-vous');
      link.href = 'progres.html#sync';
      sub.appendChild(link);
      sub.appendChild(document.createTextNode(' pour les retrouver sur tous vos appareils.'));
    }
    box.appendChild(sub);
  }

  function init() {
    var SRS = root.SRS;
    var dataEl = document.getElementById('gp-data');
    var box = document.getElementById('me');
    // a cached older srs.js (no mastery yet) → keep the static generic roadmap
    if (!SRS || typeof SRS.mastery !== 'function' || typeof SRS.hasProgress !== 'function' || !dataEl || !box) return;
    var data = JSON.parse(dataEl.textContent);
    var syncText = '';

    function render(doc) {
      var now = Date.now();
      var signed = !!SRS.auth();
      var has = SRS.hasProgress(doc);
      var hide = hidden();
      var ms = has ? SRS.mastery(doc, data.map, now) : {};
      clearOverlay();
      renderPanel(box, {
        has: has, hide: hide, signed: signed, ms: ms, points: data.points, syncText: syncText,
        onToggle: function () { setHidden(!hidden()); render(SRS.load()); }
      });
      if (has && !hide) paint(data.points, ms, now);
    }

    function sync() {
      if (!SRS.auth()) return;
      SRS.syncNow(function (doc, err, changed) {
        syncText = err ? 'Synchronisation impossible pour l’instant — données locales affichées.'
                       : 'Synchronisé avec votre compte Google.';
        render(changed ? doc : SRS.load());
      });
    }

    render(SRS.load());
    sync();
    root.addEventListener('focus', function () { render(SRS.load()); sync(); });
    root.addEventListener('storage', function (e) {
      if (e.key === SRS.KEY || e.key === HIDE_KEY) render(SRS.load());
    });
  }

  root.Parcours = { nextUp: nextUp, currentLevel: currentLevel, evidence: evidence, LEVEL_MIN_POINTS: LEVEL_MIN_POINTS };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
}(typeof window !== 'undefined' ? window : this));
