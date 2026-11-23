#!/usr/bin/env bash
# Lit des chemins de fichiers modifiés (un par ligne, sur l'entrée) ; sort 0 si et seulement si il
# y en a au moins un et que tous sont de la documentation Markdown : doc/**/*.md ou README.md
# (à la racine ou dans un dossier). Tout autre chemin (code, script, configuration, test) donne 1 :
# au moindre doute, la CI normale s'applique. Les essais de l'utilisateur (data_fake/) ne comptent
# pas : ils ne sont jamais commités. Lancé par scripts/ci.sh ; cas joués par scripts/test-ci-doc-only.sh.
set -euo pipefail
found=0
while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    data_fake/*) ;;
    doc/*.md | README.md | */README.md) found=1 ;;
    *) exit 1 ;;
  esac
done
[ "$found" -eq 1 ]
