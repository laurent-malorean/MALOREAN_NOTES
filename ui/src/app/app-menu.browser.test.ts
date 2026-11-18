import { describe, expect, it } from "vitest";
import { settle } from "../../test-support/app-fixture";
import type { AppMenu } from "../bridge";
import { menuBar, NOTE_COMMANDS } from "../state/app-menu";
import { columnsStarted, noteOpened } from "../state/columns";
import type { MenuCommandId } from "../state/commands";
import { connectAppMenu } from "./app-menu";

interface Options {
  failInstall?: boolean;
  failListen?: boolean;
  failEnable?: boolean;
}

function setup(options: Options = {}) {
  const log: string[] = [];
  let choose: (id: string) => void = () => {};
  let installed: AppMenu[] = [];
  let finishInstall: () => void = () => {};
  const actions = new Proxy({} as Record<MenuCommandId, () => void>, {
    get: (_, id: string) => () => log.push(`lancer ${id}`),
  });
  const menu = connectAppMenu({
    backend: {
      installMenu: (menus) =>
        new Promise((resolve, reject) => {
          installed = menus;
          log.push("construire");
          finishInstall = () =>
            options.failInstall ? reject(new Error("pas de menu")) : resolve(null);
        }),
      enableMenuItems: async (ids, enabled) => {
        if (options.failEnable) throw new Error("pas grisé");
        log.push(`${enabled ? "activer" : "griser"} ${ids.join(",")}`);
        return null;
      },
      onMenuCommand: async (handler) => {
        if (options.failListen) throw new Error("sourde");
        choose = handler;
        return () => {};
      },
    },
    actions,
    error: (error) => log.push(`erreur ${(error as Error).message}`),
  });
  return {
    log,
    menu,
    choose: (id: string) => choose(id),
    installed: () => installed,
    finishInstall: () => finishInstall(),
  };
}

const withNote = noteOpened(columnsStarted, "a.md");

describe("barre des menus", () => {
  it("se construit dès le départ, les commandes d'une note grisées", () => {
    const { log, installed } = setup();
    expect(log).toEqual(["construire"]);
    expect(installed()).toEqual(menuBar(false));
  });

  it("rend actives les commandes d'une note quand une note est montrée, une fois la barre construite", async () => {
    const { log, menu, finishInstall } = setup();
    menu.follow(withNote);
    await settle();
    expect(log).toEqual(["construire"]);
    finishInstall();
    await settle();
    expect(log).toEqual(["construire", `activer ${[...NOTE_COMMANDS].join(",")}`]);
  });

  it("ne demande rien tant que l'état ne change pas, grise de nouveau quand la note disparaît", async () => {
    const { log, menu, finishInstall } = setup();
    finishInstall();
    menu.follow(columnsStarted);
    menu.follow(withNote);
    menu.follow(withNote);
    menu.follow(columnsStarted);
    await settle();
    const ids = [...NOTE_COMMANDS].join(",");
    expect(log).toEqual(["construire", `activer ${ids}`, `griser ${ids}`]);
  });

  it("lance la commande de l'élément choisi, et rien pour un identifiant inconnu", () => {
    const { log, choose } = setup();
    choose("close-tab");
    choose("command-palette");
    choose("inconnu");
    expect(log).toEqual(["construire", "lancer close-tab", "lancer command-palette"]);
  });

  it("ne lance rien tant qu'une fenêtre de la page est ouverte", async () => {
    const { log, choose } = setup();
    await settle();
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    dialog.showModal();
    choose("close-tab");
    dialog.close();
    dialog.remove();
    expect(log).toEqual(["construire"]);
  });

  it("signale une barre qui n'a pas pu être construite, et continue de suivre les notes", async () => {
    const { log, menu, finishInstall } = setup({ failInstall: true });
    finishInstall();
    menu.follow(withNote);
    await settle();
    expect(log).toEqual([
      "construire",
      "erreur pas de menu",
      `activer ${[...NOTE_COMMANDS].join(",")}`,
    ]);
  });

  it("signale l'écoute des menus refusée, et un élément qui n'a pas pu être grisé", async () => {
    const { log, menu, finishInstall } = setup({ failListen: true, failEnable: true });
    finishInstall();
    menu.follow(withNote);
    await settle();
    expect(log).toEqual(["construire", "erreur sourde", "erreur pas grisé"]);
  });
});
