#!/usr/bin/env python3
"""Inject data-yt="start,end" (from clip_overrides.json) into every .say button,
so the floating YouTube player can jump to each clip's exact segment.
Idempotent: rebuilds the attribute on every run."""
import json
import re
import sys

PAGE = sys.argv[1] if len(sys.argv) > 1 else 'lecon-opinions-impopulaires.html'
OVER_JSON = sys.argv[2] if len(sys.argv) > 2 else 'content/opinions/clip_overrides.json'
spans = json.load(open(OVER_JSON, encoding='utf-8'))
src = open(PAGE, encoding='utf-8').read()


def repl(m):
    tag = m.group(0)
    am = re.search(r'data-audio="[^"]*/(v\d+)\.m4a"', tag)
    if not am:
        return tag
    span = spans.get(am.group(1))
    if not span:
        return tag
    tag = re.sub(r' data-yt="[^"]*"', '', tag)
    return tag.replace(' data-audio=', ' data-yt="%s,%s" data-audio=' % (span[0], span[1]), 1)


src = re.sub(r'<button class="say"[^>]*>', repl, src)
open(PAGE, 'w', encoding='utf-8').write(src)
print('data-yt injected into %d buttons' % src.count('data-yt='))
