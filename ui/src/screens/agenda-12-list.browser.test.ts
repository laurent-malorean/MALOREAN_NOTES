import { afterEach, describe, expect, it, vi } from "vitest";
import { agendaItem, eventItem, plainEvent } from "../../test-support/agenda-12-fixture";
import { AUDIT, DOMAINS, mount, PATH, SALON } from "../../test-support/agenda-12-view-mount";
import "../theme.css";
import "../style.css";

afterEach(() => document.body.replaceChildren());

const layoutButton = (layout: "grid" | "list") =>
  document.querySelector(`.agenda-layout-choice[data-layout="${layout}"]`) as HTMLButtonElement;
const group = (month: number) =>
  document.querySelector(`.agenda-month-group[data-month="${month}"]`) as HTMLElement;
const link = () => document.querySelector(".agenda-archives-link") as HTMLButtonElement;
const filter = () => document.querySelector(".agenda-filter") as HTMLSelectElement;
const box = (element: Element) => element.getBoundingClientRect();

async function mountList(
  data = () => agendaItem([SALON, DOMAINS, AUDIT]),
  width = 1200,
): Promise<ReturnType<typeof mount>> {
  const m = mount(data);
  m.container.style.width = `${width}px`;
  m.state.layout = "list";
  await m.view.reload();
  return m;
}

describe("vue liste d'agenda 12 : le choix de la vue", () => {
  it("propose Grille et Liste, la vue de l'agenda 12 enfoncée, avec une bulle d'aide chacune", async () => {
    const m = mount();
    await m.view.reload();
    expect(layoutButton("grid").textContent).toBe("Grille");
    expect(layoutButton("list").textContent).toBe("Liste");
    expect(layoutButton("grid").title).toBe("Vue grille");
    expect(layoutButton("list").title).toBe("Vue liste");
    expect(layoutButton("grid").getAttribute("aria-pressed")).toBe("true");
    expect(layoutButton("list").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".agenda-grid")).not.toBeNull();
    expect(document.querySelector(".agenda-list")).toBeNull();
    expect(document.querySelector<HTMLElement>(".agenda")?.dataset.mode).toBe("grid");
  });

  it("l'agenda 12 gardé en liste s'ouvre en liste", async () => {
    await mountList();
    expect(layoutButton("list").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".agenda-grid")).toBeNull();
    expect(document.querySelector(".agenda-list")).not.toBeNull();
    expect(document.querySelector<HTMLElement>(".agenda")?.dataset.mode).toBe("list");
  });

  it("choisir la liste la garde dans l'agenda 12, puis relit ; choisir la grille de même", async () => {
    const m = mount();
    await m.view.reload();
    layoutButton("list").click();
    await vi.waitFor(() => expect(document.querySelector(".agenda-list")).not.toBeNull());
    expect(m.calls).toEqual([`lire ${PATH} null`, `vue ${PATH} list`, `lire ${PATH} null`]);
    layoutButton("grid").click();
    await vi.waitFor(() => expect(document.querySelector(".agenda-grid")).not.toBeNull());
    expect(m.calls.slice(3)).toEqual([`vue ${PATH} grid`, `lire ${PATH} null`]);
  });

  it("un refus du moteur est dit, et l'agenda 12 est relu quand même", async () => {
    const m = mount();
    await m.view.reload();
    m.state.failLayout = true;
    layoutButton("list").click();
    await vi.waitFor(() => expect(m.errors).toHaveLength(1));
    expect(m.errors[0]).toEqual({ message: "cette note n'est pas un agenda 12" });
    await vi.waitFor(() => expect(m.calls).toHaveLength(3));
    expect(document.querySelector(".agenda-grid")).not.toBeNull();
  });

  it("les colonnes ne valent que pour la grille : le choix disparaît en liste", async () => {
    await mountList();
    expect(document.querySelector<HTMLElement>(".agenda-columns")?.hidden).toBe(true);
    expect(filter().hidden).toBe(false);
  });

  it("dans les archives, la vue n'est pas à choisir ; le bouton dit la vue où il ramène", async () => {
    await mountList();
    expect(link().textContent).toBe("Archives");
    link().click();
    expect(document.querySelector<HTMLElement>(".agenda-layout")?.hidden).toBe(true);
    expect(link().textContent).toBe("Liste");
    link().click();
    expect(document.querySelector(".agenda-list")).not.toBeNull();
    expect(document.querySelector<HTMLElement>(".agenda-layout")?.hidden).toBe(false);
  });
});

describe("vue liste d'agenda 12 : les groupes par mois", () => {
  it("montre un titre par mois, de janvier à décembre, même sans événement", async () => {
    await mountList();
    const titles = [...document.querySelectorAll(".agenda-list .agenda-month")];
    expect(titles.map((title) => title.textContent)).toEqual([
      ...["Janvier", "Février", "Mars", "Avril", "Mai", "Juin"],
      ...["Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
    ]);
    expect(titles.every((title) => title.tagName === "H3")).toBe(true);
  });

  it("une ligne par événement sous le titre de son mois, dans l'ordre de Rust, avec le texte de la grille", async () => {
    await mountList();
    const lines = (month: number) =>
      [...group(month).querySelectorAll(".agenda-line")].map((line) => line.textContent);
    expect(lines(1)).toEqual(["Audit ISO"]);
    expect(lines(2)).toEqual([
      "10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon Embedded World",
      "2029 – Renouveler malorean.fr",
    ]);
    expect(lines(3)).toEqual([]);
  });

  it("les lignes n'ont pas de puce", async () => {
    await mountList();
    for (const list of document.querySelectorAll<HTMLElement>(".agenda-list ul"))
      expect(getComputedStyle(list).listStyleType).toBe("none");
  });

  it("une ligne porte sa ligne entière en info-bulle et son chemin ; un clic ouvre la note sans curseur sur le titre", async () => {
    const m = await mountList();
    const line = group(2).querySelector<HTMLElement>(".agenda-line");
    expect(line?.title).toBe("10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World");
    expect(line?.dataset.path).toBe("pro/salons/embedded.md");
    line?.click();
    expect(m.opened).toEqual(["pro/salons/embedded.md false"]);
  });

  it("un mois a son « + » à droite de son titre, vide ou plein, nommé d'après le mois", async () => {
    const m = await mountList();
    const adds = [...document.querySelectorAll(".agenda-list .agenda-add")];
    expect(adds).toHaveLength(12);
    expect(adds[0]?.getAttribute("aria-label")).toBe("Ajouter un événement en janvier");
    expect(adds[7]?.getAttribute("aria-label")).toBe("Ajouter un événement en août");
    for (const month of [1, 3]) {
      const title = box(group(month).querySelector(".agenda-month") as Element);
      const add = box(group(month).querySelector(".agenda-add") as Element);
      expect(add.left).toBeGreaterThan(title.right);
    }
    group(8).querySelector<HTMLElement>(".agenda-add")?.click();
    await vi.waitFor(() => expect(m.opened).toEqual(["pro/salons/sans-titre.md true"]));
    expect(m.calls).toContain(`créer ${PATH} 8`);
  });

  it("un mois vide est discret : un titre sans ligne, plus bas qu'un mois plein de rien", async () => {
    await mountList();
    const empty = group(3);
    expect(empty.querySelector(".agenda-line")).toBeNull();
    const full = box(group(2).querySelector(".agenda-month") as Element);
    expect(box(empty).height).toBeLessThan(box(group(2)).height);
    expect(full.height).toBeGreaterThan(0);
    expect(empty.dataset.empty).toBe("true");
    expect(group(2).dataset.empty).toBe("false");
  });

  it("le filtre par étiquette vaut en liste : la lecture se fait avec lui", async () => {
    const m = await mountList(() => agendaItem([SALON], { tags: ["domaine", "salon"] }));
    filter().value = "salon";
    filter().dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(m.calls).toContain(`lire ${PATH} salon`));
    expect(document.querySelector(".agenda-list")).not.toBeNull();
  });

  it("les archives valent en liste comme en grille", async () => {
    const closed = eventItem({ closedOn: "2026-11-27", title: "Salon clos" });
    await mountList(() => agendaItem([], { archives: [closed] }));
    link().click();
    expect(document.querySelectorAll(".agenda-archives .agenda-event")).toHaveLength(1);
    expect(document.querySelector(".agenda-list")).toBeNull();
  });
});

describe("vue liste d'agenda 12 : sa présentation", () => {
  const rich = () => [
    SALON,
    DOMAINS,
    AUDIT,
    eventItem({
      ...{ path: "pro/salons/web.md", title: "WebSubmit", month: 10, day: 5, year: 2026 },
      ...{ end: { day: 11, month: 10 }, country: null, city: "Lisbonne", tags: [] },
      line: {
        ...{ date: "05–11/10", year: 2026, yearTone: "current", flag: "🇵🇹", city: "Lisbonne" },
        ...{ title: "WebSubmit", text: "05–11/10 [2026] – 🇵🇹 (Lisbonne) – WebSubmit" },
      },
    }),
  ];
  const parts = (line: Element, name: string) =>
    line.querySelector(`.agenda-${name}`) as HTMLElement | null;

  it("large : la date, le lieu et le titre sont alignés en colonnes d'une ligne à l'autre, même d'un mois à l'autre", async () => {
    await mountList(() => agendaItem(rich()));
    const lines = [...document.querySelectorAll(".agenda-list .agenda-line")];
    const withPlace = lines.filter((line) => parts(line, "place") !== null);
    expect(withPlace.length).toBeGreaterThanOrEqual(2);
    expect(
      new Set(withPlace.map((l) => Math.round(box(parts(l, "place") as Element).left))).size,
    ).toBe(1);
    const titles = lines.map((line) => Math.round(box(parts(line, "title") as Element).left));
    expect(new Set(titles).size).toBe(1);
    const years = lines
      .filter(
        (line) => parts(line, "year") !== null && parts(line, "date")?.firstChild?.nodeType === 3,
      )
      .map((line) => Math.round(box(parts(line, "year") as Element).left));
    expect(new Set(years).size).toBe(1);
  });

  it("large : une ligne tient sur un seul rang, la date avant le lieu avant le titre", async () => {
    await mountList(() => agendaItem(rich()));
    const line = group(2).querySelector(".agenda-line") as HTMLElement;
    const date = box(parts(line, "date") as Element);
    const place = box(parts(line, "place") as Element);
    const title = box(parts(line, "title") as Element);
    expect(date.right).toBeLessThanOrEqual(place.left + 1);
    expect(place.right).toBeLessThanOrEqual(title.left + 1);
    expect(Math.abs(date.top - title.top)).toBeLessThan(title.height);
  });

  it("large : la date, la pastille et le lieu sont plus discrets que le titre", async () => {
    await mountList(() => agendaItem(rich()));
    const line = group(2).querySelector(".agenda-line") as HTMLElement;
    const size = (name: string) =>
      Number.parseFloat(getComputedStyle(parts(line, name) as Element).fontSize);
    expect(size("date")).toBeLessThan(size("title"));
    expect(size("place")).toBeLessThan(size("title"));
  });

  it("étroit : la ligne passe sur deux rangs, la date et le lieu en légende, le titre dessous, sans déborder", async () => {
    await mountList(() => agendaItem(rich()), 340);
    const list = document.querySelector(".agenda-body") as HTMLElement;
    for (const line of document.querySelectorAll(".agenda-list .agenda-line")) {
      const date = parts(line, "date");
      const title = parts(line, "title") as HTMLElement;
      if (date !== null) expect(box(title).top).toBeGreaterThanOrEqual(box(date).bottom - 1);
      expect(box(line).right).toBeLessThanOrEqual(box(list).right + 1);
      expect(box(line).left).toBeGreaterThanOrEqual(box(list).left - 1);
    }
    expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  });

  it("étroit : un long titre passe à la ligne sans déborder", async () => {
    const long = plainEvent(
      "pro/salons/long.md",
      "Un titre d'événement extraordinairement long ".repeat(4),
      4,
    );
    await mountList(() => agendaItem([long]), 320);
    const list = document.querySelector(".agenda-body") as HTMLElement;
    expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  });

  it("les titres de mois ont de la hiérarchie : plus grands que les lignes, avec un filet dessous", async () => {
    await mountList(() => agendaItem(rich()));
    const title = group(2).querySelector(".agenda-month") as HTMLElement;
    const line = group(2).querySelector(".agenda-title") as HTMLElement;
    expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(line).fontSize),
    );
    const head = group(2).querySelector(".agenda-month-head") as HTMLElement;
    expect(Number.parseFloat(getComputedStyle(head).borderBottomWidth)).toBeGreaterThan(0);
  });

  it("une ligne montre son focus au clavier", async () => {
    await mountList();
    const line = group(1).querySelector(".agenda-line") as HTMLElement;
    line.focus();
    expect(getComputedStyle(line).outlineStyle).not.toBe("none");
    expect(line.matches(":focus-visible")).toBe(true);
  });
});
