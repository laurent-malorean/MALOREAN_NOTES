# 0071 — Lier un contenu sans saisir son nom : liens à la Obsidian, par le nom seul

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** la fiche 0016 (liens entre notes `[[titre]]`) et la fiche 0062 (fenêtre d'une action du CRM : « + Lier une note »).

## Contexte

Un lien se saisissait à la main : `[[titre]]`. Deux notes de même titre donnaient un lien qui ouvrait l'une des deux sans le dire, et un canvas, qui n'a pas de titre, ne pouvait pas être lié. Demande : choisir ce qu'on lie dans une liste, sans retaper son nom, comme dans Obsidian.

## Décision

- **Le nom seul, sans obligation d'unicité** : le lien écrit est `[[Titre]]` quand le nom est unique ; `[[nom.canvas]]` pour un canvas (nom de fichier, extension comprise : un titre seul ne vise jamais un canvas) ; `[[Dossier/Titre]]` (`[[/Titre]]` pour la racine) quand un autre contenu porte le même nom. La résolution par titre, sans tenir compte des majuscules, des accents ni des espaces en trop, est conservée.
- **Rust décide** (`domain::links`) : `LinkIndex` donne, pour la cible d'un lien, `Found`, `Ambiguous` ou `Missing`, et le lien à écrire pour un contenu (`written`), vérifié en le résolvant : il désigne toujours le contenu choisi. L'application (`LinkChoices`) l'alimente par l'index (la liste de tous les contenus et la résolution d'un lot de cibles), les liens entrants (`NoteLinks`) par les fichiers : un lien ambigu ne désigne aucun contenu.
- **Un lien ambigu ne s'ouvre pas au hasard** : un clic dit « Plusieurs contenus portent le nom… » et n'ouvre rien ; dans l'éditeur, son texte est souligné en pointillés, de la couleur d'avertissement, avec une bulle d'aide. L'éditeur demande à Rust (après une pause de frappe de 300 ms, à l'arrivée d'une note et au retour du focus) ce que désigne chaque cible différente du texte.
- **Une seule liste, trois portes** : tout ce qu'on peut lier (note, canvas, carte mentale, cahier de recherche, CRM et ses fiches), chaque ligne avec l'icône de son type et son dossier, filtrée à chaque lettre (`matchingLinkable`). La fenêtre de recherche (`chooseLinkable`) est celle de « + Lier une note » du CRM, réutilisée par le bouton « Lien » ; le menu sous le curseur (`[[` en complétion, `/` en début de ligne ou après une espace sous le titre « Lien vers… », uniquement des liens) montre la même liste.
- **« Lien » demande ce qu'on lie** : « Une note ou un contenu » (le texte sélectionné devient le texte du lien : `[[lien|texte]]`) ou « Une page web » (`[texte](url)` comme avant). Même chose par Cmd+K, la palette et le menu Format : une seule commande.
- **Chaque geste a un contrôle visible** : le menu `/` et la complétion `[[` s'ouvrent au clavier, le bouton « Lien » de la barre fait la même chose à la souris.

## Conséquences

- Les liens du CRM (`notes liées`) écrivent le même lien que l'éditeur ; une action qui liait un canvas ou un doublon s'écrit désormais avec son dossier ou son extension.
- Un dossier ne départage pas deux contenus de même nom dans le même dossier (impossible pour deux fichiers ; possible pour deux titres de notes de même dossier) : le lien reste ambigu et signalé.
- Tests : domaine (résolution, ambiguïté, canvas, chemin, lien écrit), application, API (commandes), écran WebKit (menu, bouton, soulignement), parcours Playwright (`link-menu`, `link-names`, `format-bar`) et scénarios de l'essai de l'application réelle.
