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

  function now() { return Date.now(); }

  function emptyDoc() {
    return { v: 1, created: now(), lastOpen: now(), items: {}, removed: {}, activity: [] };
  }

  function load() {
    try {
      var raw = (typeof localStorage !== 'undefined') && localStorage.getItem(KEY);
      var d = raw ? JSON.parse(raw) : emptyDoc();
      if (!d.items) d.items = {};
      if (!d.removed) d.removed = {};
      if (!d.activity) d.activity = [];
      var clean = dedupeActivity(d.activity);
      if (clean.length !== d.activity.length) d.activity = clean;
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
      activity: []
    };
    if (wiped) out.wipedAt = wiped;
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
    load: load, save: save, emptyDoc: emptyDoc, reset: reset,
    newItem: newItem, grade: grade,
    itemKey: itemKey, registerItems: registerItems, removeItem: removeItem, recordActivity: recordActivity,
    dueItems: dueItems, stats: stats, streak: streak, merge: merge,
    exportJSON: exportJSON, importJSON: importJSON,
    config: config, session: session, setSession: setSession, clearSession: clearSession,
    auth: auth, decodeJwt: decodeJwt, pull: pull, syncNow: syncNow, lastSync: lastSync,
    itemFromButton: itemFromButton, elementsOfRoot: elementsOfRoot,
    collectFromRoot: collectFromRoot, collectFromDom: collectFromDom,
    initLessonPage: initLessonPage
  };
}));
