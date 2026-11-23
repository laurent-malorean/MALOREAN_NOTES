#!/usr/bin/env bash
# Dette de mutation : le dernier verdict du test de mutation du diff d'un commit (scripts/mutation-diff.sh)
# cite des erreurs introduites que aucun test n'attrape. Le verdict est dans tmp/mutation/dernier
# (ignoré par git ; dossier changeable par MUTATION_DIR pour les tests).
#   ci-debt.sh verdict       affiche le dernier verdict (rien : aucun passage encore fait)
#   ci-debt.sh check         lit sur l'entrée les fichiers que le commit change ; sort 0 s'il n'y a pas de dette,
#                            ou si le commit la corrige ; sort 1 sinon. Le commit corrige quand il change un
#                            fichier cité, ou un fichier de test de la même crate (ou de l'interface) qu'un
#                            fichier cité. Aucun autre chemin : pas de contournement.
#   ci-debt.sh check-strict  sort 1 dès qu'il y a une dette (livraison : aucune exception)
#   ci-debt.sh cited         affiche les fichiers cités par la dette (un par ligne)
set -euo pipefail
cd "$(dirname "$0")/.."
readonly LAST="${MUTATION_DIR:-tmp/mutation}/dernier"

has_debt() { [ -f "$LAST" ] && head -1 "$LAST" | grep -qx 'RESULT: SURVIVORS'; }
cited() { sed -n 's/^CITED: //p' "$LAST"; }
# Crate (crates/x) ou « ui » d'un chemin ; vide pour les autres.
unit_of() { case "$1" in crates/*/*) printf '%s' "$1" | cut -d/ -f1-2 ;; ui/*) printf 'ui' ;; esac; }
is_test_path() { case "$1" in */tests/* | *_tests.rs | */tests.rs | *test* | *.test.ts | ui/e2e/*) return 0 ;; *) return 1 ;; esac; }

fixes_debt() {
  local changed cite
  while IFS= read -r changed; do
    [ -n "$changed" ] || continue
    while IFS= read -r cite; do
      [ "$changed" = "$cite" ] && return 0
      if is_test_path "$changed" && [ -n "$(unit_of "$changed")" ] && [ "$(unit_of "$changed")" = "$(unit_of "$cite")" ]; then return 0; fi
    done < <(cited)
  done
  return 1
}

case "${1:-}" in
  verdict) if [ -f "$LAST" ]; then cat "$LAST"; else printf '(aucun verdict de mutation : le test de mutation du diff se lance après chaque commit)\n'; fi ;;
  cited) if has_debt; then cited; fi ;;
  check-strict)
    if [ -f "$LAST" ] && ! head -1 "$LAST" | grep -qx 'RESULT: OK'; then
      printf '✗ le dernier test de mutation du diff n est pas OK : dette ouverte ou passage en erreur (scripts/ci.sh --verdict)\n' >&2; exit 1
    fi ;;
  check)
    has_debt || exit 0
    fixes_debt && { printf '(dette de mutation ouverte, ce commit change ce que le verdict cite : accepté, le prochain verdict dira si elle est payée)\n'; exit 0; }
    printf '✗ dette de mutation ouverte : le dernier commit a laissé des erreurs introduites que aucun test n attrape (scripts/ci.sh --verdict).\n  Ce commit doit les corriger : changer un fichier cité ou un test de la même crate.\n' >&2
    exit 1 ;;
  *) printf '✗ usage : ci-debt.sh verdict|cited|check|check-strict\n' >&2; exit 1 ;;
esac
