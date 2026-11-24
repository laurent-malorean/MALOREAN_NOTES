#!/usr/bin/env node
// Lit le rapport JSON de l'essai de l'application réelle (doc/decisions/0054) et l'écrit lisiblement.
// Code de sortie : 0 tout réussi ; 1 au moins un scénario échoué ; 2 rapport illisible ou d'un autre format.
import { readFileSync } from "node:fs";

const SUPPORTED_VERSION = 1;
const [, , path] = process.argv;

function fail(message) {
  console.error(`Rapport inutilisable : ${message}`);
  process.exit(2);
}

if (!path) fail("chemin du rapport manquant");
let report;
try {
  report = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  fail(`${path} : ${error.message}`);
}
if (report.version !== SUPPORTED_VERSION || !Array.isArray(report.scenarios)) {
  fail(`format inconnu (version ${report.version}, ${SUPPORTED_VERSION} attendue)`);
}

const seconds = (ms) => (ms / 1000).toFixed(1);
const lines = [
  `Essai de l'application réelle : ${report.passed} réussi(s), ${report.failed} échoué(s) en ${seconds(report.durationMs)} s`,
  `Fenêtre : ${report.window.width} x ${report.window.height} (${report.window.engine})`,
  "",
];
for (const scenario of report.scenarios) {
  const mark = scenario.status === "réussi" ? "✓" : "✗";
  lines.push(`${mark} ${scenario.name} : ${scenario.status} (${scenario.durationMs.toFixed(0)} ms)`);
  for (const check of scenario.checks) {
    const detail = check.detail ? ` : ${check.detail}` : "";
    lines.push(`    ${check.ok ? "✓" : "✗"} ${check.name}${detail}`);
  }
  for (const note of scenario.notes) lines.push(`    note : ${note}`);
  if (scenario.error) lines.push(`    erreur : ${scenario.error}`);
  const measures = Object.entries(scenario.measures);
  if (measures.length > 0) lines.push(`    mesures : ${JSON.stringify(Object.fromEntries(measures))}`);
}
lines.push("", "Non couvert par cet essai :");
for (const item of report.notCovered) lines.push(`  - ${item}`);
console.log(lines.join("\n"));
process.exit(report.failed === 0 ? 0 : 1);
