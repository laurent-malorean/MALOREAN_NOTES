#!/usr/bin/env bash
# Preuves du script de l'essai de l'application réelle (scripts/essai-application.sh) avec une FAUSSE application
# (un petit programme shell qui vérifie son environnement et écrit un rapport), dans un faux dossier personnel :
# la construction n'a pas lieu et rien de réel n'est touché. Le dernier contrôle construit l'interface deux fois (avec et sans code d'essai).
#   rapport réussi -> sortie 0 ; échoué -> 1 avec la raison lisible ; aucun rapport, rapport illisible, programme
#   bloqué (tué au délai) -> 2 ; espaces de travail préparés (image, carte mentale copiée à l'identique, 400 notes) ;
#   préférences et notes de l'utilisateur intactes ; modèle de sens cloné ; la barrière n'appelle pas l'essai.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

export HOME=$work/home
SUPPORT="$HOME/Library/Application Support"
mkdir -p "$SUPPORT/com.malorean.notes/models/e5-small"
echo '{"espaces":["ceux de l utilisateur"]}' > "$SUPPORT/com.malorean.notes/preferences.json"
echo poids > "$SUPPORT/com.malorean.notes/models/e5-small/model.bin"
export ESSAI_DELAI=4
export ESSAI_SORTIE=$work/sortie-essai

good_report='{"version":1,"durationMs":1234,"window":{"width":1100,"height":720,"engine":"WebKit"},"notCovered":["Les boîtes de dialogue natives de macOS"],"passed":1,"failed":0,"scenarios":[{"name":"Canvas : exemple","status":"réussi","durationMs":12,"checks":[{"name":"la carte existe","ok":true,"detail":"1 carte"}],"measures":{"largeur":240},"notes":[],"error":null}]}'
bad_report='{"version":1,"durationMs":99,"window":{"width":1100,"height":720,"engine":"WebKit"},"notCovered":["Les boîtes de dialogue natives de macOS"],"passed":0,"failed":1,"scenarios":[{"name":"Canvas : image","status":"échoué","durationMs":5,"checks":[{"name":"l image est affichée","ok":false,"detail":"naturalWidth = 0"}],"measures":{},"notes":["modèle absent"],"error":"la carte n existe pas"}]}'

# Fausse application : contrôle l'espace préparé et l'environnement, puis écrit le rapport donné par FAKE_REPORT.
fake=$work/fausse-application
cat > "$fake" <<'APP'
#!/usr/bin/env bash
set -e
[ -n "$MALOREAN_ESSAI" ] && [ -n "$MALOREAN_ESSAI_ESPACE" ] || exit 7
cmp -s "$MALOREAN_ESSAI_ESPACE/notes/Fixtures/image.png" "$FAKE_FIXTURES/image.png" || exit 8
cmp -s "$MALOREAN_ESSAI_ESPACE/notes/toto.md" "$FAKE_FIXTURES/toto.md" || exit 9
[ "$(ls "$MALOREAN_ESSAI_ESPACE/recherche" | wc -l | tr -d ' ')" = 400 ] || exit 10
grep -q 'richesse' "$MALOREAN_ESSAI_ESPACE/recherche/richesse-400.md" || exit 11
[ -f "$HOME/Library/Application Support/com.malorean.notes.essai/models/e5-small/model.bin" ] || exit 12
case "$FAKE" in
  report) printf '%s' "$FAKE_REPORT" > "$MALOREAN_ESSAI" ;;
  nothing) exit 0 ;;
  hang) sleep 60 ;;
esac
APP
chmod +x "$fake"
export ESSAI_APPLICATION=$fake FAKE_FIXTURES=$ROOT/ui/test-support/essai

run() { FAKE=$1 FAKE_REPORT=${2:-} scripts/essai-application.sh >"$work/sortie.txt" 2>&1; }
expect_exit() {
  local expected=$1 label=$2 got=0
  shift 2
  run "$@" || got=$?
  [ "$got" -eq "$expected" ] || { cat "$work/sortie.txt"; fail "$label : sortie $got au lieu de $expected"; }
}
expect_output() { grep -q -- "$1" "$work/sortie.txt" || { cat "$work/sortie.txt"; fail "$2 : « $1 » absent de la sortie"; }; }

# 1. rapport réussi
expect_exit 0 "rapport réussi" report "$good_report"
expect_output "1 réussi(s), 0 échoué(s)" "rapport réussi"
expect_output "✓ la carte existe : 1 carte" "rapport réussi"
expect_output "boîtes de dialogue natives" "rapport réussi : ce qui n'est pas couvert"
expect_output "quelques secondes" "avertissement de la fenêtre"

# 2. rapport échoué : la raison est lisible
expect_exit 1 "rapport échoué" report "$bad_report"
expect_output "✗ Canvas : image : échoué" "rapport échoué"
expect_output "✗ l image est affichée : naturalWidth = 0" "rapport échoué"
expect_output "erreur : la carte n existe pas" "rapport échoué"
expect_output "note : modèle absent" "rapport échoué"

# 3. pas de rapport : programme qui s'arrête, rapport illisible, version inconnue, programme bloqué
expect_exit 2 "aucun rapport" nothing
expect_output "sans écrire de rapport" "aucun rapport"
expect_exit 2 "rapport illisible" report "pas du json"
expect_output "Rapport inutilisable" "rapport illisible"
expect_exit 2 "autre version" report '{"version":99,"scenarios":[]}'
expect_output "format inconnu" "autre version"
before=$SECONDS
expect_exit 2 "programme bloqué" hang
expect_output "délai de 4 s dépassé" "programme bloqué"
[ $((SECONDS - before)) -lt 30 ] || fail "programme bloqué : le délai n'a pas été tenu"
sleep 1
! pgrep -f "$work/fausse-application" >/dev/null || fail "programme bloqué : il tourne encore"

# 4. rien de l'utilisateur touché ; son modèle cloné pour l'essai
grep -q "ceux de l utilisateur" "$SUPPORT/com.malorean.notes/preferences.json" || fail "les préférences de l'utilisateur ont changé"
[ "$(cat "$SUPPORT/com.malorean.notes/models/e5-small/model.bin")" = poids ] || fail "le modèle de l'utilisateur a changé"
[ -d "$SUPPORT/com.malorean.notes.essai" ] || fail "le dossier de données de l'essai manque"
! grep -q "data_fake" scripts/essai-application.sh || fail "le script ne doit jamais citer data_fake"

# 5. à la demande seulement : ni la barrière ni la fin de fonction ne le lancent
! grep -v "^#" scripts/ci.sh | grep -q "scripts/essai-application\.sh" || fail "scripts/ci.sh ne doit pas lancer l'essai de l'application"
# 6. l'interface construite normalement ne contient ni code ni commande d'essai ; celle d'essai les contient
(cd ui && npx --no-install vite build --outDir "$work/dist-normal" --emptyOutDir >/dev/null 2>&1) || fail "construction normale de l'interface"
! grep -rqE "essai_(settings|write_report|quit)" "$work/dist-normal" || fail "l'interface normale contient du code d'essai"
(cd ui && MALOREAN_ESSAI_BUILD=1 npx --no-install vite build --outDir "$work/dist-essai" --emptyOutDir >/dev/null 2>&1) || fail "construction d'essai de l'interface"
grep -rqE "essai_settings" "$work/dist-essai" || fail "l'interface d'essai ne contient pas le code d'essai"
printf "✓ essai de l'application réelle : preuves du script réussies\n"
