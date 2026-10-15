// Tests for srs.js (scheduler + lesson-page wiring) and progres.html (jsdom).
// Run:  cd tools && npm i jsdom && node test_srs.js
const path = require('path');
const fs = require('fs');
const PROJ = path.resolve(__dirname, '..');
const SRS = require(path.join(PROJ, 'srs.js'));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  pass:', msg); }
  else { failed++; console.log('  FAIL:', msg); }
}
const DAY = 86400000, MIN = 60000;

console.log('== srs.js scheduler');
let it = SRS.newItem({});
SRS.grade(it, 2, 1000);
ok(it.st === 2 && it.due === 1000 + DAY && it.reps === 1, 'nouveau + Bien → révision à 1 jour');
it = SRS.newItem({});
SRS.grade(it, 0, 0);
ok(it.st === 1 && it.due === 10 * MIN, 'nouveau + Encore → apprentissage 10 min');
it = SRS.newItem({});
SRS.grade(it, 2, 0);
const ivl1 = it.ivl;
SRS.grade(it, 2, 0);
ok(it.ivl > ivl1 && it.st === 2, 'révision + Bien → intervalle qui grandit (' + ivl1 + ' → ' + it.ivl + ')');
it = SRS.newItem({});
SRS.grade(it, 2, 0); SRS.grade(it, 0, 0);
ok(it.st === 1 && it.lapses === 1 && it.ease < 2.5, 'Encore sur révision → lapses + ease qui baisse');
it = SRS.newItem({});
SRS.grade(it, 3, 0);
ok(it.ivl === 4, 'nouveau + Facile → 4 jours');

console.log('== doc operations');
let a = SRS.emptyDoc();
SRS.registerItems(a, 'lecon-x.html', [{ key: 'un truc', type: 'mot', term: 'un truc', gloss: 'a thing' }]);
SRS.registerItems(a, 'lecon-x.html', [{ key: 'un truc', type: 'mot', term: 'un truc', gloss: 'a thing' }]);
ok(Object.keys(a.items).length === 1, 'registerItems idempotent');
ok(SRS.dueItems(a).length === 1, 'les nouveaux sont dus immédiatement');
SRS.grade(a.items['lecon-x.html|un truc'], 2, 0);
ok(SRS.dueItems(a, 'lecon-y.html').length === 0, 'filtre par leçon');
ok(SRS.stats(a, 'lecon-x.html').known === 1, 'stats.known après un Bien');

console.log('== merge');
let b = SRS.emptyDoc();
b.items['lecon-x.html|un truc'] = SRS.newItem({ term: 'un truc', lesson: 'lecon-x.html' });
b.items['lecon-x.html|un truc'].last = 9999999999999;
b.activity.push({ t: 1, k: 'exo', lesson: 'l', score: 1, total: 2 });
a.activity.push({ t: 2, k: 'rev', term: 'ut', g: 2 });
const m = SRS.merge(a, b);
ok(m.items['lecon-x.html|un truc'].last === 9999999999999, 'merge : dernière écriture gagne');
ok(m.activity.length === 2 && m.activity[0].t === 1, 'merge : activité fusionnée et triée');

console.log('== jsdom integration');
const { JSDOM } = require('jsdom');
function loadPage(file) {
  let html = fs.readFileSync(path.join(PROJ, file), 'utf8');
  for (const lib of ['exos.js', 'srs.js']) {
    const code = fs.readFileSync(path.join(PROJ, lib), 'utf8');
    html = html.replace('<script src="' + lib + '"></script>', '<script>' + code + '</script>');
  }
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/' + file, pretendToBeVisual: true });
  return new Promise(r => setTimeout(() => r(dom), 120));
}
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let dom = await loadPage('lecon-france.html');
  let win = dom.window, doc = win.document;
  const frCount = () => {
    const s = JSON.parse(win.localStorage.getItem(SRS.KEY) || '{}');
    return Object.keys(s.items || {}).filter(k => k.indexOf('lecon-france') === 0).length;
  };
  ok(frCount() === 0, 'page de leçon : aucune carte enregistrée à l\'ouverture');
  const sayBtn = doc.querySelector('#vocabulaire [data-lv]:not([hidden]) .say');
  ok(!!sayBtn, 'bouton 🔊 présent dans le niveau visible');
  sayBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(frCount() === 1, 'clic 🔊 → 1 carte ajoutée (' + frCount() + ')');
  const addBtn = doc.querySelector('#vocabulaire [data-lv]:not([hidden]) .add-deck');
  ok(!!addBtn && /Ajouter ces 10 mot/.test(addBtn.textContent), 'bouton « + Ajouter ces 10 mots » injecté (' + (addBtn ? addBtn.textContent : 'absent') + ')');
  addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(frCount() === 10, 'ajout groupé du niveau A2 vocabulaire → 10 cartes (' + frCount() + ')');
  ok(addBtn.disabled && /ajout/.test(addBtn.textContent), 'bouton désactivé après ajout (« ' + addBtn.textContent + ' »)');
  doc.dispatchEvent(new win.CustomEvent('exo-graded', { detail: { id: 'fr-a2-1', score: 3, total: 6 } }));
  const stored2 = JSON.parse(win.localStorage.getItem(SRS.KEY) || '{}');
  ok(stored2.activity.some(e => e.k === 'exo' && e.id === 'fr-a2-1' && e.score === 3), 'événement exo-graded enregistré');
  dom.window.close();

  dom = await loadPage('progres.html');
  win = dom.window; doc = win.document;
  await delay(80);
  ok(doc.querySelectorAll('.chip').length === 5, 'filtres : toutes + 4 leçons');
  ok(doc.querySelectorAll('.stat').length === 6, '6 cartes de stats');
  const addAll = doc.getElementById('add-all');
  ok(!!addAll, 'paquet vide au chargement : message + bouton « ajouter tout le catalogue » (' + (addAll ? 'présent' : 'absent') + ')');
  const emptyStored = JSON.parse(win.localStorage.getItem(SRS.KEY) || '{}');
  ok(!emptyStored.items || Object.keys(emptyStored.items).length === 0, 'aucune carte enregistrée à l\'ouverture de « Mes progrès »');
  addAll.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await delay(50);
  const before = doc.getElementById('qcount').textContent;
  ok(/\d+ \/ \d+/.test(before), 'après « ajouter tout le catalogue » : file affichée (' + before + ')');
  const reveal = doc.querySelector('#qbody .reveal button');
  if (reveal) {
    reveal.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(doc.querySelector('#qbody .back').style.display === 'block', 'la réponse se révèle');
    doc.querySelector('#qbody .grade button.g2').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const after = doc.getElementById('qcount').textContent;
    ok(after !== before, 'après notation, carte suivante (' + after + ')');
    const st = JSON.parse(win.localStorage.getItem(SRS.KEY));
    ok(st.activity.some(e => e.k === 'rev' && e.g === 2), 'révision enregistrée (g=2)');
  } else {
    ok(false, 'carte de révision introuvable');
  }
  dom.window.close();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
