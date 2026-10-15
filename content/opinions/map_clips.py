#!/usr/bin/env python3
"""Map each lesson button to its exact spoken span in the full Whisper transcript.

Anchors a fuzzy word-alignment search around the clip's current span and
reports, for every button: coverage, proposed new span, and the verbatim
spoken text of that span (for reviewing/updating the lesson text).
"""
import difflib
import json
import re
import unicodedata


def norm_tokens(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.findall(r'[a-z0-9]+', s)


full = json.load(open('/tmp/whisper_full.json', encoding='utf-8'))
stream = []
for seg in full:
    for w in seg['words']:
        toks = norm_tokens(w['w'])
        if toks:
            stream.append({'t': toks[0], 'w': w['w'], 's': w['s'], 'e': w['e']})

spans = json.load(open('spans.json', encoding='utf-8'))
audit = {x['id']: x for x in json.load(open('/tmp/clip_audit.json', encoding='utf-8'))}
DUR = 743.4


def match(tt, cs, ce, window=30.0, max_gap=7, thr=0.72):
    idxs = [i for i, x in enumerate(stream) if cs - window <= x['s'] <= ce + window]
    best = (0, None, None)
    for st in idxs:
        j = st
        matched = []
        for tw in tt:
            found = None
            for hj in range(j, min(j + max_gap, len(stream))):
                if difflib.SequenceMatcher(None, tw, stream[hj]['t']).ratio() >= thr:
                    found = hj
                    break
            if found is not None:
                matched.append(found)
                j = found + 1
        if matched:
            cov = len(matched) / len(tt)
            if cov > best[0]:
                best = (cov, matched[0], matched[-1])
    return best


report = {}
for vid in sorted(spans):
    cs, ce = spans[vid]
    item = audit[vid]
    target = item['say2'] or item['say']
    tt = norm_tokens(target)
    if not tt:
        continue
    cov, i0, i1 = match(tt, cs, ce)
    if i0 is None:
        print('%s cov=0.00  NO MATCH | %s' % (vid, target))
        continue
    new_s = max(0.0, stream[i0]['s'] - 0.12)
    new_e = min(DUR, stream[i1]['e'] + 0.25)
    verbatim = ' '.join(stream[k]['w'] for k in range(i0, i1 + 1))
    report[vid] = {'cov': round(cov, 2), 'old': [cs, ce], 'new': [round(new_s, 2), round(new_e, 2)],
                   'target': target, 'verbatim': verbatim}
    print('%s cov=%.2f %6.2f-%6.2f -> %6.2f-%6.2f' % (vid, cov, cs, ce, new_s, new_e))
    print('   text: %s' % target)
    print('   sayd: %s' % verbatim[:120])

json.dump(report, open('/tmp/map_results.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('\nsaved /tmp/map_results.json')
