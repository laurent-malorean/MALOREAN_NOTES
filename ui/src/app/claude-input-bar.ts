// Barre de saisie de la colonne Claude Code : les réglages du tour (gardés d'un lancement à
// l'autre), les notes jointes (la note de la colonne active, celles choisies par « + »), la durée
// de la réponse en cours et la charge annoncée par Claude Code (version du modèle et remplissage du
// contexte de l'onglet de conversation montré, limite d'utilisation commune) (fiche 0032).
import type * as Bridge from "../bridge";
import type { InputBarView } from "../screens/claude-input-bar-view";
import { openPicker } from "../screens/picker";
import {
  type AttachedNote,
  type Attachments,
  attachedNotes,
  attachmentsSent,
  loadTurnSettings,
  NO_ATTACHMENTS,
  noteAttached,
  noteDetached,
  openNoteFollowed,
  saveTurnSettings,
  titleFromPath,
} from "../state/claude-input-bar";
import {
  type ClaudeLoad,
  loadEventReceived,
  NO_LOAD,
  type UsageLimits,
} from "../state/claude-load";
import { activeColumn, type Columns } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { matchingNotes } from "../state/quick-open";

export interface InputBarDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes">;
  readonly picker: HTMLDialogElement;
  /** Les colonnes d'édition : la note de la colonne active est jointe au message. */
  readonly columns: { current(): Columns };
  /** Là où les réglages du tour sont gardés d'un lancement à l'autre. */
  readonly storage: PreferenceStorage;
  /** Quand a commencé le tour de l'onglet de conversation montré ; rien s'il ne répond pas. */
  replyingSince(): number | null;
  error(error: unknown): void;
}

/** Ce que la vue de la colonne montre de la barre de saisie, et où remettre le curseur. */
export type InputBarShown = Omit<InputBarView, "showAgents"> & { focus(): void };

export interface InputBar {
  /** Le modèle et le niveau d'effort à passer au tour. */
  settings(): Bridge.TurnSettingsItem;
  chooseSettings(settings: Bridge.TurnSettingsItem): void;
  /** Fait choisir une note à joindre, comme à l'ouverture rapide. */
  attach(): void;
  detach(path: string): void;
  /** Le message part : rend les notes jointes, et retire celles jointes par « + ». */
  sent(): readonly AttachedNote[];
  /** Suit la note de la colonne active ; un autre espace de travail oublie les notes jointes. */
  follow(workspaceChanged: boolean): void;
  /**
   * Un événement de Claude est arrivé : il annonce peut-être la limite de l'abonnement, montrée au
   * prochain `showConversation` (la colonne le fait à chaque événement d'un tour).
   */
  heard(event: Bridge.ClaudeEventItem): void;
  /**
   * Montre le modèle et le contexte de l'onglet de conversation montré (`load`), avec la limite
   * commune, et la durée de la réponse si c'est lui qui répond.
   */
  showConversation(load: ClaudeLoad): void;
}

/** Le temps entre deux mises à jour de la durée de la réponse. */
const SECOND = 1000;
/** Le temps entre deux mises à jour du temps avant la remise à zéro de la limite d'utilisation. */
const MINUTE = 60 * SECOND;

/** La note de la colonne active, avec le titre de son onglet (le nom de son fichier à défaut). */
function openNote(columns: Columns): AttachedNote | null {
  const column = activeColumn(columns);
  const tab = column.tabs.find(({ id }) => id === column.activeTab);
  return tab === undefined ? null : { path: tab.note, title: tab.title ?? titleFromPath(tab.note) };
}

/** La durée de la réponse, montrée seulement sur l'onglet de conversation qui répond (`since`). */
const elapsedShower = (view: () => InputBarShown, since: () => number | null) => () => {
  const started = since();
  view().showElapsed(started === null ? null : Date.now() - started);
};

/** La barre de saisie, montrée par `view` (créée après elle, d'où la fonction). */
export function createInputBar(deps: InputBarDeps, view: () => InputBarShown): InputBar {
  let settings = loadTurnSettings(deps.storage);
  let attachments: Attachments = NO_ATTACHMENTS;
  let limits: UsageLimits | null = null;
  let shown: ClaudeLoad = NO_LOAD;
  const showLoad = () => view().showLoad({ ...shown, limits }, Date.now());
  const showElapsed = elapsedShower(view, deps.replyingSince);
  setInterval(showLoad, MINUTE);
  setInterval(showElapsed, SECOND);
  const attach = (next: Attachments) => {
    attachments = next;
    view().showAttachments(attachedNotes(next));
  };
  const chooseNote = async () => {
    const notes = await deps.backend.listAllNotes();
    openPicker(deps.picker, {
      label: "Joindre une note",
      placeholder: "Titre de la note",
      empty: "Aucune note ne correspond",
      entries: (query) => matchingNotes(notes, query),
      describe: (note) => ({ label: note.title, detail: note.folder }),
      choose: ({ path, title }) => (
        attach(noteAttached(attachments, { path, title })),
        view().focus()
      ),
    });
  };
  return {
    settings: () => settings,
    chooseSettings: (next) => {
      settings = next;
      saveTurnSettings(deps.storage, next);
      view().showSettings(next);
    },
    attach: () => void chooseNote().catch(deps.error),
    detach: (path) => attach(noteDetached(attachments, path)),
    sent: () => {
      const notes = attachedNotes(attachments);
      attach(attachmentsSent(attachments));
      return notes;
    },
    follow: (workspaceChanged) =>
      attach(
        openNoteFollowed(
          workspaceChanged ? NO_ATTACHMENTS : attachments,
          openNote(deps.columns.current()),
        ),
      ),
    heard: (event) => {
      limits = loadEventReceived({ ...NO_LOAD, limits }, event).limits;
    },
    showConversation: (load) => {
      shown = load;
      showLoad();
      showElapsed();
    },
  };
}
