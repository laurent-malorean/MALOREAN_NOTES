import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  arrowEl,
  button,
  cardEl,
  centre,
  mount,
  sample,
  surface,
} from "../../test-support/canvas-fixture";
import "../theme.css";
import { closeContextMenu } from "./context-menu";

beforeEach(() => closeContextMenu());
afterEach(() => closeContextMenu());

describe("canvas : affichage", () => {
  it("montre chaque carte à sa place, son Markdown mis en forme, et le fond à points", async () => {
    await mount();
    const t = cardEl("t");
    expect(t.querySelector("h1")?.textContent).toBe("Titre");
    expect(t.querySelector("strong")?.textContent).toBe("texte");
    expect(t.querySelector("a")?.getAttribute("href")).toBe("#wiki-Autre%20note");
    expect(getComputedStyle(t).left).toBe("20px");
    expect(getComputedStyle(t).width).toBe("260px");
    expect(getComputedStyle(surface()).backgroundImage).toContain("radial-gradient");
  });

  it("une carte de note montre un lien, pas un aperçu ; une image est affichée ; une page web montre son adresse", async () => {
    await mount();
    const link = cardEl("n").querySelector("a.canvas-card-note") as HTMLAnchorElement;
    expect(link.textContent).toBe("Projet");
    expect(cardEl("n").querySelector("h1, p")).toBeNull();
    const image = cardEl("i").querySelector("img") as HTMLImageElement;
    expect(image.src).toContain("data:image/png");
    expect(cardEl("l").querySelector("a")?.textContent).toBe("https://jsoncanvas.org");
  });

  it("un groupe montre son nom et reste sous les autres cartes", async () => {
    await mount();
    expect(cardEl("g").querySelector(".canvas-group-label")?.textContent).toBe("Phase 1");
    expect(cardEl("g").parentElement?.className).toBe("canvas-groups");
    expect(cardEl("t").parentElement?.className).toBe("canvas-cards");
    const groupLayer = document.querySelector(".canvas-groups") as HTMLElement;
    const cardLayer = document.querySelector(".canvas-cards") as HTMLElement;
    expect(
      groupLayer.compareDocumentPosition(cardLayer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("les couleurs sont celles de la palette, ou l'hexadécimal du fichier", async () => {
    await mount();
    expect(cardEl("u").style.getPropertyValue("--card-color")).toBe("var(--palette-rouge)");
    expect(cardEl("g").style.getPropertyValue("--card-color")).toBe("var(--palette-vert)");
    expect(cardEl("l").style.getPropertyValue("--card-color")).toBe("#FF5733");
    expect(cardEl("t").style.getPropertyValue("--card-color")).toBe("");
    expect(getComputedStyle(cardEl("u")).borderTopColor).toBe("rgb(220, 38, 38)");
  });

  it("une flèche a son sens : pointe à l'arrivée, aux deux bouts, ou aucune ; son étiquette est au milieu", async () => {
    await mount();
    expect(arrowEl("e1").querySelectorAll(".canvas-arrow-head")).toHaveLength(1);
    expect(arrowEl("e2").querySelectorAll(".canvas-arrow-head")).toHaveLength(2);
    expect(arrowEl("e3").querySelectorAll(".canvas-arrow-head")).toHaveLength(0);
    const label = document.querySelector(".canvas-arrow-label") as HTMLElement;
    expect(label.textContent).toBe("détaille");
    expect(label.style.left).toBe("310px");
    expect(label.style.top).toBe("90px");
  });

  it("la barre du bas a trois boutons et la colonne de commandes les siens", async () => {
    await mount();
    expect(document.querySelectorAll(".canvas-bar .canvas-button")).toHaveLength(3);
    const labels = [...document.querySelectorAll(".canvas-controls .canvas-button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Réglages du canvas",
      "Zoomer",
      "Rétablir le zoom",
      "Tout voir",
      "Dézoomer",
      "Annuler",
      "Rétablir",
      "Aide",
    ]);
  });

  it("toutes les cartes tiennent dans la vue à l'ouverture", async () => {
    await mount();
    const area = surface().getBoundingClientRect();
    for (const id of ["g", "l", "n"]) {
      const box = centre(cardEl(id)).box;
      expect(box.left).toBeGreaterThanOrEqual(area.left);
      expect(box.right).toBeLessThanOrEqual(area.right);
      expect(box.top).toBeGreaterThanOrEqual(area.top);
      expect(box.bottom).toBeLessThanOrEqual(area.bottom);
    }
  });

  it("un canvas sans carte s'ouvre à 100 %", async () => {
    await mount({ cards: [], arrows: [], extra: [] });
    expect((document.querySelector(".canvas-world") as HTMLElement).style.transform).toContain(
      "scale(1)",
    );
    button("Zoomer").click();
    expect((document.querySelector(".canvas-world") as HTMLElement).style.transform).toContain(
      "scale(1.25)",
    );
  });
});

describe("canvas : relecture", () => {
  it("un fichier relu redessine les cartes, le Markdown déjà mis en forme est repris tel quel", async () => {
    const m = await mount();
    const again = structuredClone(m.disk.file);
    m.view.setFile({ ...again, text: "v1" });
    expect(cardEl("t").querySelector("strong")?.textContent).toBe("texte");
    expect(cardEl("n").querySelector("a")?.textContent).toBe("Projet");
  });

  it("un groupe sans nom n'a pas d'étiquette visible ; sans carte, rien à encadrer", async () => {
    const canvas = sample();
    const group = canvas.cards[0];
    if (group) group.label = null;
    await mount(canvas);
    expect((cardEl("g").querySelector(".canvas-group-label") as HTMLElement).hidden).toBe(true);
  });
});
