#!/usr/bin/env python3
"""Hover conjugation tooltips for the vocab verbs of lecon-ai.html.
Rebuilds from scratch each run (reverts existing tooltips first)."""
import re

PAGE = 'lecon-ai.html'
TENSES = ['présent', 'passé composé', 'imparfait', 'futur', 'subjonctif']

VERBS = [
    {'match': "s'en servir", 'wrapped': "s'en servir", 'aux': 'avoir', 'rows': [
        ('je', ["m'en sers", "m'en suis servi(e)", "m'en servais", "m'en servirai", "m'en serve"]),
        ('tu', ["t'en sers", "t'en es servi(e)", "t'en servais", "t'en serviras", "t'en serves"]),
        ('il/elle', ["s'en sert", "s'en est servi(e)", "s'en servait", "s'en servira", "s'en serve"]),
        ('nous', ['nous en servons', 'nous en sommes servi(e)s', 'nous en servions', 'nous en servirons', 'nous en servions']),
        ('vous', ['vous en servez', 'vous en êtes servi(e)(s)', 'vous en serviez', 'vous en servirez', 'vous en serviez']),
        ('ils/elles', ["s'en servent", "s'en sont servi(e)s", "s'en servaient", "s'en serviront", "s'en servent"]),
    ]},
    {'match': 'se tenir au courant', 'wrapped': 'se tenir', 'suffix': ' au courant',
     'aux': 'être', 'title': 'se tenir (au courant)', 'rows': [
        ('je', ['me tiens', 'me suis tenu(e)', 'me tenais', 'me tiendrai', 'me tienne']),
        ('tu', ['te tiens', "t'es tenu(e)", 'te tenais', 'te tiendras', 'te tiennes']),
        ('il/elle', ['se tient', "s'est tenu(e)", 'se tenait', 'se tiendra', 'se tienne']),
        ('nous', ['nous tenons', 'nous sommes tenu(e)s', 'nous tenions', 'nous tiendrons', 'nous tenions']),
        ('vous', ['vous tenez', 'vous êtes tenu(e)(s)', 'vous teniez', 'vous tiendrez', 'vous teniez']),
        ('ils/elles', ['se tiennent', 'se sont tenu(e)s', 'se tenaient', 'se tiendront', 'se tiennent']),
    ]},
    {'match': 'remplacer (qqn)', 'wrapped': 'remplacer', 'suffix': ' (qqn)', 'aux': 'avoir', 'rows': [
        ('je', ['remplace', 'ai remplacé', 'remplaçais', 'remplacerai', 'remplace']),
        ('tu', ['remplaces', 'as remplacé', 'remplaçais', 'remplaceras', 'remplaces']),
        ('il/elle', ['remplace', 'a remplacé', 'remplaçait', 'remplacera', 'remplace']),
        ('nous', ['remplaçons', 'avons remplacé', 'remplacions', 'remplacerons', 'remplacions']),
        ('vous', ['remplacez', 'avez remplacé', 'remplaciez', 'remplacerez', 'remplaciez']),
        ('ils/elles', ['remplacent', 'ont remplacé', 'remplaçaient', 'remplaceront', 'remplacent']),
    ]},
    {'match': 'menacer', 'wrapped': 'menacer', 'aux': 'avoir', 'rows': [
        ('je', ['menace', 'ai menacé', 'menaçais', 'menacerai', 'menace']),
        ('tu', ['menaces', 'as menacé', 'menaçais', 'menaceras', 'menaces']),
        ('il/elle', ['menace', 'a menacé', 'menaçait', 'menacera', 'menace']),
        ('nous', ['menaçons', 'avons menacé', 'menacions', 'menacerons', 'menacions']),
        ('vous', ['menacez', 'avez menacé', 'menaciez', 'menacerez', 'menaciez']),
        ('ils/elles', ['menacent', 'ont menacé', 'menaçaient', 'menaceront', 'menacent']),
    ]},
    {'match': 'rédiger', 'wrapped': 'rédiger', 'aux': 'avoir', 'rows': [
        ('je', ['rédige', 'ai rédigé', 'rédigeais', 'rédigerai', 'rédige']),
        ('tu', ['rédiges', 'as rédigé', 'rédigeais', 'rédigeras', 'rédiges']),
        ('il/elle', ['rédige', 'a rédigé', 'rédigeait', 'rédigera', 'rédige']),
        ('nous', ['rédigeons', 'avons rédigé', 'rédigions', 'rédigerons', 'rédigions']),
        ('vous', ['rédigez', 'avez rédigé', 'rédigiez', 'rédigerez', 'rédigiez']),
        ('ils/elles', ['rédigent', 'ont rédigé', 'rédigeaient', 'rédigeront', 'rédigent']),
    ]},
    {'match': 'se pencher sur (qch)', 'wrapped': 'se pencher', 'suffix': ' sur (qch)',
     'aux': 'être', 'title': 'se pencher (sur qch)', 'rows': [
        ('je', ['me penche', 'me suis penché(e)', 'me penchais', 'me pencherai', 'me penche']),
        ('tu', ['te penches', "t'es penché(e)", 'te penchais', 'te pencheras', 'te penches']),
        ('il/elle', ['se penche', "s'est penché(e)", 'se penchait', 'se penchera', 'se penche']),
        ('nous', ['nous penchons', 'nous sommes penché(e)s', 'nous penchions', 'nous pencherons', 'nous penchions']),
        ('vous', ['vous penchez', 'vous êtes penché(e)(s)', 'vous penchiez', 'vous pencherez', 'vous penchiez']),
        ('ils/elles', ['se penchent', 'se sont penché(e)s', 'se penchaient', 'se pencheront', 'se penchent']),
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
        old = '>%s<button' % v['match']
        if old not in src:
            print('row not found: %s' % v['match'])
            continue
        suffix = v.get('suffix', '')
        new = '><span class="verb">%s%s</span>%s<button' % (v['wrapped'], build_tooltip(v), suffix)
        src = src.replace(old, new, 1)
        done += 1
    open(PAGE, 'w', encoding='utf-8').write(src)
    print('wrapped %d verbs' % done)


if __name__ == '__main__':
    main()
