# 0010 — Notes épinglées : `pinned: true` dans l'en-tête de la note

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

On veut garder certaines notes en tête de leur dossier. Il faut ranger l'information quelque part : dans la note elle-même (son en-tête YAML), ou dans un fichier de réglages de la bibliothèque.

## Décision

- L'épinglage est écrit dans l'en-tête YAML de la note : `pinned: true`. `pinned: yes` est aussi reconnu, sans tenir compte de la casse.
- Épingler ajoute la clé à l'en-tête existant, sans toucher aux autres clés, ou crée l'en-tête s'il n'y en a pas. Désépingler retire la clé, et l'en-tête s'il ne contient plus rien. Le titre et le nom du fichier ne changent jamais. Ces règles sont des fonctions pures du domaine, vérifiées par des tests de propriétés.
- Épingler ou désépingler **ne change pas la date de modification** : sinon la note remonterait parmi les plus récentes alors que son texte n'a pas changé. Le port de stockage offre pour cela une écriture qui garde la date ; sur le disque, le fichier temporaire reçoit l'ancienne date avant de remplacer la note.
- La liste d'un dossier montre les notes épinglées d'abord, puis les autres ; dans chaque groupe, la plus récemment modifiée en premier. La recherche garde son ordre, du plus récent au plus ancien.
- Dans l'interface, un clic droit sur une note propose « Épingler » ou « Désépingler ». Ce qui est tapé est enregistré d'abord ; si c'est la note ouverte, l'éditeur montre son nouvel en-tête.

## Conséquences

- L'épinglage voyage avec le fichier : il survit à un renommage, une copie ou une synchronisation faits hors de l'application, et d'autres outils peuvent le lire.
- Épingler modifie le fichier de la note (une ligne d'en-tête).
- Écarté : un fichier de réglages de la bibliothèque, qui perdrait l'épinglage d'une note renommée ou déplacée hors de l'application.
- Quand l'éditeur recharge la note ouverte après un changement d'épinglage, l'historique d'annulation de cette note repart de zéro.
