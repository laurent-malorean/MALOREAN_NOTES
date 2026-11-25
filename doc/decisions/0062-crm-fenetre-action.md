# 0062 — CRM : la fenêtre d'une action

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** les fiches 0057, 0058 et 0060 (domaine, stockage et commandes, vue Kanban et Ma semaine) et la fiche 0054 (essai de l'application réelle).

## Contexte

Spécification validée : `doc/specs/crm.md`, § 8 (la fenêtre), §§ 7.1 et 7.2 (ce qui l'ouvre), § 10 (mise à jour en direct, conflit). Les commandes de Rust existent déjà (fiche 0058) : cette tranche n'ajoute que l'écran.

## Décision

- **Un panneau, pas une boîte de dialogue du navigateur** : `crm-action-window.ts` pose un `div` fixe sur toute la fenêtre de l'application (un fond qui ferme au clic, un panneau à droite de 600 points au plus, qui défile). Une `<dialog>` modale aurait caché les messages (« Cette fiche n'existe plus. », « E-mails copiés. »), qui sont dans la couche normale de la page. Échap, le fond et « Fermer » la ferment ; les fenêtres de choix et de confirmation de l'application restent au-dessus.
- **Un seul vocabulaire de gestes** : chaque contrôle dit son changement par un `CrmActionChangeItem`, celui que Rust attend. Pour une action existante, la fenêtre l'envoie (l'écran du CRM relit ensuite). Pour une nouvelle action, la même fonction pure (`applyChange`, `state/crm-action-window.ts`) l'applique à un brouillon ; « Enregistrer » envoie le brouillon (`create_crm_action`).
- **Mise à jour en direct sans perdre la saisie** (§ 10) : à chaque lecture du CRM, la fenêtre compare ce qu'elle montrerait à ce qu'elle montre ; si rien ne change, elle ne se redessine pas. Si un champ de texte a le curseur (ou un clic est en cours), la mise à jour est gardée et s'applique quand le curseur le quitte et que le clic est fini. Un geste dont le contrôle montre déjà la valeur (titre, statut, date, canal, projet, description) la met dans ce qui est montré avant que Rust réponde : la lecture qui suit ne redessine rien, donc ne fait pas perdre un clic sur un bouton voisin. Le texte tapé dans un champ d'ajout (étiquette, élément, commentaire), le défilement et le champ qui a le curseur sont retrouvés après un dessin.
- **Fiche disparue** : un geste refusé dit le message de Rust (« Cette fiche n'existe plus. ») ; la lecture qui suit ne trouve plus l'action et la fenêtre se ferme, sans enregistrer ce qui y était tapé.
- **Les notes liées s'ouvrent par le lien entre notes de l'application** (`followLink`, par titre) ; « + Lier une note » est la fenêtre de choix des notes (`listAllNotes`, comme le canvas). Les adresses d'un commentaire (seules, entre `<` `>` ou `[texte](adresse)`, http et https seulement) s'ouvrent par `open_web_address`. « Copier les e-mails » passe par `copy_plain_text`.
- **Où s'ouvre la fenêtre** : un clic sur une carte (Kanban, Ma semaine) ; « Plus de détails » de l'ajout rapide ; « + Ajouter une action » d'un jour de Ma semaine (date du jour, statut « TODO ») et d'une colonne du Kanban quand le CRM n'a aucune personne. La ligne d'ajout rapide ne sert plus aux jours de Ma semaine.

## Points tranchés là où la spécification ne dit rien

- Une action en cours de création n'a pas de listes à cocher (Rust ne les accepte pas dans le brouillon) ni de commentaires (la spécification le dit).
- Le lien vers la fiche d'une personne n'est montré que si l'application sait ouvrir cette fiche (`openPerson` : à brancher avec les fiches, § 9) ; sans elle, le nom est du texte.
- L'e-mail déjà connu (§ 4.7, `crm_email_is_known`) se signale à la saisie d'un e-mail, donc sur la fiche d'une personne (§ 9) : la fenêtre d'une action n'a pas de champ d'e-mail et ne l'utilise pas.
- Un bouton « Fermer » en plus d'Échap et du clic à côté : un geste ne doit pas dépendre du clavier seul.
- Fermer enregistre le titre, la date et la description tapés et pas encore quittés ; fermer une nouvelle action abandonne le brouillon.
- Le titre d'une nouvelle action peut rester vide dans le brouillon : c'est Rust qui refuse la création, avec son message. Pour une action existante, un titre ou une date vidés reprennent leur valeur.
- Un commentaire modifié avec un texte vide n'est pas envoyé ; un élément ou un nom de liste vidé reprend sa valeur.
- Avancement d'une liste : le pourcentage arrondi à l'entier, « 0 % » sans élément.
- Le canal « aucun » s'écrit « Sans canal », par analogie avec « Sans projet » et « Sans couleur ».
- Supprimer demande la même confirmation que pour une note (« Placer « Titre » dans la corbeille ? »).

## Conséquences

- Les fiches (tranche parallèle) branchent `openPerson` dans `CrmViewDeps` pour le lien vers la fiche.
- L'essai de l'application réelle joue un scénario de la fenêtre : ouverture par un clic sur une carte, champs visibles et pointables, création d'une action vérifiée dans le fichier sur le disque.
