import { beforeEach, describe, expect, it } from "vitest";
import { settle } from "../../test-support/app-fixture";
import type { McpServerItem, McpServersItem } from "../bridge";
import { TAB_SHOWN } from "../state/settings-tabs";
import { createMcpServers, type McpServersDeps } from "./mcp-servers";
import "../theme.css";
import "../style.css";

const server = (name: string, changes: Partial<McpServerItem> = {}): McpServerItem => ({
  name: `claude.ai ${name}`,
  displayName: name,
  connector: true,
  state: "connected",
  allowed: false,
  ...changes,
});

/** Une lecture qui échoue avec `reason`. */
const failure = (reason: unknown) => ({ reason });

function setup(
  listings: (McpServersItem | ReturnType<typeof failure>)[],
  failing: Record<string, unknown> = {},
) {
  const calls: string[] = [];
  const errors: unknown[] = [];
  const pending: (() => void)[] = [];
  const deps: McpServersDeps = {
    backend: {
      listMcpServers: () => {
        calls.push("liste");
        const next = listings.shift() as McpServersItem | ReturnType<typeof failure>;
        return new Promise((resolve, reject) => {
          const settleIt = () => ("reason" in next ? reject(next.reason) : resolve(next));
          if (hold.on) pending.push(settleIt);
          else settleIt();
        });
      },
      allowMcpServer: async (name) => {
        calls.push(`cocher ${name}`);
        if (failing.allow) throw failing.allow;
        return null;
      },
      disallowMcpServer: async (name) => {
        calls.push(`décocher ${name}`);
        if (failing.disallow) throw failing.disallow;
        return null;
      },
    },
    error: (error) => errors.push(error),
  };
  const hold = { on: false };
  const [element] = createMcpServers(deps).settingsGroups() as [HTMLElement];
  document.body.replaceChildren(element);
  const show = () => element.dispatchEvent(new Event(TAB_SHOWN));
  const boxes = () => [...element.querySelectorAll<HTMLInputElement>("input")];
  const status = () => element.querySelector<HTMLElement>(".mcp-status") as HTMLElement;
  const refresh = () =>
    [...element.querySelectorAll("button")].find(
      (button) => button.textContent === "Actualiser",
    ) as HTMLButtonElement;
  return { calls, errors, pending, hold, element, show, boxes, status, refresh };
}

let listed: McpServersItem;
beforeEach(() => {
  listed = {
    kind: "listed",
    servers: [server("Figma", { state: "toConnect" }), server("Noota"), server("Slack")],
  };
});

describe("serveurs MCP : la rubrique des réglages", () => {
  it("ne lit rien avant que l'onglet soit montré, puis lit la liste une seule fois", async () => {
    const t = setup([listed]);
    await settle();
    expect(t.calls).toEqual([]);
    expect(t.status().textContent).toBe("Lecture des serveurs de Claude Code…");
    t.show();
    t.show();
    await settle();
    expect(t.calls).toEqual(["liste"]);
    expect(t.boxes()).toHaveLength(3);
  });

  it("dit « Lecture des serveurs de Claude Code… » pendant la lecture, puis montre la liste", async () => {
    const t = setup([listed]);
    t.hold.on = true;
    t.show();
    await settle();
    expect(t.status().textContent).toBe("Lecture des serveurs de Claude Code…");
    expect(t.refresh().disabled).toBe(true);
    t.pending.shift()?.();
    await settle();
    expect(t.boxes().map((box) => box.checked)).toEqual([false, false, false]);
    expect(t.refresh().disabled).toBe(false);
  });

  it("montre la phrase du moteur quand Claude Code est absent ou pas connecté", async () => {
    const t = setup([{ kind: "unavailable", message: "Claude Code n'est pas connecté." }]);
    t.show();
    await settle();
    expect(t.status().textContent).toBe("Claude Code n'est pas connecté.");
    expect(t.boxes()).toEqual([]);
  });

  it("dit l'erreur du moteur quand la lecture échoue, et « Actualiser » relit", async () => {
    const t = setup([failure(new Error("lecture impossible")), listed]);
    t.show();
    await settle();
    expect(t.status().textContent).toBe("lecture impossible");
    t.refresh().click();
    await settle();
    expect(t.boxes()).toHaveLength(3);
    expect(t.calls).toEqual(["liste", "liste"]);
  });

  it("dit une erreur qui n'est qu'un texte telle quelle", async () => {
    const t = setup([failure("lecture refusée")]);
    t.show();
    await settle();
    expect(t.status().textContent).toBe("lecture refusée");
  });

  it("dit le message d'une erreur du moteur telle qu'il la donne", async () => {
    const t = setup([failure({ message: "préférences illisibles" })]);
    t.show();
    await settle();
    expect(t.status().textContent).toBe("préférences illisibles");
  });

  it("coche un serveur aussitôt, sans relire la liste", async () => {
    const t = setup([listed]);
    t.show();
    await settle();
    // Les serveurs connectés viennent d'abord : Noota, Slack, puis Figma « À connecter ».
    (t.boxes()[0] as HTMLInputElement).click();
    await settle();
    expect(t.calls).toEqual(["liste", "cocher claude.ai Noota"]);
    expect(t.boxes().map((box) => box.checked)).toEqual([true, false, false]);
    expect(t.errors).toEqual([]);
  });

  it("décoche un serveur coché", async () => {
    listed = { kind: "listed", servers: [server("Noota", { allowed: true })] };
    const t = setup([listed]);
    t.show();
    await settle();
    (t.boxes()[0] as HTMLInputElement).click();
    await settle();
    expect(t.calls).toEqual(["liste", "décocher claude.ai Noota"]);
    expect(t.boxes()[0]?.checked).toBe(false);
  });

  it("fait disparaître un serveur introuvable décoché", async () => {
    listed = {
      kind: "listed",
      servers: [server("Notion", { state: "notFound", allowed: true }), server("Noota")],
    };
    const t = setup([listed]);
    t.show();
    await settle();
    // Noota (connecté) vient avant Notion (introuvable).
    (t.boxes()[1] as HTMLInputElement).click();
    await settle();
    expect(t.element.querySelectorAll("li")).toHaveLength(1);
    expect(t.element.querySelector("label")?.textContent).toBe("Noota");
  });

  it("remet la case comme elle était et montre l'erreur quand le moteur refuse", async () => {
    const error = { message: "préférences impossibles à écrire" };
    const t = setup([listed], { allow: error });
    t.show();
    await settle();
    (t.boxes()[0] as HTMLInputElement).click();
    await settle();
    expect(t.boxes().map((box) => box.checked)).toEqual([false, false, false]);
    expect(t.errors).toEqual([error]);
  });

  it("ne coche rien tant que la liste n'est pas lue", async () => {
    const t = setup([listed]);
    await settle();
    expect(t.boxes()).toEqual([]);
    expect(t.calls).toEqual([]);
  });
});
