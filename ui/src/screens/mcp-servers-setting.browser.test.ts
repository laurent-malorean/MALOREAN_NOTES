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

function mount() {
  const log: string[] = [];
  const group = mcpServersGroup({
    toggle: (name, allowed) => log.push(`${allowed ? "cocher" : "décocher"} ${name}`),
    refresh: () => log.push("actualiser"),
  });
  document.body.replaceChildren(group.element);
  const rows = () => [...group.element.querySelectorAll("li")];
  const status = () => group.element.querySelector<HTMLElement>(".mcp-status") as HTMLElement;
  const refresh = () =>
    [...group.element.querySelectorAll("button")].find(
      (button) => button.textContent === "Actualiser",
    ) as HTMLButtonElement;
  return { group, log, rows, status, refresh };
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
    expect(m.status().hidden).toBe(false);
    expect(m.rows()).toEqual([]);
    expect(m.refresh().disabled).toBe(true);
  });

  it("montre une case par serveur, son nom sans « claude.ai » et son état en toutes lettres", () => {
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
      "Figma",
      "Noota",
      "mon-serveur",
      "Notion",
    ]);
    expect(m.rows().map((row) => row.querySelector(".mcp-server-state")?.textContent)).toEqual([
      "À connecter",
      "À connecter".replace("À connecter", "Connecté"),
      "En échec",
      "Introuvable",
    ]);
    const boxes = [...m.group.element.querySelectorAll<HTMLInputElement>("input")];
    expect(boxes.map((box) => box.checked)).toEqual([false, true, false, true]);
    expect(m.status().hidden).toBe(true);
    expect(m.refresh().disabled).toBe(false);
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

  it("dit sous un connecteur « À connecter » quoi faire dans claude.ai", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [server({ name: "claude.ai Figma", displayName: "Figma", state: "toConnect" })],
    });
    const hint = m.group.element.querySelector(".mcp-server-hint") as HTMLElement;
    expect(hint.textContent).toBe(
      "Connectez-le dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».",
    );
    const box = m.group.element.querySelector("input") as HTMLInputElement;
    expect(box.getAttribute("aria-describedby")).toBe(`mcp-server-0-state ${hint.id}`);
  });

  it("dit sous un serveur ajouté dans le Terminal « À connecter » quoi y taper, en police de code", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [
        server({
          name: "mon-serveur",
          displayName: "mon-serveur",
          connector: false,
          state: "toConnect",
        }),
      ],
    });
    const hint = m.group.element.querySelector(".mcp-server-hint") as HTMLElement;
    expect(hint.textContent).toBe(
      "Connectez-le dans le Terminal : tapez claude, puis /mcp, puis cliquez sur « Actualiser ».",
    );
    expect([...hint.querySelectorAll("code")].map((code) => code.textContent)).toEqual([
      "claude",
      "/mcp",
    ]);
  });

  it("ne met aucune phrase sous un serveur qui n'est pas « À connecter »", () => {
    const m = mount();
    m.group.show({
      kind: "listed",
      servers: [server(), server({ state: "failed" }), server({ state: "notFound" })],
    });
    expect(m.group.element.querySelector(".mcp-server-hint")).toBeNull();
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
});
