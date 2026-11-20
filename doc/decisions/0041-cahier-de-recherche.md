# 0041 — Cahier de recherche : une note où Rust seul ajoute des entrées datées, chacune indexée à part avec son cahier pour conteneur

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Complète** les fiches 0034 et 0037 (types de contenu : deux nouveaux types, la propriété `type:` enfin lue ; format de l'index 4) et 0040 (un outil de plus pour Claude).

## Contexte

Spécification validée par l'utilisateur le 20/11 (todo.md, « Écriture ») : une note Markdown de type « Cahier de recherche » dans l'index, journal où l'on ne fait qu'ajouter. Entrées rangées par date de saisie, les plus anciennes en haut comme un cahier papier, sous des titres d'année, de mois et de jour ; une entrée peut faire plusieurs lignes. Lecture seule dans l'éditeur, un « + » en haut du cahier, une fenêtre de saisie ; la correction est une nouvelle entrée liée à l'entrée corrigée ; un ajout rapide sans ouvrir le cahier ; chaque entrée cherchable à part, avec son cahier pour conteneur ; un outil MCP pour Claude qui ne peut qu'ajouter. Pas d'empreinte des entrées (refusé par l'utilisateur). Aucun nouveau raccourci clavier (fiche 0033).

## Décision

### Le format, dans le domaine (`domain::research_notebook`)

```
---
type: cahier-de-recherche
---
# Levures

## 2026

### Novembre

#### Vendredi 20

- 09:42 - Levure A : rien
  au bout d'une heure, toujours rien
- 10:15 - Correction de [l'entrée du 20 novembre 2026 à 09:42](#2026-11-20-09h42) : Levure A : mousse
```

- **Type** : `type: cahier-de-recherche` dans l'en-tête (la première clé `type` au premier niveau, guillemets permis, `front_matter::declared_type`). `ContentType::of(texte)` donne le type d'une note parmi ceux d'une note (`ContentType::FILES` : note, cahier de recherche) ; un type inconnu (`type: kanban`) reste une note, comme avant.
- **Titres** : année `## 2026`, mois `### Novembre` (le mois en toutes lettres de l'insertion de la date, majuscule en tête), jour `#### Vendredi 20` (jour de la semaine et numéro ; `1er` pour le premier, comme la date en toutes lettres). Le jour de la semaine est choisi plutôt que le seul numéro (`#### 20`) : le plan de la note et une lecture rapide le comprennent sans remonter au mois. Seuls les titres qui manquent sont écrits ; à la lecture, mois et jour de la semaine sont reconnus sans tenir compte des majuscules, et le numéro du jour est le dernier mot du titre.
- **Entrée** : un élément de liste `- HH:MM - texte` ; ses lignes suivantes en retrait de deux espaces (le retrait du texte d'un élément de liste : le Markdown reste une liste, une ligne qui commencerait par `#` ou `- 10:00 -` reste du texte), ses lignes vides gardées vides. Entrées du même jour à la suite, sans ligne vide. Fins de ligne `\r\n` d'un cahier gardées.
- **Ajout** (`with_entry`) : toujours à la fin, à l'heure de l'horloge ; « par date de saisie » est donc l'ordre du fichier. Une horloge qui recule (changement d'heure) écrit l'entrée à la fin quand même, sous les titres qui manquent par rapport au dernier jour écrit. Un titre d'une autre sorte (`## Notes`) après le dernier jour fait réécrire l'année, le mois et le jour. Un texte vide est refusé.
- **Ancre** (`Entry::anchor`) : `AAAA-MM-JJ-HHhMM`, comme le moment des versions (fiche 0030), suivie de `-2`, `-3`… pour la deuxième, la troisième entrée de la même minute. Rien ne s'insérant jamais avant une entrée, son ancre ne change pas ; elle se lit dans le fichier. Pas d'identifiant caché ni d'empreinte (refusé).
- **Correction** (`with_correction`) : une nouvelle entrée « Correction de [l'entrée du 20 novembre 2026 à 09:42](#2026-11-20-09h42) : » suivie du texte. L'entrée corrigée ne change pas ; une ancre absente est refusée.
- **Nouveau cahier** (`new_notebook`) : l'en-tête et le titre, « Cahier de recherche » si le titre est vide.

### Cas d'usage et commandes

- `CreateResearchNotebook` (nom du fichier tiré du titre, comme toute note créée), `AddEntry` (lire, décider avec le domaine, écrire ; rend l'entrée ajoutée), `ListResearchNotebooks` (les cahiers, par titre ; les entrées d'un cahier). Erreur `AppError::EntryRefused` : « cette note n'est pas un cahier de recherche », « l'entrée est vide », « l'entrée « … » à corriger n'est pas dans ce cahier ».
- Commandes Tauri : `create_research_notebook(folder, title)`, `add_entry(path, text, corrected)`, `list_research_notebooks()`, `list_entries(path)` (`EntryItem` : ancre, moment, texte, numéro de sa première ligne).

### L'index

- Une table `entries` (cahier, titre, texte), rattachée à la note du cahier (`ON DELETE CASCADE`), et sa table plein texte `entries_text`. Chaque fois qu'un cahier est gardé, ses entrées sont relues (`indexed_entries`) ; oublier le cahier les oublie. Les entrées ne sont pas des notes : ni dans la liste, ni dans le filtre par étiquette, ni dans les relevés.
- La recherche porte sur les notes et, si le type entrée est demandé, sur les entrées : tous les mots dans la même entrée. Une entrée trouvée a pour résumé (`entry_summary`) le chemin et la date de son cahier, son moment pour titre, le type entrée et son cahier pour conteneur ; le cas d'usage `SearchNotes` y ajoute le titre du conteneur (`container_title`).
- `FORMAT_VERSION` passe à 4 et la base doit avoir ses cinq tables : une base du format 3 (où un cahier était une note) est remplacée par une base vide, aussitôt remplie à l'ouverture (fiche 0028).

### L'interface

- **Recherche** : chaque résultat montre son type, suivi du titre de son conteneur : « Cahier de recherche », « Entrée · Levures ». Un clic sur une entrée ouvre son cahier.

### Claude

- Outil `add_entry` (« Ajout au cahier » dans la colonne) : `path`, `text`, `corrected` facultatif ; passe par `AddEntry`, donc ne peut qu'ajouter à la fin d'un cahier. Il change une note : le garde-fou du web le retient après une lecture du web, comme `Write`, `Edit` et les autres outils qui changent une note (fiche 0040). Sa description et les instructions du serveur disent à Claude qu'un cahier ne se modifie jamais autrement.
- `search_notes` accepte `content_type` `note` ou `cahier-de-recherche` (les types d'une note) ; il rend des notes, jamais des entrées.

## Conséquences

- Le premier lancement de cette version relit tout l'espace de travail une fois (format 4).
- Un outil hors de l'application (ou les outils de fichiers de Claude, malgré la consigne) peut encore modifier le fichier : le fichier reste la seule vérité.
- Les entrées d'un cahier prennent la date de modification du cahier : dans la recherche triée par date, elles suivent leur cahier, dans l'ordre du fichier.

## Tests

- Domaine : format d'un nouveau cahier, titres créés au besoin (jour, mois, année, `1er`), entrées du même jour à la suite, plusieurs lignes et lignes vides, fins de ligne `\r\n`, texte vide et note ordinaire refusés, lecture des entrées (ancres, rangs, moments, numéros de ligne, jour incomplet, lignes mal formées), correction et ancre absente, entrées indexées.
- Application : création, ajout à l'heure de l'horloge, correction, refus sans rien écrire, cahiers par titre et entrées. Contrat de l'index (faux et SQLite) : type cahier, entrées absentes des listes, cherchées seules avec leur conteneur, suivies quand le cahier est gardé de nouveau, retiré ou effacé ; base des formats 3 et 4 incomplète reconstruite.
- Pont : les commandes par leurs arguments ; une entrée trouvée par la recherche avec son type et son cahier. Outils de Claude : contrat de `add_entry` par son protocole (ajout, correction, refus, champs exigés), recherche par `cahier-de-recherche`, garde-fou du web et `--allowed-tools`.
- Interface : le type et le cahier d'une entrée sur les résultats de recherche ; « Ajout au cahier » dans la colonne Claude Code.
