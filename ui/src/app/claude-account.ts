// Compte Claude de la colonne Claude Code : montre avec quel compte Claude Code est connecté, et
// s'en déconnecte, s'y connecte ou change de compte depuis la colonne ; la connexion attend le
// navigateur, son adresse arrive à part, « Annuler » l'arrête. Ensuite, la connexion est revérifiée
// (fiche 0032).
import type * as Bridge from "../bridge";
import { createAccountView } from "../screens/claude-account-view";
import {
  ACCOUNT_IDLE,
  type AccountActivity,
  accountFinished,
  loginStarted,
  logoutStarted,
  signInAddressReceived,
} from "../state/claude-account";

/** Ce que la colonne dit pendant une connexion ou une déconnexion : on ne peut pas écrire à Claude. */
export const SIGNING_IN = "Changement du compte Claude en cours…";

export interface AccountDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "logOutOfClaude"
    | "logInToClaude"
    | "stopClaude"
    | "onClaudeSignIn"
    | "copyPlainText"
    | "errorMessage"
  >;
  /** Montre dans la colonne pourquoi on ne peut pas écrire à Claude. */
  busy(reason: string): void;
  /** Revérifie la connexion de Claude Code, une fois la connexion ou la déconnexion finie. */
  refresh(): void;
  /** Claude Code a changé de compte (ou n'en a plus) : la conversation est oubliée. */
  changed(): void;
  error(error: unknown): void;
}

export interface Account {
  /** Montre le compte que donne la vérification de la connexion ; `null` : en cours. */
  showStatus(status: Bridge.ClaudeStatusItem | null): void;
  /** Suit le tour en cours : rien n'est possible pendant que Claude répond. */
  turnRunning(running: boolean): void;
}

export function createAccount(container: HTMLDetailsElement, deps: AccountDeps): Account {
  const { backend } = deps;
  let status: Bridge.ClaudeStatusItem | null = null;
  let activity: AccountActivity = ACCOUNT_IDLE;
  let running = false;
  let cancelled = false;
  const redraw = () => show(status, activity, running);
  const begin = (next: AccountActivity) => {
    activity = next;
    redraw();
    deps.busy(SIGNING_IN);
  };
  const finish = (error: string | null) => {
    if (error === null) deps.changed();
    activity = accountFinished(activity, error, cancelled);
    redraw();
    deps.refresh();
  };
  const attempt = (call: () => Promise<null>) =>
    call().then(
      () => null,
      (error: unknown) => backend.errorMessage(error),
    );
  const logIn = async (changing: boolean) => {
    cancelled = false;
    begin(loginStarted(changing));
    finish(await attempt(backend.logInToClaude));
  };
  const logOut = async (thenLogIn: boolean) => {
    begin(logoutStarted());
    const error = await attempt(backend.logOutOfClaude);
    if (error !== null || !thenLogIn) return finish(error);
    deps.changed();
    await logIn(true);
  };
  const show = createAccountView(container, {
    changeAccount: () => void logOut(true),
    logOut: () => void logOut(false),
    logIn: () => void logIn(false),
    cancelLogin: () => {
      cancelled = true;
      backend.stopClaude().catch(deps.error);
    },
    copyAddress: (address) => void backend.copyPlainText(address).catch(deps.error),
  });
  void backend.onClaudeSignIn((address) => {
    activity = signInAddressReceived(activity, address);
    redraw();
  });
  redraw();
  return {
    showStatus: (next) => ((status = next), redraw()),
    turnRunning: (next) => ((running = next), redraw()),
  };
}
