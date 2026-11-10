#!/usr/bin/env python3
"""Tag each lesson grammar point (<h3>G# …</h3> in #grammaire) with the
canonical curriculum concept(s) it teaches: <h3 id="gram-<lv>-<G#>" data-gp="id1 id2">
(the id is the deep-link anchor used by parcours.html).

Source of truth for the mapping = TAGS below; concept ids live in
content/curriculum.json. Patches the built page AND content/<slug>/src/part4.html
when it exists (the opinions lesson has no src). Idempotent: re-running
rewrites the attribute. Only the <h3> attribute changes, so button DOM order
(and audio ids) are untouched — no need to re-run the clip pipeline.

Also tags every interactive exercise spec with the concepts it practises:
"concepts": [...] right after its "id" (EXO_TAGS; [] = vocabulary only). An
explicit empty list means "checked, no grammar", so every exercise must be listed.

Usage: python3 tools/tag_grammar.py           (apply)
       python3 tools/tag_grammar.py --check   (exit 1 if anything would change)
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# page -> level -> G# -> [concept ids]
TAGS = {
    'lecon-ai.html': {
        'a2': {'G1': ['questions-est-ce-que'], 'G2': ['neg-adverbes']},
        'b1': {'G1': ['pron-y-en'], 'G2': ['verbe-gerondif'], 'G3': ['cond-present']},
        'b2': {'G1': ['phrase-cause'], 'G2': ['mod-devoir-probabilite'], 'G3': ['disc-nuancer-opinion']},
    },
    'lecon-dommage.html': {
        'a2': {'G1': ['pronoms-y-lieu', 'pron-y-en'], 'G2': ['temps-passe-compose']},
        'b1': {'G1': ['cond-passe'], 'G2': ['temps-present-narration']},
        'b2': {'G1': ['disc-metaphores'], 'G2': ['disc-nuances-sens'], 'G3': ['disc-preference']},
    },
    'lecon-france.html': {
        'a2': {'G1': ['questions-mots', 'questions-est-ce-que'], 'G2': ['verbe-avoir-expressions']},
        'b1': {'G1': ['neg-avancee'], 'G2': ['phrase-but'], 'G3': ['verbe-passif']},
        'b2': {'G1': ['phrase-concession'], 'G2': ['disc-nominalisation'], 'G3': ['mode-subj-expressions']},
        'c1': {'G1': ['disc-passif-effacement'], 'G2': ['disc-modalisation'], 'G3': ['phrase-mise-en-relief']},
    },
    'lecon-opinions-impopulaires.html': {
        'a2': {'G1': ['disc-gouts'], 'G2': ['questions-intonation']},
        'b1': {'G1': ['pron-y-en'], 'G2': ['phrase-opposition'], 'G3': ['verbe-faire-causatif']},
        'b2': {'G1': ['mode-subj-il-faut-que'], 'G2': ['cond-passe'], 'G3': ['disc-opinion', 'disc-nuancer-opinion']},
    },
}

# page -> exercise id -> [concept ids]   ([] = vocabulary / comprehension only)
EXO_TAGS = {
    'lecon-ai.html': {
        'ai-a2-1': [], 'ai-a2-2': ['questions-est-ce-que'], 'ai-a2-3': ['neg-ne-pas'],
        'ai-b1-1': [], 'ai-b1-2': ['pron-y-en'], 'ai-b1-3': ['verbe-gerondif'], 'ai-b1-4': ['cond-present'],
        'ai-b2-1': ['phrase-cause'], 'ai-b2-2': ['mod-devoir-probabilite'],
    },
    'lecon-dommage.html': {
        'do-a2-1': [], 'do-a2-2': ['pronoms-y-lieu', 'pron-y-en', 'pronoms-cod-coi'],
        'do-a2-3': ['temps-passe-compose'],
        'do-b1-1': [], 'do-b1-2': ['cond-passe'], 'do-b1-3': ['temps-present-narration'],
        'do-b2-1': ['disc-metaphores'], 'do-b2-2': ['disc-nuances-sens'], 'do-b2-3': ['disc-preference'],
    },
    'lecon-france.html': {
        'fr-a2-1': [], 'fr-a2-2': ['questions-mots'], 'fr-a2-3': ['verbe-avoir-expressions'],
        'fr-b1-1': [], 'fr-b1-2': ['neg-avancee', 'verbe-passif'], 'fr-b1-3': ['verbe-passif'],
        'fr-b2-1': [], 'fr-b2-2': ['phrase-concession'], 'fr-b2-3': ['disc-nominalisation'],
        'fr-c1-1': ['disc-modalisation'], 'fr-c1-2': ['mode-subj-expressions', 'mode-subj-il-faut-que'],
        'fr-c1-3': ['disc-registres'],
    },
    'lecon-opinions-impopulaires.html': {
        'op-a2-1': ['disc-gouts'], 'op-a2-2': [], 'op-a2-3': ['neg-ne-pas'],
        'op-b1-1': [], 'op-b1-2': ['pron-y-en'], 'op-b1-3': ['verbe-faire-causatif'],
        'op-b2-1': ['cond-passe'], 'op-b2-2': ['disc-registres'],
    },
}

H3 = re.compile(r'<h3(?:\s[^>]*)?>(.*?)</h3>', re.S)


def src_part4(page):
    slug = {'lecon-ai.html': 'ai', 'lecon-dommage.html': 'dommage',
            'lecon-france.html': 'france'}.get(page)
    if not slug:
        return None
    p = os.path.join(ROOT, 'content', slug, 'src', 'part4.html')
    return p if os.path.exists(p) else None


def src_part(page, n):
    p = src_part4(page)
    return p and p.replace('part4.html', 'part%d.html' % n)


EXO_SPEC = re.compile(r'(<div class="exo"><script type="application/json">)(.*?)(</script>)', re.S)


def tag_exos(html, tags, where):
    seen = set()

    def repl(m):
        body = m.group(2)
        idm = re.search(r'"id":\s*"([^"]+)",', body)
        if not idm:
            raise SystemExit('%s: exercise without id' % where)
        eid = idm.group(1)
        if eid not in tags:
            raise SystemExit('%s: no EXO_TAGS entry for %s' % (where, eid))
        seen.add(eid)
        body = re.sub(r'\s*"concepts":\s*\[[^\]]*\],', '', body, count=1)
        idm = re.search(r'"id":\s*"[^"]+",', body)
        indent = re.search(r'\n([ \t]*)"id"', body)
        sep = '\n' + indent.group(1) if indent else ' '
        body = body[:idm.end()] + sep + '"concepts": ' + json.dumps(tags[eid]) + ',' + body[idm.end():]
        json.loads(body)  # must stay valid JSON
        return m.group(1) + body + m.group(3)

    out = EXO_SPEC.sub(repl, html)
    if seen != set(tags):
        raise SystemExit('%s: exercise mismatch, missing %s, extra %s'
                         % (where, sorted(set(tags) - seen), sorted(seen - set(tags))))
    return out


def grammar_bounds(html):
    start = html.find('<section id="grammaire">')
    if start < 0:
        raise SystemExit('no #grammaire section')
    end = html.find('</section>', start)
    return start, end


def tag_html(html, levels, where):
    start, end = grammar_bounds(html)
    sec = html[start:end]
    lv_marks = [(m.start(), m.group(1)) for m in re.finditer(r'<div data-lv="(\w+)"', sec)]
    seen = set()

    def level_at(pos):
        lv = None
        for p, v in lv_marks:
            if p <= pos:
                lv = v
        return lv

    def repl(m):
        title = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        g = re.match(r'(G\d+)', title)
        if not g:
            return m.group(0)
        lv = level_at(m.start())
        ids = levels.get(lv, {}).get(g.group(1))
        if not ids:
            raise SystemExit('%s: no tag for %s %s (%s)' % (where, lv, g.group(1), title))
        seen.add((lv, g.group(1)))
        return '<h3 id="gram-%s-%s" data-gp="%s">%s</h3>' % (lv, g.group(1), ' '.join(ids), m.group(1))

    new_sec = H3.sub(repl, sec)
    expected = {(lv, g) for lv, gs in levels.items() for g in gs}
    if seen != expected:
        raise SystemExit('%s: mapping mismatch, missing %s, extra %s'
                         % (where, sorted(expected - seen), sorted(seen - expected)))
    return html[:start] + new_sec + html[end:]


def main():
    check = '--check' in sys.argv
    with open(os.path.join(ROOT, 'content', 'curriculum.json'), encoding='utf-8') as f:
        ids = {p['id'] for p in json.load(f)['points']}
    used = {c for lv in TAGS.values() for gs in lv.values() for cs in gs.values() for c in cs}
    used |= {c for ex in EXO_TAGS.values() for cs in ex.values() for c in cs}
    unknown = sorted(used - ids)
    if unknown:
        raise SystemExit('unknown concept ids: %s' % unknown)
    dirty = []
    for page, levels in TAGS.items():
        built = os.path.join(ROOT, page)
        for path in filter(None, [built, src_part4(page), src_part(page, 5)]):
            with open(path, encoding='utf-8') as f:
                html = f.read()
            where = os.path.relpath(path, ROOT)
            new = html
            if path in (built, src_part4(page)):
                new = tag_html(new, levels, where)
            if path in (built, src_part(page, 5)):
                new = tag_exos(new, EXO_TAGS[page], where)
            if new != html:
                dirty.append(os.path.relpath(path, ROOT))
                if not check:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new)
    if check:
        if dirty:
            print('untagged / stale:', ', '.join(dirty))
            sys.exit(1)
        print('grammar + exercise tags up to date')
    else:
        print('tagged:', ', '.join(dirty) if dirty else 'nothing to change')


if __name__ == '__main__':
    main()
