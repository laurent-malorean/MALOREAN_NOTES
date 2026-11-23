#!/usr/bin/env bash
# Tag git local `ci-verte` : le dernier commit dont le code a passé la mutation (domaine et échantillon du
# diff, à la livraison). Le tag n'est jamais poussé ; git suffit, pas de registre.
#   ci-verte.sh poser <commit>  pose ou déplace le tag, explicitement
#   ci-verte.sh base            affiche le commit du tag (un diff vide : le dernier commit si le tag manque)
#   ci-verte.sh avancer         déplace le tag sur HEAD ; lancé par `scripts/ci.sh --livraison` à son succès
set -euo pipefail
cd "$(dirname "$0")/.."
readonly TAG=ci-verte
case "${1:-}" in
  poser) git tag -f "$TAG" "${2:?commit}" >/dev/null; printf '✓ %s posé sur %s\n' "$TAG" "$(git log -1 --format='%h %s' "$TAG")" ;;
  base) git rev-parse -q --verify "refs/tags/$TAG^{commit}" || { echo "✗ le tag $TAG n'existe pas : ci-verte.sh poser <commit>" >&2; exit 2; } ;;
  avancer) git tag -f "$TAG" HEAD >/dev/null; printf '✓ %s avancé sur %s\n' "$TAG" "$(git log -1 --format='%h %s' "$TAG")" ;;
  *) printf '✗ usage : ci-verte.sh poser <commit> | base | avancer\n' >&2; exit 1 ;;
esac
