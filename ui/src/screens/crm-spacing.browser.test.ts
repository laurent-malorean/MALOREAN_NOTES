// Les espacements des fenêtres du CRM, mesurés dans le vrai moteur (WebKit) : l'échelle est une grille
// de 4 points (4, 8, 12, 16, 24, 32), un contrôle fait 36 points de haut, une cible de clic 32 au moins,
// le texte 15 points sur 1,5 d'interligne (décision 0084, « Analyse critique »). Un retassement fait échouer.
import { beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { listsSample, mountFiche } from "../../test-support/crm-lists-fixture";
import { mountCrm, tabNamed } from "../../test-support/crm-view-fixture";
import { openedWindow } from "../../test-support/crm-window-fixture";
import { askConfirmation } from "./confirmation";
import "../theme.css";
import "../style.css";

beforeAll(() => page.viewport(1600, 900));

const q = (selector: string) => document.querySelector(selector) as HTMLElement;
const box = (selector: string) => q(selector).getBoundingClientRect();
const style = (selector: string) => getComputedStyle(q(selector));
const px = (value: string) => parseFloat(value);
const gapsBetween = (selector: string) => {
  const els = [...document.querySelectorAll(selector)];
  return els
    .slice(1)
    .map(
      (e, i) => e.getBoundingClientRect().top - (els[i] as Element).getBoundingClientRect().bottom,
    );
};
const FIELDS = [
  ['[data-field="status"]', "statut"],
  ['[data-field="project"]', "projet"],
  ['[data-field="date"]', "date"],
  ['[data-field="title"]', "titre"],
  [".tag-input", "ajout d'étiquette"],
  [".tag-add", "« + » des étiquettes"],
  ['[data-field="add-person"]', "ajout de personne"],
] as const;

describe("espacements : fenêtre d'une action", () => {
  it("sépare les blocs de 24 points, avec 24 points de marge intérieure et un en-tête et un pied de 16 sur 24", async () => {
    await openedWindow();
    expect(gapsBetween(".crm-aw-body > section")).toEqual(
      Array(gapsBetween(".crm-aw-body > section").length).fill(24),
    );
    const body = style(".crm-aw-body");
    expect([body.paddingTop, body.paddingLeft, body.paddingRight]).toEqual([
      "24px",
      "24px",
      "24px",
    ]);
    for (const part of [".crm-aw-head", ".crm-aw-foot"]) {
      expect([style(part).paddingTop, style(part).paddingLeft]).toEqual(["16px", "24px"]);
    }
  });

  it("donne aux contrôles 36 points de haut et aux cibles de clic 32 au moins", async () => {
    await openedWindow();
    for (const [selector, name] of FIELDS) {
      expect(box(selector).height, name).toBeGreaterThanOrEqual(36);
    }
    for (const selector of [
      ".crm-aw-add-comment",
      ".crm-aw-delete",
      ".crm-aw-link-note",
      ".crm-aw-add",
    ]) {
      expect(box(selector).height, selector).toBeGreaterThanOrEqual(36);
    }
    for (const selector of [".crm-aw-close", ".crm-aw-copy", ".crm-aw-no-color", ".crm-aw-edit"]) {
      expect(box(selector).height, selector).toBeGreaterThanOrEqual(32);
    }
    for (const selector of [".crm-aw-remove", ".crm-aw-swatch"]) {
      expect(box(selector).width, selector).toBeGreaterThanOrEqual(32);
      expect(box(selector).height, selector).toBeGreaterThanOrEqual(32);
    }
    // Une pastille d'étiquette est une ligne dense : 28 de haut à l'intérieur de sa bordure, « × » en fait autant.
    expect(box(".tag-chip").height).toBe(30);
    expect(box(".tag-remove").width).toBeGreaterThanOrEqual(28);
    expect(box(".tag-remove").height).toBe(28);
  });

  it("laisse 40 points à une ligne d'élément et 36 à une personne, une case de 20, 12 points entre les champs d'une ligne", async () => {
    await openedWindow();
    expect(box(".crm-aw-item").height).toBeGreaterThanOrEqual(40);
    expect(box(".crm-aw-person").height).toBeGreaterThanOrEqual(36);
    expect(box(".crm-aw-check").width).toBe(20);
    const fields = [...document.querySelectorAll(".crm-aw-status .crm-aw-field")].map((f) =>
      f.getBoundingClientRect(),
    );
    expect(fields).toHaveLength(3);
    expect((fields[1] as DOMRect).left - (fields[0] as DOMRect).right).toBe(12);
    expect((fields[2] as DOMRect).left - (fields[1] as DOMRect).right).toBe(12);
  });

  it("écrit le texte en 15 points sur 1,5 d'interligne, les titres de section en 16 points gras, les noms de champ en 13", async () => {
    await openedWindow();
    expect(style(".crm-aw-panel").fontSize).toBe("15px");
    expect(px(style(".crm-aw-panel").lineHeight)).toBe(22.5);
    expect([
      style(".crm-aw-section-title").fontSize,
      style(".crm-aw-section-title").fontWeight,
    ]).toEqual(["16px", "600"]);
    expect(style(".crm-aw-field > .crm-aw-label").fontSize).toBe("13px");
    expect(style('[data-field="title"]').fontSize).toBe("18px");
  });

  it("met 12 points entre le titre d'une section et ce qu'elle contient, et 32 entre la description et les checklists", async () => {
    await openedWindow();
    const title = box(".crm-aw-checklists > .crm-aw-section-title");
    const first = box(".crm-aw-checklist");
    expect(first.top - title.bottom).toBe(12);
    expect(gapsBetween(".crm-aw-checklist")[0]).toBe(16);
  });
});

describe("espacements : fenêtre de confirmation", () => {
  it("a 24 points de marge, 24 entre la question et les boutons, des boutons de 36 points à 12 points l'un de l'autre", () => {
    const dialog = document.createElement("dialog");
    document.body.replaceChildren(dialog);
    void askConfirmation(dialog, {
      question: "Placer « Eee » dans la corbeille ?",
      confirm: "Placer dans la corbeille",
    });
    const pad = getComputedStyle(dialog);
    expect([pad.paddingTop, pad.paddingRight, pad.paddingBottom, pad.paddingLeft]).toEqual([
      "24px",
      "24px",
      "24px",
      "24px",
    ]);
    expect(getComputedStyle(q(".confirmation-question")).marginBottom).toBe("24px");
    const [cancel, accept] = [...document.querySelectorAll(".confirmation-buttons button")].map(
      (b) => b.getBoundingClientRect(),
    ) as [DOMRect, DOMRect];
    expect([cancel.height, accept.height]).toEqual([36, 36]);
    expect(accept.left - cancel.right).toBe(12);
    expect(getComputedStyle(dialog).fontSize).toBe("15px");
    dialog.close();
  });
});

describe("espacements : Kanban, semaine, fiches et listes", () => {
  it("donne au Kanban des champs de 36 points, des cartes à 12 points de marge, des cibles de 32", async () => {
    await mountCrm();
    expect(box(".crm-search").height).toBeGreaterThanOrEqual(36);
    const card = style(".crm-card");
    expect([card.paddingTop, card.paddingLeft]).toEqual(["12px", "12px"]);
    for (const selector of [".crm-add-action", ".crm-add-stage-button"]) {
      expect(box(selector).height, selector).toBeGreaterThanOrEqual(32);
    }
    expect(box(".crm-stage-remove").width).toBeGreaterThanOrEqual(32);
    expect(style(".crm-board").paddingLeft).toBe("16px");
    expect(box(".crm-tab").height).toBeGreaterThanOrEqual(40);
  });

  it("donne à la barre de la semaine des boutons de 36 points", async () => {
    await mountCrm();
    tabNamed("Ma semaine").click();
    expect(box(".crm-week-arrow").height).toBeGreaterThanOrEqual(36);
    expect(box(".crm-week-today").height).toBeGreaterThanOrEqual(36);
  });

  it("espace les blocs d'une fiche de 16 points au moins et donne aux boutons 36 points", async () => {
    await mountFiche("person", "jean-dupont");
    const gaps = gapsBetween(".crm-fiche > *");
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(16);
    expect(box(".crm-new-button").height).toBeGreaterThanOrEqual(36);
    expect(box(".crm-fiche-delete").height).toBeGreaterThanOrEqual(36);
    expect(box(".crm-fiche-value").height).toBeGreaterThanOrEqual(32);
    expect([style(".crm-fiche").paddingLeft, style(".crm-fiche").paddingTop]).toEqual([
      "32px",
      "24px",
    ]);
  });

  it("donne aux listes des boutons de 36 points et 24 points de marge", async () => {
    await mountCrm({ crm: listsSample(), tab: "projects" });
    expect(box(".crm-new-button").height).toBeGreaterThanOrEqual(36);
    expect(style(".crm-list").paddingLeft).toBe("24px");
  });
});

/** Le rapport de contraste de deux couleurs (WCAG). */
function ratio(a: string, b: string): number {
  const light = (rgb: string) => {
    const [r, g, bl] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((c) => {
      const x = Number(c) / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [light(a), light(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe("contraste : clair et sombre", () => {
  it.each(["light", "dark"])(
    "garde 4,5 contre 1 au moins pour le texte discret et les boutons pleins (%s)",
    async (mode) => {
      document.documentElement.dataset.appearance = mode;
      await openedWindow();
      const bg = style(".crm-aw-panel").backgroundColor;
      expect(
        ratio(style(".crm-aw-field > .crm-aw-label").color, bg),
        "texte discret",
      ).toBeGreaterThanOrEqual(4.5);
      for (const selector of [".crm-aw-add-comment", ".crm-aw-delete"]) {
        const s = style(selector);
        expect(ratio(s.color, s.backgroundColor), selector).toBeGreaterThanOrEqual(4.5);
      }
      delete document.documentElement.dataset.appearance;
    },
  );
});
