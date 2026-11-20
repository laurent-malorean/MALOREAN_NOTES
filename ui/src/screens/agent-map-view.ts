// Carte des agents, en haut de la colonne Claude Code : repliée, elle dit combien de sous-agents
// ont été lancés et combien travaillent ; dépliée, l'arbre des sous-agents (fiche 0032).
import {
  type AgentBranch,
  type AgentMap,
  agentDetails,
  agentMapHeadline,
  agentTree,
} from "../state/agent-map";

export const AGENT_MAP_TITLE = "Carte des agents";
export const NO_SUB_AGENT = "Aucun sous-agent lancé dans cette conversation.";

function element(tag: string, className: string, ...children: (string | Node)[]): HTMLElement {
  const created = document.createElement(tag);
  created.className = className;
  created.append(...children);
  return created;
}

function tree(branches: readonly AgentBranch[]): HTMLElement {
  const list = element("ul", "claude-agent-tree");
  for (const { agent, children } of branches) {
    const node = element("li", `claude-agent claude-agent-${agent.state}`);
    node.append(
      element("span", "claude-agent-description", agent.description),
      element("span", "claude-agent-details", agentDetails(agent)),
    );
    if (children.length > 0) node.append(tree(children));
    list.append(node);
  }
  return list;
}

/**
 * Rend la fonction qui montre la carte dans `details`, au fil des événements. Sans sous-agent, elle
 * est cachée, sauf dépliée (d'un clic sur la pastille des sous-agents) : elle le dit, et se cache
 * de nouveau une fois repliée. Vidée (nouvelle conversation), elle se replie et se cache.
 */
export function createAgentMapView(details: HTMLDetailsElement): (map: AgentMap) => void {
  const summary = element("summary", "claude-agents-summary");
  const headline = element("span", "claude-agents-headline");
  summary.append(element("span", "claude-agents-title", AGENT_MAP_TITLE), headline);
  let empty = true;
  details.addEventListener("toggle", () => {
    if (!details.open && empty) details.hidden = true;
  });
  return (map) => {
    const emptied = !empty && map.agents.length === 0;
    empty = map.agents.length === 0;
    if (emptied) details.open = false;
    details.hidden = empty && !details.open;
    headline.textContent = agentMapHeadline(map);
    const content = empty
      ? element("p", "claude-agents-empty", NO_SUB_AGENT)
      : tree(agentTree(map));
    details.replaceChildren(summary, content);
  };
}
