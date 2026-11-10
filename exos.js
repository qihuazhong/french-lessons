(function () {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\u2019\u2018\u02bc]/g, "'")
      .replace(/[\u2010\u2011\u2012\u2013\u2014-]/g, ' ')
      .replace(/[.,!?;:«»"“”()[\]{}…]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function deacc(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function compactify(s) {
    return deacc(s).replace(/['\s]/g, '');
  }

  function verdict(given, accepted) {
    var g = norm(given);
    var i;
    if (!g) return { state: 'ko', correct: accepted[0] || '' };
    for (i = 0; i < accepted.length; i++) {
      if (g === norm(accepted[i])) return { state: 'ok', correct: accepted[i] };
    }
    var gd = deacc(g);
    for (i = 0; i < accepted.length; i++) {
      if (gd === deacc(norm(accepted[i]))) return { state: 'almost', correct: accepted[i] };
    }
    var gc = compactify(g);
    for (i = 0; i < accepted.length; i++) {
      if (gc === compactify(norm(accepted[i]))) return { state: 'almost', correct: accepted[i] };
    }
    return { state: 'ko', correct: accepted[0] || '' };
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function shuffle(a) {
    var i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function range(n) {
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    return a;
  }

  function actions(root, onCheck, onReset) {
    var bar = el('div', 'exo-actions');
    var check = el('button', 'exo-btn check', 'Corriger');
    var reset = el('button', 'exo-btn reset', 'Recommencer');
    var score = el('span', 'exo-score', '');
    check.type = 'button';
    reset.type = 'button';
    check.addEventListener('click', onCheck);
    reset.addEventListener('click', onReset);
    bar.appendChild(check);
    bar.appendChild(reset);
    bar.appendChild(score);
    root.appendChild(bar);
    return { check: check, reset: reset, score: score };
  }

  // A "round" = one pass at one exercise block: from render (page load) or
  // « Recommencer » to the next reset. `first` = items right on the first try
  // in this round (an item's verdict is fixed the first time its answer is
  // revealed), so peeking at corrections cannot raise it. `revealed` = items
  // whose verdict is fixed: fill/match reveal every item on the first check
  // (blanks count as wrong), choice reveals one item per selection.
  var PAGE_ID = Date.now().toString(36);
  var roundSeq = 0;
  function newRound() { roundSeq++; return PAGE_ID + '-' + roundSeq; }

  function report(scoreEl, spec, ok, total, almost, open, x) {
    x = x || {};
    var txt = 'Score : ' + ok + '/' + total;
    if (almost > 0) txt += ' · ' + almost + ' presque (orthographe)';
    if (open > 0) txt += ' · +' + open + ' à comparer';
    if (total > 0 && ok === total && almost === 0) txt += ' — parfait !';
    scoreEl.textContent = txt;
    scoreEl.className = 'exo-score ' + (total > 0 && ok === total ? 'good' : 'bad');
    try {
      document.dispatchEvent(new CustomEvent('exo-graded', {
        detail: { id: spec.id || null, type: spec.type, score: ok, total: total, almost: almost,
                  answered: x.answered == null ? total : x.answered,
                  first: x.first == null ? ok : x.first, firstAlmost: x.firstAlmost || 0,
                  revealed: x.revealed == null ? total : x.revealed,
                  round: x.round || null }
      }));
    } catch (e) {}
  }

  function head(root, spec) {
    root.appendChild(el('div', 'exo-head', spec.title || 'Exercice'));
    if (spec.instructions) root.appendChild(el('span', 'exo-instr', spec.instructions));
  }

  function renderMatch(root, spec) {
    head(root, spec);
    var pairs = spec.pairs;
    var n = pairs.length;
    var order = shuffle(range(n));
    var assign = {};
    var pairList = [];
    var pending = null;
    var locked = false;
    var wrap = el('div', 'exo-match');
    var colL = el('div', 'm-col');
    var colR = el('div', 'm-col');
    var items = { L: [], R: [] };
    var hints = {};
    var round = newRound();

    function numberFor(li) {
      return pairList.indexOf(li) + 1;
    }

    function paint() {
      var li, k;
      for (li = 0; li < n; li++) {
        var L = items.L[li];
        L.classList.toggle('pend', !!(pending && pending.side === 'L' && pending.i === li));
        if (assign[li] != null) {
          L.dataset.pair = String(numberFor(li));
        } else {
          delete L.dataset.pair;
        }
        L.querySelector('.pair').textContent = assign[li] != null ? String(numberFor(li)) : '';
      }
      for (k = 0; k < n; k++) {
        var R = items.R[k];
        var pk = order[k];
        var owner = null, i;
        for (i = 0; i < n; i++) {
          if (assign[i] === pk) { owner = i; break; }
        }
        R.classList.toggle('pend', !!(pending && pending.side === 'R' && pending.i === pk));
        if (owner != null) {
          R.dataset.pair = String(numberFor(owner));
        } else {
          delete R.dataset.pair;
        }
        R.querySelector('.pair').textContent = owner != null ? String(numberFor(owner)) : '';
      }
    }

    function unpairByLeft(li) {
      delete assign[li];
      var ix = pairList.indexOf(li);
      if (ix >= 0) pairList.splice(ix, 1);
    }

    function click(side, idx) {
      if (locked) return;
      if (side === 'L' && assign[idx] != null) {
        unpairByLeft(idx);
        pending = { side: 'L', i: idx };
        paint();
        return;
      }
      if (side === 'R') {
        var i;
        for (i = 0; i < n; i++) {
          if (assign[i] === idx) {
            unpairByLeft(i);
            pending = { side: 'R', i: idx };
            paint();
            return;
          }
        }
      }
      if (!pending) {
        pending = { side: side, i: idx };
      } else if (pending.side === side) {
        pending = { side: side, i: idx };
      } else {
        var l = side === 'L' ? idx : pending.i;
        var r = side === 'R' ? idx : pending.i;
        var j;
        for (j = 0; j < n; j++) {
          if (assign[j] === r) unpairByLeft(j);
        }
        if (assign[l] != null) unpairByLeft(l);
        assign[l] = r;
        pairList.push(l);
        pending = null;
      }
      paint();
    }

    var li, k;
    for (li = 0; li < n; li++) {
      (function (idx) {
        var b = el('button', 'm-item', pairs[idx].left);
        b.type = 'button';
        b.appendChild(el('span', 'pair', ''));
        b.appendChild(el('span', 'hint', ''));
        b.addEventListener('click', function () { click('L', idx); });
        items.L.push(b);
        colL.appendChild(b);
      })(li);
    }
    for (k = 0; k < n; k++) {
      (function (idx) {
        var b = el('button', 'm-item', pairs[idx].right);
        b.type = 'button';
        b.appendChild(el('span', 'pair', ''));
        b.addEventListener('click', function () { click('R', idx); });
        items.R.push(b);
        colR.appendChild(b);
      })(order[k]);
    }
    wrap.appendChild(colL);
    wrap.appendChild(colR);
    root.appendChild(wrap);

    var ui = actions(root, onCheck, onReset);

    function onCheck() {
      if (locked) return;
      locked = true;
      var ok = 0, i;
      for (i = 0; i < n; i++) {
        var L = items.L[i], R;
        var good = assign[i] === i;
        L.classList.add(good ? 'ok' : 'ko');
        if (good) ok++;
        else {
          var hint = L.querySelector('.hint');
          hint.textContent = '→ ' + pairs[i].right;
        }
      }
      for (i = 0; i < n; i++) {
        var pk = order[i];
        var owner = null, j;
        for (j = 0; j < n; j++) {
          if (assign[j] === pk) { owner = j; break; }
        }
        items.R[i].classList.add(owner === pk ? 'ok' : 'ko');
      }
      // locked after a check until « Recommencer » → this check is the first try of the round
      report(ui.score, spec, ok, n, 0, 0, { answered: Object.keys(assign).length, first: ok, revealed: n, round: round });
    }

    function onReset() {
      locked = false;
      round = newRound();
      assign = {};
      pairList = [];
      pending = null;
      var i;
      for (i = 0; i < n; i++) {
        items.L[i].classList.remove('ok', 'ko', 'pend');
        items.R[i].classList.remove('ok', 'ko', 'pend');
        items.L[i].querySelector('.hint').textContent = '';
      }
      ui.score.textContent = '';
      ui.score.className = 'exo-score';
      paint();
    }

    paint();
  }

  function renderFill(root, spec) {
    var fillRound = newRound();
    head(root, spec);
    var items = [];
    var body = el('div', 'exo-fill');

    spec.items.forEach(function (it) {
      var row = el('div', 'exo-item');
      var prompt = el('p', 'exo-prompt');
      var input;
      var accepted = it.answers || [];
      var longest = 0, i;
      for (i = 0; i < accepted.length; i++) {
        longest = Math.max(longest, accepted[i].length);
      }
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'exo-input';
      input.autocapitalize = 'none';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Votre réponse');
      input.size = Math.min(Math.max(9, longest + 2), 70);
      if (it.prompt.indexOf('___') >= 0) {
        var parts = it.prompt.split('___');
        prompt.appendChild(document.createTextNode(parts[0]));
        prompt.appendChild(input);
        prompt.appendChild(document.createTextNode(parts.slice(1).join('___')));
      } else {
        prompt.textContent = it.prompt;
        row.appendChild(prompt);
        var ind = el('div', '');
        ind.appendChild(input);
        row.appendChild(ind);
      }
      if (it.prompt.indexOf('___') >= 0) row.appendChild(prompt);
      var fb = el('div', 'exo-fb', '');
      row.appendChild(fb);
      body.appendChild(row);
      var rec = { row: row, prompt: prompt, input: input, fb: fb, spec: it, accepted: accepted };
      items.push(rec);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); onCheck(); }
      });
    });

    root.appendChild(body);
    var ui = actions(root, onCheck, onReset);

    function onCheck() {
      var ok = 0, almost = 0, open = 0, graded = 0, answered = 0, first = 0, firstAlmost = 0;
      items.forEach(function (rec) {
        rec.row.classList.remove('ok', 'almost', 'ko', 'info');
        var v = verdict(rec.input.value, rec.accepted.length ? rec.accepted : ['']);
        if (rec.spec.open) {
          if (norm(rec.input.value)) {
            open++;
            rec.row.classList.add('info');
            rec.fb.textContent = 'À comparer — exemples : ' + rec.accepted.join(' / ');
          } else {
            rec.row.classList.add('ko');
            rec.fb.textContent = 'Réponse attendue (exemple) : ' + rec.accepted[0];
          }
          return;
        }
        graded++;
        if (norm(rec.input.value)) answered++;
        if (rec.first == null) rec.first = v.state; // every row's answer is shown now
        if (rec.first === 'ok') first++;
        else if (rec.first === 'almost') firstAlmost++;
        if (v.state === 'ok') {
          ok++;
          rec.row.classList.add('ok');
          rec.fb.textContent = 'Correct !';
        } else if (v.state === 'almost') {
          almost++;
          rec.row.classList.add('almost');
          rec.fb.textContent = 'Presque ! Vérifiez l\'orthographe (accents, apostrophes…) : ' + v.correct;
        } else {
          rec.row.classList.add('ko');
          rec.fb.textContent = rec.input.value.trim() ? '→ ' + v.correct : '→ ' + v.correct;
        }
      });
      report(ui.score, spec, ok, graded, almost, open,
        { answered: answered, first: first, firstAlmost: firstAlmost, revealed: graded, round: fillRound });
    }

    function onReset() {
      fillRound = newRound();
      items.forEach(function (rec) {
        rec.first = null;
        rec.input.value = '';
        rec.row.classList.remove('ok', 'almost', 'ko', 'info');
        rec.fb.textContent = '';
      });
      ui.score.textContent = '';
      ui.score.className = 'exo-score';
      if (items[0]) items[0].input.focus();
    }
  }

  function renderChoice(root, spec) {
    var choiceRound = newRound();
    head(root, spec);
    var items = [];
    var body = el('div', 'exo-choice');

    spec.items.forEach(function (it) {
      var row = el('div', 'exo-item');
      var prompt = el('p', 'exo-prompt');
      var sel = document.createElement('select');
      sel.className = 'exo-select';
      sel.setAttribute('aria-label', 'Choisissez la réponse');
      var ph = document.createElement('option');
      ph.value = '';
      ph.disabled = true;
      ph.selected = true;
      ph.textContent = '…';
      sel.appendChild(ph);
      var opts = it.options || spec.options || [];
      opts.forEach(function (o) {
        var g = document.createElement('option');
        g.value = o;
        g.textContent = o;
        sel.appendChild(g);
      });
      var parts = it.prompt.split('___');
      prompt.appendChild(document.createTextNode(parts[0]));
      prompt.appendChild(sel);
      prompt.appendChild(document.createTextNode(parts.slice(1).join('___')));
      row.appendChild(prompt);
      var fb = el('div', 'exo-fb', '');
      row.appendChild(fb);
      body.appendChild(row);
      var rec = { row: row, sel: sel, fb: fb, spec: it, correct: it.correct || [] };
      items.push(rec);
      sel.addEventListener('change', onCheck);
    });

    root.appendChild(body);
    var ui = actions(root, onCheck, onReset);

    function onCheck() {
      var ok = 0, answered = 0, first = 0, revealed = 0;
      items.forEach(function (rec) {
        rec.row.classList.remove('ok', 'ko');
        var v = rec.sel.value;
        if (v) answered++;
        if (v && rec.first == null) rec.first = rec.correct.indexOf(v) >= 0 ? 1 : 0; // revealed now
        if (rec.first === 1) first++;
        if (rec.first != null) revealed++;
        if (!v) {
          rec.fb.textContent = '';
          return;
        }
        if (rec.correct.indexOf(v) >= 0) {
          ok++;
          rec.row.classList.add('ok');
          rec.fb.textContent = 'Correct !';
        } else {
          rec.row.classList.add('ko');
          rec.fb.textContent = '→ ' + rec.correct[0];
        }
      });
      report(ui.score, spec, ok, items.length, 0, 0, { answered: answered, first: first, revealed: revealed, round: choiceRound });
    }

    function onReset() {
      choiceRound = newRound();
      items.forEach(function (rec) {
        rec.first = null;
        rec.sel.selectedIndex = 0;
        rec.row.classList.remove('ok', 'ko');
        rec.fb.textContent = '';
      });
      ui.score.textContent = '';
      ui.score.className = 'exo-score';
    }
  }

  function render(node, spec) {
    var s = node.querySelector('script[type="application/json"]');
    if (s) s.remove();
    if (spec.type === 'match') renderMatch(node, spec);
    else if (spec.type === 'fill') renderFill(node, spec);
    else if (spec.type === 'choice') renderChoice(node, spec);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.exo'), function (node) {
      var s = node.querySelector('script[type="application/json"]');
      if (!s) return;
      var spec;
      try {
        spec = JSON.parse(s.textContent);
      } catch (e) {
        node.textContent = 'Exercice illisible (JSON invalide).';
        return;
      }
      render(node, spec);
    });
  }

  window.EXOS = { version: '1.0' };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
