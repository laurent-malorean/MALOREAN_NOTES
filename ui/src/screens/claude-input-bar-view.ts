// Barre de saisie de la colonne Claude Code : sous la zone du message, des pastilles cliquables,
// comme Claude Code dans VS Code — modèle de Claude et niveau d'effort (un clic ouvre leur choix),
// sous-agents en cours (un clic déplie la carte des agents), durée de la réponse, notes jointes
// (une croix pour retirer, « + » pour en joindre) (fiche 0032).
import type { TurnSettingsItem } from "../bridge";
import type { AgentMap } from "../state/agent-map";
import {
  type AttachedNote,
  EFFORTS,
  elapsedText,
  MODELS,
  runningAgentsText,
  type SettingChoice,
  settingsText,
} from "../state/claude-input-bar";

export interface InputBarHandlers {
  /** Le modèle ou le niveau d'effort choisi : les réglages deviennent `settings`. */
  chooseSettings(settings: TurnSettingsItem): void;
  /** Déplie la carte des agents. */
  showAgentMap(): void;
  /** Fait choisir une note à joindre. */
  attach(): void;
  /** Retire la note jointe `path`. */
  detach(path: string): void;
}

export interface InputBarView {
  showSettings(settings: TurnSettingsItem): void;
  /** Le nombre de sous-agents en cours ; la pastille se cache quand aucun ne travaille. */
  showAgents(map: AgentMap): void;
  /** La durée de la réponse en cours ; rien hors d'un tour. */
  showElapsed(elapsedMs: number | null): void;
  showAttachments(notes: readonly AttachedNote[]): void;
}

export const SETTINGS_TITLE = "Choisir le modèle de Claude et le niveau d'effort";
export const DEFAULT_CHOICE = "Par défaut";

function button(className: string, text: string, title: string): HTMLButtonElement {
  const created = document.createElement("button");
  created.type = "button";
  created.className = className;
  created.textContent = text;
  created.title = title;
  return created;
}

/** Un groupe du choix des réglages : son nom, « Par défaut », puis chaque choix, l'actuel coché. */
function group<T>(
  name: string,
  choices: readonly SettingChoice<T>[],
  current: T | null,
  choose: (value: T | null) => void,
): HTMLElement {
  const section = document.createElement("div");
  section.className = "claude-settings-group";
  section.setAttribute("role", "group");
  section.setAttribute("aria-label", name);
  const heading = document.createElement("span");
  heading.className = "claude-settings-heading";
  heading.textContent = name;
  section.append(heading);
  for (const { value, label } of [{ value: null, label: DEFAULT_CHOICE }, ...choices]) {
    const item = button("claude-settings-choice", label, label);
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(value === current));
    item.addEventListener("click", () => choose(value));
    section.append(item);
  }
  return section;
}

/**
 * La pastille des réglages et leur choix, ajoutés à `chips` ; rend la fonction qui montre les
 * réglages. Un clic ailleurs ou Échap ferme le choix.
 */
function settingsPicker(
  chips: HTMLElement,
  choose: InputBarHandlers["chooseSettings"],
): (settings: TurnSettingsItem) => void {
  let settings: TurnSettingsItem = { model: null, effort: null };
  const chip = button("claude-chip claude-settings-chip", "", SETTINGS_TITLE);
  chip.setAttribute("aria-haspopup", "menu");
  chip.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "claude-settings-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", SETTINGS_TITLE);
  menu.hidden = true;
  chips.append(chip, menu);
  const fillMenu = () =>
    menu.replaceChildren(
      group("Modèle", MODELS, settings.model, (model) => choose({ ...settings, model })),
      group("Effort", EFFORTS, settings.effort, (effort) => choose({ ...settings, effort })),
    );
  const showMenu = (open: boolean) => {
    menu.hidden = !open;
    chip.setAttribute("aria-expanded", String(open));
  };
  chip.addEventListener("click", () => showMenu(menu.hidden === true));
  document.addEventListener("mousedown", (event) => {
    const target = event.target as Node;
    if (!menu.contains(target) && !chip.contains(target)) showMenu(false);
  });
  chips.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menu.hidden) return;
    showMenu(false);
    chip.focus();
  });
  fillMenu();
  return (next) => {
    settings = next;
    chip.textContent = settingsText(next);
    fillMenu();
  };
}

/** La pastille d'une note jointe : son titre, et une croix pour la retirer. */
function attachedChip({ path, title }: AttachedNote, detach: (path: string) => void) {
  const chip = document.createElement("span");
  chip.className = "claude-chip claude-attached-note";
  chip.title = path;
  const name = document.createElement("span");
  name.className = "claude-attached-title";
  name.textContent = title;
  const remove = button("claude-detach", "×", `Retirer « ${title} » du message`);
  remove.setAttribute("aria-label", `Retirer « ${title} » du message`);
  remove.addEventListener("click", () => detach(path));
  chip.append(name, remove);
  return chip;
}

/** Remplit `chips` (la rangée de pastilles de la barre de saisie) et branche ses clics. */
export function createInputBarView(chips: HTMLElement, handlers: InputBarHandlers): InputBarView {
  const showSettings = settingsPicker(chips, (settings) => handlers.chooseSettings(settings));
  const agentsChip = button("claude-chip claude-agents-chip", "", "Montrer la carte des agents");
  agentsChip.hidden = true;
  const elapsed = document.createElement("span");
  elapsed.className = "claude-chip claude-elapsed";
  elapsed.title = "Durée de la réponse";
  elapsed.hidden = true;
  const attached = document.createElement("span");
  attached.className = "claude-attachments";
  const attach = button("claude-chip claude-attach", "+", "Joindre une note");
  attach.setAttribute("aria-label", "Joindre une note");
  chips.append(agentsChip, elapsed, attached, attach);
  agentsChip.addEventListener("click", () => handlers.showAgentMap());
  attach.addEventListener("click", () => handlers.attach());
  return {
    showSettings,
    showAgents: (map) => {
      const text = runningAgentsText(map);
      agentsChip.hidden = text === null;
      agentsChip.textContent = text ?? "";
    },
    showElapsed: (elapsedMs) => {
      elapsed.hidden = elapsedMs === null;
      elapsed.textContent = elapsedMs === null ? "" : elapsedText(elapsedMs);
    },
    showAttachments: (notes) =>
      attached.replaceChildren(
        ...notes.map((note) => attachedChip(note, (path) => handlers.detach(path))),
      ),
  };
}
