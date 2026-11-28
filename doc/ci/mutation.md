# Mutation du Rust : durées et survivants par groupe

Mesures prises les 26 et 27/11/2026 en jouant les groupes de mutation en local, l'un après l'autre, avec `scripts/mutation-groupe.sh <groupe>` (le script que joue l'action GitHub `mutation`). Les groupes sont décrits dans `scripts/mutation-groupes.json` (32 groupes depuis le découpage du 27/11).

## Conditions de la mesure

- Mac à 10 cœurs, `nice -n 15`, `--jobs 4` (réglage par défaut du script), puis `--jobs 1` ou 2 quand le disque manquait ; dossier de compilation séparé.
- Un Mac de GitHub est plus lent ou plus rapide selon la machine : ces durées donnent l'ordre de grandeur de chaque groupe et le rang des plus longs, pas la durée exacte sur GitHub. Le plafond d'un groupe sur GitHub est de 60 minutes.
- La nuit du 27 au 28/11, la mutation locale s'est arrêtée à cause de la saturation de la machine (d'autres applications à plein processeur) : la vérification de départ d'un groupe durait plus de 2 heures au lieu de 74 secondes. Les groupes restants sont à jouer sur GitHub.

## Avancement

- 26 groupe(s) mesuré(s) en local sur 32 ; durée cumulée : 807 min 17 s.
- À jouer sur GitHub : `infrastructure-preferences-cles`, `infrastructure-claude-lancement`, `infrastructure-claude-flux`, `api-commandes`, `api-session`, `api-autres`.

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
- `infrastructure-notes` (infrastructure) : 28 min 56 s ; 113 erreurs essayées, 90 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 23 impossibles à compiler
- `infrastructure-index` (infrastructure) : 37 min 41 s ; 112 erreurs essayées, 80 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 32 impossibles à compiler
- `infrastructure-modeles-de-sens` (infrastructure) : 33 min 52 s ; 33 erreurs essayées, 28 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 5 impossibles à compiler
- `infrastructure-calcul-surveillance` (infrastructure) : 26 min 57 s ; 40 erreurs essayées, 30 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 10 impossibles à compiler
- `infrastructure-historique` (infrastructure) : 313 min 18 s ; 28 erreurs essayées, 18 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 10 impossibles à compiler
- `infrastructure-preferences-cles` : **à jouer sur GitHub**
- `infrastructure-claude-lancement` : **à jouer sur GitHub**
- `infrastructure-claude-flux` : **à jouer sur GitHub**
- `infrastructure-sockets-systeme` (infrastructure) : 46 min 58 s ; 61 erreurs essayées, 41 attrapées, 0 survivant(s), 2 dépassement(s) persistant(s), 18 impossibles à compiler
- `infrastructure-autres` (infrastructure) : 48 min 26 s ; 49 erreurs essayées, 29 attrapées, 1 survivant(s), 4 dépassement(s) persistant(s), 15 impossibles à compiler
- `api-outils-lecture` (api) : 40 min 20 s ; 141 erreurs essayées, 115 attrapées, 3 survivant(s), 0 dépassement(s) persistant(s), 23 impossibles à compiler
- `api-outils-ecran` (api) : 24 min 17 s ; 108 erreurs essayées, 79 attrapées, 0 survivant(s), 0 dépassement(s) persistant(s), 29 impossibles à compiler
- `api-claude-reglages` (api) : 98 min 47 s ; 128 erreurs essayées, 68 attrapées, 0 survivant(s), 7 dépassement(s) persistant(s), 53 impossibles à compiler
- `api-commandes` : **à jouer sur GitHub**
- `api-session` : **à jouer sur GitHub**
- `api-autres` : **à jouer sur GitHub**

## Groupes avant le découpage du 27/11

- `infrastructure-divers` (infrastructure) : 131 erreurs ; durée de la mesure : 579 min 03 s (mesure faussée par les veilles du Mac ; somme des durées des erreurs : environ 2 h)
- `infrastructure-claude` (infrastructure) : 130 erreurs ; durée de la mesure : 76 min 41 s

Ces deux groupes dépassaient la limite : `infrastructure-divers` est devenu quatre groupes (modèles de sens ; calcul des vecteurs, garde du web et surveillance ; historique ; préférences et clés de branchement) et `infrastructure-claude` deux groupes (lancement ; flux), chacun de 23 à 37 minutes d'après les durées mesurées des erreurs.

## Survivants

Les 13 survivants trouvés par ces mesures sont **tous corrigés** (tests ajoutés le 27/11) :

- `domaine-notes-texte` : crates/domain/src/links.rs:106:26: replace > with >= in strip_canvas
- `domaine-canvas` : crates/domain/src/canvas_edit_input.rs:263:5: replace counter -> u64 with 0
- `domaine-canvas` : crates/domain/src/canvas_edit_input.rs:263:5: replace counter -> u64 with 1
- `domaine-carte-cahier` : crates/domain/src/mind_map_editing.rs:142:48: replace && with || in NodePath::after_removal_of
- `domaine-carte-cahier` : crates/domain/src/mind_map_editing.rs:142:40: replace > with >= in NodePath::after_removal_of
- `domaine-carte-cahier` : crates/domain/src/mind_map_reading.rs:66:46: replace + with * in Budget::take
- `application-cas-d-usage` : crates/application/src/use_cases/crm/files.rs:176:9: replace CrmFiles<'a>::ensure -> Result<(), AppError> with Ok(())
- `application-cas-d-usage` : crates/application/src/use_cases/rename_note.rs:110:32: replace && with || in RenameNote<'a>::rename_text
- `application-faux` : crates/application/src/testing/fake_opener.rs:47:38: replace == with != in <impl WorkspaceOpener for FakeOpener>::open
- `infrastructure-autres` : crates/infrastructure/src/fs_gestures.rs:83:27: replace match guard error.kind() == io::ErrorKind::NotFound with true in FsPendingGestures::ids
- `api-outils-lecture` : crates/api/src/session/app_tools/meaning.rs:36:9: delete match arm ContentTypeItem::CrmCompany in crm_type_of
- `api-outils-lecture` : crates/api/src/session/app_tools/meaning.rs:37:9: delete match arm ContentTypeItem::CrmPerson in crm_type_of
- `api-outils-lecture` : crates/api/src/session/app_tools/meaning.rs:39:9: delete match arm ContentTypeItem::CrmProject in crm_type_of

Un survivant est une erreur introduite dans le code que les tests ne détectent pas : il se corrige en ajoutant le test qui l'attrape (jamais en désactivant la mutation). Un dépassement persistant n'est qu'un avertissement.
