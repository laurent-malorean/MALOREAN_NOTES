import { beforeEach, describe, expect, it } from "vitest";
import type { ClaudeStatusItem } from "../bridge";
import { DURING_TURN } from "../screens/claude-account-view";
import { EVERYWHERE } from "../state/claude-account";
import { type Account, createAccount, SIGNING_IN } from "./claude-account";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const READY: ClaudeStatusItem = { kind: "ready", email: "moi@example.com", organization: "Moi" };
const LOGGED_OUT: ClaudeStatusItem = { kind: "unavailable", reason: "pas connecté" };
const ADDRESS = "https://claude.ai/oauth/authorize?faux=1";

let container: HTMLDetailsElement;
let account: Account;
let log: string[];
let login: { resolve: () => void; reject: (error: unknown) => void };
let logout: Promise<null>;
let signIn: (address: string) => void;
let copy: Promise<null>;
let stop: Promise<null>;

function create() {
  return createAccount(container, {
    backend: {
      logOutOfClaude: () => (log.push("déconnecter"), logout),
      logInToClaude: () =>
        new Promise((resolve, reject) => {
          log.push("connecter");
          login = { resolve: () => resolve(null), reject };
        }),
      stopClaude: () => (log.push("arrêter"), stop),
      onClaudeSignIn: async (handler) => ((signIn = handler), () => {}),
      copyPlainText: (text) => (log.push(`copier ${text}`), copy),
      errorMessage: (error) => String((error as { message: string }).message),
    },
    busy: (reason) => log.push(`occupé ${reason}`),
    refresh: () => log.push("vérifier"),
    changed: () => log.push("oublier"),
    error: (error) => log.push(`erreur ${String(error)}`),
  });
}

const find = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
const button = (selector: string) => find<HTMLButtonElement>(selector);
const progress = () => find(".claude-account-progress");
const visibleButtons = () =>
  [...container.querySelectorAll<HTMLButtonElement>(".claude-account-actions button")]
    .filter((shown) => !shown.hidden)
    .map((shown) => shown.textContent);

beforeEach(() => {
  container = document.createElement("details");
  document.body.replaceChildren(container);
  log = [];
  logout = Promise.resolve(null);
  copy = Promise.resolve(null);
  stop = Promise.resolve(null);
  account = create();
});

describe("compte Claude : ce qui est montré", () => {
  it("replié au départ, il attend la vérification de la connexion, sans action possible", () => {
    expect(container.open).toBe(false);
    expect(find(".claude-account-summary").textContent).toBe("Compte Claude · vérification…");
    expect(button("[data-log-in]").disabled).toBe(true);
    expect(progress().hidden).toBe(true);
    expect(progress().textContent).toBe("");
    expect(find(".claude-account-link").textContent).toBe("");
    expect(find(".claude-account-address").hidden).toBe(true);
    expect(button("[data-cancel-login]").hidden).toBe(true);
    expect(find(".claude-account-note").textContent).toBe(EVERYWHERE);
    expect(EVERYWHERE).toContain("Terminal et VS Code");
  });

  it("connecté : le compte, « Changer de compte » et « Se déconnecter »", () => {
    account.showStatus(READY);
    expect(find(".claude-account-summary").textContent).toBe(
      "Compte Claude · moi@example.com · Moi",
    );
    expect(visibleButtons()).toEqual(["Changer de compte", "Se déconnecter"]);
    expect(button("[data-change-account]").disabled).toBe(false);
  });

  it("pas connecté : « Se connecter »", () => {
    account.showStatus(LOGGED_OUT);
    expect(visibleButtons()).toEqual(["Se connecter"]);
    expect(button("[data-log-in]").disabled).toBe(false);
  });

  it("pendant un tour, les actions sont grisées et disent pourquoi", () => {
    account.showStatus(READY);
    account.turnRunning(true);
    expect(button("[data-log-out]").disabled).toBe(true);
    expect(container.title).toBe(DURING_TURN);
    expect(DURING_TURN).toBe("Impossible pendant que Claude répond");
    account.turnRunning(false);
    expect(button("[data-log-out]").disabled).toBe(false);
    expect(container.title).toBe("");
  });
});

describe("compte Claude : se connecter, se déconnecter, changer de compte", () => {
  it("se connecter attend le navigateur, montre l'adresse, puis dit que c'est fait", async () => {
    account.showStatus(LOGGED_OUT);
    button("[data-log-in]").click();
    expect(container.open).toBe(true);
    expect(log).toEqual([`occupé ${SIGNING_IN}`, "connecter"]);
    expect(progress().hidden).toBe(false);
    expect(progress().textContent).toBe(
      "Connexion : terminez-la dans le navigateur qui vient de s'ouvrir…",
    );
    expect(button("[data-log-in]").disabled).toBe(true);
    expect(button("[data-cancel-login]").hidden).toBe(false);
    expect(find(".claude-account-address").hidden).toBe(true);
    signIn(ADDRESS);
    expect(find(".claude-account-address").hidden).toBe(false);
    expect(find(".claude-account-link").textContent).toBe(ADDRESS);
    button("[data-copy-address]").click();
    login.resolve();
    await settle();
    expect(log.slice(2)).toEqual([`copier ${ADDRESS}`, "oublier", "vérifier"]);
    expect(progress().textContent).toBe(
      "Connecté : Claude Code utilise ce compte, aussi dans le Terminal et VS Code.",
    );
    expect(button("[data-cancel-login]").hidden).toBe(true);
    expect(find(".claude-account-address").hidden).toBe(true);
  });

  it("« Annuler la connexion » l'arrête et le dit", async () => {
    account.showStatus(LOGGED_OUT);
    button("[data-log-in]").click();
    button("[data-cancel-login]").click();
    login.reject({ message: "la réponse de Claude a été arrêtée" });
    await settle();
    expect(log).toEqual([`occupé ${SIGNING_IN}`, "connecter", "arrêter", "vérifier"]);
    expect(progress().textContent).toBe("Connexion annulée.");
  });

  it("une connexion qui n'aboutit pas dit quoi faire, et une autre peut la suivre", async () => {
    account.showStatus(LOGGED_OUT);
    button("[data-log-in]").click();
    login.reject({ message: "la connexion n'a pas abouti" });
    await settle();
    expect(progress().textContent).toBe("La connexion n'a pas abouti");
    expect(log).not.toContain("oublier");
    button("[data-log-in]").click();
    expect(progress().textContent).toBe(
      "Connexion : terminez-la dans le navigateur qui vient de s'ouvrir…",
    );
  });

  it("se déconnecter le dit, en rappelant le Terminal et VS Code", async () => {
    account.showStatus(READY);
    button("[data-log-out]").click();
    expect(progress().textContent).toBe("Déconnexion de Claude Code…");
    await settle();
    expect(log).toEqual([`occupé ${SIGNING_IN}`, "déconnecter", "oublier", "vérifier"]);
    expect(progress().textContent).toBe(
      "Déconnecté : Claude Code n'a plus de compte, aussi dans le Terminal et VS Code.",
    );
  });

  it("changer de compte déconnecte, puis connecte au nouveau compte", async () => {
    account.showStatus(READY);
    button("[data-change-account]").click();
    await settle();
    expect(log).toEqual([
      `occupé ${SIGNING_IN}`,
      "déconnecter",
      "oublier",
      `occupé ${SIGNING_IN}`,
      "connecter",
    ]);
    expect(progress().textContent).toBe(
      "Changement de compte : connectez-vous au nouveau compte dans le navigateur qui vient de s'ouvrir…",
    );
    login.resolve();
    await settle();
    expect(log.slice(5)).toEqual(["oublier", "vérifier"]);
  });

  it("une déconnexion en échec arrête le changement de compte et le dit", async () => {
    logout = Promise.reject({ message: "la déconnexion n'a pas abouti" });
    account.showStatus(READY);
    button("[data-change-account]").click();
    await settle();
    expect(log).toEqual([`occupé ${SIGNING_IN}`, "déconnecter", "vérifier"]);
    expect(progress().textContent).toBe("La déconnexion n'a pas abouti");
  });

  it("une adresse hors d'une connexion ne change rien ; une copie ou un arrêt en échec est signalé", async () => {
    account.showStatus(READY);
    signIn(ADDRESS);
    expect(find(".claude-account-address").hidden).toBe(true);
    copy = Promise.reject(new Error("presse-papiers perdu"));
    stop = Promise.reject(new Error("fil perdu"));
    button("[data-copy-address]").click();
    button("[data-cancel-login]").click();
    await settle();
    expect(log).toContain("copier ");
    expect(log).toContain("erreur Error: presse-papiers perdu");
    expect(log).toContain("erreur Error: fil perdu");
  });
});
