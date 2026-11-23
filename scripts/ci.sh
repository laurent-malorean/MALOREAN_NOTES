#!/usr/bin/env bash
# CI locale à trois niveaux (doc/code.md, « Temps de la CI » ; doc/decisions/0047).
#   scripts/ci.sh            NIVEAU 1, barrière de commit (moins de 3 minutes) : fichiers privés, vocabulaire,
#                            longueur des fichiers, mise en forme, lints, dépendances, tests des seules crates
#                            touchées (et de leurs dépendantes), côté interface formatage, types, lints et
#                            tests des fichiers touchés. Pas de mutation, de parcours complets ni de couverture
#                            globale. Un commit de documentation Markdown seule (doc/**/*.md, README.md ;
#                            scripts/ci-doc-only.sh) ne joue que les contrôles du texte. Une dette de mutation
#                            ouverte (survivantes du dernier commit) refuse le commit, sauf s'il la corrige.
#                            Autorise le commit et le push.
#   NIVEAU 2 (automatique)   après chaque commit, le crochet scripts/hooks/post-commit (branché par
#                            scripts/install-hooks.sh) lance en arrière-plan le test de mutation du diff de ce
#                            commit (scripts/mutation-diff.sh) ; `scripts/ci.sh --verdict` en donne le verdict.
#   scripts/ci.sh --complet  NIVEAU 3, livraison : tout, couverture globale, parcours complets et ralentis,
#                            test de mutation de tout le code, Rust et interface. Refusé si une dette de
#                            mutation est ouverte.
#   scripts/ci.sh --sans-mutation  tous les contrôles du niveau 3 sauf les tests de mutation
#   scripts/ci.sh --copie    (avec ou sans --complet / --sans-mutation) joue la CI sur une copie figée du
#                            code, rangée hors du dépôt : on peut continuer à modifier le code pendant
#                            qu'elle tourne ; ce qu'elle valide est l'état du code à son lancement
#   scripts/ci.sh --verifier dit si le code est exactement celui de la dernière CI réussie (barrière ou complet)
#   scripts/ci.sh --verdict  affiche le dernier verdict du test de mutation du diff (OK, survivantes, en cours)
# Un passage qui voit le code changer pendant qu'il tourne (sans --copie) échoue : son verdict ne vaudrait pas
# pour ce qui serait commité. Rust et interface se contrôlent en parallèle ; les types partagés sont régénérés
# dans un dossier à part puis comparés aux types du dépôt.
# Seuil du test de mutation : 100 %, des deux côtés (jamais baissé, seulement vérifié plus tard).
# Rust : les copies mutées se construisent lints coupés (.cargo/mutants.toml), sinon une erreur
# introduite qui laisse du code inutilisé ne compile pas et n'est jamais testée. Un passage où
# des erreurs ont été introduites mais aucune testée (toutes non compilables) est refusé.
set -euo pipefail
cd "$(dirname "$0")/.."

readonly MAX_FILE_LINES=600
# Assemblage de l'interface : il relie les modules sans logique, il reste court (doc/code.md).
readonly UI_ASSEMBLY=ui/src/main.ts
readonly MAX_UI_ASSEMBLY_LINES=150
readonly RUST_MIN_LINE_COVERAGE=95
readonly PRIVATE_PATHS=(_SECRET CLAUDE.local.md)
readonly GENERATED_TYPES=ui/src/bridge/generated
# Où les tests Rust écrivent les types partagés pendant la CI : on les compare ensuite à ceux du dépôt.
GENERATED_EXPORT=$(mktemp -d)
readonly GENERATED_EXPORT
trap 'rm -rf "$GENERATED_EXPORT"' EXIT
readonly VALIDATED_TREE_FILE=.git/ci-validated-tree
readonly SNAPSHOT_DIR=${CI_SNAPSHOT_DIR:-${HOME}/Library/Caches/malorean-notes-ci}
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

# Un seul mot par notion (doc/ontology.md) : les mots remplacés ne reviennent nulle part. Seules
# les fiches de décision, datées, gardent les mots de leur époque ; l'ontologie les note
# « Autrefois … ». Ce script, qui les liste, n'est pas relu.
readonly RETIRED_WORDS='biblioth[eè]que|colonne des dossiers|sidebar|ContentType::Page|ContentTypeItem::Page'
check_vocabulary() {
  step "Vocabulaire : aucun ancien mot de l'ontologie"
  local found
  found=$(git ls-files -z --cached --others --exclude-standard -- . \
      ':(exclude)doc/decisions' ':(exclude)data_fake' ':(exclude)scripts/ci.sh' \
    | xargs -0 grep -n -I -i -E "$RETIRED_WORDS" -- 2>/dev/null \
    | grep -v 'Autrefois' || true)
  [ -z "$found" ] || fail "anciens mots, à remplacer par ceux de doc/ontology.md :
$found"
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
  TS_RS_EXPORT_DIR="$GENERATED_EXPORT" cargo llvm-cov --workspace --all-features \
    --ignore-filename-regex "$COVERAGE_IGNORED" \
    --fail-under-lines "$RUST_MIN_LINE_COVERAGE" --summary-only
  cargo test --workspace --all-features --doc

  step "Rust : dépendances (licences, failles connues)"
  cargo deny check
}

check_ui() {
  check_theme

  step "Interface : mise en forme, types, lints"
  (cd ui && npx --no-install prettier --check . && npx --no-install tsc --noEmit && npx --no-install eslint .)

  step "Interface : tests de logique et d'écran (WebKit), seuils de couverture"
  (cd ui && npx --no-install vitest run --coverage --coverage.reporter=text-summary)

  step "Interface : parcours utilisateur complets (WebKit)"
  (cd ui && npx --no-install playwright test)

  # Lecture des notes ralentie dans le faux : un parcours qui clique ou tape avant que la note soit
  # montrée échoue à coup sûr au lieu d'échouer une fois sur cent (doc/code.md, « Parcours »).
  # Sautée quand rien n'a changé dans ui/ depuis le dernier commit (les parcours n'utilisent que le faux).
  if [ "$MODE" = --complet ] || [ -n "$(git status --porcelain -- ui/ | head -1)" ]; then
    step "Interface : parcours utilisateur, lecture des notes ralentie à 100 ms"
    (cd ui && VITE_READ_DELAY=100 npx --no-install playwright test)
  else
    printf '\n(parcours à lecture ralentie sautés : rien n a changé dans ui/ depuis le dernier commit)\n'
  fi
}

# Les types partagés, régénérés par les tests Rust dans un dossier à part, sont ceux du dépôt.
check_generated_types() {
  [ -f Cargo.toml ] || return 0
  step "Interface : types partagés à jour (générés par les tests Rust)"
  diff -r "$GENERATED_EXPORT" "$GENERATED_TYPES" >/dev/null \
    || fail "types générés pas à jour : lancer \`cargo test --workspace\` pour les régénérer, puis les commiter"
}

# Joue deux fonctions en même temps ; leur sortie s'affiche à la fin de chacune, l'une après l'autre.
run_both() {
  local first_log second_log first_pid second_pid first_status=0 second_status=0
  first_log=$(mktemp)
  second_log=$(mktemp)
  ("$1") >"$first_log" 2>&1 &
  first_pid=$!
  ("$2") >"$second_log" 2>&1 &
  second_pid=$!
  wait "$first_pid" || first_status=$?
  wait "$second_pid" || second_status=$?
  cat "$first_log" "$second_log"
  rm -f "$first_log" "$second_log"
  [ "$first_status" -eq 0 ] && [ "$second_status" -eq 0 ] \
    || fail "contrôles en échec (${1#check_} : ${first_status}, ${2#check_} : ${second_status})"
}

# Une empreinte de tout le code qui serait commité (suivi ou nouveau, hors fichiers ignorés).
tree_hash() {
  local index hash
  index=$(mktemp -u)
  GIT_INDEX_FILE=$index git add -A -- . >/dev/null 2>&1
  hash=$(GIT_INDEX_FILE=$index git write-tree)
  rm -f "$index"
  printf '%s' "$hash"
}

# Joue la CI sur une copie figée du code, rangée hors du dépôt (node_modules compris : un lien vers le
# dépôt serait refusé par le navigateur de test) ; garde le résultat incrémental de Stryker.
run_in_snapshot() {
  local validated status=0
  validated=$(tree_hash)
  local PWD_ROOT=$PWD
  step "Copie figée du code dans ${SNAPSHOT_DIR}"
  mkdir -p "$SNAPSHOT_DIR"
  [ ! -L "$SNAPSHOT_DIR/ui/node_modules" ] || rm "$SNAPSHOT_DIR/ui/node_modules"
  rsync -a --delete \
    --exclude=/target --exclude=/ui/.stryker-tmp --exclude=/ui/.vitest \
    --exclude=/ui/test-results --exclude=/ui/playwright-report --exclude=/ui/coverage \
    --exclude=/_DIST --exclude=/tmp --exclude=/_SECRET --exclude=/CLAUDE.local.md ./ "$SNAPSHOT_DIR/"
  (cd "$SNAPSHOT_DIR" && MUTATION_DIR="$PWD_ROOT/tmp/mutation" CI_IN_SNAPSHOT=1 ./scripts/ci.sh "$@") || status=$?
  if [ "$status" -eq 0 ]; then
    if [ -f "$SNAPSHOT_DIR/ui/reports/stryker-incremental.json" ]; then
      mkdir -p ui/reports
      cp "$SNAPSHOT_DIR/ui/reports/stryker-incremental.json" ui/reports/
    fi
    case " $* " in *" --sans-mutation "*) ;; *) printf '%s' "$validated" > "$VALIDATED_TREE_FILE" ;; esac
  fi
  exit "$status"
}

verify_validated_tree() {
  [ -f "$VALIDATED_TREE_FILE" ] || fail "aucune CI complète réussie n'est enregistrée"
  [ "$(tree_hash)" = "$(cat "$VALIDATED_TREE_FILE")" ] \
    || fail "le code a changé depuis la dernière CI complète réussie : la relancer avant de commiter"
  printf '✓ le code est celui de la dernière CI complète réussie\n'
}

# Test de mutation de l'interface (scripts/ui-mutations.sh), en mode incrémental : Stryker ne reteste
# que les mutations dont le code, ou un test qui les couvre, a changé depuis son dernier passage ; les
# autres reprennent leur résultat, gardé dans ui/reports/stryker-incremental.json (ignoré par git).
# Sans ce fichier, tout est testé. Si le passage échoue, ses seules survivantes sont retestées : un
# test ajouté qui tue une mutation « statique » (constante) est ainsi pris en compte. Seuil 100 %.
# Fichiers que Stryker ne compare pas d'un passage à l'autre : s'ils changent, on reteste tout.
readonly UI_MUTATION_CONTEXT=(ui/test-support ui/vitest.stryker.config.ts ui/stryker.config.json ui/package.json ui/package-lock.json)
readonly UI_MUTATION_SCRIPTS=(scripts/ui-mutations.sh scripts/test-ui-mutations.sh)
check_ui_mutations() {
  [ -f ui/package.json ] || return 0
  local scope=${1:-modifie}
  git add --intent-to-add -- "${UI_MUTATION_CONTEXT[@]}" "${UI_MUTATION_SCRIPTS[@]}" 2>/dev/null || true
  if [ -n "$(git diff HEAD --name-only -- "${UI_MUTATION_SCRIPTS[@]}")" ]; then
    step "Interface : scénarios du test de mutation incrémental (script modifié)"
    scripts/test-ui-mutations.sh
  fi
  if [ "$scope" = modifie ] && [ -n "$(git diff HEAD --name-only -- "${UI_MUTATION_CONTEXT[@]}")" ]; then
    printf '\n(réglages ou outils de test de l interface modifiés : test de mutation complet)\n'
    scope=complet
  fi
  if [ "$scope" = complet ]; then
    step "Interface : test de mutation de tout le code (chaque erreur introduite doit être attrapée)"
    (cd ui && ../scripts/ui-mutations.sh --complet)
  else
    step "Interface : test de mutation du code modifié depuis le dernier passage (seuil 100 %)"
    (cd ui && ../scripts/ui-mutations.sh)
  fi
}

check_mutations() {
  require cargo mutants --version
  require jq --version
  step "Rust : test de mutation de tout le code (chaque erreur introduite doit être attrapée)"
  run_mutants --no-shuffle
}

# Fichiers que le commit changerait : changés par rapport à HEAD (index et arbre de travail) et nouveaux ;
# les essais de l'utilisateur (data_fake/) ne comptent pas.
changed_files() {
  { git diff HEAD --name-only; git ls-files --others --exclude-standard; } | grep -v '^data_fake/' | sort -u || true
}

# Dépendances entre crates (sens : crate -> elle et les crates qui en dépendent). Une crate inconnue ou un
# changement de Cargo.toml, Cargo.lock ou .cargo/ rejoue tout l'espace de travail.
reverse_closure() {
  case "$1" in
    domain) echo "domain application infrastructure api app" ;;
    application) echo "application infrastructure api app" ;;
    infrastructure) echo "infrastructure app" ;;
    api) echo "api app" ;;
    app) echo "app" ;;
    *) echo ALL ;;
  esac
}

# Les crates à tester pour les fichiers changés (vide : aucun changement Rust ; ALL : tout).
barrier_crates() {
  local file crate set=" "
  while IFS= read -r file; do
    case "$file" in
      crates/*/*) crate=$(printf '%s' "$file" | cut -d/ -f2); set+="$(reverse_closure "$crate") " ;;
      Cargo.toml | Cargo.lock | deny.toml | .cargo/* | rust-toolchain*) set+="ALL " ;;
    esac
  done
  case "$set" in *" ALL "*) echo ALL ;; *) printf '%s\n' $set | sort -u | xargs echo ;; esac
}

check_rust_barrier() {
  local crates=$1 args=() crate
  require cargo deny --version
  step "Rust : mise en forme"
  cargo fmt --all --check
  step "Rust : Clippy (aucun avertissement toléré)"
  cargo clippy --workspace --all-targets --all-features -- -D warnings
  if [ "$crates" = ALL ]; then args=(--workspace); else for crate in $crates; do args+=(-p "$crate"); done; fi
  step "Rust : tests de ${crates/ALL/tout l espace de travail} (les autres crates ne dépendent pas du code changé)"
  TS_RS_EXPORT_DIR="$GENERATED_EXPORT" cargo test "${args[@]}" --all-features
  step "Rust : dépendances (licences, failles connues)"
  cargo deny check
}

# Les types régénérés par les tests joués sont ceux du dépôt (la comparaison de tout le dossier : --complet).
check_generated_types_played() {
  [ -d "$GENERATED_EXPORT" ] || return 0
  local file
  for file in "$GENERATED_EXPORT"/*; do
    [ -e "$file" ] || continue
    cmp -s "$file" "$GENERATED_TYPES/$(basename "$file")" \
      || fail "type généré pas à jour : $(basename "$file") (lancer \`cargo test --workspace\`, puis commiter)"
  done
}

check_ui_barrier() {
  local files=() file all_src=1
  while IFS= read -r file; do
    case "$file" in
      ui/src/bridge/generated/*) ;;
      ui/src/*.ts) [ -f "$file" ] && files+=("${file#ui/}") ;;
      ui/*) all_src=0 ;;
    esac
  done
  check_theme
  step "Interface : mise en forme, types, lints"
  (cd ui && npx --no-install prettier --check . && npx --no-install tsc --noEmit && npx --no-install eslint .)
  if [ "$all_src" -eq 0 ]; then
    step "Interface : tests de logique et d'écran (réglages changés : tous les tests)"
    (cd ui && npx --no-install vitest run)
  elif [ "${#files[@]}" -gt 0 ]; then
    step "Interface : tests des fichiers touchés (et de ceux qui en dépendent)"
    (cd ui && npx --no-install vitest related --run "${files[@]}")
  fi
}

# NIVEAU 1 : la barrière de commit.
run_barrier() {
  local changed crates
  changed=$(changed_files)
  if printf '%s\n' "$changed" | grep -q '^scripts/'; then
    step "Scripts de CI changés : scénarios de la barrière et de la voie documentation"
    scripts/test-ci-gate.sh
  fi
  step "Dette de mutation : le dernier commit n'a-t-il rien laissé passer ?"
  printf '%s\n' "$changed" | scripts/ci-debt.sh check
  crates=$(printf '%s\n' "$changed" | barrier_crates)
  BARRIER_CRATES=$crates
  if [ -f Cargo.toml ] && [ -n "$crates" ] && [ -f ui/package.json ] && printf '%s\n' "$changed" | grep -q '^ui/'; then
    step "Rust et interface, en parallèle"
    run_both check_rust_barrier_changed check_ui_barrier_changed
  else
    if [ -f Cargo.toml ] && [ -n "$crates" ]; then check_rust_barrier_changed; fi
    if [ -f ui/package.json ] && printf '%s\n' "$changed" | grep -q '^ui/'; then check_ui_barrier_changed; fi
  fi
  check_generated_types_played
}
check_ui_barrier_changed() { changed_files | check_ui_barrier; }
check_rust_barrier_changed() { check_rust_barrier "$BARRIER_CRATES"; }

# Les fichiers qui seraient commités (changés par rapport à HEAD, dans l'index ou l'arbre de travail,
# plus les nouveaux) sont-ils tous de la documentation Markdown ? (règle : scripts/ci-doc-only.sh)
docs_only_change() {
  git rev-parse --git-dir >/dev/null 2>&1 || return 1
  { git diff HEAD --name-only; git ls-files --others --exclude-standard; } | scripts/ci-doc-only.sh
}

MODE=""
SNAPSHOT=0
FORWARDED=()
for argument in "$@"; do
  case "$argument" in
    --complet | --sans-mutation) MODE=$argument; FORWARDED+=("$argument") ;;
    --copie) SNAPSHOT=1 ;;
    --verifier) verify_validated_tree; exit 0 ;;
    --verdict) if [ -f tmp/mutation/encours ]; then printf '(test de mutation en cours sur %s)\n' "$(cat tmp/mutation/encours)"; fi
      scripts/ci-debt.sh verdict; exit 0 ;;
    *) fail "option inconnue : $argument" ;;
  esac
done
# Livraison : aucune dette de mutation ouverte (vérifié ici, hors copie, tmp/ n'y étant pas copié).
if [ "$MODE" = --complet ] && [ -z "${CI_IN_SNAPSHOT:-}" ]; then scripts/ci-debt.sh check-strict; fi
if [ "$SNAPSHOT" -eq 1 ] && [ -z "${CI_IN_SNAPSHOT:-}" ]; then run_in_snapshot ${FORWARDED[@]+"${FORWARDED[@]}"}; fi

STARTED_TREE=""
if [ -z "${CI_IN_SNAPSHOT:-}" ]; then STARTED_TREE=$(tree_hash); fi

check_private_files
check_vocabulary
check_file_length
scripts/test-ci-doc-only.sh >/dev/null
if [ "$MODE" = "" ]; then
  # Un commit qui ne touche que de la documentation Markdown ne rejoue pas les contrôles du code.
  if docs_only_change; then
    printf '\n(documentation Markdown seule : contrôles du code, tests et mutation sautés)\n'
    if [ -z "${CI_IN_SNAPSHOT:-}" ]; then printf '%s' "$(tree_hash)" > "$VALIDATED_TREE_FILE"; fi
    printf '\n✓ Barrière de commit réussie (documentation seule)\n'
    exit 0
  fi
  run_barrier
  if [ -n "$STARTED_TREE" ]; then
    [ "$(tree_hash)" = "$STARTED_TREE" ] \
      || fail "le code a changé pendant la CI : ce passage ne vaut pas pour ce qui serait commité (relancer, ou utiliser --copie)"
    printf '%s' "$STARTED_TREE" > "$VALIDATED_TREE_FILE"
  fi
  printf '\n✓ Barrière de commit réussie : commit autorisé ; le test de mutation du diff suivra en arrière-plan (scripts/ci.sh --verdict)\n'
  exit 0
fi

if [ -f Cargo.toml ] && [ -f ui/package.json ]; then
  step "Rust et interface, en parallèle"
  run_both check_rust check_ui
  check_generated_types
else
  if [ -f Cargo.toml ]; then check_rust; else printf '\n(pas de projet Rust : contrôles Rust sautés)\n'; fi
  if [ -f ui/package.json ]; then check_ui; else printf '\n(pas d interface : contrôles interface sautés)\n'; fi
fi
case "$MODE" in
  --complet) check_mutations; check_ui_mutations complet ;;
  --sans-mutation)
    printf '\n(tests de mutation sautés : lancer scripts/ci.sh --complet avant une livraison)\n'
    printf '\n✓ Contrôles réussis, sans mutation\n'
    exit 0 ;;
esac

if [ -n "$STARTED_TREE" ]; then
  [ "$(tree_hash)" = "$STARTED_TREE" ] \
    || fail "le code a changé pendant la CI : ce passage ne vaut pas pour ce qui serait commité (relancer, ou utiliser --copie)"
  printf '%s' "$STARTED_TREE" > "$VALIDATED_TREE_FILE"
fi
printf '\n✓ CI complète réussie : livraison possible\n'
