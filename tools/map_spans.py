#!/usr/bin/env python3
"""Map every .say button of lecon-ai.html to its spoken span in the video.

Fuzzy-aligns each target sentence to the whisper word stream (anchored on the
most distinctive token) and reports coverage + the verbatim heard text, so the
lesson texts and clip spans can be validated/aligned before cutting.
"""
import difflib
import html as html_mod
import json
import re
import sys
import unicodedata

PAGE = sys.argv[1] if len(sys.argv) > 1 else 'lecon-ai.html'
WHISPER = sys.argv[2] if len(sys.argv) > 2 else '/tmp/whisper_full_ai.json'
OUT = sys.argv[3] if len(sys.argv) > 3 else '/tmp/map_ai.json'


def norm_tokens(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.findall(r'[a-z0-9]+', s)


full = json.load(open(WHISPER, encoding='utf-8'))
stream = []
for seg in full:
    for w in seg['words']:
        toks = norm_tokens(w['w'])
        if toks:
            stream.append({'t': toks[0], 'w': w['w'], 's': w['s'], 'e': w['e']})
DUR = stream[-1]['e'] if stream else 0


def ratio(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def align_from(target, st, max_gap=7, thr=0.72):
    j = st
    matched = []
    for tw in target:
        found = None
        for hj in range(j, min(j + max_gap, len(stream))):
            if ratio(tw, stream[hj]['t']) >= thr:
                found = hj
                break
        if found is not None:
            matched.append(found)
            j = found + 1
    return matched


def match(target):
    tt = norm_tokens(target)
    if not tt:
        return None
    best = (0.0, None, None)
    pivots = sorted(set(tt), key=len, reverse=True)[:3]
    for pivot in pivots:
        pi = tt.index(pivot)
        cands = [i for i, x in enumerate(stream) if ratio(pivot, x['t']) >= 0.75]
        for c in cands:
            for st in range(max(0, c - pi - 4), c - pi + 2):
                if st < 0:
                    continue
                matched = align_from(tt, st)
                if not matched:
                    continue
                cov = len(matched) / len(tt)
                if cov > best[0]:
                    best = (cov, matched[0], matched[-1])
        if best[0] >= 0.7:
            break
    return best


src = open(PAGE, encoding='utf-8').read()
items = []
for n, m in enumerate(re.finditer(r'<button class="say"[^>]*>', src), start=1):
    tag = m.group(0)
    s2 = re.search(r'data-say2="([^"]*)"', tag)
    sa = re.search(r'data-say="([^"]*)"', tag)
    items.append({'id': 'v%03d' % n,
                  'say': html_mod.unescape(sa.group(1)) if sa else '',
                  'say2': html_mod.unescape(s2.group(1)) if s2 else ''})

report = {}
for it in items:
    target = it['say2'] or it['say']
    r = match(target)
    if not r or r[1] is None:
        print('%s NO MATCH | %s' % (it['id'], target[:70]))
        continue
    cov, i0, i1 = r
    s = stream[i0]['s']
    e = stream[i1]['e']
    verbatim = ' '.join(stream[k]['w'] for k in range(i0, i1 + 1))
    report[it['id']] = {'cov': round(cov, 2), 'span': [round(max(0, s - 0.12), 2), round(min(DUR, e + 0.25), 2)],
                        'target': target, 'verbatim': verbatim}
    flag = 'OK ' if cov >= 0.85 else ('~  ' if cov >= 0.65 else 'LOW')
    print('%s %s cov=%.2f %7.2f-%7.2f' % (it['id'], flag, cov, max(0, s - 0.12), min(DUR, e + 0.25)))
    print('    text: %s' % target[:95])
    print('    sayd: %s' % verbatim[:95])

json.dump(report, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('\nsaved %s (%d/%d matched)' % (OUT, len(report), len(items)))
