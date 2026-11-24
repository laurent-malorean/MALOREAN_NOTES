#!/usr/bin/env bash
# REJEU des dépassements de délai de la mutation (doc/decisions/0052).
#   mutation-rejeu.sh <dossier de sortie> <délai initial en s> <arguments de la passe, sans --timeout ni -o>...
# Un dépassement (cargo-mutants : « timeout ») compte comme détecté mais n'est pas une preuve : sur une machine
# chargée, un test normal dépasse un délai serré. Si la passe a des dépassements, ils sont rejoués UNE fois
# (`cargo mutants --iterate` : seuls les contrôles « missed » et « timeout » de la passe précédente) avec un délai
# quadruplé, borné à 600 s. Le bilan <dossier>/mutants.out est ensuite FUSIONNÉ : un survivant du rejeu est un
# survivant ; un dépassement qui persiste reste un dépassement. <dossier>/mutants.out/rejeu.txt dit le nombre de
# dépassements avant et après (AVANT=n APRES=m). Rend 0 sauf si l'outil échoue au rejeu (code hors 0, 2, 3).
# Le crochet après commit (mutation-diff.sh, coupure 30 s, non bloquant) n'appelle PAS ce script : un rejeu
# rallongerait un travail d'arrière-plan qui doit rester court.
# Variable pour les tests : MUTANTS_BIN (défaut : cargo mutants).
set -uo pipefail
readonly MAX_REPLAY_TIMEOUT=600
readonly FACTOR=4
dir=${1:?dossier de sortie}; timeout_s=${2:?délai initial}; shift 2
bilan="$dir/mutants.out"
[ -f "$bilan/outcomes.json" ] || { echo "✗ rejeu : aucun bilan dans $bilan" >&2; exit 1; }
before=$(jq '.timeout' "$bilan/outcomes.json")
if [ "$before" -eq 0 ]; then
  echo "AVANT=0 APRES=0" > "$bilan/rejeu.txt"
  printf '(rejeu : aucun dépassement, rien à rejouer)\n'
  exit 0
fi
new=$((timeout_s * FACTOR)); [ "$new" -le "$MAX_REPLAY_TIMEOUT" ] || new=$MAX_REPLAY_TIMEOUT
first=$(mktemp -d); trap 'rm -rf "$first"' EXIT
cp "$bilan/outcomes.json" "$first/outcomes.json"
cp "$bilan/missed.txt" "$first/missed.txt" 2>/dev/null || : > "$first/missed.txt"
printf '(rejeu : %s dépassements, rejoués une fois avec un délai de %s s au lieu de %s s)\n' "$before" "$new" "$timeout_s"
status=0
# shellcheck disable=SC2086
${MUTANTS_BIN:-cargo mutants} "$@" --timeout "$new" --iterate -o "$dir" || status=$?
case "$status" in 0 | 2 | 3) ;; *) echo "✗ rejeu : cargo-mutants a rendu le code $status" >&2; exit 1 ;; esac
[ -f "$bilan/outcomes.json" ] || { echo "✗ rejeu : aucun bilan après le rejeu" >&2; exit 1; }
after=$(jq '.timeout' "$bilan/outcomes.json")
# Fusion : survivants = ceux de la passe plus ceux du rejeu (sans doublon) ; attrapées = passe + rejeu.
touch "$bilan/missed.txt"
sort -u "$first/missed.txt" "$bilan/missed.txt" | sed '/^$/d' > "$first/merged.txt"
merged_missed=$(wc -l < "$first/merged.txt" | tr -d ' ')
jq -c --slurpfile f "$first/outcomes.json" --argjson missed "$merged_missed" \
  '{total_mutants: $f[0].total_mutants, caught: ($f[0].caught + .caught), missed: $missed, timeout: .timeout, unviable: $f[0].unviable}' \
  "$bilan/outcomes.json" > "$first/outcomes.new" && mv "$first/outcomes.new" "$bilan/outcomes.json"
mv "$first/merged.txt" "$bilan/missed.txt"
echo "AVANT=$before APRES=$after" > "$bilan/rejeu.txt"
printf '(rejeu : %s dépassements avant, %s après)\n' "$before" "$after"
exit 0
