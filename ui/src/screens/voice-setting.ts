// Réglages, onglet « Saisie vocale » : la langue (par défaut celle du Mac), l'état de son modèle de langue, son
// téléchargement (« préparation », avec « Réessayer » en cas d'échec) ; le son reste sur le Mac (spécification § 7).
import type { VoiceLanguageItem } from "../bridge";

/** Ce que l'utilisateur peut demander depuis l'onglet : chacun est lancé par l'application, qui relit ensuite l'état. */
export interface VoiceSettingActions {
  /** Garde cette langue (`null` : revenir à la langue du Mac). */
  readonly choose: (language: string | null) => void;
  /** Prépare le modèle de cette langue (le télécharge s'il manque). */
  readonly prepare: (language: string) => void;
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
  const element = document.createElement("fieldset");
  element.append(legend, line, status, failure, buttons, paragraph("setting-help", PRIVACY));
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
  return { element, show };
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
