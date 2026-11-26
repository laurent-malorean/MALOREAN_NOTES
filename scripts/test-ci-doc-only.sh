#!/usr/bin/env bash
# Cas de scripts/ci-doc-only.sh : un commit de seule documentation passe par les contrôles légers,
# un seul fichier de code en plus rétablit la CI normale. Lancé par scripts/ci.sh quand l'un des deux change.
set -euo pipefail
cd "$(dirname "$0")"
readonly CLASSIFIER=./ci-doc-only.sh
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
expect_doc() { printf '%b' "$2" | "$CLASSIFIER" || fail "$1 : devrait être de la documentation seule"; }
expect_code() { if printf '%b' "$2" | "$CLASSIFIER"; then fail "$1 : devrait lancer la CI normale"; fi; }

expect_doc  "un fiche de décision"        'doc/decisions/0047-ci.md\n'
expect_doc  "specs et ontologie"          'doc/specs/a.md\ndoc/ontology.md\n'
expect_doc  "README"                      'README.md\ncrates/api/README.md\n'
expect_doc  "essais de l'utilisateur"     'doc/developpement/code.md\ndata_fake/essai.rs\n'
expect_code "aucun fichier"               ''
expect_code "seulement data_fake"         'data_fake/a.md\n'
expect_code "un fichier de code en plus"  'doc/developpement/code.md\ncrates/api/src/lib.rs\n'
expect_code "un script"                   'doc/developpement/code.md\nscripts/ci.sh\n'
expect_code "une image de doc"            'doc/developpement/architecture.svg\n'
expect_code "un .md hors doc"             'ui/notes.md\n'
expect_code "une configuration"           'Cargo.toml\n'
expect_code "un faux dossier doc"         'docs/a.md\n'
printf '✓ ci-doc-only : tous les cas passent\n'
