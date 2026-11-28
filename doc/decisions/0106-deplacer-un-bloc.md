# 0106 — Déplacer un bloc de texte

Date : 28/11/2026. Spécification : `doc/specs/deplacer-un-bloc.md`.

## Contexte

Dans Notion, on réordonne une page en saisissant la poignée d'un bloc dans la marge. Ici, une note reste un fichier Markdown : déplacer un bloc ne doit changer que l'ordre des lignes, de façon annulable en un coup.

## Décision

- **Interface seule.** Aucun changement du moteur Rust, aucun nouveau format : le déplacement est une modification de texte (une seule transaction de l'éditeur), vue par l'enregistrement, la synchronisation entre colonnes et les versions comme une frappe ordinaire.
- **Les blocs se lisent dans l'arbre syntaxique** de `@codemirror/lang-markdown` (enfants directs du document, élément de liste avec ses sous-éléments), jamais par expression régulière sur le texte ; seul l'en-tête YAML est écarté par l'aide existante `frontMatterEnd`. Deux fonctions pures, testées hors écran : `readBlocks` (les plages de lignes des blocs) et `moveBlock` (le texte après déplacement : lignes vides, retrait de l'élément de liste, renumérotation).
- **Une poignée seule, pas de menu.** Au survol d'un bloc, deux boutons dans la marge existante (position absolue, sans décaler le texte) : « + » et la poignée ⋮⋮. Un clic sur la poignée ne fait rien.
- **Glisser aux événements du pointeur** (pas le glisser-déposer HTML5, peu fiable dans la fenêtre Tauri), comme le CRM (fiche 0060) : seuil de 4 points avant que l'appui devienne un glissement, Échap abandonne, défilement automatique près des bords de la zone visible. Le bloc d'origine est grisé et le repère de dépôt est tracé par des décors de l'éditeur, jamais du contenu.
- **Une seule étape d'annulation** : le dépôt et l'ajout d'un bloc sont chacun une transaction.
- **Où :** seulement l'éditeur de texte d'une note, jamais en lecture seule (corbeille, cahier de recherche), ni pendant une saisie vocale ; le glissement reste dans la même note.

## Conséquences

- Aucun état n'est gardé hors de l'éditeur ; rien n'est écrit dans le fichier hors le texte déplacé.
- Une transformation en un autre type de bloc, le déplacement multiple et le déplacement d'une section de titre restent hors périmètre.
