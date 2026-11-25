#!/usr/bin/env bash
# CI locale (doc/code.md, « Temps de la CI » ; doc/decisions/0047 et 0049). La mutation n'est plus une barrière.
#   scripts/ci.sh            BARRIÈRE DE COMMIT (moins de 3 minutes) : fichiers privés, vocabulaire, longueur des
#                            fichiers, mise en forme, lints, dépendances, tests avec couverture (Rust ≥ 95 %,
#                            interface : seuils de Vitest), types partagés à jour. Seulement ce qui a changé :
#                            Rust si le code Rust ou ses réglages changent, interface si ui/ change. Pas de
#                            parcours complets, pas de mutation. Un commit de documentation Markdown seule
#                            (doc/**/*.md, README.md ; scripts/ci-doc-only.sh) ne joue que les contrôles du texte.
#                            Autorise le commit et le push.
#   scripts/ci.sh --fonction FIN DE FONCTION (moins de 10 minutes) : la barrière en entier (Rust et interface,
#                            couverture globale) plus tous les parcours (normaux et lecture ralentie). Sans mutation.
#   scripts/ci.sh --livraison  la fin de fonction, puis la mutation du domaine (crates/domain) et un échantillon
#                            (un dixième, une erreur par fonction) du reste du code Rust, sur le diff depuis le tag
#                            local `ci-verte` ; à son succès, `ci-verte` avance à HEAD. Moins de 25 minutes.
#                            Toute mutation lancée ici REJOUE une fois ses dépassements de délai (délai x 4, borné à
#                            600 s, scripts/mutation-rejeu.sh, fiche 0053) : un survivant du rejeu est un survivant,
#                            un dépassement qui persiste est un avertissement chiffré ; le rapport dit avant et après.
#   scripts/ci.sh --echantillon  (à la demande, non bloquant, à lancer en arrière-plan) le même échantillon Rust ;
#                            les survivants s'écrivent dans la liste de suivi (.git/ci-mutation/suivi.txt), le code de sortie reste 0.
#   scripts/ci.sh --branche  FIN DE TÂCHE D'UN AGENT (dans son dossier de travail) : mutation de tout le diff Rust de la
#                            branche depuis main (domaine puis reste), avec rejeu des dépassements ; bloquant : un
#                            survivant fait échouer, l'agent renforce ses tests et relance jusqu'à zéro survivant.
#   scripts/ci.sh --mutation-interface  (à la demande) Stryker de l'interface, incrémental, seuil 100 %.
#   scripts/ci.sh --tout-le-code  EXCEPTIONNEL (jamais lancé par une règle, plus de 2 heures) : tout, mutation de
#                            tout le code Rust et de toute l'interface.
#   scripts/ci.sh --copie    (avec --fonction ou --livraison) joue la CI sur une copie figée du code, rangée
#                            hors du dépôt : on peut continuer à travailler pendant qu'elle tourne
#   scripts/ci.sh --verifier dit si le code est exactement celui de la dernière CI réussie
#   scripts/ci.sh --verdict  affiche le dernier verdict de la mutation du domaine (après un commit, en arrière-plan,
#                            par le crochet scripts/hooks/post-commit ; non bloquant) et la liste de suivi
#   scripts/ci.sh --menage [--a-blanc]  ménage du dossier de compilation (scripts/ci-menage.sh) : retire le périmé
#                            (plus d'un jour sans usage) au-delà de 20 Go ; --a-blanc liste sans rien effacer.
#                            Lancé aussi à la fin de la barrière et de --fonction, réussies ou non ; son échec
#                            ne fait jamais échouer la CI (CI_SANS_MENAGE=1 : pas de ménage, pour les tests)
# Un passage qui voit le code changer pendant qu'il tourne (sans --copie) échoue : son verdict ne vaudrait pas
# pour ce qui serait commité. Rust et interface se contrôlent en parallèle ; les types partagés sont régénérés
# dans un dossier à part puis comparés aux types du dépôt.
# Rust : les copies mutées se construisent lints coupés (.cargo/mutants.toml), sinon une erreur
# introduite qui laisse du code inutilisé ne compile pas et n'est jamais testée.
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
# Dans un `git worktree`, `.git` est un fichier : l'empreinte de validation est propre à chaque dossier de
# travail (git-dir) ; les verdicts de mutation et la liste de suivi sont communs à tous (git-common-dir).
GIT_DIR_OF_WORKTREE=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null || echo .git)
readonly GIT_DIR_OF_WORKTREE
readonly VALIDATED_TREE_FILE="$GIT_DIR_OF_WORKTREE/ci-validated-tree"
MUTATION_DIR=${MUTATION_DIR:-$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo .git)/ci-mutation}
readonly MUTATION_DIR
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
readonly MUTANTS_BIN=${MUTANTS_BIN:-cargo mutants}
readonly SUIVI="$MUTATION_DIR/suivi.txt"
# Plafonds de délai des erreurs qui bouclent (doc/decisions/0049) : le domaine a des tests en millisecondes ;
# ailleurs un test normal dure jusqu'à 45 s (infrastructure), le plafond reste au-dessus.
readonly DOMAIN_TIMEOUT=30
readonly SAMPLE_TIMEOUT=90
run_mutants() {
  local status=0 started
  # Sans erreur à introduire, cargo-mutants n'écrit aucun bilan : celui qui reste est celui d'un passage
  # précédent, à ne pas relire.
  started=$(mktemp)
  # Les copies mutées se construisent lints coupés (.cargo/mutants.toml, `cap_lints`).
  # shellcheck disable=SC2086
  $MUTANTS_BIN --all-features --jobs 4 "$@" || status=$?
  case "$status" in
    0 | "$MUTANTS_MISSED" | "$MUTANTS_TIMEOUT") ;;
    *) fail "le test de mutation n'a pas pu tourner (code $status)" ;;
  esac
  MUTANTS_RAN=0
  if [ "$MUTANTS_OUTCOMES" -nt "$started" ]; then MUTANTS_RAN=1; else printf '(aucune erreur à introduire dans ce code)\n'; fi
  rm -f "$started"
  [ "$MUTANTS_RAN" -eq 0 ] || replay_timeouts "$@"
}

# Rejeu des dépassements de délai (scripts/mutation-rejeu.sh, doc/decisions/0053) : un dépassement n'est pas une
# preuve ; rejoué une fois avec un délai quadruplé, le bilan est fusionné et lu comme celui d'une passe.
# Reçoit les arguments de la passe : le délai en est extrait, le reste est rejoué tel quel.
replay_timeouts() {
  local args=() timeout_s="" previous=""
  for a in "$@"; do
    if [ "$a" = --timeout ]; then previous=$a; continue; fi
    if [ "$previous" = --timeout ]; then timeout_s=$a; previous=""; continue; fi
    args+=("$a")
  done
  [ -n "$timeout_s" ] || return 0
  scripts/mutation-rejeu.sh . "$timeout_s" --all-features --jobs 4 "${args[@]}" || fail "le rejeu des dépassements n'a pas pu tourner"
}

# Lit le bilan de run_mutants. $1 : nom ; $2 : bloquant (1) ou non (0). Les survivants vont dans la liste de suivi.
# Un passage où des erreurs ont été introduites mais aucune testée (toutes « non compilables ») n'a rien vérifié.
report_mutants() {
  [ "$MUTANTS_RAN" -eq 1 ] || return 0
  local total tested missed
  total=$(jq '.total_mutants' "$MUTANTS_OUTCOMES")
  tested=$(jq '.caught + .missed + .timeout' "$MUTANTS_OUTCOMES")
  missed=$(jq '.missed' "$MUTANTS_OUTCOMES")
  printf '(%s : %s erreurs introduites, %s testées, %s non compilables, %s survivantes)\n' \
    "$1" "$total" "$tested" "$(jq '.unviable' "$MUTANTS_OUTCOMES")" "$missed"
  local timeouts_before timeouts_after
  timeouts_before=$(sed -n 's/^AVANT=\([0-9]*\) .*/\1/p' mutants.out/rejeu.txt 2>/dev/null)
  timeouts_after=$(jq '.timeout' "$MUTANTS_OUTCOMES")
  printf '(%s : %s dépassements avant rejeu, %s après)\n' "$1" "${timeouts_before:-0}" "$timeouts_after"
  if [ "$timeouts_after" -gt 0 ]; then
    printf '⚠ AVERTISSEMENT %s : %s dépassement(s) persistent après rejeu, ce n est pas une preuve : voir mutants.out/timeout.txt\n' "$1" "$timeouts_after"
  fi
  if [ "$missed" -gt 0 ]; then
    mkdir -p "$(dirname "$SUIVI")"
    while IFS= read -r line; do printf '%s %s %s\n' "$(date +%F)" "$1" "$line" >> "$SUIVI"; done < mutants.out/missed.txt
    if [ "$2" -eq 1 ]; then fail "${missed} erreurs introduites dans le code ne sont attrapées par aucun test (voir ${SUIVI})"; fi
    printf '(survivantes écrites dans %s : à traiter, rien n est refusé)\n' "$SUIVI"
  elif [ "$total" -gt 0 ] && [ "$tested" -eq 0 ]; then
    if [ "$2" -eq 1 ]; then fail "aucune des ${total} erreurs introduites n'a pu être testée : toutes sont non compilables"; fi
    printf '(aucune erreur testée : toutes non compilables)\n'
  fi
}

# Mutation Rust du diff depuis le tag `ci-verte`. $1 : domaine (toutes les erreurs, crates/domain, coupure 30 s)
# ou echantillon (le reste du code, un dixième des erreurs, une erreur par fonction : les erreurs d'opérateurs une à
# une « replace X with Y in … » sont écartées) ; $2 : bloquant (1) ou non (0).
mutate_since_tag() {
  local kind=$1 blocking=$2 base diff
  case "$kind" in
    branche-*) base=$(git merge-base main HEAD) || fail "main introuvable : la branche ne peut pas être comparée" ;;
    *) base=$(scripts/ci-verte.sh base) || fail "le tag ci-verte manque (scripts/ci-verte.sh poser <commit>)" ;;
  esac
  diff=$(mktemp)
  case "$kind" in
    domaine)
      git diff "$base" -- 'crates/domain/*.rs' > "$diff"
      step "Rust : mutation du domaine, diff depuis ci-verte (coupure ${DOMAIN_TIMEOUT} s)"
      [ ! -s "$diff" ] || run_mutants --package domain --timeout "$DOMAIN_TIMEOUT" --test-workspace=false --in-diff "$diff" ;;
    echantillon)
      git diff "$base" -- 'crates/*.rs' ':(exclude)crates/domain' > "$diff"
      local shard=${CI_SHARD:-$((RANDOM % 10))}
      step "Rust : échantillon de mutation (un dixième, tranche ${shard}/10, une erreur par fonction), diff depuis ci-verte"
      [ ! -s "$diff" ] || run_mutants --workspace --exclude "$COVERAGE_IGNORED" --exclude-re ' in ' \
        --shard "${shard}/10" --timeout "$SAMPLE_TIMEOUT" --test-workspace=false --in-diff "$diff" ;;
    branche-domaine)
      git diff "$base" -- 'crates/domain/*.rs' > "$diff"
      step "Rust : mutation du domaine, diff de la branche depuis main (coupure ${DOMAIN_TIMEOUT} s)"
      [ ! -s "$diff" ] || run_mutants --package domain --timeout "$DOMAIN_TIMEOUT" --test-workspace=false --in-diff "$diff" ;;
    branche-reste)
      git diff "$base" -- 'crates/*.rs' ':(exclude)crates/domain' > "$diff"
      step "Rust : mutation du reste du code, diff de la branche depuis main (coupure ${SAMPLE_TIMEOUT} s)"
      [ ! -s "$diff" ] || run_mutants --workspace --exclude "$COVERAGE_IGNORED" --timeout "$SAMPLE_TIMEOUT" --test-workspace=false --in-diff "$diff" ;;
  esac
  if [ -s "$diff" ]; then report_mutants "$kind" "$blocking"; else printf '(aucun code Rust changé depuis ci-verte)\n'; fi
  rm -f "$diff"
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
  # worktrees/ : les autres branches, chacune contrôlée par sa propre barrière dans son dossier.
  too_long=$(find . \( -name '*.rs' -o -name '*.ts' \) \
      -not -path './worktrees/*' -not -path '*/target/*' -not -path '*/node_modules/*' -not -path '*/.vitest/*' -not -path '*/.stryker-tmp/*' -not -path "./${GENERATED_TYPES}/*" \
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

check_ui_core() {
  check_theme

  step "Interface : mise en forme, types, lints"
  (cd ui && npx --no-install prettier --check . && npx --no-install tsc --noEmit && npx --no-install eslint .)

  step "Interface : tests de logique et d'écran (WebKit), seuils de couverture"
  (cd ui && npx --no-install vitest run --coverage --coverage.reporter=text-summary)

}

check_ui_parcours() {
  step "Interface : parcours utilisateur complets (WebKit)"
  (cd ui && npx --no-install playwright test)

  # Lecture des notes ralentie dans le faux : un parcours qui clique ou tape avant que la note soit
  # montrée échoue à coup sûr au lieu d'échouer une fois sur cent (doc/code.md, « Parcours »).
  step "Interface : parcours utilisateur, lecture des notes ralentie à 100 ms"
  (cd ui && VITE_READ_DELAY=100 npx --no-install playwright test)
}

check_ui() { check_ui_core; check_ui_parcours; }

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
  (cd "$SNAPSHOT_DIR" && MUTATION_DIR="$MUTATION_DIR" CI_IN_SNAPSHOT=1 ./scripts/ci.sh "$@") || status=$?
  if [ "$status" -eq 0 ]; then
    if [ -f "$SNAPSHOT_DIR/ui/reports/stryker-incremental.json" ]; then
      mkdir -p ui/reports
      cp "$SNAPSHOT_DIR/ui/reports/stryker-incremental.json" ui/reports/
    fi
    printf '%s' "$validated" > "$VALIDATED_TREE_FILE"
  fi
  return "$status"
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
  run_mutants --workspace --exclude "$COVERAGE_IGNORED" --no-shuffle
  report_mutants "tout le code" 1
}

# Fichiers que le commit changerait : changés par rapport à HEAD (index et arbre de travail) et nouveaux ;
# les essais de l'utilisateur (data_fake/) ne comptent pas.
changed_files() {
  { git diff HEAD --name-only; git ls-files --others --exclude-standard; } | grep -v '^data_fake/' | sort -u || true
}

# Rust est touché : du code Rust, ses réglages (Cargo, deny, .cargo) ou les types partagés qu'il génère.
rust_touched() { grep -qE '^(crates/|Cargo\.(toml|lock)$|deny\.toml$|\.cargo/|rust-toolchain)'; }

# LA BARRIÈRE DE COMMIT.
run_barrier() {
  local changed rust=0 ui=0
  changed=$(changed_files)
  if printf '%s\n' "$changed" | grep -q '^scripts/'; then
    step "Scripts de CI changés : scénarios de la barrière, du ménage et du rejeu des dépassements"
    scripts/test-ci-gate.sh
    scripts/test-ci-menage.sh
    scripts/test-ci-rejeu.sh
    scripts/test-essai-application.sh
  fi
  if [ -f Cargo.toml ] && printf '%s\n' "$changed" | rust_touched; then rust=1; fi
  if [ -f ui/package.json ] && printf '%s\n' "$changed" | grep -q '^ui/'; then ui=1; fi
  if [ "$rust" -eq 1 ] && [ "$ui" -eq 1 ]; then
    step "Rust et interface, en parallèle"
    run_both check_rust check_ui_core
  else
    if [ "$rust" -eq 1 ]; then check_rust; fi
    if [ "$ui" -eq 1 ]; then check_ui_core; fi
  fi
  if [ "$rust" -eq 1 ]; then check_generated_types; fi
}

# Les fichiers qui seraient commités (changés par rapport à HEAD, dans l'index ou l'arbre de travail,
# plus les nouveaux) sont-ils tous de la documentation Markdown ? (règle : scripts/ci-doc-only.sh)
docs_only_change() {
  git rev-parse --git-dir >/dev/null 2>&1 || return 1
  { git diff HEAD --name-only; git ls-files --others --exclude-standard; } | scripts/ci-doc-only.sh
}

# Ménage du dossier de compilation à la sortie, réussie ou non (scripts/ci-menage.sh : seulement le périmé,
# au-delà du seuil, jamais pendant qu'un autre travail tourne). Son échec ne change jamais le verdict.
run_cleanup() {
  [ -z "${CI_SANS_MENAGE:-}" ] || return 0
  scripts/ci-menage.sh --discret || true
}
arm_cleanup() {
  trap 'status=$?; rm -rf "$GENERATED_EXPORT"; run_cleanup; exit "$status"' EXIT
}

MODE=""
MENAGE=0
BLANC=0
SNAPSHOT=0
SAMPLE=0
BRANCH=0
UI_MUTATION=0
FORWARDED=()
for argument in "$@"; do
  case "$argument" in
    --fonction | --tout-le-code) MODE=$argument; FORWARDED+=("$argument") ;;
    --livraison) MODE=$argument; FORWARDED+=(--fonction) ;;
    --complet | --sans-mutation) fail "$argument n'existe plus : --fonction (fin de fonction), --livraison, ou --tout-le-code (exceptionnel)" ;;
    --echantillon) SAMPLE=1 ;;
    --branche) BRANCH=1 ;;
    --mutation-interface) UI_MUTATION=1 ;;
    --copie) SNAPSHOT=1 ;;
    --menage) MENAGE=1 ;;
    --a-blanc) BLANC=1 ;;
    --verifier) verify_validated_tree; exit 0 ;;
    --verdict) if [ -f "$MUTATION_DIR/encours" ]; then printf '(test de mutation en cours sur %s)\n' "$(cat "$MUTATION_DIR/encours")"; fi
      if [ -f "$MUTATION_DIR/dernier" ]; then cat "$MUTATION_DIR/dernier"; else printf '(aucun verdict de mutation du domaine)\n'; fi
      if [ -s "$SUIVI" ]; then printf '\nSurvivants à traiter (%s) :\n' "$SUIVI"; cat "$SUIVI"; fi
      exit 0 ;;
    *) fail "option inconnue : $argument" ;;
  esac
done
[ "$BLANC" -eq 0 ] || [ "$MENAGE" -eq 1 ] || fail "--a-blanc ne va qu'avec --menage"
if [ "$MENAGE" -eq 1 ] && [ "$BLANC" -eq 1 ]; then exec scripts/ci-menage.sh --a-blanc; fi
if [ "$MENAGE" -eq 1 ]; then exec scripts/ci-menage.sh; fi
# À la demande, non bloquants : l'échantillon Rust et Stryker de l'interface.
if [ "$SAMPLE" -eq 1 ]; then
  require cargo mutants --version
  require jq --version
  mutate_since_tag echantillon 0
  exit 0
fi
# Fin de tâche d'un agent : toutes les erreurs du diff de la branche depuis main, bloquant jusqu'à zéro survivant.
if [ "$BRANCH" -eq 1 ]; then
  require cargo mutants --version
  require jq --version
  git diff --quiet HEAD -- . ':(exclude)data_fake' || fail "--branche : du code n'est pas commité, la mutation porte sur le diff des commits"
  mutate_since_tag branche-domaine 1
  mutate_since_tag branche-reste 1
  printf '\n✓ Aucune erreur introduite dans la branche ne survit\n'
  exit 0
fi
if [ "$UI_MUTATION" -eq 1 ]; then check_ui_mutations modifie; exit 0; fi
if [ "$SNAPSHOT" -eq 1 ] && [ "$MODE" = "" ]; then fail "--copie va avec --fonction ou --livraison"; fi

# La mutation de la livraison se joue sur le dépôt (le tag est dans git) : après la copie figée s'il y en a une.
finish_delivery() {
  require cargo mutants --version
  require jq --version
  git diff --quiet HEAD -- . ':(exclude)data_fake' || fail "livraison : du code n'est pas commité, la mutation porte sur le diff des commits"
  mutate_since_tag domaine 1
  mutate_since_tag echantillon 1
  scripts/ci-verte.sh avancer
  printf '\n✓ Livraison réussie : le tag ci-verte est sur HEAD\n'
}
if [ "$SNAPSHOT" -eq 1 ] && [ -z "${CI_IN_SNAPSHOT:-}" ]; then
  run_in_snapshot ${FORWARDED[@]+"${FORWARDED[@]}"} || exit $?
  if [ "$MODE" = --livraison ]; then finish_delivery; fi
  exit 0
fi

STARTED_TREE=""
if [ -z "${CI_IN_SNAPSHOT:-}" ]; then STARTED_TREE=$(tree_hash); fi

check_private_files
check_vocabulary
check_file_length
scripts/test-ci-doc-only.sh >/dev/null
if [ "$MODE" = "" ]; then
  # Un commit qui ne touche que de la documentation Markdown ne rejoue pas les contrôles du code.
  if docs_only_change; then
    printf '\n(documentation Markdown seule : contrôles du code et tests sautés)\n'
    if [ -z "${CI_IN_SNAPSHOT:-}" ]; then printf '%s' "$(tree_hash)" > "$VALIDATED_TREE_FILE"; fi
    printf '\n✓ Barrière de commit réussie (documentation seule)\n'
    exit 0
  fi
  arm_cleanup
  run_barrier
  if [ -n "$STARTED_TREE" ]; then
    [ "$(tree_hash)" = "$STARTED_TREE" ] \
      || fail "le code a changé pendant la CI : ce passage ne vaut pas pour ce qui serait commité (relancer, ou utiliser --copie)"
    printf '%s' "$STARTED_TREE" > "$VALIDATED_TREE_FILE"
  fi
  printf '\n✓ Barrière de commit réussie : commit autorisé\n'
  exit 0
fi

arm_cleanup
if [ -f Cargo.toml ] && [ -f ui/package.json ]; then
  step "Rust et interface, en parallèle"
  run_both check_rust check_ui
  check_generated_types
else
  if [ -f Cargo.toml ]; then check_rust; else printf '\n(pas de projet Rust : contrôles Rust sautés)\n'; fi
  if [ -f ui/package.json ]; then check_ui; else printf '\n(pas d interface : contrôles interface sautés)\n'; fi
fi
if [ "$MODE" = --tout-le-code ]; then check_mutations; check_ui_mutations complet; fi

if [ -n "$STARTED_TREE" ]; then
  [ "$(tree_hash)" = "$STARTED_TREE" ] \
    || fail "le code a changé pendant la CI : ce passage ne vaut pas pour ce qui serait commité (relancer, ou utiliser --copie)"
  printf '%s' "$STARTED_TREE" > "$VALIDATED_TREE_FILE"
fi
printf '\n✓ Contrôles de fin de fonction réussis\n'
if [ "$MODE" = --livraison ] && [ -z "${CI_IN_SNAPSHOT:-}" ]; then finish_delivery; fi
