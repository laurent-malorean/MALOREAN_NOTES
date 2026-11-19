// Barre de saisie de la colonne Claude Code : les réglages du tour (modèle de Claude, niveau
// d'effort), gardés d'un lancement à l'autre, les notes jointes au message, la durée de la réponse
// et le nombre de sous-agents en cours, tels que les pastilles les montrent (fiche 0032).
import type { ClaudeModelItem, EffortItem, TurnSettingsItem } from "../bridge";
import type { AgentMap } from "./agent-map";
import type { PreferenceStorage } from "./focus-preference";

/** Rien de choisi : Claude Code garde ses propres choix. */
export const NO_SETTINGS: TurnSettingsItem = { model: null, effort: null };

/** Un choix de la liste du modèle ou du niveau d'effort, avec son nom. */
export interface SettingChoice<T> {
  readonly value: T;
  readonly label: string;
}

/** Les modèles de Claude, du plus léger au plus capable. */
export const MODELS: readonly SettingChoice<ClaudeModelItem>[] = [
  { value: "haiku", label: "Haiku" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "fable", label: "Fable" },
];

/** Les niveaux d'effort, du plus bas au plus haut, sous les noms de Claude Code. */
export const EFFORTS: readonly SettingChoice<EffortItem>[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "extraHigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

export const DEFAULT_MODEL = "Modèle par défaut";

const labelOf = <T>(choices: readonly SettingChoice<T>[], value: T | null) =>
  choices.find((choice) => choice.value === value)?.label;

/** Ce que dit la pastille des réglages : « Opus · Medium », « Opus », « Modèle par défaut · High ». */
export function settingsText({ model, effort }: TurnSettingsItem): string {
  const modelText = labelOf(MODELS, model) ?? DEFAULT_MODEL;
  const effortText = labelOf(EFFORTS, effort);
  return effortText === undefined ? modelText : `${modelText} · ${effortText}`;
}

const KEY = "malorean.claudeSettings";

/** Un choix connu de `choices`, sinon rien. */
function known<T>(choices: readonly SettingChoice<T>[], value: unknown): T | null {
  return choices.find((choice) => choice.value === value)?.value ?? null;
}

/** Les réglages gardés ; rien de choisi s'il n'y en a pas, s'ils sont illisibles ou si le stockage est refusé. */
export function loadTurnSettings(storage: PreferenceStorage): TurnSettingsItem {
  try {
    // Rien de gardé se lit « null », un objet vide : rien de choisi.
    const stored = Object(JSON.parse(String(storage.getItem(KEY)))) as Record<string, unknown>;
    return { model: known(MODELS, stored["model"]), effort: known(EFFORTS, stored["effort"]) };
  } catch {
    return NO_SETTINGS;
  }
}

/** Garde les réglages ; sans effet si le stockage est refusé. */
export function saveTurnSettings(storage: PreferenceStorage, settings: TurnSettingsItem): void {
  try {
    if (settings.model === null && settings.effort === null) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}

/** Ce que dit la pastille des sous-agents : « ● 2 agents » ; rien quand aucun ne travaille. */
export function runningAgentsText(map: AgentMap): string | null {
  const running = map.agents.filter((agent) => agent.state === "running").length;
  return running === 0 ? null : `● ${running} ${running > 1 ? "agents" : "agent"}`;
}

/** La durée de la réponse en cours, à la seconde : « 7 s », « 2 min 05 s ». */
export function elapsedText(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/** Une note jointe au message : son chemin depuis l'espace de travail et son titre. */
export interface AttachedNote {
  readonly path: string;
  readonly title: string;
}

/**
 * Les notes jointes : la note ouverte dans la colonne active (sauf si on l'a retirée, jusqu'à ce
 * qu'une autre s'ouvre), et celles ajoutées par « + », retirées une fois le message parti.
 */
export interface Attachments {
  readonly open: AttachedNote | null;
  /** Le chemin de la note ouverte, si on l'a retirée. */
  readonly removed: string | null;
  readonly added: readonly AttachedNote[];
}

export const NO_ATTACHMENTS: Attachments = { open: null, removed: null, added: [] };

/** La note ouverte dans la colonne active est `note` : une autre que la précédente est jointe. */
export function openNoteFollowed(attachments: Attachments, note: AttachedNote | null): Attachments {
  if (note !== null && attachments.open?.path === note.path) {
    return { ...attachments, open: note };
  }
  return { ...attachments, open: note, removed: null };
}

/** Les notes jointes, dans l'ordre : la note ouverte d'abord, chacune une fois. */
export function attachedNotes({ open, removed, added }: Attachments): readonly AttachedNote[] {
  const shown = open === null || open.path === removed ? [] : [open];
  const others = added.filter((note) => !shown.some((first) => first.path === note.path));
  return [...shown, ...others];
}

/** `note` est jointe par « + » ; déjà jointe, rien ne change. */
export function noteAttached(attachments: Attachments, note: AttachedNote): Attachments {
  const already = attachedNotes(attachments).some((joined) => joined.path === note.path);
  return already ? attachments : { ...attachments, added: [...attachments.added, note] };
}

/** La note `path` est retirée par sa croix. */
export function noteDetached(attachments: Attachments, path: string): Attachments {
  return {
    ...attachments,
    removed: attachments.open?.path === path ? path : attachments.removed,
    added: attachments.added.filter((note) => note.path !== path),
  };
}

/** Le message est parti : les notes ajoutées par « + » sont retirées, la note ouverte reste jointe. */
export function attachmentsSent(attachments: Attachments): Attachments {
  return { ...attachments, added: [] };
}

/** Le message envoyé à Claude : le texte, puis les chemins des notes jointes, qu'il lit lui-même. */
export function messageWithNotes(text: string, notes: readonly AttachedNote[]): string {
  if (notes.length === 0) return text;
  const paths = notes.map((note) => `- ${note.path}`).join("\n");
  return `${text}\n\nNotes jointes (chemins depuis l'espace de travail) :\n${paths}`;
}

/** Le titre d'une note dont on ne connaît que le chemin : le nom de son fichier, sans `.md`. */
export function titleFromPath(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}
