import { afterEach, describe, expect, it } from "vitest";
import type { ConnectionInfo } from "../bridge";
import {
  CONNECTION_LOADING,
  CONNECTION_PURPOSE,
  type Copyable,
  connectionSettingsGroup,
  renderConnectionSettings,
} from "./connection-settings";

afterEach(() => document.body.replaceChildren());

const KEY: ConnectionInfo = {
  key: {
    secret: "abc123",
    createdOn: "25 novembre 2026",
    claudeConfig: '{\n  "mcpServers": {}\n}',
    codexConfig: "[mcp_servers.malorean]",
  },
};

function setup(info: ConnectionInfo | null) {
  const calls: string[] = [];
  const frame = connectionSettingsGroup();
  document.body.append(frame);
  renderConnectionSettings(frame, info, {
    create: () => calls.push("créer"),
    revoke: () => calls.push("révoquer"),
    copy: (what: Copyable) => calls.push(`copier ${what}`),
  });
  const buttons = () => [...frame.querySelectorAll("button")];
  const button = (label: string) =>
    buttons().find((b) => b.getAttribute("aria-label") === label) as HTMLButtonElement;
  return { frame, calls, buttons, button };
}

describe("partie « Brancher une IA » de l'écran de réglages", () => {
  it("dit ce qu'elle fait tant que l'état est lu, sans aucun bouton", () => {
    const t = setup(null);
    expect(t.frame.querySelector("legend")?.textContent).toBe("Brancher une IA");
    expect([...t.frame.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      CONNECTION_PURPOSE,
      CONNECTION_LOADING,
    ]);
    expect(t.buttons()).toEqual([]);
  });

  it("sans clé, explique à quoi elle sert et ne montre qu'un bouton pour en créer une", () => {
    const t = setup({ key: null });
    expect(t.frame.querySelector("p")?.textContent).toBe(CONNECTION_PURPOSE);
    expect(t.buttons().map((b) => b.textContent)).toEqual(["Créer une clé de branchement"]);
    t.buttons()[0]?.click();
    expect(t.calls).toEqual(["créer"]);
  });

  it("avec une clé, montre sa date, la clé, les deux blocs et « Révoquer la clé »", () => {
    const t = setup(KEY);
    expect([...t.frame.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      CONNECTION_PURPOSE,
      "Clé de branchement créée le 25 novembre 2026.",
      "Clé de branchement",
      "Configuration pour Claude (extension VS Code, Claude Code hors de l'application)",
      "Configuration pour Codex",
    ]);
    const texts = [...t.frame.querySelectorAll(".connection-text")];
    expect(texts.map((text) => text.tagName)).toEqual(["CODE", "PRE", "PRE"]);
    expect(texts.map((text) => text.textContent)).toEqual([
      "abc123",
      '{\n  "mcpServers": {}\n}',
      "[mcp_servers.malorean]",
    ]);
    expect(t.buttons().map((b) => b.textContent)).toEqual([
      "Copier",
      "Copier",
      "Copier",
      "Révoquer la clé",
    ]);
    expect(t.frame.textContent).not.toContain("Créer une clé de branchement");
  });

  it("copie la clé, le bloc de Claude et le bloc de Codex, chacun par son bouton", () => {
    const t = setup(KEY);
    t.buttons()[0]?.click();
    t.buttons()[1]?.click();
    t.buttons()[2]?.click();
    expect(t.calls).toEqual(["copier key", "copier claude", "copier codex"]);
  });

  it("nomme chaque bouton « Copier » pour ce qu'il copie, et révoque au clic", () => {
    const t = setup(KEY);
    expect(t.buttons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Copier : Clé de branchement",
      "Copier : Configuration pour Claude (extension VS Code, Claude Code hors de l'application)",
      "Copier : Configuration pour Codex",
      "Révoquer la clé",
    ]);
    t.button("Révoquer la clé").click();
    expect(t.calls).toEqual(["révoquer"]);
  });

  it("se redessine à la place du dessin précédent", () => {
    const t = setup(KEY);
    renderConnectionSettings(t.frame, { key: null }, { create() {}, revoke() {}, copy() {} });
    expect(t.frame.querySelectorAll("legend")).toHaveLength(1);
    expect(t.buttons().map((b) => b.textContent)).toEqual(["Créer une clé de branchement"]);
  });
});
