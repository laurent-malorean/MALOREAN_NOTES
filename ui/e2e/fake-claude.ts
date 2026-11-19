// Claude Code simulé pour les parcours : connecté par défaut ; `claude=missing`, `claude=loggedOut`
// ou `claude=failed` dans l'adresse donne la vérification de la connexion correspondante, avec le
// message de Rust.
import type { ClaudeStatusItem } from "../src/bridge";

type Handler = (args: Record<string, unknown>) => unknown;

/** La partie de la doublure qui tient Claude Code. */
export interface FakeClaude {
  /** Ce que la vérification de la connexion répond. */
  claude: ClaudeStatusItem;
}

/** Les messages de Rust, par vérification de la connexion qui empêche Claude Code de répondre. */
export const CLAUDE_UNAVAILABLE: Record<string, string> = {
  missing:
    "Claude Code n'est pas installé sur ce Mac : installez-le, tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code",
  loggedOut:
    "Claude Code n'est pas connecté à votre abonnement Claude : tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code",
  failed:
    "Claude Code n'a pas pu dire s'il est connecté : tapez « claude auth status » dans le Terminal pour voir ce qui ne va pas",
};

export function fakeClaudeState(params: URLSearchParams): FakeClaude {
  const reason = CLAUDE_UNAVAILABLE[params.get("claude") ?? ""];
  return { claude: reason === undefined ? { kind: "ready" } : { kind: "unavailable", reason } };
}

export function fakeClaude(state: FakeClaude): Record<string, Handler> {
  return {
    claude_status: () => state.claude,
  };
}
