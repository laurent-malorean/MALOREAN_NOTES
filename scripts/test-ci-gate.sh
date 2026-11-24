#!/usr/bin/env bash
# Scénarios de preuve de la CI (scripts/ci.sh, ci-verte.sh, mutation-diff.sh), joués dans un dépôt git jetable
# sans Rust ni interface, avec un faux cargo-mutants (MUTANTS_BIN) qui note ses arguments :
#   1. documentation seule : voie légère ; un fichier de plus qui n'est pas de la documentation : barrière normale ;
#   2. anciennes options refusées (--complet, --sans-mutation) ; --verdict relit le verdict et la liste de suivi ;
#   3. mutation du domaine après un commit (mutation-diff.sh) : coupure à 30 s, seul le domaine, survivant écrit
#      dans la liste de suivi, JAMAIS de refus du commit suivant ; un commit hors domaine ne lance rien ;
#   4. tag ci-verte : posé explicitement, base lue ; --echantillon : un dixième, une erreur par fonction, coupure
#      à 90 s, hors domaine, depuis le tag, non bloquant (survivant noté, sortie 0) ;
#   5. --livraison : refusée si du code n'est pas commité, refusée avec un survivant (le tag ne bouge pas), réussie
#      sans survivant (le tag avance à HEAD) ;
#   6. ménage du dossier de compilation à la fin de la barrière, réussie ou refusée (faux dossier de compilation) ;
#      sans cela (CI_SANS_MENAGE), la barrière ne touche jamais au dossier de compilation.
set -euo pipefail
cd "$(dirname "$0")/.."
readonly ROOT=$PWD
work=$(mktemp -d)
log=$(mktemp)
stub_log=$(mktemp)
trap 'rm -rf -- "$work" "$log" "$stub_log"' EXIT
cp -R scripts "$work/scripts"
printf '_SECRET\nCLAUDE.local.md\ntmp/\n' > "$work/.gitignore"
cat > "$work/stub-mutants.sh" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
out=""; prev=""
for a in "$@"; do [ "$prev" = -o ] && out=$a; prev=$a; done
dir="${out:+$out/}mutants.out"
mkdir -p "$dir"
missed=${STUB_MISSED:-0}
printf '{"total_mutants":4,"caught":%s,"missed":%s,"timeout":0,"unviable":0}' $((4 - missed)) "$missed" > "$dir/outcomes.json"
: > "$dir/missed.txt"
[ "$missed" -eq 0 ] || echo "crates/domain/src/a.rs:1:1: replace f -> bool with true" > "$dir/missed.txt"
exit $(( missed > 0 ? 2 : 0 ))
STUB
chmod +x "$work/stub-mutants.sh"
cd "$work"
MD="$work/.git/ci-mutation"
export CI_SANS_MENAGE=1 STUB_LOG="$stub_log" MUTANTS_BIN="$work/stub-mutants.sh" CI_SHARD=3
git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -qm init
commit() { git add -A && git -c user.name=t -c user.email=t@t commit -qm "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
gate() { scripts/ci.sh "$@" >"$log" 2>&1; }
expect_pass() { gate "${@:2}" || { cat "$log"; fail "$1"; }; }
expect_fail() { if gate "${@:2}"; then cat "$log"; fail "$1"; fi; }
reset() { git checkout -q -- . && git clean -qfd -e tmp; }

# 1. documentation seule
mkdir -p doc
echo "texte" > doc/note.md
expect_pass "documentation seule"
grep -q 'documentation Markdown seule' "$log" || fail "la voie légère n'a pas été prise"
echo "x" > autre.txt
expect_pass "documentation et un autre fichier"
grep -q 'documentation Markdown seule' "$log" && fail "un fichier hors documentation doit rejouer la barrière normale"
reset

# 1b. longueur des fichiers : le dossier worktrees/ (les autres branches, chacune a sa propre barrière) n'est pas
# contrôlé ; un fichier trop long ailleurs refuse la barrière
mkdir -p worktrees/essai
seq 601 > worktrees/essai/long.rs
echo "x" > autre.txt
expect_pass "un fichier trop long dans worktrees/ ne refuse pas la barrière"
mv worktrees/essai/long.rs long.rs
expect_fail "un fichier trop long hors de worktrees/ refuse la barrière"
grep -q 'fichiers trop longs' "$log" || fail "le refus doit dire que des fichiers sont trop longs"
reset

# 2. options et verdict
expect_fail "--complet n'existe plus" --complet
grep -q -- '--livraison' "$log" || fail "le refus de --complet doit citer les options qui le remplacent"
expect_fail "--sans-mutation n'existe plus" --sans-mutation
mkdir -p "$MD"
printf 'RESULT: SURVIVORS\nCOMMIT: abc\nMISSED: crates/domain/src/a.rs:1:1: replace f with true\n' > "$MD/dernier"
echo '2026-11-23 abc crates/domain/src/a.rs:1:1: replace f with true' > "$MD/suivi.txt"
verdict=$(scripts/ci.sh --verdict)
grep -q 'SURVIVORS' <<< "$verdict" || { echo "$verdict"; fail "--verdict doit afficher le verdict"; }
grep -q 'Survivants à traiter' <<< "$verdict" || fail "--verdict doit afficher la liste de suivi"
echo "x" > autre.txt
expect_pass "un survivant ne refuse jamais un commit"
rm -rf "$MD"; reset

# 3. mutation du domaine après un commit
mkdir -p crates/domain/src crates/api/src
echo 'fn a() {}' > crates/domain/src/a.rs; echo 'fn b() {}' > crates/api/src/b.rs
commit "domaine et api"
export MUTATION_DIR="$MD" MUTATION_WORK="$work/copie"
STUB_MISSED=1 scripts/mutation-diff.sh HEAD
grep -q -- '--package domain' "$STUB_LOG" || fail "la mutation après commit ne porte que sur le domaine"
grep -q -- '--timeout 30' "$STUB_LOG" || fail "la mutation du domaine est coupée à 30 s"
grep -q 'RESULT: SURVIVORS' "$MD/dernier" || fail "le verdict doit dire SURVIVORS"
grep -q 'replace f -> bool' "$MD/suivi.txt" || fail "le survivant doit être écrit dans la liste de suivi"
echo "x" > autre.txt
expect_pass "après des survivants du domaine, le commit suivant passe"
reset
: > "$STUB_LOG"
echo 'fn c() {}' >> crates/api/src/b.rs; commit "api seulement"
scripts/mutation-diff.sh HEAD
[ ! -s "$STUB_LOG" ] || fail "un commit hors du domaine ne lance aucune mutation"
echo 'fn d() {}' >> crates/domain/src/a.rs; commit "domaine encore"
STUB_MISSED=0 scripts/mutation-diff.sh HEAD
grep -q 'RESULT: OK' "$MD/dernier" || fail "sans survivant le verdict est OK"
unset MUTATION_DIR MUTATION_WORK

# 4. tag ci-verte et échantillon
: > "$STUB_LOG"
expect_fail "--echantillon sans tag" --echantillon
grep -q 'ci-verte' "$log" || fail "le refus doit nommer le tag"
scripts/ci-verte.sh poser HEAD~3 >/dev/null
[ "$(scripts/ci-verte.sh base)" = "$(git rev-parse HEAD~3)" ] || fail "la base est le commit du tag"
rm -f "$MD/suivi.txt"
STUB_MISSED=1 expect_pass "--echantillon ne bloque jamais" --echantillon
grep -q -- '--shard 3/10' "$STUB_LOG" || fail "l'échantillon est un dixième"
grep -q -- "--exclude-re  in " "$STUB_LOG" || fail "les erreurs d'opérateurs sont écartées"
grep -q -- '--timeout 90' "$STUB_LOG" || fail "l'échantillon est coupé à 90 s"
grep -q 'crates/domain' "$STUB_LOG" && fail "l'échantillon ne porte pas sur le domaine"
grep -q 'replace f -> bool' "$MD/suivi.txt" || fail "le survivant de l'échantillon est noté"
scripts/ci-verte.sh poser HEAD >/dev/null
: > "$STUB_LOG"
expect_pass "--echantillon sans code changé" --echantillon
[ ! -s "$STUB_LOG" ] || fail "rien à muter quand le diff est vide"

# 5. livraison
scripts/ci-verte.sh poser HEAD~2 >/dev/null
echo 'fn e() {}' >> crates/domain/src/a.rs
expect_fail "livraison avec du code pas commité" --livraison
git checkout -q -- crates; : > "$STUB_LOG"
STUB_MISSED=1 expect_fail "livraison avec un survivant" --livraison
[ "$(scripts/ci-verte.sh base)" = "$(git rev-parse HEAD~2)" ] || fail "le tag ne bouge pas sans succès"
STUB_MISSED=0 expect_pass "livraison réussie" --livraison
[ "$(scripts/ci-verte.sh base)" = "$(git rev-parse HEAD)" ] || fail "le tag avance à HEAD au succès"

# 6. dans un git worktree (.git y est un fichier) : barrière, empreinte propre au dossier, verdicts communs, crochet
wt=$(mktemp -d)/wt
rm -f "$work/.git/ci-validated-tree"
git worktree add -q "$wt" -b essai
( cd "$wt"
  [ -f .git ] || fail "un worktree a un fichier .git"
  echo "x" > autre.txt
  scripts/ci.sh >"$log" 2>&1 || { cat "$log"; fail "la barrière dans un worktree"; }
  [ -f "$(git rev-parse --git-dir)/ci-validated-tree" ] || fail "l'empreinte est dans le git-dir du worktree"
  [ ! -e "$work/.git/ci-validated-tree" ] || fail "l'empreinte du worktree ne va pas dans le dépôt principal"
  scripts/ci.sh --verifier >/dev/null || fail "--verifier dans un worktree"
  mkdir -p crates/domain/src; echo 'fn w() {}' > crates/domain/src/w.rs
  git add -A && git -c user.name=t -c user.email=t@t commit -qm "domaine dans le worktree"
  rm -f "$MD/dernier" "$MD/base"
  : > "$STUB_LOG"
  STUB_MISSED=0 MUTATION_DIR= scripts/hooks/post-commit
  for _ in $(seq 1 50); do [ -f "$MD/dernier" ] && break; sleep 0.2; done
  [ -f "$MD/dernier" ] || fail "le crochet depuis un worktree écrit son verdict dans le dossier commun"
  grep -q 'RESULT: OK' "$MD/dernier" || fail "le verdict du worktree est OK"
  scripts/ci-verte.sh poser HEAD >/dev/null
)
[ "$(git rev-parse ci-verte)" = "$(git rev-parse essai)" ] || fail "le tag ci-verte est commun à tous les worktrees"
git worktree remove --force "$wt"

# 7. ménage à la fin de la barrière
T="$work/faux-target"
mkdir -p "$T/debug/build/a/vieille/out" "$T/debug/build/a/neuve/out"
printf 'Signature: 8a477f597d28d172789f06886806bc55\n' > "$T/CACHEDIR.TAG"
echo x > "$T/debug/build/a/vieille/out/f"; echo x > "$T/debug/build/a/neuve/out/f"
old=$(date -v-3d +%Y%m%d%H%M 2>/dev/null || date -d '3 days ago' +%Y%m%d%H%M)
find "$T/debug/build/a/vieille" -exec touch -t "$old" {} +
export CARGO_TARGET_DIR="$T" MENAGE_SEUIL_KO=1 MENAGE_NOMS_PROCESSUS="" MENAGE_MOTIF_PROCESSUS='motif-qui-ne-matche-rien-9z'
echo "x" > autre.txt
expect_pass "ménage désactivé : la barrière passe"
[ -d "$T/debug/build/a/vieille" ] || fail "CI_SANS_MENAGE : le dossier de compilation ne doit pas être touché"
unset CI_SANS_MENAGE
expect_pass "barrière réussie avec ménage"
[ ! -d "$T/debug/build/a/vieille" ] || fail "la barrière réussie doit faire le ménage"
[ -d "$T/debug/build/a/neuve" ] || fail "le ménage ne doit pas retirer le récent"
grep -q '^ménage : dossier de compilation' "$log" || { cat "$log"; fail "le résumé du ménage manque"; }
mkdir -p "$T/debug/build/b/vieille/out" "$T/debug/build/b/neuve/out"
echo x > "$T/debug/build/b/vieille/out/f"; echo x > "$T/debug/build/b/neuve/out/f"
find "$T/debug/build/b/vieille" -exec touch -t "$old" {} +
echo 'pas un manifeste' > Cargo.toml
expect_fail "barrière refusée avec ménage"
[ ! -d "$T/debug/build/b/vieille" ] || fail "la barrière refusée doit aussi faire le ménage"
printf '✓ ci-gate : tous les scénarios passent\n'
