#!/usr/bin/env bash
# Scénarios de preuve de la mutation par groupes (doc/decisions/0059) :
#   1. la matrice est produite du fichier de groupes (tous, ou un seul ; groupe inconnu refusé) ;
#   2. le fichier est sain (noms uniques, un groupe « autres » par crate, motifs en chemins complets) ;
#   3. EXHAUSTIVITÉ : chaque fichier .rs de production des quatre crates tombe dans exactement un groupe
#      (calcul des motifs, puis, si cargo-mutants est là, contre sa propre liste de fichiers) ;
#   4. un groupe joué avec un faux cargo-mutants : arguments, coupure, bilan chiffré, survivant = échec,
#      dépassement persistant = avertissement, groupe vide = succès ;
#   5. le résumé dit chaque groupe, signale un survivant et un groupe sans bilan ;
#   6. le travail GitHub : groupes en parallèle sans arrêt au premier échec, 25 minutes, résumé toujours joué,
#      actions épinglées.
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
G=scripts/mutation-groupes.sh
CRATES="domain application infrastructure api"

# 1. matrice
all=$($G matrice)
[ "$(jq '.include | length' <<< "$all")" -eq "$(jq '.groupes | length' scripts/mutation-groupes.json)" ] || fail "la matrice a un groupe par entrée du fichier"
[ "$(jq '[.include[] | select(.nom and .titre and .crate and .machine and .delai)] | length' <<< "$all")" -eq "$(jq '.include | length' <<< "$all")" ] \
  || fail "chaque entrée de la matrice a nom, titre, crate, machine et délai"
[ "$(jq -r '.include[] | select(.nom == "domaine-canvas") | "\(.crate) \(.machine) \(.delai)"' <<< "$all")" = "domain ubuntu-latest 30" ] || fail "le domaine : machine Linux, coupure 30 s"
[ "$(jq -r '.include[] | select(.nom == "application-faux") | .delai' <<< "$all")" = 90 ] || fail "ailleurs que le domaine : coupure 90 s"
[ "$(jq -r '.include[] | select(.nom == "api-session") | .machine' <<< "$all")" = macos-latest ] || fail "api : machine macOS (Tauri, Accelerate)"
one=$($G matrice domaine-canvas)
[ "$(jq '.include | length' <<< "$one")" -eq 1 ] || fail "un groupe nommé : une seule entrée"
if $G matrice groupe-qui-n-existe-pas >/dev/null 2>&1; then fail "un groupe inconnu est refusé"; fi
if $G arguments groupe-qui-n-existe-pas >/dev/null 2>&1; then fail "arguments d'un groupe inconnu : refusé"; fi
[ "$($G delai domaine-canvas)" = 30 ] || fail "délai du domaine"

# 2. fichier sain
[ "$(jq '[.groupes[].nom] | length - (unique | length)' scripts/mutation-groupes.json)" -eq 0 ] || fail "noms de groupe uniques"
for c in $CRATES; do
  [ "$(jq --arg c "$c" '[.groupes[] | select(.crate == $c and .autres == true)] | length' scripts/mutation-groupes.json)" -eq 1 ] \
    || fail "$c : exactement un groupe « autres »"
done
[ "$(jq '[.groupes[] | select((.autres == true) == (.fichiers != null))] | length' scripts/mutation-groupes.json)" -eq 0 ] \
  || fail "un groupe a des fichiers OU est le groupe « autres », jamais les deux ni aucun"
[ "$(jq '[.groupes[].fichiers[]? | select(startswith("crates/") | not)] | length' scripts/mutation-groupes.json)" -eq 0 ] \
  || fail "les motifs sont des chemins complets depuis la racine du dépôt (crates/…)"
for d in crates/*/; do
  c=$(basename "$d")
  [ "$c" = app ] || [ "$(jq --arg c "$c" '.crates | has($c)' scripts/mutation-groupes.json)" = true ] || fail "la crate $c n'a ni groupe ni exception"
done

# 3. exhaustivité : chaque fichier de production dans exactement un groupe
python3 -I - "$CRATES" <<'PY' || fail "exhaustivité des groupes"
import json, os, re, sys
groups = json.load(open("scripts/mutation-groupes.json"))["groupes"]
def rx(glob):  # motifs de cargo-mutants : * ne traverse pas les dossiers, ** les traverse
    out, i = "", 0
    while i < len(glob):
        if glob[i:i+2] == "**": out += ".*"; i += 2
        elif glob[i] == "*": out += "[^/]*"; i += 1
        elif glob[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(glob[i]); i += 1
    return re.compile("^" + out + "$")
bad = []
for crate in sys.argv[1].split():
    named = [(g["nom"], [rx(p) for p in g["fichiers"]]) for g in groups if g["crate"] == crate and "fichiers" in g]
    other = next(g["nom"] for g in groups if g["crate"] == crate and g.get("autres"))
    files = []
    for root, _, names in os.walk(f"crates/{crate}/src"):
        for n in names:
            p = os.path.join(root, n)
            if n.endswith(".rs") and not n.endswith("_tests.rs") and "/tests/" not in p: files.append(p)
    for p in sorted(files):
        hits = [nom for nom, rxs in named if any(r.match(p) for r in rxs)] or [other]
        if len(hits) != 1: bad.append(f"{p} : {hits}")
if bad: print("\n".join(bad)); sys.exit(1)
PY
# … et contre la liste de fichiers de cargo-mutants lui-même (l'union des groupes = la crate, sans doublon)
if command -v cargo-mutants >/dev/null 2>&1 && [ -f Cargo.toml ]; then
  for c in $CRATES; do
    cargo mutants --list-files --all-features --package "$c" 2>/dev/null | sort > "$work/$c.whole"
    : > "$work/$c.groups"
    for nom in $(jq -r --arg c "$c" '.groupes[] | select(.crate == $c) | .nom' scripts/mutation-groupes.json); do
      args=(); while IFS= read -r a; do args+=("$a"); done < <($G arguments "$nom")
      cargo mutants --list-files --all-features "${args[@]}" 2>/dev/null >> "$work/$c.groups"
    done
    sort "$work/$c.groups" > "$work/$c.sorted"
    [ -z "$(uniq -d "$work/$c.sorted")" ] || fail "$c : un fichier est dans deux groupes : $(uniq -d "$work/$c.sorted" | head -3)"
    diff -q "$work/$c.whole" "$work/$c.sorted" >/dev/null || fail "$c : l'union des groupes n'est pas la crate : $(diff "$work/$c.whole" "$work/$c.sorted" | head -3)"
  done
else
  printf '(cargo-mutants absent : contrôle contre sa liste de fichiers sauté)\n'
fi

# 4. un groupe joué avec un faux cargo-mutants
cat > "$work/stub.sh" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
out=.; prev=""; iterate=0; list=0
for a in "$@"; do [ "$prev" = -o ] && out=$a; [ "$a" = --iterate ] && iterate=1; [ "$a" = --list ] && list=1; prev=$a; done
if [ "$list" -eq 1 ]; then n=${STUB_LISTED:-10}; i=0; while [ "$i" -lt "$n" ]; do echo "crates/x.rs:$i:1: replace f$i"; i=$((i + 1)); done; exit 0; fi
dir="$out/mutants.out"; mkdir -p "$dir"
m=${STUB_MISSED:-0}; t=${STUB_TIMEOUT:-0}
mk() { i=1; while [ "$i" -le "$2" ]; do echo "crates/domain/src/$1.rs:$i:1: replace f$i"; i=$((i + 1)); done; }
if [ "$iterate" -eq 0 ]; then
  printf '{"total_mutants":10,"caught":%s,"missed":%s,"timeout":%s,"unviable":0}' $((10 - m - t)) "$m" "$t" > "$dir/outcomes.json"
  mk miss "$m" > "$dir/missed.txt"; mk slow "$t" > "$dir/timeout.txt"
  exit $(( t > 0 ? 3 : (m > 0 ? 2 : 0) ))
fi
# rejeu : les dépassements passent (STUB_REPLAY=caught) ou persistent (timeout)
if [ "${STUB_REPLAY:-caught}" = timeout ]; then c=0; tt=$t; else c=$t; tt=0; fi
printf '{"total_mutants":%s,"caught":%s,"missed":%s,"timeout":%s,"unviable":0}' $((c + m + tt)) "$c" "$m" "$tt" > "$dir/outcomes.json"
mk miss "$m" > "$dir/missed.txt"; mk slow "$tt" > "$dir/timeout.txt"
exit $(( tt > 0 ? 3 : (m > 0 ? 2 : 0) ))
STUB
chmod +x "$work/stub.sh"
export STUB_LOG="$work/stub.log" MUTANTS_BIN="$work/stub.sh"
run() { rm -rf "$work/out"; : > "$STUB_LOG"; scripts/mutation-groupe.sh "$@" > "$work/run.log" 2>&1; }

run domaine-canvas "$work/out" || fail "tout attrapé : le groupe réussit"
grep -q -e '--package domain' "$STUB_LOG" && grep -q -e '--file crates/domain/src/canvas\*' "$STUB_LOG" || fail "les arguments du groupe vont à cargo-mutants"
grep -q -e '--timeout 30' "$STUB_LOG" || fail "domaine : coupure 30 s"
grep -q -e '--all-features' "$STUB_LOG" && grep -q -e '--jobs 4' "$STUB_LOG" && grep -q -e '--test-workspace=false' "$STUB_LOG" || fail "réglage commun : all-features, 4 tâches, tests de la crate seule"
[ "$(jq -r '"\(.groupe) \(.crate) \(.total) \(.caught) \(.missed) \(.timeout) \(.avant) \(.apres)"' "$work/out/mutants.out/bilan.json")" = "domaine-canvas domain 10 10 0 0 0 0" ] || fail "bilan chiffré"
jq -e '.duree_s | type == "number"' "$work/out/mutants.out/bilan.json" >/dev/null || fail "le bilan dit la durée"

run application-faux "$work/out" || fail "application : le groupe réussit"
grep -q -e '--timeout 90' "$STUB_LOG" || fail "hors domaine : coupure 90 s"

if STUB_MISSED=2 run domaine-canvas "$work/out"; then fail "un survivant fait échouer le groupe"; fi
grep -q 'survivant(s) du groupe domaine-canvas' "$work/run.log" || fail "le survivant est dit"
[ "$(jq '.missed' "$work/out/mutants.out/bilan.json")" -eq 2 ] || fail "le bilan est écrit même avec un survivant (artefact)"

STUB_TIMEOUT=3 run domaine-canvas "$work/out" || fail "des dépassements qui passent au rejeu : succès"
grep -q -e '--iterate' "$STUB_LOG" || fail "les dépassements sont rejoués"
[ "$(jq -r '"\(.avant) \(.apres)"' "$work/out/mutants.out/bilan.json")" = "3 0" ] || fail "bilan : dépassements avant et après rejeu"

STUB_TIMEOUT=3 STUB_REPLAY=timeout run domaine-canvas "$work/out" || fail "dépassement persistant : avertissement, pas d'échec"
grep -q '::warning::3 dépassement(s) persistent' "$work/run.log" || fail "avertissement chiffré"

STUB_LISTED=0 run domaine-autres "$work/out" || fail "groupe sans erreur : succès"
[ "$(jq -r '"\(.total) \(.missed)"' "$work/out/mutants.out/bilan.json")" = "0 0" ] || fail "groupe vide : bilan à zéro"
[ "$(grep -c -v -e '--list' "$STUB_LOG" || true)" -eq 0 ] || fail "groupe vide : rien n'est muté"
if run groupe-qui-n-existe-pas "$work/out"; then fail "groupe inconnu : échec"; fi

# 5. résumé
mkdir -p "$work/bilans/mutation-domaine-canvas" "$work/bilans/mutation-domaine-sens"
echo '{"groupe":"domaine-canvas","crate":"domain","total":146,"caught":140,"missed":0,"timeout":1,"unviable":5,"avant":2,"apres":1,"duree_s":754}' > "$work/bilans/mutation-domaine-canvas/bilan.json"
echo '{"groupe":"domaine-sens","crate":"domain","total":228,"caught":220,"missed":3,"timeout":0,"unviable":5,"avant":0,"apres":0,"duree_s":61}' > "$work/bilans/mutation-domaine-sens/bilan.json"
matrice='{"include":[{"nom":"domaine-canvas"},{"nom":"domaine-sens"},{"nom":"api-session"}]}'
scripts/mutation-resume.sh "$work/bilans" "$matrice" > "$work/resume.md"
grep -q -F -e '- **domaine-canvas** : 146 erreurs, 140 attrapées, 0 survivantes, 1 dépassements (2 avant rejeu), 5 non compilables, 12 min 34 s' "$work/resume.md" || fail "résumé : une ligne chiffrée par groupe"
grep -q -F -e 'domaine-sens** : 228 erreurs' "$work/resume.md" && grep -q 'SURVIVANT' "$work/resume.md" || fail "résumé : un survivant est signalé"
grep -q -F -e '- **api-session** : sans bilan' "$work/resume.md" || fail "résumé : un groupe sans bilan est dit"
grep -q -F -e '**Total** : 3 groupes, 374 erreurs, 360 attrapées, 3 survivantes, 1 dépassements persistants, 1 groupes sans bilan' "$work/resume.md" || fail "résumé : totaux"
if grep -q '^|' "$work/resume.md"; then fail "résumé : pas de tableau"; fi

# 6. le travail GitHub
wf=.github/workflows/mutation.yml
[ ! -f .github/workflows/mutation-domaine.yml ] || fail "l'ancien travail du domaine seul a disparu"
if command -v ruby >/dev/null 2>&1; then
  ruby -ryaml -rjson -e 'puts JSON.generate(YAML.safe_load(File.read(ARGV[0]), aliases: true))' "$wf" > "$work/wf.json" || fail "le YAML du travail est valide"
  chk() { jq -e "$1" "$work/wf.json" >/dev/null || fail "travail GitHub : $2"; }
  chk '(.["true"] // .on).schedule[0].cron == "17 2 * * *"' "planning 02:17 UTC"
  chk '(.["true"] // .on).workflow_dispatch.inputs.groupe.required == false' "entrée facultative « groupe »"
  chk '.jobs.mutation.strategy["fail-fast"] == false' "fail-fast: false"
  chk '.jobs.mutation.strategy.matrix == "${{ fromJSON(needs.matrice.outputs.matrice) }}"' "matrice lue du fichier de groupes"
  chk '.jobs.mutation["timeout-minutes"] == 25' "25 minutes par groupe"
  chk '.jobs.mutation["runs-on"] == "${{ matrix.machine }}"' "machine du groupe"
  chk '.jobs.resume.if | contains("always()")' "résumé toujours joué"
  chk '[.jobs.resume.steps[].name] | index("Summary") != null' "étape Summary"
else
  printf '(ruby absent : validation du YAML sautée)\n'
fi
grep -E '^\s*(- )?uses:' "$wf" | grep -q -v -E '@v[0-9]+\.[0-9]+\.[0-9]+$' && fail "une action n'est pas épinglée à une version exacte"
printf '✓ mutation par groupes : matrice, exhaustivité, groupe, résumé, travail GitHub\n'
