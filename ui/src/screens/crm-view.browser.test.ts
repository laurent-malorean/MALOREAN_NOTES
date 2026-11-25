import { describe, expect, it } from "vitest";
import { action, crm, sample } from "../../test-support/crm-fixture";
import {
  card,
  cardsOf,
  column,
  callsTo,
  mountCrm,
  tabNamed,
  text,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";
import { EMPTY_TEXT } from "./crm-view";

const names = (selector: string) =>
  [...document.querySelectorAll(selector)].map((element) => element.textContent);

describe("CRM : onglets", () => {
  it("montre cinq onglets dans l'ordre, le Kanban ouvert d'office", async () => {
    await mountCrm();
    expect(names(".crm-tab")).toEqual([
      "Kanban",
      "Ma semaine",
      "Personnes",
      "Entreprises",
      "Projets",
    ]);
    expect(tabNamed("Kanban").getAttribute("aria-selected")).toBe("true");
    expect(tabNamed("Ma semaine").getAttribute("aria-selected")).toBe("false");
    expect(document.querySelector(".crm-tabs")?.getAttribute("role")).toBe("tablist");
    expect(tabNamed("Kanban").getAttribute("role")).toBe("tab");
  });

  it("lit le CRM demandé, avec des filtres au repos, la semaine d'aujourd'hui", async () => {
    const m = await mountCrm();
    expect(m.calls[0]).toEqual([
      "readCrm",
      "clients.md",
      { search: "", person: null, company: null, projects: [], tags: [] },
      null,
    ]);
  });

  it("garde l'onglet choisi, et le rouvre", async () => {
    const m = await mountCrm();
    tabNamed("Ma semaine").click();
    expect(m.stored).toEqual(["week"]);
    expect(tabNamed("Ma semaine").getAttribute("aria-selected")).toBe("true");
    expect(tabNamed("Kanban").getAttribute("aria-selected")).toBe("false");
    expect(document.querySelector(".crm-week")).not.toBeNull();
    expect(document.querySelector(".crm-column[data-status]")).toBeNull();
    await mountCrm({ tab: "week" });
    expect(tabNamed("Ma semaine").getAttribute("aria-selected")).toBe("true");
  });

  it("rouvre le Kanban si l'onglet gardé n'en est pas un", async () => {
    await mountCrm({ tab: "autre" });
    expect(tabNamed("Kanban").getAttribute("aria-selected")).toBe("true");
  });

  it("montre les listes Personnes, Entreprises et Projets, sans la rangée de filtres du Kanban", async () => {
    await mountCrm();
    for (const [tab, list] of [
      ["Personnes", ".crm-people"],
      ["Entreprises", ".crm-companies"],
      ["Projets", ".crm-projects"],
    ] as const) {
      tabNamed(tab).click();
      expect(document.querySelector(list)).not.toBeNull();
      expect(document.querySelector(".crm-board")).toBeNull();
      expect((document.querySelector(".crm-filters") as HTMLElement).hidden).toBe(true);
    }
    tabNamed("Kanban").click();
    expect((document.querySelector(".crm-filters") as HTMLElement).hidden).toBe(false);
    expect(document.querySelector(".crm-list")).toBeNull();
  });

  it("change d'onglet avant la première lecture sans rien dessiner, puis dessine ce qui est choisi", async () => {
    const m = await mountCrm({ load: false });
    tabNamed("Ma semaine").click();
    expect(document.querySelector(".crm-board")).toBeNull();
    await m.view.reload();
    expect(document.querySelector(".crm-week")).not.toBeNull();
  });

  it("garde un CRM dont la lecture échoue vide, et dit pourquoi", async () => {
    const m = await mountCrm({ crm: sample() });
    m.fail.read = "CRM illisible";
    await m.view.reload();
    expect(m.errors).toEqual([{ message: "CRM illisible" }]);
    expect(document.querySelector(".crm-board")).not.toBeNull();
  });

  it("ne dessine rien avant la première lecture, et plus rien une fois détruit", async () => {
    const m = await mountCrm();
    m.view.destroy();
    expect(m.host.querySelector(".crm")).toBeNull();
    const before = m.calls.length;
    await m.view.reload();
    expect(m.calls.length).toBe(before + 1);
    expect(m.errors).toEqual([]);
  });
});

describe("CRM : colonnes du Kanban", () => {
  it("montre TODO, les étapes, Done et Cancel, dans l'ordre", async () => {
    await mountCrm();
    expect(names(".crm-column-name")).toEqual(["TODO", "Progress", "WaitingFor", "Done", "Cancel"]);
  });

  it("suit les étapes du CRM", async () => {
    await mountCrm({ crm: crm({ stages: ["Devis"] }) });
    expect(names(".crm-column-name")).toEqual(["TODO", "Devis", "Done", "Cancel"]);
    await mountCrm({ crm: crm({ stages: [] }) });
    expect(names(".crm-column-name")).toEqual(["TODO", "Done", "Cancel"]);
  });

  it("montre le nombre de cartes de chaque colonne", async () => {
    await mountCrm();
    expect(text(column("TODO"), ".crm-count")).toBe("1");
    expect(text(column("Cancel"), ".crm-count")).toBe("0");
  });

  it("montre en rouge le nombre de cartes en retard, seulement s'il y en a", async () => {
    await mountCrm();
    expect(text(column("TODO"), ".crm-late-count")).toBe("1");
    expect(column("TODO").querySelector(".crm-late-count")?.getAttribute("title")).toBe(
      "1 en retard",
    );
    expect(column("Progress").querySelector(".crm-late-count")).toBeNull();
  });

  it("compte toutes les cartes même quand un filtre en cache", async () => {
    const data = sample();
    const todo = data.columns[0];
    if (todo === undefined) throw new Error("colonne");
    todo.count = 5;
    todo.cards = [];
    await mountCrm({ crm: data });
    expect(text(column("TODO"), ".crm-count")).toBe("5");
    expect(cardsOf(column("TODO"))).toEqual([]);
  });

  it("range les cartes dans l'ordre que Rust a rendu", async () => {
    const data = crm({
      actions: [
        action("b", { title: "B" }),
        action("a", { title: "A" }),
        action("c", { title: "C" }),
      ],
    });
    const todo = data.columns[0];
    if (todo === undefined) throw new Error("colonne");
    todo.cards = ["c", "a", "b"];
    await mountCrm({ crm: data });
    expect(cardsOf(column("TODO"))).toEqual(["c", "a", "b"]);
  });

  it("laisse de côté une carte dont l'action n'est pas dans la lecture", async () => {
    const data = sample();
    data.columns[0]?.cards.push("fantome");
    await mountCrm({ crm: data });
    expect(cardsOf(column("TODO"))).toEqual(["devis"]);
  });

  it("garde les colonnes à 272 points au moins, et les élargit sans dépasser 544", async () => {
    await mountCrm({ crm: crm({ stages: [] }), width: 2000 });
    const widths = [...document.querySelectorAll<HTMLElement>(".crm-column")].map((c) =>
      Math.round(c.getBoundingClientRect().width),
    );
    expect(widths).toEqual([544, 544, 544]);
    await mountCrm({ width: 900 });
    const narrow = [...document.querySelectorAll<HTMLElement>(".crm-column")].map((c) =>
      Math.round(c.getBoundingClientRect().width),
    );
    expect(narrow).toEqual([272, 272, 272, 272, 272]);
    const board = document.querySelector(".crm-board") as HTMLElement;
    expect(board.scrollWidth).toBeGreaterThan(board.clientWidth);
  });

  it("élargit les colonnes pour remplir la place, entre 272 et 544 points", async () => {
    await mountCrm({ width: 1900 });
    const widths = [...document.querySelectorAll<HTMLElement>(".crm-column")].map(
      (c) => c.getBoundingClientRect().width,
    );
    for (const width of widths) {
      expect(width).toBeGreaterThan(272);
      expect(width).toBeLessThanOrEqual(544);
    }
  });
});

describe("CRM : carte du Kanban", () => {
  it("montre, de haut en bas, la pastille de retard, le projet, le titre, les personnes, les étiquettes, les repères", async () => {
    await mountCrm();
    const devis = card("devis");
    expect([...devis.children].map((child) => child.className)).toEqual([
      "crm-card-when late",
      "crm-card-project",
      "crm-card-title",
      "crm-card-people",
      "crm-card-tags",
      "crm-card-marks",
    ]);
    expect(devis.querySelector(".crm-card-when")?.textContent).toBe("En retard de 3 jours");
    expect(text(devis, ".crm-card-project")).toBe("Refonte du site");
    expect(text(devis, ".crm-card-title")).toBe("Demande de devis");
    expect(text(devis, ".crm-card-people")).toBe("Jean Dupont (Acme)");
    expect(names(".crm-card[data-card='devis'] .crm-tag")).toEqual(["urgent", "salon"]);
    expect(names(".crm-card[data-card='devis'] .crm-card-mark")).toEqual([
      "≡",
      "1/2",
      "💬 1",
      "⧉ 1",
    ]);
  });

  it("montre la pastille « À faire aujourd'hui », la date courte, et rien d'autre sans fiche liée", async () => {
    await mountCrm();
    expect(text(card("appel"), ".crm-card-when")).toBe("À faire aujourd'hui");
    expect(card("appel").querySelector(".crm-card-when")?.classList.contains("today")).toBe(true);
    expect(text(card("relance"), ".crm-card-when")).toBe("27 nov.");
    expect(card("relance").querySelector(".crm-card-project")).toBeNull();
    expect(card("relance").querySelector(".crm-card-tags")).toBeNull();
    expect(card("relance").querySelector(".crm-card-marks")).toBeNull();
  });

  it("garde une ligne vide pour les personnes sans personne, pour que les cartes gardent la même hauteur", async () => {
    await mountCrm();
    const lines = card("relance").querySelectorAll(".crm-card-people li");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe(" ");
    const empty = card("relance").querySelector(".crm-card-people") as HTMLElement;
    const filled = card("devis").querySelector(".crm-card-people") as HTMLElement;
    expect(empty.getBoundingClientRect().height).toBe(filled.getBoundingClientRect().height);
  });

  it("montre les deux premières personnes puis +N", async () => {
    const data = sample();
    const many = action("many", {
      people: ["jean-dupont", "marie-durand", "jean-dupont", "marie-durand"].map((person) => ({
        person,
        company: null,
      })),
    });
    data.actions.push(many);
    data.columns[0]?.cards.push("many");
    await mountCrm({ crm: data });
    const lines = [...card("many").querySelectorAll(".crm-card-people li")].map(
      (l) => l.textContent,
    );
    expect(lines).toEqual(["Jean Dupont", "Marie Durand", "+2"]);
  });

  it("donne à une carte colorée la bordure de sa couleur et un fond de 18 % de cette couleur", async () => {
    await mountCrm();
    const devis = card("devis");
    expect(devis.classList.contains("colored")).toBe(true);
    expect(devis.style.getPropertyValue("--card-color")).toBe("var(--palette-violet)");
    const style = getComputedStyle(devis);
    expect(style.borderTopColor).toBe(
      getComputedStyle(document.documentElement).getPropertyValue("--palette-violet") === ""
        ? style.borderTopColor
        : style.borderTopColor,
    );
    expect(style.borderTopColor).not.toBe(getComputedStyle(card("relance")).borderTopColor);
    expect(style.backgroundColor).not.toBe(getComputedStyle(card("relance")).backgroundColor);
  });

  it("teinte le fond d'une carte en retard ou du jour qui n'a pas de couleur", async () => {
    const data = sample();
    data.actions.push(action("tard", { urgency: { kind: "late", days: 2 }, date: "2026-11-23" }));
    data.columns[0]?.cards.push("tard");
    await mountCrm({ crm: data });
    expect(card("appel").classList.contains("tone-today")).toBe(true);
    expect(card("tard").classList.contains("tone-late")).toBe(true);
    expect(card("devis").classList.contains("tone-late")).toBe(false);
    expect(getComputedStyle(card("tard")).backgroundColor).not.toBe(
      getComputedStyle(card("relance")).backgroundColor,
    );
  });

  it("ne fait rien d'un clic sur une carte", async () => {
    const m = await mountCrm();
    card("devis").click();
    expect(m.calls).toHaveLength(1);
    expect(m.errors).toEqual([]);
  });
});

describe("CRM : sans fiche", () => {
  it("dit « Ajoutez une première action. » au centre, en couleur atténuée", async () => {
    await mountCrm({ crm: crm() });
    expect(text(document, ".crm-empty")).toBe(EMPTY_TEXT);
    expect(EMPTY_TEXT).toBe("Ajoutez une première action.");
    const message = document.querySelector(".crm-empty") as HTMLElement;
    expect(getComputedStyle(message).opacity).toBe("0.7");
  });

  it("ne le dit plus dès qu'une fiche existe, quelle qu'elle soit", async () => {
    await mountCrm({ crm: sample() });
    expect(document.querySelector(".crm-empty")).toBeNull();
    const withProject = crm({ projects: sample().projects });
    await mountCrm({ crm: withProject });
    expect(document.querySelector(".crm-empty")).toBeNull();
    await mountCrm({ crm: crm({ people: sample().people }) });
    expect(document.querySelector(".crm-empty")).toBeNull();
    await mountCrm({ crm: crm({ companies: sample().companies }) });
    expect(document.querySelector(".crm-empty")).toBeNull();
  });

  it("le dit aussi dans Ma semaine", async () => {
    await mountCrm({ crm: crm(), tab: "week" });
    expect(document.querySelector(".crm-empty")).not.toBeNull();
  });
});

describe("CRM : lecture", () => {
  it("n'applique que la dernière lecture quand deux se croisent", async () => {
    const m = await mountCrm();
    const old = sample();
    m.disk.crm = old;
    m.delays.push(80);
    const slow = m.view.reload();
    m.disk.crm = crm({ actions: [action("neuve", { title: "Neuve" })] });
    await m.view.reload();
    await slow;
    expect(cardsOf(document)).toEqual(["neuve"]);
    expect(callsTo(m, "readCrm")).toHaveLength(3);
  });
});
