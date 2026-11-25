#!/usr/bin/env bash
# GROUPES DE MUTATION (doc/decisions/0059) : lit scripts/mutation-groupes.json, la source unique des groupes.
#   mutation-groupes.sh matrice [groupe]    la matrice du travail de nuit en JSON ({"include":[...]}), tous les groupes,
#                                           ou le seul groupe nommé (erreur s'il n'existe pas)
#   mutation-groupes.sh arguments <groupe>  les arguments de cargo-mutants du groupe, un par ligne : --package <crate>,
#                                           puis --file <motif> pour chaque fichier nommé, ou --exclude <motif> pour
#                                           chaque fichier nommé par un autre groupe de la crate (groupe « autres »)
#   mutation-groupes.sh delai <groupe>      la coupure des erreurs qui bouclent (secondes) de la crate du groupe
#   mutation-groupes.sh compter [groupe]    le nombre d'erreurs listées de chaque groupe (cargo mutants --list) : lent
#                                           à compiler presque rien, utile pour dimensionner les groupes
# Compatible bash 3.2 (machine macOS de GitHub) : ni mapfile ni tableau associatif.
# Variable pour les tests : MUTATION_GROUPES (défaut : scripts/mutation-groupes.json).
set -euo pipefail
cd "$(dirname "$0")/.."
file=${MUTATION_GROUPES:-scripts/mutation-groupes.json}
[ -f "$file" ] || { echo "✗ fichier de groupes introuvable : $file" >&2; exit 1; }

# Le groupe nommé, en JSON ; échoue s'il n'existe pas.
groupe() {
  jq -ce --arg nom "$1" '.groupes[] | select(.nom == $nom)' "$file" \
    || { echo "✗ groupe inconnu : $1" >&2; exit 1; }
}

cmd=${1:?commande : matrice | arguments | delai | compter}
shift
case "$cmd" in
  matrice)
    only=${1:-}
    [ -z "$only" ] || groupe "$only" > /dev/null
    jq -c --arg only "$only" '
      . as $f
      | {include: [ .groupes[] | select($only == "" or .nom == $only)
          | {nom, titre, crate, machine: $f.crates[.crate].machine, delai: $f.crates[.crate].delai} ]}' "$file"
    ;;
  arguments)
    g=$(groupe "${1:?nom du groupe}")
    crate=$(jq -r '.crate' <<< "$g")
    printf -- '--package\n%s\n' "$crate"
    if [ "$(jq -r '.autres // false' <<< "$g")" = true ]; then
      jq -r --arg crate "$crate" --arg nom "$1" \
        '.groupes[] | select(.crate == $crate and .nom != $nom) | .fichiers[]? | "--exclude\n" + .' "$file"
    else
      jq -r '.fichiers[] | "--file\n" + .' <<< "$g"
    fi
    ;;
  delai)
    jq -r --arg nom "${1:?nom du groupe}" '. as $f | .groupes[] | select(.nom == $nom) | $f.crates[.crate].delai' "$file"
    ;;
  compter)
    for nom in $(jq -r --arg only "${1:-}" '.groupes[] | select($only == "" or .nom == $only) | .nom' "$file"); do
      args=()
      while IFS= read -r a; do args+=("$a"); done < <("$0" arguments "$nom")
      n=$(cargo mutants --list --all-features "${args[@]}" 2> /dev/null | wc -l | tr -d ' ')
      printf '%s %s\n' "$n" "$nom"
    done
    ;;
  *) echo "✗ commande inconnue : $cmd" >&2; exit 1 ;;
esac
