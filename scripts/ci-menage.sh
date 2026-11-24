#!/usr/bin/env bash
# Ménage du dossier de compilation de Cargo : retire seulement ce qui est périmé (doc/code.md, « Temps de la
# CI » ; doc/decisions/0048). Effacer tout obligerait à tout recompiler (candle : plusieurs minutes).
#   ci-menage.sh             ménage (résumé d'une ligne : taille avant et après)
#   ci-menage.sh --a-blanc   liste ce qui serait retiré, n'efface rien (ne contrôle pas les processus)
#   ci-menage.sh --discret   comme le ménage, mais ne dit rien quand il n'y a rien à faire (appel par la CI)
# Périmé : une variante de compilation (target/debug/build/<crate>/<empreinte>, target/debug/deps, le même
# sous target/llvm-cov-target/debug, compilation incrémentale, fichiers .profraw de la couverture) dont AUCUN
# fichier n'a été lu ni modifié depuis plus d'un jour (date d'accès OU de modification : cargo lit les
# fichiers d'empreinte de ce qu'il réutilise, la date de modification seule ferait jeter chaque jour ce qui
# sert encore). On ne regarde que les fichiers, jamais les dossiers : les parcourir mettrait leur date
# d'accès à jour. Jamais retiré : la variante la plus récemment utilisée de chaque crate (ce que le dernier
# passage a utilisé), et tout ce qui est récent.
# Seulement au-delà de SEUIL_GO. Jamais pendant qu'un passage de la CI, une mutation (mutation-diff.sh,
# ui-mutations.sh), un autre ménage ou un cargo tourne. Même règle d'âge pour les copies temporaires de
# cargo-mutants ($TMPDIR/cargo-mutants-*.tmp) et la copie figée de --copie.
# Respecte CARGO_TARGET_DIR. Ne touche qu'à un dossier de compilation vérifié : mot-clé de Cargo
# (CACHEDIR.TAG), pas de lien, ni / ni le dossier personnel ni le dépôt ; tout effacement est sous ce dossier.
# Réglages de test : MENAGE_SEUIL_KO, MENAGE_MOTIF_PROCESSUS, MENAGE_NOMS_PROCESSUS, MENAGE_VERROU.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd -P)
readonly ROOT

readonly SEUIL_GO=8
readonly SEUIL_KO=${MENAGE_SEUIL_KO:-$((SEUIL_GO * 1024 * 1024))}
readonly AGE_MAX_SECONDES=86400
readonly CARGO_SIGNATURE=8a477f597d28d172789f06886806bc55
readonly MOTIF_PROCESSUS=${MENAGE_MOTIF_PROCESSUS:-'scripts/ci\.sh|scripts/mutation-diff\.sh|scripts/ui-mutations\.sh'}
readonly NOMS_PROCESSUS=${MENAGE_NOMS_PROCESSUS-cargo rustc cargo-mutants cargo-llvm-cov}
readonly TMP_BASE=${TMPDIR:-/tmp}
readonly VERROU=${MENAGE_VERROU:-${TMP_BASE%/}/malorean-notes-menage.lock}
readonly SNAPSHOT_DIR=${CI_SNAPSHOT_DIR:-${HOME}/Library/Caches/malorean-notes-ci}
readonly HASH_REGEX='^(.+)-([0-9a-f]{16})(\..*)?$'

BLANC=0
DISCRET=0
for argument in "$@"; do
  case "$argument" in
    --a-blanc) BLANC=1 ;;
    --discret) DISCRET=1 ;;
    *) printf '✗ option inconnue : %s\n' "$argument" >&2; exit 2 ;;
  esac
done

refuse() { printf '✗ ménage refusé : %s\n' "$1" >&2; exit 1; }
saute() { printf '(ménage sauté : %s)\n' "$1"; exit 0; }
physical() { (cd "$1" 2>/dev/null && pwd -P); }
go() { awk -v k="$1" 'BEGIN { printf "%.1f", k / 1048576 }' | tr . ,; }
taille_ko() { du -sk "$1" 2>/dev/null | cut -f1; }

if [ "$(uname)" = Darwin ]; then
  STAT_AM=(stat -f '%a %m')
  STAT_M=(stat -f '%m')
  STAT_AMN=(stat -f '%a %m %N')
  date_en_touch() { date -r "$1" +%Y%m%d%H%M.%S; }
else
  STAT_AM=(stat -c '%X %Y')
  STAT_M=(stat -c '%Y')
  STAT_AMN=(stat -c '%X %Y %n')
  date_en_touch() { date -d "@$1" +%Y%m%d%H%M.%S; }
fi

# Le dossier de compilation : refusé s'il n'est pas sûr de n'effacer que du Cargo.
TARGET=${CARGO_TARGET_DIR:-$ROOT/target}
[ -n "$TARGET" ] || refuse "chemin vide"
[ -d "$TARGET" ] || saute "pas de dossier de compilation (${TARGET})"
[ ! -L "$TARGET" ] || refuse "${TARGET} est un lien, pas un dossier de compilation"
TARGET_REAL=$(physical "$TARGET") || refuse "chemin illisible : ${TARGET}"
case "$TARGET_REAL" in
  "" | / | "$HOME" | "$ROOT" | "$(dirname "$ROOT")") refuse "${TARGET_REAL} n'est pas un dossier de compilation" ;;
esac
grep -q "Signature: ${CARGO_SIGNATURE}" "$TARGET_REAL/CACHEDIR.TAG" 2>/dev/null \
  || refuse "${TARGET_REAL} n'a pas la marque de Cargo (CACHEDIR.TAG) : pas un dossier de compilation"
[ -d "$TARGET_REAL/debug" ] || [ -d "$TARGET_REAL/release" ] || [ -d "$TARGET_REAL/llvm-cov-target" ] \
  || refuse "${TARGET_REAL} ne contient ni debug, ni release, ni llvm-cov-target"
readonly TARGET_REAL

# N'efface que sous le dossier de compilation vérifié.
efface_sous() {
  local base=$1 chemin=$2 reel
  [ ! -L "$chemin" ] || return 1
  reel=$(physical "$(dirname "$chemin")")/$(basename "$chemin") || return 1
  case "$reel" in "$base"/?*) ;; *) return 1 ;; esac
  rm -rf -- "$reel"
}

AVANT_KO=$(taille_ko "$TARGET_REAL")
if [ "${AVANT_KO:-0}" -lt "$SEUIL_KO" ]; then
  [ "$DISCRET" -eq 1 ] || printf '(ménage : dossier de compilation à %s Go, sous le seuil de %s Go : rien à retirer)\n' \
    "$(go "${AVANT_KO:-0}")" "$(go "$SEUIL_KO")"
  exit 0
fi

# Processus qui travaillent peut-être dans le dossier : tous sauf ce passage et ses parents.
ancetres() {
  local pid=$$
  while [ "${pid:-0}" -gt 1 ]; do
    printf '%s\n' "$pid"
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  done
}
processus_actif() {
  local mes_pids pid nom
  mes_pids=$(ancetres)
  for pid in $( { pgrep -f -- "$MOTIF_PROCESSUS"; for nom in $NOMS_PROCESSUS; do pgrep -x "$nom"; done; } 2>/dev/null); do
    printf '%s\n' "$mes_pids" | grep -qx "$pid" && continue
    printf '%s (%s)' "$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-60)" "$pid"
    return 0
  done
  return 1
}

if [ "$BLANC" -eq 0 ]; then
  if autre=$(processus_actif); then saute "un passage de la CI, une mutation ou cargo tourne : ${autre}"; fi
  if mkdir "$VERROU" 2>/dev/null; then :; else
    if [ -f "$VERROU/pid" ] && kill -0 "$(cat "$VERROU/pid" 2>/dev/null)" 2>/dev/null; then
      saute "un autre ménage tourne (verrou ${VERROU})"
    fi
    rm -rf -- "$VERROU"; mkdir "$VERROU" 2>/dev/null || saute "verrou pris (${VERROU})"
  fi
  printf '%s' "$$" > "$VERROU/pid"
fi

# Date limite : un fichier de référence daté d'il y a un jour.
CUTOFF=$(($(date +%s) - AGE_MAX_SECONDES))
REF=$(mktemp)
touch -t "$(date_en_touch "$CUTOFF")" "$REF"

# Dernière utilisation (accès ou modification) la plus récente des fichiers de chaque unité d'un dossier, en un
# seul parcours : « date <TAB> chemin de l'unité » (profondeur de l'unité : 1 ou 2 composants sous le dossier).
dernieres_utilisations() {
  local dossier=$1 mini=$2 maxi=$3 composants=$4
  [ -d "$dossier" ] || return 0
  find "$dossier" -mindepth "$mini" -maxdepth "$maxi" -type f -exec "${STAT_AMN[@]}" {} + 2>/dev/null \
    | awk -v p="$dossier/" -v n="$composants" '{
        t = ($1 > $2) ? $1 : $2
        rel = substr($0, length($1) + length($2) + 3 + length(p)); split(rel, c, "/")
        u = (n == 1) ? c[1] : c[1] "/" c[2]
        if (t > mx[u]) mx[u] = t
      } END { for (u in mx) printf "%s\t%s%s\n", mx[u], p, u }'
}
# Un fichier du dossier (n'importe quelle profondeur) a-t-il été lu ou modifié depuis la date limite ?
utilise_recemment() {
  [ -n "$(find "$1" -type f \( -newermm "$REF" -o -neweram "$REF" \) 2>/dev/null | head -1)" ]
}

# Variantes : lignes « date <TAB> clé (une par crate) <TAB> groupe <TAB> chemin ».
variantes() {
  local racine fichier base nom hash t
  for racine in "$TARGET_REAL/debug" "$TARGET_REAL/llvm-cov-target/debug"; do
    dernieres_utilisations "$racine/build" 3 4 2 | awk -F'\t' '{ k = $2; sub(/\/[^\/]*$/, "", k); printf "%s\t%s\t%s\t%s\n", $1, k, $2, $2 }'
    dernieres_utilisations "$racine/incremental" 2 3 1 | awk -F'\t' '{ k = $2; sub(/-[^-\/]*$/, "", k); printf "%s\t%s\t%s\t%s\n", $1, k, $2, $2 }'
    for fichier in "$racine"/deps/*; do
      [ -f "$fichier" ] || continue
      base=$(basename "$fichier")
      [[ $base =~ $HASH_REGEX ]] || continue
      nom=${BASH_REMATCH[1]#lib}
      hash=${BASH_REMATCH[2]}
      t=$("${STAT_AM[@]}" "$fichier" | tr ' ' '\n' | sort -n | tail -1)
      printf '%s\t%s\t%s\t%s\n' "$t" "$racine/deps/$nom" "$racine/deps/$hash" "$fichier"
    done
  done
}

# Périmées : toutes leurs pièces plus vieilles que la date limite, et pas la plus récente de leur crate.
a_retirer() {
  local chemin
  variantes | awk -F'\t' -v cut="$CUTOFF" '
    { t = $1 + 0; g = $3; key[g] = $2; if (t > gt[g]) gt[g] = t
      paths[NR] = $4; grp[NR] = g }
    END {
      for (g in gt) if (!(key[g] in mx) || gt[g] > mx[key[g]]) { mx[key[g]] = gt[g]; best[key[g]] = g }
      for (i = 1; i <= NR; i++) { g = grp[i]; if (gt[g] < cut && best[key[g]] != g) print paths[i] }
    }' | while IFS= read -r chemin; do
    if [ -d "$chemin" ] && utilise_recemment "$chemin"; then continue; fi
    printf '%s\n' "$chemin"
  done
  for chemin in "$TARGET_REAL"/llvm-cov-target/*.profraw; do
    [ -f "$chemin" ] || continue
    [ "$("${STAT_AM[@]}" "$chemin" | tr ' ' '\n' | sort -n | tail -1)" -lt "$CUTOFF" ] && printf '%s\n' "$chemin"
  done
}

# Copies temporaires périmées, hors dossier de compilation.
copies_a_retirer() {
  local chemin
  for chemin in "${TMP_BASE%/}"/cargo-mutants-*.tmp; do
    [ -d "$chemin" ] && [ ! -L "$chemin" ] || continue
    [ "$("${STAT_M[@]}" "$chemin")" -lt "$CUTOFF" ] && ! utilise_recemment "$chemin" && printf '%s\n' "$chemin"
  done
  if [ -d "$SNAPSHOT_DIR" ] && [ ! -L "$SNAPSHOT_DIR" ] && [ -f "$SNAPSHOT_DIR/scripts/ci.sh" ] \
     && [ "$(physical "$SNAPSHOT_DIR")" != "$ROOT" ] && [ "$(physical "$SNAPSHOT_DIR")" != "$HOME" ] \
     && ! utilise_recemment "$SNAPSHOT_DIR" && ! pgrep -f -- "$SNAPSHOT_DIR" >/dev/null 2>&1; then
    printf '%s\n' "$SNAPSHOT_DIR"
  fi
}

LISTE=$(mktemp)
COPIES=$(mktemp)
trap 'rm -f -- "$REF" "$LISTE" "$COPIES"; [ "$BLANC" -eq 1 ] || rm -rf -- "$VERROU"' EXIT
a_retirer > "$LISTE"
copies_a_retirer > "$COPIES"

if [ "$BLANC" -eq 1 ]; then
  printf 'ménage à blanc : dossier de compilation %s, %s Go (seuil %s Go), rien n est effacé\n' \
    "$TARGET_REAL" "$(go "$AVANT_KO")" "$(go "$SEUIL_KO")"
  while IFS= read -r chemin; do
    printf '  à retirer %8s Go  %s\n' "$(go "$(taille_ko "$chemin")")" "$chemin"
  done < <(cat "$LISTE" "$COPIES")
  total=0
  while IFS= read -r chemin; do total=$((total + $(taille_ko "$chemin"))); done < "$LISTE"
  printf 'ménage à blanc : %s éléments du dossier de compilation (%s Go) et %s copies temporaires\n' \
    "$(wc -l < "$LISTE" | tr -d ' ')" "$(go "$total")" "$(wc -l < "$COPIES" | tr -d ' ')"
  exit 0
fi

while IFS= read -r chemin; do efface_sous "$TARGET_REAL" "$chemin" || printf '(ménage : %s refusé)\n' "$chemin" >&2; done < "$LISTE"
copies=0
while IFS= read -r chemin; do
  case "$chemin" in
    "${TMP_BASE%/}"/cargo-mutants-*.tmp) efface_sous "$(physical "$TMP_BASE")" "$chemin" && copies=$((copies + 1)) ;;
    "$SNAPSHOT_DIR") rm -rf -- "$SNAPSHOT_DIR" && copies=$((copies + 1)) ;;
  esac
done < "$COPIES"
APRES_KO=$(taille_ko "$TARGET_REAL")
printf 'ménage : dossier de compilation %s Go -> %s Go, %s copies temporaires retirées\n' \
  "$(go "$AVANT_KO")" "$(go "${APRES_KO:-0}")" "$copies"
exit 0
