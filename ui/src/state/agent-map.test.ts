import { describe, expect, it } from "vitest";
import type { ClaudeEventItem } from "../bridge";
import {
  type AgentMap,
  agentDetails,
  agentEventReceived,
  agentMapHeadline,
  agentTree,
  agentTurnEnded,
  NO_AGENTS,
  type SubAgent,
} from "./agent-map";

const launched = (id: string, agent: string | null, target: string | null): ClaudeEventItem => ({
  kind: "actionStarted",
  agent,
  id,
  action: "subAgent",
  tool: null,
  target,
});
const read = (id: string, agent: string | null): ClaudeEventItem => ({
  kind: "actionStarted",
  agent,
  id,
  action: "read",
  tool: null,
  target: "/Users/moi/Notes/a.md",
});
const finished = (id: string, state: SubAgent["state"] = "done"): ClaudeEventItem => ({
  kind: "subAgentFinished",
  id,
  state,
  durationMs: 3339,
  tokens: 8523,
  actions: 2,
});

const play = (events: readonly ClaudeEventItem[], map: AgentMap = NO_AGENTS) =>
  events.reduce(agentEventReceived, map);

const running = (id: string, parent: string | null, description: string): SubAgent => ({
  id,
  parent,
  description,
  state: "running",
  durationMs: null,
  tokens: null,
  actions: 0,
});

describe("carte des agents : construite à partir des événements de Claude", () => {
  it("vide au départ ; ni message, ni action de Claude lui-même n'y ajoutent rien", () => {
    expect(NO_AGENTS).toEqual({ agents: [] });
    const events: ClaudeEventItem[] = [
      { kind: "message", agent: null, text: "Je regarde." },
      read("r", null),
      { kind: "actionFinished", id: "r", succeeded: true },
      { kind: "changeHeldBack", id: "r" },
      { kind: "changedNote", path: "a.md" },
      { kind: "summary", failure: null, durationMs: 10, tokens: 5 },
    ];
    expect(play(events)).toEqual(NO_AGENTS);
  });

  it("une action « sous-agent » en lance un, en cours, avec sa description", () => {
    expect(play([launched("A", null, "Compter les articles")])).toEqual({
      agents: [running("A", null, "Compter les articles")],
    });
  });

  it("sans description, le sous-agent est dit « Sous-agent »", () => {
    expect(play([launched("A", null, null)]).agents[0]?.description).toBe("Sous-agent");
  });

  it("compte les actions lancées par chaque sous-agent, dont les sous-agents qu'il lance", () => {
    const map = play([
      launched("A", null, "Compter"),
      read("r1", "A"),
      launched("B", "A", "Lire"),
      read("r2", "B"),
      read("r3", "B"),
      read("r4", null),
    ]);
    expect(map.agents).toEqual([
      { ...running("A", null, "Compter"), actions: 2 },
      { ...running("B", "A", "Lire"), actions: 2 },
    ]);
  });

  it("sa fin donne son état, sa durée, ses jetons et le nombre d'actions annoncés", () => {
    const map = play([launched("A", null, "Compter"), read("r1", "A"), finished("A")]);
    expect(map.agents).toEqual([
      {
        ...running("A", null, "Compter"),
        state: "done",
        durationMs: 3339,
        tokens: 8523,
        actions: 2,
      },
    ]);
    expect(play([launched("A", null, "C"), finished("A", "failed")]).agents[0]?.state).toBe(
      "failed",
    );
  });

  it("la fin d'un sous-agent inconnu ne change rien", () => {
    const map = play([launched("A", null, "Compter")]);
    expect(agentEventReceived(map, finished("Z"))).toEqual(map);
  });

  it("le lancement réussi ne dit pas qu'il a fini : il travaille en arrière-plan", () => {
    const map = play([launched("A", null, "Compter")]);
    expect(agentEventReceived(map, { kind: "actionFinished", id: "A", succeeded: true })).toEqual(
      map,
    );
  });

  it("un lancement refusé ou en erreur : le sous-agent est en erreur", () => {
    const map = play([launched("A", null, "Compter"), launched("B", null, "Chercher")]);
    const after = play(
      [
        { kind: "actionRefused", id: "A" },
        { kind: "actionFinished", id: "A", succeeded: false },
        { kind: "actionFinished", id: "B", succeeded: false },
      ],
      map,
    );
    expect(after.agents.map((agent) => agent.state)).toEqual(["failed", "failed"]);
  });

  it("une issue en erreur ne revient pas sur la fin annoncée", () => {
    const map = play([launched("A", null, "Compter"), finished("A")]);
    expect(
      agentEventReceived(map, { kind: "actionFinished", id: "A", succeeded: false }).agents[0]
        ?.state,
    ).toBe("done");
  });

  it("la fin d'une autre action ne touche pas aux sous-agents", () => {
    const map = play([launched("A", null, "Compter"), read("r", "A")]);
    expect(play([{ kind: "actionFinished", id: "r", succeeded: false }], map)).toEqual(map);
    expect(play([{ kind: "actionRefused", id: "r" }], map)).toEqual(map);
  });
});

describe("carte des agents : la fin du tour", () => {
  const map = play([launched("A", null, "Compter"), launched("B", null, "Lire"), finished("B")]);

  it("un tour arrêté ou en erreur laisse ses sous-agents en cours interrompus", () => {
    expect(agentTurnEnded(map, true).agents.map((agent) => agent.state)).toEqual([
      "stopped",
      "done",
    ]);
  });

  it("un tour fini normalement : ses sous-agents ont fini leur travail", () => {
    expect(agentTurnEnded(map, false).agents.map((agent) => agent.state)).toEqual(["done", "done"]);
  });

  it("une carte sans sous-agent en cours ne change pas", () => {
    expect(agentTurnEnded(NO_AGENTS, true)).toBe(NO_AGENTS);
    const ended = agentTurnEnded(map, false);
    expect(agentTurnEnded(ended, true)).toBe(ended);
  });
});

describe("carte des agents : l'arbre", () => {
  it("chaque sous-agent sous celui qui l'a lancé, dans l'ordre de lancement", () => {
    const map = play([
      launched("A", null, "Compter"),
      launched("B", "A", "Lire"),
      launched("C", null, "Chercher"),
      launched("D", "B", "Vérifier"),
      launched("E", "A", "Relire"),
    ]);
    const shape = (branches: ReturnType<typeof agentTree>): unknown[] =>
      branches.map(({ agent, children }) => [agent.id, shape(children)]);
    expect(shape(agentTree(map))).toEqual([
      [
        "A",
        [
          ["B", [["D", []]]],
          ["E", []],
        ],
      ],
      ["C", []],
    ]);
  });

  it("un sous-agent dont le parent est inconnu est montré à la racine", () => {
    const map = play([launched("B", "Z", "Lire")]);
    expect(agentTree(map).map(({ agent }) => agent.id)).toEqual(["B"]);
  });
});

describe("carte des agents : le détail d'un sous-agent", () => {
  it("en cours : son état et ses actions jusqu'ici", () => {
    expect(agentDetails(running("A", null, "C"))).toBe("en cours · 0 action");
    expect(agentDetails({ ...running("A", null, "C"), actions: 1 })).toBe("en cours · 1 action");
  });

  it("fini : son état, sa durée, ses jetons et ses actions, en français", () => {
    const done: SubAgent = {
      ...running("A", null, "C"),
      state: "done",
      durationMs: 3339,
      tokens: 8523,
      actions: 2,
    };
    expect(agentDetails(done)).toBe("terminé · 3,3 s · 8 523 jetons · 2 actions");
    expect(agentDetails({ ...done, state: "failed" })).toBe(
      "en erreur · 3,3 s · 8 523 jetons · 2 actions",
    );
    expect(agentDetails({ ...running("A", null, "C"), state: "stopped" })).toBe(
      "interrompu · 0 action",
    );
  });
});

describe("carte des agents : repliée", () => {
  it("dit combien de sous-agents ont été lancés, et combien travaillent encore", () => {
    const map = play([launched("A", null, "Compter"), launched("B", "A", "Lire")]);
    expect(agentMapHeadline(play([launched("A", null, "C")]))).toBe("1 sous-agent · 1 en cours");
    expect(agentMapHeadline(map)).toBe("2 sous-agents · 2 en cours");
    expect(agentMapHeadline(play([finished("B")], map))).toBe("2 sous-agents · 1 en cours");
    expect(agentMapHeadline(agentTurnEnded(map, false))).toBe("2 sous-agents");
  });
});
