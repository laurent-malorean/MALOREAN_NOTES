// « Brancher une IA » côté application (fiche 0056) : lit la clé de branchement que Rust garde, la
// crée, la copie et la révoque après confirmation, puis relit son état.
import type * as Bridge from "../bridge";
import {
  type ConnectionHandlers,
  connectionSettingsGroup,
  renderConnectionSettings,
} from "../screens/connection-settings";
import { askConfirmation, type ConfirmationOptions } from "../screens/confirmation";
import type { Messages } from "./messages";

export const REVOCATION: ConfirmationOptions = {
  question:
    "Révoquer la clé de branchement ? Les IA branchées sont coupées tout de suite ; une nouvelle clé n'aura rien à voir avec celle-ci.",
  confirm: "Révoquer la clé",
};

export interface ConnectAiDeps extends Pick<Messages, "run"> {
  readonly backend: Pick<
    typeof Bridge,
    "connectionInfo" | "createConnectionKey" | "revokeConnectionKey" | "copyPlainText"
  >;
  /** La fenêtre de confirmation, où l'on demande si l'on révoque la clé. */
  readonly dialog: HTMLDialogElement;
}

export interface ConnectAi {
  /** La partie « Brancher une IA » de l'écran de réglages, dessinée aussitôt puis remplie. */
  settingsGroups(): HTMLElement[];
}

export function createConnectAi(deps: ConnectAiDeps): ConnectAi {
  const { backend } = deps;
  const settingsGroups = () => {
    const frame = connectionSettingsGroup();
    let info: Bridge.ConnectionInfo | null = null;
    const draw = (next: Bridge.ConnectionInfo | null) => {
      info = next;
      renderConnectionSettings(frame, info, handlers);
    };
    const handlers: ConnectionHandlers = {
      create: () => deps.run(backend.createConnectionKey().then(draw)),
      revoke: () =>
        deps.run(
          askConfirmation(deps.dialog, REVOCATION).then((accepted) =>
            accepted ? backend.revokeConnectionKey().then(backend.connectionInfo).then(draw) : null,
          ),
        ),
      copy: (what) => {
        const key = info?.key;
        if (!key) return Promise.resolve(false);
        const text = { key: key.secret, claude: key.claudeConfig, codex: key.codexConfig }[what];
        // Le bouton dit « Copié » : plus de message passager. Un échec, lui, est dit comme les autres.
        const copied = backend.copyPlainText(text);
        deps.run(copied);
        return copied.then(
          () => true,
          () => false,
        );
      },
    };
    draw(null);
    deps.run(backend.connectionInfo().then(draw));
    return [frame];
  };
  return { settingsGroups };
}
