#!/usr/bin/env python3
"""Hover conjugation tooltips for the vocab verbs of lecon-dommage.html.
Rebuilds from scratch each run (reverts existing tooltips first)."""
import re

PAGE = 'lecon-dommage.html'
TENSES = ['présent', 'passé composé', 'imparfait', 'futur', 'subjonctif']

VERBS = [
    {'match': 'sourire (verbe)', 'wrapped': 'sourire', 'suffix': ' (verbe)', 'aux': 'avoir', 'rows': [
        ('je', ['souris', 'ai souri', 'souriais', 'sourirai', 'sourie']),
        ('tu', ['souris', 'as souri', 'souriais', 'souriras', 'souries']),
        ('il/elle', ['sourit', 'a souri', 'souriait', 'sourira', 'sourie']),
        ('nous', ['sourions', 'avons souri', 'souriions', 'sourirons', 'souriions']),
        ('vous', ['souriez', 'avez souri', 'souriiez', 'sourirez', 'souriiez']),
        ('ils/elles', ['sourient', 'ont souri', 'souriaient', 'souriront', 'sourient']),
    ]},
    {'match': 'engueuler (qqn)', 'wrapped': 'engueuler', 'suffix': ' (qqn)', 'aux': 'avoir',
     'anchor': '>engueuler (qqn) <span', 'insert': '><span class="verb">engueuler%s</span> (qqn) <span', 'rows': [
        ('je', ['engueule', 'ai engueulé', 'engueulais', 'engueulerai', 'engueule']),
        ('tu', ['engueules', 'as engueulé', 'engueulais', 'engueuleras', 'engueules']),
        ('il/elle', ['engueule', 'a engueulé', 'engueulait', 'engueulera', 'engueule']),
        ('nous', ['engueulons', 'avons engueulé', 'engueulions', 'engueulerons', 'engueulions']),
        ('vous', ['engueulez', 'avez engueulé', 'engueuliez', 'engueulerez', 'engueuliez']),
        ('ils/elles', ['engueulent', 'ont engueulé', 'engueulaient', 'engueuleront', 'engueulent']),
    ]},
    {'match': 'suivre (qqn)', 'wrapped': 'suivre', 'suffix': ' (qqn)', 'aux': 'avoir', 'rows': [
        ('je', ['suis', 'ai suivi', 'suivais', 'suivrai', 'suive']),
        ('tu', ['suis', 'as suivi', 'suivais', 'suivras', 'suives']),
        ('il/elle', ['suit', 'a suivi', 'suivait', 'suivra', 'suive']),
        ('nous', ['suivons', 'avons suivi', 'suivions', 'suivrons', 'suivions']),
        ('vous', ['suivez', 'avez suivi', 'suiviez', 'suivrez', 'suiviez']),
        ('ils/elles', ['suivent', 'ont suivi', 'suivaient', 'suivront', 'suivent']),
    ]},
    {'match': 'déprimer', 'wrapped': 'déprimer', 'aux': 'avoir', 'rows': [
        ('je', ['déprime', 'ai déprimé', 'déprimais', 'déprimerai', 'déprime']),
        ('tu', ['déprimes', 'as déprimé', 'déprimais', 'déprimeras', 'déprimes']),
        ('il/elle', ['déprime', 'a déprimé', 'déprimait', 'déprimera', 'déprime']),
        ('nous', ['déprimons', 'avons déprimé', 'déprimions', 'déprimerons', 'déprimions']),
        ('vous', ['déprimez', 'avez déprimé', 'déprimiez', 'déprimerez', 'déprimiez']),
        ('ils/elles', ['dépriment', 'ont déprimé', 'déprimaient', 'déprimeront', 'dépriment']),
    ]},
    {'match': 'se tromper', 'wrapped': 'se tromper', 'aux': 'être', 'rows': [
        ('je', ['me trompe', 'me suis trompé(e)', 'me trompais', 'me tromperai', 'me trompe']),
        ('tu', ['te trompes', "t'es trompé(e)", 'te trompais', 'te tromperas', 'te trompes']),
        ('il/elle', ['se trompe', "s'est trompé(e)", 'se trompait', 'se trompera', 'se trompe']),
        ('nous', ['nous trompons', 'nous sommes trompé(e)s', 'nous trompions', 'nous tromperons', 'nous trompions']),
        ('vous', ['vous trompez', 'vous êtes trompé(e)(s)', 'vous trompiez', 'vous tromperez', 'vous trompiez']),
        ('ils/elles', ['se trompent', 'se sont trompé(e)s', 'se trompaient', 'se tromperont', 'se trompent']),
    ]},
    {'match': 'élever (un enfant)', 'wrapped': 'élever', 'suffix': ' (un enfant)', 'aux': 'avoir', 'rows': [
        ('je', ['élève', 'ai élevé', 'élevais', 'élèverai', 'élève']),
        ('tu', ['élèves', 'as élevé', 'élevais', 'élèveras', 'élèves']),
        ('il/elle', ['élève', 'a élevé', 'élevait', 'élèvera', 'élève']),
        ('nous', ['élevons', 'avons élevé', 'élevions', 'élèverons', 'élevions']),
        ('vous', ['élevez', 'avez élevé', 'éleviez', 'élèverez', 'éléviez']),
        ('ils/elles', ['élèvent', 'ont élevé', 'élevaient', 'élèveront', 'élèvent']),
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
