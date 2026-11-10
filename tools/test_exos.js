// Functional smoke test for the shared interactive-exercise component (exos.js).
// Run from anywhere:  cd tools && npm i jsdom && node test_exos.js
// (jsdom is only needed for this test, never for the site itself.)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const PROJ = path.resolve(__dirname, '..');
const engine = fs.readFileSync(PROJ + '/exos.js', 'utf8');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  pass:', msg); }
  else { failed++; console.log('  FAIL:', msg); }
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function load(page) {
  let html = fs.readFileSync(PROJ + '/' + page, 'utf8');
  if (!html.includes('<script src="exos.js"></script>')) throw new Error('engine tag not found in ' + page);
  html = html.replace('<script src="exos.js"></script>', '<script>' + engine + '</script>');
  return new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/' + page, pretendToBeVisual: true });
}

function exos(doc) {
  return Array.from(doc.querySelectorAll('.exo'));
}
function click(el) { el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true })); }
function change(el) { el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true })); }

async function testOpinions() {
  console.log('== lecon-opinions-impopulaires.html');
  const dom = await load('lecon-opinions-impopulaires.html');
  await delay(80);
  const doc = dom.window.document;
  const blocks = exos(doc);
  ok(blocks.length === 8, '8 exercices rendus');
  ok(blocks.every(b => b.querySelector('script[type="application/json"]') === null), 'les specs JSON ont été consommées');
  ok(blocks.every(b => b.querySelector('.exo-actions')), 'chaque exercice a Corriger/Recommencer');

  const choice = blocks[0];
  const selects = choice.querySelectorAll('.exo-select');
  const answers = ["je déteste", "j'adore", "je n'aime pas", "j'adore", "je n'aime pas"];
  const events = [];
  doc.addEventListener('exo-graded', e => events.push(e.detail));
  answers.forEach((a, i) => { selects[i].value = a; change(selects[i]); });
  ok(events.length === 5 && events[0].answered === 1 && events[4].answered === 5 && events[4].total === 5,
    'choix : chaque changement émet exo-graded avec « answered » (1 → 5 sur 5)');
  click(choice.querySelector('.exo-btn.check'));
  ok(/\b5\/5\b/.test(choice.querySelector('.exo-score').textContent), 'choix : 5/5 (' + choice.querySelector('.exo-score').textContent + ')');

  selects[1].value = 'j\'aime bien'; change(selects[1]);
  ok(/\b4\/5\b/.test(choice.querySelector('.exo-score').textContent), 'choix : 4/5 après erreur');
  ok(choice.querySelectorAll('.exo-item')[1].className.includes('ko'), 'item erroné marqué ko');
  ok(/→ j'adore/.test(choice.querySelectorAll('.exo-item')[1].querySelector('.exo-fb').textContent), 'réponse correcte affichée');
  click(choice.querySelector('.exo-btn.reset'));
  ok(selects[1].value === '' && choice.querySelector('.exo-score').textContent === '', 'reset du choix');

  const match = blocks[1];
  const pairs = [
    ['sympa', 'Agréable, gentil, cool'],
    ['moche', 'Pas beau'],
    ['la honte', 'Un sentiment de gêne, d\'embarras'],
    ['un passant', 'Une personne qui marche dans la rue'],
    ['avoir peur', 'Ne pas se sentir rassuré'],
    ['la salle de sport', 'Le lieu où l\'on fait du sport']
  ];
  const cols = match.querySelectorAll('.m-col');
  const L = cols[0].querySelectorAll('.m-item');
  const R = cols[1].querySelectorAll('.m-item');
  pairs.forEach((p, i) => {
    click(L[i]);
    let t = null;
    R.forEach(r => { if (r.textContent.trim() === p[1]) t = r; });
    if (!t) throw new Error('not found: ' + p[1]);
    click(t);
  });
  ok(Array.from(L).every(l => l.dataset.pair), 'toutes les paires associées');
  click(match.querySelector('.exo-btn.check'));
  ok(/\b6\/6\b/.test(match.querySelector('.exo-score').textContent), 'match : 6/6');
  click(match.querySelector('.exo-btn.reset'));
  ok(Array.from(L).every(l => !l.dataset.pair), 'reset du match');

  const wrongR = Array.from(R).find(r => r.textContent.trim() !== pairs[0][1]);
  click(L[0]);
  click(wrongR);
  click(match.querySelector('.exo-btn.check'));
  ok(/\b0\/6\b/.test(match.querySelector('.exo-score').textContent), 'match faux : 0/6');
  ok(/→ /.test(L[0].querySelector('.hint').textContent), 'indice affiché sur paire fausse');

  const fill = blocks[2];
  const inputs = fill.querySelectorAll('.exo-input');
  inputs[0].value = "J'aime pas la salle de sport.";
  inputs[1].value = 'on a pas conscience de ca';
  inputs[2].value = 'nimporte quoi';
  inputs[3].value = "J'aime pas avoir peur.";
  click(fill.querySelector('.exo-btn.check'));
  const cls = i => fill.querySelectorAll('.exo-item')[i].className;
  const fb = i => fill.querySelectorAll('.exo-item')[i].querySelector('.exo-fb').textContent;
  ok(cls(0).includes('ok'), 'fill : réponse exacte → ok');
  ok(cls(1).includes('almost') && /accents/.test(fb(1)), 'fill : sans accents → presque');
  ok(cls(2).includes('ko') && /C'est pas mon truc/.test(fb(2)), 'fill : faux → réponse affichée');
  ok(/2\/4/.test(fill.querySelector('.exo-score').textContent) && /presque/.test(fill.querySelector('.exo-score').textContent),
     'fill : score 2/4 + presque (' + fill.querySelector('.exo-score').textContent + ')');
  click(fill.querySelector('.exo-btn.reset'));
  ok(inputs[0].value === '' && !cls(0).includes('ok'), 'reset du fill');

  dom.window.close();
}

async function testPeek() {
  console.log('== premier essai : regarder la correction ne fait pas monter « first »');
  const dom = await load('lecon-ai.html');
  await delay(80);
  const doc = dom.window.document;
  const blocks = exos(doc);
  const events = [];
  doc.addEventListener('exo-graded', e => events.push(e.detail));
  const lastEv = () => events[events.length - 1];

  // choix : item faux → réponse affichée → on corrige → on complète juste
  const ch = blocks.find(b => /en ou y/.test(b.querySelector('.exo-head').textContent));
  const sels = [...ch.querySelectorAll('.exo-select')];
  const wrongOpt = s => [...s.options].find(o => o.value && !/Correct/.test((() => { s.value = o.value; change(s); return s.closest('.exo-item').querySelector('.exo-fb').textContent; })()));
  const rightOf = s => (s.closest('.exo-item').querySelector('.exo-fb').textContent.match(/→ (.*)$/) || [])[1];
  wrongOpt(sels[0]);
  const ans0 = rightOf(sels[0]);
  sels[0].value = ans0; change(sels[0]);
  sels.slice(1).forEach(s => {
    for (const o of s.options) { if (!o.value) continue; s.value = o.value; change(s); if (/Correct/.test(s.closest('.exo-item').querySelector('.exo-fb').textContent)) break; }
  });
  const ce = lastEv();
  ok(ce.score === ce.total && ce.revealed === ce.total && ce.first < ce.total && ce.round,
    'choix : affichage ' + ce.score + '/' + ce.total + ', premier essai ' + ce.first + ' (essais successifs non crédités)');

  // texte : vérifier à vide → recopier les corrections → vérifier
  const fill = blocks.find(b => /gérondif/i.test(b.querySelector('.exo-head').textContent));
  const n0 = events.length;
  click(fill.querySelector('.exo-btn.check'));
  const blank = events[n0];
  ok(blank.first === 0 && blank.revealed === blank.total && blank.answered === 0, 'texte vérifié à vide : tout est dévoilé, premier essai 0');
  [...fill.querySelectorAll('.exo-item')].forEach(it => {
    const m = it.querySelector('.exo-fb').textContent.match(/→ (.*)$/);
    if (m) it.querySelector('input').value = m[1];
  });
  click(fill.querySelector('.exo-btn.check'));
  const copied = lastEv();
  ok(copied.score === copied.total && copied.first === 0 && copied.round === blank.round, 'texte : correction recopiée → affichage ' + copied.score + '/' + copied.total + ', premier essai toujours 0');
  click(fill.querySelector('.exo-btn.reset'));
  click(fill.querySelector('.exo-btn.check'));
  ok(lastEv().round !== blank.round, '« Recommencer » ouvre un nouveau round');

  // association : vérifier sans rien relier → indices affichés, verrouillé jusqu'à « Recommencer »
  const match = blocks[0];
  const n1 = events.length;
  click(match.querySelector('.exo-btn.check'));
  ok(events[n1].first === 0 && events[n1].revealed === events[n1].total, 'association vérifiée à vide : premier essai 0, tout dévoilé');
  click(match.querySelector('.exo-btn.check'));
  ok(events.length === n1 + 1, 'association verrouillée après correction (pas de second essai sans « Recommencer »)');
  dom.window.close();
}

async function testAi() {
  console.log('== lecon-ai.html');
  const dom = await load('lecon-ai.html');
  await delay(80);
  const doc = dom.window.document;
  const blocks = exos(doc);
  ok(blocks.length === 9, '9 exercices rendus');

  const match = blocks[0];
  const cols = match.querySelectorAll('.m-col');
  const L = cols[0].querySelectorAll('.m-item');
  const R = cols[1].querySelectorAll('.m-item');
  const want = ['Une technologie qui apprend et répond, comme ChatGPT', 'Le travail donné par les profs à faire à la maison', 'Qui ne coûte rien', 'Qui fait peur', 'Un programme sur un ordinateur', 'Instagram, TikTok, X…'];
  L.forEach((l, i) => {
    click(l);
    let t = null;
    R.forEach(r => { if (r.textContent.trim() === want[i]) t = r; });
    click(t);
  });
  click(match.querySelector('.exo-btn.check'));
  ok(/\b6\/6\b/.test(match.querySelector('.exo-score').textContent), 'match IA : 6/6');

  const b1choice = blocks.find(b => /en ou y/.test(b.querySelector('.exo-head').textContent));
  const selects = b1choice.querySelectorAll('.exo-select');
  ['en', 'en', 'y', 'y', 'en'].forEach((a, i) => { selects[i].value = a; change(selects[i]); });
  ok(/\b5\/5\b/.test(b1choice.querySelector('.exo-score').textContent), 'en/y : 5/5 live');

  const est = blocks.find(b => /est-ce que/.test(b.querySelector('.exo-head').textContent));
  est.querySelector('.exo-input').value = 'Est ce que vous utilisez lIA ?';
  click(est.querySelector('.exo-btn.check'));
  ok(est.querySelector('.exo-item').className.includes('almost'), 'apostrophe/hyphen friendly → presque (accents)');

  const b2 = blocks.find(b => /Probabilité/.test(b.querySelector('.exo-head').textContent));
  const inputs = b2.querySelectorAll('.exo-input');
  inputs[0].value = 'doit';
  inputs[1].value = 'doit y avoir';
  inputs[2].value = 'sur le point de';
  inputs[3].value = 'Il me semble que l\'IA est dangereuse.';
  click(b2.querySelector('.exo-btn.check'));
  ok(b2.querySelectorAll('.exo-item')[3].className.includes('info'), 'item ouvert → à comparer');
  ok(/3\/3/.test(b2.querySelector('.exo-score').textContent) && /à comparer/.test(b2.querySelector('.exo-score').textContent),
     'score 3/3 + 1 à comparer (' + b2.querySelector('.exo-score').textContent + ')');

  dom.window.close();
}

(async function () {
  await testOpinions();
  await testAi();
  await testPeek();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
