#!/usr/bin/env bash
# Mini CI locale : lancée avant chaque commit, sur le code tel qu'il sera commité.
# S'arrête au premier contrôle raté ; on ne commite que si tout réussit.
# L'envoi (push) ne relance rien : le contenu envoyé est celui qui a passé la CI.
#   scripts/ci.sh            tous les contrôles, test de mutation du code modifié seulement :
#                            Rust pas encore commité, interface changée depuis le dernier passage de Stryker
#   scripts/ci.sh --complet  tous les contrôles, test de mutation de tout le code, Rust et interface (avant de livrer)
# Seuil du test de mutation : 100 %, des deux côtés.
# Rust : les copies mutées se construisent lints coupés (.cargo/mutants.toml), sinon une erreur
# introduite qui laisse du code inutilisé ne compile pas et n'est jamais testée. Un passage où
# des erreurs ont été introduites mais aucune testée (toutes non compilables) est refusé.
# Les seuils ne baissent jamais : on les relève quand la couverture monte.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly MAX_FILE_LINES=600
# Assemblage de l'interface : il relie les modules sans logique, il reste court (doc/code.md).
readonly UI_ASSEMBLY=ui/src/main.ts
readonly MAX_UI_ASSEMBLY_LINES=150
readonly RUST_MIN_LINE_COVERAGE=95
readonly PRIVATE_PATHS=(_SECRET CLAUDE.local.md)
readonly GENERATED_TYPES=ui/src/bridge/generated
readonly THEME_FILE=ui/src/theme.css
# Assemblage : couvert par les tests des commandes et les parcours complets, pas par des tests unitaires.
readonly COVERAGE_IGNORED='crates/app/src/main\.rs'

step() { printf '\n▶ %s\n' "$1"; }

# Codes de sortie de cargo-mutants : 0 = tout attrapé ; 2 = erreur passée inaperçue ;
# 3 = un test a tourné jusqu'au délai maximal (l'erreur a bien été remarquée). Quand il y a à la
# fois des inaperçues et des délais, cargo-mutants rend 3 : le verdict se lit donc dans le bilan.
readonly MUTANTS_MISSED=2
readonly MUTANTS_TIMEOUT=3
readonly MUTANTS_OUTCOMES=mutants.out/outcomes.json
run_mutants() {
  local status=0 started
  # Sans erreur à introduire (changement de tests seulement), cargo-mutants n'écrit aucun bilan :
  # celui qui reste est celui d'un passage précédent, à ne pas relire.
  started=$(mktemp)
  # Les copies mutées se construisent lints coupés (.cargo/mutants.toml, `cap_lints`).
  cargo mutants --workspace --all-features --exclude "$COVERAGE_IGNORED" --jobs 4 "$@" || status=$?
  case "$status" in
    0 | "$MUTANTS_MISSED" | "$MUTANTS_TIMEOUT") ;;
    *) fail "le test de mutation n'a pas pu tourner (code $status)" ;;
  esac
  if [ "$MUTANTS_OUTCOMES" -nt "$started" ]; then
    check_mutants_outcomes
  else
    printf '(aucune erreur à introduire dans le code modifié)\n'
  fi
  rm -f "$started"
}

# Refuse une erreur introduite passée inaperçue, et un passage qui n'a rien vérifié : des
# erreurs ont été introduites mais aucune n'a été testée (toutes « non compilables »).
check_mutants_outcomes() {
  local total tested missed
  total=$(jq '.total_mutants' "$MUTANTS_OUTCOMES")
  tested=$(jq '.caught + .missed + .timeout' "$MUTANTS_OUTCOMES")
  missed=$(jq '.missed' "$MUTANTS_OUTCOMES")
  printf '(%s erreurs introduites, %s testées, %s non compilables)\n' \
    "$total" "$tested" "$(jq '.unviable' "$MUTANTS_OUTCOMES")"
  [ "$missed" -eq 0 ] \
    || fail "${missed} erreurs introduites dans le code ne sont attrapées par aucun test (voir mutants.out/missed.txt)"
  [ "$total" -eq 0 ] || [ "$tested" -gt 0 ] \
    || fail "aucune des ${total} erreurs introduites n'a pu être testée : toutes sont non compilables (voir mutants.out/unviable.txt)"
}
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
      -not -path '*/target/*' -not -path '*/node_modules/*' -not -path '*/.vitest/*' -not -path '*/.stryker-tmp/*' -not -path "./${GENERATED_TYPES}/*" \
      -exec wc -l {} + \
    | awk -v max="$MAX_FILE_LINES" '$2 != "total" && $1 > max')
  [ -z "$too_long" ] || fail "fichiers trop longs :
$too_long"
  check_assembly_length
}

check_assembly_length() {
  [ -f "$UI_ASSEMBLY" ] || return 0
  step "Assemblage de l'interface sans logique (${UI_ASSEMBLY} : ${MAX_UI_ASSEMBLY_LINES} lignes au plus)"
  local lines
  lines=$(wc -l < "$UI_ASSEMBLY" | tr -d ' ')
  [ "$lines" -le "$MAX_UI_ASSEMBLY_LINES" ] \
    || fail "${UI_ASSEMBLY} fait ${lines} lignes : son fonctionnement va dans un module de ui/src/app/"
}

check_theme() {
  step "Interface : couleurs et polices écrites seulement dans le thème (${THEME_FILE})"
  local hard_coded
  hard_coded=$( {
    grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|: *(white|black) *[;}]|font-family: *[^v ]' \
      --include='*.css' ui/src | grep -v "^${THEME_FILE}:" || true
    grep -rnE "rgba?\(|hsla?\(|[\"'\`]#[0-9a-fA-F]{3,8}[\"'\`]" --include='*.ts' ui/src \
      | grep -vE '\.test\.ts:' || true
  } )
  [ -z "$hard_coded" ] || fail "valeurs d'apparence écrites en dur, à déplacer dans ${THEME_FILE} :
$hard_coded"
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
  check_theme
  step "Interface : types partagés à jour (générés par les tests Rust)"
  git diff --exit-code -- "$GENERATED_TYPES" || fail "types générés modifiés : les commiter"

  step "Interface : mise en forme, types, lints"
  (cd ui && npx --no-install prettier --check . && npx --no-install tsc --noEmit && npx --no-install eslint .)

  step "Interface : tests de logique et d'écran (WebKit), seuils de couverture"
  (cd ui && npx --no-install vitest run --coverage --coverage.reporter=text-summary)

  step "Interface : parcours utilisateur complets (WebKit)"
  (cd ui && npx --no-install playwright test)
}

# Test de mutation de l'interface, en mode incrémental : Stryker ne reteste que les mutations dont
# le code, ou un test qui les couvre, a changé depuis son dernier passage ; les autres reprennent
# leur résultat, gardé dans ui/reports/stryker-incremental.json (ignoré par git). Sans ce fichier, tout est testé.
# Le score porte sur toutes les mutations, reprises comprises : seuil 100 %.
readonly UI_MUTATION_FILE=reports/stryker-incremental.json
# Fichiers que Stryker ne compare pas d'un passage à l'autre : s'ils changent, on reteste tout.
readonly UI_MUTATION_CONTEXT=(ui/test-support ui/vitest.stryker.config.ts ui/stryker.config.json ui/package.json ui/package-lock.json)
check_ui_mutations() {
  [ -f ui/package.json ] || return 0
  local scope=${1:-modifie}
  git add --intent-to-add -- "${UI_MUTATION_CONTEXT[@]}" 2>/dev/null || true
  if [ "$scope" = modifie ] && [ -n "$(git diff HEAD --name-only -- "${UI_MUTATION_CONTEXT[@]}")" ]; then
    printf '\n(réglages ou outils de test de l interface modifiés : test de mutation complet)\n'
    scope=complet
  fi
  if [ "$scope" = complet ]; then
    step "Interface : test de mutation de tout le code (chaque erreur introduite doit être attrapée)"
    (cd ui && npx --no-install stryker run --incremental --incrementalFile "$UI_MUTATION_FILE" --force)
  else
    step "Interface : test de mutation du code modifié depuis le dernier passage (seuil 100 %)"
    (cd ui && npx --no-install stryker run --incremental --incrementalFile "$UI_MUTATION_FILE")
  fi
}

check_mutations() {
  require cargo mutants --version
  require jq --version
  step "Rust : test de mutation de tout le code (chaque erreur introduite doit être attrapée)"
  run_mutants --no-shuffle
}

check_uncommitted_mutations() {
  require cargo mutants --version
  require jq --version
  local diff
  diff=$(mktemp)
  # Le code Rust qui sera commité : les changements suivis, plus les nouveaux fichiers.
  git add --intent-to-add -- '*.rs' 2>/dev/null || true
  git diff HEAD -- '*.rs' > "$diff"
  step "Rust : test de mutation du code pas encore commité"
  if [ ! -s "$diff" ]; then
    printf '(aucun code Rust modifié)\n'
  else
    run_mutants --in-diff "$diff"
  fi
  rm -f "$diff"
}

check_private_files
check_file_length
if [ -f Cargo.toml ]; then check_rust; else printf '\n(pas de projet Rust : contrôles Rust sautés)\n'; fi
if [ -f ui/package.json ]; then check_ui; else printf '\n(pas d interface : contrôles interface sautés)\n'; fi
case "${1:-}" in
  --complet) check_mutations; check_ui_mutations complet ;;
  "") check_uncommitted_mutations; check_ui_mutations ;;
  *) fail "option inconnue : $1" ;;
esac

printf '\n✓ Mini CI réussie\n'
