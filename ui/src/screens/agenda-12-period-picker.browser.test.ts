import { beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { eventItem } from "../../test-support/agenda-12-fixture";
import type { Choice } from "../state/agenda-12-date-pick";
import { createPeriodPicker } from "./agenda-12-period-picker";
import "../theme.css";
import "../style.css";
import "./agenda-12.css";

beforeAll(() => page.viewport(1000, 700));

type Event = ReturnType<typeof eventItem>;
const event = (over: Partial<Event> = {}): Event =>
  eventItem({ month: 9, day: 13, year: 2027, end: null, ...over });

function mount(first: Event = event(), hostStyle = "padding:40px;width:700px") {
  const choices: Choice[] = [];
  const state = { hold: null as Promise<void> | null };
  const picker = createPeriodPicker({
    currentYear: () => 2026,
    apply: async (choice) => {
      choices.push(choice);
      await state.hold;
    },
  });
  picker.show(first);
  const host = document.createElement("div");
  host.className = "agenda-band";
  host.style.cssText = hostStyle;
  host.append(picker.element);
  document.body.replaceChildren(host);
  return { picker, choices, host, state };
}

const popup = () => document.querySelector<HTMLElement>(".agenda-period-popup");
const trigger = () => document.querySelector(".agenda-period-trigger") as HTMLButtonElement;
const q = (selector: string) => document.querySelector(selector) as HTMLButtonElement;
const all = (selector: string) => [...document.querySelectorAll<HTMLButtonElement>(selector)];
const month = (n: number) => q(`[data-grid="months"][data-n="${String(n)}"]`);
const day = (n: number) => q(`[data-grid="days"][data-n="${String(n)}"]`);
const box = (e: Element) => e.getBoundingClientRect();
/** Un bouton par son texte ou son nom : dans la fenêtre si elle est ouverte (« Effacer la fin » est aussi le nom du « × » du champ). */
const named = (name: string) =>
  [...(popup() ?? document).querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  ) as HTMLButtonElement;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = (name: string, target: Element = document.activeElement as Element) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
  );
const accent = () => {
  const probe = document.createElement("i");
  probe.style.background = "var(--accent)";
  document.body.append(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
};

describe("sélecteur de période : le bouton-champ", () => {
  it("dit la date en toutes lettres, avec une icône calendrier, sur 36 points de haut", () => {
    mount(event({ day: 5, month: 10, year: 2026, end: { day: 11, month: 10 } }));
    expect(trigger().textContent).toBe("5 – 11 octobre 2026");
    expect(trigger().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(box(trigger()).height).toBe(36);
    expect(popup()).toBeNull();
  });

  it("suit l'événement relu : mois seul, un jour, une fin le mois suivant, deux années", () => {
    const { picker } = mount(event({ day: null, end: null, year: 2027 }));
    expect(trigger().textContent).toBe("septembre 2027");
    picker.show(event({ day: 13, end: null }));
    expect(trigger().textContent).toBe("13 septembre 2027");
    picker.show(event({ day: 30, month: 1, year: 2027, end: { day: 2, month: 2 } }));
    expect(trigger().textContent).toBe("30 janvier – 2 février 2027");
    picker.show(event({ day: 13, year: 2026, end: { day: 23, month: 6 } }));
    expect(trigger().textContent).toBe("13 septembre 2026 – 23 juin 2027");
    picker.show(event({ day: null, year: null, month: 2 }));
    expect(trigger().textContent).toBe("février");
  });

  it("« Effacer la fin » n'est là que s'il y a une fin, et ne dit que cela", () => {
    const first = mount(event());
    expect(q(".agenda-period-clear").hidden).toBe(true);
    first.picker.show(event({ end: { day: 23, month: 9 } }));
    expect(q(".agenda-period-clear").hidden).toBe(false);
    expect(q(".agenda-period-clear").getAttribute("aria-label")).toBe("Effacer la fin");
    q(".agenda-period-clear").click();
    expect(first.choices[0]?.changes).toEqual([{ kind: "end", end: null }]);
  });
});

describe("sélecteur de période : la fenêtre ouverte", () => {
  it("s'ouvre au clic : une fenêtre nommée, la barre d'année, les mois, le calendrier, les deux boutons", () => {
    mount();
    trigger().click();
    expect(popup()?.getAttribute("role")).toBe("dialog");
    expect(popup()?.getAttribute("aria-label")).toBe("Choisir la date");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(q(".agenda-period-year").textContent).toBe("2027");
    expect(named("Année précédente")).toBeDefined();
    expect(named("Année suivante")).toBeDefined();
    expect(
      all('[data-grid="months"]')
        .map((b) => b.textContent)
        .slice(0, 3),
    ).toEqual(["janv.", "févr.", "mars"]);
    expect(q(".agenda-period-view").textContent).toBe("septembre 2027");
    expect(named("Mois entier")).toBeDefined();
    expect(named("Effacer la fin")).toBeDefined();
  });

  it("sans année, la barre dit « Sans année »", () => {
    mount(event({ year: null }));
    trigger().click();
    expect(q(".agenda-period-year").textContent).toBe("Sans année");
    expect(q(".agenda-period-view").textContent).toBe("septembre");
  });

  it("les mois : 3 colonnes sur 4 lignes, cases de même taille alignées, le mois de l'événement en évidence", () => {
    mount();
    trigger().click();
    const months = all('[data-grid="months"]');
    expect(months).toHaveLength(12);
    const tops = [...new Set(months.map((b) => Math.round(box(b).top)))];
    expect(tops).toHaveLength(4);
    expect(new Set(months.map((b) => Math.round(box(b).left))).size).toBe(3);
    expect(
      new Set(
        months.map(
          (b) => `${String(Math.round(box(b).width))}x${String(Math.round(box(b).height))}`,
        ),
      ).size,
    ).toBe(1);
    expect(month(9).getAttribute("aria-pressed")).toBe("true");
    expect(month(8).getAttribute("aria-pressed")).toBe("false");
    expect(getComputedStyle(month(9)).backgroundColor).toBe(accent());
    expect(getComputedStyle(month(8)).backgroundColor).not.toBe(accent());
    expect(month(9).getAttribute("aria-label")).toBe("septembre");
  });

  it("le calendrier : l m m j v s d, lundi en premier, le 1er sous son jour, six lignes au plus, cases alignées", () => {
    mount(event({ month: 10, day: 13 }));
    trigger().click();
    const heads = all(".agenda-period-weekday").map((e) => e.textContent);
    expect(heads.join("")).toBe("lmmjvsd");
    // Octobre 2027 commence un vendredi : le 1er est sous « v ».
    expect(Math.round(box(day(1)).left)).toBe(
      Math.round(box(document.querySelectorAll(".agenda-period-weekday")[4] as Element).left),
    );
    expect(Math.round(box(day(8)).left)).toBe(Math.round(box(day(1)).left));
    expect(Math.round(box(day(31)).left)).toBe(Math.round(box(day(3)).left));
    const rows = new Set(all('[data-grid="days"]').map((b) => Math.round(box(b).top)));
    expect(rows.size).toBeLessThanOrEqual(6);
    const sizes = new Set(all('[data-grid="days"]').map((b) => Math.round(box(b).height)));
    expect(sizes.size).toBe(1);
    expect(day(13).getAttribute("aria-label")).toBe("13 octobre 2027");
    expect(q('[aria-label^="Jours"]').getAttribute("aria-label")).toBe("Jours : octobre 2027");
  });

  it("février n'a pas de 29 une année non bissextile, en a un sans année", () => {
    mount(event({ month: 2, day: 10, year: 2027 }));
    trigger().click();
    expect(all('[data-grid="days"]')).toHaveLength(28);
    document.body.replaceChildren();
    mount(event({ month: 2, day: 10, year: null }));
    trigger().click();
    expect(all('[data-grid="days"]')).toHaveLength(29);
  });

  it("la plage est surlignée entre le début et la fin, à la couleur d'accent du thème", () => {
    mount(event({ month: 10, day: 5, year: 2026, end: { day: 11, month: 10 } }));
    trigger().click();
    expect(day(5).dataset.mark).toBe("start");
    expect(day(11).dataset.mark).toBe("end");
    expect(day(8).dataset.mark).toBe("between");
    expect(day(12).dataset.mark).toBe("plain");
    expect(getComputedStyle(day(5)).backgroundColor).toBe(accent());
    expect(getComputedStyle(day(11)).backgroundColor).toBe(accent());
    const between = getComputedStyle(day(8)).backgroundColor;
    expect(between).not.toBe(accent());
    expect(between).not.toBe(getComputedStyle(day(12)).backgroundColor);
    expect(day(5).getAttribute("aria-pressed")).toBe("true");
    expect(day(8).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("sélecteur de période : l'année", () => {
  it("les flèches changent d'année ; sans année, elles partent de l'année en cours", async () => {
    const m = mount();
    trigger().click();
    named("Année suivante").click();
    await flush();
    named("Année précédente").click();
    expect(m.choices.map((c) => c.changes)).toEqual([
      [{ kind: "year", year: 2028 }],
      [{ kind: "year", year: 2026 }],
    ]);
    document.body.replaceChildren();
    const none = mount(event({ year: null }));
    trigger().click();
    named("Année suivante").click();
    expect(none.choices[0]?.changes).toEqual([{ kind: "year", year: 2026 }]);
  });

  it("un clic sur l'année ouvre la liste : « Sans année », l'année en cours et les dix suivantes", () => {
    mount();
    trigger().click();
    q(".agenda-period-year").click();
    expect(q(".agenda-period-year").getAttribute("aria-expanded")).toBe("true");
    const options = all('[role="option"]');
    expect(options.map((o) => o.textContent)).toEqual([
      "Sans année",
      ...Array.from({ length: 11 }, (_, i) => String(2026 + i)),
    ]);
    expect(
      options.filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.textContent),
    ).toEqual(["2027"]);
    expect(document.querySelector('[data-grid="months"]')).toBeNull();
    expect(new Set(options.map((o) => Math.round(box(o).left))).size).toBe(3);
  });

  it("une année hors plage reste dans la liste, choisie", () => {
    mount(event({ year: 2019 }));
    trigger().click();
    q(".agenda-period-year").click();
    expect(
      all('[role="option"]')
        .map((o) => o.textContent)
        .slice(0, 3),
    ).toEqual(["Sans année", "2019", "2026"]);
    expect(
      all('[role="option"]').find((o) => o.getAttribute("aria-selected") === "true")?.textContent,
    ).toBe("2019");
  });

  it("choisir une année, ou « Sans année », est un choix, et la liste se referme", async () => {
    const m = mount();
    trigger().click();
    q(".agenda-period-year").click();
    all('[role="option"]')
      .find((o) => o.textContent === "2030")
      ?.click();
    await flush();
    expect(m.choices[0]?.changes).toEqual([{ kind: "year", year: 2030 }]);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    q(".agenda-period-year").click();
    all('[role="option"]')[0]?.click();
    expect(m.choices[1]?.changes).toEqual([{ kind: "year", year: null }]);
  });
});

describe("sélecteur de période : le mois", () => {
  it("un clic sur un mois est un choix ; le mois déjà choisi ne dit rien", async () => {
    const m = mount();
    trigger().click();
    month(11).click();
    await flush();
    month(9).click();
    expect(m.choices[0]?.changes).toEqual([{ kind: "month", month: 11 }]);
    expect(m.choices[1]?.changes).toEqual([]);
  });

  it("un mois où le jour n'existe pas retire le jour, avec un message", () => {
    const m = mount(event({ month: 1, day: 31, end: null }));
    trigger().click();
    month(4).click();
    expect(m.choices[0]?.notice).toBe("Ce jour n'existe pas dans ce mois : il a été retiré.");
    expect(m.choices[0]?.changes).toEqual([
      { kind: "day", day: null },
      { kind: "month", month: 4 },
    ]);
  });
});

describe("sélecteur de période : la plage de jours", () => {
  it("un premier clic fixe le début et dit d'attendre la fin ; un second fixe la fin et ferme", async () => {
    const m = mount(event({ day: null }));
    trigger().click();
    day(13).click();
    await flush();
    expect(m.choices[0]?.changes).toEqual([{ kind: "day", day: 13 }]);
    expect(popup()).not.toBeNull();
    m.picker.show(event({ day: 13 }));
    expect(q(".agenda-period-hint").hidden).toBe(false);
    expect(q(".agenda-period-hint").textContent).toBe(
      "Choisissez le dernier jour, ou le même jour pour un seul jour.",
    );
    day(23).click();
    expect(m.choices[1]?.changes).toEqual([{ kind: "end", end: { day: 23, month: 9 } }]);
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("le même jour deux fois fait un seul jour : la fenêtre ferme, rien n'est écrit", async () => {
    const m = mount(event({ day: null }));
    trigger().click();
    day(13).click();
    await flush();
    m.picker.show(event({ day: 13 }));
    day(13).click();
    expect(m.choices[1]?.changes).toEqual([]);
    expect(popup()).toBeNull();
  });

  it("un jour avant le début recommence la plage", async () => {
    const m = mount(event({ day: 13 }));
    trigger().click();
    day(5).click();
    await flush();
    expect(m.choices[0]?.changes).toEqual([{ kind: "day", day: 5 }]);
    expect(popup()).not.toBeNull();
  });

  it("la flèche du calendrier montre le mois suivant, où un jour fixe la fin (jour et mois)", async () => {
    const m = mount(event({ month: 1, day: 30, year: 2027 }));
    trigger().click();
    expect((named("Mois précédent") as HTMLButtonElement).disabled).toBe(true);
    named("Mois suivant").click();
    expect(q(".agenda-period-view").textContent).toBe("février 2027");
    expect(named("Mois précédent").disabled).toBe(false);
    day(2).click();
    expect(m.choices[0]?.changes).toEqual([{ kind: "end", end: { day: 2, month: 2 } }]);
    expect(popup()).toBeNull();
  });

  it("de décembre on passe à janvier de l'année suivante", () => {
    mount(event({ month: 12, day: 30, year: 2026 }));
    trigger().click();
    named("Mois suivant").click();
    expect(q(".agenda-period-view").textContent).toBe("janvier 2027");
    expect(day(2).getAttribute("aria-label")).toBe("2 janvier 2027");
  });

  it("onze mois plus loin au plus", () => {
    mount();
    trigger().click();
    for (let i = 0; i < 20; i += 1) {
      const next = named("Mois suivant");
      if (!next.disabled) next.click();
    }
    expect(q(".agenda-period-view").textContent).toBe("août 2028");
    expect(named("Mois suivant").disabled).toBe(true);
  });

  it("sans jour de début, les jours d'un mois suivant sont grisés, avec la consigne", () => {
    mount(event({ day: null }));
    trigger().click();
    named("Mois suivant").click();
    expect(all('[data-grid="days"]').every((b) => b.disabled)).toBe(true);
    expect(q(".agenda-period-hint").textContent).toBe("Choisissez d'abord le jour de début.");
  });

  it("« Mois entier » efface le jour et ferme ; « Effacer la fin » n'efface que la fin", async () => {
    const m = mount(event({ day: 13, end: { day: 23, month: 9 } }));
    trigger().click();
    named("Effacer la fin").click();
    await flush();
    expect(m.choices[0]?.changes).toEqual([{ kind: "end", end: null }]);
    named("Mois entier").click();
    expect(m.choices[1]?.changes).toEqual([
      { kind: "end", end: null },
      { kind: "day", day: null },
    ]);
    expect(popup()).toBeNull();
  });

  it("« Mois entier » est grisé sans jour, « Effacer la fin » sans fin", () => {
    mount(event({ day: null }));
    trigger().click();
    expect(named("Mois entier").disabled).toBe(true);
    expect(named("Effacer la fin").disabled).toBe(true);
  });

  it("un clic pendant qu'un choix s'applique est ignoré", async () => {
    const m = mount();
    let release = () => {};
    m.state.hold = new Promise((resolve) => (release = resolve));
    trigger().click();
    month(11).click();
    month(12).click();
    release();
    await flush();
    expect(m.choices).toHaveLength(1);
  });
});

describe("sélecteur de période : le clavier", () => {
  it("Entrée ouvre, le curseur sur le mois de l'événement ; la flèche du bas ouvre aussi", async () => {
    mount();
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(month(9));
    key("Escape");
    key("ArrowDown", trigger());
    expect(popup()).not.toBeNull();
  });

  it("flèches dans les mois : droite, bas, gauche, haut, et les bords", () => {
    mount(event({ month: 5 }));
    trigger().click();
    expect(document.activeElement).toBe(month(5));
    key("ArrowRight");
    key("ArrowDown");
    expect(document.activeElement).toBe(month(9));
    key("ArrowLeft");
    key("ArrowUp");
    expect(document.activeElement).toBe(month(5));
    key("ArrowUp");
    key("ArrowUp");
    expect(document.activeElement).toBe(month(2));
    key("ArrowUp");
    expect(document.activeElement).toBe(month(2));
    key("ArrowLeft");
    key("ArrowLeft");
    expect(document.activeElement).toBe(month(1));
  });

  it("flèches dans les jours : d'un jour à l'autre, d'une semaine à l'autre ; Entrée choisit", async () => {
    const m = mount(event({ month: 10, day: 13, year: 2027 }));
    trigger().click();
    month(10).focus();
    day(13).focus();
    key("ArrowRight");
    expect(document.activeElement).toBe(day(14));
    key("ArrowDown");
    expect(document.activeElement).toBe(day(21));
    key("ArrowLeft");
    key("ArrowUp");
    expect(document.activeElement).toBe(day(13));
    key("ArrowUp");
    key("ArrowUp");
    expect(document.activeElement).toBe(day(6));
    key("ArrowUp");
    expect(document.activeElement).toBe(day(6));
    await userEvent.keyboard("{Enter}");
    expect(m.choices[0]?.changes).toEqual([{ kind: "day", day: 6 }]);
  });

  it("Espace choisit un mois", async () => {
    const m = mount();
    trigger().click();
    key("ArrowRight");
    await userEvent.keyboard(" ");
    expect(m.choices[0]?.changes).toEqual([{ kind: "month", month: 10 }]);
  });

  it("Échap ferme et rend le curseur au champ, sans remonter ; dans la liste des années, il ferme la liste seule", () => {
    mount();
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    trigger().click();
    q(".agenda-period-year").click();
    key("Escape");
    expect(popup()).not.toBeNull();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(q(".agenda-period-year"));
    key("Escape");
    document.removeEventListener("keydown", seen);
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(seen).not.toHaveBeenCalled();
  });

  it("flèches dans la liste des années", () => {
    mount();
    trigger().click();
    q(".agenda-period-year").click();
    expect((document.activeElement as HTMLElement).dataset.n).toBe("0");
    key("ArrowRight");
    key("ArrowDown");
    expect((document.activeElement as HTMLElement).dataset.n).toBe("4");
  });

  it("chaque grille a un seul arrêt de Tab : le choisi, sinon le premier jour possible", () => {
    mount(event({ day: null }));
    trigger().click();
    expect(all('[data-grid="months"]').filter((b) => b.tabIndex === 0)).toEqual([month(9)]);
    expect(all('[data-grid="days"]').filter((b) => b.tabIndex === 0)).toEqual([day(1)]);
    month(11).focus();
    expect(all('[data-grid="months"]').filter((b) => b.tabIndex === 0)).toEqual([month(11)]);
  });

  it("quand le curseur sort du sélecteur (Tab), la fenêtre se ferme ; d'un bouton à l'autre, non", () => {
    mount();
    const after = document.createElement("button");
    document.body.append(after);
    trigger().click();
    named("Mois entier").focus();
    expect(popup()).not.toBeNull();
    after.focus();
    expect(popup()).toBeNull();
  });

  it("un nouveau dessin (l'événement relu) garde le curseur sur le même bouton", () => {
    const m = mount();
    trigger().click();
    day(20).focus();
    m.picker.show(event({ day: 20 }));
    expect(popup()).not.toBeNull();
    expect((document.activeElement as HTMLElement).dataset.focus).toBe("days:20");
    expect(day(20).dataset.mark).toBe("start");
  });
});

describe("sélecteur de période : fermer et placer", () => {
  it("un clic à côté ferme, un clic dedans non ; un défilement ailleurs ferme", () => {
    mount();
    trigger().click();
    popup()?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).not.toBeNull();
    popup()?.dispatchEvent(new Event("scroll"));
    expect(popup()).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).toBeNull();
    trigger().click();
    document.dispatchEvent(new Event("scroll"));
    expect(popup()).toBeNull();
  });

  it("un deuxième clic sur le champ ferme la fenêtre", () => {
    mount();
    trigger().click();
    trigger().click();
    expect(popup()).toBeNull();
  });

  it("s'ouvre sous le champ, à son bord gauche, dans la fenêtre", () => {
    mount();
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.top).toBeGreaterThan(box(trigger()).bottom);
    expect(p.left).toBe(box(trigger()).left);
    expect(p.right).toBeLessThanOrEqual(window.innerWidth);
    expect(p.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(Math.round(p.width)).toBe(352);
  });

  it("s'ouvre au-dessus quand il n'y a pas la place dessous, et ne dépasse jamais de la fenêtre", () => {
    mount(event(), "padding:40px;width:700px;margin-top:420px");
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });

  it("sans place ni dessous ni dessus, elle se pose à la hauteur du champ, entière dans la fenêtre", async () => {
    await page.viewport(1000, 560);
    mount(event(), "padding:40px;width:700px;margin-top:200px");
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(p.top).toBeLessThanOrEqual(box(trigger()).top);
    await page.viewport(1000, 700);
  });

  it("reste dans une colonne étroite de 420 points, rétrécie si besoin, cases alignées", () => {
    const { host } = mount(event(), "padding:0 24px;width:372px;margin-left:300px");
    trigger().click();
    const column = box(host);
    const p = box(popup() as HTMLElement);
    expect(p.left).toBeGreaterThanOrEqual(column.left);
    expect(p.right).toBeLessThanOrEqual(column.right + 0.5);
    expect(p.width).toBeLessThanOrEqual(column.width);
    expect(box(day(30)).right).toBeLessThanOrEqual(p.right);
    expect(box(month(12)).right).toBeLessThanOrEqual(p.right);
    expect(box(day(1)).width).toBeGreaterThan(30);
  });

  it("ne déborde pas du bord droit de la fenêtre", () => {
    mount(event(), "padding:40px;width:300px;margin-left:760px");
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.right).toBeLessThanOrEqual(window.innerWidth);
  });
});
