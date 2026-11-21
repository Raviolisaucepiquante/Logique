# Logique

Application web pour apprendre la logique formelle, sur le modèle de Duolingo : leçons courtes, retour immédiat, répétition espacée, chapitres à maîtriser.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5180
npm test         # moteur logique + validation de tout le contenu
npm run build    # version statique dans dist/
npm run standalone  # régénère Logique.html (un seul fichier, sans serveur)
```

**Sans rien installer** : double-clique sur `Logique.html`. Tout y est intégré (code et contenu) ; la progression est enregistrée dans le navigateur. Après une modification du contenu ou du code, relance `npm run standalone` pour mettre ce fichier à jour.

## Sur téléphone : application installable (PWA)

L'application s'adapte à l'écran : barre d'onglets en bas sur téléphone, colonne de résumé et exercices en deux colonnes sur grand écran. Sur écran tactile, le clavier de symboles remplace le clavier du téléphone (une touche le rappelle au besoin).

Une fois construite (`npm run build`), elle est installable et fonctionne **hors ligne** : un service worker (`dist/sw.js`, généré par `scripts/build-sw.mjs`) met en cache tout le code et tout le contenu. À chaque nouvelle version, l'application propose « Mettre à jour ».

L'installation exige une adresse **https** (ou `localhost`). Le plus simple : GitHub Pages.

1. Crée un dépôt sur GitHub et envoie-y ce projet (`git remote add origin …` puis `git push -u origin main`).
2. Sur GitHub : *Settings > Pages > Source* : « GitHub Actions ». Le fichier `.github/workflows/deploy.yml` teste, construit et publie l'application à chaque envoi.
3. Ouvre l'adresse publiée sur ton téléphone :
   - Android (Chrome) : menu ⋮ > « Installer l'application » (ou le bouton dans *Réglages*) ;
   - iPhone (Safari) : bouton Partager > « Sur l'écran d'accueil ».

La progression reste enregistrée sur chaque appareil (export/import dans *Réglages* pour la transférer). `Logique.html`, lui, s'ouvre d'un double-clic mais ne s'installe pas.

Pour régénérer les icônes : `npm run icons`.

## Organisation

```
public/content/            contenu (JSON), modifiable sans toucher au code
  index.json               liste des modules et de leurs chapitres
  logique/ch0.json …       un fichier par chapitre
src/logic/formula.ts       analyse, affichage, évaluation et équivalence des formules
src/core/                  types du contenu, correction, progression, répétition espacée, session de leçon
src/ui/                    écrans, lecteur de leçon, clavier de symboles
src/ui/exercises/          un fichier par type d'exercice + registre (index.ts)
tests/                     tests du moteur et validation du contenu
```

## Ajouter un chapitre

1. Créer `public/content/logique/chN.json` sur le modèle des chapitres existants (types dans `src/core/types.ts`).
2. Ajouter `"chN"` à la liste `chapters` du module dans `public/content/index.json`.
3. Lancer `npm test` : il vérifie que les identifiants sont uniques, que les formules sont bien formées et que chaque réponse de référence respecte sa propre consigne.

Les identifiants d'exercice (`id`) servent à la répétition espacée : ne pas les changer une fois publiés.

## Ajouter un module (métaphysique, scolastique…)

Ajouter une entrée dans `index.json` avec un nouvel `id`, puis créer le dossier `public/content/<id>/`. La progression est déjà rangée par module.

## Types d'exercices

| type | rôle | correction |
|---|---|---|
| `mcq` | QCM | index de la bonne réponse |
| `formula` | écrire une formule (options : `forbid`, `require`, `negationOnAtoms`) | équivalence logique |
| `formalize` | traduire une phrase française avec une légende | équivalence logique |
| `truthtable` | table de vérité case par case (`columns` pour les sous-formules) | calculée automatiquement |
| `valuation` | trouver un contre-exemple ou déclarer l'argument valide | sémantique |
| `proof` | preuve de Fitch en déduction naturelle ; `given` + `justifyOnly` pour ne faire que justifier | vérification ligne par ligne (`src/logic/proof.ts`) |

| `modeltruth` | dire si des énoncés sont vrais dans un modèle donné (`model` : domaine, constantes, extensions) | évaluation dans le modèle |
| `buildmodel` | construire un modèle (contre-modèle) qui rend vrais les énoncés `true` et faux les `false` | évaluation ; une solution est cherchée automatiquement |

| `kripketruth` | dire si des formules modales sont vraies à un monde (`model` : `worlds`, `access`, `valuation` ; `world`) | évaluation de Kripke |
| `kripkebuild` | construire un modèle de Kripke (mondes, flèches, valuation) ; `system` impose le cadre (K, D, T, B, S4, S5) | évaluation au monde w1 + propriétés du cadre |

Logique modale (`src/logic/modal.ts`) : l'équivalence et la validité sont vérifiées sur tous les modèles de Kripke de 1 à 3 mondes (échantillon fixe au-delà d'un certain nombre de lettres). Les tests confirment que T, D, 4, B et 5 sont valides exactement sur les cadres attendus.

Syntaxe des prédicats : majuscule suivie de ses arguments (`Fa`, `Rxy`), variables `u`–`z`, noms = autres minuscules, quantificateurs `∀x`, `∃x` (au clavier : `\A`, `\E`). Dans une légende, une clé `Fx` ou `Rxy` déclare un prédicat et son arité, une clé `a` un nom.

En logique des prédicats, l'équivalence est vérifiée sur tous les modèles de 1 à 4 éléments (ou un échantillon fixe quand ils sont trop nombreux) : fiable pour des exercices d'initiation, sans être une preuve générale.

Règles de preuve (forall x: Calgary) : Prém, Hyp, R, ∧I, ∧E, ∨I, ∨E, →I, →E, ↔I, ↔E, ¬I, ¬E, X, RA, les règles dérivées MT, DS, DNE, TND, et pour les quantificateurs ∀E, ∀I, ∃I, ∃E, CQ (avec les conditions sur les noms arbitraires et nouveaux). Citations : `1, 2` pour des lignes, `3-5` pour une sous-preuve. Chaque exercice `proof` contient une `solution` que `npm test` vérifie avec le même vérificateur.

Pour un nouveau type (contre-modèle de Kripke, preuve en logique des prédicats) : le déclarer dans `src/core/types.ts`, écrire sa vue dans `src/ui/exercises/`, l'inscrire dans `src/ui/exercises/index.ts`.

## Règles pédagogiques

- Le cours (3 fiches au plus) précède les exercices la première fois ; ensuite la leçon commence directement par la pratique.
- Une question ratée revient en fin de leçon (deux fois au plus).
- Répétition espacée : J+1, J+3, J+7, J+14, J+30 ; une erreur ramène à J+1.
- Un exercice sort du carnet d'erreurs après deux révisions réussies d'affilée.
- Un chapitre est maîtrisé quand son test est réussi à 85 % du premier coup ; le chapitre suivant s'ouvre alors.
- Cœurs : 5 par leçon, désactivables. Ils ne s'appliquent ni aux tests ni aux révisions.
