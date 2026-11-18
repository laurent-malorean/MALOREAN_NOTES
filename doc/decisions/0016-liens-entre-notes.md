# 0016 — Liens entre notes : `[[titre]]`, résolus par le titre à la demande

- **Date** : 2026-11-17
- **Statut** : acceptée
- **Note (18/11/2026)** : « bibliothèque » (`Library`) s'appelle désormais « espace de travail » (`Workspace`), voir `doc/ontology.md` ; cette fiche garde l'ancien mot.

## Contexte

On veut relier les notes entre elles, comme dans Obsidian, et voir depuis une note celles qui pointent vers elle. Il faut choisir comment écrire un lien dans le fichier, comment trouver la note visée et comment trouver les liens entrants.

## Décision

- Un lien s'écrit `[[titre]]`, ou `[[titre|texte montré]]` : la convention d'Obsidian et d'autres éditeurs, lisible dans n'importe quel éditeur de texte. Le fichier n'est jamais modifié pour l'afficher.
- Le lien désigne la note dont le **titre** (premier titre `#`) est le même, sans tenir compte des majuscules, des accents ni des espaces en trop. Si plusieurs notes portent ce titre, la plus récemment modifiée l'emporte. On vise le titre et pas le nom de fichier : c'est ce que l'utilisateur voit et écrit.
- Les règles (lire les liens, comparer les titres) sont des fonctions pures du domaine ; le cas d'usage `NoteLinks` trouve la note visée et les liens entrants.
- Comme la recherche (fiche 0009), chaque demande **relit toutes les notes**, en arrière-plan : pas d'index à tenir à jour, une note modifiée hors de l'application est vue telle qu'elle est.
- Dans l'éditeur, le texte du lien est coloré et Cmd+clic ouvre la note visée, comme pour les pièces jointes (fiche 0013). Les liens entrants s'affichent sous le texte, cachés s'il n'y en a aucun.

## Conséquences

- Changer le titre d'une note ne met pas à jour les liens qui la visent : ils ne mènent plus nulle part, et l'application le signale au Cmd+clic. Mettre les liens à jour au renommage pourra venir ensuite.
- Le temps de calcul grandit avec la bibliothèque, comme la recherche ; un index commun pourra remplacer la relecture (noté dans `todo.md`).
- L'interface reprend la lecture des liens pour les colorer ; ses tests suivent les mêmes cas que ceux du domaine.
