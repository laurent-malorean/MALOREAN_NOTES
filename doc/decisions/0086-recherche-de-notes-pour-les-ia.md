# 0086 — Recherche de notes pour les IA : dire que le mot est cherché dans les mots, et compter les occurrences

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** les fiches 0040 (outils de l'application pour Claude) et 0046 (recherche par le sens).

## Contexte

La recherche par les mots trouve un mot aussi à l'intérieur d'un mot plus long : « tomy » trouve « anatomy ». Une IA branchée a cherché « tomy », a reçu deux notes dont une était un faux positif, et n'a pas su pourquoi : ni la description de `search_notes` ni son résultat ne disaient que le mot peut être trouvé dans un mot plus long, ni combien de fois ni où.

## Décision

- **La description le dit** : `search_notes` annonce que chaque mot est cherché aussi à l'intérieur d'un mot plus long (« tomy » trouve « anatomy »), majuscules et accents ignorés, que ce n'est pas une recherche de mot entier, et que `matches` aide à juger la pertinence. `read_note` est nommé pour confirmer en lisant la note entière. Le paramètre `query` le dit aussi. La description de `search_by_meaning` ne change pas : rien n'y est faux ni ambigu.
- **`matches` sur chaque résultat d'une recherche par mots** : le nombre d'occurrences de tous les mots de `query`, compté dans le texte entier de la note (en-tête compris, comme la recherche qui l'a trouvée), pas seulement dans l'extrait. Les occurrences se comptent comme la recherche les trouve (à l'intérieur des mots, majuscules et accents ignorés) ; deux occurrences qui se chevauchent comptent pour une. Les nœuds d'une carte mentale rendus par la recherche portent leur compte aussi (sur le texte du nœud). Sans `query` (étiquette, dossier ou type seuls), `matches` est absent. Le résultat de la recherche par le sens n'en a pas.
- **Rien ne change pour le reste** : le nombre n'influe ni sur l'ordre (le tri choisi) ni sur les 100 notes au plus ; l'interface ne l'affiche pas (la colonne Claude Code et les IA branchées partagent le même registre d'outils, aucun autre changement n'est nécessaire).
- Règle de comptage : `domain::search::count`, à côté de `search` ; le cas d'usage `SearchNotes` la joue sur le texte que l'index rend déjà (aucune relecture de fichier) et la range dans `SearchResult.matches`.

## Option écartée pour l'instant : le mot entier

Un paramètre « mot entier » (ne trouver `tomy` que comme mot, pas dans « anatomy ») serait possible plus tard. Il n'est pas fait : l'utilisateur ne l'a pas demandé, et dire le comportement et compter les occurrences suffit à l'IA pour écarter un faux positif.

## Tests

- Domaine : mot dans un mot plus long, accents et majuscules, plusieurs mots, chevauchements, texte entier (hors extrait, en-tête compris).
- Cas d'usage : le compte porte sur la note entière.
- Protocole MCP : la vraie forme JSON d'un résultat (`matches` à côté de `excerpt`), `matches` absent sans mots cherchés, présent pour un nœud, présent avec un filtre d'étiquette, et la description qui dit les mots cherchés dans les mots.
