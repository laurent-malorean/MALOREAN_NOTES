// Onglets de conversation de la colonne Claude Code : ceux de chaque espace de travail, par son
// dossier, et le tour qui court (un seul à la fois, tous onglets confondus), avec l'onglet qui l'a
// lancé, à qui vont ses événements même quand un autre est montré (fiche 0032).
import {
  type ConversationTab,
  type ConversationTabs,
  NO_CONVERSATION_TABS,
  tabUpdated,
} from "../state/claude-tabs";

/** Un onglet de conversation : son espace de travail et son identifiant. */
export interface TabPlace {
  readonly workspace: string;
  readonly tab: number;
}

/** Où court le tour (l'onglet de conversation qui l'a lancé), et depuis quand. */
export interface RunningTurn extends TabPlace {
  readonly since: number;
}

export interface ConversationTabsKeeper {
  /** Les onglets de l'espace de travail ouvert. */
  shown(): ConversationTabs;
  /** Le tour qui court, s'il y en a un. */
  turn(): RunningTurn | null;
  /** Depuis quand court le tour de l'onglet `id` de l'espace de travail ouvert ; rien s'il ne répond pas. */
  runningSince(id: number): number | null;
  /** Les onglets de l'espace de travail ouvert changent par `change`. */
  changeShown(change: (tabs: ConversationTabs) => ConversationTabs): void;
  /** L'onglet `at` change par `change`, même s'il n'est pas montré ; fermé, rien ne change. */
  changeTab(at: TabPlace, change: (tab: ConversationTab) => ConversationTab): void;
  /** Un tour commence dans l'onglet `at`, ou le tour est fini (`null`). */
  started(at: RunningTurn | null): void;
  /** Oublie toutes les conversations : chaque espace de travail repart d'un onglet vide. */
  forget(): void;
}

/** `here` : le dossier de l'espace de travail ouvert ; `changed` : à chaque changement. */
export function createConversationTabsKeeper(
  here: () => string,
  changed: () => void,
): ConversationTabsKeeper {
  const byWorkspace = new Map<string, ConversationTabs>();
  let turn: RunningTurn | null = null;
  const tabsOf = (workspace: string) => byWorkspace.get(workspace) ?? NO_CONVERSATION_TABS;
  const change = (workspace: string, next: (tabs: ConversationTabs) => ConversationTabs) => {
    byWorkspace.set(workspace, next(tabsOf(workspace)));
    changed();
  };
  return {
    shown: () => tabsOf(here()),
    turn: () => turn,
    runningSince: (id) => (turn?.workspace === here() && turn.tab === id ? turn.since : null),
    changeShown: (next) => change(here(), next),
    changeTab: (at, next) => change(at.workspace, (tabs) => tabUpdated(tabs, at.tab, next)),
    started: (at) => {
      turn = at;
    },
    forget: () => {
      byWorkspace.clear();
      changed();
    },
  };
}
