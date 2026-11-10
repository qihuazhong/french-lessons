(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SRS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'fr-lessons-progress-v1';
  var SESSION_KEY = 'fr-lessons-session';
  var LAST_KEY = 'fr-lessons-sync-last';
  var DAY = 86400000;
  var MIN = 60000;
  var MAX_ACTIVITY = 800;
  var MAX_EXO = 10;

  function now() { return Date.now(); }

  function emptyDoc() {
    return { v: 1, created: now(), lastOpen: now(), items: {}, removed: {}, activity: [], priv: {}, exo: {} };
  }

  function load() {
    try {
      var raw = (typeof localStorage !== 'undefined') && localStorage.getItem(KEY);
      var d = raw ? JSON.parse(raw) : emptyDoc();
      if (!d.items) d.items = {};
      if (!d.removed) d.removed = {};
      if (!d.activity) d.activity = [];
      if (!d.priv) d.priv = {};
      var clean = dedupeActivity(d.activity);
      if (clean.length !== d.activity.length) d.activity = clean;
      backfillExo(d);
      d.v = 1;
      return d;
    } catch (e) {
      return emptyDoc();
    }
  }

  function persist(doc) {
    doc.lastOpen = now();
    try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) {}
    return doc;
  }

  function save(doc) {
    persist(doc);
    scheduleSync(doc);
    return doc;
  }

  function reset() {
    var doc = emptyDoc();
    doc.wipedAt = now();
    persist(doc);
    scheduleSync(doc);
    return doc;
  }

  function newItem(meta) {
    return { st: 0, due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0, last: 0, meta: meta || null };
  }

  function grade(item, g, t) {
    if (t == null) t = now();
    if (item.st === 0 || item.st === 1) {
      if (g === 0) { item.st = 1; item.due = t + 10 * MIN; }
      else if (g === 1) { item.st = 1; item.due = t + 15 * MIN; }
      else if (g === 2) { item.st = 2; item.ivl = 1; item.reps++; item.due = t + DAY; }
      else { item.st = 2; item.ivl = 4; item.reps++; item.due = t + 4 * DAY; }
    } else {
      if (g === 0) {
        item.lapses++;
        item.st = 1;
        item.ease = Math.max(1.3, item.ease - 0.2);
        item.ivl = Math.max(1, Math.round(item.ivl * 0.5));
        item.due = t + 10 * MIN;
      } else if (g === 1) {
        item.ease = Math.max(1.3, item.ease - 0.15);
        item.ivl = Math.max(1, Math.round(item.ivl * 1.2));
        item.reps++;
        item.due = t + item.ivl * DAY;
      } else if (g === 2) {
        item.ivl = Math.max(1, Math.round(item.ivl * item.ease));
        item.reps++;
        item.due = t + item.ivl * DAY;
      } else {
        item.ease = Math.min(2.8, item.ease + 0.15);
        item.ivl = Math.max(2, Math.round(item.ivl * item.ease * 1.3));
        item.reps++;
        item.due = t + item.ivl * DAY;
      }
      if (item.ivl > 365) item.ivl = 365;
    }
    item.last = t;
    return item;
  }

  function itemKey(lesson, key) { return lesson + '|' + key; }

  function removeItem(doc, key) {
    if (!doc.items[key]) return false;
    delete doc.items[key];
    if (!doc.removed) doc.removed = {};
    doc.removed[key] = now();
    return true;
  }

  function registerItems(doc, lesson, list) {
    var added = 0;
    list.forEach(function (it) {
      var k = itemKey(lesson, it.key);
      if (doc.removed && doc.removed[k]) delete doc.removed[k];
      if (!doc.items[k]) {
        doc.items[k] = newItem({
          lesson: lesson, key: it.key, type: it.type, term: it.term,
          gloss: it.gloss, example: it.example, audio: it.audio, level: it.level
        });
        doc.items[k].last = now();
        added++;
      } else {
        var m = doc.items[k].meta || {};
        m.lesson = lesson; m.key = it.key; m.type = it.type; m.term = it.term;
        m.gloss = it.gloss; m.example = it.example; m.audio = it.audio; m.level = it.level;
        doc.items[k].meta = m;
      }
    });
    return added;
  }

  // ---- Leçons privées (cours particuliers) -------------------------------
  // doc.priv[id] = { id, name, url, date, notes, created, updated, deleted? }
  // Leurs cartes vivent dans doc.items sous la leçon « prive:<id> ».
  // Fusion : la version la plus récente (updated) gagne ; une suppression est
  // un tombstone (deleted) qui se propage entre appareils.
  var PRIV_PREFIX = 'prive:';

  function privLessonId(id) { return PRIV_PREFIX + id; }

  function isPrivLesson(lesson) { return String(lesson || '').indexOf(PRIV_PREFIX) === 0; }

  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
  }

  function newPrivId() {
    return now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function privateLessons(doc) {
    var p = (doc && doc.priv) || {};
    return Object.keys(p).map(function (k) { return p[k]; })
      .filter(function (L) { return L && !L.deleted; })
      .sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || '')) || (b.created || 0) - (a.created || 0);
      });
  }

  function savePrivateLesson(doc, data) {
    if (!doc.priv) doc.priv = {};
    var name = String((data && data.name) || '').trim();
    if (!name) return null;
    var id = data.id && doc.priv[data.id] && !doc.priv[data.id].deleted ? data.id : newPrivId();
    var t = now();
    var prev = doc.priv[id] || { id: id, created: t };
    var L = {
      id: id, name: name.slice(0, 120), url: safeUrl(data.url),
      date: /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : '',
      notes: String(data.notes || '').trim().slice(0, 2000),
      created: prev.created || t, updated: t
    };
    doc.priv[id] = L;
    return L;
  }

  function privateCards(doc, id) {
    var lesson = privLessonId(id);
    return Object.keys(doc.items).filter(function (k) {
      var m = doc.items[k].meta;
      return m && m.lesson === lesson;
    });
  }

  function deletePrivateLesson(doc, id) {
    if (!doc.priv || !doc.priv[id]) return false;
    var t = now();
    privateCards(doc, id).forEach(function (k) { removeItem(doc, k); });
    doc.priv[id] = { id: id, deleted: t, updated: t };
    return true;
  }

  // Une carte par ligne : « français = traduction » (option : « = exemple »).
  // Séparateurs acceptés : =, tabulation, « ; », « — » / « - » entourés d'espaces.
  function parseCardLines(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var parts = line.split(/\s*(?:=|\t|;|\s[\u2014\u2013-]\s)\s*/).map(function (x) { return x.trim(); });
      var term = parts[0];
      if (!term) return;
      out.push({
        key: term, term: term,
        type: term.split(/\s+/).length > 2 ? 'expression' : 'mot',
        gloss: parts[1] || '', example: parts.slice(2).join(' — '), audio: '', level: null
      });
    });
    return out;
  }

  function addPrivateCards(doc, id, list) {
    var L = doc.priv && doc.priv[id];
    if (!L || L.deleted) return 0;
    return registerItems(doc, privLessonId(id), list);
  }

  function activityKey(e) {
    return [e.t, e.k || '', e.lesson || '', e.term || '', e.g == null ? '' : e.g,
      e.id || '', e.score == null ? '' : e.score, e.total == null ? '' : e.total].join('|');
  }

  function dedupeActivity(list) {
    var seen = {};
    return (list || []).filter(function (e) {
      var k = activityKey(e);
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  function recordActivity(doc, entry) {
    if (entry.t == null) entry.t = now();
    doc.activity.push(entry);
    if (doc.activity.length > MAX_ACTIVITY) doc.activity = doc.activity.slice(-MAX_ACTIVITY);
    return doc;
  }

  // Exercise attempts, kept per exercise (last MAX_EXO) outside the capped
  // activity log so mastery survives long review histories.
  // doc.exo = { "<lessonFile>|<exoId>": [attempt, …] } where one attempt = one
  // sitting: {t (first event), last (latest event folded in), round?, score,
  // total, almost, partial?: 1, retries?: n}.
  // Sitting = an exos.js "round" (page load or « Recommencer » → next reset),
  // extended by any further event on that exercise less than EXO_SESSION after
  // the sitting's latest event. Score = items right on the FIRST try of the
  // sitting's first round (exos.js `first`: an item's verdict is fixed when its
  // answer is first revealed), so peeking — then completing, or resetting and
  // redoing — never raises it; those count as `retries`. `partial` until every
  // item's answer has been revealed (fill/match: first check; choice: each pick).
  // Events without a round (older pages) use the window alone, and the first
  // complete answer freezes the score.
  var EXO_SESSION = 15 * MIN;

  function exoKey(lesson, id) { return lesson + '|' + id; }

  function mergeAttempts(a, b, wiped) {
    var byT = {};
    (a || []).concat(b || []).forEach(function (r) {
      if (!r || r.t == null || (wiped && r.t <= wiped)) return;
      var cur = byT[r.t];
      if (!cur || (r.last || r.t) > (cur.last || cur.t) ||
          ((r.last || r.t) === (cur.last || cur.t) && cur.partial && !r.partial)) byT[r.t] = r;
    });
    var out = Object.keys(byT).map(function (k) { return byT[k]; });
    out.sort(function (x, y) { return x.t - y.t; });
    return out.slice(-MAX_EXO);
  }

  function foldExo(list, rec) {
    var t = rec.t == null ? now() : rec.t;
    var total = rec.total || 0;
    var hasFirst = rec.first != null;
    var score = hasFirst ? rec.first : (rec.score || 0);
    var almost = hasFirst ? (rec.firstAlmost || 0) : (rec.almost || 0);
    var legacy = rec.answered == null && rec.revealed == null;
    var done = rec.revealed != null ? rec.revealed : rec.answered;
    var complete = legacy || done >= total;
    var last = list.length ? list[list.length - 1] : null;
    var lastT = last ? (last.last || last.t) : 0;
    var sameRound = !!(rec.round && last && last.round === rec.round);
    var inWindow = !!(last && t >= last.t && t - lastT < EXO_SESSION);
    if (sameRound || inWindow) {
      last.last = Math.max(lastT, t);
      var wasComplete = !last.partial;
      // A new round right after the previous one (reset and redo with the
      // corrections fresh in mind) is a retry: it never replaces the score.
      var update = sameRound || (!rec.round && !last.round && (last.partial || legacy));
      if (update) {
        last.score = score; last.total = total; last.almost = almost;
        if (complete) delete last.partial;
        if (wasComplete && !legacy) last.retries = (last.retries || 0) + 1;
      } else {
        last.retries = (last.retries || 0) + 1;
      }
      return list;
    }
    var a = { t: t, last: t, score: score, total: total, almost: almost };
    if (rec.round) a.round = rec.round;
    if (!complete) a.partial = 1;
    list.push(a);
    return list;
  }

  function recordExo(doc, lesson, id, rec) {
    if (!id) return doc;
    if (!doc.exo) doc.exo = {};
    var k = exoKey(lesson, id);
    doc.exo[k] = foldExo((doc.exo[k] || []).slice(), rec).slice(-MAX_EXO);
    return doc;
  }

  function backfillExo(doc) {
    if (!doc.exo) doc.exo = {};
    var wiped = doc.wipedAt || 0;
    (doc.activity || []).slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (e) {
      if (e.k !== 'exo' || !e.id || !e.lesson || (wiped && e.t <= wiped)) return;
      var k = exoKey(e.lesson, e.id);
      var list = doc.exo[k] || [];
      var covered = list.some(function (a) { return a.t <= e.t && e.t <= (a.last || a.t); });
      if (covered) return;
      if (list.length && e.t < list[list.length - 1].t) return; // older than what we keep
      doc.exo[k] = foldExo(list.slice(), { t: e.t, score: e.score, total: e.total, almost: e.almost,
        answered: e.answered, first: e.first, firstAlmost: e.firstAlmost, revealed: e.revealed, round: e.round })
        .slice(-MAX_EXO);
    });
    return doc;
  }

  // ---- Mastery of curriculum concepts (parcours.html) ----------------------
  // map = { exo: {"<lesson>|<exoId>": [conceptId…]}, cards: {"<lesson>|gram:<lv>:<G#>": [conceptId…]} }
  // Evidence per concept: complete exercise attempts (first-try score of each
  // sitting) and grammar review cards. States:
  //   0 Non commencé · 1 Découvert · 2 En cours · 3 Acquis · 4 Maîtrisé
  var MASTERY_LABELS = ['Non commencé', 'Découvert', 'En cours', 'Acquis', 'Maîtrisé'];
  var ACC_WEIGHTS = [1, 0.8, 0.6, 0.4, 0.2];
  var STALE_DAYS = 90;

  function masteryOf(ev, t) {
    var att = ev.attempts.slice().sort(function (x, y) { return y.t - x.t; });
    var done = att.filter(function (a) { return !a.partial && a.total > 0; });
    var recent = done.slice(0, ACC_WEIGHTS.length);
    var wsum = 0, acc = null;
    if (recent.length) {
      acc = 0;
      recent.forEach(function (a, i) {
        acc += ACC_WEIGHTS[i] * Math.min(1, (a.score + 0.5 * (a.almost || 0)) / a.total);
        wsum += ACC_WEIGHTS[i];
      });
      acc = acc / wsum;
    }
    var n = done.length;
    var span = recent.length > 1 ? (recent[0].t - recent[recent.length - 1].t) / DAY : 0;
    var ivl = 0, reviewed = false, last = 0;
    ev.cards.forEach(function (c) {
      if (c.st === 2) ivl = Math.max(ivl, c.ivl || 0);
      if (c.st > 0 || c.reps > 0) reviewed = true;
      if (c.st > 0 || c.reps > 0) last = Math.max(last, c.last || 0);
    });
    att.forEach(function (a) { last = Math.max(last, a.last || a.t); });

    var state = 0;
    if ((n >= 2 && acc >= 0.85 && ivl >= 21) || (n >= 3 && acc >= 0.9 && span >= 7)) state = 4;
    else if ((n >= 2 && acc >= 0.8) || ivl >= 7) state = 3;
    else if (att.length || reviewed) state = 2;
    else if (ev.cards.length) state = 1;

    var stale = false;
    if (state >= 3 && last && (t - last) > STALE_DAYS * DAY) { state--; stale = true; }
    return {
      state: state, label: stale ? 'À revoir' : MASTERY_LABELS[state], stale: stale,
      attempts: n, partial: att.length - n, acc: acc, cards: ev.cards.length, ivl: ivl, last: last
    };
  }

  function mastery(doc, map, t) {
    if (t == null) t = now();
    doc = doc || emptyDoc();
    map = map || {};
    var ev = {};
    function bucket(c) { return ev[c] || (ev[c] = { attempts: [], cards: [] }); }
    Object.keys(map.exo || {}).forEach(function (k) {
      var list = (doc.exo || {})[k];
      if (!list || !list.length) return;
      map.exo[k].forEach(function (c) { bucket(c).attempts = bucket(c).attempts.concat(list); });
    });
    Object.keys(map.cards || {}).forEach(function (k) {
      var it = (doc.items || {})[k];
      if (!it) return;
      map.cards[k].forEach(function (c) { bucket(c).cards.push(it); });
    });
    var out = {};
    Object.keys(ev).forEach(function (c) { out[c] = masteryOf(ev[c], t); });
    return out;
  }

  function hasProgress(doc) {
    doc = doc || {};
    return Object.keys(doc.items || {}).length > 0 || Object.keys(doc.exo || {}).length > 0;
  }

  function dueItems(doc, lessonFilter) {
    var t = now();
    var out = [];
    Object.keys(doc.items).forEach(function (k) {
      var it = doc.items[k];
      if (lessonFilter && it.meta && it.meta.lesson !== lessonFilter) return;
      if (it.due <= t) out.push(k);
    });
    out.sort(function (a, b) { return doc.items[a].due - doc.items[b].due; });
    return out;
  }

  function stats(doc, lessonFilter) {
    var t = now();
    var s = { total: 0, fresh: 0, learning: 0, known: 0, due: 0, reviews: 0 };
    Object.keys(doc.items).forEach(function (k) {
      var it = doc.items[k];
      if (lessonFilter && it.meta && it.meta.lesson !== lessonFilter) return;
      s.total++;
      if (it.st === 0) s.fresh++;
      else if (it.st === 1) s.learning++;
      else s.known++;
      if (it.due <= t) s.due++;
    });
    s.reviews = doc.activity.filter(function (e) { return e.k === 'rev'; }).length;
    return s;
  }

  function streak(doc) {
    var days = {};
    doc.activity.forEach(function (e) {
      var d = new Date(e.t);
      days[d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()] = 1;
    });
    var n = 0;
    var d = new Date();
    for (;;) {
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (days[key]) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }

  function merge(a, b) {
    a = a || emptyDoc();
    b = b || emptyDoc();
    var wiped = Math.max(a.wipedAt || 0, b.wipedAt || 0);
    var out = {
      v: 1,
      created: Math.min(a.created || now(), b.created || now()),
      lastOpen: Math.max(a.lastOpen || 0, b.lastOpen || 0),
      items: {},
      removed: {},
      activity: [],
      priv: {},
      exo: {}
    };
    if (wiped) out.wipedAt = wiped;
    [a, b].forEach(function (d) {
      Object.keys(d.priv || {}).forEach(function (id) {
        var L = d.priv[id];
        if (!L || (wiped && (L.updated || 0) <= wiped)) return;
        var cur = out.priv[id];
        var tu = L.updated || 0, cu = cur ? (cur.updated || 0) : -1;
        if (!cur || tu > cu || (tu === cu && L.deleted && !cur.deleted)) out.priv[id] = L;
      });
    });
    [a, b].forEach(function (d) {
      Object.keys(d.exo || {}).forEach(function (k) {
        var m = mergeAttempts(out.exo[k], d.exo[k], wiped);
        if (m.length) out.exo[k] = m;
        else delete out.exo[k];
      });
    });
    [a, b].forEach(function (d) {
      Object.keys(d.removed || {}).forEach(function (k) {
        var t = d.removed[k] || 0;
        if (t <= wiped) return;
        if (t > (out.removed[k] || 0)) out.removed[k] = t;
      });
    });
    [a, b].forEach(function (d) {
      Object.keys(d.items || {}).forEach(function (k) {
        var it = d.items[k];
        if (wiped && (it.last || 0) <= wiped) return;
        if ((it.last || 0) <= (out.removed[k] || 0)) return;
        if (!out.items[k] || (it.last || 0) > (out.items[k].last || 0)) out.items[k] = it;
      });
    });
    var acts = dedupeActivity((a.activity || []).concat(b.activity || []).filter(function (e) {
      return !wiped || e.t > wiped;
    }));
    acts.sort(function (x, y) { return x.t - y.t; });
    out.activity = acts.slice(-MAX_ACTIVITY);
    backfillExo(out);
    return out;
  }

  function exportJSON(doc) { return JSON.stringify(doc || load(), null, 1); }

  function importJSON(text, doc) {
    var incoming = JSON.parse(text);
    var merged = merge(doc || load(), incoming);
    return save(merged);
  }

  function config() {
    var c = (typeof window !== 'undefined' && window.FR_CONFIG) || {};
    return {
      url: String(c.workerUrl || '').replace(/\/+$/, ''),
      clientId: c.googleClientId || ''
    };
  }

  function b64urlDecode(str) {
    var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    if (typeof atob !== 'function') return '';
    var bin = atob(s);
    try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
  }

  function decodeJwt(token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    try { return JSON.parse(b64urlDecode(parts[1])); } catch (e) { return null; }
  }

  function session() {
    try {
      var raw = (typeof localStorage !== 'undefined') && localStorage.getItem(SESSION_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (!s || !s.idToken) return null;
      return s;
    } catch (e) { return null; }
  }

  function setSession(idToken) {
    var payload = decodeJwt(idToken);
    if (!payload || !payload.sub) return null;
    var s = { idToken: idToken, sub: payload.sub, email: payload.email || '', exp: payload.exp || 0, picture: payload.picture || '' };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function auth() {
    var c = config();
    var s = session();
    if (!c.url || !c.clientId || !s) return null;
    if (s.exp && s.exp * 1000 <= now()) return null;
    return { url: c.url, idToken: s.idToken, email: s.email };
  }

  function renderAccountChip() {
    if (typeof document === 'undefined' || !document.body) return;
    var old = document.getElementById('account-chip');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var c = config();
    var s = session();
    if (!c.url || !c.clientId || !s || (s.exp && s.exp * 1000 <= now())) return;
    var pic = s.picture || (decodeJwt(s.idToken) || {}).picture || '';
    if (!pic) return;
    var a = document.createElement('a');
    a.id = 'account-chip';
    a.href = 'progres.html';
    a.title = 'Compte Google : ' + (s.email || s.sub) + ' — synchronisation des progrès';
    a.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:80;width:34px;height:34px;' +
      'border-radius:50%;border:2px solid #fff;background:#fff;display:block;' +
      'box-shadow:0 3px 12px rgba(20,40,90,.3);';
    var img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;display:block;';
    img.onerror = function () { if (a.parentNode) a.parentNode.removeChild(a); };
    a.appendChild(img);
    img.src = pic;
    document.body.appendChild(a);
  }

  var syncTimer = null;
  var syncing = false;
  var syncQueued = null;

  function setLastSync() {
    try { localStorage.setItem(LAST_KEY, String(now())); } catch (e) {}
  }

  function lastSync() {
    try { return parseInt(localStorage.getItem(LAST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }

  function scheduleSync(doc) {
    if (!auth() || typeof fetch === 'undefined') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { runSync(doc, null); }, 2500);
  }

  function runSync(doc, cb) {
    var a = auth();
    if (!a || typeof fetch === 'undefined') {
      if (cb) cb(doc || load(), null, false);
      return;
    }
    if (syncing) { syncQueued = { doc: doc, cb: cb }; return; }
    syncing = true;
    fetch(a.url + '/progress', { headers: { 'Authorization': 'Bearer ' + a.idToken } })
      .then(function (r) {
        if (r.status === 401) throw { code: 'auth' };
        if (!r.ok) throw { code: 'http' };
        return r.json();
      })
      .then(function (remote) {
        var merged = doc;
        var changed = false;
        var remoteHasData = remote && ((remote.items && Object.keys(remote.items).length) ||
          (remote.priv && Object.keys(remote.priv).length) ||
          (remote.exo && Object.keys(remote.exo).length) ||
          (remote.wipedAt || 0) > ((doc && doc.wipedAt) || 0));
        if (remoteHasData) {
          merged = merge(doc, remote);
          changed = true;
        }
        persist(merged);
        return fetch(a.url + '/progress', {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + a.idToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(merged)
        }).then(function (r2) {
          if (r2.status === 401) throw { code: 'auth' };
          if (!r2.ok) throw { code: 'http' };
          setLastSync();
          finish(merged, cb, null, changed);
        });
      })
      .catch(function (e) { finish(doc, cb, (e && e.code) || 'err', false); });
  }

  function finish(doc, cb, err, changed) {
    syncing = false;
    if (cb) cb(doc, err, changed);
    if (syncQueued) {
      var q = syncQueued;
      syncQueued = null;
      setTimeout(function () { runSync(q.doc, q.cb); }, 300);
    }
  }

  function syncNow(cb) { runSync(load(), cb); }

  function pull(cb) {
    var a = auth();
    if (!a || typeof fetch === 'undefined') { if (cb) cb(null); return; }
    fetch(a.url + '/progress', { headers: { 'Authorization': 'Bearer ' + a.idToken } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (remote) { if (cb) cb(remote); })
      .catch(function () { if (cb) cb(null); });
  }

  function lessonFile() {
    if (typeof location === 'undefined') return 'unknown';
    return (location.pathname.split('/').pop() || 'index.html');
  }

  function sectionOf(el) {
    var s = el.closest ? el.closest('section') : null;
    return s ? s.id : '';
  }

  function itemFromRow(tr, level) {
    var btn = tr.querySelector('.say[data-say]');
    if (!btn) return null;
    var tds = tr.querySelectorAll('td');
    return {
      key: btn.getAttribute('data-say'), type: 'mot',
      term: btn.getAttribute('data-say'),
      gloss: tds[1] ? tds[1].textContent.trim() : '',
      example: btn.getAttribute('data-say2') || (tds[2] ? tds[2].textContent.trim() : ''),
      audio: btn.getAttribute('data-audio') || '',
      level: level || null
    };
  }

  function itemFromCard(card, level) {
    var btn = card.querySelector('.say[data-say]');
    if (!btn) return null;
    var sens = card.querySelector('.sens');
    var usage = card.querySelector('.usage');
    return {
      key: btn.getAttribute('data-say'), type: 'expression',
      term: btn.getAttribute('data-say'),
      gloss: sens ? sens.textContent.trim() : '',
      example: usage ? usage.textContent.trim() : (btn.getAttribute('data-say2') || ''),
      audio: btn.getAttribute('data-audio') || '',
      level: level || null
    };
  }

  function gramText(box) {
    var out = [];
    function push(s) { s = (s || '').replace(/\s+/g, ' ').trim(); if (s) out.push(s); }
    function walk(node) {
      Array.prototype.forEach.call(node.children, function (ch) {
        var tag = ch.tagName;
        if (tag === 'UL' || tag === 'OL') {
          Array.prototype.forEach.call(ch.querySelectorAll('li'), function (li) { push('• ' + li.textContent); });
        } else if (tag === 'TABLE') {
          Array.prototype.forEach.call(ch.querySelectorAll('tr'), function (tr) {
            var cells = Array.prototype.map.call(tr.querySelectorAll('th,td'), function (c) {
              return (c.textContent || '').replace(/\s+/g, ' ').trim();
            }).filter(Boolean);
            if (cells.length) push(cells.join(' — '));
          });
        } else if (tag === 'P' || tag === 'DIV') {
          if (ch.querySelector('p,div,ul,ol,table')) walk(ch);
          else push(ch.textContent);
        } else {
          push(ch.textContent);
        }
      });
    }
    walk(box);
    return out.join('\n');
  }

  function itemFromGram(h3, box, level) {
    var title = (h3.textContent || '').replace(/\s+/g, ' ').trim();
    var label = (title.match(/^(G\d+)/) || [])[1];
    if (!label) return null;
    return {
      key: 'gram:' + (level || '?') + ':' + label, type: 'grammaire',
      term: title,
      gloss: '',
      example: gramText(box),
      audio: '',
      level: level || null
    };
  }

  function itemFromButton(btn) {
    var blk = btn.closest ? btn.closest('[data-lv]') : null;
    var level = blk ? blk.getAttribute('data-lv') : null;
    if (btn.closest('#vocabulaire')) {
      var tr = btn.closest('tr');
      return tr ? itemFromRow(tr, level) : null;
    }
    if (btn.closest('#expressions')) {
      var card = btn.closest('.expr');
      return card ? itemFromCard(card, level) : null;
    }
    return null;
  }

  function elementsOfRoot(blk) {
    var out = [];
    var lv = blk.getAttribute('data-lv');
    var sec = sectionOf(blk);
    if (sec === 'vocabulaire') {
      Array.prototype.forEach.call(blk.querySelectorAll('tr'), function (tr) {
        var it = itemFromRow(tr, lv);
        if (it && it.key) out.push({ item: it, target: tr.querySelector('td') || tr });
      });
    } else if (sec === 'expressions') {
      Array.prototype.forEach.call(blk.querySelectorAll('.expr'), function (card) {
        var it = itemFromCard(card, lv);
        if (it && it.key) out.push({ item: it, target: card.querySelector('.titre-row') || card });
      });
    } else if (sec === 'grammaire') {
      Array.prototype.forEach.call(blk.querySelectorAll('h3'), function (h3) {
        var box = h3.nextElementSibling;
        if (!box || !box.classList || !box.classList.contains('gram-box')) return;
        var it = itemFromGram(h3, box, lv);
        if (it && it.key) out.push({ item: it, target: h3 });
      });
    }
    return out;
  }

  function collectFromRoot(blk) {
    var out = [];
    var seen = {};
    elementsOfRoot(blk).forEach(function (p) {
      if (!seen[p.item.key]) { seen[p.item.key] = 1; out.push(p.item); }
    });
    return out;
  }

  function collectFromDom() {
    var out = [];
    Array.prototype.forEach.call(
      document.querySelectorAll('#vocabulaire [data-lv], #expressions [data-lv], #grammaire [data-lv]'),
      function (blk) {
        if (blk.hidden) return;
        out = out.concat(collectFromRoot(blk));
      });
    return out;
  }

  var STYLE = '.add-deck{background:#fff;border:1.5px solid #c9d6f2;color:#16357a;border-radius:999px;' +
    'padding:.12rem .65rem;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;margin-left:.35rem;' +
    'white-space:nowrap}.add-deck:hover{background:#e8eefb}' +
    '.add-deck:disabled{opacity:.85;cursor:default;background:#f0f7f1;border-color:#bfe0cb;color:#1e7a46}' +
    '.pick{margin-right:.45rem;accent-color:#16357a;cursor:pointer}' +
    '.add-deck-cancel{background:none;border:none;color:#5a6b8c;font:inherit;font-size:.82rem;' +
    'cursor:pointer;text-decoration:underline;margin-left:.4rem}' +
    '.gram-add{margin:.1rem 0 1rem}';

  function initLessonPage() {
    if (typeof document === 'undefined') return;
    var lesson = lessonFile();
    var active = null;

    var st = document.createElement('style');
    st.textContent = STYLE;
    document.head.appendChild(st);

    function addToDeck(list) {
      var doc = load();
      var added = registerItems(doc, lesson, list);
      save(doc);
      return added;
    }

    function inDeck(key) {
      return !!load().items[itemKey(lesson, key)];
    }

    function kindOf(blk) {
      var sec = sectionOf(blk);
      if (sec === 'grammaire') return 'point(s) de grammaire';
      return sec === 'expressions' ? 'expression(s)' : 'mot(s)';
    }

    function remainingIn(blk) {
      return collectFromRoot(blk).filter(function (it) { return !inDeck(it.key); }).length;
    }

    function refreshLabel(blk, btn) {
      if (active && active.blk === blk) return;
      var n = remainingIn(blk);
      if (n === 0) {
        btn.textContent = 'Déjà dans vos révisions';
        btn.disabled = true;
      } else {
        btn.textContent = '+ Ajouter ces ' + n + ' ' + kindOf(blk) + ' à mes révisions';
        btn.disabled = false;
      }
    }

    function exitSelect() {
      if (!active) return;
      var a = active;
      active = null;
      a.rows.forEach(function (r) { if (r.cb.parentNode) r.cb.parentNode.removeChild(r.cb); });
      if (a.cancelBtn.parentNode) a.cancelBtn.parentNode.removeChild(a.cancelBtn);
      refreshLabel(a.blk, a.btn);
    }

    function enterSelect(blk, btn) {
      exitSelect();
      var pairs = elementsOfRoot(blk);
      if (!pairs.length) return;
      var rows = [];
      pairs.forEach(function (p) {
        var exists = inDeck(p.item.key);
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'pick';
        cb.checked = true;
        cb.setAttribute('aria-label', p.item.term);
        if (exists) { cb.disabled = true; cb.title = 'Déjà dans vos révisions'; }
        rows.push({ cb: cb, item: p.item });
        p.target.insertBefore(cb, p.target.firstChild);
      });

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'add-deck-cancel';
      cancelBtn.textContent = 'Annuler';
      cancelBtn.addEventListener('click', function () { exitSelect(); });

      function update() {
        var n = rows.filter(function (r) { return r.cb.checked && !r.cb.disabled; }).length;
        btn.textContent = 'Ajouter la sélection (' + n + ')';
        btn.disabled = n === 0;
      }
      function confirm() {
        var list = rows.filter(function (r) { return r.cb.checked && !r.cb.disabled; })
          .map(function (r) { return r.item; });
        var added = addToDeck(list);
        var rem = remainingIn(blk);
        exitSelect();
        if (rem === 0) {
          btn.textContent = '+' + added + ' carte(s) ajoutée(s) — bonne révision !';
          btn.disabled = true;
        }
      }
      rows.forEach(function (r) { r.cb.addEventListener('change', update); });

      active = { blk: blk, btn: btn, rows: rows, cancelBtn: cancelBtn, update: update, confirm: confirm };
      btn.parentNode.insertBefore(cancelBtn, btn.nextSibling);
      update();
    }

    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.say') : null;
      if (!btn) return;
      var it = itemFromButton(btn);
      if (!it) return;
      addToDeck([it]);
      var blk = btn.closest('[data-lv]');
      if (!blk) return;
      if (active && active.blk === blk) {
        active.rows.forEach(function (r) {
          if (r.item.key === it.key && !r.cb.disabled) {
            r.cb.disabled = true;
            r.cb.title = 'Déjà dans vos révisions';
          }
        });
        active.update();
      } else {
        var bulk = blk.querySelector('.add-deck');
        if (bulk) refreshLabel(blk, bulk);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') exitSelect();
    });

    function injectAddButtons() {
      Array.prototype.forEach.call(
        document.querySelectorAll('#vocabulaire [data-lv], #expressions [data-lv], #grammaire [data-lv]'),
        function (blk) {
          if (blk.hidden) return;
          if (!collectFromRoot(blk).length) return;
          var gram = sectionOf(blk) === 'grammaire';
          var holder;
          if (gram) {
            holder = blk.querySelector('.gram-add');
            if (!holder) {
              holder = document.createElement('div');
              holder.className = 'gram-add';
              blk.insertBefore(holder, blk.firstChild);
            }
          } else {
            holder = blk.querySelector('.lead');
            if (!holder) return;
          }
          if (holder.querySelector('.add-deck')) { refreshLabel(blk, holder.querySelector('.add-deck')); return; }
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'add-deck';
          b.addEventListener('click', function () {
            if (active && active.blk === blk) active.confirm();
            else enterSelect(blk, b);
          });
          if (!gram) holder.appendChild(document.createTextNode(' '));
          holder.appendChild(b);
          refreshLabel(blk, b);
        });
    }
    injectAddButtons();
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'niveau') {
        exitSelect();
        setTimeout(injectAddButtons, 0);
      }
    });

    renderAccountChip();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', function () {
        renderAccountChip();
        if (auth()) runSync(load(), null);
      });
    }

    document.addEventListener('exo-graded', function (e) {
      var d = e.detail || {};
      var doc = load();
      var t = now();
      var entry = { t: t, k: 'exo', lesson: lesson, id: d.id, score: d.score, total: d.total };
      if (d.answered != null) entry.answered = d.answered;
      if (d.almost) entry.almost = d.almost;
      if (d.first != null) entry.first = d.first;
      if (d.firstAlmost) entry.firstAlmost = d.firstAlmost;
      if (d.round) entry.round = d.round;
      if (d.revealed != null) entry.revealed = d.revealed;
      recordActivity(doc, entry);
      recordExo(doc, lesson, d.id, { t: t, score: d.score, total: d.total, almost: d.almost, answered: d.answered,
        first: d.first, firstAlmost: d.firstAlmost, revealed: d.revealed, round: d.round });
      save(doc);
    });
  }

  if (typeof document !== 'undefined' && /^lecon-/.test(lessonFile())) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLessonPage);
    else initLessonPage();
  }

  return {
    KEY: KEY,
    load: load, save: save, emptyDoc: emptyDoc, reset: reset,
    newItem: newItem, grade: grade,
    itemKey: itemKey, registerItems: registerItems,
    privLessonId: privLessonId, isPrivLesson: isPrivLesson, safeUrl: safeUrl,
    privateLessons: privateLessons, savePrivateLesson: savePrivateLesson,
    deletePrivateLesson: deletePrivateLesson, privateCards: privateCards,
    parseCardLines: parseCardLines, addPrivateCards: addPrivateCards, removeItem: removeItem, recordActivity: recordActivity,
    mastery: mastery, hasProgress: hasProgress, MASTERY_LABELS: MASTERY_LABELS,
    exoKey: exoKey, recordExo: recordExo, backfillExo: backfillExo, MAX_EXO: MAX_EXO, EXO_SESSION: EXO_SESSION,
    dueItems: dueItems, stats: stats, streak: streak, merge: merge,
    exportJSON: exportJSON, importJSON: importJSON,
    config: config, session: session, setSession: setSession, clearSession: clearSession,
    auth: auth, decodeJwt: decodeJwt, pull: pull, syncNow: syncNow, lastSync: lastSync,
    itemFromButton: itemFromButton, elementsOfRoot: elementsOfRoot,
    collectFromRoot: collectFromRoot, collectFromDom: collectFromDom,
    initLessonPage: initLessonPage
  };
}));
