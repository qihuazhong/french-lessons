// Tests for content/curriculum.json and the data-gp tags on lesson grammar points.
// Run:  node tools/test_curriculum.js   (no dependencies)
const path = require('path');
const fs = require('fs');
const PROJ = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  pass:', msg); }
  else { failed++; console.log('  FAIL:', msg); }
}

const cur = JSON.parse(fs.readFileSync(path.join(PROJ, 'content/curriculum.json'), 'utf8'));
const LV = cur.levels;
const byId = {};
cur.points.forEach(p => { byId[p.id] = p; });

console.log('== curriculum.json');
ok(JSON.stringify(LV) === JSON.stringify(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']), 'six niveaux A1→C2');
ok(Object.keys(byId).length === cur.points.length, 'identifiants uniques (' + cur.points.length + ' points)');
const badShape = cur.points.filter(p => !/^[a-z0-9-]+$/.test(p.id) || !LV.includes(p.level) ||
  !cur.categories[p.cat] || !p.title || !p.summary);
ok(badShape.length === 0, 'chaque point a id/niveau/catégorie/titre/résumé valides' +
  (badShape.length ? ' — ' + badShape.map(p => p.id).join(', ') : ''));
LV.forEach(lv => {
  const n = cur.points.filter(p => p.level === lv).length;
  ok(n >= 5, lv + ' : ' + n + ' points');
});
const badPre = [];
cur.points.forEach(p => (p.prereq || []).forEach(q => {
  if (!byId[q]) badPre.push(p.id + '→' + q + ' (inconnu)');
  else if (LV.indexOf(byId[q].level) > LV.indexOf(p.level)) badPre.push(p.id + '→' + q + ' (niveau supérieur)');
}));
ok(badPre.length === 0, 'prérequis existants et de niveau ≤' + (badPre.length ? ' — ' + badPre.join(', ') : ''));
function hasCycle() {
  const state = {};
  function visit(id) {
    if (state[id] === 1) return true;
    if (state[id] === 2) return false;
    state[id] = 1;
    const c = (byId[id].prereq || []).some(q => byId[q] && visit(q));
    state[id] = 2;
    return c;
  }
  return cur.points.some(p => visit(p.id));
}
ok(!hasCycle(), 'pas de cycle dans les prérequis');

console.log('== tags data-gp des leçons');
const lessons = JSON.parse(fs.readFileSync(path.join(PROJ, 'lessons.json'), 'utf8'));
function grammarTags(html) {
  const s = html.indexOf('<section id="grammaire">');
  const e = html.indexOf('</section>', s);
  const sec = html.slice(s, e);
  const out = [];
  const re = /<h3(\s[^>]*)?>([\s\S]*?)<\/h3>/g;
  let m;
  while ((m = re.exec(sec))) {
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (!/^G\d+/.test(title)) continue;
    const gp = /data-gp="([^"]*)"/.exec(m[1] || '');
    out.push({ title, ids: gp ? gp[1].split(/\s+/).filter(Boolean) : [] });
  }
  return out;
}
const coverage = {};
let total = 0;
lessons.forEach(l => {
  const html = fs.readFileSync(path.join(PROJ, l.file), 'utf8');
  const tags = grammarTags(html);
  total += tags.length;
  const untagged = tags.filter(t => !t.ids.length).map(t => t.title);
  ok(tags.length > 0 && untagged.length === 0, l.file + ' : ' + tags.length + ' points tous tagués' +
    (untagged.length ? ' — manquants : ' + untagged.join(' | ') : ''));
  const unknown = [].concat(...tags.map(t => t.ids)).filter(id => !byId[id]);
  ok(unknown.length === 0, l.file + ' : identifiants connus' + (unknown.length ? ' — ' + unknown.join(', ') : ''));
  tags.forEach(t => t.ids.forEach(id => { (coverage[id] = coverage[id] || []).push(l.file); }));
  const slug = { 'lecon-ai.html': 'ai', 'lecon-dommage.html': 'dommage', 'lecon-france.html': 'france' }[l.file];
  const src = slug && path.join(PROJ, 'content', slug, 'src', 'part4.html');
  if (src && fs.existsSync(src)) {
    const same = JSON.stringify(grammarTags(fs.readFileSync(src, 'utf8'))) === JSON.stringify(tags);
    ok(same, l.file + ' : tags identiques dans content/' + slug + '/src/part4.html');
  }
});
ok(total >= 34, total + ' points de grammaire au total');

console.log('== tags « concepts » des exercices');
function exoSpecs(html) {
  return [...html.matchAll(/<div class="exo"><script type="application\/json">([\s\S]*?)<\/script>/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch (e) { return { bad: true }; } });
}
let nExo = 0, nExoGram = 0;
const exoCov = {};
lessons.forEach(l => {
  const specs = exoSpecs(fs.readFileSync(path.join(PROJ, l.file), 'utf8'));
  nExo += specs.length;
  const bad = specs.filter(x => x.bad || !x.id || !Array.isArray(x.concepts) || x.concepts.some(c => !byId[c]));
  ok(specs.length > 0 && bad.length === 0, l.file + ' : ' + specs.length + ' exercices, tous avec « concepts » valides' +
    (bad.length ? ' — ' + bad.map(x => x.id || '?').join(', ') : ''));
  specs.forEach(x => {
    if (x.concepts && x.concepts.length) nExoGram++;
    (x.concepts || []).forEach(c => { (exoCov[c] = exoCov[c] || []).push(l.file + '|' + x.id); });
  });
  const slug = { 'lecon-ai.html': 'ai', 'lecon-dommage.html': 'dommage', 'lecon-france.html': 'france' }[l.file];
  const src = slug && path.join(PROJ, 'content', slug, 'src', 'part5.html');
  if (src && fs.existsSync(src)) {
    const pick = a => JSON.stringify(a.map(x => [x.id, x.concepts]));
    ok(pick(exoSpecs(fs.readFileSync(src, 'utf8'))) === pick(specs), l.file + ' : mêmes tags dans content/' + slug + '/src/part5.html');
  }
});
ok(nExoGram >= 20, nExoGram + '/' + nExo + ' exercices travaillent un point de grammaire');
const gramNoExo = Object.keys(coverage).filter(id => !exoCov[id]);
console.log('  (information) points enseignés sans exercice : ' + (gramNoExo.join(', ') || 'aucun'));

console.log('== parcours.html');
const { spawnSync } = require('child_process');
const parcours = fs.readFileSync(path.join(PROJ, 'parcours.html'), 'utf8');
const fresh = spawnSync('python3', ['-c',
  'import json,sys; sys.path.insert(0,"tools"); import build_roadmap as b; ' +
  'sys.stdout.write(b.build(json.load(open("content/curriculum.json")), json.load(open("lessons.json"))))'],
  { cwd: PROJ, encoding: 'utf8' });
ok(fresh.status === 0 && fresh.stdout === parcours, 'parcours.html à jour (relancer tools/build_roadmap.py sinon)');
const arts = [...parcours.matchAll(/<article class="gp[^"]*" id="gp-([^"]+)" data-gp="([^"]+)">([\s\S]*?)<\/article>/g)];
ok(arts.length === cur.points.length && arts.every(a => byId[a[1]] && a[1] === a[2]),
  'un article par point du curriculum (' + arts.length + ')');
const badLinks = [];
let nLinks = 0;
arts.forEach(a => {
  for (const m of a[3].matchAll(/href="(lecon-[^"?]+)\?niveau=(\w+)#(gram-(\w+)-G\d+)"/g)) {
    nLinks++;
    const [, file, lv, anchor, alv] = m;
    const page = fs.existsSync(path.join(PROJ, file)) ? fs.readFileSync(path.join(PROJ, file), 'utf8') : '';
    const h = new RegExp('<h3 id="' + anchor + '" data-gp="([^"]+)"').exec(page);
    const before = h ? page.slice(0, h.index) : '';
    const lastLv = (before.match(/data-lv="(\w+)"/g) || []).pop() || '';
    if (!h || lv !== alv || lastLv !== 'data-lv="' + lv + '"' || !h[1].split(' ').includes(a[1]))
      badLinks.push(a[1] + ' → ' + m[1]);
  }
});
ok(nLinks >= 34 && badLinks.length === 0, nLinks + ' liens « Étudier dans » → bon fichier, bon parcours, bon point' +
  (badLinks.length ? ' — ' + badLinks.join(', ') : ''));
const prereqLinks = [...parcours.matchAll(/href="#gp-([^"]+)"/g)].map(m => m[1]);
ok(prereqLinks.length > 0 && prereqLinks.every(id => byId[id]), 'liens de prérequis internes valides');
const navOk = lessons.every(l => fs.readFileSync(path.join(PROJ, l.file), 'utf8').includes('href="parcours.html"')) &&
  ['index.html', 'progres.html'].every(f => fs.readFileSync(path.join(PROJ, f), 'utf8').includes('href="parcours.html"'));
ok(navOk, 'parcours.html lié depuis index, Mes progrès et chaque leçon');

let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) {}
if (JSDOM) {
  console.log('== lien profond ?niveau= (jsdom)');
  const file = path.join(PROJ, 'lecon-ai.html');
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    url: 'file://' + file + '?niveau=b1#gram-b1-G2', runScripts: 'dangerously'
  });
  const d = dom.window.document;
  ok(d.querySelector("input[name='niveau']:checked").value === 'b1', '?niveau=b1 coche le parcours B1');
  ok(d.body.dataset.niveau === 'b1' && !d.getElementById('gram-b1-G2').closest('[data-lv]').hidden,
    'le bloc B1 de la grammaire est visible');
  const dom2 = new JSDOM(fs.readFileSync(file, 'utf8'), { url: 'file://' + file + '?niveau=zz', runScripts: 'dangerously' });
  ok(dom2.window.document.body.dataset.niveau === 'a2', 'niveau inconnu → parcours par défaut');
} else {
  console.log('  (jsdom absent : test du lien profond ignoré — cd tools && npm i jsdom)');
}

console.log('== couverture (information)');
LV.forEach(lv => {
  const pts = cur.points.filter(p => p.level === lv);
  const cov = pts.filter(p => coverage[p.id]);
  console.log('  ' + lv + ' : ' + cov.length + '/' + pts.length + ' couverts par une leçon');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
