import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeEventItem, ClaudeStatusItem, TurnSettingsItem } from "../bridge";
import type { Columns } from "../state/columns";
import { createLayout, type Layout } from "../screens/layout";
import { CHECKING_CLAUDE, EMPTY } from "../screens/claude-column-view";
import { ALLOW_CHANGES_MESSAGE } from "../state/claude-column";
import { NO_SETTINGS } from "../state/claude-input-bar";
import { type ClaudeColumn, createClaudeColumn } from "./claude-column";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const READY: ClaudeStatusItem = { kind: "ready", email: "moi@example.com", organization: "Moi" };

let layout: Layout;
let column: ClaudeColumn;
let log: string[];
let status: Promise<ClaudeStatusItem>;
let turn: { resolve: () => void; reject: (error: unknown) => void };
let announce: (event: ClaudeEventItem) => void;
let workspacePath: string;
let columns: Columns;
let stored: Map<string, string>;
let sentSettings: TurnSettingsItem[];
let changesAllowed: boolean[];

const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
  removeItem: (key: string) => void stored.delete(key),
};

/** Une seule colonne, qui montre la note `path` (titre de l'onglet `title`), ou aucune. */
const showing = (path: string | null, title: string | null = null): Columns => ({
  list: [
    {
      id: 0,
      tabs: path === null ? [] : [{ id: 1, note: path, title }],
      activeTab: path === null ? null : 1,
      width: 1,
    },
  ],
  active: 0,
  nextId: 2,
});

function createColumn() {
  return createClaudeColumn({
    backend: {
      claudeStatus: () => (log.push("vérifier"), status),
      sendToClaude: (message, settings, allowed) =>
        new Promise((resolve, reject) => {
          log.push(`envoyer ${message}`);
          sentSettings.push(settings);
          changesAllowed.push(allowed);
          turn = { resolve: () => resolve(null), reject };
        }),
      stopClaude: async () => (log.push("arrêter"), null),
      newConversation: async () => (log.push("oublier"), null),
      onClaudeEvent: async (handler) => ((announce = handler), () => {}),
      errorMessage: (error) => String((error as { message: string }).message),
      listAllNotes: async () => [
        { path: "a.md", title: "Alpha", folder: "" },
        { path: "Projets/plan.md", title: "Plan", folder: "Projets" },
      ],
      logOutOfClaude: async () => (log.push("déconnecter"), null),
      logInToClaude: async () => (log.push("connecter"), null),
      onClaudeSignIn: async () => () => {},
      copyPlainText: async () => null,
    },
    layout,
    workspace: { path: () => workspacePath },
    columns: { current: () => columns },
    storage,
    openNote: (path) => log.push(`ouvrir ${path}`),
    error: (error) => log.push(`erreur ${String(error)}`),
  });
}

const find = <T extends HTMLElement>(selector: string) =>
  layout.claudeColumn.querySelector(selector) as T;
const shown = () => [...find(".claude-conversation").children].map((e) => e.textContent);
const unavailable = () => find(".claude-unavailable");

function send(text: string) {
  find<HTMLTextAreaElement>(".claude-input").value = text;
  find<HTMLButtonElement>("[data-send]").click();
}

beforeEach(() => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  layout = createLayout(root);
  layout.mainArea.hidden = false;
  log = [];
  status = Promise.resolve(READY);
  workspacePath = "/Users/moi/Notes";
  columns = showing(null);
  stored = new Map();
  sentSettings = [];
  changesAllowed = [];
  column = createColumn();
});

afterEach(() => vi.useRealTimers());

describe("colonne Claude Code : affichée ou masquée", () => {
  it("cachée au départ ; sa commande et son bouton l'affichent puis la masquent", async () => {
    expect(layout.claudeColumn.hidden).toBe(true);
    column.toggle();
    expect(layout.claudeColumn.hidden).toBe(false);
    expect(layout.claudeButton.getAttribute("aria-pressed")).toBe("true");
    layout.claudeButton.click();
    expect(layout.claudeColumn.hidden).toBe(true);
    expect(layout.claudeButton.getAttribute("aria-pressed")).toBe("false");
    column.toggle();
    find<HTMLButtonElement>("[data-close]").click();
    expect(layout.claudeColumn.hidden).toBe(true);
    await settle();
    expect(log).toEqual(["vérifier", "vérifier"]);
  });

  it("à chaque ouverture, vérifie la connexion puis met le curseur dans la zone du message", async () => {
    let answer: (status: ClaudeStatusItem) => void = () => {};
    status = new Promise((resolve) => (answer = resolve));
    column.toggle();
    expect(unavailable().textContent).toBe(CHECKING_CLAUDE);
    expect(CHECKING_CLAUDE).toBe("Vérification de Claude Code…");
    answer(READY);
    await settle();
    expect(unavailable().hidden).toBe(true);
    expect(document.activeElement).toBe(find(".claude-input"));
  });

  it("Claude Code indisponible : la colonne dit pourquoi et quoi faire", async () => {
    status = Promise.resolve({ kind: "unavailable", reason: "tapez « claude auth login »" });
    column.toggle();
    await settle();
    expect(unavailable().hidden).toBe(false);
    expect(unavailable().textContent).toBe("tapez « claude auth login »");
    expect(find<HTMLTextAreaElement>(".claude-input").disabled).toBe(true);
  });

  it("une vérification en échec est montrée comme une raison", async () => {
    status = Promise.reject({ message: "commande inconnue" });
    column.toggle();
    await settle();
    expect(unavailable().textContent).toBe("commande inconnue");
  });
});

describe("colonne Claude Code : un tour", () => {
  it("vide au départ, elle dit ce qu'on peut demander", () => {
    expect(shown()).toEqual([EMPTY]);
  });

  it("met en forme le Markdown de Claude, sans charger ses images", async () => {
    send("Bonjour");
    announce({ kind: "message", agent: null, text: "**Fait** ![vue](vue.png)" });
    await expect.poll(() => find(".claude-reply strong")?.textContent).toBe("Fait");
    expect(find(".claude-reply img").getAttribute("src")).toBe("");
  });

  it("envoie le message, montre la réponse au fil de l'eau, puis le bilan", async () => {
    column.toggle();
    await settle();
    send("Range mes notes");
    expect(log).toContain("envoyer Range mes notes");
    expect(shown()).toEqual(["Range mes notes", "Claude travaille…"]);
    announce({
      kind: "actionStarted",
      agent: null,
      id: "w",
      action: "write",
      tool: null,
      target: "/Users/moi/Notes/plan.md",
    });
    announce({ kind: "actionFinished", id: "w", succeeded: true });
    announce({ kind: "changedNote", path: "plan.md" });
    announce({ kind: "summary", failure: null, durationMs: 3000, tokens: 40 });
    turn.resolve();
    await settle();
    expect(shown()).toEqual([
      "Range mes notes",
      "Écritureplan.md",
      "Note modifiée : plan.md",
      "3 s · 40 jetons",
    ]);
    find<HTMLButtonElement>(".claude-note-link").click();
    expect(log.at(-1)).toBe("ouvrir plan.md");
  });

  it("des modifications retenues après une lecture du web s'autorisent d'un clic, pour un tour", async () => {
    columns = showing("Projets/plan.md", "Plan");
    column.follow();
    send("Cherche et note");
    announce({
      kind: "actionStarted",
      agent: null,
      id: "s",
      action: "webSearch",
      tool: null,
      target: "capitale",
    });
    announce({ kind: "actionFinished", id: "s", succeeded: true });
    announce({
      kind: "actionStarted",
      agent: null,
      id: "e",
      action: "edit",
      tool: null,
      target: "/Users/moi/Notes/a.md",
    });
    announce({ kind: "changeHeldBack", id: "e" });
    announce({ kind: "actionFinished", id: "e", succeeded: false });
    expect(find(".claude-held-back")).toBeNull();
    turn.resolve();
    await settle();
    expect(shown().slice(1, 3)).toEqual([
      "Recherche sur le webcapitale",
      "Modificationa.mdretenue",
    ]);
    find<HTMLButtonElement>(".claude-allow-changes").click();
    expect(log.at(-1)).toBe(`envoyer ${ALLOW_CHANGES_MESSAGE}`);
    expect(changesAllowed).toEqual([false, true]);
    expect(sentSettings).toEqual([NO_SETTINGS, NO_SETTINGS]);
    expect(shown().at(-2)).toBe(ALLOW_CHANGES_MESSAGE);
    expect(find(".claude-held-back")).toBeNull();
    turn.resolve();
    await settle();
    send("Merci");
    expect(changesAllowed).toEqual([false, true, false]);
    expect(log.at(-1)).toBe(
      "envoyer Merci\n\nNotes jointes (chemins depuis l'espace de travail) :\n- Projets/plan.md",
    );
  });

  it("une erreur du tour est montrée en clair", async () => {
    send("Bonjour");
    turn.reject({ message: "Claude Code est introuvable" });
    await settle();
    expect(shown()).toEqual(["Bonjour", "Claude Code est introuvable"]);
    expect(find(".claude-error")).not.toBeNull();
  });

  it("Arrêter interrompt le tour : la réponse est dite arrêtée", async () => {
    send("Bonjour");
    find<HTMLButtonElement>("[data-stop]").click();
    expect(find<HTMLButtonElement>("[data-stop]").disabled).toBe(true);
    turn.reject({ message: "la réponse de Claude a été arrêtée" });
    await settle();
    expect(log).toEqual(["envoyer Bonjour", "arrêter"]);
    expect(shown()).toEqual(["Bonjour", "Réponse arrêtée"]);
  });

  it("un arrêt en échec est signalé", async () => {
    column = createClaudeColumn({
      backend: {
        claudeStatus: async () => READY,
        logOutOfClaude: async () => null,
        logInToClaude: async () => null,
        onClaudeSignIn: async () => () => {},
        copyPlainText: async () => null,
        sendToClaude: () => new Promise(() => {}),
        stopClaude: () => Promise.reject(new Error("fil arrêté")),
        newConversation: () => Promise.reject(new Error("fil perdu")),
        onClaudeEvent: async () => () => {},
        errorMessage: String,
        listAllNotes: () => Promise.reject(new Error("liste perdue")),
      },
      layout,
      workspace: { path: () => workspacePath },
      columns: { current: () => columns },
      storage,
      openNote: () => {},
      error: (error) => log.push(`erreur ${String(error)}`),
    });
    find<HTMLButtonElement>("[data-new-conversation]").click();
    send("Bonjour");
    find<HTMLButtonElement>("[data-stop]").click();
    await settle();
    find<HTMLButtonElement>(".claude-attach").click();
    await settle();
    expect(log).toEqual([
      "erreur Error: fil perdu",
      "erreur Error: fil arrêté",
      "erreur Error: liste perdue",
    ]);
  });

  it("Nouvelle conversation oublie la conversation et vide la colonne", async () => {
    send("Bonjour");
    turn.resolve();
    await settle();
    find<HTMLButtonElement>("[data-new-conversation]").click();
    await settle();
    expect(log).toEqual(["envoyer Bonjour", "oublier"]);
    expect(find(".claude-empty")).not.toBeNull();
  });

  it("un autre espace de travail vide la colonne ; le même la garde", async () => {
    send("Bonjour");
    turn.resolve();
    await settle();
    column.follow();
    expect(shown()).toEqual(["Bonjour"]);
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(find(".claude-empty")).not.toBeNull();
    announce({
      kind: "actionStarted",
      agent: null,
      id: "r",
      action: "read",
      tool: null,
      target: "/Users/moi/Travail/a.md",
    });
    expect(shown()).toEqual(["Lecturea.md"]);
  });

  it("un tour en cours le reste quand l'espace de travail change", () => {
    send("Bonjour");
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(shown()).toEqual([EMPTY, "Claude travaille…"]);
  });
});

describe("colonne Claude Code : la carte des agents", () => {
  const agents = () => find<HTMLDetailsElement>(".claude-agents");
  const states = () =>
    [...layout.claudeColumn.querySelectorAll(".claude-agent-details")].map((e) => e.textContent);
  const launch = (id: string, agent: string | null) =>
    announce({ kind: "actionStarted", agent, id, action: "subAgent", tool: null, target: id });

  it("suit les sous-agents au fil des événements, l'un sous l'autre", () => {
    expect(agents().hidden).toBe(true);
    send("Compte");
    launch("Compter", null);
    expect(agents().hidden).toBe(false);
    launch("Lire", "Compter");
    expect(states()).toEqual(["en cours · 1 action", "en cours · 0 action"]);
    announce({
      kind: "subAgentFinished",
      id: "Lire",
      state: "done",
      durationMs: 1000,
      tokens: 10,
      actions: 1,
    });
    expect(states()).toEqual(["en cours · 1 action", "terminé · 1 s · 10 jetons · 1 action"]);
    expect(agents().querySelectorAll(".claude-agent .claude-agent .claude-agent")).toHaveLength(0);
    expect(agents().querySelectorAll(".claude-agent .claude-agent")).toHaveLength(1);
  });

  it("un tour arrêté laisse ses sous-agents en cours interrompus", async () => {
    send("Compte");
    launch("Compter", null);
    find<HTMLButtonElement>("[data-stop]").click();
    turn.reject({ message: "la réponse de Claude a été arrêtée" });
    await settle();
    expect(states()).toEqual(["interrompu · 0 action"]);
  });

  it("un tour fini normalement : ses sous-agents ont fini", async () => {
    send("Compte");
    launch("Compter", null);
    turn.resolve();
    await settle();
    expect(states()).toEqual(["terminé · 0 action"]);
  });

  it("Nouvelle conversation et un autre espace de travail vident la carte", async () => {
    send("Compte");
    launch("Compter", null);
    turn.resolve();
    await settle();
    find<HTMLButtonElement>("[data-new-conversation]").click();
    await settle();
    expect(agents().hidden).toBe(true);
    send("Encore");
    launch("Lire", null);
    turn.resolve();
    await settle();
    column.follow();
    expect(agents().hidden).toBe(false);
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(agents().hidden).toBe(true);
  });
});

describe("colonne Claude Code : la barre de saisie", () => {
  const chip = (selector: string) => find<HTMLElement>(selector);
  const settingsChip = () => chip(".claude-settings-chip");
  const choose = (group: string, label: string) =>
    (
      [...find(`.claude-settings-menu [aria-label="${group}"]`).querySelectorAll("button")].find(
        (item) => item.textContent === label,
      ) as HTMLButtonElement
    ).click();
  const attached = () =>
    [...layout.claudeColumn.querySelectorAll(".claude-attached-title")].map((e) => e.textContent);

  it("le modèle et l'effort choisis sont passés à chaque tour et gardés d'un lancement à l'autre", async () => {
    expect(settingsChip().textContent).toBe("Modèle par défaut");
    send("Un");
    expect(sentSettings).toEqual([{ model: null, effort: null }]);
    turn.resolve();
    await settle();
    settingsChip().click();
    choose("Modèle", "Opus");
    choose("Effort", "Medium");
    expect(settingsChip().textContent).toBe("Opus · Medium");
    send("Deux");
    expect(sentSettings.at(-1)).toEqual({ model: "opus", effort: "medium" });
    layout.claudeColumn.replaceChildren();
    column = createColumn();
    expect(settingsChip().textContent).toBe("Opus · Medium");
  });

  it("la note ouverte est jointe : le message porte son chemin, la conversation son titre", async () => {
    columns = showing("Projets/plan.md", "Plan");
    column.follow();
    expect(attached()).toEqual(["Plan"]);
    send("Résume");
    expect(log).toEqual([
      "envoyer Résume\n\nNotes jointes (chemins depuis l'espace de travail) :\n- Projets/plan.md",
    ]);
    expect(find(".claude-user-notes").textContent).toBe("Notes jointes : Plan");
    turn.resolve();
    await settle();
    expect(attached()).toEqual(["Plan"]);
  });

  it("la note de l'onglet actif est jointe dès la création de la colonne", () => {
    columns = {
      ...showing("a.md", "Alpha"),
      list: [
        {
          id: 0,
          tabs: [
            { id: 1, note: "a.md", title: "Alpha" },
            { id: 2, note: "Projets/plan.md", title: "Plan" },
          ],
          activeTab: 2,
          width: 1,
        },
      ],
    };
    layout.claudeColumn.replaceChildren();
    column = createColumn();
    expect(attached()).toEqual(["Plan"]);
  });

  it("la croix retire la note ouverte ; une autre note ouverte est jointe à son tour", () => {
    columns = showing("a.md");
    column.follow();
    expect(attached()).toEqual(["a"]);
    find<HTMLButtonElement>(".claude-detach").click();
    expect(attached()).toEqual([]);
    send("Bonjour");
    expect(log).toEqual(["envoyer Bonjour"]);
    columns = showing("Projets/plan.md", "Plan");
    column.follow();
    expect(attached()).toEqual(["Plan"]);
  });

  it("« + » joint une note choisie comme à l'ouverture rapide, jusqu'au départ du message", async () => {
    column.toggle();
    await settle();
    find<HTMLButtonElement>(".claude-attach").click();
    await settle();
    expect(layout.picker.open).toBe(true);
    expect(layout.picker.getAttribute("aria-label")).toBe("Joindre une note");
    const search = layout.picker.querySelector<HTMLInputElement>(".picker-input");
    expect(search?.placeholder).toBe("Titre de la note");
    if (search) {
      search.value = "zzz";
      search.dispatchEvent(new Event("input"));
    }
    expect(layout.picker.querySelector(".picker-empty")?.textContent).toBe(
      "Aucune note ne correspond",
    );
    if (search) {
      search.value = "";
      search.dispatchEvent(new Event("input"));
    }
    const options = [...layout.picker.querySelectorAll<HTMLElement>(".picker-option")];
    expect(options.map((option) => option.textContent)).toEqual(["Alpha", "PlanProjets"]);
    options[1]?.click();
    expect(attached()).toEqual(["Plan"]);
    expect(document.activeElement).toBe(find(".claude-input"));
    send("Lis");
    expect(log.at(-1)).toContain("- Projets/plan.md");
    expect(attached()).toEqual([]);
  });

  it("un autre espace de travail oublie les notes jointes", async () => {
    find<HTMLButtonElement>(".claude-attach").click();
    await settle();
    layout.picker.querySelector<HTMLElement>(".picker-option")?.click();
    expect(attached()).toEqual(["Alpha"]);
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(attached()).toEqual([]);
  });

  it("la durée de la réponse avance chaque seconde pendant le tour, puis se cache", async () => {
    vi.useFakeTimers();
    const elapsed = chip(".claude-elapsed");
    expect(elapsed.hidden).toBe(true);
    send("Bonjour");
    expect(elapsed.hidden).toBe(false);
    expect(elapsed.textContent).toBe("0 s");
    vi.advanceTimersByTime(2000);
    expect(elapsed.textContent).toBe("2 s");
    turn.resolve();
    await vi.runOnlyPendingTimersAsync();
    expect(elapsed.hidden).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(elapsed.textContent).toBe("");
  });

  it("la pastille des sous-agents en cours déplie la carte des agents", () => {
    const agentsChip = chip(".claude-agents-chip");
    expect(agentsChip.hidden).toBe(true);
    send("Compte");
    announce({
      kind: "actionStarted",
      agent: null,
      id: "A",
      action: "subAgent",
      tool: null,
      target: "Compter",
    });
    expect(agentsChip.hidden).toBe(false);
    expect(agentsChip.textContent).toBe("● 1 agent");
    agentsChip.click();
    expect(find<HTMLDetailsElement>(".claude-agents").open).toBe(true);
    announce({
      kind: "subAgentFinished",
      id: "A",
      state: "done",
      durationMs: 1,
      tokens: 1,
      actions: 0,
    });
    expect(agentsChip.hidden).toBe(true);
  });
});

describe("colonne Claude Code : compte Claude", () => {
  const summary = () => find(".claude-account-summary").textContent;
  const logOut = () => find<HTMLButtonElement>("[data-log-out]");

  it("chaque vérification de la connexion montre le compte en haut de la colonne", async () => {
    column.toggle();
    await settle();
    column.toggle();
    let answer: (status: ClaudeStatusItem) => void = () => {};
    status = new Promise((resolve) => (answer = resolve));
    column.toggle();
    expect(summary()).toBe("Compte Claude · vérification…");
    answer(READY);
    await settle();
    expect(summary()).toBe("Compte Claude · moi@example.com · Moi");
  });

  it("pendant un tour, on ne peut pas changer de compte", async () => {
    column.toggle();
    await settle();
    expect(logOut().disabled).toBe(false);
    send("Bonjour");
    expect(logOut().disabled).toBe(true);
    turn.resolve();
    await settle();
    expect(logOut().disabled).toBe(false);
  });

  it("se déconnecter empêche d'écrire, oublie la conversation, puis revérifie la connexion", async () => {
    column.toggle();
    await settle();
    send("Bonjour");
    turn.resolve();
    await settle();
    log.length = 0;
    status = Promise.resolve({ kind: "unavailable", reason: "pas connecté" });
    logOut().click();
    expect(unavailable().textContent).toBe("Changement du compte Claude en cours…");
    expect(find<HTMLTextAreaElement>(".claude-input").disabled).toBe(true);
    await settle();
    expect(log).toEqual(["déconnecter", "vérifier"]);
    expect(shown()).toEqual([EMPTY]);
    expect(unavailable().textContent).toBe("pas connecté");
    expect(summary()).toBe("Compte Claude · non connecté");
  });
});
