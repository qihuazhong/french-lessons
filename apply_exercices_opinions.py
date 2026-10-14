#!/usr/bin/env python3
"""Upgrade lecon-opinions-impopulaires.html to the shared interactive-exercise
component (exos.js/exos.css): replace #exercices with JSON specs, remove the
#corrige section, renumber À vous ! and wire the component in."""
import re

PAGE = 'lecon-opinions-impopulaires.html'

EXERCICES = r'''<section id="exercices">
  <h2><span class="num">6</span>Exercices</h2>
  <p class="lead">Répondez, puis cliquez sur « Corriger » — la correction est automatique. « Recommencer » efface vos réponses.</p>

  <div data-lv="a2">
    <div class="exo"><script type="application/json">{
      "id": "op-a2-1",
      "type": "choice",
      "title": "Exercice 1 — Choisissez le bon verbe",
      "instructions": "Complétez chaque phrase avec le verbe qui convient.",
      "options": ["j'adore", "j'aime bien", "je n'aime pas", "je déteste"],
      "items": [
        {"prompt": "Axel : « ___ les œufs. Je ne peux pas les digérer ! »", "correct": ["je déteste"]},
        {"prompt": "« ___ prendre le métro : il y a de l'intimité. »", "correct": ["j'adore"]},
        {"prompt": "« Le rap ? ___ trop, j'en écoute peu. »", "correct": ["je n'aime pas"]},
        {"prompt": "« Les radis ? ___, c'est vraiment génial ! »", "correct": ["j'adore", "j'aime bien"]},
        {"prompt": "« Le sport à la salle ? ___, j'ai du mal. »", "correct": ["je n'aime pas"]}
      ]}</script></div>

    <div class="exo"><script type="application/json">{
      "id": "op-a2-2",
      "type": "match",
      "title": "Exercice 2 — Associez le mot à sa définition",
      "instructions": "Cliquez un mot, puis sa définition. Cliquez une paire pour la défaire.",
      "pairs": [
        {"left": "sympa", "right": "Agréable, gentil, cool"},
        {"left": "moche", "right": "Pas beau"},
        {"left": "la honte", "right": "Un sentiment de gêne, d'embarras"},
        {"left": "un passant", "right": "Une personne qui marche dans la rue"},
        {"left": "avoir peur", "right": "Ne pas se sentir rassuré"},
        {"left": "la salle de sport", "right": "Le lieu où l'on fait du sport"}
      ]}</script></div>

    <div class="exo"><script type="application/json">{
      "id": "op-a2-3",
      "type": "fill",
      "title": "Exercice 3 — Réécrivez à l'oral (sans « ne »)",
      "instructions": "",
      "items": [
        {"prompt": "« Je n'aime pas la salle de sport. »", "answers": ["J'aime pas la salle de sport."]},
        {"prompt": "« On n'a pas conscience de ça. »", "answers": ["On a pas conscience de ça."]},
        {"prompt": "« Ce n'est pas mon truc. »", "answers": ["C'est pas mon truc."]},
        {"prompt": "« Je n'aime pas avoir peur. »", "answers": ["J'aime pas avoir peur."]}
      ]}</script></div>
  </div>

  <div data-lv="b1" hidden>
    <div class="exo"><script type="application/json">{
      "id": "op-b1-1",
      "type": "match",
      "title": "Exercice 1 — Associez le mot à sa définition",
      "instructions": "Cliquez un mot, puis sa définition. Cliquez une paire pour la défaire.",
      "pairs": [
        {"left": "grignoter", "right": "Manger de petites choses entre les repas"},
        {"left": "surcoté", "right": "Considéré comme meilleur qu'il ne l'est vraiment"},
        {"left": "un calvaire", "right": "Une expérience très désagréable, un cauchemar"},
        {"left": "s'ennuyer", "right": "Trouver le temps long, ne pas s'intéresser"},
        {"left": "revenir à la mode", "right": "Être de nouveau tendance"},
        {"left": "être à la page", "right": "Être au courant des dernières tendances"},
        {"left": "les extrémités", "right": "Les mains, les pieds, la tête : les parties du corps les plus éloignées"},
        {"left": "rater", "right": "Ne pas voir, manquer (un épisode)"},
        {"left": "une doudoune", "right": "Un manteau chaud et gonflé"},
        {"left": "l'intimité", "right": "Un endroit calme où l'on se sent proche des gens"}
      ]}</script></div>

    <div class="exo"><script type="application/json">{
      "id": "op-b1-2",
      "type": "choice",
      "title": "Exercice 2 — en ou y ?",
      "instructions": "Choisissez le bon pronom.",
      "options": ["en", "y"],
      "items": [
        {"prompt": "« La salle de sport ? Tout le monde ___ va, mais moi, j'ai du mal. »", "correct": ["y"]},
        {"prompt": "« Tu écoutes du rap ? — Pas trop, j'___ écoute peu. »", "correct": ["en"]},
        {"prompt": "« Des lignes de métro préférées ? — Oui, il y ___ a quelques-unes que j'adore. »", "correct": ["en"]},
        {"prompt": "« Vous allez souvent au festival de techno ? — Non, j'___ vais jamais. »", "correct": ["y"]},
        {"prompt": "« Des opinions impopulaires ? — J'___ ai plein ! »", "correct": ["en"]}
      ]}</script></div>

    <div class="exo"><script type="application/json">{
      "id": "op-b1-3",
      "type": "fill",
      "title": "Exercice 3 — Transformez avec « se faire »",
      "instructions": "Modèle : Le prof gronde les élèves. → Les élèves se font gronder.",
      "items": [
        {"prompt": "Les médias critiquent beaucoup les Birkenstock.", "answers": ["Les Birkenstock se font beaucoup critiquer.", "Les Birkenstock se font critiquer."]},
        {"prompt": "Le dentiste a arraché une dent à Paul.", "answers": ["Paul s'est fait arracher une dent."]},
        {"prompt": "Maman coupe les cheveux de Léa.", "answers": ["Léa se fait couper les cheveux."]},
        {"prompt": "On a volé le vélo de Marc.", "answers": ["Marc s'est fait voler son vélo."]},
        {"prompt": "Le médecin va examiner Julie demain.", "answers": ["Julie va se faire examiner demain."]}
      ]}</script></div>
  </div>

  <div data-lv="b2" hidden>
    <div class="exo"><script type="application/json">{
      "id": "op-b2-1",
      "type": "fill",
      "title": "Exercice 1 — Le conditionnel passé (regret et reproche)",
      "instructions": "Complétez au conditionnel passé.",
      "items": [
        {"prompt": "Les crocs : « Ça (devoir) ___ pas dû l'être. »", "answers": ["n'aurait", "aurait"]},
        {"prompt": "Tu es arrivé en retard : tu (partir) ___ plus tôt.", "answers": ["aurais dû partir", "tu aurais dû partir"]},
        {"prompt": "On s'est ennuyés au festival : on (aller) ___ au cinéma à la place.", "answers": ["aurait pu aller", "on aurait pu aller"]},
        {"prompt": "Je n'ai pas aimé ce roman : il (être) ___ plus travaillé, plus appliqué.", "answers": ["aurait dû être", "il aurait dû être"]},
        {"prompt": "Elle a parlé trop vite : elle (réfléchir) ___ avant de répondre.", "answers": ["aurait dû réfléchir", "elle aurait dû réfléchir"]}
      ]}</script></div>

    <div class="exo"><script type="application/json">{
      "id": "op-b2-2",
      "type": "fill",
      "title": "Exercice 2 — Du soutenu à l'oral : réécrivez",
      "instructions": "Réécrivez chaque phrase selon la consigne.",
      "items": [
        {"prompt": "Sans « ne » : « Cela ne me plaît pas du tout. »", "answers": ["Ça me plaît pas du tout."]},
        {"prompt": "En familier : « Les doudounes sans manches ? Je ne comprends pas l'intérêt. »", "answers": ["Je capte pas le délire.", "Les doudounes sans manches, je capte pas le délire."]},
        {"prompt": "En familier : « Cette musique m'irrite fortement. »", "answers": ["Ça me soûle.", "Ça m'énerve."]},
        {"prompt": "En vulgaire : « Cette musique m'irrite fortement. »", "answers": ["Ça me fait chier."]},
        {"prompt": "Avec dislocation : « Les hommes peuvent aussi être très sensibles. »", "answers": ["Les hommes, ils peuvent aussi être très sensibles."]},
        {"prompt": "Avec « crier sur tous les toits » : « Je ne vais pas annoncer cette opinion partout. »", "answers": ["Je vais pas le crier sur tous les toits."]},
        {"prompt": "Avec « ça se trouve » : « Il est possible que ce soit juste moi. »", "answers": ["Ça se trouve, c'est juste moi."]}
      ]}</script></div>
  </div>
</section>'''


def main():
    src = open(PAGE, encoding='utf-8').read()
    n0 = len(src)

    assert '</style>' in src and 'exos.css' not in src
    src = src.replace('</style>', '</style>\n<link rel="stylesheet" href="exos.css">', 1)
    src = src.replace('</body>', '<script src="exos.js"></script>\n</body>', 1)

    old_nav = '''    <a href="#exercices">6 · Exercices</a>
    <a href="#corrige">7 · Corrigés</a>
    <a href="#avous">8 · À vous !</a>'''
    new_nav = '''    <a href="#exercices">6 · Exercices</a>
    <a href="#avous">7 · À vous !</a>'''
    assert src.count(old_nav) == 1
    src = src.replace(old_nav, new_nav, 1)

    old_meth = 'Regardez la vidéo une fois, puis faites le parcours de votre niveau sans cliquer sur les corrigés. Re-regardez ensuite la vidéo : vous entendrez tout ce que vous venez d\'apprendre.'
    new_meth = 'Regardez la vidéo une fois, puis faites le parcours de votre niveau — les exercices se corrigent automatiquement quand vous cliquez sur « Corriger ». Re-regardez ensuite la vidéo : vous entendrez tout ce que vous venez d\'apprendre.'
    assert src.count(old_meth) == 1
    src = src.replace(old_meth, new_meth, 1)

    m = re.search(r'<section id="exercices">[\s\S]*?\n</section>', src)
    assert m, 'exercices section not found'
    src = src[:m.start()] + EXERCICES + src[m.end():]

    m = re.search(r'<section id="corrige">[\s\S]*?\n</section>\n\n', src)
    assert m, 'corrige section not found'
    src = src[:m.start()] + src[m.end():]

    assert src.count('<h2><span class="num">8</span>À vous !</h2>') == 1
    src = src.replace('<h2><span class="num">8</span>À vous !</h2>',
                      '<h2><span class="num">7</span>À vous !</h2>', 1)

    assert 'id="corrige"' not in src
    open(PAGE, 'w', encoding='utf-8').write(src)
    print('%s: %d -> %d chars, exo blocks: %d' % (PAGE, n0, len(src), src.count('<div class="exo">')))


if __name__ == '__main__':
    main()
