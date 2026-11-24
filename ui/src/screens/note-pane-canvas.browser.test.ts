import { describe, expect, it, vi } from "vitest";
import { sample } from "../../test-support/canvas-fixture";
import { fakeBackend } from "../../test-support/pane-fixture";
import type { CanvasDeps } from "./canvas-pane";
import { createPane } from "./note-pane";
import { createSharedNotes } from "./shared-notes";
import "../theme.css";

function mount(empty = false) {
  const element = document.createElement("section");
  element.style.cssText = "width:900px;height:600px;display:flex;flex-direction:column";
  const backlinks = document.createElement("nav");
  const related = document.createElement("nav");
  element.append(backlinks, related);
  document.body.replaceChildren(element);
  const fake = fakeBackend({ "plan.canvas": "{}", "autre.md": "# Autre" });
  const log: string[] = [];
  const written: Uint8Array[] = [];
  const shown: string[] = [];
  const file = { canvas: empty ? { cards: [], arrows: [], extra: [] } : sample(), text: "v0" };
  let chosenGroup: string | null = "g";
  let destination: { path: string; folder: string } | null = {
    path: "/tmp/plan.png",
    folder: "/tmp",
  };
  const canvas: CanvasDeps = {
    readCanvas: async (path) => (log.push(`lire ${path}`), structuredClone(file)),
    saveCanvas: async (path, base, next) => (
      log.push(`enregistrer ${path} ${base}`),
      { canvas: next, text: "v1" }
    ),
    chooseExportFile: async (title, format, folder, near) => (
      log.push(`choisir ${title} ${format} ${folder} ${near}`),
      destination
    ),
    exportImage: async (to, png) => void (log.push(`écrire ${to}`), written.push(png)),
    openWebAddress: async () => undefined,
    chooseNote: async () => null,
    chooseMedia: async () => null,
    askText: async () => null,
    copy: () => undefined,
    chooseGroup: async () => chosenGroup,
  };
  const ignore = () => {};
  const shared = createSharedNotes({
    backend: fake.backend,
    events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
  });
  const pane = createPane(
    { element, backlinks, related },
    {
      backend: fake.backend,
      shared,
      events: {
        openNote: (path) => log.push(`ouvrir ${path}`),
        openLink: ignore,
        error: (e) => log.push(`erreur ${String(e)}`),
        show: (m) => shown.push(m),
      },
      resolveImage: () => "",
      canvas,
    },
  );
  return {
    pane,
    element,
    log,
    written,
    shown,
    cancel: () => void (destination = null),
    noGroup: () => void (chosenGroup = null),
  };
}

const shown = (element: HTMLElement) => element.classList.contains("canvas-shown");

describe("colonne : un canvas", () => {
  it("montre le canvas à la place de l'éditeur, puis l'éditeur pour une note", async () => {
    const m = mount();
    await m.pane.load("plan.canvas");
    expect(shown(m.element)).toBe(true);
    await vi.waitFor(() => expect(m.element.querySelectorAll(".canvas-card")).toHaveLength(6));
    await m.pane.load("autre.md");
    expect(shown(m.element)).toBe(false);
    expect(m.element.querySelector(".canvas-view")).toBeNull();
    await m.pane.load(null);
    expect(m.pane.canvasPane()?.shown()).toBe(false);
  });

  it("un clic sur une carte de note ouvre la note", async () => {
    const m = mount();
    await m.pane.load("plan.canvas");
    await vi.waitFor(() => expect(m.element.querySelector(".canvas-card-note")).not.toBeNull());
    (m.element.querySelector(".canvas-card-note") as HTMLElement).click();
    expect(m.log).toContain("ouvrir Notes/Projet.md");
  });

  it("« tout voir » recadre ; « aller à un groupe » centre sur le groupe choisi ou ne fait rien", async () => {
    const m = mount();
    await m.pane.load("plan.canvas");
    const canvasPane = m.pane.canvasPane();
    canvasPane?.fitAll();
    await canvasPane?.goToGroup();
    expect(m.element.querySelector(".canvas-card.selected")?.getAttribute("data-id")).toBe("g");
    m.noGroup();
    await canvasPane?.goToGroup();
    const empty = mount(true);
    await empty.pane.load("plan.canvas");
    await empty.pane.canvasPane()?.goToGroup();
    expect(empty.shown).toEqual(["Ce canvas n'a aucun groupe."]);
  });

  it("sans canvas montré, les commandes ne font rien", async () => {
    const m = mount();
    await m.pane.load("autre.md");
    await m.pane.canvasPane()?.goToGroup();
    await m.pane.canvasPane()?.exportImage();
    m.pane.canvasPane()?.fitAll();
    expect(m.log.filter((l) => l.startsWith("choisir"))).toEqual([]);
  });

  it("un canvas vide ne s'exporte pas", async () => {
    const m = mount(true);
    await m.pane.load("plan.canvas");
    await m.pane.canvasPane()?.exportImage();
    expect(m.shown).toEqual(["Un canvas vide ne s'exporte pas."]);
  });

  it("l'image PNG montre toutes les cartes et les flèches au bon endroit, avec 40 points de marge", async () => {
    const m = mount();
    await m.pane.load("plan.canvas");
    await vi.waitFor(() =>
      expect(m.element.querySelector(".canvas-card-text strong")).not.toBeNull(),
    );
    await m.pane.canvasPane()?.exportImage();
    expect(m.log).toContain("choisir plan png null plan.canvas");
    expect(m.log).toContain("écrire /tmp/plan.png");
    const bitmap = await createImageBitmap(
      new Blob([m.written[0] as BlobPart], { type: "image/png" }),
    );
    // Le cadre : de (-40, -40) à (1140, 440), soit 1180 × 480 points, deux pixels par point.
    expect([bitmap.width, bitmap.height]).toEqual([2360, 960]);
    const sheet = document.createElement("canvas");
    sheet.width = bitmap.width;
    sheet.height = bitmap.height;
    const context = sheet.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    const pixel = (x: number, y: number) => [
      ...context.getImageData((x + 40) * 2, (y + 40) * 2, 1, 1).data,
    ];
    const background = pixel(-20, -20);
    // Chaque carte a sa zone dessinée : son bord n'est pas celui du fond.
    for (const [x, y] of [
      [20, 100],
      [340, 80],
      [800, 100],
      [30, 280],
    ] as const)
      expect(pixel(x, y)).not.toEqual(background);
    // Le groupe est vert, la carte rouge a un bord rouge.
    expect(pixel(2, 200)[1]).toBeGreaterThan(pixel(2, 200)[0] ?? 0);
    expect(pixel(341, 80)[0]).toBeGreaterThan(150);
    // Entre le groupe et la page web, rien.
    expect(pixel(750, 300)).toEqual(background);
  });

  it("annuler la fenêtre d'enregistrement n'écrit rien", async () => {
    const m = mount();
    await m.pane.load("plan.canvas");
    await vi.waitFor(() =>
      expect(m.element.querySelector(".canvas-card-text strong")).not.toBeNull(),
    );
    m.cancel();
    await m.pane.canvasPane()?.exportImage();
    expect(m.written).toHaveLength(0);
  });
});
