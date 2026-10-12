#!/usr/bin/env python3
"""Align displayed example sentences with the (trimmed) audio clips.

For each vid in TEXT_UPDATES: replaces the first « … » passage after that
vid's button (the visible example in a vocab .ex cell or an expression
.usage div) and updates the button's data-say2 attribute. v035's data-say2
is removed (example now duplicates the card title). Idempotent.
"""
import html as html_mod
import re

PAGE = 'lecon-opinions-impopulaires.html'

TEXT_UPDATES = {
    'v011': "J'adore prendre des petits sachets de radis dans le train, par exemple, et les grignoter.",
    'v012': "Les fruits de mer, pour moi, c'est un peu aussi… trop, trop. Trop surcoté.",
    'v013': "Trop surcoté.",
    'v014': "Pour beaucoup de Parisiens, c'est un calvaire.",
    'v015': "Des endroits où il y a de l'intimité.",
    'v018': "Les bermudas… oui, ça revient hyper à la mode.",
    'v019': "Les doudounes sans manches. Je capte pas.",
    'v021': "Là où on a le plus froid, c'est vraiment les extrémités.",
    'v022': "Abonnez-vous pour ne rater aucun de nos futurs épisodes.",
    'v023': "Ce genre de trucs. Des romans de gare. On peut peut-être appeler ça comme ça.",
    'v026': "C'est attendu au niveau du style, au niveau des péripéties.",
    'v027': "J'aime bien la littérature qui est faite avec les tripes.",
    'v028': "Il n'y a pas assez de temps de fabrication, de maturation.",
    'v029': "C'est un peu méprisant, parce que c'est le même argument de ceux qui disent que le jazz, c'est la musique d'ascenseur.",
    'v030': "Un peu comme la tour Eiffel, des armatures.",
    'v032': "Je préfère quand c'est cosy, quand c'est plus serré. Donc un petit peu plus casanière.",
    'v033': "Il y a des rythmiques aussi, comme ça, un peu électro.",
    'v035': "C'est pas mon truc.",
    'v039': "Pour beaucoup de Parisiens, c'est un calvaire.",
    'v040': "J'avoue que j'ai pris la une aujourd'hui.",
    'v041': "Je capte pas du tout le délire.",
    'v042': "Mais ça, ça fait débat.",
    'v043': "Ça va à personne, ça.",
    'v044': "Un boomer, c'est quand on est… quand on est plus à la page.",
    'v046': "Je vais pas crier sur tous les toits.",
    'v047': "J'aime bien la littérature qui est faite avec les tripes.",
    'v049': "Tous les films dans l'espace, je supporte pas. J'arrive pas à accrocher.",
}

BTN_RE = r'<button[^>]*data-audio="audio/%s\.m4a"[^>]*>'


def main():
    src = open(PAGE, encoding='utf-8').read()
    for vid, text in sorted(TEXT_UPDATES.items()):
        m = re.search(BTN_RE % vid, src)
        if not m:
            print('button not found: %s' % vid)
            continue
        # 1. replace the visible quoted example after this button
        tail = src[m.end():]
        qm = re.search(r'«[^»]*»', tail)
        if qm:
            qs, qe = m.end() + qm.start(), m.end() + qm.end()
            src = src[:qs] + '« ' + text + ' »' + src[qe:]
        else:
            print('quote not found: %s' % vid)
        # 2. update the button's data-say2 attribute (re-locate: text edit was after the tag)
        m2 = re.search(BTN_RE % vid, src)
        tag = m2.group(0)
        attr = 'data-say2="%s"' % html_mod.escape(text, quote=True)
        if 'data-say2=' in tag:
            new_tag = re.sub(r'data-say2="[^"]*"', attr.replace('\\', '\\\\'), tag)
        else:
            new_tag = tag.replace(' data-audio=', ' ' + attr + ' data-audio=', 1)
        src = src[:m2.start()] + new_tag + src[m2.end():]

    # v035: the example now equals the card title -> drop data-say2
    m = re.search(BTN_RE % 'v035', src)
    if m and 'data-say2=' in m.group(0):
        new_tag = re.sub(r' data-say2="[^"]*"', '', m.group(0))
        src = src[:m.start()] + new_tag + src[m.end():]

    open(PAGE, 'w', encoding='utf-8').write(src)
    print('updated %d examples' % len(TEXT_UPDATES))


if __name__ == '__main__':
    main()
