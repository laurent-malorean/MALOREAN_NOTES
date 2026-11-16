#!/usr/bin/env bash
# Mini CI locale : à lancer avant chaque push. S'arrête au premier contrôle raté.
# Un push n'a lieu que si ce script se termine sans erreur.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly MAX_FILE_LINES=600
readonly PRIVATE_PATHS=(_SECRET CLAUDE.local.md)
readonly GENERATED_TYPES=ui/src/bridge/generated

step() { printf '\n▶ %s\n' "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

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
  step "Rust : mise en forme"
  cargo fmt --all --check

  step "Rust : Clippy (aucun avertissement toléré)"
  cargo clippy --workspace --all-targets --all-features -- -D warnings

  step "Rust : tests (unitaires, intégration, contrat, doc)"
  cargo test --workspace --all-features

  step "Rust : dépendances (licences, failles connues)"
  if cargo deny --version >/dev/null 2>&1; then
    cargo deny check
  else
    printf '⚠ cargo-deny absent : contrôle sauté (cargo install cargo-deny)\n'
  fi
}

check_ui() {
  step "Interface : types partagés à jour (générés par les tests Rust)"
  git diff --exit-code -- "$GENERATED_TYPES" || fail "types générés modifiés : les commiter"

  step "Interface : mise en forme, types, lints, tests"
  (cd ui \
    && npx --no-install prettier --check . \
    && npx --no-install tsc --noEmit \
    && npx --no-install eslint . \
    && npx --no-install vitest run)
}

check_private_files
check_file_length
if [ -f Cargo.toml ]; then check_rust; else printf '\n(pas de projet Rust : contrôles Rust sautés)\n'; fi
if [ -f ui/package.json ]; then check_ui; else printf '\n(pas d interface : contrôles interface sautés)\n'; fi

printf '\n✓ Mini CI réussie\n'
