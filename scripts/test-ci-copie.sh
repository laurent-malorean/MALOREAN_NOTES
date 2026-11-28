#!/usr/bin/env bash
# Scénarios de preuve de la copie figée et de l'empreinte de validation (scripts/ci.sh), joués dans un dépôt git
# jetable sans Rust ni interface :
#   1. --fonction --copie démarre et réussit (la copie rejoue scripts/ci.sh avec MUTATION_DIR, variable en lecture
#      seule : une affectation en préfixe de commande la refuserait, « readonly variable ») ; l'empreinte est posée ;
#   2. l'empreinte (--verifier) ignore data_fake/ (les essais de l'utilisateur dans l'application, jamais commités) ;
#      un vrai changement de code l'invalide ;
#   3. pendant un passage de la barrière : un fichier de data_fake/ écrit n'invalide pas le passage, un fichier de
#      code écrit l'invalide.
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
snap=$(mktemp -d)
log=$(mktemp)
trap 'rm -rf -- "$work" "$snap" "$log"' EXIT
cp -R scripts "$work/scripts"
printf '_SECRET\nCLAUDE.local.md\ntmp/\n' > "$work/.gitignore"
# Contrôles joués par la barrière quand .github/workflows/ change : remplacés par des faux, dont l'un écrit
# dans le fichier que STUB_ECRIT désigne, comme le ferait quelqu'un qui travaille pendant le passage.
printf '#!/usr/bin/env bash\n[ -z "${STUB_ECRIT:-}" ] || echo "écrit pendant le passage" >> "$STUB_ECRIT"\n' > "$work/scripts/test-version-coherente.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$work/scripts/test-ci-mutation-groupes.sh"
cd "$work"
export CI_SANS_MENAGE=1 CI_SNAPSHOT_DIR="$snap"
git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -qm init
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
gate() { scripts/ci.sh "$@" >"$log" 2>&1; }
expect_pass() { gate "${@:2}" || { cat "$log"; fail "$1"; }; }
expect_fail() { if gate "${@:2}"; then cat "$log"; fail "$1"; fi; }

# 1. copie figée
echo "x" > autre.txt
expect_pass "--fonction --copie démarre et réussit" --fonction --copie
grep -q 'Copie figée du code' "$log" || fail "la copie figée n'a pas été faite"
grep -q 'readonly variable' "$log" && fail "la copie ne doit pas affecter une variable en lecture seule"
grep -q 'Contrôles de fin de fonction réussis' "$log" || fail "la copie doit jouer la fin de fonction"
scripts/ci.sh --verifier >/dev/null || fail "après la copie réussie, l'empreinte doit valoir pour le code"

# 2. l'empreinte ignore data_fake/
mkdir -p data_fake/essai
echo "essai de l'utilisateur" > data_fake/essai/note.md
scripts/ci.sh --verifier >/dev/null || fail "un fichier de data_fake/ ne doit pas invalider l'empreinte"
echo "plus" >> data_fake/essai/note.md
scripts/ci.sh --verifier >/dev/null || fail "un fichier de data_fake/ modifié ne doit pas invalider l'empreinte"
echo "y" >> autre.txt
if scripts/ci.sh --verifier >/dev/null 2>&1; then fail "un changement de code doit invalider l'empreinte"; fi

# 3. pendant un passage de la barrière
mkdir -p .github/workflows
echo "on: push" > .github/workflows/w.yml
STUB_ECRIT="$work/data_fake/essai/ecrit.md" expect_pass "un fichier de data_fake/ écrit pendant le passage ne l'invalide pas"
[ -f data_fake/essai/ecrit.md ] || fail "le faux contrôle devait écrire dans data_fake/"
STUB_ECRIT="$work/ecrit.txt" expect_fail "un fichier de code écrit pendant le passage l'invalide"
grep -q 'le code a changé pendant la CI' "$log" || fail "le refus doit dire que le code a changé pendant la CI"
printf '✓ ci-copie : tous les scénarios passent\n'
