#!/usr/bin/env python3
"""Hover conjugation tooltips for the vocab verbs of lecon-france.html.
Rebuilds from scratch each run (reverts existing tooltips first)."""
import re

PAGE = 'lecon-france.html'
TENSES = ['présent', 'passé composé', 'imparfait', 'futur', 'subjonctif']

VERBS = [
    {'match': 'manifester', 'wrapped': 'manifester', 'aux': 'avoir', 'rows': [
        ('je', ['manifeste', 'ai manifesté', 'manifestais', 'manifesterai', 'manifeste']),
        ('tu', ['manifestes', 'as manifesté', 'manifestais', 'manifesteras', 'manifestes']),
        ('il/elle', ['manifeste', 'a manifesté', 'manifestait', 'manifestera', 'manifeste']),
        ('nous', ['manifestons', 'avons manifesté', 'manifestions', 'manifesterons', 'manifestions']),
        ('vous', ['manifestez', 'avez manifesté', 'manifestiez', 'manifesterez', 'manifestiez']),
        ('ils/elles', ['manifestent', 'ont manifesté', 'manifestaient', 'manifesteront', 'manifestent']),
    ]},
    {'match': 'déformer', 'wrapped': 'déformer', 'aux': 'avoir', 'rows': [
        ('je', ['déforme', 'ai déformé', 'déformais', 'déformerai', 'déforme']),
        ('tu', ['déformes', 'as déformé', 'déformais', 'déformeras', 'déformes']),
        ('il/elle', ['déforme', 'a déformé', 'déformait', 'déformera', 'déforme']),
        ('nous', ['déformons', 'avons déformé', 'déformions', 'déformerons', 'déformions']),
        ('vous', ['déformez', 'avez déformé', 'déformiez', 'déformerez', 'déformiez']),
        ('ils/elles', ['déforment', 'ont déformé', 'déformaient', 'déformeront', 'déforment']),
    ]},
    {'match': 'dégénérer', 'wrapped': 'dégénérer', 'aux': 'avoir', 'rows': [
        ('je', ['dégénère', 'ai dégénéré', 'dégénérais', 'dégénérerai', 'dégénère']),
        ('tu', ['dégénères', 'as dégénéré', 'dégénérais', 'dégénéreras', 'dégénères']),
        ('il/elle', ['dégénère', 'a dégénéré', 'dégénérait', 'dégénérera', 'dégénère']),
        ('nous', ['dégénérons', 'avons dégénéré', 'dégénérerions', 'dégénérerons', 'dégénérerions']),
        ('vous', ['dégénérez', 'avez dégénéré', 'dégénériez', 'dégénérerez', 'dégénériez']),
        ('ils/elles', ['dégénèrent', 'ont dégénéré', 'dégénéraient', 'dégénéreront', 'dégénèrent']),
    ]},
    {'match': 'généraliser', 'wrapped': 'généraliser', 'aux': 'avoir', 'rows': [
        ('je', ['généralise', 'ai généralisé', 'généralisais', 'généraliserai', 'généralise']),
        ('tu', ['généralises', 'as généralisé', 'généralisais', 'généraliseras', 'généralises']),
        ('il/elle', ['généralise', 'a généralisé', 'généralisait', 'généralisera', 'généralise']),
        ('nous', ['généralisons', 'avons généralisé', 'généralisions', 'généraliserons', 'généralisions']),
        ('vous', ['généralisez', 'avez généralisé', 'généralisiez', 'généraliserez', 'généralisiez']),
        ('ils/elles', ['généralisent', 'ont généralisé', 'généralisaient', 'généraliseront', 'généralisent']),
    ]},
]


def build_tooltip(v):
    title = v.get('title', v['wrapped'])
    parts = ['<span class="conj">']
    parts.append('<span class="c-title">%s <em>· auxiliaire : %s</em></span>' % (title, v['aux']))
    parts.append('<span class="c-grid">')
    parts.append('<span class="c-h"></span>' + ''.join('<span class="c-h">%s</span>' % t for t in TENSES))
    for pron, forms in v['rows']:
        parts.append('<span class="c-p">%s</span>' % pron)
        for f in forms:
            parts.append('<span>%s</span>' % f)
    parts.append('</span></span>')
    return ''.join(parts)


def main():
    src = open(PAGE, encoding='utf-8').read()
    done = 0
    for v in VERBS:
        pat = re.compile(
            r'><span class="verb">' + re.escape(v['wrapped']) +
            r'<span class="conj">.*?</span></span></span></span>', re.S)
        src = pat.sub('>' + v['wrapped'], src)
        if 'anchor' in v:
            old = v['anchor']
            new = v['insert'] % build_tooltip(v)
        else:
            old = '>%s<button' % v['match']
            suffix = v.get('suffix', '')
            new = '><span class="verb">%s%s</span>%s<button' % (v['wrapped'], build_tooltip(v), suffix)
        if old not in src:
            print('row not found: %s' % v['match'])
            continue
        src = src.replace(old, new, 1)
        done += 1
    open(PAGE, 'w', encoding='utf-8').write(src)
    print('wrapped %d verbs' % done)


if __name__ == '__main__':
    main()
