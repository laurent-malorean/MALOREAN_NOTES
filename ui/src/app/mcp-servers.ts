// Serveurs MCP extérieurs de la colonne Claude Code (fiche 0105) : la rubrique « Serveurs MCP » de l'onglet « Claude »
// des réglages. La liste est lue à l'ouverture de l'onglet (la lecture dure une dizaine de secondes, le reste des réglages
// reste utilisable) et par « Actualiser » ; cocher ou décocher vaut dès le message suivant, sans relire la liste. Les règles
// (liste, tri, serveur introuvable, ce que Claude reçoit) sont celles du moteur.
import type * as Bridge from "../bridge";
import { mcpServersGroup } from "../screens/mcp-servers-setting";
import { type McpServersState, withAllowed } from "../state/mcp-servers";
import { TAB_SHOWN } from "../state/settings-tabs";

export interface McpServersDeps {
  readonly backend: Pick<typeof Bridge, "listMcpServers" | "allowMcpServer" | "disallowMcpServer">;
  /** Montre l'erreur du moteur, telle qu'il la dit. */
  readonly error: (error: unknown) => void;
}

export interface McpServers {
  /** La rubrique « Serveurs MCP », à chaque ouverture des réglages. */
  settingsGroups(): HTMLElement[];
}

/** Une rubrique ouverte : son état, et ses gestes. « Actualiser » est grisé pendant une lecture : il n'y en a jamais deux. */
class McpServersGroup {
  private state: McpServersState = { kind: "loading" };
  private started = false;
  private readonly setting = mcpServersGroup({
    toggle: (name, allowed) => void this.toggle(name, allowed),
    refresh: () => void this.read(),
  });

  constructor(private readonly deps: McpServersDeps) {
    // La liste est lue la première fois que l'onglet qui porte la rubrique est montré, pas à l'ouverture des réglages.
    this.setting.element.addEventListener(TAB_SHOWN, () => {
      if (this.started) return;
      this.started = true;
      void this.read();
    });
  }

  get element(): HTMLElement {
    return this.setting.element;
  }

  private show(state: McpServersState): void {
    this.state = state;
    this.setting.show(state);
  }

  private async read(): Promise<void> {
    this.show({ kind: "loading" });
    let next: McpServersState;
    try {
      const listing = await this.deps.backend.listMcpServers();
      next =
        listing.kind === "listed" ? listing : { kind: "unavailable", message: listing.message };
    } catch (error) {
      next = { kind: "unavailable", message: this.messageOf(error) };
    }
    this.show(next);
  }

  private messageOf(error: unknown): string {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === "string" ? message : String(error);
  }

  /** Coche ou décoche : la ligne change aussitôt ; si le moteur refuse, elle revient comme elle était et l'erreur est montrée. */
  private async toggle(name: string, allowed: boolean): Promise<void> {
    const before = this.state;
    if (before.kind !== "listed") return;
    this.show({ kind: "listed", servers: withAllowed(before.servers, name, allowed) });
    const { backend } = this.deps;
    try {
      await (allowed ? backend.allowMcpServer(name) : backend.disallowMcpServer(name));
    } catch (error) {
      this.show(before);
      this.deps.error(error);
    }
  }
}

/** Branche la rubrique « Serveurs MCP ». */
export function createMcpServers(deps: McpServersDeps): McpServers {
  return { settingsGroups: () => [new McpServersGroup(deps).element] };
}
