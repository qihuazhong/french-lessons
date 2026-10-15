(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SRS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'fr-lessons-progress-v1';
  var SYNC_KEY = 'fr-lessons-sync';
  var DAY = 86400000;
  var MIN = 60000;
  var MAX_ACTIVITY = 800;

  function now() { return Date.now(); }

  function emptyDoc() {
    return { v: 1, created: now(), lastOpen: now(), items: {}, activity: [] };
  }

  function load() {
    try {
      var raw = (typeof localStorage !== 'undefined') && localStorage.getItem(KEY);
      var d = raw ? JSON.parse(raw) : emptyDoc();
      if (!d.items) d.items = {};
      if (!d.activity) d.activity = [];
      d.v = 1;
      return d;
    } catch (e) {
      return emptyDoc();
    }
  }

  function save(doc) {
    doc.lastOpen = now();
    try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) {}
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

  function registerItems(doc, lesson, list) {
    var added = 0;
    list.forEach(function (it) {
      var k = itemKey(lesson, it.key);
      if (!doc.items[k]) {
        doc.items[k] = newItem({
          lesson: lesson, key: it.key, type: it.type, term: it.term,
          gloss: it.gloss, example: it.example, audio: it.audio, level: it.level
        });
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

  function recordActivity(doc, entry) {
    if (entry.t == null) entry.t = now();
    doc.activity.push(entry);
    if (doc.activity.length > MAX_ACTIVITY) doc.activity = doc.activity.slice(-MAX_ACTIVITY);
    return doc;
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
    var out = {
      v: 1,
      created: Math.min(a.created || now(), b.created || now()),
      lastOpen: Math.max(a.lastOpen || 0, b.lastOpen || 0),
      items: {},
      activity: []
    };
    [a, b].forEach(function (d) {
      Object.keys(d.items || {}).forEach(function (k) {
        var it = d.items[k];
        if (!out.items[k] || (it.last || 0) > (out.items[k].last || 0)) out.items[k] = it;
      });
    });
    var acts = (a.activity || []).concat(b.activity || []);
    acts.sort(function (x, y) { return x.t - y.t; });
    out.activity = acts.slice(-MAX_ACTIVITY);
    return out;
  }

  function exportJSON(doc) { return JSON.stringify(doc || load(), null, 1); }

  function importJSON(text, doc) {
    var incoming = JSON.parse(text);
    var merged = merge(doc || load(), incoming);
    return save(merged);
  }

  function syncCfg() {
    try {
      var raw = (typeof localStorage !== 'undefined') && localStorage.getItem(SYNC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setSync(url, token) {
    if (typeof localStorage === 'undefined') return;
    if (url && token) localStorage.setItem(SYNC_KEY, JSON.stringify({ url: url.replace(/\/+$/, ''), token: token }));
    else localStorage.removeItem(SYNC_KEY);
  }

  var syncTimer = null;
  function scheduleSync(doc) {
    var cfg = syncCfg();
    if (!cfg || !cfg.url || !cfg.token || typeof fetch === 'undefined') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      fetch(cfg.url + '/progress', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      }).catch(function () {});
    }, 2500);
  }

  function pull(cb) {
    var cfg = syncCfg();
    if (!cfg || !cfg.url || !cfg.token || typeof fetch === 'undefined') { if (cb) cb(null); return; }
    fetch(cfg.url + '/progress', { headers: { 'Authorization': 'Bearer ' + cfg.token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (remote) { if (cb) cb(remote); })
      .catch(function () { if (cb) cb(null); });
  }

  function lessonFile() {
    if (typeof location === 'undefined') return 'unknown';
    return (location.pathname.split('/').pop() || 'index.html');
  }

  function collectFromDom() {
    var out = [];
    var seen = {};
    function push(it) {
      if (!it.key || seen[it.key]) return;
      seen[it.key] = 1;
      out.push(it);
    }
    Array.prototype.forEach.call(document.querySelectorAll('#vocabulaire [data-lv]'), function (blk) {
      if (blk.hidden) return;
      Array.prototype.forEach.call(blk.querySelectorAll('tr'), function (tr) {
        var btn = tr.querySelector('.say[data-say]');
        if (!btn) return;
        var tds = tr.querySelectorAll('td');
        push({
          key: btn.getAttribute('data-say'), type: 'mot',
          term: btn.getAttribute('data-say'),
          gloss: tds[1] ? tds[1].textContent.trim() : '',
          example: btn.getAttribute('data-say2') || (tds[2] ? tds[2].textContent.trim() : ''),
          audio: btn.getAttribute('data-audio') || '',
          level: blk.getAttribute('data-lv')
        });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#expressions [data-lv]'), function (blk) {
      if (blk.hidden) return;
      Array.prototype.forEach.call(blk.querySelectorAll('.expr'), function (card) {
        var btn = card.querySelector('.say[data-say]');
        if (!btn) return;
        var usage = card.querySelector('.usage');
        push({
          key: btn.getAttribute('data-say'), type: 'expression',
          term: btn.getAttribute('data-say'),
          gloss: (card.querySelector('.sens') || {}).textContent ? card.querySelector('.sens').textContent.trim() : '',
          example: usage ? usage.textContent.trim() : (btn.getAttribute('data-say2') || ''),
          audio: btn.getAttribute('data-audio') || '',
          level: blk.getAttribute('data-lv')
        });
      });
    });
    return out;
  }

  function initLessonPage() {
    if (typeof document === 'undefined') return;
    var lesson = lessonFile();
    function ingest() {
      var doc = load();
      registerItems(doc, lesson, collectFromDom());
      save(doc);
    }
    ingest();
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'niveau') ingest();
    });
    document.addEventListener('exo-graded', function (e) {
      var d = e.detail || {};
      var doc = load();
      recordActivity(doc, { k: 'exo', lesson: lesson, id: d.id, score: d.score, total: d.total });
      save(doc);
    });
  }

  if (typeof document !== 'undefined' && /^lecon-/.test(lessonFile())) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLessonPage);
    else initLessonPage();
  }

  return {
    KEY: KEY,
    load: load, save: save, emptyDoc: emptyDoc,
    newItem: newItem, grade: grade,
    itemKey: itemKey, registerItems: registerItems, recordActivity: recordActivity,
    dueItems: dueItems, stats: stats, streak: streak, merge: merge,
    exportJSON: exportJSON, importJSON: importJSON,
    syncCfg: syncCfg, setSync: setSync, pull: pull,
    collectFromDom: collectFromDom, initLessonPage: initLessonPage
  };
}));
