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

console.log('== tentatives d’exercices (doc.exo)');
{
  const L = 'lecon-x.html', S = SRS.EXO_SESSION, K = L + '|e1';
  const at = (d, k) => d.exo[k] || [];
  let d = SRS.emptyDoc();
  ok(d.exo && Object.keys(d.exo).length === 0, 'emptyDoc a un magasin exo vide');

  // choix : corrigé à chaque changement → une seule séance, figée à la première réponse complète
  SRS.recordExo(d, L, 'e1', { t: 1000, score: 1, total: 5, answered: 1 });
  SRS.recordExo(d, L, 'e1', { t: 2000, score: 2, total: 5, answered: 3 });
  ok(at(d, K).length === 1 && at(d, K)[0].partial === 1 && at(d, K)[0].score === 2, 'réponses partielles : une tentative « partielle », score du dernier état');
  SRS.recordExo(d, L, 'e1', { t: 3000, score: 3, total: 5, answered: 5 });
  ok(at(d, K).length === 1 && !at(d, K)[0].partial && at(d, K)[0].score === 3, 'première réponse complète : score figé (3/5)');
  SRS.recordExo(d, L, 'e1', { t: 4000, score: 5, total: 5, answered: 5 });
  ok(at(d, K)[0].score === 3 && at(d, K)[0].retries === 1 && at(d, K)[0].last === 4000, 'nouvel essai après correction : compté en « retries », score inchangé');
  SRS.recordExo(d, L, 'e1', { t: 4000 + S + 1, score: 5, total: 5, answered: 5 });
  ok(at(d, K).length === 2 && at(d, K)[1].score === 5, (S / 60000) + ' min après la dernière action : nouvelle tentative');

  let d2 = SRS.emptyDoc();
  for (let i = 1; i <= 14; i++) SRS.recordExo(d2, L, 'e2', { t: i * 2 * S, score: i % 4, total: 4, answered: 4 });
  const xs = at(d2, L + '|e2');
  ok(xs.length === SRS.MAX_EXO && xs[0].t === 5 * 2 * S, 'au plus ' + SRS.MAX_EXO + ' tentatives par exercice, les plus récentes');
  SRS.recordExo(d2, L, null, { t: 1, score: 1, total: 1 });
  ok(Object.keys(d2.exo).length === 1, 'exercice sans id ignoré');

  // séances par « round » (exos.js) : score = premier essai, jamais rehaussé
  {
    const R = (round, t, first, score, revealed, total, extra) => Object.assign({ t, round, first, score, revealed, answered: revealed, total }, extra || {});
    const r = SRS.emptyDoc(), KR = L + '|r1';
    SRS.recordExo(r, L, 'r1', R('A', 1000, 0, 0, 1, 5));          // choix : 1er item faux (réponse affichée)
    SRS.recordExo(r, L, 'r1', R('A', 2000, 0, 1, 1, 5));          // … corrigé après coup
    ok(at(r, KR).length === 1 && at(r, KR)[0].partial === 1 && at(r, KR)[0].score === 0, 'choix : corriger un item après avoir vu la réponse ne compte pas');
    SRS.recordExo(r, L, 'r1', R('A', 3000, 4, 5, 5, 5));
    ok(at(r, KR)[0].score === 4 && !at(r, KR)[0].partial, 'feuille complète : score = premier essai (4/5), pas l’affichage (5/5)');
    SRS.recordExo(r, L, 'r1', R('A', 3000 + S + 60000, 4, 5, 5, 5));
    ok(at(r, KR).length === 1 && at(r, KR)[0].retries === 1, 'même round revérifié plus tard (sans « Recommencer ») : même séance, retry');
    SRS.recordExo(r, L, 'r1', R('B', 3000 + S + 120000, 5, 5, 5, 5));
    ok(at(r, KR).length === 1 && at(r, KR)[0].score === 4 && at(r, KR)[0].retries === 2,
      '« Recommencer » puis refaire juste après : retry, le score reste 4/5');
    SRS.recordExo(r, L, 'r1', R('C', 3000 + 3 * S, 5, 5, 5, 5));
    ok(at(r, KR).length === 2 && at(r, KR)[1].score === 5 && at(r, KR)[1].round === 'C', 'nouveau round longtemps après : nouvelle tentative');
    const f = SRS.emptyDoc(), KF = L + '|f1';
    SRS.recordExo(f, L, 'f1', R('F', 1000, 2, 2, 5, 5, { answered: 2 }));   // texte : vérifié avec 3 blancs
    ok(!at(f, KF)[0].partial && at(f, KF)[0].score === 2, 'texte vérifié avec des blancs : réponses dévoilées → tentative complète, blancs faux');
    SRS.recordExo(f, L, 'f1', R('F', 2000, 2, 5, 5, 5));
    ok(at(f, KF)[0].score === 2 && at(f, KF)[0].retries === 1, 'puis recopier les corrections : score inchangé (2/5)');
    const fa = SRS.emptyDoc();
    SRS.recordExo(fa, L, 'f2', R('G', 1000, 3, 3, 4, 4, { firstAlmost: 1, almost: 1 }));
    ok(at(fa, L + '|f2')[0].almost === 1, '« presque » du premier essai conservé');
  }

  // merge : identité = début de la tentative ; la version la plus avancée gagne
  const a1 = SRS.emptyDoc(), b1 = SRS.emptyDoc();
  SRS.recordExo(a1, L, 'e1', { t: 100, score: 1, total: 3, answered: 1 });
  const stale = JSON.parse(JSON.stringify(a1));
  SRS.recordExo(a1, L, 'e1', { t: 200, score: 2, total: 3, answered: 3 });
  SRS.recordExo(b1, L, 'e2', { t: 300, score: 2, total: 2, answered: 2 });
  const m1 = SRS.merge(SRS.merge(a1, b1), stale);
  ok(at(m1, K).length === 1 && at(m1, K)[0].score === 2 && !at(m1, K)[0].partial && at(m1, L + '|e2').length === 1,
    'merge : une copie périmée de la même tentative ne crée pas de doublon');
  ok(JSON.stringify(SRS.merge(m1, m1).exo) === JSON.stringify(m1.exo), 'merge idempotent sur exo');
  const w = SRS.emptyDoc();
  w.wipedAt = 250;
  const m2 = SRS.merge(m1, w);
  ok(!m2.exo[K] && at(m2, L + '|e2').length === 1, 'merge : les tentatives antérieures à une réinitialisation disparaissent');

  // reprise depuis l’ancien journal (événements sans « answered »)
  const old = SRS.emptyDoc();
  delete old.exo;
  old.activity = [
    { t: 10, k: 'exo', lesson: L, id: 'e1', score: 1, total: 5 },
    { t: 20, k: 'exo', lesson: L, id: 'e1', score: 4, total: 5 },
    { t: 30, k: 'rev', lesson: L, term: 'x', g: 2 },
    { t: 20 + S + 5, k: 'exo', lesson: L, id: 'e1', score: 5, total: 5 }
  ];
  SRS.backfillExo(old);
  ok(at(old, K).map(r => r.score).join() === '4,5', 'reprise : une tentative par séance (dernier score connu)');
  SRS.backfillExo(old); SRS.backfillExo(old);
  ok(at(old, K).length === 2 && !at(old, K).some(r => r.retries), 'reprise idempotente (rien n’est recompté)');
  const legacy = { v: 1, created: 1, items: {}, removed: {}, activity: old.activity };
  const m3 = SRS.merge(SRS.emptyDoc(), legacy);
  ok(at(m3, K).length === 2, 'merge avec un document distant ancien (sans exo) : reprise incluse');
  const live = SRS.emptyDoc();
  SRS.recordActivity(live, { t: 500, k: 'exo', lesson: L, id: 'e1', score: 2, total: 2, answered: 2 });
  SRS.recordExo(live, L, 'e1', { t: 500, score: 2, total: 2, answered: 2 });
  SRS.backfillExo(live);
  ok(at(live, K).length === 1 && !at(live, K)[0].retries, 'événement déjà enregistré en direct : pas recompté au chargement');
}

console.log('== maîtrise des points (SRS.mastery)');
{
  const T = 1e12, L = 'lecon-x.html';
  const map = { exo: { [L + '|e1']: ['c-a'], [L + '|e2']: ['c-a', 'c-b'] }, cards: { [L + '|gram:b1:G1']: ['c-a'], [L + '|gram:b1:G2']: ['c-c'] } };
  const att = (t, score, total, extra) => Object.assign({ t, last: t, score, total, almost: 0 }, extra || {});
  const docWith = (exo, items) => Object.assign(SRS.emptyDoc(), { exo: exo || {}, items: items || {} });
  const card = (st, ivl, last) => Object.assign(SRS.newItem({}), { st, ivl, reps: st ? 1 : 0, last: last || T });
  const st = (doc, id) => (SRS.mastery(doc, map, T)[id] || { state: 0 }).state;

  ok(Object.keys(SRS.mastery(SRS.emptyDoc(), map, T)).length === 0, 'aucune donnée → aucun point évalué');
  ok(st(docWith({}, { [L + '|gram:b1:G1']: card(0, 0) }), 'c-a') === 1, 'carte ajoutée jamais révisée → Découvert');
  ok(st(docWith({ [L + '|e1']: [att(T - 1000, 1, 5, { partial: 1 })] }), 'c-a') === 2, 'tentative partielle → En cours');
  ok(st(docWith({ [L + '|e1']: [att(T - 1000, 5, 5)] }), 'c-a') === 2, 'une seule tentative, même parfaite → En cours');
  ok(st(docWith({ [L + '|e1']: [att(T - 2e6, 4, 5), att(T - 1e6, 5, 5)] }), 'c-a') === 3, 'deux tentatives ≥ 80 % → Acquis');
  ok(st(docWith({ [L + '|e1']: [att(T - 2e6, 2, 5), att(T - 1e6, 3, 5)] }), 'c-a') === 2, 'deux tentatives faibles → En cours');
  ok(st(docWith({}, { [L + '|gram:b1:G1']: card(2, 9) }), 'c-a') === 3, 'carte à intervalle ≥ 7 j → Acquis');
  ok(st(docWith({}, { [L + '|gram:b1:G1']: card(2, 60) }), 'c-a') === 3, 'carte seule (même 60 j) plafonne à Acquis');
  ok(st(docWith({ [L + '|e1']: [att(T - 2e6, 5, 5), att(T - 1e6, 9, 10)] }, { [L + '|gram:b1:G1']: card(2, 25) }), 'c-a') === 4,
    'exercices ≥ 85 % + carte ≥ 21 j → Maîtrisé');
  const DAY = 86400000;
  ok(st(docWith({ [L + '|e1']: [att(T - 10 * DAY, 5, 5), att(T - 5 * DAY, 5, 5), att(T - 1e6, 5, 5)] }), 'c-a') === 4,
    '3 tentatives ≥ 90 % étalées sur ≥ 7 j → Maîtrisé sans carte');
  ok(st(docWith({ [L + '|e1']: [att(T - 3e6, 5, 5), att(T - 2e6, 5, 5), att(T - 1e6, 5, 5)] }), 'c-a') === 3,
    '3 tentatives parfaites le même jour → Acquis seulement');
  const recentBad = docWith({ [L + '|e1']: [att(T - 4e6, 5, 5), att(T - 3e6, 5, 5), att(T - 2e6, 1, 5), att(T - 1e6, 1, 5)] });
  ok(st(recentBad, 'c-a') === 2, 'les tentatives récentes pèsent plus (2 échecs récents → En cours)');
  const almost = SRS.mastery(docWith({ [L + '|e1']: [att(T - 2e6, 3, 4, { almost: 1 }), att(T - 1e6, 3, 4, { almost: 1 })] }), map, T)['c-a'];
  ok(Math.abs(almost.acc - 0.875) < 1e-9 && almost.state === 3, '« presque » compte pour moitié (87,5 % → Acquis)');
  const shared = SRS.mastery(docWith({ [L + '|e2']: [att(T - 2e6, 5, 5), att(T - 1e6, 5, 5)] }), map, T);
  ok(shared['c-a'].state === 3 && shared['c-b'].state === 3, 'un exercice multi-concepts nourrit chacun de ses points');
  const old = SRS.mastery(docWith({ [L + '|e1']: [att(T - 100 * DAY, 5, 5), att(T - 95 * DAY, 5, 5)] }), map, T)['c-a'];
  ok(old.state === 2 && old.stale && old.label === 'À revoir', 'acquis il y a plus de 90 j → À revoir (un cran plus bas)');
  const m = SRS.mastery(docWith({ [L + '|e1']: [att(T - 2e6, 4, 5), att(T - 1e6, 5, 5, { retries: 1 })] }, { [L + '|gram:b1:G1']: card(2, 3) }), map, T)['c-a'];
  ok(m.attempts === 2 && m.cards === 1 && m.ivl === 3 && m.last === T, 'résumé des preuves (tentatives, cartes, intervalle, dernière activité)');
  ok(!SRS.hasProgress(SRS.emptyDoc()) && SRS.hasProgress(docWith({ [L + '|e1']: [att(1, 1, 1)] })), 'hasProgress : vrai dès qu’il y a des cartes ou des exercices');
}

console.log('== jsdom integration');
const { JSDOM } = require('jsdom');
function loadPage(file, before) {
  let html = fs.readFileSync(path.join(PROJ, file), 'utf8');
  for (const lib of ['exos.js', 'srs.js', 'parcours.js']) {
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
  const att = (stored2.exo || {})['lecon-france.html|fr-a2-1'] || [];
  ok(att.length === 1 && att[0].score === 3 && att[0].total === 6 &&
    att[0].t === stored2.activity.filter(e => e.k === 'exo').pop().t, 'exo-graded → tentative dans doc.exo (même horodatage que l’activité)');
  doc.dispatchEvent(new win.CustomEvent('exo-graded', { detail: { id: 'fr-a2-1', score: 6, total: 6, answered: 6 } }));
  const att2 = JSON.parse(win.localStorage.getItem(SRS.KEY)).exo['lecon-france.html|fr-a2-1'];
  ok(att2.length === 1 && att2[0].score === 3 && att2[0].retries === 1, 'deuxième correction dans la séance : retry, score initial conservé');
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
  doc.querySelector('.plesson .pcards li button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(Object.keys(pst.items).length === 1 && doc.querySelectorAll('.plesson .pcards li').length === 1, '× retire une carte de la leçon privée');
  win.confirm = function () { return true; };
  doc.querySelector('.plesson .p-del').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  pst = JSON.parse(win.localStorage.getItem(SRS.KEY));
  ok(doc.querySelectorAll('.plesson').length === 0 && Object.keys(pst.items).length === 0 && pst.priv[pid].deleted > 0, 'supprimer : leçon + cartes retirées (tombstone)');
  ok(doc.querySelectorAll('.chip').length === 5 && doc.querySelector('.chip').classList.contains('on'), 'supprimer : puce retirée, filtre remis sur « Toutes »');
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

  console.log('== parcours.html : maîtrise personnelle');
  {
    const NOW = Date.now(), H = 3600000;
    const seed = doc0 => w => w.localStorage.setItem(SRS.KEY, JSON.stringify(doc0));
    const marked = d => [...d.querySelectorAll('.gp')].filter(a => /\bm-\d\b/.test(a.className)).length;

    dom = await loadPage('parcours.html');
    doc = dom.window.document;
    let me = doc.getElementById('me');
    ok(!me.hidden && /votre niveau de maîtrise/.test(me.textContent) && me.querySelector('a[href="progres.html#sync"]'),
      'sans progrès ni compte : parcours général + invitation (exercices, connexion)');
    ok(marked(doc) === 0 && [...doc.querySelectorAll('.lv-prog')].every(p => p.hidden), 'sans progrès : aucun point décoré');
    dom.window.close();

    const d0 = SRS.emptyDoc();
    d0.exo['lecon-ai.html|ai-b1-2'] = [
      { t: NOW - 3 * H, last: NOW - 3 * H, score: 4, total: 5, almost: 0 },
      { t: NOW - H, last: NOW - H, score: 5, total: 5, almost: 0 }];
    d0.exo['lecon-ai.html|ai-b1-3'] = [{ t: NOW - H, last: NOW - H, score: 1, total: 4, almost: 0, partial: 1 }];
    d0.items['lecon-france.html|gram:b2:G1'] = Object.assign(SRS.newItem({}), { last: NOW });
    dom = await loadPage('parcours.html', seed(d0));
    doc = dom.window.document;
    me = doc.getElementById('me');
    const art = id => doc.getElementById('gp-' + id);
    ok(/\bm-3\b/.test(art('pron-y-en').className) && art('pron-y-en').querySelector('.gp-state').textContent === 'Acquis',
      'données locales sans compte : « y et en » Acquis (2 exercices ≥ 80 %)');
    ok(/2 exercices · 91 % de réussite · aujourd’hui/.test(art('pron-y-en').querySelector('.gp-evid').textContent),
      'preuves affichées sous le point (' + art('pron-y-en').querySelector('.gp-evid').textContent + ')');
    ok(/\bm-2\b/.test(art('verbe-gerondif').className) && /exercice commencé/.test(art('verbe-gerondif').textContent), 'exercice partiel → En cours');
    ok(/\bm-1\b/.test(art('phrase-concession').className), 'carte ajoutée non révisée → Découvert');
    ok(/\bm-0\b/.test(art('disc-gouts').className) && art('disc-gouts').querySelector('.gp-state').textContent === 'Non commencé', 'autres points : Non commencé');
    ok(art('nom-articles').querySelector('.gp-state').hidden, 'point sans leçon ni preuve : pas d’étiquette « Non commencé »');
    const b1 = doc.querySelector('#niveau-b1 .lv-prog');
    ok(!b1.hidden && /^1\/21 acquis/.test(b1.textContent.trim()), 'barre du niveau B1 : ' + b1.textContent.trim());
    ok(/Ma progression/.test(me.textContent) && /1 acquis/.test(me.textContent) && me.querySelector('a[href="progres.html#sync"]'),
      'panneau « Ma progression » + invitation à se connecter (données locales)');
    const next = [...me.querySelectorAll('.me-next li')].map(li => li.textContent);
    ok(next.length === 3 && /gérondif/.test(next[0]) && !next.some(t => /pronoms y et en/.test(t)),
      'à travailler ensuite : l’en-cours d’abord, jamais un point acquis (' + next.join(' | ') + ')');
    ok(next.every(t => /^B[12]/.test(t)) && /niveau actuel : B1/.test(me.textContent),
      'à travailler ensuite : part du niveau actuel (B1), pas des points A1/A2 jamais touchés');

    me.querySelector('.me-btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(marked(doc) === 0 && /progression est masquée/.test(me.textContent) && dom.window.localStorage.getItem('fr-parcours-hide-mastery') === '1',
      '« Masquer ma progression » : retour au parcours général, préférence retenue');
    me.querySelector('.me-btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(marked(doc) === 92 && doc.querySelectorAll('.gp-evid').length === 3, '« Afficher » : décoration rétablie sans doublon de preuves');
    dom.window.close();

    dom = await loadPage('parcours.html', w => { seed(d0)(w); w.localStorage.setItem('fr-parcours-hide-mastery', '1'); });
    ok(marked(dom.window.document) === 0, 'préférence « masquée » respectée au chargement');
    dom.window.close();

    dom = await loadPage('parcours.html', w => {
      seed(d0)(w);
      withSession(w, { idToken: mkJwt({ sub: 's1', email: 'moi@example.com', exp: 9999999999 }), sub: 's1', email: 'moi@example.com', exp: 9999999999 });
    });
    doc = dom.window.document;
    me = doc.getElementById('me');
    ok(marked(doc) === 92 && /Synchronis(ation…|é)/.test(me.textContent) && !me.querySelector('a[href="progres.html#sync"]'),
      'connecté : même affichage, sans invitation à se connecter');
    dom.window.close();

    {
      const html = fs.readFileSync(path.join(PROJ, 'parcours.html'), 'utf8')
        .replace('<script src="srs.js"></script>', '<script>window.SRS = { load: function () { return {}; } };</script>')
        .replace('<script src="parcours.js"></script>', '<script>' + fs.readFileSync(path.join(PROJ, 'parcours.js'), 'utf8') + '</script>');
      const errs = [];
      const vc = new (require('jsdom').VirtualConsole)();
      vc.on('jsdomError', e => errs.push(e.message));
      const legacy = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/parcours.html', virtualConsole: vc });
      await delay(60);
      ok(errs.length === 0 && legacy.window.document.getElementById('me').hidden && legacy.window.document.querySelectorAll('.gp').length === 92,
        'srs.js ancien en cache (sans mastery) : parcours général sans erreur');
      legacy.window.close();
    }

    const pts = [
      { id: 'p1', lv: 'A1', href: 'x', pre: [] }, { id: 'p2', lv: 'A2', href: 'x', pre: ['p1'] },
      { id: 'p3', lv: 'A2', href: null, pre: [] }, { id: 'p4', lv: 'B1', href: 'x', pre: ['p3'] },
      { id: 'p5', lv: 'B1', href: 'x', pre: ['p2'] }, { id: 'p6', lv: 'B1', href: 'x', pre: [] }];
    const P = dom.window.Parcours;
    const S = n => ({ state: n });
    const ids = ms => P.nextUp(pts, ms, 3).map(p => p.id).join();
    ok(P.LEVEL_MIN_POINTS === 2, 'niveau actuel : au moins 2 points « en cours » ou plus');
    ok(P.currentLevel(pts, {}) === null, 'currentLevel : aucune preuve → aucun niveau');
    ok(P.currentLevel(pts, { p1: S(3), p4: S(2) }) === null, 'currentLevel : un seul point par niveau ne suffit pas');
    ok(P.currentLevel(pts, { p4: S(2), p6: S(3), p1: S(3) }) === 'B1', 'currentLevel : 2 points en B1 → B1');
    ok(P.currentLevel(pts, { p4: S(1), p6: S(1) }) === null, 'currentLevel : des cartes seulement « découvertes » ne comptent pas');
    ok(ids({}) === 'p1,p4,p6', 'nextUp sans niveau : depuis A1, prérequis enseignés requis, sans leçon ignorés (' + ids({}) + ')');
    ok(ids({ p1: S(3) }) === 'p2,p4,p6', 'nextUp : un point acquis débloque la suite');
    ok(ids({ p4: S(3) }) === 'p1,p6', 'nextUp : un seul exercice B1 ne fait pas sauter au B1 (' + ids({ p4: S(3) }) + ')');
    ok(ids({ p1: { state: 2, stale: true }, p4: S(2) }) === 'p1,p4,p6', 'nextUp : « à revoir » et en cours en tête, puis le reste');
    ok(ids({ p4: S(3), p6: S(3) }) === 'p5,p1,p2',
      'nextUp (B1) : niveau actuel d’abord ; prérequis inférieurs jamais touchés supposés connus ; lacunes inférieures en dernier');
    ok(ids({ p4: S(3), p6: S(3), p2: S(2) }) === 'p2,p1',
      'nextUp : un prérequis commencé mais pas acquis passe en tête et bloque ce qui en dépend');
    ok(ids({ p4: S(3), p6: S(3), p2: S(1) }) === 'p1,p2',
      'nextUp : un prérequis inférieur « découvert » (pas acquis) bloque encore la suite');
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
