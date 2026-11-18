# 0020 — Étiquettes : lues dans l'en-tête par Rust, un filtre sur toute la bibliothèque

- **Date** : 2026-11-18
- **Statut** : acceptée
- **Note (18/11/2026)** : « bibliothèque » (`Library`) s'appelle désormais « espace de travail » (`Workspace`), voir `doc/ontology.md` ; cette fiche garde l'ancien mot.

## Contexte

On veut voir les étiquettes de chaque note dans la liste, et filtrer la liste par une étiquette. Les étiquettes s'écrivent dans l'en-tête YAML de la note (fiche 0010 pour l'épinglage), sous plusieurs formes selon les outils. Il faut dire qui les lit, ce que montre le filtre, comment il se combine avec la recherche et les dossiers, et quand relire la liste des étiquettes sans relire la bibliothèque plus souvent qu'aujourd'hui.

## Décision

- **Rust lit les étiquettes** (règle pure du domaine `tag`) : `tags: [a, b]`, `tags: a, b`, ou une liste YAML (`- a` sur chaque ligne qui suit `tags:`). Guillemets et `#` de tête sont retirés ; une étiquette vide ou répétée est ignorée ; les majuscules comptent (`Perso` et `perso` sont deux étiquettes). Pas de bibliothèque YAML : une lecture ligne à ligne, comme pour l'épinglage.
- **La liste des notes porte les étiquettes** : le résumé d'une note (`NoteSummary`, `NoteListItem`) gagne ses étiquettes, tirées du contenu déjà lu pour le titre ; la liste d'un dossier ne lit rien de plus.
- **Le filtre porte sur toute la bibliothèque** : un clic sur une étiquette (pastille d'une note, ou liste des étiquettes) montre toutes les notes qui la portent, épinglées d'abord puis les plus récentes (commande `list_tagged_notes`). Une barre au-dessus de la liste nomme l'étiquette ; sa croix ou Échap retire le filtre (Échap quitte d'abord le plein écran s'il est actif). La liste revient alors au dossier affiché, sans changer la note ouverte. Choisir une étiquette ouvre sa note la plus récente dans la colonne active, comme choisir un dossier.
- **Combinaison simple avec le reste** : choisir un dossier retire le filtre. La recherche porte toujours sur toute la bibliothèque et remplace la liste tant qu'elle est tapée ; la barre du filtre se cache alors, et revient quand la recherche est vidée. Choisir une étiquette vide la recherche. La corbeille garde le filtre de côté, comme la recherche.
- **La liste des étiquettes** (sous les dossiers, chaque étiquette avec son nombre de notes, par ordre alphabétique sans tenir compte des majuscules ni des accents ; commande `list_tags`) relit toute la bibliothèque. Elle n'est relue qu'à l'ouverture de la bibliothèque, avec les dossiers (modification extérieure, copie de conflit), après la corbeille (placer, restaurer, vider), après une note créée depuis un modèle, et après un enregistrement **seulement si les étiquettes de la note ont changé** : l'enregistrement lit déjà la version du disque pour l'empreinte (fiche 0014), il compare donc les étiquettes sans lecture de plus et le dit (`SaveResult.tagsChanged`).

## Conséquences

- Un enregistrement ordinaire ne relit pas la bibliothèque ; le filtre actif la relit à chaque enregistrement, comme la recherche en cours aujourd'hui (fiche 0009). Un index pourra prendre le relais des deux sans changer l'interface.
- Les étiquettes voyagent avec le fichier et restent lisibles par d'autres outils.
- Pas de renommage ni de suppression d'une étiquette depuis l'application, ni d'étiquettes imbriquées (`a/b` est une étiquette comme une autre), ni de `#étiquette` écrite dans le texte de la note.
