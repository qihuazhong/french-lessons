#!/usr/bin/env python3
"""Inject .say buttons after each quoted example in the "Français parlé" section
(A2 chute du ne, B1 petits mots, B2 dislocation). Idempotent: skips anchors that
already have a button, and follows the same button markup as the vocab ones so
cut_clips.py picks them up (v052…, in DOM order)."""
import html

PAGE = 'lecon-opinions-impopulaires.html'

ICON = (
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path d="M3 9v6h4l5 4V5l-5 4H3z" fill="currentColor"/>'
    '<path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '<path d="M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '</svg>'
)

# (exact quote markup in the page, plain sentence for data-say)
ITEMS = [
    ('« Je suis pas sur Paris depuis longtemps. »',
     'Je suis pas sur Paris depuis longtemps.'),
    ("« J'aime pas la salle de sport. »",
     "J'aime pas la salle de sport."),
    ("« C'est pas mon truc. »",
     "C'est pas mon truc."),
    ('« Du coup, moi, je me suis un peu forcée. »',
     'Du coup, moi, je me suis un peu forcée.'),
    ("« En vrai, c'est pas mal quand même. »",
     "En vrai, c'est pas mal quand même."),
    ("« Quand c'est plus serré, quoi. »",
     "Quand c'est plus serré, quoi."),
    ('« Ça revient hyper à la mode. »',
     'Ça revient hyper à la mode.'),
    ("« C'est juste moi qui perçois pas le truc de la house. »",
     "C'est juste moi qui perçois pas le truc de la house."),
    ('« Les hommes, <b>ils</b> peuvent aussi être très sensibles. »',
     'Les hommes, ils peuvent aussi être très sensibles.'),
    ("« Les crocs, c'est la mode, <b>ça</b>. »",
     "Les crocs, c'est la mode, ça."),
    ("« Moi, <b>je</b> m'ennuie en fait avec la house. »",
     "Moi, je m'ennuie en fait avec la house."),
]


def main():
    src = open(PAGE, encoding='utf-8').read()
    # scope to the Français parlé section only, so anchors that also appear in
    # vocab/expression examples earlier in the page are not matched by mistake
    sec_start = src.find('id="parle"')
    sec_end = src.find('</section>', sec_start)
    body = src[sec_start:sec_end]
    done = 0
    for anchor, say in ITEMS:
        if anchor + '<button' in body:
            continue
        if anchor not in body:
            print('anchor not found in parle section: %s' % anchor[:60])
            continue
        btn = ('<button class="say" type="button" data-say="%s" aria-label="Écouter" '
               'title="Écouter (extrait de la vidéo)">%s</button>'
               % (html.escape(say, quote=True), ICON))
        body = body.replace(anchor, anchor + btn, 1)
        done += 1
    src = src[:sec_start] + body + src[sec_end:]
    open(PAGE, 'w', encoding='utf-8').write(src)
    total = src.count('class="say" type="button"')
    print('injected %d buttons; total .say buttons: %d' % (done, total))


if __name__ == '__main__':
    main()
