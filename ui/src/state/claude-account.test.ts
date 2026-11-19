import { describe, expect, it } from "vitest";
import {
  ACCOUNT_IDLE,
  accountActions,
  accountFinished,
  accountHeadline,
  accountProgress,
  loginStarted,
  logoutStarted,
  signInAddressReceived,
} from "./claude-account";

const ready = { kind: "ready", email: "moi@example.com", organization: "Moi" } as const;
const unavailable = { kind: "unavailable", reason: "pas connecté" } as const;

describe("compte Claude", () => {
  it("le titre dit avec quel compte Claude Code est connecté, ou qu'il ne l'est pas", () => {
    expect(accountHeadline(null)).toBe("Compte Claude · vérification…");
    expect(accountHeadline(ready)).toBe("Compte Claude · moi@example.com · Moi");
    expect(accountHeadline({ kind: "ready", email: "moi@example.com", organization: null })).toBe(
      "Compte Claude · moi@example.com",
    );
    expect(accountHeadline({ kind: "ready", email: null, organization: null })).toBe(
      "Compte Claude · connecté",
    );
    expect(accountHeadline(unavailable)).toBe("Compte Claude · non connecté");
  });

  it("connecté, on peut changer de compte ou se déconnecter ; sinon, se connecter", () => {
    expect(accountActions(ready, ACCOUNT_IDLE, false)).toEqual({
      change: true,
      logOut: true,
      logIn: false,
      enabled: true,
    });
    expect(accountActions(unavailable, ACCOUNT_IDLE, false)).toEqual({
      change: false,
      logOut: false,
      logIn: true,
      enabled: true,
    });
    expect(accountActions(null, ACCOUNT_IDLE, false).enabled).toBe(false);
  });

  it("rien n'est possible pendant un tour, ni pendant une connexion ou une déconnexion", () => {
    expect(accountActions(ready, ACCOUNT_IDLE, true).enabled).toBe(false);
    expect(accountActions(ready, logoutStarted(), false).enabled).toBe(false);
    expect(accountActions(unavailable, loginStarted(false), false).enabled).toBe(false);
  });

  it("une connexion attend le navigateur, puis montre l'adresse de connexion", () => {
    const started = loginStarted(true);
    expect(started).toEqual({ kind: "loggingIn", address: null, changing: true, outcome: null });
    expect(signInAddressReceived(started, "https://claude.ai/x")).toEqual({
      ...started,
      address: "https://claude.ai/x",
    });
    expect(signInAddressReceived(ACCOUNT_IDLE, "https://claude.ai/x")).toBe(ACCOUNT_IDLE);
  });

  it("la fin dit ce qui s'est passé, en rappelant le Terminal et VS Code", () => {
    expect(accountFinished(loginStarted(false), null, false).outcome).toBe(
      "Connecté : Claude Code utilise ce compte, aussi dans le Terminal et VS Code.",
    );
    expect(accountFinished(logoutStarted(), null, false).outcome).toBe(
      "Déconnecté : Claude Code n'a plus de compte, aussi dans le Terminal et VS Code.",
    );
    expect(accountFinished(loginStarted(true), "refusé", true).outcome).toBe("Connexion annulée.");
    expect(accountFinished(loginStarted(true), "la connexion n'a pas abouti", false)).toEqual({
      kind: "idle",
      outcome: "La connexion n'a pas abouti",
    });
  });

  it("la progression dit quoi faire pendant la connexion, puis comment elle s'est finie", () => {
    expect(accountProgress(ACCOUNT_IDLE)).toBeNull();
    expect(accountProgress(logoutStarted())).toBe("Déconnexion de Claude Code…");
    expect(accountProgress(loginStarted(false))).toBe(
      "Connexion : terminez-la dans le navigateur qui vient de s'ouvrir…",
    );
    expect(accountProgress(loginStarted(true))).toBe(
      "Changement de compte : connectez-vous au nouveau compte dans le navigateur qui vient de s'ouvrir…",
    );
    expect(accountProgress(accountFinished(logoutStarted(), "oups", false))).toBe("Oups");
  });
});
