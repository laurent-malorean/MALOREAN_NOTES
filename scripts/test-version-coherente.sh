#!/usr/bin/env bash
# Preuves de scripts/version-coherente.sh, jouées sur de faux fichiers Cargo.toml et ui/package.json rangés dans
# un dossier temporaire (VERSION_RACINE) :
#   numéros identiques -> 0 et le numéro écrit ; Cargo.toml et package.json différents -> 1 ; tag identique -> 0 ;
#   tag différent, sans `v`, avec un suffixe ou incomplet -> 1 ; numéro incomplet ou absent -> 1 ; la version d'une
#   dépendance n'est jamais prise pour celle du paquet ; le vrai dépôt est cohérent ; le workflow de fabrication
#   joue ce script avant toute compilation, ne publie que sur un tag et ne donne `contents: write` qu'à la publication.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

# write_versions <version de Cargo.toml> <version de package.json> : un faux dépôt dans $work.
write_versions() {
  mkdir -p "$work/ui"
  printf '[workspace]\nmembers = ["crates/*"]\n\n[workspace.package]\nversion = "%s"\nedition = "2024"\n\n[workspace.dependencies]\nserde = { version = "9.9.9" }\n' "$1" > "$work/Cargo.toml"
  printf '{\n  "name": "ui",\n  "private": true,\n  "version": "%s",\n  "dependencies": {\n    "vite": "^9.9.9"\n  }\n}\n' "$2" > "$work/ui/package.json"
}
check() { VERSION_RACINE=$work "$ROOT/scripts/version-coherente.sh" "$@" 2>&1; }
expect_ok() { out=$(check "${@:2}") || fail "$1 : devrait réussir ($out)"; }
expect_ko() { if out=$(check "${@:3}"); then fail "$1 : devrait échouer"; fi; printf '%s' "$out" | grep -q -- "$2" || fail "$1 : raison attendue « $2 », reçu « $out »"; }

write_versions 1.2.3 1.2.3
expect_ok "numéros identiques, sans tag"
[ "$(check)" = 1.2.3 ] || fail "le numéro doit être écrit sur la sortie"
expect_ok "tag identique" v1.2.3
expect_ko "tag plus récent" "ne porte pas le numéro" v1.2.4
expect_ko "tag plus ancien" "ne porte pas le numéro" v1.2.2
expect_ko "tag sans v" "n'est pas de la forme" 1.2.3
expect_ko "tag incomplet" "n'est pas de la forme" v1.2
expect_ko "tag avec suffixe" "n'est pas de la forme" v1.2.3-beta
expect_ko "tag avec texte après" "n'est pas de la forme" v1.2.3x
write_versions 1.2.3 1.2.4
expect_ko "Cargo.toml et package.json différents" "numéros différents : Cargo.toml 1.2.3, ui/package.json 1.2.4"
expect_ko "tag et deux fichiers différents" "numéros différents" v1.2.3
write_versions 1.2 1.2
expect_ko "numéro incomplet dans Cargo.toml" "Cargo.toml : la version « 1.2 »"
write_versions 1.2.3 1.2
expect_ko "numéro incomplet dans package.json" "ui/package.json : la version « 1.2 »"
write_versions 1.2.3 1.2.3
printf '[workspace.package]\nedition = "2024"\n[workspace.dependencies]\nserde = { version = "1.2.3" }\n' > "$work/Cargo.toml"
expect_ko "pas de version dans [workspace.package]" "pas de version dans \[workspace.package\]"
write_versions 1.2.3 1.2.3
printf '{\n  "name": "ui",\n  "dependencies": {\n    "version": "1.2.3"\n  }\n}\n' > "$work/ui/package.json"
expect_ko "pas de version à la racine de package.json" "pas de version"

# Le vrai dépôt : les deux sources portent le même numéro.
scripts/version-coherente.sh >/dev/null || fail "Cargo.toml et ui/package.json du dépôt portent des numéros différents"

# Le workflow de fabrication (.github/workflows/application.yml).
wf=.github/workflows/application.yml
[ -f "$wf" ] || fail "$wf manque"
grep -q "scripts/version-coherente.sh" "$wf" || fail "le workflow ne joue pas scripts/version-coherente.sh"
python3 - "$wf" <<'PY' || fail "forme du workflow application.yml"
import sys
try:
    import yaml
except ImportError:
    print("(PyYAML absent : forme du workflow non vérifiée)")
    sys.exit(0)
doc = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
on = doc.get("on", doc.get(True))
assert on["push"]["tags"] == ["v[0-9]+.[0-9]+.[0-9]+"], "déclenché par un tag vX.Y.Z"
assert "workflow_dispatch" in on, "déclenchement à la demande"
assert doc["permissions"] == {"contents": "read"}, "permissions de base : lecture seule"
jobs = doc["jobs"]
writers = [name for name, job in jobs.items() if job.get("permissions", {}).get("contents") == "write"]
assert writers == ["publier"], f"contents: write seulement pour la publication, trouvé {writers}"
assert jobs["publier"]["if"] == "startsWith(github.ref, 'refs/tags/v')", "publication sur un tag seulement"
assert "fabriquer" in jobs["publier"]["needs"], "la publication attend la fabrication"
assert "verifier" in jobs["fabriquer"]["needs"], "la fabrication attend la vérification du numéro"
assert jobs["fabriquer"]["runs-on"] == "macos-latest", "fabrication sur macOS"
build = "\n".join(step.get("run", "") for step in jobs["fabriquer"]["steps"])
assert "--bundles app,dmg" in build, "bundles app et dmg"
assert "essai" not in build, "aucune option d'essai dans la fabrication livrée"
PY
printf '✓ version-coherente : tous les cas passent\n'
