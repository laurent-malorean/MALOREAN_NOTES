import { describe, expect, it } from "vitest";
import type { McpServerItem } from "../bridge";
import {
  CONNECTOR_HINT,
  countText,
  FOLD_ABOVE,
  GROUP_TITLES,
  groupServers,
  shown,
  STATE_LABELS,
  TERMINAL_HINT,
  unfoldText,
  withAllowed,
} from "./mcp-servers";

const server = (changes: Partial<McpServerItem> = {}): McpServerItem => ({
  name: "claude.ai Noota",
  displayName: "Noota",
  connector: true,
  state: "connected",
  allowed: false,
  ...changes,
});

describe("serveurs MCP : les textes de la rubrique", () => {
  it("dit chaque état en toutes lettres", () => {
    expect(STATE_LABELS).toEqual({
      connected: "Connecté",
      toConnect: "À connecter",
      failed: "En échec",
      notFound: "Introuvable",
    });
  });

  it("dit en une phrase au pluriel quoi faire pour les connecteurs claude.ai « À connecter »", () => {
    expect(CONNECTOR_HINT).toBe(
      "Connectez-les dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».",
    );
  });

  it("dit en une phrase au pluriel quoi faire pour les serveurs du Terminal « À connecter », avec les commandes à part", () => {
    expect(TERMINAL_HINT.map((part) => part.text).join("")).toBe(
      "Connectez-les dans le Terminal : tapez claude, puis /mcp, puis cliquez sur « Actualiser ».",
    );
    expect(TERMINAL_HINT.filter((part) => part.code).map((part) => part.text)).toEqual([
      "claude",
      "/mcp",
    ]);
  });

  it("compte les serveurs au singulier ou au pluriel", () => {
    expect(countText([server()])).toBe("1 serveur");
    expect(countText([server(), server()])).toBe("2 serveurs");
    expect(countText([])).toBe("0 serveurs");
  });

  it("dit combien de serveurs non cochés le bouton déplie", () => {
    expect(unfoldText(1)).toBe("Afficher le serveur non coché");
    expect(unfoldText(20)).toBe("Afficher les 20 serveurs non cochés");
  });
});

describe("serveurs MCP : le regroupement par état", () => {
  const named = (name: string, changes: Partial<McpServerItem> = {}) =>
    server({ name, displayName: name, ...changes });

  it("met les connectés d'abord, puis « À connecter », « En échec » et « Introuvables »", () => {
    const groups = groupServers([
      named("a", { state: "notFound", allowed: true }),
      named("b", { state: "failed" }),
      named("c", { state: "toConnect" }),
      named("d"),
    ]);
    expect(groups.map((group) => group.state)).toEqual([
      "connected",
      "toConnect",
      "failed",
      "notFound",
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      "Connectés",
      "À connecter",
      "En échec",
      "Introuvables",
    ]);
    expect(GROUP_TITLES.toConnect).toBe("À connecter");
  });

  it("n'a pas de groupe vide, et garde l'ordre de la liste dans un groupe", () => {
    const groups = groupServers([named("b"), named("a", { state: "failed" }), named("c")]);
    expect(groups.map((group) => group.state)).toEqual(["connected", "failed"]);
    expect(groups.map((group) => group.count)).toEqual([2, 1]);
    expect(groups[0]?.blocks[0]?.servers.map((each) => each.name)).toEqual(["b", "c"]);
    expect(groupServers([])).toEqual([]);
  });

  it("ne met une phrase que sur le bloc d'un groupe « À connecter »", () => {
    const groups = groupServers([named("a"), named("b", { state: "toConnect" })]);
    expect(groups.map((group) => group.blocks.map((block) => block.hint))).toEqual([
      [null],
      [CONNECTOR_HINT],
    ]);
  });

  it("sépare les connecteurs des serveurs du Terminal « À connecter », chacun avec sa phrase, sans bloc vide", () => {
    const toConnect = { state: "toConnect" } as const;
    const [group] = groupServers([
      named("t", { ...toConnect, connector: false }),
      named("c", toConnect),
      named("u", { ...toConnect, connector: false }),
    ]);
    expect(
      group?.blocks.map((block) => [block.hint, block.servers.map((each) => each.name)]),
    ).toEqual([
      [CONNECTOR_HINT, ["c"]],
      [TERMINAL_HINT, ["t", "u"]],
    ]);
    const [only] = groupServers([named("c", toConnect)]);
    expect(only?.blocks).toHaveLength(1);
  });

  it("ne replie « À connecter » qu'au-delà de 5 serveurs", () => {
    expect(FOLD_ABOVE).toBe(5);
    const toConnect = (count: number) =>
      Array.from({ length: count }, (_, i) => named(`s${i}`, { state: "toConnect" }));
    expect(groupServers(toConnect(5))[0]?.foldable).toBe(false);
    expect(groupServers(toConnect(6))[0]?.foldable).toBe(true);
    const many = Array.from({ length: 9 }, (_, i) => named(`s${i}`));
    expect(groupServers(many)[0]?.foldable).toBe(false);
  });

  it("garde visibles les serveurs cochés d'un groupe replié", () => {
    const [group] = groupServers([
      named("a", { state: "toConnect", allowed: true }),
      named("b", { state: "toConnect" }),
    ]);
    const block = group?.blocks[0] as NonNullable<typeof group>["blocks"][number];
    expect(shown(block, true).map((each) => each.name)).toEqual(["a"]);
    expect(shown(block, false).map((each) => each.name)).toEqual(["a", "b"]);
  });
});

describe("serveurs MCP : une ligne cochée ou décochée", () => {
  const list = [
    server({ name: "claude.ai Figma", displayName: "Figma" }),
    server({ allowed: true }),
    server({ name: "claude.ai Notion", displayName: "Notion", state: "notFound", allowed: true }),
  ];

  it("coche la ligne visée et laisse les autres", () => {
    const next = withAllowed(list, "claude.ai Figma", true);
    expect(next.map((line) => line.allowed)).toEqual([true, true, true]);
  });

  it("décoche la ligne visée", () => {
    const next = withAllowed(list, "claude.ai Noota", false);
    expect(next.map((line) => line.allowed)).toEqual([false, false, true]);
  });

  it("fait disparaître un serveur introuvable décoché, jamais un serveur connu", () => {
    expect(withAllowed(list, "claude.ai Notion", false).map((line) => line.name)).toEqual([
      "claude.ai Figma",
      "claude.ai Noota",
    ]);
    expect(withAllowed(list, "claude.ai Noota", false)).toHaveLength(3);
  });

  it("ne change pas la liste d'origine", () => {
    withAllowed(list, "claude.ai Figma", true);
    expect(list[0]?.allowed).toBe(false);
  });
});
