// La partie « Brancher une IA » de l'écran de réglages (fiche 0056) : sans clé de branchement, une
// phrase et un bouton pour en créer une ; avec une clé, sa date, la clé et deux blocs de
// configuration à copier (Claude, Codex), et « Révoquer la clé ». Tout se fait à la souris.
import type { ConnectionInfo, ConnectionKeyItem } from "../bridge";

export const CONNECTION_TITLE = "Brancher une IA";
export const CONNECTION_LOADING = "Lecture de la clé de branchement…";
export const CONNECTION_PURPOSE =
  "Donne les outils de MALOREAN Notes à une IA extérieure, comme l'extension Claude de VS Code ou Codex. Aucun port réseau n'est ouvert : l'IA n'est écoutée que tant que l'application est lancée.";

/** Ce que l'on copie : la clé, ou l'un des deux blocs de configuration. */
export type Copyable = "key" | "claude" | "codex";

export interface ConnectionHandlers {
  create(): void;
  revoke(): void;
  /** Copie ; rend vrai si c'est fait (le bouton le confirme), faux sinon (l'erreur est dite ailleurs). */
  copy(what: Copyable): Promise<boolean>;
}

/** Combien de temps le bouton « Copier » dit « Copié » avant de redevenir « Copier ». */
export const COPIED_FOR_MS = 2000;
const COPY = "Copier";
const COPIED = "✓ Copié";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

function button(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const created = element("button", "tool", text);
  created.type = "button";
  created.setAttribute("aria-label", label);
  created.addEventListener("click", onClick);
  return created;
}

/** Le bouton « Copier » d'un texte : après la copie il passe au vert, « ✓ Copié », puis redevient « Copier ». */
function copyButton(title: string, copy: () => Promise<boolean>): HTMLButtonElement {
  const created = button(COPY, `${COPY} : ${title}`, () => {
    void copy().then((copied) => {
      if (!copied) return;
      show(true);
      setTimeout(() => show(false), COPIED_FOR_MS);
    });
  });
  // Lu à voix haute quand le bouton change de nom.
  created.setAttribute("aria-live", "polite");
  const show = (done: boolean) => {
    created.textContent = done ? COPIED : COPY;
    created.setAttribute("aria-label", `${done ? "Copié" : COPY} : ${title}`);
    created.classList.toggle("copied", done);
  };
  return created;
}

/** Un texte à copier, sous son titre, avec son bouton « Copier ». */
function copyable(
  title: string,
  text: string,
  tag: "code" | "pre",
  copy: () => Promise<boolean>,
): HTMLElement {
  const block = element("div", "connection-copyable", "");
  const body = element(tag, "connection-text", text);
  body.setAttribute("aria-label", title);
  block.append(element("p", "setting-help", title), body, copyButton(title, copy));
  return block;
}

function withKey(key: ConnectionKeyItem, handlers: ConnectionHandlers): HTMLElement[] {
  return [
    element("p", "setting-help", `Clé de branchement créée le ${key.createdOn}.`),
    copyable("Clé de branchement", key.secret, "code", () => handlers.copy("key")),
    copyable(
      "Configuration pour Claude (extension VS Code, Claude Code hors de l'application)",
      key.claudeConfig,
      "pre",
      () => handlers.copy("claude"),
    ),
    copyable("Configuration pour Codex", key.codexConfig, "pre", () => handlers.copy("codex")),
    button("Révoquer la clé", "Révoquer la clé", handlers.revoke),
  ];
}

/** Le cadre vide de cette partie, que `renderConnectionSettings` remplit à chaque changement. */
export function connectionSettingsGroup(): HTMLElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "connection-settings";
  return fieldset;
}

/** Remplit `fieldset` ; `info` vaut `null` tant que l'état est lu. */
export function renderConnectionSettings(
  fieldset: HTMLElement,
  info: ConnectionInfo | null,
  handlers: ConnectionHandlers,
): void {
  const legend = document.createElement("legend");
  legend.textContent = CONNECTION_TITLE;
  const purpose = element("p", "setting-help", CONNECTION_PURPOSE);
  const body = !info
    ? [element("p", "setting-help", CONNECTION_LOADING)]
    : info.key
      ? withKey(info.key, handlers)
      : [button("Créer une clé de branchement", "Créer une clé de branchement", handlers.create)];
  fieldset.replaceChildren(legend, purpose, ...body);
}
