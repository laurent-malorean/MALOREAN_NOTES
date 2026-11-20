// Compte Claude de la colonne Claude Code : avec quel compte Claude Code est connecté, et où en est
// une connexion ou une déconnexion lancée depuis la colonne (fiche 0032). Le compte n'est gardé
// qu'à l'écran : jamais écrit dans le stockage de l'interface.
import type { ClaudeStatusItem } from "../bridge";

/** Ce que fait le compte Claude : rien (avec le message de la dernière fin), se déconnecter, se connecter. */
export type AccountActivity =
  | { readonly kind: "idle"; readonly outcome: string | null }
  | { readonly kind: "loggingOut"; readonly outcome: null }
  | {
      readonly kind: "loggingIn";
      /** L'adresse de la page de connexion, dès que Claude Code la donne. */
      readonly address: string | null;
      /** Vrai si la connexion suit une déconnexion : changer de compte. */
      readonly changing: boolean;
      readonly outcome: null;
    };

export const ACCOUNT_IDLE: AccountActivity = { kind: "idle", outcome: null };

/** Ce que le compte vaut aussi hors de l'application, rappelé sous ses boutons. */
export const EVERYWHERE =
  "Le compte vaut pour tout le Mac : le changer ici le change aussi pour Claude Code dans le Terminal et VS Code.";

const SIGNED_IN = "Connecté : Claude Code utilise ce compte, aussi dans le Terminal et VS Code.";
const SIGNED_OUT =
  "Déconnecté : Claude Code n'a plus de compte, aussi dans le Terminal et VS Code.";
const CANCELLED = "Connexion annulée.";

/** Le titre du compte : avec quel compte Claude Code est connecté (`null` : en cours de vérification). */
export function accountHeadline(status: ClaudeStatusItem | null): string {
  if (status === null) return "Compte Claude · vérification…";
  if (status.kind === "unavailable") return "Compte Claude · non connecté";
  const parts = [status.email, status.organization].filter((part) => part !== null);
  return `Compte Claude · ${parts.length === 0 ? "connecté" : parts.join(" · ")}`;
}

/** Les actions proposées, et si elles sont possibles : ni pendant un tour, ni pendant une autre. */
export function accountActions(
  status: ClaudeStatusItem | null,
  activity: AccountActivity,
  turnRunning: boolean,
) {
  const loggedIn = status?.kind === "ready";
  return {
    change: loggedIn,
    logOut: loggedIn,
    logIn: !loggedIn,
    enabled: status !== null && activity.kind === "idle" && !turnRunning,
  };
}

export const logoutStarted = (): AccountActivity => ({ kind: "loggingOut", outcome: null });

export const loginStarted = (changing: boolean): AccountActivity => ({
  kind: "loggingIn",
  address: null,
  changing,
  outcome: null,
});

/** L'adresse de la page de connexion est arrivée ; hors d'une connexion, elle ne change rien. */
export const signInAddressReceived = (
  activity: AccountActivity,
  address: string,
): AccountActivity => (activity.kind === "loggingIn" ? { ...activity, address } : activity);

/** La connexion ou la déconnexion est finie : réussie (`error` nul), annulée, ou en erreur. */
export function accountFinished(
  activity: AccountActivity,
  error: string | null,
  cancelled: boolean,
): AccountActivity {
  if (cancelled) return { kind: "idle", outcome: CANCELLED };
  if (error !== null) {
    return { kind: "idle", outcome: error.charAt(0).toUpperCase() + error.slice(1) };
  }
  return { kind: "idle", outcome: activity.kind === "loggingOut" ? SIGNED_OUT : SIGNED_IN };
}

/** Où en est la connexion ou la déconnexion, ou comment s'est finie la dernière ; rien sinon. */
export function accountProgress(activity: AccountActivity): string | null {
  switch (activity.kind) {
    case "loggingOut":
      return "Déconnexion de Claude Code…";
    case "loggingIn":
      return activity.changing
        ? "Changement de compte : connectez-vous au nouveau compte dans le navigateur qui vient de s'ouvrir…"
        : "Connexion : terminez-la dans le navigateur qui vient de s'ouvrir…";
    case "idle":
      return activity.outcome;
  }
}
