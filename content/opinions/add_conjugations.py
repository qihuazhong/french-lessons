#!/usr/bin/env python3
"""Inject hover conjugation tooltips for verb entries in the vocab tables.

Wraps the verb term in <span class="verb">…<span class="conj">…</span></span>
with a grid of the frequently used forms: présent, passé composé, imparfait,
futur, subjonctif présent. Rebuilds every run: first reverts existing
tooltips, then injects fresh ones (so data edits here always take effect).
"""
import re

PAGE = 'lecon-opinions-impopulaires.html'
TENSES = ['présent', 'passé composé', 'imparfait', 'futur', 'subjonctif']

VERBS = [
    {'match': 'digérer', 'wrapped': 'digérer', 'aux': 'avoir', 'rows': [
        ('je', ['digère', 'ai digéré', 'digérais', 'digérerai', 'digère']),
        ('tu', ['digères', 'as digéré', 'digérais', 'digéreras', 'digères']),
        ('il/elle', ['digère', 'a digéré', 'digérait', 'digérera', 'digère']),
        ('nous', ['digérons', 'avons digéré', 'digérions', 'digérerons', 'digérions']),
        ('vous', ['digérez', 'avez digéré', 'digériez', 'digérerez', 'digériez']),
        ('ils/elles', ['digèrent', 'ont digéré', 'digéraient', 'digéreront', 'digèrent']),
    ]},
    {'match': 'avoir peur', 'wrapped': 'avoir peur', 'aux': 'avoir', 'rows': [
        ('je', ['ai peur', 'ai eu peur', 'avais peur', 'aurai peur', 'aie peur']),
        ('tu', ['as peur', 'as eu peur', 'avais peur', 'auras peur', 'aies peur']),
        ('il/elle', ['a peur', 'a eu peur', 'avait peur', 'aura peur', 'ait peur']),
        ('nous', ['avons peur', 'avons eu peur', 'avions peur', 'aurons peur', 'ayons peur']),
        ('vous', ['avez peur', 'avez eu peur', 'aviez peur', 'aurez peur', 'ayez peur']),
        ('ils/elles', ['ont peur', 'ont eu peur', 'avaient peur', 'auront peur', 'aient peur']),
    ]},
    {'match': 'grignoter', 'wrapped': 'grignoter', 'aux': 'avoir', 'rows': [
        ('je', ['grignote', 'ai grignoté', 'grignotais', 'grignoterai', 'grignote']),
        ('tu', ['grignotes', 'as grignoté', 'grignotais', 'grignoteras', 'grignotes']),
        ('il/elle', ['grignote', 'a grignoté', 'grignotait', 'grignotera', 'grignote']),
        ('nous', ['grignotons', 'avons grignoté', 'grignotions', 'grignoterons', 'grignotions']),
        ('vous', ['grignotez', 'avez grignoté', 'grignotiez', 'grignoterez', 'grignotiez']),
        ('ils/elles', ['grignotent', 'ont grignoté', 'grignotaient', 'grignoteront', 'grignotent']),
    ]},
    {'match': "s'ennuyer", 'wrapped': "s'ennuyer", 'aux': 'être', 'rows': [
        ('je', ["m'ennuie", 'me suis ennuyé(e)', "m'ennuyais", "m'ennuierai", "m'ennuie"]),
        ('tu', ["t'ennuies", "t'es ennuyé(e)", "t'ennuyais", "t'ennuieras", "t'ennuies"]),
        ('il/elle', ["s'ennuie", "s'est ennuyé(e)", "s'ennuyait", "s'ennuiera", "s'ennuie"]),
        ('nous', ['nous ennuyons', 'nous sommes ennuyé(e)s', 'nous ennuyions', 'nous ennuierons', 'nous ennuyions']),
        ('vous', ['vous ennuyez', 'vous êtes ennuyé(e)(s)', 'vous ennuyiez', 'vous ennuierez', 'vous ennuyiez']),
        ('ils/elles', ["s'ennuient", 'se sont ennuyé(e)s', "s'ennuyaient", "s'ennuieront", "s'ennuient"]),
    ]},
    {'match': 'revenir à la mode', 'wrapped': 'revenir', 'suffix': ' à la mode', 'aux': 'être',
     'title': 'revenir (à la mode)', 'rows': [
        ('je', ['reviens', 'suis revenu(e)', 'revenais', 'reviendrai', 'revienne']),
        ('tu', ['reviens', 'es revenu(e)', 'revenais', 'reviendras', 'reviennes']),
        ('il/elle', ['revient', 'est revenu(e)', 'revenait', 'reviendra', 'revienne']),
        ('nous', ['revenons', 'sommes revenu(e)s', 'revenions', 'reviendrons', 'revenions']),
        ('vous', ['revenez', 'êtes revenu(e)(s)', 'reveniez', 'reviendrez', 'reveniez']),
        ('ils/elles', ['reviennent', 'sont revenu(e)s', 'revenaient', 'reviendront', 'reviennent']),
    ]},
    {'match': 'rater', 'wrapped': 'rater', 'aux': 'avoir', 'rows': [
        ('je', ['rate', 'ai raté', 'ratais', 'raterai', 'rate']),
        ('tu', ['rates', 'as raté', 'ratais', 'rateras', 'rates']),
        ('il/elle', ['rate', 'a raté', 'ratait', 'ratera', 'rate']),
        ('nous', ['ratons', 'avons raté', 'rations', 'raterons', 'rations']),
        ('vous', ['ratez', 'avez raté', 'ratiez', 'raterez', 'ratiez']),
        ('ils/elles', ['ratent', 'ont raté', 'rataient', 'rateront', 'ratent']),
    ]},
    {'match': 'rédiger', 'wrapped': 'rédiger', 'aux': 'avoir', 'rows': [
        ('je', ['rédige', 'ai rédigé', 'rédigeais', 'rédigerai', 'rédige']),
        ('tu', ['rédiges', 'as rédigé', 'rédigeais', 'rédigeras', 'rédiges']),
        ('il/elle', ['rédige', 'a rédigé', 'rédigeait', 'rédigera', 'rédige']),
        ('nous', ['rédigeons', 'avons rédigé', 'rédigions', 'rédigerons', 'rédigions']),
        ('vous', ['rédigez', 'avez rédigé', 'rédigiez', 'rédigerez', 'rédigiez']),
        ('ils/elles', ['rédigent', 'ont rédigé', 'rédigeaient', 'rédigeront', 'rédigent']),
    ]},
    {'match': 'être confronté à', 'wrapped': 'être confronté à', 'aux': 'être', 'rows': [
        ('je', ['suis confronté(e)', 'ai été confronté(e)', 'étais confronté(e)', 'serai confronté(e)', 'sois confronté(e)']),
        ('tu', ['es confronté(e)', 'as été confronté(e)', 'étais confronté(e)', 'seras confronté(e)', 'sois confronté(e)']),
        ('il/elle', ['est confronté(e)', 'a été confronté(e)', 'était confronté(e)', 'sera confronté(e)', 'soit confronté(e)']),
        ('nous', ['sommes confronté(e)s', 'avons été confronté(e)s', 'étions confronté(e)s', 'serons confronté(e)s', 'soyons confronté(e)s']),
        ('vous', ['êtes confronté(e)(s)', 'avez été confronté(e)(s)', 'étiez confronté(e)(s)', 'serez confronté(e)(s)', 'soyez confronté(e)(s)']),
        ('ils/elles', ['sont confronté(e)s', 'ont été confronté(e)s', 'étaient confronté(e)s', 'seront confronté(e)s', 'soient confronté(e)s']),
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


def revert(src):
    for v in VERBS:
        pat = re.compile(
            r'><span class="verb">' + re.escape(v['wrapped']) +
            r'<span class="conj">.*?</span></span></span></span><button class="say"', re.S)
        src = pat.sub('>' + v['match'] + '<button class="say"', src)
    return src


def main():
    src = open(PAGE, encoding='utf-8').read()
    src = revert(src)
    done = 0
    for v in VERBS:
        old = '>%s<button' % v['match']
        if old not in src:
            print('row not found: %s' % v['match'])
            continue
        suffix = v.get('suffix', '')
        new = '><span class="verb">%s%s</span>%s<button' % (v['wrapped'], build_tooltip(v), suffix)
        src = src.replace(old, new, 1)
        done += 1
    open(PAGE, 'w', encoding='utf-8').write(src)
    print('wrapped %d verbs (with subjonctif)' % done)


if __name__ == '__main__':
    main()
