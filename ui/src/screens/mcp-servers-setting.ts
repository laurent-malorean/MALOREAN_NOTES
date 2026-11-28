// Réglages, onglet « Claude », rubrique « Serveurs MCP » : les serveurs MCP extérieurs que Claude Code connaît, regroupés
// par état (« Connectés » d'abord), une case par serveur, leur état en toutes lettres, « Actualiser » (fiche 0105,
// spécification « serveurs-mcp » § 3). La phrase qui dit quoi faire pour un serveur « À connecter » est dite une seule fois.
import type { McpServerItem } from "../bridge";
import {
  CHECKBOX_HELP,
  countText,
  EMPTY,
  FOLD_TEXT,
  groupServers,
  INTRO,
  LOADING,
  type McpServersState,
  REFRESH,
  type ServerBlock,
  type ServerGroup,
  STATE_LABELS,
  shown,
  TITLE,
  unfoldText,
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

/** La phrase qui dit quoi faire : du texte, et les commandes à taper en police de code. */
function hint(parts: ServerBlock["hint"], id: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.id = id;
  element.className = "mcp-hint";
  if (typeof parts === "string") {
    element.textContent = parts;
    return element;
  }
  for (const part of parts ?? []) {
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

/** Une ligne : la case nommée par le serveur, son nom, son état ; elle est décrite par son état et la phrase de son bloc. */
function line(
  server: McpServerItem,
  id: string,
  hintId: string | null,
  actions: McpServersActions,
): HTMLLIElement {
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
  checkbox.setAttribute("aria-describedby", [state.id, hintId].filter(Boolean).join(" "));
  const item = document.createElement("li");
  item.className = "mcp-server";
  item.append(checkbox, name, state);
  return item;
}

/** Un bloc : sa phrase (une seule fois) puis ses lignes. `next` donne le numéro de la ligne suivante, pour des identifiants uniques. */
function block(
  group: ServerGroup,
  one: ServerBlock,
  folded: boolean,
  next: () => number,
  actions: McpServersActions,
): HTMLElement[] {
  const id = `mcp-group-${group.state}-${next()}`;
  const hintId = one.hint ? `${id}-hint` : null;
  const elements: HTMLElement[] = one.hint ? [hint(one.hint, `${id}-hint`)] : [];
  const lines = shown(one, folded).map((server) =>
    line(server, `mcp-server-${next()}`, hintId, actions),
  );
  if (lines.length === 0) return elements;
  const list = document.createElement("ul");
  list.className = "mcp-servers";
  list.setAttribute("aria-label", group.title);
  list.append(...lines);
  return [...elements, list];
}

/** Le bouton qui déplie ou replie les serveurs « À connecter » non cochés. */
function foldButton(hidden: number, folded: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool mcp-fold";
  button.textContent = folded ? unfoldText(hidden) : FOLD_TEXT;
  button.setAttribute("aria-expanded", String(!folded));
  button.addEventListener("click", onClick);
  return button;
}

/** Un groupe : son titre et son nombre, ses blocs, et le bouton de repli si le groupe en a un. */
function section(
  group: ServerGroup,
  unfolded: boolean,
  next: () => number,
  actions: McpServersActions,
  fold: () => void,
): HTMLElement {
  const folded = group.foldable && !unfolded;
  const title = document.createElement("h3");
  title.className = "mcp-group-title";
  const count = document.createElement("span");
  count.className = "mcp-group-count";
  count.textContent = String(group.count);
  title.append(group.title, count);
  const part = document.createElement("section");
  part.className = `mcp-group mcp-group-${group.state}`;
  part.append(title, ...group.blocks.flatMap((one) => block(group, one, folded, next, actions)));
  const hidden = group.blocks.reduce(
    (total, one) => total + one.servers.length - shown(one, folded).length,
    0,
  );
  if (group.foldable && (!folded || hidden > 0)) part.append(foldButton(hidden, folded, fold));
  return part;
}

/** La partie « Serveurs MCP » de l'écran de réglages. */
export function mcpServersGroup(actions: McpServersActions): McpServersSetting {
  const legend = document.createElement("legend");
  legend.textContent = TITLE;
  const intro = document.createElement("p");
  intro.className = "setting-help mcp-intro";
  intro.textContent = INTRO;
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "tool mcp-refresh";
  refresh.textContent = REFRESH;
  refresh.addEventListener("click", actions.refresh);
  const status = document.createElement("p");
  status.className = "mcp-status";
  status.setAttribute("role", "status");
  const toolbar = document.createElement("div");
  toolbar.className = "mcp-toolbar";
  toolbar.append(status, refresh);
  const list = document.createElement("div");
  list.className = "mcp-list";
  const element = document.createElement("fieldset");
  element.className = "mcp-servers-group";
  element.append(legend, intro, toolbar, list);

  let unfolded = false;
  let current: McpServersState = { kind: "loading" };
  const render = (refocus: boolean) => {
    const state = current;
    refresh.disabled = state.kind === "loading";
    status.classList.toggle("setting-error", state.kind === "unavailable");
    list.hidden = state.kind !== "listed" || state.servers.length === 0;
    if (state.kind === "loading") status.textContent = LOADING;
    else if (state.kind === "unavailable") status.textContent = state.message;
    else if (state.servers.length === 0) status.textContent = EMPTY;
    else status.textContent = countText(state.servers);
    const servers = state.kind === "listed" ? state.servers : [];
    let index = 0;
    const next = () => index++;
    const fold = () => {
      unfolded = !unfolded;
      render(true);
    };
    list.replaceChildren(
      ...groupServers(servers).map((group) => section(group, unfolded, next, actions, fold)),
    );
    if (refocus) list.querySelector<HTMLElement>(".mcp-fold")?.focus();
  };
  const show = (state: McpServersState) => {
    current = state;
    render(false);
  };
  show({ kind: "loading" });
  return { element, show };
}
