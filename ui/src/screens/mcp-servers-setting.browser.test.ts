import { describe, expect, it } from "vitest";
import type { McpServerItem } from "../bridge";
import { mcpServersGroup } from "./mcp-servers-setting";
import "../theme.css";
import "../style.css";

const server = (changes: Partial<McpServerItem> = {}): McpServerItem => ({
  name: "claude.ai Noota",
  displayName: "Noota",
  connector: true,
  state: "connected",
  allowed: false,
  ...changes,
});

const toConnect = (count: number, changes: Partial<McpServerItem> = {}) =>
  Array.from({ length: count }, (_, i) =>
    server({
      name: `claude.ai S${i}`,
      displayName: `S${i}`,
      state: "toConnect",
      ...changes,
    }),
  );

function mount() {
  const log: string[] = [];
  const group = mcpServersGroup({
    toggle: (name, allowed) => log.push(`${allowed ? "cocher" : "décocher"} ${name}`),
    refresh: () => log.push("actualiser"),
  });
  document.body.replaceChildren(group.element);
  const rows = () => [...group.element.querySelectorAll("li")];
  const status = () => group.element.querySelector<HTMLElement>(".mcp-status") as HTMLElement;
  const hints = () => [...group.element.querySelectorAll<HTMLElement>(".mcp-hint")];
  const titles = () =>
    [...group.element.querySelectorAll(".mcp-group-title")].map((title) => title.textContent);
  const fold = () => group.element.querySelector<HTMLButtonElement>(".mcp-fold");
  const refresh = () =>
    [...group.element.querySelectorAll("button")].find(
      (button) => button.textContent === "Actualiser",
    ) as HTMLButtonElement;
  return { group, log, rows, status, hints, titles, fold, refresh };
}

describe("réglages : la rubrique « Serveurs MCP »", () => {
  it("s'intitule « Serveurs MCP », donne la phrase d'introduction et offre « Actualiser »", () => {
    const m = mount();
    expect(m.group.element.querySelector("legend")?.textContent).toBe("Serveurs MCP");
    expect(m.group.element.textContent).toContain(
      "Les services que Claude peut utiliser dans la colonne Claude Code, en plus des outils de l'application. Seuls les serveurs cochés lui sont ouverts.",
    );
    expect(m.refresh().disabled).toBe(true);
  });

  it("dit la lecture en cours tant qu'elle dure, et ne laisse pas actualiser pendant ce temps", () => {
    const m = mount();
    expect(m.status().textContent).toBe("Lecture des serveurs de Claude Code…");
    expect(m.rows()).toEqual([]);
    expect(m.titles()).toEqual([]);
    expect(m.refresh().disabled).toBe(true);
  });

  it("montre une case par serveur, son nom sans « claude.ai » et son état, regroupés par état", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [
        server({ name: "claude.ai Figma", displayName: "Figma", state: "toConnect" }),
        server({ allowed: true }),
        server({
          name: "mon-serveur",
          displayName: "mon-serveur",
          connector: false,
          state: "failed",
        }),
        server({
          name: "claude.ai Notion",
          displayName: "Notion",
          state: "notFound",
          allowed: true,
        }),
      ],
    });
    expect(m.rows().map((row) => row.querySelector("label")?.textContent)).toEqual([
      "Noota",
      "Figma",
      "mon-serveur",
      "Notion",
    ]);
    expect(m.rows().map((row) => row.querySelector(".mcp-server-state")?.textContent)).toEqual([
      "Connecté",
      "À connecter",
      "En échec",
      "Introuvable",
    ]);
    const boxes = [...m.group.element.querySelectorAll<HTMLInputElement>("input")];
    expect(boxes.map((box) => box.checked)).toEqual([true, false, false, true]);
    expect(m.refresh().disabled).toBe(false);
  });

  it("ne garde dans une ligne que la case, le nom et l'état", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server({ state: "toConnect" })] });
    const [row] = m.rows();
    expect([...(row as HTMLElement).children].map((child) => child.tagName)).toEqual([
      "INPUT",
      "LABEL",
      "SPAN",
    ]);
  });

  it("dit le nombre de serveurs en tête de la liste, à côté de « Actualiser »", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server(), server({ state: "failed" })] });
    expect(m.status().textContent).toBe("2 serveurs");
    expect(m.status().hidden).toBe(false);
    expect(m.status().parentElement).toBe(m.refresh().parentElement);
    m.group.show({ kind: "listed", servers: [server()] });
    expect(m.status().textContent).toBe("1 serveur");
  });

  it("donne à chaque groupe un petit titre avec son nombre, les connectés d'abord", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [
        server({ state: "notFound", allowed: true }),
        server({ state: "failed" }),
        ...toConnect(2),
        server(),
        server(),
        server(),
      ],
    });
    expect(m.titles()).toEqual(["Connectés3", "À connecter2", "En échec1", "Introuvables1"]);
  });

  it("ne montre pas de titre pour un groupe vide", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server()] });
    expect(m.titles()).toEqual(["Connectés1"]);
  });

  it("nomme chaque case par son serveur et la décrit par son état", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server()] });
    const box = m.group.element.querySelector("input") as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(
      m.group.element.querySelector(`#${box.getAttribute("aria-labelledby")}`)?.textContent,
    ).toBe("Noota");
    expect(
      m.group.element.querySelector(`#${box.getAttribute("aria-describedby")}`)?.textContent,
    ).toBe("Connecté");
    expect(box.title).toContain("tous les outils de ce serveur");
    expect(box.title).toContain("ceux qui écrivent dans le service");
  });

  it("dit une seule fois, pour tous les connecteurs « À connecter », quoi faire dans claude.ai", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: toConnect(4) });
    expect(m.hints().map((hint) => hint.textContent)).toEqual([
      "Connectez-les dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».",
    ]);
    expect(m.rows()).toHaveLength(4);
    const [first] = m.group.element.querySelectorAll("input");
    expect(first?.getAttribute("aria-describedby")).toBe(
      `mcp-server-1-state ${(m.hints()[0] as HTMLElement).id}`,
    );
  });

  it("dit une seule fois, pour les serveurs du Terminal « À connecter », quoi y taper, en police de code", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: toConnect(3, { connector: false }) });
    const [hint] = m.hints();
    expect(m.hints()).toHaveLength(1);
    expect(hint?.textContent).toBe(
      "Connectez-les dans le Terminal : tapez claude, puis /mcp, puis cliquez sur « Actualiser ».",
    );
    expect(
      [...(hint as HTMLElement).querySelectorAll("code")].map((code) => code.textContent),
    ).toEqual(["claude", "/mcp"]);
  });

  it("dit chaque phrase une seule fois, devant les serveurs qu'elle concerne, quand les deux origines sont là", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [...toConnect(2, { connector: false }), ...toConnect(2)].map((each, i) => ({
        ...each,
        name: `n${i}`,
        displayName: `n${i}`,
      })),
    });
    expect(m.hints()).toHaveLength(2);
    expect(m.hints().map((hint) => hint.nextElementSibling?.querySelectorAll("li").length)).toEqual(
      [2, 2],
    );
    expect(m.hints()[0]?.textContent).toContain("claude.ai");
    expect(m.hints()[1]?.textContent).toContain("Terminal");
  });

  it("ne dit aucune phrase quand aucun serveur n'est « À connecter »", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [server(), server({ state: "failed" }), server({ state: "notFound" })],
    });
    expect(m.hints()).toEqual([]);
  });

  it("ne répète pas la phrase d'aide : 32 serveurs dont 21 « À connecter » la disent une fois", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [...toConnect(21), ...toConnect(11, { state: "connected" })],
    });
    const text = m.group.element.textContent ?? "";
    expect(text.split("Connectez-les dans les réglages").length - 1).toBe(1);
    expect(text).not.toContain("Connectez-le dans");
  });

  it("replie les serveurs « À connecter » non cochés au-delà de 5, avec un bouton qui les déplie", () => {
    const m = mount();
    const servers = [...toConnect(6), server()];
    m.group.show({
      kind: "listed",
      servers: servers.map((each, i) => (i === 0 ? { ...each, allowed: true } : each)),
    });
    expect(m.rows().map((row) => row.querySelector("label")?.textContent)).toEqual(["Noota", "S0"]);
    expect(m.hints()).toHaveLength(1);
    expect(m.fold()?.textContent).toBe("Afficher les 5 serveurs non cochés");
    expect(m.fold()?.getAttribute("aria-expanded")).toBe("false");
    m.fold()?.click();
    expect(m.rows()).toHaveLength(7);
    expect(m.fold()?.textContent).toBe("Masquer les serveurs non cochés");
    expect(m.fold()?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(m.fold());
    m.fold()?.click();
    expect(m.rows()).toHaveLength(2);
  });

  it("garde le groupe déplié quand la liste est montrée de nouveau (cochage)", () => {
    const m = mount();
    const servers = toConnect(7);
    m.group.show({ kind: "listed", servers });
    m.fold()?.click();
    m.group.show({ kind: "listed", servers });
    expect(m.rows()).toHaveLength(7);
  });

  it("ne replie pas 5 serveurs « À connecter » ou moins, et n'offre alors aucun bouton", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: toConnect(5) });
    expect(m.rows()).toHaveLength(5);
    expect(m.fold()).toBeNull();
  });

  it("n'offre pas de bouton pour déplier quand tous les serveurs « À connecter » sont cochés", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: toConnect(6, { allowed: true }) });
    expect(m.rows()).toHaveLength(6);
    expect(m.fold()).toBeNull();
  });

  it("ne replie jamais les autres groupes", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: toConnect(12, { state: "failed" }) });
    expect(m.rows()).toHaveLength(12);
    expect(m.fold()).toBeNull();
  });

  it("demande de cocher ou de décocher un serveur par son nom tel que Claude Code le donne", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server(), server({ name: "x", allowed: true })] });
    const [first, second] = [...m.group.element.querySelectorAll<HTMLInputElement>("input")];
    (first as HTMLInputElement).click();
    (second as HTMLInputElement).click();
    expect(m.log).toEqual(["cocher claude.ai Noota", "décocher x"]);
  });

  it("relit la liste au clic sur « Actualiser »", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server()] });
    m.refresh().click();
    expect(m.log).toEqual(["actualiser"]);
  });

  it("dit la phrase du moteur quand Claude Code est absent ou pas connecté, sans liste", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server()] });
    m.group.show({ kind: "unavailable", message: "Claude Code n'est pas installé." });
    expect(m.status().textContent).toBe("Claude Code n'est pas installé.");
    expect(m.status().hidden).toBe(false);
    expect(m.status().classList.contains("setting-error")).toBe(true);
    expect(m.rows()).toEqual([]);
    expect(m.refresh().disabled).toBe(false);
  });

  it("dit qu'aucun serveur n'est connu quand la liste est vide", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [] });
    expect(m.status().textContent).toBe("Claude Code ne connaît aucun serveur MCP extérieur.");
    expect(m.status().hidden).toBe(false);
    expect(m.status().classList.contains("setting-error")).toBe(false);
  });

  it("colorie l'état avec les couleurs du thème", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [server(), server({ state: "failed" }), server({ state: "toConnect" })],
    });
    const colors = [...m.group.element.querySelectorAll(".mcp-server-state")].map(
      (state) => getComputedStyle(state).color,
    );
    expect(new Set(colors).size).toBe(3);
  });

  it("aère les lignes : 36 points au moins (--control-height), 8 sur 12 de marge (--space-2, --space-3), un filet entre deux lignes", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server(), server({ name: "b" })] });
    const [first, second] = m.rows() as unknown as [HTMLElement, HTMLElement];
    const style = getComputedStyle(first);
    expect(first.getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    expect([style.paddingTop, style.paddingLeft]).toEqual(["8px", "12px"]);
    expect(getComputedStyle(first).borderTopWidth).toBe("0px");
    expect(getComputedStyle(second).borderTopWidth).toBe("1px");
  });

  it("aligne la case et le nom sur la même ligne, et l'état à droite", () => {
    const m = mount();
    m.group.show({ kind: "listed", servers: [server()] });
    const [row] = m.rows() as unknown as [HTMLElement];
    const [box, name, state] = [...row.children].map((child) => child.getBoundingClientRect());
    const middle = (rect: DOMRect | undefined) => (rect ? rect.top + rect.height / 2 : 0);
    expect(Math.abs(middle(box) - middle(name))).toBeLessThan(2);
    expect(Math.abs(middle(state) - middle(name))).toBeLessThan(2);
    const edge = row.getBoundingClientRect().right - 12;
    expect(Math.abs((state?.right ?? 0) - edge)).toBeLessThan(2);
  });

  it("défile dans sa propre zone quand la liste est longue, sans agrandir l'écran", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: Array.from({ length: 40 }, (_, i) =>
        server({ name: `s${i}`, displayName: `s${i}` }),
      ),
    });
    const list = m.group.element.querySelector(".mcp-list") as HTMLElement;
    expect(getComputedStyle(list).overflowY).toBe("auto");
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(list.getBoundingClientRect().height).toBeLessThanOrEqual(448);
  });

  it("ne déborde pas en largeur étroite, même avec un nom très long", () => {
    const m = mount();
    document.body.style.width = "300px";
    const long = "un-serveur-au-nom-vraiment-tres-long-qui-ne-tient-pas-sur-une-ligne-etroite";
    m.group.show({
      kind: "listed",
      servers: [server({ name: long, displayName: long, state: "failed" })],
    });
    expect(m.group.element.scrollWidth).toBeLessThanOrEqual(m.group.element.clientWidth);
    const list = m.group.element.querySelector(".mcp-list") as HTMLElement;
    expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
    document.body.style.width = "";
  });
});
