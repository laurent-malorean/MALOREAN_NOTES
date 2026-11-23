#!/usr/bin/env bash
# Test de mutation du diff d'un commit, lancé en arrière-plan par le crochet scripts/hooks/post-commit.
#   mutation-diff.sh <commit>   mute le code Rust (cargo mutants --in-diff) et l'interface (Stryker
#                               incrémental) changés depuis le dernier commit déjà muté, sur une copie figée
#                               du commit : le travail continue pendant ce temps.
# Un seul travail à la fois (verrou tmp/mutation/lock) : un commit qui arrive pendant un travail se met en
# attente (tmp/mutation/attente) et remplace l'attente précédente ; son diff couvre aussi les commits sautés
# (il part du dernier commit muté). Verdict : tmp/mutation/<commit>.txt et tmp/mutation/dernier, lus par
# `scripts/ci.sh --verdict`. Une dette ouverte (survivantes) est payée quand un verdict suivant est OK : le
# passage reteste alors aussi tous les fichiers cités par la dette (scripts/ci-debt.sh).
# Seuil : 100 %, comme toute la CI. Réglages Rust : .cargo/mutants.toml.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
readonly ROOT
readonly DIR="${MUTATION_DIR:-$ROOT/tmp/mutation}"
readonly WORK="${MUTATION_WORK:-${HOME}/Library/Caches/malorean-notes-mutation}"
readonly COVERAGE_IGNORED='crates/app/src/main\.rs'
mkdir -p "$DIR"

process() {
  local sha=$1 base verdict=ok lines="" cited="" files status stats=""
  base=$(cat "$DIR/base" 2>/dev/null || git rev-parse --verify -q "$sha^" || git hash-object -t tree /dev/null)
  echo "$sha" > "$DIR/encours"
  rm -rf "$WORK"; mkdir -p "$WORK"
  git archive "$sha" | tar -x -C "$WORK"
  files=$(git diff --name-only "$base" "$sha")
  debt_files=$("$ROOT/scripts/ci-debt.sh" cited 2>/dev/null || true)

  # Rust
  local diff rust_filters=() has_rs=0
  diff=$(mktemp)
  git diff "$base" "$sha" -- '*.rs' > "$diff"
  [ -s "$diff" ] && has_rs=1
  while IFS= read -r f; do case "$f" in *.rs) rust_filters+=(-f "$f") ;; esac; done <<< "$debt_files"
  if [ "$has_rs" -eq 1 ] || [ "${#rust_filters[@]}" -gt 0 ]; then
    local outs=() out
    if [ "$has_rs" -eq 1 ]; then
      out="$WORK/out-diff"; outs+=("$out")
      (cd "$WORK" && cargo mutants --workspace --all-features --exclude "$COVERAGE_IGNORED" --jobs 4 \
        --test-workspace=false --in-diff "$diff" -o "$out" >"$WORK/rust-diff.log" 2>&1)
    fi
    if [ "${#rust_filters[@]}" -gt 0 ]; then
      out="$WORK/out-dette"; outs+=("$out")
      (cd "$WORK" && cargo mutants --workspace --all-features --exclude "$COVERAGE_IGNORED" --jobs 4 \
        --test-workspace=false --no-shuffle "${rust_filters[@]}" -o "$out" >"$WORK/rust-dette.log" 2>&1)
    fi
    for out in "${outs[@]}"; do
      local json="$out/mutants.out/outcomes.json"
      if [ ! -f "$json" ]; then
        # Aucune erreur à introduire dans ce diff : rien à tester.
        continue
      fi
      local total tested missed
      total=$(jq '.total_mutants' "$json"); stats+="STATS: Rust $(basename "$out") : ${total} erreurs introduites, $(jq '.caught' "$json") attrapées, $(jq '.unviable' "$json") non compilables, $(jq '.timeout' "$json") délais"$'\n'; tested=$(jq '.caught + .missed + .timeout' "$json"); missed=$(jq '.missed' "$json")
      if [ "$missed" -gt 0 ]; then
        verdict=survivors
        while IFS= read -r l; do lines+="MISSED: $l"$'\n'; cited+="CITED: ${l%%:*}"$'\n'; done < "$out/mutants.out/missed.txt"
      elif [ "$total" -gt 0 ] && [ "$tested" -eq 0 ]; then
        [ "$verdict" = ok ] && verdict=error
        lines+="ERROR: aucune des $total erreurs introduites n'a pu être testée"$'\n'
      fi
    done
  fi
  rm -f "$diff"

  # Interface
  local ui_debt
  ui_debt=$(printf '%s\n' "$debt_files" | grep -c '^ui/' || true)
  if printf '%s\n' "$files" | grep -q '^ui/' || [ "$ui_debt" -gt 0 ]; then
    rm -rf "$WORK/ui/node_modules"; ln -s "$ROOT/ui/node_modules" "$WORK/ui/node_modules"
    mkdir -p "$WORK/ui/reports"
    [ -f "$ROOT/ui/reports/stryker-incremental.json" ] && cp "$ROOT/ui/reports/stryker-incremental.json" "$WORK/ui/reports/"
    if (cd "$WORK/ui" && ../scripts/ui-mutations.sh >"$WORK/ui.log" 2>&1); then
      mkdir -p "$ROOT/ui/reports"; cp "$WORK/ui/reports/stryker-incremental.json" "$ROOT/ui/reports/" 2>/dev/null || true
    else
      status=$?
      verdict=survivors
      local json="$WORK/ui/reports/stryker-incremental.json" survivors=""
      [ -f "$json" ] && survivors=$(jq -r '.files | to_entries[] | .key as $f | .value.mutants[] | select(.status=="Survived" or .status=="NoCoverage") | "ui/\($f):\(.location.start.line)"' "$json" | sort -u)
      if [ -z "$survivors" ]; then verdict=error; lines+="ERROR: le test de mutation de l'interface a échoué (code $status), sans survivante lisible"$'\n'; fi
      while IFS= read -r l; do [ -n "$l" ] || continue; lines+="MISSED: $l"$'\n'; cited+="CITED: ${l%%:*}"$'\n'; done <<< "$survivors"
    fi
  fi

  local result file="$DIR/$sha.txt"
  case "$verdict" in ok) result=OK ;; survivors) result=SURVIVORS ;; *) result=ERREUR ;; esac
  {
    echo "RESULT: $result"; echo "COMMIT: $sha"; echo "BASE: $base"; echo "DATE: $(date '+%Y-%m-%d %H:%M:%S')"
    printf '%s' "$cited" | sort -u; printf '%s' "$lines"; printf '%s' "$stats"
  } > "$file"
  cp "$file" "$DIR/dernier"
  [ "$result" = ERREUR ] || echo "$sha" > "$DIR/base"
  rm -f "$DIR/encours"; rm -rf "$WORK"
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
