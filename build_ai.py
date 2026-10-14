#!/usr/bin/env python3
"""Assemble lecon-ai.html from src-ai/ parts.

- splices src-ai/style.html into <head> and src-ai/script.html before </body>
- expands [[SAY:text]] / [[SAY2:term|example]] placeholders into .say buttons
Idempotent: rebuilding always starts from the source parts.
"""
import html as html_mod
import re

PARTS = ['src-ai/part1.html', 'src-ai/part2.html', 'src-ai/part3.html',
         'src-ai/part4.html', 'src-ai/part5.html']
OUT = 'lecon-ai.html'

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
    style = open('src-ai/style.html', encoding='utf-8').read()
    script = open('src-ai/script.html', encoding='utf-8').read()
    parts = [open(p, encoding='utf-8').read() for p in PARTS]
    p1 = parts[0].split('<!--PART2-->')[0]
    p2 = parts[1].split('<!--PART3-->')[0]
    p3 = parts[2].split('<!--PART4-->')[0]
    p4 = parts[3].split('<!--PART5-->')[0]
    p5 = parts[4].replace('<!--SCRIPT_HERE-->', script)
    doc = p1.replace('</head>', style + '\n<link rel="stylesheet" href="exos.css">\n</head>') + p2 + p3 + p4 + p5
    doc = re.sub(r'\[\[SAY2?:([^\]]+)\]\]', expand, doc)
    assert '[[' not in doc.replace('[[slnc', ''), 'unexpanded placeholder remains'
    open(OUT, 'w', encoding='utf-8').write(doc)
    print('wrote %s: %d chars, %d buttons' % (OUT, len(doc), doc.count('class="say"')))


if __name__ == '__main__':
    main()
