#!/usr/bin/env bash
# RÉSUMÉ DE LA NUIT (doc/decisions/0059) : une ligne par groupe, en Markdown, pour l'étape « Summary » du travail.
#   mutation-resume.sh <dossier des artefacts> <matrice JSON>
# Chaque groupe a déposé <dossier>/mutation-<groupe>/bilan.json (artefact, scripts/mutation-groupe.sh). Un groupe
# sans bilan (machine coupée à 60 minutes, installation en échec) est dit « sans bilan », jamais passé sous silence.
# Totaux en fin. Rend toujours 0 : le verdict est celui des travaux de groupe, ce script ne fait que rapporter.
set -uo pipefail
dir=${1:?dossier des artefacts}
matrice=${2:?matrice JSON}
printf '## Mutation par groupes\n\n'
tot=0 caught=0 missed=0 timeout=0 sans=0 n=0
for nom in $(jq -r '.include[].nom' <<< "$matrice"); do
  n=$((n + 1))
  f="$dir/mutation-$nom/bilan.json"
  if [ ! -f "$f" ]; then
    printf -- '- **%s** : sans bilan (coupé, ou échec avant la fin)\n' "$nom"
    sans=$((sans + 1))
    continue
  fi
  line=$(jq -r '"\(.total) erreurs, \(.caught) attrapées, \(.missed) survivantes, \(.timeout) dépassements (\(.avant) avant rejeu), \(.unviable) non compilables, \(.duree_s / 60 | floor) min \(.duree_s % 60) s"' "$f")
  mark=""
  [ "$(jq '.missed' "$f")" -eq 0 ] || mark=" : **SURVIVANT**"
  printf -- '- **%s** : %s%s\n' "$nom" "$line" "$mark"
  tot=$((tot + $(jq '.total' "$f"))); caught=$((caught + $(jq '.caught' "$f")))
  missed=$((missed + $(jq '.missed' "$f"))); timeout=$((timeout + $(jq '.timeout' "$f")))
done
printf '\n**Total** : %s groupes, %s erreurs, %s attrapées, %s survivantes, %s dépassements persistants, %s groupes sans bilan\n' \
  "$n" "$tot" "$caught" "$missed" "$timeout" "$sans"
