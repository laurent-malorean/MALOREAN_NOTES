// Réglages, onglet « Claude », rubrique « Serveurs MCP » : les serveurs MCP extérieurs que Claude Code connaît, une case
// par serveur, leur état en toutes lettres, « Actualiser » (fiche 0105, spécification « serveurs-mcp » § 3).
import type { McpServerItem } from "../bridge";
import {
  CHECKBOX_HELP,
  connectHint,
  EMPTY,
  INTRO,
  LOADING,
  type McpServersState,
  REFRESH,
  STATE_LABELS,
  TITLE,
} from "../state/mcp-servers";
import "./mcp-servers.css";

/** Ce que l'utilisateur peut demander depuis la rubrique : chacun est lancé par l'application. */
export interface McpServersActions {
  /** Coche (`true`) ou décoche le serveur `name`. */
  readonly toggle: (name: string, allowed: boolean) => void;
  /** Relit la liste auprès de Claude Code. */
  readonly refresh: () => void;
}

export interface McpServersSetting {
  readonly element: HTMLElement;
  show(state: McpServersState): void;
}

function paragraph(className: string, content: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = content;
  return element;
}

/** La phrase sous un serveur « À connecter » : du texte, et les commandes à taper en police de code. */
function hint(parts: string | readonly { readonly text: string; readonly code?: true }[]) {
  const element = document.createElement("p");
  element.className = "mcp-server-hint";
  if (typeof parts === "string") {
    element.textContent = parts;
    return element;
  }
  for (const part of parts) {
    if (!part.code) {
      element.append(part.text);
      continue;
    }
    const code = document.createElement("code");
    code.textContent = part.text;
    element.append(code);
  }
  return element;
}

/** Une ligne : la case nommée par le serveur, son nom, son état, et sous elle ce qu'il faut faire s'il est à connecter. */
function line(server: McpServerItem, index: number, actions: McpServersActions): HTMLLIElement {
  const id = `mcp-server-${index}`;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = id;
  checkbox.checked = server.allowed;
  checkbox.title = CHECKBOX_HELP;
  checkbox.setAttribute("aria-labelledby", `${id}-name`);
  checkbox.addEventListener("change", () => actions.toggle(server.name, checkbox.checked));
  const name = document.createElement("label");
  name.id = `${id}-name`;
  name.htmlFor = id;
  name.className = "mcp-server-name";
  name.textContent = server.displayName;
  const state = document.createElement("span");
  state.id = `${id}-state`;
  state.className = `mcp-server-state mcp-server-${server.state}`;
  state.textContent = STATE_LABELS[server.state];
  const described = [state.id];
  const item = document.createElement("li");
  item.className = "mcp-server";
  item.append(checkbox, name, state);
  const text = connectHint(server);
  if (text !== null) {
    const help = hint(text);
    help.id = `${id}-hint`;
    described.push(help.id);
    item.append(help);
  }
  checkbox.setAttribute("aria-describedby", described.join(" "));
  return item;
}

/** La partie « Serveurs MCP » de l'écran de réglages. */
export function mcpServersGroup(actions: McpServersActions): McpServersSetting {
  const legend = document.createElement("legend");
  legend.textContent = TITLE;
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "tool mcp-refresh";
  refresh.textContent = REFRESH;
  refresh.addEventListener("click", actions.refresh);
  const head = document.createElement("div");
  head.className = "mcp-head";
  head.append(paragraph("setting-help", INTRO), refresh);
  const status = document.createElement("p");
  status.className = "mcp-status";
  status.setAttribute("role", "status");
  const list = document.createElement("ul");
  list.className = "mcp-servers";
  list.setAttribute("aria-label", TITLE);
  const element = document.createElement("fieldset");
  element.className = "mcp-servers-group";
  element.append(legend, head, status, list);
  const show = (state: McpServersState) => {
    refresh.disabled = state.kind === "loading";
    status.hidden = state.kind === "listed" && state.servers.length > 0;
    status.classList.toggle("setting-error", state.kind === "unavailable");
    list.replaceChildren();
    if (state.kind === "loading") status.textContent = LOADING;
    else if (state.kind === "unavailable") status.textContent = state.message;
    else if (state.servers.length === 0) status.textContent = EMPTY;
    else list.append(...state.servers.map((server, index) => line(server, index, actions)));
  };
  show({ kind: "loading" });
  return { element, show };
}
