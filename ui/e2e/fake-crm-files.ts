// Les fichiers d'un CRM simulé (fiche 0060) : lire et écrire l'en-tête d'une action, les étapes.
import type { CrmActionItem } from "../src/bridge";

export type Args = Record<string, unknown>;

export interface FakeNotes {
  notes: Record<string, { content: string; modified: number }>;
}

export interface CrmHelpers {
  freeName(folder: string, wanted: string): string;
  slug(title: string): string;
  tick(): number;
}

/** Le jour du Mac simulé : un mercredi. */
export const FAKE_TODAY = "2026-11-25";
export const DEFAULT_STAGES = ["Progress", "WaitingFor"];
export const CLOSED = ["Done", "Cancel"];
const MS_PER_DAY = 86_400_000;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / MS_PER_DAY;

const header = (content: string) => /^---\n([\s\S]*?)\n---\n/.exec(content)?.[1] ?? "";

/** La valeur d'une propriété de l'en-tête, sans guillemets. */
export const value = (content: string, key: string) =>
  new RegExp(`^${key}:\\s*(.*)$`, "m").exec(header(content))?.[1]?.trim().replace(/^'|'$/g, "") ??
  null;

/** Pose (ou retire, avec `null`) une propriété de l'en-tête. */
export function withKey(content: string, key: string, text: string | null): string {
  const lines = header(content)
    .split("\n")
    .filter((line) => !line.startsWith(`${key}:`));
  if (text !== null) lines.push(`${key}: ${text}`);
  return content.replace(/^---\n[\s\S]*?\n---\n/, `---\n${lines.join("\n")}\n---\n`);
}

export function stagesOf(content: string): string[] {
  const list = /^etapes:\s*\[(.*)\]/m.exec(header(content))?.[1];
  if (list === undefined) return DEFAULT_STAGES;
  return list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Le retard ou le jour d'une action ouverte datée. */
function urgencyOf(date: string | null, open: boolean): CrmActionItem["urgency"] {
  if (!open || date === null) return null;
  if (date < FAKE_TODAY) return { kind: "late", days: dayNumber(FAKE_TODAY) - dayNumber(date) };
  return date === FAKE_TODAY ? { kind: "today" } : null;
}

export function actionOf(path: string, content: string, stages: string[]): CrmActionItem {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const wanted = (value(content, "statut") ?? "TODO").toLowerCase();
  const status = ["TODO", ...stages, ...CLOSED].find((s) => s.toLowerCase() === wanted) ?? "TODO";
  const open = !CLOSED.includes(status);
  const date = value(content, "date");
  const rank = value(content, "rang");
  return {
    ...{ name, title: /^# (.+)$/m.exec(content)?.[1] ?? name, people: [], companies: [] },
    ...{ status, open, date, urgency: urgencyOf(date, open), channel: null, project: null },
    ...{ tags: [], linkedNotes: [], color: value(content, "couleur") },
    ...{ rank: rank === null ? null : Number(rank), description: "", checklists: [], comments: [] },
  };
}

/** Le chemin d'une action d'un CRM, par son nom de fichier. */
export const actionPath = (crm: string, name: string) =>
  `${crm.replace(/\.md$/, "")}/actions/${name}.md`;
