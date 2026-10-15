#!/usr/bin/env python3
"""Assemble a lesson page from its source parts (the generalized builder).

Usage (run from the repo root):
    python3 tools/build_page.py content/<lesson>/src lecon-<lesson>.html

- splices tools/framework/style.html into <head> (plus the shared exos.css link)
- splices tools/framework/script.html before </body>
- expands [[SAY:text]] / [[SAY2:term|example]] placeholders into .say buttons
The build is idempotent: rebuilding always starts from the source parts.
After building, run the content-specific injections you need (conjugation
tooltips), then the clip pipeline (tools/cut_clips.py -> tools/add_youtube.py)
and finally tools/add_lessons_nav.py.
"""
import html as html_mod
import os
import re
import sys

PARTS_DIR = sys.argv[1] if len(sys.argv) > 1 else 'content/ai/src'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'lecon-ai.html'
FRAMEWORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'framework')

ICON = (
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path d="M3 9v6h4l5 4V5l-5 4H3z" fill="currentColor"/>'
    '<path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '<path d="M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '</svg>'
)


def button(term, example=None):
    attrs = 'data-say="%s"' % html_mod.escape(term.strip(), quote=True)
    if example:
        attrs += ' data-say2="%s"' % html_mod.escape(example.strip(), quote=True)
    return ('<button class="say" type="button" %s aria-label="Écouter" '
            'title="Écouter (extrait de la vidéo)">%s</button>' % (attrs, ICON))


def expand(m):
    inner = m.group(1)
    if '|' in inner:
        term, example = inner.split('|', 1)
        return button(term, example)
    return button(inner)


def main():
    style = open(os.path.join(FRAMEWORK, 'style.html'), encoding='utf-8').read()
    script = open(os.path.join(FRAMEWORK, 'script.html'), encoding='utf-8').read()
    parts = []
    for n in ('part1.html', 'part2.html', 'part3.html', 'part4.html', 'part5.html'):
        parts.append(open(os.path.join(PARTS_DIR, n), encoding='utf-8').read())
    p1 = parts[0].split('<!--PART2-->')[0]
    p2 = parts[1].split('<!--PART3-->')[0]
    p3 = parts[2].split('<!--PART4-->')[0]
    p4 = parts[3].split('<!--PART5-->')[0]
    p5 = parts[4].replace('<!--SCRIPT_HERE-->', script)
    doc = p1.replace('</head>', style + '\n<link rel="stylesheet" href="exos.css">\n</head>') + p2 + p3 + p4 + p5
    doc = re.sub(r'\[\[SAY2?:([^\]]+)\]\]', expand, doc)
    assert '[[' not in doc, 'unexpanded placeholder remains'
    open(OUT, 'w', encoding='utf-8').write(doc)
    print('wrote %s: %d chars, %d buttons' % (OUT, len(doc), doc.count('class="say"')))


if __name__ == '__main__':
    main()
