#!/usr/bin/env bash
# ESSAI DE L'APPLICATION RÉELLE (doc/decisions/0054) : construit le vrai .app avec le code d'essai, le lance
# sur un espace de travail temporaire, le laisse jouer ses scénarios dans sa vraie fenêtre (vrai WKWebView,
# vraie IPC Tauri, vrai Rust, vrais fichiers), puis lit son rapport. À lancer à la demande avant une
# livraison ; ce n'est ni dans la barrière de commit ni dans --fonction (la construction est longue).
#
#   scripts/essai-application.sh
#
# Une fenêtre de l'application s'ouvre quelques secondes sur l'écran, puis se ferme seule.
# Code de sortie : 0 tout réussi ; 1 un scénario au moins a échoué ; 2 pas de rapport (délai, plantage).
# Réglages : ESSAI_DELAI (secondes d'attente du rapport, 300 par défaut), CARGO_TARGET_DIR (dossier de
# compilation), ESSAI_SORTIE (où garder le rapport et le journal, tmp/essai-application par défaut).
# ESSAI_APPLICATION=<programme> saute la construction et lance ce programme (preuves du script).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

readonly IDENTIFIER=com.malorean.notes.essai
readonly PRODUCT="MALOREAN Notes Essai"
readonly DELAY=${ESSAI_DELAI:-300}
readonly NOTE_COUNT=400
readonly MODEL=e5-small
readonly FIXTURES=ui/test-support/essai
readonly KEEP=${ESSAI_SORTIE:-$ROOT/tmp/essai-application}
TARGET=${CARGO_TARGET_DIR:-$ROOT/target}

fail() { printf '✗ %s\n' "$1" >&2; exit 2; }
step() { printf '\n▶ %s\n' "$1"; }

# Construit l'interface et le .app d'essai ; rend le programme à lancer. L'identifiant et le nom du produit
# diffèrent de ceux de l'application de l'utilisateur : ses préférences, ses notes, son stockage web ne sont
# jamais touchés. Le code d'essai n'existe que dans cette construction (variable de Vite, fonctionnalité Cargo).
build_application() {
  step "Interface d'essai"
  (cd ui && MALOREAN_ESSAI_BUILD=1 npx --no-install vite build --outDir dist-essai --emptyOutDir)
  step "Application d'essai (.app)"
  local config
  config=$(printf '{"productName":"%s","identifier":"%s","build":{"beforeBuildCommand":"","frontendDist":"../../ui/dist-essai"}}' "$PRODUCT" "$IDENTIFIER")
  CARGO_TARGET_DIR=$TARGET ui/node_modules/.bin/tauri build --bundles app --features essai --config "$config"
  APPLICATION="$TARGET/release/bundle/macos/$PRODUCT.app/Contents/MacOS/malorean-notes"
  [ -x "$APPLICATION" ] || fail "application d'essai introuvable : $APPLICATION"
}

# Les espaces de travail de l'essai : `notes` (une image, la carte mentale d'exemple copiée) et `recherche`
# (400 notes). Rien ne vient de l'espace d'exemple du dépôt ni de celui de l'utilisateur.
prepare_workspaces() {
  local notes=$1/notes search=$1/recherche n
  mkdir -p "$notes/Fixtures" "$search"
  cp "$FIXTURES/image.png" "$notes/Fixtures/image.png"
  cp "$FIXTURES/toto.md" "$notes/toto.md"
  for ((n = 1; n <= NOTE_COUNT; n++)); do
    printf '# Richesse numéro %d\n\nLa richesse des nations, passage %d : le travail, les marchés et le commerce.\n' "$n" "$n" > "$search/richesse-$n.md"
  done
}

# Le dossier de données de l'application d'essai, neuf à chaque essai ; le modèle de sens de l'utilisateur y est
# cloné (lecture seule chez lui) pour que la colonne « idées » puisse répondre.
prepare_data() {
  local support=$HOME/Library/Application\ Support
  rm -rf "$support/$IDENTIFIER" "$HOME/Library/WebKit/$IDENTIFIER" "$HOME/Library/Caches/$IDENTIFIER"
  mkdir -p "$support/$IDENTIFIER/models"
  if [ -d "$support/com.malorean.notes/models/$MODEL" ]; then
    cp -cR "$support/com.malorean.notes/models/$MODEL" "$support/$IDENTIFIER/models/$MODEL" 2>/dev/null \
      || cp -R "$support/com.malorean.notes/models/$MODEL" "$support/$IDENTIFIER/models/$MODEL"
  fi
}

# Attend le rapport, la fin du programme ou le délai ; tue le programme s'il tourne encore.
wait_for_report() {
  local pid=$1 report=$2 waited=0
  while [ ! -s "$report" ] && kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$DELAY" ]; do
    sleep 1; waited=$((waited + 1))
  done
  [ -s "$report" ] || sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -9 "$pid" 2>/dev/null || true
  fi
  [ -s "$report" ] || { [ "$waited" -ge "$DELAY" ] && return 3 || return 4; }
}

work=""
main() {
  if [ -n "${ESSAI_APPLICATION:-}" ]; then APPLICATION=$ESSAI_APPLICATION; else build_application; fi
  local report
  work=$(mktemp -d)
  trap 'rm -rf -- "$work"' EXIT
  report=$work/rapport.json
  prepare_workspaces "$work/espace"
  prepare_data
  mkdir -p "$KEEP"
  step "Lancement : une fenêtre de l'application s'ouvre quelques secondes sur l'écran (délai maximal ${DELAY} s)"
  local started=$SECONDS pid code=0
  MALOREAN_ESSAI="$report" MALOREAN_ESSAI_ESPACE="$work/espace" "$APPLICATION" >"$KEEP/application.log" 2>&1 &
  pid=$!
  wait_for_report "$pid" "$report" || code=$?
  printf "Durée de l'essai : %d s\n" $((SECONDS - started))
  if [ "$code" -eq 3 ]; then fail "délai de ${DELAY} s dépassé : l'application a été arrêtée sans rapport (journal : $KEEP/application.log)"; fi
  if [ "$code" -eq 4 ]; then fail "l'application s'est arrêtée sans écrire de rapport (journal : $KEEP/application.log)"; fi
  cp "$report" "$KEEP/rapport.json"
  step "Rapport ($KEEP/rapport.json)"
  node scripts/essai-rapport.mjs "$KEEP/rapport.json"
}

main "$@"
