// Carte des agents : l'arbre des sous-agents lancés pendant la conversation, avec leur état,
// leur durée, leurs jetons et leur nombre d'actions, construit à partir des seuls événements de
// Claude (fiche 0032).
import type { AgentStateItem, ClaudeEventItem } from "../bridge";
import { durationText, tokensText } from "./claude-column";

/** Un sous-agent, désigné par l'action qui l'a lancé. */
export interface SubAgent {
  readonly id: string;
  /** Le sous-agent qui l'a lancé ; rien si c'est Claude lui-même. */
  readonly parent: string | null;
  readonly description: string;
  readonly state: AgentStateItem;
  /** Connus à sa fin seulement. */
  readonly durationMs: number | null;
  readonly tokens: number | null;
  /** Comptées au fil des actions lancées, puis celles annoncées à sa fin. */
  readonly actions: number;
}

/** Les sous-agents dans l'ordre de leur lancement. */
export interface AgentMap {
  readonly agents: readonly SubAgent[];
}

/** Un sous-agent et ceux qu'il a lancés. */
export interface AgentBranch {
  readonly agent: SubAgent;
  readonly children: readonly AgentBranch[];
}

export const NO_AGENTS: AgentMap = { agents: [] };

/** Comment l'état d'un sous-agent s'écrit. */
export const AGENT_STATES: Readonly<Record<AgentStateItem, string>> = {
  running: "en cours",
  done: "terminé",
  failed: "en erreur",
  stopped: "interrompu",
};

const DEFAULT_DESCRIPTION = "Sous-agent";

/** Le sous-agent `id` changé ; rien pour Claude lui-même (`null`). */
const changed = (
  map: AgentMap,
  id: string | null,
  change: (agent: SubAgent) => SubAgent,
): AgentMap => ({
  agents: map.agents.map((agent) => (agent.id === id ? change(agent) : agent)),
});

/** Une action lancée : un sous-agent de plus si c'en est une, une action de plus pour son auteur. */
function withAction(map: AgentMap, event: Extract<ClaudeEventItem, { kind: "actionStarted" }>) {
  const counted = changed(map, event.agent, (agent) => ({ ...agent, actions: agent.actions + 1 }));
  if (event.action !== "subAgent") return counted;
  const launched: SubAgent = {
    id: event.id,
    parent: event.agent,
    description: event.target ?? DEFAULT_DESCRIPTION,
    state: "running",
    durationMs: null,
    tokens: null,
    actions: 0,
  };
  return { agents: [...counted.agents, launched] };
}

/** Un lancement en erreur (dont refusé) : le sous-agent n'a pas travaillé. */
const withLaunchFailed = (map: AgentMap, id: string) =>
  changed(map, id, (agent) => (agent.state === "running" ? { ...agent, state: "failed" } : agent));

/** Un événement de Claude est arrivé. */
export function agentEventReceived(map: AgentMap, event: ClaudeEventItem): AgentMap {
  switch (event.kind) {
    case "actionStarted":
      return withAction(map, event);
    case "actionFinished":
      // Un lancement réussi dit seulement que le sous-agent travaille en arrière-plan.
      return event.succeeded ? map : withLaunchFailed(map, event.id);
    case "subAgentFinished": {
      const { state, durationMs, tokens, actions } = event;
      return changed(map, event.id, (agent) => ({ ...agent, state, durationMs, tokens, actions }));
    }
    // Un refus est toujours suivi de l'issue en erreur de l'action, qui suffit.
    case "actionRefused":
    case "changeHeldBack":
    case "message":
    case "changedNote":
    case "summary":
      return map;
  }
}

/**
 * Le tour est fini : arrêté ou en erreur (`interrupted`), ses sous-agents en cours sont
 * interrompus ; fini normalement, Claude Code les a attendus, ils ont fini leur travail.
 */
export function agentTurnEnded(map: AgentMap, interrupted: boolean): AgentMap {
  if (!map.agents.some((agent) => agent.state === "running")) return map;
  const state: AgentStateItem = interrupted ? "stopped" : "done";
  return {
    agents: map.agents.map((agent) => (agent.state === "running" ? { ...agent, state } : agent)),
  };
}

/** L'arbre : chaque sous-agent sous celui qui l'a lancé ; un parent inconnu le met à la racine. */
export function agentTree(map: AgentMap): readonly AgentBranch[] {
  const known = new Set<string | null>(map.agents.map((agent) => agent.id));
  const branches = (parent: string | null): AgentBranch[] =>
    map.agents
      .filter((agent) => (known.has(agent.parent) ? agent.parent : null) === parent)
      .map((agent) => ({ agent, children: branches(agent.id) }));
  return branches(null);
}

/** Le détail d'un sous-agent : « terminé · 3,3 s · 8 523 jetons · 2 actions ». */
export function agentDetails(agent: SubAgent): string {
  const parts = [AGENT_STATES[agent.state]];
  if (agent.durationMs !== null) parts.push(durationText(agent.durationMs));
  if (agent.tokens !== null) parts.push(tokensText(agent.tokens));
  parts.push(`${agent.actions} ${agent.actions > 1 ? "actions" : "action"}`);
  return parts.join(" · ");
}

/** Ce que la carte dit, repliée : « 2 sous-agents · 1 en cours ». */
export function agentMapHeadline(map: AgentMap): string {
  const count = map.agents.length;
  const working = map.agents.filter((agent) => agent.state === "running").length;
  const launched = `${count} ${count > 1 ? "sous-agents" : "sous-agent"}`;
  return working === 0 ? launched : `${launched} · ${working} ${AGENT_STATES.running}`;
}
