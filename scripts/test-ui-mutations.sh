#!/usr/bin/env bash
# Scénarios de preuve de scripts/ui-mutations.sh, joués dans une copie jetable de l'interface
# (mêmes réglages Stryker et Vitest, deux petits fichiers de code et de tests) :
#   1. une mutation survit ; un test ajouté dans un autre fichier la tue : le passage incrémental
#      réussit, sans --complet ;
#   2. ce test est ensuite affaibli : le passage incrémental échoue.
#   3. tout ce que Stryker fabrique (résultat incrémental, rapport, sandbox) va dans build/ à côté de ui/,
#      jamais dans ui/ (doc/decisions/0055).
# Lancé par scripts/ci.sh quand ui-mutations.sh ou ce fichier changent.
set -euo pipefail
cd "$(dirname "$0")/.."
readonly ROOT=$PWD
readonly RUN="$ROOT/scripts/ui-mutations.sh"

# Même disposition que le dépôt : ui/ et build/ côte à côte.
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/ui"
cp -R ui/stryker.config.json ui/vitest.stryker.config.ts ui/test-support ui/package.json ui/tsconfig.json "$work/ui/"
# Stryker range son bac à sable dans build/ : les modules se trouvent un cran plus haut (dans le dépôt, il y relie
# le vrai ui/node_modules ; un lien n'est pas vu par sa recherche, d'où ce lien à la racine de la copie).
ln -s "$ROOT/ui/node_modules" "$work/node_modules"
mkdir "$work/ui/src"
cd "$work/ui"

fail() { printf '✗ %s\n' "$1" >&2; exit 1; }
expect_pass() { "$RUN" >run.log 2>&1 || { cat run.log; fail "$1"; }; }
expect_fail() { if "$RUN" >run.log 2>&1; then cat run.log; fail "$1"; fi; }

# Une constante (mutation « statique », jouée au chargement) et une fonction testée.
cat >src/calc.ts <<'EOF'
export const LABEL = "total";
export function add(a: number, b: number): number {
  return a + b;
}
EOF
cat >src/calc.test.ts <<'EOF'
import { expect, test } from "vitest";
import { add } from "./calc";
test("additionne", () => {
  expect(add(2, 3)).toBe(5);
});
EOF

printf '▶ Une mutation survit : échec\n'
expect_fail "la constante non testée aurait dû faire échouer le test de mutation"

printf '▶ Un test ajouté dans un autre fichier la tue : réussite sans --complet\n'
cat >src/label.test.ts <<'EOF'
import { expect, test } from "vitest";
import { LABEL } from "./calc";
test("libellé", () => {
  expect(LABEL).toBe("total");
});
EOF
expect_pass "le test ajouté n'a pas été pris en compte"

printf '▶ Ce test est affaibli : échec\n'
sed -i '' 's/toBe("total")/toBeDefined()/' src/label.test.ts
expect_fail "le test affaibli n'a pas fait échouer le test de mutation"

printf '▶ Rien de généré dans ui/, tout dans build/\n'
[ -s "$work/build/reports/stryker-incremental.json" ] || fail "le résultat incrémental n'est pas dans build/reports"
[ -s "$work/build/reports/mutation/index.html" ] || fail "le rapport de mutation n'est pas dans build/reports/mutation"
for generated in reports .stryker-tmp .vitest coverage dist; do
  [ ! -e "$work/ui/$generated" ] || fail "ui/$generated existe : un outil a écrit à côté du code"
done

printf '✓ Scénarios du test de mutation incrémental réussis\n'
