#!/usr/bin/env bash
# MUTATION D'UN GROUPE (doc/decisions/0059), jouée par le travail de nuit GitHub (une machine par groupe).
#   mutation-groupe.sh <groupe> [<dossier de sortie>]     (sortie par défaut : out)
# Les arguments du groupe viennent de scripts/mutation-groupes.sh (source : scripts/mutation-groupes.json).
# Réglage : --all-features --jobs 4 --test-workspace=false, coupure des erreurs qui bouclent propre à la crate
# (30 s domaine, 90 s ailleurs), rejeu une fois des dépassements (scripts/mutation-rejeu.sh, fiche 0053).
# Écrit <sortie>/mutants.out/bilan.json : {groupe, crate, total, caught, missed, timeout, unviable, avant, apres,
# duree_s}. Rend 1 s'il reste un survivant ou si l'outil échoue ; un dépassement persistant n'est qu'un avertissement.
# Un groupe sans aucune erreur à tester (groupe « autres » vide) réussit avec un bilan à zéro.
# Variables pour les tests : MUTANTS_BIN (défaut : cargo mutants), MUTATION_JOBS (défaut : 4).
set -uo pipefail
cd "$(dirname "$0")/.."
nom=${1:?nom du groupe}
out=${2:-out}
bilan="$out/mutants.out"
json="$bilan/outcomes.json"
start=$SECONDS
args=()
while IFS= read -r a; do args+=("$a"); done < <(scripts/mutation-groupes.sh arguments "$nom") || exit 1
[ "${#args[@]}" -gt 0 ] || { echo "::error::groupe inconnu : $nom"; exit 1; }
delai=$(scripts/mutation-groupes.sh delai "$nom") || exit 1
crate=${args[1]}
common=(--all-features --jobs "${MUTATION_JOBS:-4}" --test-workspace=false)
mkdir -p "$bilan"

fin() { # écrit le bilan chiffré du groupe
  local avant=0 apres=0
  [ ! -f "$bilan/rejeu.txt" ] || { read -r avant apres < <(sed 's/AVANT=//; s/APRES=//' "$bilan/rejeu.txt"); }
  jq -c --arg g "$nom" --arg c "$crate" --argjson d "$((SECONDS - start))" --argjson av "${avant:-0}" --argjson ap "${apres:-0}" \
    '{groupe: $g, crate: $c, total: .total_mutants, caught, missed, timeout, unviable, avant: $av, apres: $ap, duree_s: $d}' \
    "$json" > "$bilan/bilan.json"
  cat "$bilan/bilan.json"
}

# shellcheck disable=SC2086
listed=$(env -u CARGO_TARGET_DIR ${MUTANTS_BIN:-cargo mutants} --list "${common[@]}" "${args[@]}" | wc -l | tr -d ' ')
if [ "$listed" -eq 0 ]; then
  echo "(groupe $nom : aucune erreur à tester)"
  printf '{"total_mutants":0,"caught":0,"missed":0,"timeout":0,"unviable":0}' > "$json"
  fin
  exit 0
fi

code=0
# shellcheck disable=SC2086
env -u CARGO_TARGET_DIR ${MUTANTS_BIN:-cargo mutants} "${args[@]}" "${common[@]}" --timeout "$delai" -o "$out" || code=$?
# Codes de cargo-mutants : 0 tout attrapé, 2 survivant, 3 délais (avec ou sans survivant), 4 tests de base en échec.
# Le verdict se lit dans le bilan : seuls un survivant ou une erreur de l'outil font échouer.
[ -f "$json" ] || { echo "::error::aucun bilan (code $code)"; exit 1; }
{ [ "$code" -le 3 ] && [ "$code" -ne 1 ]; } || { echo "::error::cargo-mutants a rendu le code $code"; exit 1; }
scripts/mutation-rejeu.sh "$out" "$delai" "${args[@]}" "${common[@]}" \
  || { echo "::error::le rejeu des dépassements a échoué"; exit 1; }
fin
cat "$bilan/rejeu.txt"
missed=$(jq '.missed' "$json")
[ "$missed" -eq 0 ] || { echo "::error::$missed survivant(s) du groupe $nom :"; cat "$bilan/missed.txt"; exit 1; }
timeouts=$(jq '.timeout' "$json")
[ "$timeouts" -eq 0 ] || { echo "::warning::$timeouts dépassement(s) persistent après rejeu ($(cat "$bilan/rejeu.txt")) :"; cat "$bilan/timeout.txt"; }
exit 0
