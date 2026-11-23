#!/usr/bin/env bash
# Test de mutation du DOMAINE (crates/domain : règles pures), en arrière-plan, NON BLOQUANT (doc/decisions/0049).
#   mutation-diff.sh <commit>   lancé par le crochet scripts/hooks/post-commit après un commit qui touche
#                               crates/domain : mute le diff du domaine depuis le dernier commit déjà muté, sur une
#                               copie figée du commit (cargo mutants --in-diff, tests du seul domaine, coupure
#                               des erreurs qui bouclent à 30 s). Le reste du code n'est pas muté ici
#                               (`scripts/ci.sh --echantillon`, `--livraison`).
# Un seul travail à la fois (verrou lock) : un commit qui arrive pendant un travail se met en
# attente ($DIR/attente) et remplace l'attente précédente ; son diff part du dernier commit muté.
# Verdict : $DIR/<commit>.txt et $DIR/dernier (`scripts/ci.sh --verdict`). Un survivant
# s'ajoute à $DIR/suivi.txt, la liste de suivi à traiter ; il ne refuse JAMAIS un commit.
# Variables pour les tests : MUTATION_DIR, MUTATION_WORK, MUTANTS_BIN (défaut : cargo mutants).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
readonly ROOT
# Commun à tous les dossiers de travail (git worktree) : le dossier commun de git.
DIR="${MUTATION_DIR:-$(git rev-parse --path-format=absolute --git-common-dir)/ci-mutation}"
readonly DIR
readonly WORK="${MUTATION_WORK:-${HOME}/Library/Caches/malorean-notes-mutation}"
readonly MUTANTS=${MUTANTS_BIN:-cargo mutants}
readonly DOMAIN_TIMEOUT=30
mkdir -p "$DIR"

process() {
  local sha=$1 base diff out json total tested missed result=OK details="" stats=""
  base=$(cat "$DIR/base" 2>/dev/null || git rev-parse --verify -q "$sha^" || git hash-object -t tree /dev/null)
  diff=$(mktemp)
  git diff "$base" "$sha" -- 'crates/domain/*.rs' > "$diff"
  if [ -s "$diff" ]; then
    echo "$sha" > "$DIR/encours"
    rm -rf "$WORK"; mkdir -p "$WORK"
    git archive "$sha" | tar -x -C "$WORK"
    out="$WORK/out"
    (cd "$WORK" && $MUTANTS --package domain --all-features --jobs 4 --timeout "$DOMAIN_TIMEOUT" \
      --test-workspace=false --in-diff "$diff" -o "$out" >"$WORK/rust.log" 2>&1)
    json="$out/mutants.out/outcomes.json"
    if [ -f "$json" ]; then
      total=$(jq '.total_mutants' "$json"); tested=$(jq '.caught + .missed + .timeout' "$json"); missed=$(jq '.missed' "$json")
      stats="STATS: ${total} erreurs introduites, $(jq '.caught' "$json") attrapées, $(jq '.unviable' "$json") non compilables, $(jq '.timeout' "$json") délais"$'\n'
      if [ "$missed" -gt 0 ]; then
        result=SURVIVORS
        while IFS= read -r l; do
          details+="MISSED: $l"$'\n'
          printf '%s %s %s\n' "$(date +%F)" "$(git log -1 --format=%h "$sha")" "$l" >> "$DIR/suivi.txt"
        done < "$out/mutants.out/missed.txt"
      elif [ "$total" -gt 0 ] && [ "$tested" -eq 0 ]; then
        result=ERREUR; details+="ERROR: aucune des $total erreurs introduites n'a pu être testée"$'\n'
      fi
    fi
    {
      echo "RESULT: $result"; echo "COMMIT: $sha"; echo "BASE: $base"; echo "DATE: $(date '+%Y-%m-%d %H:%M:%S')"
      printf '%s' "$stats" "$details"
    } > "$DIR/$sha.txt"
    cp "$DIR/$sha.txt" "$DIR/dernier"
    rm -f "$DIR/encours"; rm -rf "$WORK"
    [ "$result" = ERREUR ] || echo "$sha" > "$DIR/base"
  fi
  rm -f "$diff"
}

if ! mkdir "$DIR/lock" 2>/dev/null; then
  if kill -0 "$(cat "$DIR/lock/pid" 2>/dev/null)" 2>/dev/null; then
    echo "${1:?commit}" > "$DIR/attente"; exit 0
  fi
  rm -rf "$DIR/lock"; mkdir "$DIR/lock"
fi
echo $$ > "$DIR/lock/pid"
trap 'rm -rf "$DIR/lock"' EXIT
next=${1:?commit}
while [ -n "$next" ]; do
  process "$(git rev-parse "$next")"
  next=""
  if [ -f "$DIR/attente" ]; then next=$(cat "$DIR/attente"); rm -f "$DIR/attente"; fi
done
