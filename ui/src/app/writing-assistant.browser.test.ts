import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import type { AssistantStatus, ProposalItem } from "../bridge";
import { createEditor } from "../editor/editor";
import { closeContextMenu } from "../screens/context-menu";
import type { Pane } from "../screens/note-pane";
import { SELECTION_CHANGED } from "../state/writing-assist";
import { createWritingAssistant } from "./writing-assistant";

const MAC_MENU_HINT = "Alt+clic droit : menu du Mac (outils d'écriture d'Apple)";
const CHECKING = "Recherche de l'assistant d'écriture…";
const NOT_ANSWERING = "l'assistant d'écriture ne répond pas";

const TEXT = "# Note\nUne fote ici.\nFin.";

interface Options {
  /** La réponse de Rust sur l'assistant ; jamais si `null`. */
  status?: AssistantStatus | Error | null;
}

/** Une colonne et son vrai éditeur, l'aide à l'écriture branchée sur un Rust qu'on fait répondre. */
function setup({ status = { kind: "available" } }: Options = {}) {
  const columns = document.createElement("div");
  const dialog = document.createElement("dialog");
  const parent = document.createElement("div");
  columns.append(parent);
  document.body.replaceChildren(columns, dialog);
  const changes: string[] = [];
  const editor = createEditor(parent, (content) => changes.push(content));
  editor.show(TEXT);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  let note: string | null = "a.md";
  const pane = { editor, note: () => note } as unknown as Pane;
  const heard: string[] = [];
  let answer: (proposal: ProposalItem) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const assistant = createWritingAssistant({
    backend: {
      assistantStatus: () =>
        status === null
          ? new Promise(() => {})
          : status instanceof Error
            ? Promise.reject(status)
            : Promise.resolve(status),
      proposeRewriting: (action, selection) => {
        heard.push(`demander ${action} « ${selection} »`);
        return new Promise((resolve, reject) => ((answer = resolve), (fail = reject)));
      },
    },
    columns: { activePane: () => pane, panes: () => new Map([[0, pane]]) },
    layout: { columns, confirmation: dialog },
    show: (message) => heard.push(`message ${message}`),
    error: (error) => heard.push(`erreur ${(error as Error).message}`),
  });
  const select = (from: number, to: number) =>
    view?.dispatch({ selection: { anchor: from, head: to } });
  const button = (text: string) =>
    [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === text,
    ) as HTMLButtonElement;
  const rightClick = (target: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const content = parent.querySelector(".cm-content") as HTMLElement;
  return {
    ...{ assistant, editor, dialog, heard, changes, select, button, rightClick, content, columns },
    answer: (text = "Une faute ici.") => answer({ text, differences: [] }),
    fail: (message: string) => fail(new Error(message)),
    showOther: () => (note = "b.md"),
    showNone: () => (note = null),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const menuEntries = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")].map((b) => [
    b.textContent,
    b.disabled,
  ]);
const menuNote = () => document.querySelector(".context-menu-note")?.textContent;

afterEach(() => closeContextMenu());

describe("aide à l'écriture", () => {
  it("demande à Rust de corriger la sélection et montre sa proposition sans toucher à la note", async () => {
    const t = setup();
    t.select(7, 20);
    t.assistant.propose("correct");
    expect(t.heard).toEqual(["demander correct « Une fote ici. »"]);
    expect(t.dialog.open).toBe(true);
    t.answer();
    await settle();
    expect(t.editor.content()).toBe(TEXT);
    expect(t.changes).toEqual([]);
  });

  it("« Remplacer » met la proposition à la place de la sélection, comme une frappe", async () => {
    const t = setup();
    t.select(7, 20);
    t.assistant.propose("correct");
    t.answer();
    await settle();
    t.button("Remplacer").click();
    await expect.poll(() => t.editor.content()).toBe("# Note\nUne faute ici.\nFin.");
    expect(t.changes).toEqual(["# Note\nUne faute ici.\nFin."]);
    expect(t.content.contains(document.activeElement)).toBe(true);
  });

  it("« Insérer dessous » ajoute la proposition sous la sélection, après une ligne vide", async () => {
    const t = setup();
    t.select(7, 15);
    t.assistant.propose("summarize");
    t.answer("Résumé.");
    await settle();
    t.button("Insérer dessous").click();
    await expect.poll(() => t.editor.content()).toBe("# Note\nUne fote ici.\n\nRésumé.\nFin.");
  });

  it("« Annuler » laisse la note telle quelle", async () => {
    const t = setup();
    t.select(7, 20);
    t.assistant.propose("rephrase");
    t.answer();
    await settle();
    t.button("Annuler").click();
    await expect.poll(() => t.dialog.open).toBe(false);
    expect(t.editor.content()).toBe(TEXT);
    expect(t.changes).toEqual([]);
  });

  it("ne change rien si le texte sélectionné a changé pendant la demande", async () => {
    const t = setup();
    t.select(7, 20);
    t.assistant.propose("correct");
    t.editor.replaceRange(7, 10, "Cette");
    t.answer();
    await settle();
    t.button("Remplacer").click();
    await expect.poll(() => t.heard).toContain(`message ${SELECTION_CHANGED}`);
    expect(t.editor.content()).toBe("# Note\nCette fote ici.\nFin.");
  });

  it("ne change rien si la colonne montre une autre note entre-temps", async () => {
    const t = setup();
    t.select(7, 20);
    t.assistant.propose("correct");
    t.showOther();
    t.answer();
    await settle();
    t.button("Insérer dessous").click();
    await expect.poll(() => t.heard).toContain(`message ${SELECTION_CHANGED}`);
    expect(t.editor.content()).toBe(TEXT);
  });

  it("une demande en échec dit pourquoi et laisse la note telle quelle", async () => {
    const t = setup();
    t.select(7, 20);
    t.assistant.propose("correct");
    t.fail("le modèle d'Apple a refusé de traiter ce texte");
    await expect
      .poll(() => t.heard)
      .toContain("erreur le modèle d'Apple a refusé de traiter ce texte");
    expect(t.dialog.open).toBe(false);
    expect(t.editor.content()).toBe(TEXT);
  });

  it("sans sélection, demande de sélectionner d'abord le texte", () => {
    const t = setup();
    t.select(3, 3);
    t.assistant.propose("rephrase");
    expect(t.heard).toEqual(["message Sélectionnez d'abord le texte à reformuler"]);
    expect(t.dialog.open).toBe(false);
  });

  it("une sélection faite seulement d'espaces compte comme aucune", () => {
    const t = setup();
    t.editor.replaceRange(0, 0, "   ");
    t.select(0, 3);
    t.assistant.propose("correct");
    expect(t.heard).toEqual(["message Sélectionnez d'abord le texte à corriger"]);
  });

  it("sans note montrée, ne fait rien", () => {
    const t = setup();
    t.select(7, 20);
    t.showNone();
    t.assistant.propose("correct");
    expect(t.heard).toEqual([]);
  });

  it("sur un Mac où l'assistant ne peut pas répondre, dit pourquoi sans rien demander", async () => {
    const t = setup({
      status: { kind: "unavailable", reason: "Apple Intelligence n'est pas activé" },
    });
    await expect(t.assistant.status).resolves.toEqual({
      kind: "unavailable",
      reason: "Apple Intelligence n'est pas activé",
    });
    t.select(7, 20);
    t.assistant.propose("correct");
    expect(t.heard).toEqual(["message Apple Intelligence n'est pas activé"]);
  });

  it("un assistant qui ne répond pas compte comme indisponible, l'erreur signalée", async () => {
    const t = setup({ status: new Error("fil arrêté") });
    await expect(t.assistant.status).resolves.toEqual({
      kind: "unavailable",
      reason: NOT_ANSWERING,
    });
    t.select(7, 20);
    t.assistant.propose("correct");
    expect(t.heard).toEqual(["erreur fil arrêté", `message ${NOT_ANSWERING}`]);
  });
});

describe("menu de la sélection", () => {
  it("le clic droit sur une sélection propose les trois actions, et comment retrouver le menu du Mac", async () => {
    const t = setup();
    await t.assistant.status;
    t.select(7, 20);
    const event = t.rightClick(t.content, { clientX: 30, clientY: 40 });
    expect(event.defaultPrevented).toBe(true);
    expect(menuEntries()).toEqual([
      ["Corriger", false],
      ["Reformuler", false],
      ["Résumer", false],
    ]);
    expect(menuNote()).toBe(MAC_MENU_HINT);
    expect(document.querySelector<HTMLElement>(".context-menu")?.style.left).toBe("30px");
  });

  it("le choix lance l'action sur la sélection", async () => {
    const t = setup();
    await t.assistant.status;
    t.select(7, 20);
    t.rightClick(t.content);
    document.querySelectorAll<HTMLButtonElement>(".context-menu button")[1]?.click();
    expect(t.heard).toEqual(["demander rephrase « Une fote ici. »"]);
  });

  it("sans sélection, Alt enfoncée, ou hors d'un éditeur, laisse le menu du Mac", async () => {
    const t = setup();
    await t.assistant.status;
    t.select(3, 3);
    expect(t.rightClick(t.content).defaultPrevented).toBe(false);
    t.select(7, 20);
    expect(t.rightClick(t.content, { altKey: true }).defaultPrevented).toBe(false);
    expect(t.rightClick(t.columns).defaultPrevented).toBe(false);
    expect(menuEntries()).toEqual([]);
  });

  it("grise les actions tant qu'on ne sait pas si l'assistant peut répondre", () => {
    const t = setup({ status: null });
    t.select(7, 20);
    t.rightClick(t.content);
    expect(menuEntries().map(([, disabled]) => disabled)).toEqual([true, true, true]);
    expect(menuNote()).toBe(`${CHECKING}\n${MAC_MENU_HINT}`);
  });

  it("grise les actions et dit pourquoi sur un Mac où l'assistant ne peut pas répondre", async () => {
    const t = setup({ status: { kind: "unavailable", reason: "Mac non compatible" } });
    await t.assistant.status;
    t.select(7, 20);
    t.rightClick(t.content);
    expect(menuEntries().map(([, disabled]) => disabled)).toEqual([true, true, true]);
    expect(menuNote()).toBe(`Mac non compatible\n${MAC_MENU_HINT}`);
  });
});
