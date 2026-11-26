# Mutation du Rust : durées et survivants par groupe

Mesures prises le 26/11/2026 en jouant chaque groupe de mutation en local, l'un après l'autre, avec `scripts/mutation-groupe.sh <groupe>` (le script que joue l'action GitHub `mutation`). Les groupes sont décrits dans `scripts/mutation-groupes.json`.

## Conditions de la mesure

- Mac à 10 cœurs, `nice -n 15`, `--jobs 4` (réglage par défaut du script), dossier de compilation séparé.
- Un Mac de GitHub est plus lent ou plus rapide selon la machine : ces durées donnent l'ordre de grandeur de chaque groupe et le rang des plus longs, pas la durée exacte sur GitHub. Le plafond d'un groupe sur GitHub est de 25 minutes (22 minutes pour l'étape de mutation).
- Le premier groupe a été joué avec la même méthode, avant la création du fichier de résumé.

## Avancement

- 16 groupe(s) joué(s) sur 28 ; durée cumulée : 107 min 45 s.

## Groupes

- `domaine-notes-texte` (domain) : 8 min 24 s ; 282 erreurs essayées, 251 attrapées, 1 survivant(s), 2 dépassement(s) persistant(s), 28 impossibles à compiler
- `domaine-notes-fichiers` (domain) : 6 min 26 s ; 200 erreurs essayées, 154 attrapées, 0 survivant(s), 2 dépassement(s) persistant(s), 44 impossibles à compiler
- `domaine-sens` (domain) : 4 min 01 s ; 230 erreurs essayées, 212 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 18 impossibles à compiler
- `domaine-pieces-jointes` (domain) : 5 min 39 s ; 174 erreurs essayées, 162 attrapées, 0 survivant(s), 1 dépassement(s) persistant(s), 11 impossibles à compiler
- `domaine-canvas` (domain) : 8 min 32 s ; 268 erreurs essayées, 237 attrapées, 2 survivant(s), 3 dépassement(s) persistant(s), 26 impossibles à compiler
- `domaine-carte-cahier` (domain) : 5 min 44 s ; 302 erreurs essayées, 278 attrapées, 3 survivant(s), 0 dépassement(s) persistant(s), 21 impossibles à compiler
- `domaine-claude` (domain) : 2 min 46 s ; 115 erreurs essayées, 112 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 3 impossibles à compiler
- `domaine-ecriture-json` (domain) : 10 min 18 s ; 230 erreurs essayées, 210 attrapées, 0 survivant(s), 7 dépassement(s) persistant(s), 13 impossibles à compiler
- `domaine-crm-journee` (domain) : 3 min 47 s ; 221 erreurs essayées, 201 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 20 impossibles à compiler
- `domaine-crm-actions` (domain) : 3 min 25 s ; 175 erreurs essayées, 152 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 23 impossibles à compiler
- `domaine-crm-fiches` (domain) : 4 min 09 s ; 217 erreurs essayées, 197 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 20 impossibles à compiler
- `domaine-autres` (domain) : 2 min 38 s ; 103 erreurs essayées, 88 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 15 impossibles à compiler
- `application-magasins` (application) : 10 min 29 s ; 233 erreurs essayées, 156 attrapées, 0 survivant(s), 1 dépassement(s) persistant(s), 76 impossibles à compiler
- `application-cas-d-usage` (application) : 12 min 01 s ; 354 erreurs essayées, 232 attrapées, 2 survivant(s), 1 dépassement(s) persistant(s), 119 impossibles à compiler
- `application-faux` (application) : 17 min 36 s ; 190 erreurs essayées, 135 attrapées, 1 survivant(s), 5 dépassement(s) persistant(s), 49 impossibles à compiler
- `application-autres` (application) : 1 min 50 s ; 45 erreurs essayées, 29 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 16 impossibles à compiler
- `infrastructure-notes` : pas encore joué
- `infrastructure-index` : pas encore joué
- `infrastructure-divers` : pas encore joué
- `infrastructure-claude` : pas encore joué
- `infrastructure-sockets-systeme` : pas encore joué
- `infrastructure-autres` : pas encore joué
- `api-outils-lecture` : pas encore joué
- `api-outils-ecran` : pas encore joué
- `api-claude-reglages` : pas encore joué
- `api-commandes` : pas encore joué
- `api-session` : pas encore joué
- `api-autres` : pas encore joué

## Survivants à corriger

- `domaine-notes-texte` : crates/domain/src/links.rs:106:26: replace > with >= in strip_canvas
- `domaine-canvas` : crates/domain/src/canvas_edit_input.rs:263:5: replace counter -> u64 with 0
- `domaine-canvas` : crates/domain/src/canvas_edit_input.rs:263:5: replace counter -> u64 with 1
- `domaine-carte-cahier` : crates/domain/src/mind_map_editing.rs:142:48: replace && with || in NodePath::after_removal_of
- `domaine-carte-cahier` : crates/domain/src/mind_map_editing.rs:142:40: replace > with >= in NodePath::after_removal_of
- `domaine-carte-cahier` : crates/domain/src/mind_map_reading.rs:66:46: replace + with * in Budget::take
- `application-cas-d-usage` : crates/application/src/use_cases/crm/files.rs:176:9: replace CrmFiles<'a>::ensure -> Result<(), AppError> with Ok(())
- `application-cas-d-usage` : crates/application/src/use_cases/rename_note.rs:110:32: replace && with || in RenameNote<'a>::rename_text
- `application-faux` : crates/application/src/testing/fake_opener.rs:47:38: replace == with != in <impl WorkspaceOpener for FakeOpener>::open

Un survivant est une erreur introduite dans le code que les tests ne détectent pas : il se corrige en ajoutant le test qui l'attrape (jamais en désactivant la mutation). Un dépassement persistant n'est qu'un avertissement.
