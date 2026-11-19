import { beforeEach, describe, expect, it } from "vitest";
import { type AgentMap, NO_AGENTS, type SubAgent } from "../state/agent-map";
import { AGENT_MAP_TITLE, createAgentMapView } from "./agent-map-view";

let details: HTMLDetailsElement;
let show: (map: AgentMap) => void;

const agent = (id: string, parent: string | null, state: SubAgent["state"]): SubAgent => ({
  id,
  parent,
  description: `Agent ${id}`,
  state,
  durationMs: state === "running" ? null : 3339,
  tokens: state === "running" ? null : 8523,
  actions: 2,
});

const MAP: AgentMap = {
  agents: [agent("A", null, "running"), agent("B", "A", "done"), agent("C", null, "failed")],
};

const find = <T extends Element>(selector: string) => details.querySelector(selector) as T;
const all = (selector: string, within: Element = details) => [
  ...within.querySelectorAll(`:scope ${selector}`),
];

beforeEach(() => {
  details = document.createElement("details");
  document.body.replaceChildren(details);
  show = createAgentMapView(details);
});

describe("carte des agents : la vue", () => {
  it("cachée tant qu'aucun sous-agent n'a été lancé", () => {
    show(NO_AGENTS);
    expect(details.hidden).toBe(true);
    show(MAP);
    expect(details.hidden).toBe(false);
    show(NO_AGENTS);
    expect(details.hidden).toBe(true);
  });

  it("repliée au départ, elle dit son nom, combien de sous-agents et combien travaillent", () => {
    show(MAP);
    expect(details.open).toBe(false);
    expect(details.firstElementChild?.className).toBe("claude-agents-summary");
    expect(find(".claude-agents-summary").textContent).toBe(
      `${AGENT_MAP_TITLE}3 sous-agents · 1 en cours`,
    );
    expect(find(".claude-agents-title").textContent).toBe(AGENT_MAP_TITLE);
    expect(AGENT_MAP_TITLE).toBe("Carte des agents");
    expect(find(".claude-agents-headline").textContent).toBe("3 sous-agents · 1 en cours");
  });

  it("dépliée, chaque sous-agent sous celui qui l'a lancé, avec sa description et son détail", () => {
    show(MAP);
    const roots = all("> .claude-agent-tree > .claude-agent");
    expect(
      roots.map((root) => root.querySelector(".claude-agent-description")?.textContent),
    ).toEqual(["Agent A", "Agent C"]);
    const nested = all("> .claude-agent-tree > .claude-agent", roots[0]);
    expect(
      nested.map((node) => node.querySelector(".claude-agent-description")?.textContent),
    ).toEqual(["Agent B"]);
    expect(all(".claude-agent-details").map((node) => node.textContent)).toEqual([
      "en cours · 2 actions",
      "terminé · 3,3 s · 8 523 jetons · 2 actions",
      "en erreur · 3,3 s · 8 523 jetons · 2 actions",
    ]);
    expect(all(".claude-agent").map((node) => node.className)).toEqual([
      "claude-agent claude-agent-running",
      "claude-agent claude-agent-done",
      "claude-agent claude-agent-failed",
    ]);
    expect(all(".claude-agent-tree")).toHaveLength(2);
  });

  it("suit les événements sans se replier", () => {
    show(MAP);
    details.open = true;
    show({ agents: MAP.agents.map((one) => ({ ...one, state: "done" as const })) });
    expect(details.open).toBe(true);
    expect(find(".claude-agents-headline").textContent).toBe("3 sous-agents");
    expect(all(".claude-agent")).toHaveLength(3);
  });
});
