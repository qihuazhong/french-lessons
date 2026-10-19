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

console.log('== Google session');
const mkJwt = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b64({ alg: 'RS256', kid: 'k1' }) + '.' + b64(payload) + '.sig';
};
const dec = SRS.decodeJwt(mkJwt({ email: 'a@example.com', sub: '123', exp: 9999999999 }));
ok(dec && dec.email === 'a@example.com' && dec.sub === '123', 'decodeJwt : charge utile décodée');
ok(SRS.decodeJwt('pas-un-jeton') === null, 'decodeJwt : jeton malformé → null');
const sPic = SRS.setSession(mkJwt({ sub: 's1', email: 'e@x.y', exp: 9999999999, picture: 'https://lh3.example/p.png' }));
ok(sPic && sPic.picture === 'https://lh3.example/p.png', 'setSession : photo de profil conservée');
ok(SRS.auth() === null, 'auth : null sans configuration (config.js vide)');
const r2 = SRS.reset();
ok(r2.wipedAt > 0 && Object.keys(r2.items).length === 0, 'reset : pose wipedAt et vide le paquet');
ok(SRS.lastSync() === 0 || typeof SRS.lastSync() === 'number', 'lastSync : horodatage numérique');

console.log('== merge avec effacement (wipedAt)');
const wa = SRS.emptyDoc();
wa.items['lecon-x.html|ancien'] = SRS.newItem({});
wa.items['lecon-x.html|ancien'].last = 100;
wa.items['lecon-x.html|recent'] = SRS.newItem({});
wa.items['lecon-x.html|recent'].last = 200;
wa.activity.push({ t: 150, k: 'rev' });
const wb = SRS.emptyDoc();
wb.wipedAt = 180;
const w = SRS.merge(wa, wb);
ok(!w.items['lecon-x.html|ancien'] && !!w.items['lecon-x.html|recent'], 'merge : cartes antérieures au reset écartées, récentes gardées');
ok(w.wipedAt === 180, 'merge : wipedAt conservé');
ok(w.activity.length === 0, 'merge : activité antérieure au reset écartée');
const reg = SRS.emptyDoc();
SRS.registerItems(reg, 'lecon-x.html', [{ key: 'neuf', type: 'mot' }]);
ok(reg.items['lecon-x.html|neuf'].last > 0, 'inscription : last horodaté (survit aux tombstones)');

console.log('== suppression de cartes (removed)');
const rd = SRS.emptyDoc();
SRS.registerItems(rd, 'lecon-x.html', [{ key: 'a', type: 'mot', term: 'a' }]);
SRS.removeItem(rd, 'lecon-x.html|a');
ok(!rd.items['lecon-x.html|a'] && rd.removed['lecon-x.html|a'] > 0, 'removeItem : carte retirée + tombstone horodaté');
const rd2 = SRS.emptyDoc();
rd2.items['lecon-x.html|a'] = SRS.newItem({ term: 'a' });
rd2.items['lecon-x.html|a'].last = 100;
const rem = SRS.emptyDoc();
rem.removed['lecon-x.html|a'] = 150;
ok(!SRS.merge(rd2, rem).items['lecon-x.html|a'], 'merge : carte retirée sur un autre appareil écartée');
const re = SRS.emptyDoc();
re.items['lecon-x.html|a'] = SRS.newItem({ term: 'a' });
re.items['lecon-x.html|a'].last = 200;
ok(!!SRS.merge(re, rem).items['lecon-x.html|a'], 'merge : ré-ajout postérieur au retrait conservé');
SRS.registerItems(rd, 'lecon-x.html', [{ key: 'a', type: 'mot', term: 'a' }]);
ok(!!rd.items['lecon-x.html|a'] && !rd.removed['lecon-x.html|a'], 'ré-ajout : tombstone effacé');
const legacy = { v: 1, items: {}, activity: [] };
ok(!!(SRS.merge(legacy, SRS.emptyDoc()).removed), 'merge : doc sans « removed » (ancien format) accepté');

console.log('== jsdom integration');
const { JSDOM } = require('jsdom');
function loadPage(file, before) {
  let html = fs.readFileSync(path.join(PROJ, file), 'utf8');
  for (const lib of ['exos.js', 'srs.js']) {
    const code = fs.readFileSync(path.join(PROJ, lib), 'utf8');
    html = html.replace('<script src="' + lib + '"></script>', '<script>' + code + '</script>');
  }
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/' + file, pretendToBeVisual: true, beforeParse: before });
  return new Promise(r => setTimeout(() => r(dom), 120));
}
const withSession = (w, session) => {
  w.FR_CONFIG = { workerUrl: 'https://w.example', googleClientId: 'c.apps.googleusercontent.com' };
  w.localStorage.setItem('fr-lessons-session', JSON.stringify(session));
};
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
  ok(!!addBtn && /Ajouter ces 9 mot/.test(addBtn.textContent), 'bouton recalculé après ajout individuel (« ' + (addBtn ? addBtn.textContent : 'absent') + ' »)');
  addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  let picks = doc.querySelectorAll('#vocabulaire [data-lv]:not([hidden]) .pick');
  ok(picks.length === 10, 'mode sélection : une case par mot (' + picks.length + ')');
  ok(doc.querySelectorAll('#vocabulaire [data-lv]:not([hidden]) .pick:disabled').length === 1, 'le mot déjà ajouté est coché/désactivé');
  ok(/Ajouter la sélection \(9\)/.test(addBtn.textContent), 'compteur de sélection = 9 (' + addBtn.textContent + ')');
  let free = Array.prototype.filter.call(picks, b => !b.disabled);
  free[0].click();
  ok(/Ajouter la sélection \(8\)/.test(addBtn.textContent), 'décocher un mot → compteur 8 (' + addBtn.textContent + ')');
  doc.querySelector('.add-deck-cancel').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(doc.querySelectorAll('.pick').length === 0, '« Annuler » retire les cases');
  ok(/Ajouter ces 9 mot/.test(addBtn.textContent), 'libellé restauré après Annuler (' + addBtn.textContent + ')');
  addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  picks = doc.querySelectorAll('#vocabulaire [data-lv]:not([hidden]) .pick');
  Array.prototype.filter.call(picks, b => !b.disabled)[1].click();
  addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(frCount() === 9, 'sélection partielle : 1 individuel + 8 cochés = 9 cartes (' + frCount() + ')');
  ok(/Ajouter ces 1 mot/.test(addBtn.textContent) && !addBtn.disabled, 'le mot exclu reste proposé (' + addBtn.textContent + ')');
  addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(frCount() === 10, 'second passage : le mot exclu ajouté → 10 cartes (' + frCount() + ')');
  ok(addBtn.disabled && /carte\(s\) ajoutée/.test(addBtn.textContent), 'bouton finalisé (« ' + addBtn.textContent + ' »)');
  const gramBtn = doc.querySelector('#grammaire [data-lv]:not([hidden]) .add-deck');
  ok(!!gramBtn && /point\(s\) de grammaire/.test(gramBtn.textContent), 'grammaire : bouton d’ajout présent (« ' + (gramBtn ? gramBtn.textContent : 'absent') + ' »)');
  gramBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const gpicks = doc.querySelectorAll('#grammaire [data-lv]:not([hidden]) .pick');
  ok(gpicks.length === 2, 'grammaire : une case par point du niveau visible (' + gpicks.length + ')');
  gramBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const gst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  const gItem = gst.items['lecon-france.html|gram:a2:G1'];
  ok(!!gItem && gItem.meta.type === 'grammaire', 'grammaire : carte enregistrée (gram:a2:G1)');
  ok(!!gItem && /pourquoi, comment/.test(gItem.meta.term) && /est-ce que/.test(gItem.meta.example), 'grammaire : titre et explication extraits');
  ok(gramBtn.disabled && /carte\(s\) ajoutée/.test(gramBtn.textContent), 'grammaire : bouton finalisé après ajout (« ' + gramBtn.textContent + ' »)');
  const exprBtn = doc.querySelector('#expressions [data-lv]:not([hidden]) .add-deck');
  exprBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(doc.querySelectorAll('#expressions .pick').length > 0, 'mode sélection aussi pour les expressions (' + doc.querySelectorAll('#expressions .pick').length + ' cases)');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(doc.querySelectorAll('.pick').length === 0, 'Échap annule la sélection (aucune carte expression ajoutée : ' + frCount() + ' vocab)');
  doc.dispatchEvent(new win.CustomEvent('exo-graded', { detail: { id: 'fr-a2-1', score: 3, total: 6 } }));
  const stored2 = JSON.parse(win.localStorage.getItem(SRS.KEY) || '{}');
  ok(stored2.activity.some(e => e.k === 'exo' && e.id === 'fr-a2-1' && e.score === 3), 'événement exo-graded enregistré');
  ok(!doc.getElementById('account-chip'), 'pas de pastille de compte sans session');
  dom.window.close();

  const PICTURE = 'https://lh3.googleusercontent.com/avatar.png';
  dom = await loadPage('lecon-france.html', w => withSession(w, {
    idToken: 'jeton', sub: 's1', email: 'moi@example.com', exp: 9999999999, picture: PICTURE
  }));
  win = dom.window; doc = win.document;
  await delay(80);
  let chip = doc.getElementById('account-chip');
  ok(!!chip && chip.querySelector('img').getAttribute('src') === PICTURE, 'page de leçon : pastille de compte avec la photo');
  ok(!!chip && chip.getAttribute('href') === 'progres.html' && /moi@example\.com/.test(chip.title), 'pastille : lien vers Mes progrès + email en infobulle');
  win.localStorage.removeItem('fr-lessons-session');
  win.dispatchEvent(new win.Event('focus'));
  await delay(30);
  ok(!doc.getElementById('account-chip'), 'pastille retirée après déconnexion (focus)');
  dom.window.close();

  dom = await loadPage('progres.html');
  win = dom.window; doc = win.document;
  await delay(80);
  ok(doc.querySelectorAll('.chip').length === 5, 'filtres : toutes + 4 leçons');
  ok(doc.querySelectorAll('.stat').length === 6, '6 cartes de stats');
  ok(doc.querySelectorAll('#forecast .fbar').length === 5, 'graphique « À venir » : 5 périodes');
  ok(doc.querySelectorAll('#history .fbar').length === 14, 'historique : 14 barres journalières');
  ok(/non configurée/i.test(doc.getElementById('sync-note').textContent) && doc.getElementById('sync-note').style.display !== 'none', 'sync : note « non configurée » affichée sans config.js');
  ok(doc.getElementById('sync-out').style.display === 'none', 'sync : bouton Google masqué sans configuration');
  const progresSrc = fs.readFileSync(path.join(PROJ, 'progres.html'), 'utf8');
  ok(/<script src="config\.js"><\/script>\s*<script src="srs\.js">/.test(progresSrc), 'progres.html charge config.js avant srs.js');
  ok((progresSrc.match(/"ty":"grammaire"/g) || []).length === 34, 'catalogue : 34 points de grammaire');
  const fN = () => Array.prototype.map.call(doc.querySelectorAll('#forecast .fbar-n'), e => parseInt(e.textContent, 10));
  ok(!doc.querySelector('#forecast .fbar').classList.contains('hot'), 'paquet vide : pas de pic « Auj. »');
  const addAll = doc.getElementById('add-all');
  ok(!!addAll, 'paquet vide au chargement : message + bouton « ajouter tout le catalogue » (' + (addAll ? 'présent' : 'absent') + ')');
  const emptyStored = JSON.parse(win.localStorage.getItem(SRS.KEY) || '{}');
  ok(!emptyStored.items || Object.keys(emptyStored.items).length === 0, 'aucune carte enregistrée à l\'ouverture de « Mes progrès »');
  addAll.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await delay(50);
  const before = doc.getElementById('qcount').textContent;
  ok(/\d+ \/ \d+/.test(before), 'après « ajouter tout le catalogue » : file affichée (' + before + ')');
  ok(fN()[0] === 239 && fN()[1] === 0, 'prévision : 239 cartes dues aujourd’hui (' + fN().join('/') + ')');
  ok(doc.querySelector('#forecast .fbar').classList.contains('hot'), 'barre « Auj. » mise en évidence');
  const reveal = doc.querySelector('#qbody .reveal button');
  if (reveal) {
    reveal.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(doc.querySelector('#qbody .back').style.display === 'block', 'la réponse se révèle');
    const ivls = Array.prototype.map.call(doc.querySelectorAll('#qbody .grade .ivl'), e => e.textContent);
    ok(ivls.length === 4, '4 boutons de notation avec intervalle (' + ivls.join(', ') + ')');
    ok(ivls[0] === '10 min' && ivls[1] === '15 min' && ivls[2] === '1 j' && ivls[3] === '4 j', 'aperçus d’intervalle : ' + ivls.join(' / '));
    ok(/R = écouter/.test(doc.querySelector('#qbody .keys').textContent), 'raccourci R = écouter affiché');
    const posBefore = doc.getElementById('qcount').textContent;
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    ok(doc.getElementById('qcount').textContent === posBefore, 'R ne note pas la carte (position inchangée)');
    doc.querySelector('#qbody .grade button.g2').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const after = doc.getElementById('qcount').textContent;
    ok(after !== before, 'après notation, carte suivante (' + after + ')');
    ok(fN()[0] === 238 && fN()[1] === 1, 'après « Bien » : 238 aujourd’hui / 1 demain (' + fN().join('/') + ')');
    const st = JSON.parse(win.localStorage.getItem(SRS.KEY));
    ok(st.activity.some(e => e.k === 'rev' && e.g === 2), 'révision enregistrée (g=2)');
    ok(doc.querySelectorAll('#history .fbar-n')[13].textContent === '1', 'historique : révision du jour comptée');
    let rmRow = doc.querySelector('#qbody .remove-row');
    ok(!!rmRow && rmRow.style.display === 'none', 'bouton « Retirer du paquet » masqué avant d’afficher la réponse');
    doc.querySelector('#qbody .reveal button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(doc.querySelector('#qbody .remove-row').style.display === 'block', 'bouton « Retirer du paquet » visible après affichage');
    win.confirm = function () { return true; };
    const beforeRem = Object.keys(JSON.parse(win.localStorage.getItem(SRS.KEY)).items).length;
    doc.querySelector('#qbody .remove-row button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const remStored = JSON.parse(win.localStorage.getItem(SRS.KEY));
    ok(Object.keys(remStored.items).length === beforeRem - 1, 'carte retirée du paquet (' + beforeRem + ' → ' + Object.keys(remStored.items).length + ')');
    ok(Object.keys(remStored.removed || {}).length === 1, 'tombstone « removed » enregistré');
    ok(fN()[0] === 237 && fN()[1] === 1, 'prévision après retrait : 237 aujourd’hui (' + fN().join('/') + ')');
    ok(doc.querySelectorAll('#history .fbar-n')[13].textContent === '1', 'historique : un retrait n’ajoute pas de révision');
    const cancStored = JSON.parse(win.localStorage.getItem(SRS.KEY));
    win.confirm = function () { return false; };
    if (doc.querySelector('#qbody .reveal button')) {
      doc.querySelector('#qbody .reveal button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      doc.querySelector('#qbody .remove-row button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      const after = JSON.parse(win.localStorage.getItem(SRS.KEY));
      ok(Object.keys(after.items).length === Object.keys(cancStored.items).length, 'annulation du confirm : carte conservée');
    } else {
      ok(true, 'annulation du confirm : (session terminée, rien à annuler)');
    }
  } else {
    ok(false, 'carte de révision introuvable');
  }
  dom.window.close();

  dom = await loadPage('progres.html', w => {
    const it = SRS.newItem({ lesson: 'lecon-france.html', key: 'gram:a2:G1', type: 'grammaire',
      term: 'G1 — Poser des questions : pourquoi, comment, est-ce que', gloss: '',
      example: 'Pourquoi ?\n• « Pourquoi tu ris ? »', audio: '', level: 'a2' });
    it.last = Date.now();
    const st = SRS.emptyDoc();
    st.items['lecon-france.html|gram:a2:G1'] = it;
    w.localStorage.setItem(SRS.KEY, JSON.stringify(st));
  });
  win = dom.window; doc = win.document;
  await delay(80);
  ok(/grammaire/.test(doc.querySelector('#qbody .tag').textContent), 'révision grammaire : étiquette « grammaire »');
  ok(/Rappelez-vous la règle/.test(doc.querySelector('#qbody .hint').textContent), 'révision grammaire : consigne adaptée');
  ok(/pourquoi, comment/.test(doc.querySelector('#qbody .front').textContent), 'révision grammaire : le titre est au recto');
  doc.querySelector('#qbody .reveal button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const expl = doc.querySelector('#qbody .back .expl');
  ok(!!expl && /Pourquoi \?/.test(expl.textContent), 'révision grammaire : explication au verso');
  ok(!doc.querySelector('#qbody .back .play'), 'révision grammaire : pas de bouton audio');
  dom.window.close();

  dom = await loadPage('progres.html', w => withSession(w, {
    idToken: mkJwt({ sub: 's1', email: 'moi@example.com', exp: 9999999999, picture: PICTURE }),
    sub: 's1', email: 'moi@example.com', exp: 9999999999
  }));
  win = dom.window; doc = win.document;
  await delay(80);
  let av = doc.getElementById('sync-avatar');
  ok(av.style.display !== 'none' && av.getAttribute('src') === PICTURE, 'Mes progrès : photo affichée après connexion (via le jeton)');
  ok(doc.getElementById('sync-in').style.display !== 'none' && /moi@example\.com/.test(doc.getElementById('sync-email').textContent), 'Mes progrès : section « connecté » visible');
  dom.window.close();

  dom = await loadPage('progres.html', w => withSession(w, {
    idToken: 'jeton-sans-photo', sub: 's1', email: 'moi@example.com', exp: 9999999999
  }));
  win = dom.window; doc = win.document;
  await delay(80);
  av = doc.getElementById('sync-avatar');
  ok(av.style.display === 'none', 'Mes progrès : photo masquée si le jeton n’en contient pas');
  dom.window.close();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
