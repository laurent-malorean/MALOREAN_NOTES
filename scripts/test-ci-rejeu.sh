#!/usr/bin/env bash
# Scénarios de preuve du rejeu des dépassements de délai de la mutation (scripts/mutation-rejeu.sh,
# scripts/ci.sh, doc/decisions/0052), avec un faux cargo-mutants (MUTANTS_BIN) qui écrit un faux mutants.out :
#   1. aucun dépassement : aucun rejeu ;
#   2. dépassements qui passent au rejeu : délai quadruplé, --iterate, bilan fusionné, avant/après dits ;
#   3. dépassement qui passe en survivant au rejeu : survivant, liste de suivi, la livraison est refusée ;
#   4. dépassement qui persiste : avertissement chiffré, jamais un succès silencieux, pas de refus ;
#   5. délai borné ; erreur de l'outil au rejeu : échec ;
#   6. le crochet après commit (mutation-diff.sh) ne rejoue rien.
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
log=$(mktemp)
stub_log=$(mktemp)
trap 'rm -rf -- "$work" "$log" "$stub_log"' EXIT
cp -R scripts "$work/scripts"
printf '_SECRET\nCLAUDE.local.md\ntmp/\n' > "$work/.gitignore"
# Faux cargo-mutants. Première passe (sans --iterate) : 10 erreurs, 5 attrapées, 1 survivante si STUB_MISSED=1,
# STUB_TIMEOUT dépassements. Rejeu (--iterate) : ne rejoue que survivants et dépassements ; le sort des
# dépassements se règle par STUB_REPLAY (caught | missed | timeout) ; STUB_REPLAY_CODE : code de sortie du rejeu.
cat > "$work/stub-mutants.sh" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
out=.; prev=""; iterate=0
for a in "$@"; do [ "$prev" = -o ] && out=$a; [ "$a" = --iterate ] && iterate=1; prev=$a; done
dir="$out/mutants.out"
mkdir -p "$dir"
missed_first=${STUB_MISSED:-0}; to=${STUB_TIMEOUT:-0}
mk() { for i in $(seq 1 "$2"); do echo "crates/domain/src/$1.rs:$i:1: replace f$i"; done; }
if [ "$iterate" -eq 0 ]; then
  caught=$((10 - missed_first - to))
  printf '{"total_mutants":10,"caught":%s,"missed":%s,"timeout":%s,"unviable":0}' "$caught" "$missed_first" "$to" > "$dir/outcomes.json"
  mk miss "$missed_first" > "$dir/missed.txt"; mk slow "$to" > "$dir/timeout.txt"
  exit $(( to > 0 ? 3 : (missed_first > 0 ? 2 : 0) ))
fi
[ -z "${STUB_REPLAY_CODE:-}" ] || exit "$STUB_REPLAY_CODE"
case "${STUB_REPLAY:-caught}" in
  caught) c=$to; m=$missed_first; t=0 ;;
  missed) c=0; m=$((missed_first + to)); t=0 ;;
  timeout) c=0; m=$missed_first; t=$to ;;
esac
printf '{"total_mutants":%s,"caught":%s,"missed":%s,"timeout":%s,"unviable":0}' $((c + m + t)) "$c" "$m" "$t" > "$dir/outcomes.json"
if [ "${STUB_REPLAY:-caught}" = missed ]; then { mk miss "$missed_first"; mk slow "$to"; } > "$dir/missed.txt"; else mk miss "$m" > "$dir/missed.txt"; fi
mk slow "$t" > "$dir/timeout.txt"
exit $(( t > 0 ? 3 : (m > 0 ? 2 : 0) ))
STUB
chmod +x "$work/stub-mutants.sh"
cd "$work"
MD="$work/.git/ci-mutation"
export CI_SANS_MENAGE=1 STUB_LOG="$stub_log" MUTANTS_BIN="$work/stub-mutants.sh"
git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -qm init
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
rejeu() { rm -rf out; : > "$stub_log"; "$@" >"$log" 2>&1; }
# La première passe est jouée par le faux outil, comme le ferait ci.sh ou le travail de nuit.
first() { "$MUTANTS_BIN" --package domain --timeout 30 -o out >/dev/null 2>&1 || true; }

# 1. aucun dépassement : pas de rejeu
rm -rf out; STUB_TIMEOUT=0 first; : > "$stub_log"
scripts/mutation-rejeu.sh out 30 --package domain >"$log" 2>&1 || fail "sans dépassement le rejeu réussit"
[ ! -s "$stub_log" ] || fail "sans dépassement, rien ne se rejoue"
grep -q 'aucun dépassement' "$log" || fail "le rejeu doit dire qu'il n'y a rien à rejouer"
grep -q 'AVANT=0 APRES=0' out/mutants.out/rejeu.txt || fail "rejeu.txt dit 0 avant, 0 après"

# 2. dépassements qui passent au rejeu
rm -rf out; STUB_TIMEOUT=3 STUB_MISSED=1 first; : > "$stub_log"
STUB_TIMEOUT=3 STUB_MISSED=1 STUB_REPLAY=caught scripts/mutation-rejeu.sh out 30 --package domain >"$log" 2>&1 || { cat "$log"; fail "dépassements résolus : réussite"; }
grep -q -- '--timeout 120' "$stub_log" || fail "le délai du rejeu est quadruplé (30 -> 120)"
grep -q -- '--iterate' "$stub_log" || fail "le rejeu utilise --iterate"
grep -q -- '-o out' "$stub_log" || fail "le rejeu relit le même dossier de sortie"
grep -q -- '--package domain' "$stub_log" || fail "le rejeu garde les arguments de la passe"
grep -q 'AVANT=3 APRES=0' out/mutants.out/rejeu.txt || fail "rejeu.txt dit 3 avant, 0 après"
grep -q '3 dépassements avant, 0 après' "$log" || { cat "$log"; fail "le rapport dit avant et après"; }
[ "$(jq .timeout out/mutants.out/outcomes.json)" = 0 ] || fail "bilan fusionné : plus de dépassement"
[ "$(jq .total_mutants out/mutants.out/outcomes.json)" = 10 ] || fail "bilan fusionné : le total reste 10"
[ "$(jq .caught out/mutants.out/outcomes.json)" = 9 ] || fail "bilan fusionné : 6 attrapées + 3 rejouées"
[ "$(jq .missed out/mutants.out/outcomes.json)" = 1 ] || fail "bilan fusionné : le survivant de la passe reste"
[ "$(wc -l < out/mutants.out/missed.txt | tr -d ' ')" = 1 ] || fail "missed.txt : un seul survivant"

# 3. un dépassement devient survivant au rejeu : survivant, suivi, refus de la livraison
mkdir -p "$MD/.." crates/domain/src; echo 'fn a() {}' > crates/domain/src/a.rs
git add -A; git -c user.name=t -c user.email=t@t commit -qm "domaine"
git tag ci-verte HEAD~1
echo 'fn b() {}' >> crates/domain/src/a.rs; git add -A; git -c user.name=t -c user.email=t@t commit -qm "domaine 2"
rm -f "$MD/suivi.txt"; : > "$stub_log"; rm -rf mutants.out
if STUB_TIMEOUT=2 STUB_REPLAY=missed scripts/ci.sh --livraison >"$log" 2>&1; then cat "$log"; fail "un survivant au rejeu refuse la livraison"; fi
grep -q -- '--timeout 120' "$stub_log" || fail "ci.sh : rejeu du domaine à 120 s"
grep -q 'replace f1' "$MD/suivi.txt" || fail "le survivant du rejeu va dans la liste de suivi"
grep -q 'slow.rs' "$MD/suivi.txt" || fail "le dépassement devenu survivant va dans la liste de suivi"

# 4. dépassement persistant : avertissement chiffré, pas de refus (échantillon, non bloquant)
mkdir -p crates/api/src; echo 'fn c() {}' > crates/api/src/b.rs
git add -A; git -c user.name=t -c user.email=t@t commit -qm "api"
rm -f "$MD/suivi.txt"; : > "$stub_log"; rm -rf mutants.out
CI_SHARD=3 STUB_TIMEOUT=2 STUB_REPLAY=timeout scripts/ci.sh --echantillon >"$log" 2>&1 || { cat "$log"; fail "un dépassement persistant ne refuse pas"; }
grep -q -- '--timeout 360' "$stub_log" || fail "ci.sh : rejeu de l'échantillon à 360 s (90 x 4)"
grep -q '2 dépassements avant, 2 après' "$log" || { cat "$log"; fail "ci.sh dit avant et après"; }
grep -q 'AVERTISSEMENT.*2 dépassement' "$log" || { cat "$log"; fail "un dépassement persistant est un avertissement chiffré"; }

# 5. délai borné, erreur de l'outil
rm -rf out; STUB_TIMEOUT=1 first; : > "$stub_log"
STUB_TIMEOUT=1 STUB_REPLAY=caught scripts/mutation-rejeu.sh out 400 --package domain >"$log" 2>&1 || fail "délai borné"
grep -q -- '--timeout 600' "$stub_log" || fail "le délai du rejeu est borné à 600 s"
rm -rf out; STUB_TIMEOUT=1 first
if STUB_TIMEOUT=1 STUB_REPLAY_CODE=4 scripts/mutation-rejeu.sh out 30 --package domain >"$log" 2>&1; then fail "une erreur de l'outil au rejeu échoue"; fi

# 6. le crochet après commit ne rejoue rien
git tag -d ci-verte >/dev/null
echo 'fn d() {}' >> crates/domain/src/a.rs; git add -A; git -c user.name=t -c user.email=t@t commit -qm "domaine 3"
: > "$stub_log"
STUB_TIMEOUT=2 MUTATION_DIR="$MD" MUTATION_WORK="$work/copie" scripts/mutation-diff.sh HEAD >/dev/null 2>&1 || true
grep -q -- '--iterate' "$stub_log" && fail "le crochet non bloquant ne rejoue rien"
grep -q -- '--timeout 30' "$stub_log" || fail "le crochet reste à 30 s"
printf '✓ ci-rejeu : tous les scénarios passent\n'
