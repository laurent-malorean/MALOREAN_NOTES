# 0093 : les résultats de recherche en sections de résultats

## Contexte

La fenêtre de recherche (fiche 0051) mêlait en une liste par colonne les canvas, les nœuds de carte mentale, les
fiches de CRM et les notes. Les notes, bien plus nombreuses, repoussaient le reste hors de l'écran. L'utilisateur
a demandé de différencier par des sous-sections et de mettre les notes en dernier.

## Décisions

- **Cinq sections, toujours dans cet ordre** : « Canvas », « Cartes mentales » (cartes et nœuds), « Cahiers de
  recherche » (cahiers et entrées), « CRM » (le CRM et ses fiches), « Notes » en dernier. Chaque titre porte son
  nombre (« Cartes mentales (2) »). Une section sans résultat n'apparaît pas. Les deux colonnes (mots et sens) sont
  groupées de la même façon, chacune avec ses propres comptes.
- **Le CRM est une seule section, pas quatre.** Le type de chaque fiche (« Action · CRM_FAKE », « Personne »…) est déjà
  écrit à droite du résultat ; quatre sections de un à trois résultats alourdiraient la liste sans rien dire de plus.
- **L'ordre dans une section ne change pas** : celui de la colonne (tri de la liste pour les mots, du plus proche au
  moins proche pour le sens). Le classement et l'affichage d'un résultat ne changent pas.
- **Un type inconnu va dans « Notes »** : pas de section « Autres » ; un résultat n'est jamais perdu.
- **Le titre est un repère** : un `h3` discret (petites majuscules, couleur atténuée, filet entre deux sections,
  espacements `--space-3`, `--space-1`, `--space-2` du thème), ni bouton ni focalisable, caché au lecteur d'écran
  parce que le groupe `role="group"` qui contient la section porte le même nom (`aria-label`). Un résultat reste
  un bouton : seuls les résultats se choisissent au clavier ; les titres ne se choisissent jamais.
- **Pas de navigation aux flèches ajoutée.** La fenêtre n'en avait pas (les résultats sont des boutons, le champ
  garde le focus) ; cette fonction n'en crée pas. La sélection (surbrillance) reste la note ouverte, comme avant.
- Le code : `resultSections` (état pur, `ui/src/state/result-sections.ts`), le rendu dans `search-results.ts`.

## Contrôles

Tests de l'état (ordre, comptes, section vide absente, ordre interne, type inconnu), tests d'écran
(`search-sections.browser.test.ts` : titres et comptes dans les deux colonnes, groupes, titres non focalisables,
espacements mesurés), parcours `search-sections.spec.ts` (un canvas, une carte avec son nœud, une fiche de CRM,
deux notes) et un contrôle du scénario `search.ts` de l'essai de l'application réelle.
