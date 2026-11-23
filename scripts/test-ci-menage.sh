#!/usr/bin/env bash
# Scénarios de preuve du ménage du dossier de compilation (scripts/ci-menage.sh), joués sur un faux dossier de
# compilation rangé dans un dossier temporaire, avec des dates arrangées par `touch -t` ; le vrai dossier de
# compilation n'est jamais touché (chaque appel fixe CARGO_TARGET_DIR) :
#   le périmé part ; le récent reste ; une variante lue récemment (date d'accès) reste ; la variante la plus
#   récente de chaque crate reste ; sous le seuil rien ne part ; un verrou actif, un processus actif empêchent
#   le ménage ; un chemin douteux est refusé ; --a-blanc n'efface rien ; copies temporaires ; branchement dans
#   scripts/ci.sh (--menage, --a-blanc).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
work=$(mktemp -d)
log=$(mktemp)
sleeper=""
trap 'rm -rf -- "$work" "$log"; [ -z "$sleeper" ] || kill "$sleeper" 2>/dev/null || true' EXIT
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

stamp() { if [ "$(uname)" = Darwin ]; then date -v-"$1" +%Y%m%d%H%M; else date -d "$1 ago" +%Y%m%d%H%M; fi; }
# age <dossier> <durée BSD : 3d, 2H> : date d'accès et de modification de tout le dossier.
age() { find "$1" -exec touch -t "$(stamp "$2")" {} +; }
# unit <racine> <crate> <empreinte> <âge> : une variante de compilation (nouvelle disposition de Cargo).
unit() {
  mkdir -p "$1/build/$2/$3/fingerprint" "$1/build/$2/$3/out"
  head -c 2048 /dev/zero > "$1/build/$2/$3/out/o.rcgu.o"
  echo f > "$1/build/$2/$3/fingerprint/lib-$2"
  age "$1/build/$2/$3" "$4"
}

export TMPDIR="$work/tmp"; mkdir -p "$TMPDIR"
export MENAGE_SEUIL_KO=1 MENAGE_NOMS_PROCESSUS="" MENAGE_MOTIF_PROCESSUS='motif-qui-ne-matche-rien-9z'
export CI_SNAPSHOT_DIR="$work/pas-de-copie-figee"
T="$work/target"
fresh_target() {
  rm -rf "$T"; mkdir -p "$T/debug" "$T/llvm-cov-target/debug"
  printf 'Signature: 8a477f597d28d172789f06886806bc55\n' > "$T/CACHEDIR.TAG"
  D="$T/debug"; L="$T/llvm-cov-target/debug"
  unit "$D" a h1 3d; unit "$D" a h2 5d; unit "$D" a h3 1H          # h1, h2 périmées ; h3 récente
  unit "$D" b h1 10d                                               # seule de sa crate : la dernière utilisée, reste
  unit "$D" c h1 2H; unit "$D" c h2 3d                             # h2 périmée
  unit "$D" d h1 4d; unit "$D" d h2 1H                             # h1 périmée de date, mais lue récemment
  touch -a -t "$(stamp 1H)" "$D/build/d/h1/fingerprint/lib-d"
  unit "$L" e h1 6d; unit "$L" e h2 2H                             # variante de couverture périmée
  mkdir -p "$D/incremental/x-aaa/s-1" "$D/incremental/x-bbb/s-1"
  echo i > "$D/incremental/x-aaa/s-1/g"; echo i > "$D/incremental/x-bbb/s-1/g"
  age "$D/incremental/x-aaa" 4d; age "$D/incremental/x-bbb" 1H
  echo p > "$T/llvm-cov-target/vieux.profraw"; echo p > "$T/llvm-cov-target/neuf.profraw"
  touch -t "$(stamp 3d)" "$T/llvm-cov-target/vieux.profraw"
  mkdir -p "$D/deps"                                               # ancienne disposition : fichiers par empreinte
  for f in tests-0123456789abcdef.d libtests-0123456789abcdef.rlib; do echo x > "$D/deps/$f"; touch -t "$(stamp 5d)" "$D/deps/$f"; done
  for f in tests-fedcba9876543210.d libtests-fedcba9876543210.rlib; do echo x > "$D/deps/$f"; touch -t "$(stamp 2H)" "$D/deps/$f"; done
}
menage() { CARGO_TARGET_DIR="$T" scripts/ci-menage.sh "$@" >"$log" 2>&1; }
present() { [ -e "$1" ]; }
expect_kept() { present "$1" || { cat "$log"; fail "$2 : $1 a été effacé"; }; }
expect_gone() { ! present "$1" || { cat "$log"; fail "$2 : $1 devait partir"; }; }

# 1. périmé parti, récent resté
fresh_target
menage || { cat "$log"; fail "le ménage doit réussir"; }
for p in a/h1 a/h2 c/h2; do expect_gone "$D/build/$p" "périmé"; done
expect_gone "$L/build/e/h1" "périmé (couverture)"
expect_gone "$D/incremental/x-aaa" "périmé (incrémental)"
expect_gone "$T/llvm-cov-target/vieux.profraw" "périmé (profraw)"
expect_gone "$D/deps/tests-0123456789abcdef.d" "périmé (deps)"
expect_gone "$D/deps/libtests-0123456789abcdef.rlib" "périmé (deps)"
for p in a/h3 c/h1 d/h1 d/h2; do expect_kept "$D/build/$p" "récent ou lu"; done
expect_kept "$L/build/e/h2" "récent (couverture)"
expect_kept "$D/incremental/x-bbb" "récent (incrémental)"
expect_kept "$T/llvm-cov-target/neuf.profraw" "récent (profraw)"
expect_kept "$D/deps/tests-fedcba9876543210.d" "récent (deps)"
expect_kept "$D/build/b/h1" "la dernière variante d'une crate reste, même vieille"
grep -q '^ménage : dossier de compilation' "$log" || { cat "$log"; fail "le résumé d'une ligne manque"; }
[ "$(wc -l < "$log" | tr -d ' ')" -eq 1 ] || { cat "$log"; fail "le ménage doit tenir en une ligne"; }

# 2. sous le seuil, rien ne part ; --discret ne dit rien
fresh_target
MENAGE_SEUIL_KO=99999999 menage || fail "sous le seuil : doit réussir"
expect_kept "$D/build/a/h1" "sous le seuil"
grep -q 'sous le seuil' "$log" || fail "sous le seuil : le dire"
MENAGE_SEUIL_KO=99999999 menage --discret || fail "discret"
[ ! -s "$log" ] || { cat "$log"; fail "--discret ne dit rien sous le seuil"; }

# 3. à blanc : liste, n'efface rien
fresh_target
menage --a-blanc || { cat "$log"; fail "à blanc"; }
expect_kept "$D/build/a/h1" "à blanc"
expect_kept "$D/incremental/x-aaa" "à blanc"
expect_kept "$T/llvm-cov-target/vieux.profraw" "à blanc"
grep -q "à retirer.*$D/build/a/h1" "$log" || { cat "$log"; fail "à blanc : doit lister le périmé"; }
grep -q "à retirer.*a/h3" "$log" && fail "à blanc : ne doit pas lister le récent"

# 4. verrou actif et processus actif : rien ne part ; verrou mort : repris
fresh_target
sleep 70 & sleeper=$!
mkdir "$TMPDIR/malorean-notes-menage.lock"; echo "$sleeper" > "$TMPDIR/malorean-notes-menage.lock/pid"
menage || fail "verrou : doit réussir (en sautant)"
expect_kept "$D/build/a/h1" "verrou actif"
grep -q 'autre ménage' "$log" || { cat "$log"; fail "verrou : message clair attendu"; }
kill "$sleeper"; wait "$sleeper" 2>/dev/null || true; sleeper=""
menage || fail "verrou mort"
expect_gone "$D/build/a/h1" "verrou mort repris"
fresh_target
sleep 71 & sleeper=$!
MENAGE_MOTIF_PROCESSUS='sleep 71' menage || fail "processus : doit réussir (en sautant)"
expect_kept "$D/build/a/h1" "processus actif"
grep -q 'tourne' "$log" || { cat "$log"; fail "processus : message clair attendu"; }
MENAGE_MOTIF_PROCESSUS='sleep 71' menage --a-blanc || fail "à blanc malgré un processus"
grep -q 'à retirer' "$log" || fail "à blanc ignore les processus"
kill "$sleeper"; wait "$sleeper" 2>/dev/null || true; sleeper=""

# 5. chemins douteux : refusés, rien d'effacé
fresh_target
refused() { if CARGO_TARGET_DIR="$1" scripts/ci-menage.sh >"$log" 2>&1; then cat "$log"; fail "chemin douteux accepté : $1"; fi
  grep -q 'refusé' "$log" || { cat "$log"; fail "refus sans message : $1"; }; }
refused /
refused "$HOME"
refused "$ROOT"
mkdir -p "$work/sans-marque/debug/build/z/h1/out"; echo precieux > "$work/sans-marque/debug/build/z/h1/out/f"
age "$work/sans-marque" 9d
refused "$work/sans-marque"
expect_kept "$work/sans-marque/debug/build/z/h1/out/f" "dossier sans marque de Cargo"
mkdir -p "$work/marque-seule"; cp "$T/CACHEDIR.TAG" "$work/marque-seule/"
refused "$work/marque-seule"
ln -s "$T" "$work/lien"
refused "$work/lien"
expect_kept "$D/build/a/h1" "lien vers un vrai dossier"

# 6. copies temporaires de cargo-mutants et copie figée
fresh_target
mkdir -p "$TMPDIR/cargo-mutants-vieux.tmp/src" "$TMPDIR/cargo-mutants-neuf.tmp/src" "$TMPDIR/autre-vieux.tmp"
for d in cargo-mutants-vieux.tmp cargo-mutants-neuf.tmp autre-vieux.tmp; do echo x > "$TMPDIR/$d/f"; done
echo x > "$TMPDIR/cargo-mutants-vieux.tmp/src/f"; echo x > "$TMPDIR/cargo-mutants-neuf.tmp/src/f"
age "$TMPDIR/cargo-mutants-vieux.tmp" 3d; age "$TMPDIR/autre-vieux.tmp" 3d
mkdir -p "$work/copie/scripts"; echo x > "$work/copie/scripts/ci.sh"; age "$work/copie" 3d
CI_SNAPSHOT_DIR="$work/copie" menage || { cat "$log"; fail "copies"; }
expect_gone "$TMPDIR/cargo-mutants-vieux.tmp" "copie de cargo-mutants périmée"
expect_kept "$TMPDIR/cargo-mutants-neuf.tmp" "copie de cargo-mutants récente"
expect_kept "$TMPDIR/autre-vieux.tmp" "dossier qui n'est pas une copie de cargo-mutants"
expect_gone "$work/copie" "copie figée périmée"
grep -q '2 copies temporaires' "$log" || { cat "$log"; fail "le résumé compte les copies"; }

# 7. branchement dans scripts/ci.sh
fresh_target
CARGO_TARGET_DIR="$T" scripts/ci.sh --menage --a-blanc >"$log" 2>&1 || { cat "$log"; fail "ci.sh --menage --a-blanc"; }
grep -q 'à retirer' "$log" && expect_kept "$D/build/a/h1" "ci.sh --menage --a-blanc"
CARGO_TARGET_DIR="$T" scripts/ci.sh --menage >"$log" 2>&1 || { cat "$log"; fail "ci.sh --menage"; }
expect_gone "$D/build/a/h1" "ci.sh --menage"
if scripts/ci.sh --a-blanc >"$log" 2>&1; then fail "--a-blanc seul doit être refusé"; fi
printf '✓ ci-menage : tous les scénarios passent\n'
