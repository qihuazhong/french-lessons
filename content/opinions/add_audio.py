#!/usr/bin/env python3
"""Inject .say (Web Speech API) buttons into vocab rows and expression cards
of lecon-opinions-impopulaires.html. Idempotent: re-running skips items that
already have buttons, so the script can be reused when the lesson changes."""
import html
import re

PATH = "lecon-opinions-impopulaires.html"

ICON = (
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path d="M3 9v6h4l5 4V5l-5 4H3z" fill="currentColor"/>'
    '<path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '<path d="M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '</svg>'
)


def clean(text):
    t = re.sub(r'<span class="badge[^"]*">.*?</span>', ' ', text, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t)
    t = t.replace('«', ' ').replace('»', ' ')
    t = t.replace('(avec…)', ' avec ').replace('(le délire)', ' le délire ')
    t = re.sub(r'\((nm|nf|fam\.?)\)', ' ', t)
    t = re.sub(r'\(([^()]*)\)', lambda m: ' ' + m.group(1).replace('…', ' ') + ' ', t)
    t = t.replace('qch', 'quelque chose').replace('qqn', "quelqu'un")
    t = t.replace(' / ', ', ')
    t = t.replace('—', ' ')
    return re.sub(r'\s+', ' ', t).strip()


def esc(t):
    return html.escape(t, quote=True)


def make_button(say, say2=None):
    attrs = ' data-say="%s"' % esc(say)
    if say2 and say2.rstrip('.,!?…') != say.rstrip('.,!?…'):
        attrs += ' data-say2="%s"' % esc(say2)
    return ('<button class="say" type="button"%s aria-label="Écouter" title="Écouter">%s</button>'
            % (attrs, ICON))


ROW = re.compile(r'<tr><td>(.*?)</td><td>(.*?)</td><td class="ex">(.*?)</td></tr>', re.S)


def process_vocab(body):
    def repl(m):
        term, sense, ex = m.groups()
        if '<button' in term:
            return m.group(0)
        return '<tr><td>%s%s</td><td>%s</td><td class="ex">%s</td></tr>' % (
            term, make_button(clean(term), clean(ex)), sense, ex)
    return ROW.sub(repl, body)


EXPR = re.compile(
    r'<div class="expr">\s*<div class="titre">(.*?)</div>'
    r'(\s*<div class="sens">.*?</div>\s*<div class="usage">)(.*?)(</div>\s*</div>)',
    re.S)


def process_expr(body):
    def repl(m):
        title, mid, usage, tail = m.groups()
        quotes = re.findall(r'«\s*(.*?)\s*»', usage, re.S)
        say2 = clean(quotes[0]) if quotes else clean(usage)
        return ('<div class="expr">\n        <div class="titre-row">'
                '<div class="titre">%s</div>%s</div>%s%s%s'
                % (title, make_button(clean(title), say2), mid, usage, tail))
    return EXPR.sub(repl, body)


def process_section(src, sec_id, fn):
    start = src.index('<section id="%s">' % sec_id)
    end = src.index('</section>', start)
    return src[:start] + fn(src[start:end]) + src[end:]


def main():
    src = open(PATH, encoding='utf-8').read()
    orig = src
    src = process_section(src, 'vocabulaire', process_vocab)
    src = process_section(src, 'expressions', process_expr)
    if src != orig:
        open(PATH, 'w', encoding='utf-8').write(src)
        print('updated:', PATH)
    print('total say buttons:', src.count('class="say"'))
    print('with example:', src.count('data-say2='))


if __name__ == '__main__':
    main()
