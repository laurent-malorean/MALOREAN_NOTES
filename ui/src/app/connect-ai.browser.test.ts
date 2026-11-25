import { afterEach, describe, expect, it } from "vitest";
import type { AiWorkspaceItem, ConnectionInfo } from "../bridge";
import { createConnectAi, REVOCATION } from "./connect-ai";

afterEach(() => document.body.replaceChildren());

const KEY = {
  secret: "abc123",
  createdOn: "25 novembre 2026",
  claudeConfig: "bloc claude",
  codexConfig: "bloc codex",
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(initial: ConnectionInfo, options: { failCopy?: boolean } = {}) {
  const fail = { setAllowed: false };
  let info = initial;
  let workspaces: AiWorkspaceItem[] = [
    { name: "Notes", allowed: false },
    { name: "Travail", allowed: false },
  ];
  const events: string[] = [];
  const failures: unknown[] = [];
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  const ai = createConnectAi({
    backend: {
      connectionInfo: async () => (events.push("état"), info),
      createConnectionKey: async () => (events.push("créer"), (info = { key: KEY })),
      revokeConnectionKey: async () => (events.push("révoquer"), (info = { key: null }), null),
      listAiWorkspaces: async () => (events.push("espaces"), workspaces),
      setWorkspaceAllowed: async (name, allowed) => {
        if (fail.setAllowed) throw new Error("préférences illisibles");
        events.push(`${allowed ? "autoriser" : "retirer"} ${name}`);
        workspaces = workspaces.map((w) => (w.name === name ? { ...w, allowed } : w));
        return workspaces;
      },
      copyPlainText: async (text) => {
        if (options.failCopy) throw new Error("presse-papiers refusé");
        events.push(`copié ${text}`);
        return null;
      },
    },
    dialog,
    run: (action) => void action.catch((error) => failures.push(error)),
  });
  const [frame] = ai.settingsGroups() as [HTMLElement];
  document.body.append(frame);
  const button = (label: string) =>
    [...frame.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === label,
    ) as HTMLButtonElement;
  const buttons = () => [...frame.querySelectorAll("button")].map((b) => b.textContent);
  const boxes = () =>
    [...frame.querySelectorAll<HTMLInputElement>(".allowed-workspace input")].map((b) => b.checked);
  const box = (index: number) =>
    frame.querySelectorAll<HTMLInputElement>(".allowed-workspace input")[index] as HTMLInputElement;
  return { frame, dialog, events, failures, button, buttons, boxes, box, fail };
}

describe("« Brancher une IA » côté application", () => {
  it("dessine la partie aussitôt, puis la remplit de l'état lu", async () => {
    const t = setup({ key: null });
    expect(t.buttons()).toEqual([]);
    await settled();
    expect(t.events).toEqual(["état", "espaces"]);
    expect(t.buttons()).toEqual(["Créer une clé de branchement"]);
  });

  it("crée la clé au clic et montre aussitôt la clé et ses blocs", async () => {
    const t = setup({ key: null });
    await settled();
    t.button("Créer une clé de branchement").click();
    await settled();
    expect(t.events).toEqual(["état", "espaces", "créer"]);
    expect(t.buttons()).toEqual(["Copier", "Copier", "Copier", "Révoquer la clé"]);
  });

  it("copie la clé et chaque bloc tels quels, sans message passager : le bouton le dit", async () => {
    const t = setup({ key: KEY });
    await settled();
    for (const label of [
      "Copier : Clé de branchement",
      "Copier : Configuration pour Claude (extension VS Code, Claude Code hors de l'application)",
      "Copier : Configuration pour Codex",
    ]) {
      t.button(label).click();
      await settled();
    }
    expect(t.events.slice(2)).toEqual(["copié abc123", "copié bloc claude", "copié bloc codex"]);
    expect(t.buttons()).toEqual(["✓ Copié", "✓ Copié", "✓ Copié", "Révoquer la clé"]);
  });

  it("ne confirme pas une copie que le presse-papiers a refusée, et rend son erreur", async () => {
    const t = setup({ key: KEY }, { failCopy: true });
    await settled();
    t.button("Copier : Clé de branchement").click();
    await settled();
    expect(t.events).toEqual(["état", "espaces"]);
    expect(t.failures).toHaveLength(1);
    expect(t.buttons()[0]).toBe("Copier");
  });

  it("demande confirmation avant de révoquer, puis redonne le bouton de création", async () => {
    const t = setup({ key: KEY });
    await settled();
    t.button("Révoquer la clé").click();
    await settled();
    expect(t.dialog.open).toBe(true);
    expect(t.dialog.querySelector(".confirmation-question")?.textContent).toBe(REVOCATION.question);
    expect(t.events).toEqual(["état", "espaces"]);
    (t.dialog.querySelector("button.danger") as HTMLButtonElement).click();
    await settled();
    expect(t.events).toEqual(["état", "espaces", "révoquer", "état"]);
    expect(t.buttons()).toEqual(["Créer une clé de branchement"]);
  });

  it("ne révoque rien quand l'utilisateur annule", async () => {
    const t = setup({ key: KEY });
    await settled();
    t.button("Révoquer la clé").click();
    await settled();
    (t.dialog.querySelector("button.link") as HTMLButtonElement).click();
    await settled();
    expect(t.events).toEqual(["état", "espaces"]);
    expect(t.buttons()).toEqual(["Copier", "Copier", "Copier", "Révoquer la clé"]);
  });

  it("la question dit que les IA branchées sont coupées et que la nouvelle clé est autre", () => {
    expect(REVOCATION.question).toContain("coupées tout de suite");
    expect(REVOCATION.confirm).toBe("Révoquer la clé");
  });

  it("lit les espaces de travail avec la clé et montre leurs cases, décochées au départ", async () => {
    const t = setup({ key: null });
    expect(t.boxes()).toEqual([]);
    await settled();
    expect(t.events).toEqual(["état", "espaces"]);
    expect(t.boxes()).toEqual([false, false]);
  });

  it("coche un espace de travail au clic, garde la case cochée, puis le décoche", async () => {
    const t = setup({ key: KEY });
    await settled();
    t.box(1).click();
    await settled();
    expect(t.events.slice(2)).toEqual(["autoriser Travail"]);
    expect(t.boxes()).toEqual([false, true]);
    t.box(1).click();
    await settled();
    expect(t.events.slice(2)).toEqual(["autoriser Travail", "retirer Travail"]);
    expect(t.boxes()).toEqual([false, false]);
  });

  it("garde les cases quand la clé est créée ou révoquée", async () => {
    const t = setup({ key: null });
    await settled();
    t.box(0).click();
    await settled();
    t.button("Créer une clé de branchement").click();
    await settled();
    expect(t.boxes()).toEqual([true, false]);
    t.button("Révoquer la clé").click();
    await settled();
    (t.dialog.querySelector("button.danger") as HTMLButtonElement).click();
    await settled();
    expect(t.boxes()).toEqual([true, false]);
  });

  it("rend l'erreur d'une case qui n'a pas pu être enregistrée", async () => {
    const t = setup({ key: KEY });
    await settled();
    t.fail.setAllowed = true;
    t.box(0).click();
    await settled();
    expect(t.failures).toHaveLength(1);
  });
});
