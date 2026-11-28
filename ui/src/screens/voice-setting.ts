// Réglages, onglet « Saisie vocale » : la langue (par défaut celle du Mac), l'état de son modèle de langue, son
// téléchargement (« préparation », avec « Réessayer » en cas d'échec) ; le raccourci qui démarre et arrête la dictée
// et les bips (fiche 0109) ; le son reste sur le Mac (spécification § 7).
import type { VoiceLanguageItem } from "../bridge";
import { TapDetector, tapShortcutOf } from "../state/tap-shortcut";
import { macSymbols, recordKey } from "../state/voice-shortcut";

/** Ce que l'utilisateur peut demander depuis l'onglet : chacun est lancé par l'application, qui relit ensuite l'état. */
export interface VoiceSettingActions {
  /** Garde cette langue (`null` : revenir à la langue du Mac). */
  readonly choose: (language: string | null) => void;
  /** Prépare le modèle de cette langue (le télécharge s'il manque). */
  readonly prepare: (language: string) => void;
  /** Garde ce raccourci, écrit comme dans les menus (`Ctrl+Maj+D`) ; refusé avec un message s'il est pris ou invalide. */
  readonly chooseShortcut: (shortcut: string) => void;
  /** Revient au raccourci par défaut. */
  readonly resetShortcut: () => void;
  /** Garde le choix des bips au début et à la fin de la dictée. */
  readonly chooseBeeps: (beeps: boolean) => void;
}

/** Le raccourci et les bips choisis : montrés même quand le moteur ne peut pas servir. */
export interface VoiceChoices {
  /** Le raccourci, écrit comme dans les menus (`Ctrl+Maj+D`). */
  readonly shortcut: string;
  /** C'est le raccourci par défaut. */
  readonly defaultShortcut: boolean;
  readonly beeps: boolean;
  /** Pourquoi le dernier raccourci pressé est refusé. */
  readonly shortcutError: string | null;
}

/** Ce que l'onglet montre. */
export type VoiceSettingState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly languages: readonly VoiceLanguageItem[];
      /** La langue choisie ; `null` : celle du Mac. */
      readonly chosen: string | null;
      /** La langue utilisée (la choisie, sinon celle du Mac) ; `null` si le Mac n'en propose aucune. */
      readonly used: string | null;
      readonly usedName: string | null;
      /** La langue dont le modèle se prépare en ce moment. */
      readonly preparing: string | null;
      /** Le message du moteur quand la préparation a échoué. */
      readonly failure: string | null;
    };

export interface VoiceSetting {
  readonly element: HTMLElement;
  show(state: VoiceSettingState): void;
  /** Le raccourci et les bips ; la saisie du raccourci en cours est abandonnée. */
  showChoices(choices: VoiceChoices | null): void;
}

export const TITLE = "Saisie vocale";
const LOADING = "Lecture de l'état de la saisie vocale…";
const PRIVACY = "Le son reste sur le Mac : il est traité par macOS, jamais envoyé ni enregistré.";
const MAC_LANGUAGE = "La langue du Mac";
const NO_LANGUAGE = "Le Mac ne propose aucune langue de transcription.";
const READY = "prête";
const TO_DOWNLOAD = "à télécharger";
const PREPARING = "Préparation de la langue…";
const DOWNLOAD = "Télécharger le modèle de langue";
const RETRY = "Réessayer";
const SELECT_ID = "setting-voiceLanguage";
const SHORTCUT_ID = "setting-voiceShortcut";
const BEEPS_ID = "setting-voiceBeeps";
const SHORTCUT_LABEL = "Raccourci";
const SHORTCUT_HELP =
  "Démarre et arrête la dictée. Cliquez, puis pressez une touche ou une combinaison ; une touche de modificateur (⌘ ⌥ ⌃ ⇧, à gauche ou à droite) se choisit en la pressant puis en la relâchant ; Échap annule. La touche Fn n'est pas lisible par l'application.";
const RECORDING = "Appuyez sur la combinaison…";
const RESET = "Rétablir le raccourci par défaut";
const BEEPS_LABEL = "Bip au début et à la fin de la dictée";
const BEEPS_HELP = "Un court son quand le micro écoute, et un autre quand la dictée s'arrête.";

function paragraph(className: string, content = ""): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = content;
  return element;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "tool";
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

/** La liste : « La langue du Mac », puis chaque langue avec l'état de son modèle. */
function options(state: VoiceSettingState & { kind: "ready" }): HTMLOptionElement[] {
  const mac =
    state.chosen === null && state.usedName ? `${MAC_LANGUAGE} (${state.usedName})` : MAC_LANGUAGE;
  return [
    new Option(mac, ""),
    ...state.languages.map(
      (language) =>
        new Option(`${language.name} (${language.ready ? READY : TO_DOWNLOAD})`, language.id),
    ),
  ];
}

/** Ce que la prise des touches demande au contrôle du raccourci. */
interface Taking {
  readonly recording: () => boolean;
  readonly record: (on: boolean) => void;
  readonly choose: (shortcut: string) => void;
}

/**
 * Pendant la saisie, les touches sont prises ici : ni la barre des menus ni la fenêtre ne les voient (Échap ne ferme pas les
 * réglages). Une combinaison ou une touche de fonction est gardée à l'appui ; une touche de modificateur, pressée puis relâchée
 * seule (côté gauche ou droit, quelle que soit la durée), au relâchement.
 */
function takeKeys(key: HTMLElement, capture: TapDetector, taking: Taking): void {
  key.addEventListener("keydown", (event) => {
    if (!taking.recording()) return;
    event.preventDefault();
    event.stopPropagation();
    capture.keydown(event);
    const pressed = recordKey(event);
    if (pressed.kind === "waiting") return;
    taking.record(false);
    if (pressed.kind === "pressed") taking.choose(pressed.shortcut);
  });
  key.addEventListener("keyup", (event) => {
    if (!taking.recording()) return;
    event.preventDefault();
    event.stopPropagation();
    const tapped = capture.keyup(event);
    const written = tapped === null ? null : tapShortcutOf(tapped);
    if (written === null) return;
    taking.record(false);
    taking.choose(written);
  });
}

/** Le raccourci : sa touche (qui attend la combinaison au clic), « Rétablir… », l'aide, et le refus. */
function shortcutLine(actions: VoiceSettingActions) {
  const label = document.createElement("label");
  label.htmlFor = SHORTCUT_ID;
  label.textContent = SHORTCUT_LABEL;
  const key = document.createElement("button");
  key.type = "button";
  key.id = SHORTCUT_ID;
  key.className = "shortcut-key";
  key.setAttribute("aria-describedby", `${SHORTCUT_ID}-help`);
  const reset = button(RESET, () => actions.resetShortcut());
  const row = document.createElement("div");
  row.className = "shortcut-row";
  row.append(key, reset);
  const help = paragraph("setting-help", SHORTCUT_HELP);
  help.id = `${SHORTCUT_ID}-help`;
  const error = paragraph("setting-error");
  error.setAttribute("role", "alert");
  const line = document.createElement("div");
  line.className = "setting";
  line.append(label, row, help, error);
  let current = "";
  let recording = false;
  // La capture d'une touche seule : pressée puis relâchée sans autre touche entre les deux, quelle que soit la durée.
  const capture = new TapDetector(Number.POSITIVE_INFINITY);
  const paintKey = () => {
    const text = recording ? RECORDING : macSymbols(current);
    if (key.textContent !== text) key.textContent = text;
    key.classList.toggle("recording", recording);
    key.setAttribute("aria-pressed", String(recording));
    key.setAttribute(
      "aria-label",
      recording ? RECORDING : `${SHORTCUT_LABEL} : ${macSymbols(current)}`,
    );
  };
  const record = (on: boolean) => {
    // Sans changement, rien ne se redessine : le clic qui suit un `blur` serait perdu (WebKit) si le texte de la touche changeait entre le bouton enfoncé et relâché.
    if (recording === on) return;
    recording = on;
    // Chaque saisie repart de zéro : une touche restée enfoncée d'avant ne compte pas.
    capture.interrupt();
    paintKey();
    // Safari ne donne pas le focus à un bouton cliqué : sans lui, la combinaison pressée n'arriverait pas ici.
    if (on) key.focus();
  };
  takeKeys(key, capture, { recording: () => recording, record, choose: actions.chooseShortcut });
  key.addEventListener("click", () => record(!recording));
  key.addEventListener("blur", () => record(false));
  const show = (choices: VoiceChoices) => {
    current = choices.shortcut;
    record(false);
    paintKey();
    reset.hidden = choices.defaultShortcut;
    error.textContent = choices.shortcutError ?? "";
    error.hidden = choices.shortcutError === null;
  };
  return { line, show };
}

/** La case des bips, avec son aide. */
function beepsLine(actions: VoiceSettingActions) {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.id = BEEPS_ID;
  box.name = "voiceBeeps";
  box.setAttribute("aria-describedby", `${BEEPS_ID}-help`);
  box.addEventListener("change", () => actions.chooseBeeps(box.checked));
  const label = document.createElement("label");
  label.htmlFor = BEEPS_ID;
  label.textContent = BEEPS_LABEL;
  const help = paragraph("setting-help", BEEPS_HELP);
  help.id = `${BEEPS_ID}-help`;
  const line = document.createElement("div");
  line.className = "setting voice-beeps";
  line.append(box, label, help);
  return { line, show: (beeps: boolean) => void (box.checked = beeps) };
}

/** La partie « Saisie vocale » de l'écran de réglages. */
export function voiceGroup(actions: VoiceSettingActions): VoiceSetting {
  const legend = document.createElement("legend");
  legend.textContent = TITLE;
  const label = document.createElement("label");
  label.htmlFor = SELECT_ID;
  label.textContent = "Langue";
  const select = document.createElement("select");
  select.id = SELECT_ID;
  select.name = "voiceLanguage";
  select.addEventListener("change", () =>
    actions.choose(select.value === "" ? null : select.value),
  );
  const help = paragraph(
    "setting-help",
    "La langue dans laquelle vous parlez ; par défaut, celle du Mac.",
  );
  select.setAttribute("aria-describedby", "setting-voiceLanguage-help");
  help.id = "setting-voiceLanguage-help";
  const line = document.createElement("div");
  line.className = "setting";
  line.append(label, select, help);
  const status = document.createElement("p");
  status.className = "voice-status";
  status.setAttribute("role", "status");
  const failure = paragraph("setting-error");
  failure.setAttribute("role", "alert");
  const buttons = document.createElement("div");
  buttons.className = "favorites-actions";
  const shortcut = shortcutLine(actions);
  const beeps = beepsLine(actions);
  shortcut.line.hidden = true;
  beeps.line.hidden = true;
  const element = document.createElement("fieldset");
  element.append(
    ...[legend, line, status, failure, buttons, shortcut.line, beeps.line],
    paragraph("setting-help", PRIVACY),
  );
  const showChoices = (choices: VoiceChoices | null) => {
    shortcut.line.hidden = choices === null;
    beeps.line.hidden = choices === null;
    if (choices === null) return;
    shortcut.show(choices);
    beeps.show(choices.beeps);
  };
  const show = (state: VoiceSettingState) => {
    line.hidden = state.kind !== "ready";
    failure.hidden = true;
    buttons.replaceChildren();
    if (state.kind !== "ready") {
      status.textContent = state.kind === "loading" ? LOADING : state.message;
      return;
    }
    select.replaceChildren(...options(state));
    select.value = state.chosen ?? "";
    select.disabled = state.preparing !== null;
    showLanguage(state, { status, failure, buttons }, actions);
  };
  show({ kind: "loading" });
  return { element, show, showChoices };
}

/** L'état du modèle de la langue utilisée, et ce qu'on peut en faire : le télécharger, ou réessayer. */
function showLanguage(
  state: VoiceSettingState & { kind: "ready" },
  parts: { status: HTMLElement; failure: HTMLElement; buttons: HTMLElement },
  actions: VoiceSettingActions,
): void {
  const { used } = state;
  const language = state.languages.find((each) => each.id === used);
  if (used === null || language === undefined) {
    parts.status.textContent = NO_LANGUAGE;
    return;
  }
  if (state.preparing !== null) {
    parts.status.textContent = PREPARING;
    return;
  }
  parts.status.textContent = `${language.name} : ${language.ready ? READY : TO_DOWNLOAD}`;
  if (state.failure !== null) {
    parts.failure.textContent = state.failure;
    parts.failure.hidden = false;
  }
  if (!language.ready)
    parts.buttons.append(
      button(state.failure === null ? DOWNLOAD : RETRY, () => actions.prepare(used)),
    );
}
