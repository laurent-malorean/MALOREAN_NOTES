import { describe, expect, it } from "vitest";
import type { McpServerItem } from "../bridge";
import {
  CONNECTOR_HINT,
  connectHint,
  STATE_LABELS,
  TERMINAL_HINT,
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

  it("dit quoi faire pour un connecteur claude.ai « À connecter »", () => {
    expect(connectHint(server({ state: "toConnect" }))).toBe(CONNECTOR_HINT);
    expect(CONNECTOR_HINT).toBe(
      "Connectez-le dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».",
    );
  });

  it("dit quoi faire pour un serveur ajouté dans le Terminal « À connecter »", () => {
    const hint = connectHint(server({ connector: false, state: "toConnect" }));
    expect(hint).toBe(TERMINAL_HINT);
    expect(TERMINAL_HINT.map((part) => part.text).join("")).toBe(
      "Connectez-le dans le Terminal : tapez claude, puis /mcp, puis cliquez sur « Actualiser ».",
    );
    expect(TERMINAL_HINT.filter((part) => part.code).map((part) => part.text)).toEqual([
      "claude",
      "/mcp",
    ]);
  });

  it("ne dit rien d'un serveur qui n'est pas « À connecter »", () => {
    for (const state of ["connected", "failed", "notFound"] as const)
      expect(connectHint(server({ state }))).toBeNull();
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
