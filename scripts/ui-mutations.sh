#!/usr/bin/env bash
# Test de mutation de l'interface (Stryker), lancé par scripts/ci.sh depuis le dossier ui/.
#   ui-mutations.sh            mode incrémental : seules les mutations dont le code, ou un test qui
#                              les couvre, a changé sont retestées ; les autres reprennent leur résultat
#   ui-mutations.sh --complet  toutes les mutations sont retestées (--force), le fichier est refait
# Seuil 100 % : le score porte sur toutes les mutations, reprises comprises.
#
# Survivantes reprises : Stryker ne connaît pas les tests qui couvrent une mutation « statique »
# (code joué au chargement du module, comme une constante) ; un test ajouté qui la tue n'est donc
# pas vu, et son ancien résultat « survivante » est repris. Quand le passage échoue, les seules
# survivantes du bilan sont retestées (--force sur leurs lignes, --mutate), les autres résultats
# restant repris : c'est ce second passage qui décide. Un test affaibli fait toujours échouer :
# la mutation qu'il tuait est retestée par le premier passage, puis par le second.
# Scénarios de preuve : scripts/test-ui-mutations.sh.
set -euo pipefail

readonly MUTATION_FILE=${UI_MUTATION_FILE:-../build/reports/stryker-incremental.json}

stryker() { npx --no-install stryker run --incremental --incrementalFile "$MUTATION_FILE" "$@"; }

# Lignes des mutations survivantes ou non couvertes du bilan, au format de --mutate
# (fichier:première-dernière ligne), séparées par des virgules.
survivor_lines() {
  jq -r '.files | to_entries[] | .key as $file | .value.mutants[]
      | select(.status == "Survived" or .status == "NoCoverage")
      | "\($file):\(.location.start.line)-\(.location.end.line)"' "$MUTATION_FILE" \
    | sort -u | paste -sd, -
}

case "${1:-}" in
  --complet) stryker --force ;;
  "")
    stryker && exit 0
    [ -f "$MUTATION_FILE" ] || exit 1
    lines=$(survivor_lines)
    [ -n "$lines" ] || exit 1
    printf '\n(survivantes : nouvel essai de ces seules mutations, les autres résultats sont repris)\n'
    stryker --force --mutate "$lines"
    ;;
  *) printf '✗ option inconnue : %s\n' "$1" >&2; exit 1 ;;
esac
