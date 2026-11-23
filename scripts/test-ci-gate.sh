#!/usr/bin/env bash
# Scénarios de preuve de la barrière de commit (scripts/ci.sh) et de la dette de mutation
# (scripts/ci-debt.sh), joués dans un dépôt git jetable sans Rust ni interface :
#   1. documentation seule : voie légère ; un fichier de plus qui n'est pas de la documentation : barrière normale ;
#   2. dette ouverte : le commit est refusé, sauf s'il change un fichier cité ou un test de la même crate ;
#      un commit de documentation seule passe ; la livraison (--complet) est refusée sans exception ;
#   3. dette payée (verdict OK) : plus de refus ; --verdict relit le verdict.
set -euo pipefail
cd "$(dirname "$0")/.."
readonly ROOT=$PWD
work=$(mktemp -d)
log=$(mktemp)
trap 'rm -rf -- "$work" "$log"' EXIT
cp -R scripts "$work/scripts"
printf '_SECRET\nCLAUDE.local.md\ntmp/\n' > "$work/.gitignore"
cd "$work"
git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -qm init
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
gate() { scripts/ci.sh "$@" >"$log" 2>&1; }
expect_pass() { gate "${@:2}" || { cat "$log"; fail "$1"; }; }
expect_fail() { if gate "${@:2}"; then cat "$log"; fail "$1"; fi; }
reset() { git checkout -q -- . && git clean -qfd -e tmp; }

mkdir -p doc
echo "texte" > doc/note.md
expect_pass "documentation seule"
grep -q 'documentation Markdown seule' "$log" || fail "la voie légère n'a pas été prise"
echo "x" > autre.txt
expect_pass "documentation et un autre fichier"
grep -q 'documentation Markdown seule' "$log" && fail "un fichier hors documentation doit rejouer la barrière normale"
reset

mkdir -p tmp/mutation
printf 'RESULT: SURVIVORS\nCOMMIT: abc\nCITED: crates/a/src/x.rs\nMISSED: crates/a/src/x.rs:3:5: replace f -> bool with true\n' > tmp/mutation/dernier
echo "x" > autre.txt
expect_fail "dette ouverte : un commit sans rapport est refusé"
grep -q 'dette de mutation' "$log" || fail "le refus doit dire pourquoi"
mkdir -p crates/b/tests crates/a/tests crates/a/src
reset; mkdir -p crates/b/tests; echo t > crates/b/tests/t.rs
expect_fail "dette ouverte : un test d'une autre crate ne corrige pas"
reset; mkdir -p crates/a/tests; echo t > crates/a/tests/t.rs
expect_pass "dette ouverte : un test de la même crate corrige"
reset; mkdir -p crates/a/src; echo t > crates/a/src/x.rs
expect_pass "dette ouverte : le fichier cité change"
reset; mkdir -p doc; echo "texte" > doc/note.md
expect_pass "dette ouverte : la documentation seule passe"
reset
expect_fail "livraison avec une dette ouverte" --complet
scripts/ci.sh --verdict | grep -q 'SURVIVORS' || fail "--verdict doit afficher le verdict"

printf 'RESULT: OK\nCOMMIT: def\n' > tmp/mutation/dernier
echo "x" > autre.txt
expect_pass "dette payée"
scripts/ci.sh --verdict | grep -q 'RESULT: OK' || fail "--verdict doit afficher le verdict OK"
printf '✓ ci-gate : tous les scénarios passent\n'
