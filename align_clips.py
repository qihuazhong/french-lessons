#!/usr/bin/env python3
"""Refine clip boundaries so each clip contains exactly its displayed sentence.

Uses the Whisper word timings from /tmp/clip_audit.json (word times are
clip-relative) plus the current absolute spans from spans.json. For each clip,
fuzzy-aligns the target sentence words to the heard words; if coverage is good,
tightens the clip to just that word span. Writes clip_overrides.json and
prints a report; low-coverage clips are flagged for manual text review.
"""
import difflib
import json
import re
import unicodedata

SPANS = 'spans.json'
AUDIT = '/tmp/clip_audit.json'
OUT = 'clip_overrides.json'

PAD_START = 0.12
PAD_END = 0.25
COVERAGE_MIN = 0.7


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.findall(r'[a-z0-9]+', s)


def fuzzy_align(target, heard, thr=0.75, max_skip=4):
    matches = []
    j = 0
    for tw in target:
        best = None
        for hj in range(j, min(j + max_skip, len(heard))):
            if difflib.SequenceMatcher(None, tw, heard[hj]).ratio() >= thr:
                best = hj
                break
        if best is not None:
            matches.append(best)
            j = best + 1
    return matches


def main():
    spans = json.load(open(SPANS, encoding='utf-8'))
    audit = {x['id']: x for x in json.load(open(AUDIT, encoding='utf-8'))}
    overrides = {}
    flags = []

    for vid in sorted(spans):
        abs_start, abs_end = spans[vid]
        item = audit.get(vid)
        if not item:
            continue
        target_text = item['say2'] or item['say']
        target = norm(target_text)
        if not target:
            continue
        words = item['words']
        heard = [norm(w['w']) for w in words]
        heard = [h[0] if h else '' for h in heard]
        matches = fuzzy_align(target, heard)
        coverage = len(matches) / len(target) if target else 0

        if coverage < COVERAGE_MIN or not matches:
            flags.append((vid, coverage, target_text, item['heard']))
            continue

        first, last = matches[0], matches[-1]
        ws = abs_start + words[first]['s']
        we = abs_start + words[last]['e']
        new_start = max(abs_start, ws - PAD_START)
        new_end = min(abs_end, we + PAD_END)

        d_start = abs_start - new_start
        d_end = new_end - abs_end
        changed = d_start > 0.1 or d_end > 0.1
        if changed:
            overrides[vid] = [round(new_start, 3), round(new_end, 3)]
        print('%s cov=%.2f %s | %6.2f-%6.2f -> %6.2f-%6.2f (%+.2f/%+.2f) | %s'
              % (vid, coverage, 'TRIM' if changed else 'keep', abs_start, abs_end,
                 new_start, new_end, -d_start, d_end, target_text[:60]))

    json.dump(overrides, open(OUT, 'w', encoding='utf-8'), indent=1)
    print('\n%d overrides written to %s' % (len(overrides), OUT))
    if flags:
        print('\n== FLAGGED (text/audio mismatch, update text):')
        for vid, cov, tgt, heard in flags:
            print('%s cov=%.2f\n   text : %s\n   heard: %s' % (vid, cov, tgt, heard[:110]))


if __name__ == '__main__':
    main()
