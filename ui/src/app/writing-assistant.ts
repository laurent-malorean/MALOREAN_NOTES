// Aide à l'écriture : demande à l'assistant d'écriture (le modèle d'IA du Mac, par Rust) de
// corriger, reformuler ou résumer la sélection, montre sa proposition, et ne change la note
// qu'avec l'accord de l'utilisateur. Le clic droit sur une sélection ouvre le menu de la
// sélection ; Alt+clic droit, ou sans sélection, laisse le menu du Mac (fiche 0031).
import type { MessageKind } from "./messages";
import type * as Bridge from "../bridge";
import type { AssistantStatus, WritingActionItem } from "../bridge";
import type { AppIcon } from "../screens/app-icons";
import { showContextMenu } from "../screens/context-menu";
import type { Layout } from "../screens/layout";
import type { Pane } from "../screens/note-pane";
import { showProposal } from "../screens/proposal-view";
import {
  insertionBelow,
  noSelection,
  SELECTION_CHANGED,
  WRITING_ACTION,
  WRITING_ACTIONS,
  type WritingActionDef,
} from "../state/writing-assist";
import type { OpenColumns } from "./columns";

/** Le dessin de chaque action dans le menu de la sélection. */
const WRITING_ICONS: Readonly<Record<WritingActionItem, AppIcon>> = {
  correct: "correct",
  rephrase: "rewrite",
  summarize: "lines",
};

export interface WritingAssistantDeps {
  readonly backend: Pick<typeof Bridge, "assistantStatus" | "proposeRewriting">;
  readonly columns: Pick<OpenColumns, "activePane" | "panes">;
  /** Les colonnes, où l'on fait un clic droit, et la fenêtre de la proposition. */
  readonly layout: Pick<Layout, "columns" | "confirmation">;
  /** Montre un message quelques secondes. */
  show(message: string, kind?: MessageKind): void;
  error(error: unknown): void;
}

export interface WritingAssistance {
  /** Si l'assistant d'écriture peut répondre, demandé une fois au lancement. */
  readonly status: Promise<AssistantStatus>;
  /** Propose l'action pour la sélection de la colonne active. */
  propose(action: WritingActionItem): void;
}

/** Sous les choix du menu de la sélection : comment retrouver le menu du Mac. */
export const MAC_MENU_HINT = "Alt+clic droit : menu du Mac (outils d'écriture d'Apple)";
export const CHECKING = "Recherche de l'assistant d'écriture…";
export const NOT_ANSWERING = "l'assistant d'écriture ne répond pas";

/** Le texte de la note est-il encore celui qui a été envoyé ? */
function unchanged(pane: Pane, note: string | null, from: number, to: number, text: string) {
  return pane.note() === note && pane.editor.content().slice(from, to) === text;
}

/** Montre la proposition pour la sélection de `pane`, et l'applique si on l'accepte. */
function proposeIn(deps: WritingAssistantDeps, pane: Pane, action: WritingActionDef) {
  const { editor } = pane;
  const text = editor.selectedText();
  if (text.trim() === "") return deps.show(noSelection(action), "info");
  const { from, to } = editor.selectedRange();
  const note = pane.note();
  const accepted = (change: (proposal: string) => void) => (proposal: string) => {
    if (!unchanged(pane, note, from, to, text)) return deps.show(SELECTION_CHANGED, "warning");
    change(proposal);
    editor.focus();
  };
  showProposal(deps.layout.confirmation, {
    action: action.label,
    proposal: deps.backend.proposeRewriting(action.action, text),
    replace: accepted((proposal) => editor.replaceRange(from, to, proposal)),
    insertBelow: accepted((proposal) => {
      const { at, insert } = insertionBelow(editor.content(), from, to, proposal);
      editor.replaceRange(at, at, insert);
    }),
    error: deps.error,
  });
}

export function createWritingAssistant(deps: WritingAssistantDeps): WritingAssistance {
  let known: AssistantStatus | null = null;
  const status = deps.backend.assistantStatus().then(
    (answer) => (known = answer),
    (error: unknown): AssistantStatus => {
      deps.error(error);
      return (known = { kind: "unavailable", reason: NOT_ANSWERING });
    },
  );
  /** Rien si l'assistant peut répondre (ou si on ne le sait pas encore) ; sinon pourquoi. */
  const refusal = () => (known?.kind === "unavailable" ? known.reason : null);
  const run = (pane: Pane, action: WritingActionDef) => {
    const reason = refusal();
    if (reason === null) proposeIn(deps, pane, action);
    else deps.show(reason, "error");
  };
  deps.layout.columns.addEventListener("contextmenu", (event) => {
    if (event.altKey) return;
    const pane = [...deps.columns.panes().values()].find((p) => p.editor.owns(event.target));
    if (pane === undefined || pane.editor.selectedText() === "") return;
    event.preventDefault();
    const ready = known?.kind === "available";
    const why = known === null ? CHECKING : refusal();
    showContextMenu(
      event.clientX,
      event.clientY,
      WRITING_ACTIONS.map((action) => ({
        label: action.label,
        icon: WRITING_ICONS[action.action],
        disabled: !ready,
        run: () => run(pane, action),
      })),
      why === null ? MAC_MENU_HINT : `${why}\n${MAC_MENU_HINT}`,
    );
  });
  return {
    status,
    propose: (action) => {
      const pane = deps.columns.activePane();
      if (pane.note() !== null) run(pane, WRITING_ACTION[action]);
    },
  };
}
