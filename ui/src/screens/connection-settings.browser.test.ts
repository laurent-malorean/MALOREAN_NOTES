import { afterEach, describe, expect, it, vi } from "vitest";
import "../theme.css";
import "../style.css";
import type { AiWorkspaceItem, ConnectionInfo } from "../bridge";
import {
  CLAUDE_CONFIG_FILE,
  CLAUDE_CONFIG_WHERE,
  CODEX_CONFIG_FILE,
  CODEX_CONFIG_WHERE,
  CONNECTION_LOADING,
  COPIED_FOR_MS,
  CONNECTION_PURPOSE,
  type Copyable,
  connectionSettingsGroup,
  renderConnectionSettings,
  WORKSPACES_EMPTY,
  WORKSPACES_HELP,
  WORKSPACES_LOADING,
  WORKSPACES_TITLE,
} from "./connection-settings";

afterEach(() => document.body.replaceChildren());

const KEY: ConnectionInfo = {
  key: {
    secret: "abc123",
    createdOn: "25 novembre 2026",
    claudeConfig: '{\n  "mcpServers": {}\n}',
    codexConfig: "[mcp_servers.malorean_notes]",
  },
};

const WORKSPACES: AiWorkspaceItem[] = [
  { name: "Notes", allowed: false },
  { name: "Travail", allowed: true },
];

function setup(
  info: ConnectionInfo | null,
  copied = true,
  workspaces: AiWorkspaceItem[] | null = WORKSPACES,
) {
  const calls: string[] = [];
  const frame = connectionSettingsGroup();
  // Comme dans la fenêtre des réglages, dont le style règle la taille des boutons.
  const host = document.createElement("div");
  host.className = "settings";
  host.append(frame);
  document.body.append(host);
  renderConnectionSettings(frame, info, workspaces, {
    create: () => calls.push("créer"),
    revoke: () => calls.push("révoquer"),
    allow: (name, allowed) => calls.push(`${allowed ? "autoriser" : "retirer"} ${name}`),
    copy: (what: Copyable) => (calls.push(`copier ${what}`), Promise.resolve(copied)),
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
      WORKSPACES_TITLE,
      WORKSPACES_HELP,
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
      WORKSPACES_TITLE,
      WORKSPACES_HELP,
      "Clé de branchement créée le 25 novembre 2026.",
      "Clé de branchement",
      "Configuration pour Claude (extension VS Code, Claude Code hors de l'application)",
      CLAUDE_CONFIG_WHERE,
      "Configuration pour Codex",
      CODEX_CONFIG_WHERE,
    ]);
    const texts = [...t.frame.querySelectorAll(".connection-text")];
    expect(texts.map((text) => text.tagName)).toEqual(["CODE", "PRE", "PRE"]);
    expect(texts.map((text) => text.textContent)).toEqual([
      "abc123",
      '{\n  "mcpServers": {}\n}',
      "[mcp_servers.malorean_notes]",
    ]);
    expect(t.buttons().map((b) => b.textContent)).toEqual([
      "Copier",
      "Copier",
      "Copier",
      "Révoquer la clé",
    ]);
    expect(t.frame.textContent).not.toContain("Créer une clé de branchement");
  });

  it("dit sous chaque bloc dans quel fichier le coller, le nom du fichier en style code", () => {
    expect(CLAUDE_CONFIG_FILE).toBe(".mcp.json");
    expect(CODEX_CONFIG_FILE).toBe("~/.codex/config.toml");
    expect(CLAUDE_CONFIG_WHERE).toBe(
      "Collez ce bloc tel quel dans le fichier .mcp.json, à la racine du dossier ouvert dans l'éditeur. Si le fichier existe déjà, ajoutez l'entrée du bloc dans « mcpServers ».",
    );
    expect(CODEX_CONFIG_WHERE).toBe(
      "Collez ce bloc tel quel à la fin du fichier ~/.codex/config.toml.",
    );
    const t = setup(KEY);
    const blocks = [...t.frame.querySelectorAll(".connection-copyable")].slice(1);
    expect(blocks.map((block) => block.querySelector(".connection-where")?.textContent)).toEqual([
      CLAUDE_CONFIG_WHERE,
      CODEX_CONFIG_WHERE,
    ]);
    expect(
      blocks.map((block) =>
        [...block.querySelectorAll(".connection-where code")].map((c) => c.textContent),
      ),
    ).toEqual([[".mcp.json"], ["~/.codex/config.toml"]]);
    // Titre, puis phrase, puis bloc, puis bouton.
    for (const block of blocks) {
      expect([...block.children].map((child) => child.className)).toEqual([
        "setting-help",
        "setting-help connection-where",
        "connection-text",
        "tool",
      ]);
    }
    // La clé seule n'a pas de fichier.
    const key = t.frame.querySelector(".connection-copyable");
    expect(key?.querySelector(".connection-where")).toBeNull();
  });

  it("garde les phrases et les blocs dans la largeur de la partie, même longs", () => {
    const t = setup({
      key: {
        secret: "abc123",
        createdOn: "25 novembre 2026",
        claudeConfig: `{\n  "command": "/Applications/${"x".repeat(200)}"\n}`,
        codexConfig: `command = "/Applications/${"y".repeat(200)}"`,
      },
    });
    const frame = t.frame.getBoundingClientRect();
    for (const element of t.frame.querySelectorAll(".connection-where, .connection-text")) {
      const box = element.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(frame.left);
      expect(box.right).toBeLessThanOrEqual(frame.right);
    }
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

  it("confirme la copie sur le bouton : vert, « ✓ Copié », puis « Copier » au bout de 2 secondes", async () => {
    vi.useFakeTimers();
    try {
      const t = setup(KEY);
      const copy = t.buttons()[1] as HTMLButtonElement;
      const title =
        "Configuration pour Claude (extension VS Code, Claude Code hors de l'application)";
      copy.click();
      await vi.advanceTimersByTimeAsync(0);
      expect([copy.textContent, copy.getAttribute("aria-label"), copy.className]).toEqual([
        "✓ Copié",
        `Copié : ${title}`,
        "tool copied",
      ]);
      expect(copy.getAttribute("aria-live")).toBe("polite");
      expect(t.buttons().map((b) => b.textContent)).toEqual([
        "Copier",
        "✓ Copié",
        "Copier",
        "Révoquer la clé",
      ]);
      await vi.advanceTimersByTimeAsync(COPIED_FOR_MS - 1);
      expect(copy.textContent).toBe("✓ Copié");
      await vi.advanceTimersByTimeAsync(1);
      expect([copy.textContent, copy.getAttribute("aria-label"), copy.className]).toEqual([
        "Copier",
        `Copier : ${title}`,
        "tool",
      ]);
      expect(COPIED_FOR_MS).toBe(2000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ne confirme rien quand la copie n'a pas eu lieu", async () => {
    const t = setup(KEY, false);
    const copy = t.buttons()[0] as HTMLButtonElement;
    copy.click();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([copy.textContent, copy.className]).toEqual(["Copier", "tool"]);
  });

  it("a des boutons de taille normale, sous le texte sans le recouvrir, et vert une fois copié", async () => {
    const t = setup(KEY);
    const blocks = [...t.frame.querySelectorAll(".connection-copyable")];
    for (const block of blocks) {
      const text = block.querySelector(".connection-text")?.getBoundingClientRect();
      const copy = block.querySelector("button")?.getBoundingClientRect();
      expect(copy?.height).toBeGreaterThan(28);
      expect(copy?.top).toBeGreaterThanOrEqual((text?.bottom ?? Infinity) + 4);
    }
    const first = t.buttons()[0] as HTMLButtonElement;
    const normal = getComputedStyle(first).color;
    first.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const probe = document.createElement("span");
    probe.style.color = "var(--success)";
    document.body.append(probe);
    expect(getComputedStyle(first).color).toBe(getComputedStyle(probe).color);
    expect(getComputedStyle(first).color).not.toBe(normal);
  });

  it("se redessine à la place du dessin précédent", () => {
    const t = setup(KEY);
    renderConnectionSettings(t.frame, { key: null }, WORKSPACES, {
      create() {},
      revoke() {},
      allow() {},
      copy: () => Promise.resolve(true),
    });
    expect(t.frame.querySelectorAll("legend")).toHaveLength(1);
    expect(t.buttons().map((b) => b.textContent)).toEqual(["Créer une clé de branchement"]);
  });

  describe("espaces de travail ouverts aux IA", () => {
    const boxes = (t: ReturnType<typeof setup>) =>
      [...t.frame.querySelectorAll<HTMLLabelElement>(".allowed-workspace")].map((label) => ({
        name: label.textContent,
        checked: (label.querySelector("input") as HTMLInputElement).checked,
        type: (label.querySelector("input") as HTMLInputElement).type,
      }));

    it("montre une case par espace de travail, cochée seulement pour ceux que l'utilisateur a autorisés", () => {
      const t = setup({ key: null });
      expect(boxes(t)).toEqual([
        { name: "Notes", checked: false, type: "checkbox" },
        { name: "Travail", checked: true, type: "checkbox" },
      ]);
    });

    it("se voit sans clé de branchement comme avec une clé, avant la clé", () => {
      for (const info of [{ key: null }, KEY, null]) {
        const t = setup(info);
        expect(boxes(t)).toHaveLength(2);
        const block = t.frame.querySelector(".allowed-workspaces") as HTMLElement;
        expect(block.nextElementSibling?.textContent).not.toBe(WORKSPACES_TITLE);
        expect(block.previousElementSibling?.textContent).toBe(CONNECTION_PURPOSE);
      }
    });

    it("coche et décoche au clic, en disant quel espace et quel état", () => {
      const t = setup({ key: null });
      const [notes, travail] = [
        ...t.frame.querySelectorAll<HTMLInputElement>(".allowed-workspace input"),
      ];
      notes?.click();
      travail?.click();
      expect(t.calls).toEqual(["autoriser Notes", "retirer Travail"]);
    });

    it("dit que la lecture est en cours, ou qu'il n'y a aucun espace de travail", () => {
      const loading = setup({ key: null }, true, null);
      expect(boxes(loading)).toEqual([]);
      expect(loading.frame.textContent).toContain(WORKSPACES_LOADING);
      expect(loading.frame.textContent).not.toContain(WORKSPACES_EMPTY);
      const empty = setup({ key: null }, true, []);
      expect(boxes(empty)).toEqual([]);
      expect(empty.frame.textContent).toContain(WORKSPACES_EMPTY);
      expect(empty.frame.textContent).not.toContain(WORKSPACES_LOADING);
    });

    it("explique que les IA ne voient que les espaces cochés, aucun au départ", () => {
      expect(WORKSPACES_TITLE).toBe("Espaces de travail ouverts aux IA");
      expect(WORKSPACES_HELP).toContain("ne voient que les espaces cochés");
      expect(WORKSPACES_HELP).toContain("aucun n'est coché au départ");
    });

    it("aligne la case et le nom sur une ligne", () => {
      const t = setup({ key: null });
      const label = t.frame.querySelector(".allowed-workspace") as HTMLElement;
      expect(getComputedStyle(label).display).toBe("flex");
      const box = label.querySelector("input")?.getBoundingClientRect();
      const name = label.querySelector("span")?.getBoundingClientRect();
      expect(box?.right).toBeLessThanOrEqual(name?.left ?? 0);
    });
  });
});
