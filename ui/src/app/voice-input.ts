// Saisie vocale (fiche 0103, spécification « saisie-vocale ») : le micro de la bande du haut, le texte du moteur
// écrit dans l'éditeur de la colonne active, les messages et l'onglet « Saisie vocale » des réglages.
// Les règles (ordre des événements, silence, texte provisoire fixé à l'arrêt) sont celles du moteur.
import type * as Bridge from "../bridge";
import type { VoiceEventItem, VoiceInputStatusItem, VoiceSettingsItem } from "../bridge";
import type { Dictation } from "../editor/voice/dictation";
import { microphoneButton, showMicrophone } from "../screens/microphone";
import type { Pane } from "../screens/note-pane";
import {
  type VoiceChoices,
  voiceGroup,
  type VoiceSetting,
  type VoiceSettingState,
} from "../screens/voice-setting";
import { type Columns, shownNote } from "../state/columns";
import { chooseShortcut } from "../state/commands";
import {
  DENIED_MESSAGE,
  levelOf,
  microphoneOf,
  OPEN_MACOS_SETTINGS,
  sessionAfter,
  type VoiceSession,
} from "../state/voice-input";
import { conflictOf } from "../state/voice-shortcut";
import type { OpenColumns } from "./columns";
import type { MessageAction, MessageKind } from "./messages";
import { type Beeper, createBeeper } from "./voice-beep";

export interface VoiceInputDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "voiceInputStatus"
    | "startVoiceInput"
    | "stopVoiceInput"
    | "onVoiceInputEvent"
    | "openVoicePrivacySettings"
    | "chooseVoiceLanguage"
    | "prepareVoiceLanguage"
    | "voiceInputSettings"
    | "chooseVoiceShortcut"
    | "chooseVoiceBeeps"
    | "errorMessage"
  >;
  readonly columns: Pick<OpenColumns, "activePane" | "current">;
  /** La barre de mise en forme, où est le micro. */
  readonly bar: HTMLElement;
  /** Les bips du début et de la fin ; ceux de Web Audio si rien n'est donné. */
  readonly beeper?: Beeper;
  show(message: string, kind?: MessageKind, action?: MessageAction): void;
  error(error: unknown): void;
  run(action: Promise<unknown>): void;
}

export interface VoiceInput {
  /** Le clic sur le micro, ou son raccourci : démarre l'écoute au curseur, ou l'arrête. */
  toggle(): void;
  /** Échap : arrête l'écoute en cours ; faux s'il n'y en avait pas. */
  escape(): boolean;
  /** Les colonnes ont changé : l'écoute s'arrête si l'on a changé de contenu. */
  follow(columns: Columns): void;
  /** Ce que montre la colonne active a changé : le micro se règle (éditeur de texte ou non). */
  refresh(): void;
  /** L'onglet « Saisie vocale » des réglages. */
  settingsGroups(): HTMLElement[];
}

/** Où écrit l'écoute en cours : l'éditeur de la colonne qui était active au départ, ou la zone de saisie de son cahier de recherche. */
interface Target {
  readonly pane: Pane;
  readonly column: number;
  readonly dictation: Dictation;
}

const RETRY = "Réessayer";
const ACTIVE: ReadonlySet<VoiceSession> = new Set(["starting", "preparing", "listening"]);

class VoiceInputGestures implements VoiceInput {
  private engine: VoiceInputStatusItem | null = null;
  private session: VoiceSession = "idle";
  private denied = false;
  private editable = false;
  private level = 0;
  private target: Target | null = null;
  /** Un échec est en cours : l'état du moteur est relu une fois l'écoute finie. */
  private failed = false;
  private setting: VoiceSetting | null = null;
  private preparing: string | null = null;
  private failure: string | null = null;
  /** Le raccourci et les bips choisis ; rien tant que la lecture n'a pas répondu. */
  private choices: VoiceSettingsItem | null = null;
  private shortcutError: string | null = null;
  /** L'écoute a commencé : la fin appelle son bip. */
  private heard = false;
  private readonly beeper: Beeper;
  private readonly ready: Promise<void>;

  constructor(private readonly deps: VoiceInputDeps) {
    this.beeper = deps.beeper ?? createBeeper(() => new AudioContext());
    deps.backend.onVoiceInputEvent((event) => this.handle(event)).catch(deps.error);
    this.ready = this.readStatus();
    void this.readChoices();
    // L'application passe à l'arrière-plan : l'écoute s'arrête (pas pendant la demande d'accès de macOS).
    window.addEventListener("blur", () => this.background());
    document.addEventListener("visibilitychange", () => document.hidden && this.background());
  }

  toggle(): void {
    // Le clic ou le raccourci est le geste qui permet au son de partir plus tard, à l'écoute.
    if (this.choices?.beeps) this.beeper.unlock();
    this.deps.run(this.press());
  }

  escape(): boolean {
    if (!ACTIVE.has(this.session)) return false;
    this.stop();
    return true;
  }

  refresh(): void {
    this.editable = this.deps.columns.activePane().dictation() !== null;
    this.paint();
  }

  follow(columns: Columns): void {
    const { target } = this;
    if (target === null) return;
    const column = columns.list.find((each) => each.id === target.column);
    const unchanged =
      column !== undefined &&
      columns.active === target.column &&
      shownNote(column) === target.pane.note();
    if (unchanged) return;
    // Le texte provisoire est fixé dans la note qu'on quitte, qui est encore montrée ; le moteur n'écrit plus rien.
    target.dictation.end();
    this.target = null;
    this.stop();
  }

  settingsGroups(): HTMLElement[] {
    const { run } = this.deps;
    const group = voiceGroup({
      choose: (language) => run(this.choose(language)),
      prepare: (language) => run(this.prepare(language)),
      chooseShortcut: (shortcut) => run(this.chooseShortcut(shortcut)),
      resetShortcut: () => run(this.chooseShortcut(null)),
      chooseBeeps: (beeps) => run(this.chooseBeeps(beeps)),
    });
    this.setting = group;
    this.showSetting();
    this.showChoices();
    run(this.readStatus());
    return [group.element];
  }

  private async press(): Promise<void> {
    if (this.session === "ending") return;
    if (ACTIVE.has(this.session)) return this.stop();
    await this.ready;
    if (this.denied) await this.readStatus();
    this.refresh();
    const microphone = microphoneOf(this.input());
    if (microphone.kind !== "unavailable") return this.start();
    if (microphone.enabled) return this.showDenied();
    this.deps.show(microphone.title, "info");
  }

  private async start(): Promise<void> {
    const { columns, backend } = this.deps;
    const pane = columns.activePane();
    const dictation = pane.dictation();
    if (dictation === null) return;
    this.target = { pane, column: columns.current().active, dictation };
    dictation.begin();
    this.session = "starting";
    this.paint();
    try {
      await backend.startVoiceInput();
    } catch (error) {
      dictation.drop();
      this.target = null;
      this.session = "idle";
      this.paint();
      this.deps.error(error);
    }
  }

  private stop(): void {
    if (!ACTIVE.has(this.session)) return;
    this.session = "ending";
    this.paint();
    this.deps.run(
      this.deps.backend.stopVoiceInput().catch((error: unknown) => {
        this.deps.error(error);
        return this.resync();
      }),
    );
  }

  /** L'arrêt demandé a échoué : le moteur dit s'il écoute encore. */
  private async resync(): Promise<void> {
    await this.readStatus();
    if (this.engine?.kind === "available" && this.engine.listening) this.session = "listening";
    else this.endListening();
    this.paint();
  }

  private background(): void {
    if (this.session === "listening") this.stop();
  }

  private handle(event: VoiceEventItem): void {
    this.session = sessionAfter(this.session, event);
    this.beep(event);
    this.show(event);
    this.paint();
  }

  /** Un bip quand le micro écoute, un autre quand la dictée finit après avoir écouté (silence et erreur compris). */
  private beep(event: VoiceEventItem): void {
    const wanted = this.choices?.beeps === true;
    if (event.kind === "listening" && !this.heard) {
      this.heard = true;
      if (wanted) this.beeper.play("start");
    } else if (event.kind === "ended") {
      if (this.heard && wanted) this.beeper.play("end");
      this.heard = false;
    }
  }

  /** Ce que chaque événement fait au-delà de l'état : écrire dans l'éditeur, dire un message, finir. */
  private show(event: VoiceEventItem): void {
    const dictation = this.target?.dictation;
    if (event.kind === "provisional") dictation?.provisional(event.text);
    else if (event.kind === "fixed") dictation?.fixed(event.text);
    else if (event.kind === "level") this.level = levelOf(event.value);
    else if (event.kind === "silence") this.deps.show(event.message, "info");
    else if (event.kind === "failed") this.fail(event.reason, event.message);
    else if (event.kind === "ended") this.endListening();
  }

  private endListening(): void {
    this.target?.dictation.end();
    this.target = null;
    this.session = "idle";
    this.level = 0;
    if (this.failed) {
      this.failed = false;
      this.deps.run(this.readStatus());
    }
  }

  /** Le moteur s'arrête sur une erreur : son message est montré tel quel, avec ce qu'on peut faire. */
  private fail(reason: string, message: string): void {
    this.failed = true;
    if (reason === "accessDenied") {
      this.denied = true;
      return this.showDenied(message);
    }
    const retry =
      reason === "languageDownload" ? { label: RETRY, run: () => this.start() } : undefined;
    this.deps.show(message, "error", retry);
  }

  private showDenied(message = DENIED_MESSAGE): void {
    const { backend } = this.deps;
    this.deps.show(message, "error", {
      label: OPEN_MACOS_SETTINGS,
      run: () => backend.openVoicePrivacySettings(),
    });
  }

  /** Relit ce que dit le moteur ; une erreur est montrée. */
  private readStatus(): Promise<void> {
    return this.deps.backend
      .voiceInputStatus()
      .then((status) => {
        this.engine = status;
        this.denied = status.kind === "available" && status.access === "denied";
        this.paint();
        this.showSetting();
      })
      .catch(this.deps.error);
  }

  /** Lit le raccourci et les bips choisis ; une erreur est montrée. */
  private readChoices(): Promise<void> {
    return this.deps.backend
      .voiceInputSettings()
      .then((choices) => this.applyChoices(choices))
      .catch(this.deps.error);
  }

  /** Les réglages gardés deviennent ceux de l'application : le raccourci partout (bulle, palette, menus), puis l'onglet. */
  private applyChoices(choices: VoiceSettingsItem): void {
    this.choices = choices;
    chooseShortcut("voice-input", choices.defaultShortcut ? null : choices.shortcut);
    this.paint();
    this.showChoices();
  }

  private showChoices(): void {
    const { choices } = this;
    const view: VoiceChoices | null =
      choices === null ? null : { ...choices, shortcutError: this.shortcutError };
    this.setting?.showChoices(view);
  }

  /** Garde le raccourci pressé (`null` : celui de départ), sauf s'il est pris ou invalide : le refus est dit dans l'onglet. */
  private async chooseShortcut(shortcut: string | null): Promise<void> {
    const conflict = shortcut === null ? null : conflictOf(shortcut);
    this.shortcutError = conflict;
    if (conflict === null) {
      try {
        this.applyChoices(await this.deps.backend.chooseVoiceShortcut(shortcut));
        return;
      } catch (error) {
        this.shortcutError = this.deps.backend.errorMessage(error);
      }
    }
    this.showChoices();
  }

  private async chooseBeeps(beeps: boolean): Promise<void> {
    // La case cochée est un geste : le son pourra partir à l'écoute.
    if (beeps) this.beeper.unlock();
    try {
      this.applyChoices(await this.deps.backend.chooseVoiceBeeps(beeps));
    } catch (error) {
      this.deps.error(error);
      this.showChoices();
    }
  }

  private async choose(language: string | null): Promise<void> {
    try {
      await this.deps.backend.chooseVoiceLanguage(language);
    } catch (error) {
      this.deps.error(error);
    }
    await this.readStatus();
  }

  private async prepare(language: string): Promise<void> {
    this.preparing = language;
    this.failure = null;
    this.showSetting();
    try {
      await this.deps.backend.prepareVoiceLanguage(language);
    } catch (error) {
      this.failure = this.deps.backend.errorMessage(error);
    }
    this.preparing = null;
    await this.readStatus();
  }

  private showSetting(): void {
    const state = this.settingState();
    this.setting?.show(state);
  }

  private settingState(): VoiceSettingState {
    const { engine } = this;
    if (engine === null) return { kind: "loading" };
    if (engine.kind === "unavailable") return { kind: "unavailable", message: engine.message };
    return {
      kind: "ready",
      languages: engine.languages,
      chosen: engine.usingMacLanguage ? null : engine.language,
      used: engine.language,
      usedName: engine.languageName,
      preparing: this.preparing,
      failure: this.failure,
    };
  }

  private input() {
    return {
      engine: this.engine,
      session: this.session,
      denied: this.denied,
      editable: this.editable,
    };
  }

  private paint(): void {
    const button = microphoneButton(this.deps.bar);
    if (button) showMicrophone(button, microphoneOf(this.input()), this.level);
  }
}

/** Branche la saisie vocale : les événements du moteur, son état, le micro. */
export function createVoiceInput(deps: VoiceInputDeps): VoiceInput {
  return new VoiceInputGestures(deps);
}
