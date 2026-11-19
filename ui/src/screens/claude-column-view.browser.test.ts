import { beforeEach, describe, expect, it } from "vitest";
import { type ChatEntry, type Conversation, NEW_CONVERSATION } from "../state/claude-column";
import {
  type ClaudeColumnView,
  createClaudeColumnView,
  EMPTY,
  PERMISSIONS,
  STOPPED,
  WORKING,
} from "./claude-column-view";

const log: string[] = [];
let container: HTMLElement;
let view: ClaudeColumnView;
let markdowns: string[] = [];

const find = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
const input = () => find<HTMLTextAreaElement>(".claude-input");
const button = (name: string) => find<HTMLButtonElement>(`[data-${name}]`);
const shown = () => [...find(".claude-conversation").children].map((e) => e.textContent);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const idle = (...entries: ChatEntry[]): Conversation => ({ entries, turn: "idle" });

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  input().dispatchEvent(event);
  return event;
}

beforeEach(() => {
  log.length = 0;
  markdowns = [];
  container = document.createElement("section");
  document.body.replaceChildren(container);
  view = createClaudeColumnView(container, {
    send: (text) => log.push(`envoyer ${text}`),
    stop: () => log.push("arrêter"),
    newConversation: () => log.push("nouvelle conversation"),
    close: () => log.push("masquer"),
    openNote: (path) => log.push(`ouvrir ${path}`),
    markdown: async (text) => (markdowns.push(text), `<p><strong>${text}</strong></p>`),
    chooseSettings: (settings) => log.push(`régler ${JSON.stringify(settings)}`),
    attach: () => log.push("joindre"),
    detach: (path) => log.push(`retirer ${path}`),
  });
});

describe("colonne Claude Code : les autorisations", () => {
  it("disent en une ligne discrète ce que Claude peut faire ici, et rien d'autre", () => {
    expect(find(".claude-permissions").textContent).toBe(PERMISSIONS);
    expect(PERMISSIONS).toBe(
      "Claude lit, crée et modifie les notes de cet espace de travail, sans demander. Rien d'autre : ni autre dossier, ni commande, ni web.",
    );
  });
});

describe("colonne Claude Code : la carte des agents", () => {
  it("en haut de la colonne, sous l'en-tête, cachée tant qu'aucun sous-agent n'a été lancé", () => {
    const map = find<HTMLDetailsElement>(".claude-agents");
    expect(map.previousElementSibling?.className).toBe("claude-unavailable");
    expect(map.hidden).toBe(true);
    view.showAgents({
      agents: [
        {
          id: "A",
          parent: null,
          description: "Compter",
          state: "running",
          durationMs: null,
          tokens: null,
          actions: 0,
        },
      ],
    });
    expect(map.hidden).toBe(false);
    expect(map.querySelector(".claude-agent-description")?.textContent).toBe("Compter");
  });
});

describe("colonne Claude Code : la conversation", () => {
  it("vide, elle dit ce qu'on peut demander", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    expect(shown()).toEqual([EMPTY]);
    expect(EMPTY).toBe(
      "Demandez à Claude de lire, créer ou modifier les notes de cet espace de travail.",
    );
  });

  it("montre les messages, Claude en Markdown, ceux des sous-agents marqués", async () => {
    view.render(
      idle(
        { kind: "user", text: "Bonjour", notes: [] },
        { kind: "claude", text: "Salut", subAgent: false },
        { kind: "claude", text: "Trouvé", subAgent: true },
      ),
      "/Notes",
    );
    await settle();
    expect(shown()).toEqual(["Bonjour", "Salut", "Trouvé"]);
    expect(find(".claude-user").textContent).toBe("Bonjour");
    expect(find(".claude-reply strong").textContent).toBe("Salut");
    expect(container.querySelectorAll(".claude-reply.claude-sub-agent")).toHaveLength(1);
  });

  it("ne remet pas en forme un message déjà montré", async () => {
    const conversation = idle({ kind: "claude", text: "Salut", subAgent: false });
    view.render(conversation, "/Notes");
    await settle();
    view.render(conversation, "/Notes");
    expect(find(".claude-reply strong").textContent).toBe("Salut");
    expect(markdowns).toEqual(["Salut"]);
  });

  it("un lien d'un message de Claude ne fait pas quitter l'application", () => {
    view.render(idle({ kind: "claude", text: "Salut", subAgent: false }), "/Notes");
    const reply = find(".claude-reply");
    reply.innerHTML = '<a href="https://example.com">lien</a> texte';
    const onLink = new MouseEvent("click", { bubbles: true, cancelable: true });
    reply.querySelector("a")?.dispatchEvent(onLink);
    expect(onLink.defaultPrevented).toBe(true);
    const onText = new MouseEvent("click", { bubbles: true, cancelable: true });
    reply.dispatchEvent(onText);
    expect(onText.defaultPrevented).toBe(false);
  });

  it("montre chaque action en bref : ce qu'elle fait, sa cible, un refus ou une erreur", () => {
    const action = (id: string, state: "running" | "succeeded" | "failed" | "refused") =>
      ({ kind: "action", id, label: "Modification", subAgent: id === "s", state }) as const;
    view.render(
      idle(
        { ...action("a", "succeeded"), target: "/Notes/a/plan.md" },
        { ...action("b", "refused"), target: "/etc/hosts" },
        { ...action("c", "failed"), target: null },
        { ...action("s", "running"), target: null },
      ),
      "/Notes",
    );
    const actions = [...container.querySelectorAll(".claude-action")].map((a) =>
      [...a.children].map((part) => `${part.className}=${part.textContent}`),
    );
    expect(actions).toEqual([
      ["claude-action-kind=Modification", "claude-action-target=a/plan.md"],
      [
        "claude-action-kind=Modification",
        "claude-action-target=/etc/hosts",
        "claude-action-state=refusée",
      ],
      ["claude-action-kind=Modification", "claude-action-state=en erreur"],
      ["claude-action-kind=Modification"],
    ]);
    expect(find(".claude-action-refused")).not.toBeNull();
    expect(find(".claude-action-failed")).not.toBeNull();
    expect(find(".claude-action-running.claude-sub-agent")).not.toBeNull();
  });

  it("une note modifiée s'ouvre d'un clic", () => {
    view.render(idle({ kind: "changedNote", path: "a/plan.md" }), "/Notes");
    expect(shown()).toEqual(["Note modifiée : a/plan.md"]);
    expect(find(".claude-changed-note .claude-note-link").title).toBe("Ouvrir la note");
    find<HTMLButtonElement>(".claude-note-link").click();
    expect(log).toEqual(["ouvrir a/plan.md"]);
  });

  it("le bilan en petit, l'échec, l'erreur et l'arrêt en clair", () => {
    view.render(
      idle(
        { kind: "summary", failure: null, durationMs: 2000, tokens: 12 },
        { kind: "summary", failure: "conversation inconnue", durationMs: 1, tokens: 0 },
        { kind: "error", message: "claude répond déjà" },
        { kind: "stopped" },
      ),
      "/Notes",
    );
    expect(shown()).toEqual([
      "2 s · 12 jetons",
      "Claude n'a pas pu répondre : conversation inconnue",
      "Claude répond déjà",
      STOPPED,
    ]);
    expect(container.querySelectorAll(".claude-error")).toHaveLength(2);
    expect(container.querySelectorAll(".claude-summary")).toHaveLength(2);
  });
});

describe("colonne Claude Code : écrire et piloter le tour", () => {
  it("Entrée envoie le message, sans les blancs autour, et vide la zone", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    input().value = "  Range mes notes \n";
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(log).toEqual(["envoyer Range mes notes"]);
    expect(input().value).toBe("");
  });

  it("Maj+Entrée va à la ligne ; un message vide ne part pas", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    input().value = "Une ligne";
    expect(press("Enter", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press("a").defaultPrevented).toBe(false);
    // Entrée qui valide un accent ou un caractère composé ne fait pas partir le message.
    expect(press("Enter", { isComposing: true }).defaultPrevented).toBe(false);
    input().value = "   ";
    press("Enter");
    expect(log).toEqual([]);
  });

  it("un message part même avant que la conversation soit dessinée", () => {
    input().value = "Bonjour";
    press("Enter");
    expect(log).toEqual(["envoyer Bonjour"]);
  });

  it("le bouton Envoyer envoie aussi", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    input().value = "Bonjour";
    button("send").click();
    expect(log).toEqual(["envoyer Bonjour"]);
  });

  it("pendant un tour : Arrêter à la place d'Envoyer, rien ne part, pas de nouvelle conversation", () => {
    view.render({ entries: [{ kind: "user", text: "Un", notes: [] }], turn: "running" }, "/Notes");
    expect(shown()).toEqual(["Un", WORKING]);
    expect(find(".claude-working").textContent).toBe(WORKING);
    expect(button("send").hidden).toBe(true);
    expect(button("stop").hidden).toBe(false);
    expect(button("stop").disabled).toBe(false);
    expect(button("new-conversation").disabled).toBe(true);
    input().value = "Deux";
    press("Enter");
    expect(log).toEqual([]);
    expect(input().value).toBe("Deux");
    button("stop").click();
    expect(log).toEqual(["arrêter"]);
    view.render({ entries: [], turn: "stopping" }, "/Notes");
    expect(button("stop").disabled).toBe(true);
  });

  it("hors d'un tour : Envoyer, et Nouvelle conversation possible", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    expect(button("send").hidden).toBe(false);
    expect(button("stop").hidden).toBe(true);
    button("new-conversation").click();
    button("close").click();
    expect(log).toEqual(["nouvelle conversation", "masquer"]);
  });

  it("Claude Code indisponible : la raison est montrée et l'écriture empêchée", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    view.showUnavailable("Claude Code n'est pas installé");
    expect(find(".claude-unavailable").hidden).toBe(false);
    expect(find(".claude-unavailable").textContent).toBe("Claude Code n'est pas installé");
    expect(input().disabled).toBe(true);
    expect(button("send").disabled).toBe(true);
    input().value = "Bonjour";
    button("send").click();
    expect(log).toEqual([]);
    view.showUnavailable(null);
    expect(find(".claude-unavailable").hidden).toBe(true);
    expect(find(".claude-unavailable").textContent).toBe("");
    expect(input().disabled).toBe(false);
    expect(button("send").disabled).toBe(false);
  });

  it("met le curseur dans la zone du message", () => {
    view.focus();
    expect(document.activeElement).toBe(input());
  });
});

describe("colonne Claude Code : la barre de saisie", () => {
  const menu = () => find(".claude-settings-menu");
  const chip = () => find<HTMLButtonElement>(".claude-settings-chip");
  const choices = (group: string) =>
    [...menu().querySelectorAll(`[aria-label="${group}"] [role="menuitemradio"]`)].map(
      (item) => `${item.textContent}${item.getAttribute("aria-checked") === "true" ? " ✓" : ""}`,
    );

  it("sous la zone du message, les pastilles puis Envoyer, un carré d'arrêt pendant la réponse", () => {
    const bar = find(".claude-input-bar");
    expect(bar.previousElementSibling).toBe(input());
    expect(button("send").getAttribute("aria-label")).toBe("Envoyer");
    expect(button("stop").getAttribute("aria-label")).toBe("Arrêter");
    expect(button("stop").querySelector(".claude-stop-square")).not.toBeNull();
    expect(bar.lastElementChild).toBe(button("send"));
  });

  it("au départ : réglages par défaut, ni sous-agent ni durée, « + » pour joindre", () => {
    expect(chip().textContent).toBe("");
    expect(chip().type).toBe("button");
    expect(chip().title).toBe("Choisir le modèle de Claude et le niveau d'effort");
    expect(chip().getAttribute("aria-haspopup")).toBe("menu");
    expect(chip().getAttribute("aria-expanded")).toBe("false");
    expect(menu().getAttribute("role")).toBe("menu");
    expect(menu().getAttribute("aria-label")).toBe(chip().title);
    chip().click();
    expect(choices("Modèle")[0]).toBe("Par défaut ✓");
    expect(choices("Effort")[0]).toBe("Par défaut ✓");
    const group = menu().querySelector(".claude-settings-group") as HTMLElement;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.querySelector(".claude-settings-heading")?.textContent).toBe("Modèle");
    expect(group.querySelectorAll(".claude-settings-choice")).toHaveLength(5);
    const agents = find<HTMLButtonElement>(".claude-agents-chip");
    expect(agents.hidden).toBe(true);
    expect(agents.textContent).toBe("");
    expect(agents.title).toBe("Montrer la carte des agents");
    expect(find(".claude-elapsed").hidden).toBe(true);
    expect(find(".claude-elapsed").title).toBe("Durée de la réponse");
    expect(find(".claude-attach").textContent).toBe("+");
    expect(find(".claude-attach").title).toBe("Joindre une note");
    expect(find(".claude-attachments")).not.toBeNull();
  });

  it("la pastille des sous-agents se vide quand plus aucun ne travaille, et déplie la carte", () => {
    const running = {
      id: "A",
      parent: null,
      description: "Compter",
      state: "running",
      durationMs: null,
      tokens: null,
      actions: 0,
    } as const;
    const agents = find<HTMLButtonElement>(".claude-agents-chip");
    view.showAgents({ agents: [running] });
    expect(agents.textContent).toBe("● 1 agent");
    agents.click();
    expect(find<HTMLDetailsElement>(".claude-agents").open).toBe(true);
    view.showAgents({ agents: [{ ...running, state: "done" }] });
    expect(agents.hidden).toBe(true);
    expect(agents.textContent).toBe("");
  });

  it("la pastille des réglages ouvre leur choix, l'actuel coché, du plus bas au plus haut", () => {
    view.showSettings({ model: "opus", effort: null });
    expect(chip().textContent).toBe("Opus");
    expect(menu().hidden).toBe(true);
    chip().click();
    expect(menu().hidden).toBe(false);
    expect(chip().getAttribute("aria-expanded")).toBe("true");
    expect(choices("Modèle")).toEqual(["Par défaut", "Haiku", "Sonnet", "Opus ✓", "Fable"]);
    expect(choices("Effort")).toEqual([
      "Par défaut ✓",
      "Low",
      "Medium",
      "High",
      "Extra high",
      "Max",
    ]);
    (menu().querySelectorAll('[aria-label="Effort"] button')[4] as HTMLButtonElement).click();
    (menu().querySelectorAll('[aria-label="Modèle"] button')[0] as HTMLButtonElement).click();
    expect(log).toEqual([
      'régler {"model":"opus","effort":"extraHigh"}',
      'régler {"model":null,"effort":null}',
    ]);
    view.showSettings({ model: "haiku", effort: "max" });
    expect(choices("Modèle")[1]).toBe("Haiku ✓");
    chip().click();
    expect(menu().hidden).toBe(true);
    expect(chip().getAttribute("aria-expanded")).toBe("false");
  });

  it("un clic ailleurs ou Échap ferme le choix des réglages", () => {
    chip().click();
    menu().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu().hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu().hidden).toBe(true);
    chip().click();
    chip().dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(menu().hidden).toBe(false);
    chip().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(chip());
  });

  it("Échap hors du choix des réglages ne déplace pas le curseur", () => {
    input().focus();
    find(".claude-chips").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(document.activeElement).toBe(input());
  });

  it("les notes jointes se retirent par leur croix ; « + » en fait joindre d'autres", () => {
    view.showAttachments([
      { path: "a.md", title: "Alpha" },
      { path: "Projets/plan.md", title: "Plan" },
    ]);
    const notes = [...container.querySelectorAll<HTMLElement>(".claude-attached-note")];
    expect(notes.map((note) => note.textContent)).toEqual(["Alpha×", "Plan×"]);
    expect(notes[1]?.title).toBe("Projets/plan.md");
    const remove = notes[1]?.querySelector("button") as HTMLButtonElement;
    expect(remove.getAttribute("aria-label")).toBe("Retirer « Plan » du message");
    expect(remove.title).toBe("Retirer « Plan » du message");
    remove.click();
    find<HTMLButtonElement>(".claude-attach").click();
    expect(find(".claude-attach").getAttribute("aria-label")).toBe("Joindre une note");
    expect(log).toEqual(["retirer Projets/plan.md", "joindre"]);
  });

  it("la durée de la réponse ne se montre que pendant un tour", () => {
    const elapsed = find(".claude-elapsed");
    view.showElapsed(65_000);
    expect(elapsed.hidden).toBe(false);
    expect(elapsed.textContent).toBe("1 min 05 s");
    view.showElapsed(null);
    expect(elapsed.hidden).toBe(true);
  });

  it("le message de l'utilisateur dit les notes jointes", () => {
    view.render(idle({ kind: "user", text: "Résume", notes: ["Alpha", "Plan"] }), "/Notes");
    expect(find(".claude-user-notes").textContent).toBe("Notes jointes : Alpha, Plan");
    view.render(idle({ kind: "user", text: "Résume", notes: [] }), "/Notes");
    expect(find(".claude-user-notes")).toBeNull();
  });
});
