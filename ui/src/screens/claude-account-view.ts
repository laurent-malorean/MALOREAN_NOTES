// Compte Claude, en haut de la colonne Claude Code : un bloc repliable dont le titre dit avec quel
// compte Claude Code est connecté ; déplié, « Changer de compte » et « Se déconnecter », ou « Se
// connecter », la progression d'une connexion (adresse de connexion, « Annuler ») et le rappel que le
// compte vaut aussi pour le Terminal et VS Code. Tout se fait à la souris.
import type { ClaudeStatusItem } from "../bridge";
import {
  type AccountActivity,
  accountActions,
  accountHeadline,
  accountProgress,
  EVERYWHERE,
} from "../state/claude-account";

export interface AccountHandlers {
  changeAccount(): void;
  logOut(): void;
  logIn(): void;
  /** Annule la connexion qui attend le navigateur. */
  cancelLogin(): void;
  copyAddress(address: string): void;
}

/** Montre le compte, ce qu'on peut en faire et où en est la connexion ; `turnRunning` : Claude répond. */
export type ShowAccount = (
  status: ClaudeStatusItem | null,
  activity: AccountActivity,
  turnRunning: boolean,
) => void;

export const DURING_TURN = "Impossible pendant que Claude répond";

const TEMPLATE = `
  <summary class="claude-account-summary"></summary>
  <div class="claude-account-actions">
    <button type="button" class="tool" data-change-account title="Se déconnecter, puis se connecter à un autre compte Claude">Changer de compte</button>
    <button type="button" class="tool" data-log-out title="Déconnecter Claude Code de ce compte Claude">Se déconnecter</button>
    <button type="button" class="tool" data-log-in title="Connecter Claude Code à un compte Claude, dans le navigateur">Se connecter</button>
  </div>
  <p class="claude-account-progress" role="status" hidden></p>
  <p class="claude-account-address" hidden>
    Le navigateur ne s'est pas ouvert ? Ouvrez cette adresse :
    <span class="claude-account-link"></span>
    <button type="button" class="tool" data-copy-address>Copier le lien</button>
  </p>
  <button type="button" class="tool" data-cancel-login hidden>Annuler la connexion</button>
  <p class="claude-account-note">${EVERYWHERE}</p>`;

/** Remplit le bloc `container` du compte Claude et branche ses boutons. */
export function createAccountView(
  container: HTMLDetailsElement,
  handlers: AccountHandlers,
): ShowAccount {
  container.innerHTML = TEMPLATE;
  const find = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
  const summary = find<HTMLElement>(".claude-account-summary");
  const progress = find<HTMLElement>(".claude-account-progress");
  const addressLine = find<HTMLElement>(".claude-account-address");
  const link = find<HTMLElement>(".claude-account-link");
  const cancel = find<HTMLButtonElement>("[data-cancel-login]");
  const buttons = {
    change: find<HTMLButtonElement>("[data-change-account]"),
    logOut: find<HTMLButtonElement>("[data-log-out]"),
    logIn: find<HTMLButtonElement>("[data-log-in]"),
  };
  buttons.change.addEventListener("click", () => handlers.changeAccount());
  buttons.logOut.addEventListener("click", () => handlers.logOut());
  buttons.logIn.addEventListener("click", () => handlers.logIn());
  cancel.addEventListener("click", () => handlers.cancelLogin());
  // Donnée au premier affichage, que fait la colonne dès sa création.
  let shownAddress: string;
  find("[data-copy-address]").addEventListener("click", () => handlers.copyAddress(shownAddress));
  return (status, activity, turnRunning) => {
    summary.textContent = accountHeadline(status);
    const actions = accountActions(status, activity, turnRunning);
    for (const [name, button] of Object.entries(buttons)) {
      button.hidden = !actions[name as keyof typeof buttons];
      button.disabled = !actions.enabled;
    }
    container.title = turnRunning ? DURING_TURN : "";
    const text = accountProgress(activity);
    progress.hidden = text === null;
    progress.textContent = text ?? "";
    const address = activity.kind === "loggingIn" ? activity.address : null;
    addressLine.hidden = address === null;
    shownAddress = address ?? "";
    link.textContent = shownAddress;
    cancel.hidden = activity.kind !== "loggingIn";
    if (activity.kind !== "idle") container.open = true;
  };
}
