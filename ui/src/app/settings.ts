// Réglages : la fenêtre qui les change, et l'affichage qui les suit, comme le clair ou sombre du Mac.
import type { Editor } from "../editor/editor";
import { showDisplay } from "../screens/display";
import { openSettings } from "../screens/settings-view";
import type { PreferenceStorage } from "../state/focus-preference";
import { loadSettings, saveSettings, type Settings } from "../state/settings";
import { SETTINGS_TABS, saveSettingsTab } from "../state/settings-tabs";
import type { OpenColumns } from "./columns";

export interface SettingsParts {
  /** L'élément racine de l'interface (`html`), qui porte les réglages d'affichage. */
  readonly documentElement: HTMLElement;
  readonly settings: HTMLDialogElement;
  readonly settingsButton: HTMLElement;
}

/** Ce que l'on sait de l'apparence du Mac : sombre ou non, et quand elle change. */
export interface SystemAppearance {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

/** Une partie de l'écran de réglages qui gère elle-même ses réglages : les modèles, le journal, le sens. */
export interface SettingsGroups {
  settingsGroups(): readonly HTMLElement[];
}

export interface SettingsDeps {
  readonly columns: Pick<OpenColumns, "panes">;
  /** Où les réglages sont gardés d'une session à l'autre. */
  readonly storage: PreferenceStorage;
  readonly systemDark: SystemAppearance;
  /** Qui donne des parties de plus à la fenêtre des réglages, faites à chaque ouverture, dans cet ordre. */
  readonly groups: () => readonly SettingsGroups[];
}

export interface AppSettings {
  /** Ouvre la fenêtre des réglages. */
  open(): void;
  /** Ouvre la fenêtre des réglages sur l'onglet de ce nom (« Index »…) ; un nom inconnu laisse le dernier onglet. */
  openTab(name: string): void;
  /** Règle l'éditeur d'une nouvelle colonne sur les réglages en cours. */
  configure(editor: Editor): void;
}

/** Relie le bouton des réglages, et applique les réglages gardés. */
export function connectSettings(parts: SettingsParts, deps: SettingsDeps): AppSettings {
  let settings = loadSettings(deps.storage);
  const showSettingsDisplay = () =>
    showDisplay(parts.documentElement, settings, deps.systemDark.matches);
  const apply = (next: Settings) => {
    settings = next;
    deps.columns
      .panes()
      .forEach((pane) => pane.editor.setCharactersPerPage(next.charactersPerPage));
    showSettingsDisplay();
    saveSettings(deps.storage, next);
  };
  // En apparence automatique, l'application suit le Mac quand il passe de clair à sombre.
  deps.systemDark.addEventListener("change", showSettingsDisplay);
  const open = () => {
    const extra = deps.groups().flatMap((source) => source.settingsGroups());
    openSettings(parts.settings, settings, apply, extra, deps.storage);
  };
  const openTab = (name: string) => {
    const index = SETTINGS_TABS.findIndex((tab) => tab.name === name);
    if (index >= 0) saveSettingsTab(deps.storage, index);
    open();
  };
  parts.settingsButton.addEventListener("click", open);
  apply(settings);
  return {
    open,
    openTab,
    configure: (editor) => editor.setCharactersPerPage(settings.charactersPerPage),
  };
}
