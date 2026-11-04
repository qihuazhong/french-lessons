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

console.log('== déduplication de l’activité');
const da = SRS.emptyDoc();
da.activity.push({ t: 10, k: 'rev', lesson: 'l', term: 'x', g: 2 });
da.activity.push({ t: 11, k: 'exo', lesson: 'l', id: 'e1', score: 1, total: 2 });
const dup = SRS.merge(da, da);
ok(dup.activity.length === 2, 'merge : activité identique non dupliquée (' + dup.activity.length + ')');
ok(SRS.merge(dup, dup).activity.length === 2, 'merge : idempotent après plusieurs cycles');
const sameT = SRS.emptyDoc();
sameT.activity.push({ t: 10, k: 'rev', lesson: 'l', term: 'x', g: 2 });
sameT.activity.push({ t: 10, k: 'rev', lesson: 'l', term: 'y', g: 2 });
ok(SRS.merge(sameT, SRS.emptyDoc()).activity.length === 2, 'merge : événements distincts au même instant conservés');

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

console.log('== leçons privées');
const pv = SRS.emptyDoc();
const pl = SRS.savePrivateLesson(pv, { name: '  Cours avec Marie  ', url: 'meet.google.com/abc-defg', date: '2026-11-03', notes: 'subjonctif' });
ok(pl && pl.name === 'Cours avec Marie' && pl.url === 'https://meet.google.com/abc-defg', 'savePrivateLesson : nom nettoyé, lien complété en https://');
ok(SRS.savePrivateLesson(pv, { name: '   ' }) === null, 'savePrivateLesson : nom obligatoire');
ok(SRS.safeUrl('javascript:alert(1)') === '' && SRS.safeUrl('data:text/html,x') === '', 'safeUrl : schémas dangereux refusés');
ok(SRS.safeUrl('http://ex.org/a?b=1') === 'http://ex.org/a?b=1', 'safeUrl : http(s) conservé');
const parsed = SRS.parseCardLines('la veille = the day before = la veille de Noël\nun coup de main\tsome help\n\nrater ; to miss\npeut-être = maybe');
ok(parsed.length === 4 && parsed[0].gloss === 'the day before' && parsed[0].example === 'la veille de Noël', 'parseCardLines : « français = traduction = exemple »');
ok(parsed[1].term === 'un coup de main' && parsed[1].type === 'expression' && parsed[2].gloss === 'to miss', 'parseCardLines : tabulation / « ; », type expression si > 2 mots');
ok(parsed[3].term === 'peut-être', 'parseCardLines : le trait d’union d’un mot n’est pas un séparateur');
ok(SRS.addPrivateCards(pv, pl.id, parsed) === 4 && !!pv.items['prive:' + pl.id + '|rater'], 'addPrivateCards : cartes sous la leçon prive:<id>');
ok(SRS.dueItems(pv, SRS.privLessonId(pl.id)).length === 4, 'filtre par leçon privée');
const pl2 = SRS.savePrivateLesson(pv, { id: pl.id, name: 'Cours avec Marie (2)', url: '', date: '' });
ok(pl2.id === pl.id && pl2.created === pl.created && pl2.url === '' && SRS.privateLessons(pv).length === 1, 'savePrivateLesson : modification sur place');
const pOther = SRS.emptyDoc();
pOther.priv[pl.id] = { id: pl.id, name: 'ancienne version', updated: 1 };
pOther.priv.zz = { id: 'zz', name: 'Autre appareil', updated: 5, created: 5 };
const pm = SRS.merge(pv, pOther);
ok(pm.priv[pl.id].name === 'Cours avec Marie (2)' && pm.priv.zz.name === 'Autre appareil', 'merge : leçons privées fusionnées, la plus récente gagne');
const pd = JSON.parse(JSON.stringify(pv));
SRS.deletePrivateLesson(pd, pl.id);
ok(SRS.privateLessons(pd).length === 0 && SRS.privateCards(pd, pl.id).length === 0 && pd.removed['prive:' + pl.id + '|rater'] > 0, 'deletePrivateLesson : leçon + cartes retirées (tombstones)');
const pdm = SRS.merge(pv, pd);
ok(SRS.privateLessons(pdm).length === 0 && SRS.privateCards(pdm, pl.id).length === 0, 'merge : suppression propagée entre appareils');
ok(SRS.addPrivateCards(pd, pl.id, parsed) === 0, 'addPrivateCards : refusé sur une leçon supprimée');
const pw = SRS.emptyDoc(); pw.wipedAt = Date.now() + 1000;
ok(Object.keys(SRS.merge(pv, pw).priv).length === 0, 'merge : reset (wipedAt) efface aussi les leçons privées');
ok(!!SRS.merge({ v: 1, items: {}, activity: [] }, SRS.emptyDoc()).priv, 'merge : doc sans « priv » (ancien format) accepté');

console.log('== sens anglais automatique');
const WK_RATER = { fr: [{ partOfSpeech: 'Verb', language: 'French', definitions: [
  { definition: 'to <a href="/wiki/miss">miss</a> (a train, etc.)' }, { definition: '' },
  { definition: 'to fail; to <i>botch</i> = ruin' }] }], en: [{ definitions: [{ definition: 'english word' }] }] };
const mockFetch = (map, calls) => url => {
  if (calls) calls.push(url);
  for (const k in map) if (url.indexOf(k) >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve(map[k]) });
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

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
  {
    const g1 = await SRS.lookupGloss('rater', mockFetch({ 'definition/rater': WK_RATER }));
    ok(g1 && g1.source === 'wiktionary' && g1.gloss === 'to miss (a train, etc.) / to fail, to botch, ruin', 'lookupGloss : sens français du Wiktionnaire, HTML et séparateurs nettoyés (' + (g1 && g1.gloss) + ')');
    const calls = [];
    const g2 = await SRS.lookupGloss('un coup de main', mockFetch({ 'definition/coup_de_main': { fr: [{ definitions: [{ definition: 'a helping hand' }] }] } }, calls));
    ok(g2 && g2.gloss === 'a helping hand' && calls.length === 2, 'lookupGloss : article retiré si l’entrée exacte manque (' + calls.length + ' requêtes)');
    const g3 = await SRS.lookupGloss('tu peux me donner un coup de main demain', mockFetch({ 'mymemory': { responseData: { translatedText: 'can you give me a hand tomorrow' }, responseStatus: 200 } }));
    ok(g3 && g3.source === 'mymemory' && g3.gloss === 'can you give me a hand tomorrow', 'lookupGloss : phrase longue → traduction MyMemory');
    const g4 = await SRS.lookupGloss('zzz', mockFetch({ 'mymemory': { responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' }, responseStatus: 429 } }));
    ok(g4 === null, 'lookupGloss : quota MyMemory épuisé → null');
    ok(await SRS.lookupGloss('zzz', mockFetch({ 'mymemory': { responseData: { translatedText: 'zzz' }, responseStatus: 200 } })) === null, 'lookupGloss : texte renvoyé tel quel → null');
    ok(await SRS.lookupGloss('rater', () => Promise.reject(new Error('offline'))) === null, 'lookupGloss : hors ligne → null, sans exception');
    const fg = await SRS.fillGlosses(SRS.parseCardLines('rater\nla veille = the day before\nzzz =  = un exemple'), mockFetch({ 'definition/rater': WK_RATER }));
    ok(fg.missing.length === 1 && fg.missing[0] === 'zzz' && fg.cards[1].gloss === 'the day before', 'fillGlosses : complète seulement les lignes sans traduction');
    const round = SRS.parseCardLines(fg.cards.map(SRS.formatCardLine).join('\n'));
    ok(round[0].gloss === fg.cards[0].gloss && round[2].gloss === '' && round[2].example === 'un exemple', 'formatCardLine : aller-retour texte sans perte (exemple conservé sans traduction)');
  }

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

  dom = await loadPage('progres.html', w => {
    const st = SRS.emptyDoc();
    st.activity = [
      { t: 1000, k: 'rev', lesson: 'l', term: 'x', g: 2 },
      { t: 1000, k: 'rev', lesson: 'l', term: 'x', g: 2 },
      { t: 2000, k: 'rev', lesson: 'l', term: 'y', g: 2 }
    ];
    w.localStorage.setItem(SRS.KEY, JSON.stringify(st));
  });
  win = dom.window; doc = win.document;
  await delay(80);
  const statN = Array.prototype.map.call(doc.querySelectorAll('.stat .n'), e => e.textContent);
  ok(statN[4] === '2', 'doc gonflé : « Révisions » dédupliqué au chargement (' + statN[4] + ')');
  dom.window.close();

  dom = await loadPage('progres.html');
  win = dom.window; doc = win.document;
  await delay(80);
  const pform = doc.getElementById('priv-form');
  ok(pform.hidden && doc.querySelectorAll('.plesson').length === 0, 'leçons privées : formulaire masqué, liste vide au départ');
  doc.getElementById('priv-new').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(!pform.hidden && /^\d{4}-\d{2}-\d{2}$/.test(doc.getElementById('pf-date').value), 'nouveau : formulaire ouvert, date du jour pré-remplie');
  doc.getElementById('pf-url').value = 'javascript:alert(1)';
  doc.getElementById('pf-name').value = 'Cours avec Marie';
  pform.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  ok(!pform.hidden && /Lien invalide/.test(doc.getElementById('pf-msg').textContent), 'lien javascript: refusé');
  doc.getElementById('pf-url').value = 'https://meet.example/abc';
  doc.getElementById('pf-notes').value = 'Le subjonctif';
  pform.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  let pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  const pid = Object.keys(pst.priv)[0];
  ok(pform.hidden && pid && pst.priv[pid].name === 'Cours avec Marie', 'leçon privée créée et enregistrée');
  let pbox = doc.querySelector('.plesson');
  const plink = pbox.querySelector('a.plink');
  ok(plink && plink.getAttribute('href') === 'https://meet.example/abc' && plink.target === '_blank' && /noopener/.test(plink.rel), 'lien de la leçon : nouvel onglet, noopener');
  ok(/Le subjonctif/.test(pbox.querySelector('.pnotes').textContent), 'notes affichées');
  const chips = Array.prototype.map.call(doc.querySelectorAll('.chip'), c => c.textContent);
  ok(chips.length === 6 && chips[5] === 'Cours avec Marie' && doc.querySelectorAll('.chip.priv').length === 1, 'filtre : puce pour la leçon privée');
  const pta = pbox.querySelector('.padd textarea');
  ok(!pbox.querySelector('.padd').hidden, 'après création : zone d’ajout de cartes ouverte');
  pta.value = 'le subjonctif = the subjunctive\nil faut que = it is necessary that = Il faut que tu viennes.';
  pta.dispatchEvent(new win.Event('input', { bubbles: true }));
  pbox.querySelector('.p-add-ok').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(Object.keys(pst.items).filter(k => k.indexOf('prive:' + pid + '|') === 0).length === 2, '2 cartes privées ajoutées');
  pbox = doc.querySelector('.plesson');
  ok(/2 carte\(s\)/.test(pbox.querySelector('.pmeta').textContent) && pbox.querySelectorAll('.pcards li').length === 2, 'compteur et liste des cartes mis à jour');
  ok(/1 \/ 2/.test(doc.getElementById('qcount').textContent), 'file de révision alimentée (' + doc.getElementById('qcount').textContent + ')');
  ok(/^Cours avec Marie · /.test(doc.querySelector('#qbody .tag').textContent) && !/undefined/.test(doc.querySelector('#qbody .tag').textContent), 'carte : étiquette = nom de la leçon privée (« ' + doc.querySelector('#qbody .tag').textContent + ' »)');
  pbox.querySelector('.p-review').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(doc.querySelector('.chip.priv').classList.contains('on'), '« Réviser » sélectionne le filtre de la leçon privée');
  doc.querySelector('.plesson .p-edit').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(!pform.hidden && doc.getElementById('pf-name').value === 'Cours avec Marie', 'modifier : formulaire pré-rempli');
  doc.getElementById('pf-name').value = 'Cours avec Marie — subjonctif';
  pform.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(Object.keys(pst.priv).length === 1 && pst.priv[pid].name === 'Cours avec Marie — subjonctif', 'modifier : renommée sur place');
  ok(doc.querySelector('.chip.priv').textContent === 'Cours avec Marie — subjonctif', 'puce renommée');
  doc.querySelector('.plesson .pcards li .p-rm').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(Object.keys(pst.items).length === 1 && doc.querySelectorAll('.plesson .pcards li').length === 1, '× retire une carte de la leçon privée');
  win.confirm = function () { return true; };
  doc.querySelector('.plesson .p-del').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(doc.querySelectorAll('.plesson').length === 0 && Object.keys(pst.items).length === 0 && pst.priv[pid].deleted > 0, 'supprimer : leçon + cartes retirées (tombstone)');
  ok(doc.querySelectorAll('.chip').length === 5 && doc.querySelector('.chip').classList.contains('on'), 'supprimer : puce retirée, filtre remis sur « Toutes »');
  dom.window.close();

  const spoken = [];
  const withTts = (w, fetchMap) => {
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [{ lang: 'en-US', name: 'en' }, { lang: 'fr-CA', name: 'ca' }, { lang: 'fr-FR', name: 'Amélie' }],
      cancel() {}, speak(u) { spoken.push(u); } };
    w.fetch = mockFetch(fetchMap);
  };
  dom = await loadPage('progres.html', w => withTts(w, { 'definition/rater': WK_RATER,
    'mymemory': { responseData: { translatedText: 'zzz' }, responseStatus: 200 } }));
  win = dom.window; doc = win.document;
  await delay(80);
  doc.getElementById('priv-new').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  doc.getElementById('pf-name').value = 'Cours auto';
  doc.getElementById('priv-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  let abox = doc.querySelector('.plesson');
  let ata = abox.querySelector('.padd textarea');
  ata.value = 'rater\nla veille = the day before';
  ata.dispatchEvent(new win.Event('input', { bubbles: true }));
  abox.querySelector('.p-fill').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await delay(30);
  ok(/^rater = to miss \(a train, etc\.\) \/ to fail/.test(ata.value) && /la veille = the day before/.test(ata.value), 'aperçu : sens complété dans la zone de texte (' + ata.value.split('\n')[0] + ')');
  ok(Object.keys(JSON.parse(win.localStorage.getItem(SRS.KEY)).items).length === 0, 'aperçu : rien ajouté avant confirmation');
  ata.value = 'zzz\nrater';
  ata.dispatchEvent(new win.Event('input', { bubbles: true }));
  abox.querySelector('.p-add-ok').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await delay(30);
  let ast = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(Object.keys(ast.items).length === 0 && /Sens introuvable pour : zzz/.test(abox.querySelector('.p-msg').textContent), 'ajout : mot introuvable signalé, rien ajouté');
  abox.querySelector('.p-add-ok').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await delay(30);
  ast = JSON.parse(win.localStorage.getItem(SRS.KEY));
  const akeys = Object.keys(ast.items);
  const rk = akeys.find(k => /\|rater$/.test(k));
  ok(akeys.length === 2 && rk && /^to miss/.test(ast.items[rk].meta.gloss), 'second clic : ajout (rater avec son sens auto, zzz sans traduction)');
  abox = doc.querySelector('.plesson');
  abox.querySelector('.pcards li .p-say').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  let last = spoken[spoken.length - 1];
  ok(last && last.lang === 'fr-FR' && last.voice && last.voice.name === 'Amélie' && /rater|zzz/.test(last.text), 'liste : 🔊 prononce le mot (voix fr-FR)');
  const pbtn = Array.prototype.find.call(doc.querySelectorAll('#qbody .back .play'), b => /synthèse/.test(b.textContent));
  ok(!!pbtn, 'carte privée : bouton « Écouter (voix de synthèse) »');
  doc.querySelector('#qbody .reveal button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const nBefore = spoken.length;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
  ok(spoken.length === nBefore + 1, 'raccourci R : voix de synthèse sur une carte sans clip');
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
