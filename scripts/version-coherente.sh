#!/usr/bin/env bash
# Le numéro de version de l'application (Majeur.mineur.correctif) a deux sources : `version` de
# `[workspace.package]` dans Cargo.toml, `version` de ui/package.json (lue par crates/app/tauri.conf.json).
# Ce script vérifie qu'elles portent le même numéro et, si un tag est donné, que le tag (`vX.Y.Z`, sans le `v`)
# porte lui aussi ce numéro. Il est joué par .github/workflows/application.yml avant toute compilation.
#
#   scripts/version-coherente.sh [vX.Y.Z]
#
# Sortie : 0 numéros identiques (le numéro est écrit sur la sortie standard) ; 1 sinon, avec la raison lisible.
# VERSION_RACINE : dossier racine à lire (la racine du dépôt par défaut ; preuves du script).
set -euo pipefail
ROOT=${VERSION_RACINE:-$(cd "$(dirname "$0")/.." && pwd)}
readonly TAG=${1:-}
readonly NUMBER='[0-9]+\.[0-9]+\.[0-9]+'

fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

# Valeur de la clé `version` dans la section [workspace.package] de Cargo.toml.
cargo_version() {
  awk '/^\[/ { inside = ($0 == "[workspace.package]") } inside && /^version[[:space:]]*=/ { gsub(/.*=[[:space:]]*"|".*/, ""); print; exit }' "$ROOT/Cargo.toml"
}

# Valeur de la clé `version` à la racine de ui/package.json (deux espaces d'indentation : jamais celle d'une dépendance).
package_version() {
  sed -n -E 's/^  "version":[[:space:]]*"([^"]*)".*/\1/p' "$ROOT/ui/package.json" | head -n 1
}

cargo=$(cargo_version)
package=$(package_version)
[ -n "$cargo" ] || fail "Cargo.toml : pas de version dans [workspace.package]"
[ -n "$package" ] || fail "ui/package.json : pas de version"
printf '%s\n' "$cargo" | grep -Eqx "$NUMBER" || fail "Cargo.toml : la version « $cargo » n'est pas de la forme Majeur.mineur.correctif"
printf '%s\n' "$package" | grep -Eqx "$NUMBER" || fail "ui/package.json : la version « $package » n'est pas de la forme Majeur.mineur.correctif"
[ "$cargo" = "$package" ] || fail "numéros différents : Cargo.toml $cargo, ui/package.json $package"

if [ -n "$TAG" ]; then
  printf '%s\n' "$TAG" | grep -Eqx "v$NUMBER" || fail "le tag « $TAG » n'est pas de la forme vMajeur.mineur.correctif"
  [ "${TAG#v}" = "$cargo" ] || fail "le tag $TAG ne porte pas le numéro de Cargo.toml et ui/package.json ($cargo)"
fi
printf '%s\n' "$cargo"
