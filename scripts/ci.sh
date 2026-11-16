#!/usr/bin/env bash
# Mini CI locale : lancée automatiquement avant chaque push (.githooks/pre-push).
# S'arrête au premier contrôle raté ; un push n'a lieu que si tout réussit.
# `scripts/ci.sh --complet` ajoute le test de mutation (plusieurs minutes), avant de livrer.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly MAX_FILE_LINES=600
readonly RUST_MIN_LINE_COVERAGE=93
readonly PRIVATE_PATHS=(_SECRET CLAUDE.local.md)
readonly GENERATED_TYPES=ui/src/bridge/generated
# Assemblage : couvert par les tests des commandes et les parcours complets, pas par des tests unitaires.
readonly COVERAGE_IGNORED='crates/app/src/main\.rs'

step() { printf '\n▶ %s\n' "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
require() { "$@" >/dev/null 2>&1 || fail "outil manquant : $* (voir doc/code.md, « Contrôles automatiques »)"; }

check_private_files() {
  step "Fichiers privés exclus du dépôt"
  local private
  for private in "${PRIVATE_PATHS[@]}"; do
    grep -qxE "/?${private}/?" .gitignore || fail "${private} n'est pas dans .gitignore"
    if git rev-parse --git-dir >/dev/null 2>&1 && [ -n "$(git ls-files "$private")" ]; then
      fail "${private} est suivi par git"
    fi
  done
}

check_file_length() {
  step "Longueur des fichiers (${MAX_FILE_LINES} lignes au plus)"
  local too_long
  too_long=$(find . \( -name '*.rs' -o -name '*.ts' \) \
      -not -path '*/target/*' -not -path '*/node_modules/*' -not -path "./${GENERATED_TYPES}/*" \
      -exec wc -l {} + \
    | awk -v max="$MAX_FILE_LINES" '$2 != "total" && $1 > max')
  [ -z "$too_long" ] || fail "fichiers trop longs :
$too_long"
}

check_rust() {
  require cargo llvm-cov --version
  require cargo deny --version

  step "Rust : mise en forme"
  cargo fmt --all --check

  step "Rust : Clippy (aucun avertissement toléré)"
  cargo clippy --workspace --all-targets --all-features -- -D warnings

  step "Rust : tous les tests, couverture ≥ ${RUST_MIN_LINE_COVERAGE} % des lignes"
  cargo llvm-cov --workspace --all-features --ignore-filename-regex "$COVERAGE_IGNORED" \
    --fail-under-lines "$RUST_MIN_LINE_COVERAGE" --summary-only
  cargo test --workspace --all-features --doc

  step "Rust : dépendances (licences, failles connues)"
  cargo deny check
}

check_ui() {
  step "Interface : types partagés à jour (générés par les tests Rust)"
  git diff --exit-code -- "$GENERATED_TYPES" || fail "types générés modifiés : les commiter"

  step "Interface : mise en forme, types, lints"
  (cd ui && npx --no-install prettier --check . && npx --no-install tsc --noEmit && npx --no-install eslint .)

  step "Interface : tests de logique et d'écran (WebKit), seuils de couverture"
  (cd ui && npx --no-install vitest run --coverage --coverage.reporter=text-summary)

  step "Interface : parcours utilisateur complets (WebKit)"
  (cd ui && npx --no-install playwright test)
}

check_mutations() {
  require cargo mutants --version
  step "Rust : test de mutation (chaque erreur introduite doit être attrapée)"
  cargo mutants --workspace --all-features --exclude "$COVERAGE_IGNORED" --jobs 4 --no-shuffle
}

check_private_files
check_file_length
if [ -f Cargo.toml ]; then check_rust; else printf '\n(pas de projet Rust : contrôles Rust sautés)\n'; fi
if [ -f ui/package.json ]; then check_ui; else printf '\n(pas d interface : contrôles interface sautés)\n'; fi
if [ "${1:-}" = "--complet" ]; then check_mutations; fi

printf '\n✓ Mini CI réussie\n'
