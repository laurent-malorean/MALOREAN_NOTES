# 0009 — Recherche plein texte : relire les notes à chaque recherche, en Rust

- **Date** : 2026-11-16
- **Statut** : acceptée
- **Note (18/11/2026)** : « bibliothèque » (`Library`) s'appelle désormais « espace de travail » (`Workspace`), voir `doc/ontology.md` ; cette fiche garde l'ancien mot.
- **Note (18/11/2026)** : la recherche ne relit plus les fichiers, elle passe par l'index (fiche 0028) ; la règle de correspondance et l'extrait ne changent pas.

## Contexte

On veut retrouver une note de n'importe quel dossier en tapant quelques mots, avec un résultat qui suit la frappe. Deux voies : relire les fichiers à chaque recherche, ou tenir un index (une table des mots, mise à jour à chaque modification, y compris celles faites hors de l'application).

## Décision

- **Relire toutes les notes à chaque recherche**, dans un fil d'arrière-plan côté Rust : la page n'est jamais bloquée. La recherche part 200 ms après la dernière frappe, jamais à chaque lettre, et seulement à partir de 3 caractères (seuil de recherche), sauf pour un nombre : en dessous, la liste montre les notes du dossier. Une réponse arrivée pour une recherche déjà dépassée est ignorée : elle est comparée à l'écran tel qu'il est à son arrivée, et le champ garde toujours ce qui a été tapé.
- La règle de correspondance est une fonction pure du domaine : une note est trouvée si elle contient **tous les mots**, sans tenir compte des **majuscules ni des accents** (« ete » trouve « été »), même au milieu d'un mot. Le titre faisant partie du contenu, il est cherché avec lui ; l'en-tête YAML aussi (étiquettes).
- Chaque note trouvée vient avec un **extrait** d'une ligne autour du premier mot trouvé, mots cherchés mis en évidence. Au plus 100 notes, la plus récente en premier.
- Le cas d'usage `SearchNotes` est le seul à savoir comment on cherche : un index pourra le remplacer sans changer la commande ni l'interface.

## Conséquences

- Aucun cache à tenir à jour : une note modifiée hors de l'application est trouvée telle qu'elle est sur le disque.
- Le temps de recherche grandit avec la bibliothèque ; à mesurer, puis passer à un index pour les grosses bibliothèques (noté dans `todo.md`).
