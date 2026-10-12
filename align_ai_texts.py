#!/usr/bin/env python3
"""Apply the verbatim-alignment text corrections to the src-ai/ source parts
(found by mapping each example against the whisper word stream)."""
P2 = 'src-ai/part2.html'
P3 = 'src-ai/part3.html'
P4 = 'src-ai/part4.html'

R2 = [
    ("|Est-ce que vous utilisez l'intelligence artificielle ?]]",
     "|Est-ce que vous avez déjà utilisé l'intelligence artificielle ?]]"),
    ("« Est-ce que vous utilisez l'intelligence artificielle ? »",
     "« Est-ce que vous avez déjà utilisé l'intelligence artificielle ? »"),
    ("|On va demander aux passants s'ils utilisent l'IA.]]",
     "|On va aller demander aux passants s'ils utilisent l'intelligence artificielle dans leur vie de tous les jours.]]"),
    ("« On va demander aux passants s'ils utilisent l'IA. »",
     "« On va aller demander aux passants s'ils utilisent l'intelligence artificielle dans leur vie de tous les jours. »"),
    ("|Vous avez déjà posé une question à ChatGPT ?]]",
     "|Vous avez jamais posé de questions à ChatGPT ?]]"),
    ("« Vous avez déjà posé une question à ChatGPT ? »",
     "« Vous avez jamais posé de questions à ChatGPT ? »"),
    ("|Ça vous est déjà arrivé de faire des devoirs avec l'IA ?]]",
     "|Est-ce que ça vous est déjà arrivé de faire des devoirs…]]"),
    ("« Ça vous est déjà arrivé de faire des devoirs avec l'IA ? »",
     "« Est-ce que ça vous est déjà arrivé de faire des devoirs… »"),
    ("|Vous connaissez d'autres logiciels d'intelligence artificielle ?]]",
     "|Qu'est-ce que vous connaissez comme logiciel d'intelligence artificielle ?]]"),
    ("« Vous connaissez d'autres logiciels d'intelligence artificielle ? »",
     "« Qu'est-ce que vous connaissez comme logiciel d'intelligence artificielle ? »"),
    ("|Moi, ça, je trouve ça effrayant.]]", "|Déjà, je trouve ça effrayant.]]"),
    ("« Moi, ça, je trouve ça effrayant. »", "« Déjà, je trouve ça effrayant. »"),
    ("|Des trends sur les réseaux sociaux, c'est assez pratique.]]",
     "|Des trends sur les réseaux sociaux, c'est assez pratique pour ça.]]"),
    ("« Des trends sur les réseaux sociaux, c'est assez pratique. »",
     "« Des trends sur les réseaux sociaux, c'est assez pratique pour ça. »"),
    ("|Est-ce que vous utilisez l'IA dans la vie de tous les jours ?]]",
     "|Est-ce que vous utilisez l'intelligence artificielle dans la vie de tous les jours ?]]"),
    ("« Est-ce que vous utilisez l'IA dans la vie de tous les jours ? »",
     "« Est-ce que vous utilisez l'intelligence artificielle dans la vie de tous les jours ? »"),
    ("|Je m'en sers pour me tenir au courant des trends.]]",
     "|Des posts pour me tenir au courant.]]"),
    ("« Je m'en sers pour me tenir au courant des trends. »",
     "« Des posts pour me tenir au courant. »"),
    ("|Des posts pour me tenir au courant des trends.]]",
     "|Bah aussi des… comment dire… des trends.]]"),
    ("« Des posts pour me tenir au courant des trends. »",
     "« Bah aussi des… comment dire… des trends. »"),
    ("|Ça pourrait remplacer des écrivains ?]]",
     "|Ça pourrait du coup remplacer des écrivains ?]]"),
    ("« Ça pourrait remplacer des écrivains ? »",
     "« Ça pourrait du coup remplacer des écrivains ? »"),
    ("|Les professions qui pourraient être menacées.]]",
     "|Et quelles sont les professions alors qui pourraient être menacées ?]]"),
    ("« Les professions qui pourraient être menacées. »",
     "« Et quelles sont les professions alors qui pourraient être menacées ? »"),
    ("|Si c'est pour faire des dissertations, ça empêche de réfléchir.]]",
     "|Si c'est pour faire des dissertations, ce genre de choses, ça empêche de réfléchir.]]"),
    ("« Si c'est pour faire des dissertations, ça empêche de réfléchir. »",
     "« Si c'est pour faire des dissertations, ce genre de choses, ça empêche de réfléchir. »"),
    ("|Les arnaqueurs principaux de la civilisation humaine.]]",
     "|Les arnaqueurs principaux, en fait, de la civilisation humaine.]]"),
    ("« Les arnaqueurs principaux de la civilisation humaine. »",
     "« Les arnaqueurs principaux, en fait, de la civilisation humaine. »"),
    ("|C'est tout pour le boulot ou les études ?]]", "|Pour le boulot, ou les études ?]]"),
    ("« C'est tout pour le boulot ou les études ? »", "« Pour le boulot, ou les études ? »"),
]

R3 = [
    ("|Est-ce que vous utilisez l'intelligence artificielle ?]]",
     "|Est-ce que vous avez déjà utilisé l'intelligence artificielle ?]]"),
    ("« Est-ce que vous utilisez l'intelligence artificielle ? »",
     "« Est-ce que vous avez déjà utilisé l'intelligence artificielle ? »"),
    ("|Non, pas plus que ça.]]", "|Non, pas spécialement. Pas plus que ça.]]"),
    ("« Non, pas plus que ça. »", "« Non, pas spécialement. Pas plus que ça. »"),
    ("|Les juristes ont toujours su tirer leur épingle du jeu.]]",
     "|Les juristes ont toujours été ceux qui ont su tirer leur épingle du jeu.]]"),
    ("« Les juristes ont toujours su tirer leur épingle du jeu. »",
     "« Les juristes ont toujours été ceux qui ont su tirer leur épingle du jeu. »"),
    ("|Ce sont des métiers qui sont sur le point d'être menacés.]]",
     "|Ce sont tous des métiers qui sont sur le point…]]"),
    ("« Ce sont des métiers qui sont sur le point d'être menacés. »",
     "« Ce sont tous des métiers qui sont sur le point… »"),
    ("|C'est effrayant de se dire qu'un logiciel peut faire ça.]]",
     "|Ça peut paraître effrayant de se dire qu'il y a un logiciel qui peut faire des choses similaires.]]"),
    ("« C'est effrayant de se dire qu'un logiciel peut faire ça. »",
     "« Ça peut paraître effrayant de se dire qu'il y a un logiciel qui peut faire des choses similaires. »"),
]

R4 = [
    ("[[SAY:Ça doit être une IA, je pense. Du coup, ouais.]]",
     "[[SAY:C'est une IA, je pense. Du coup… ouais.]]"),
    ("[[SAY:Bah, c'est sûr que si c'est pour faire des dissertations…]]",
     "[[SAY:C'est sûr que si c'est pour faire des dissertations…]]"),
    ('<tr><td>ouais</td><td>yeah (oral pour « oui »)</td><td class="ex">« Ouais, j\'avoue. »[[SAY:Ouais, j\'avoue.]]</td></tr>',
     '<tr><td>voilà</td><td>filler qui clôt une phrase (« et voilà »)</td><td class="ex">« Certains amis, mais voilà. »[[SAY:Certains amis, mais voilà.]]</td></tr>'),
    ("« Les médecins, <b>on</b> y pense jamais. »[[SAY:Les médecins, on y pense jamais.]]",
     "« Les médecins, d'abord, <b>on</b> y pense jamais. »[[SAY:Les médecins, d'abord, on y pense jamais.]]"),
    ("[[SAY:L'art en général, c'est un peu ce qui nous reste de beau.]]",
     "[[SAY:L'art en général, humainement, c'est un peu ce qu'on a, ce qui nous reste de beau.]]"),
]

for path, repl in ((P2, R2), (P3, R3), (P4, R4)):
    src = open(path, encoding='utf-8').read()
    for old, new in repl:
        n = src.count(old)
        if n == 0 and new in src:
            continue  # already applied in a previous run
        assert n == 1, '%s: count %d for %r' % (path, n, old[:60])
        src = src.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(src)
    print('%s: %d replacements ok' % (path, len(repl)))
