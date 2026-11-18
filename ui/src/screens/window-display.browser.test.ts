import { describe, expect, it, vi } from "vitest";
import { connectWindowDisplay, type WindowControl } from "./window-display";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

/** Une fenêtre simulée : son plein écran, et le changement de taille qu'elle annonce. */
function fakeWindow(options: { failSet?: boolean; failAsk?: boolean; failListen?: boolean } = {}) {
  const calls: boolean[] = [];
  let resized: () => void = () => undefined;
  const control: WindowControl & { fullScreen: boolean; resize: () => void } = {
    fullScreen: false,
    setFullScreen: async (on: boolean) => {
      if (options.failSet) throw new Error("refusé");
      control.fullScreen = on;
      calls.push(on);
    },
    isFullScreen: async () => {
      if (options.failAsk) throw new Error("illisible");
      return control.fullScreen;
    },
    onWindowResized: async (callback: () => void) => {
      if (options.failListen) throw new Error("sourde");
      resized = callback;
    },
    resize: () => resized(),
  };
  return Object.assign(control, { calls });
}

function setup(window = fakeWindow(), storage = memoryStorage()) {
  const mainArea = document.createElement("section");
  const fullScreenButton = document.createElement("button");
  const sidePanelsButton = document.createElement("button");
  const error = vi.fn();
  const display = connectWindowDisplay(
    { mainArea, fullScreenButton, sidePanelsButton },
    { window, storage, error },
  );
  const panelsHidden = () => mainArea.classList.contains("panels-hidden");
  return {
    display,
    window,
    storage,
    mainArea,
    fullScreenButton,
    sidePanelsButton,
    error,
    panelsHidden,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("plein écran et panneaux latéraux", () => {
  it("entre en plein écran et en sort sans toucher aux panneaux latéraux", async () => {
    const { display, window, fullScreenButton, panelsHidden } = setup();
    await display.toggleFullScreen();
    expect(window.calls).toEqual([true]);
    expect(fullScreenButton.textContent).toBe("Quitter le plein écran");
    expect(panelsHidden()).toBe(false);
    await display.toggleFullScreen();
    expect(window.calls).toEqual([true, false]);
    expect(fullScreenButton.textContent).toBe("Plein écran");
  });

  it("le bouton bascule le plein écran", async () => {
    const { window, fullScreenButton } = setup();
    fullScreenButton.click();
    await settle();
    expect(window.fullScreen).toBe(true);
    fullScreenButton.click();
    await settle();
    expect(window.fullScreen).toBe(false);
  });

  it("Échap ne sert qu'en plein écran, et en fait sortir", async () => {
    const { display, window } = setup();
    expect(display.leaveFullScreen()).toBe(false);
    expect(window.calls).toEqual([]);
    await display.toggleFullScreen();
    expect(display.leaveFullScreen()).toBe(true);
    await settle();
    expect(window.fullScreen).toBe(false);
  });

  it("suit le plein écran demandé par le Mac, que la fenêtre annonce", async () => {
    const { window, fullScreenButton, panelsHidden } = setup();
    await settle();
    window.fullScreen = true;
    window.resize();
    await settle();
    expect(fullScreenButton.textContent).toBe("Quitter le plein écran");
    expect(fullScreenButton.getAttribute("aria-pressed")).toBe("true");
    expect(panelsHidden()).toBe(false);
  });

  it("signale une fenêtre qui refuse, ne répond pas ou n'écoute pas", async () => {
    const refused = setup(fakeWindow({ failSet: true }));
    refused.fullScreenButton.click();
    await settle();
    expect(refused.error).toHaveBeenCalledTimes(1);
    expect(refused.fullScreenButton.textContent).toBe("");
    await refused.display.toggleFullScreen().catch(() => undefined);
    expect(refused.display.leaveFullScreen()).toBe(false);
    const mute = setup(fakeWindow({ failAsk: true }));
    await settle();
    mute.window.resize();
    await settle();
    expect(mute.error).toHaveBeenCalledTimes(1);
    const deaf = setup(fakeWindow({ failListen: true }));
    await settle();
    expect(deaf.error).toHaveBeenCalledTimes(1);
  });

  it("cache et montre les panneaux latéraux, et garde le choix", () => {
    const { display, storage, sidePanelsButton, panelsHidden } = setup();
    expect(panelsHidden()).toBe(false);
    expect(sidePanelsButton.getAttribute("aria-pressed")).toBe("true");
    display.toggleSidePanels();
    expect(panelsHidden()).toBe(true);
    expect(sidePanelsButton.getAttribute("aria-pressed")).toBe("false");
    expect(storage.items.get("malorean.side-panels")).toBe("hidden");
    sidePanelsButton.click();
    expect(panelsHidden()).toBe(false);
    expect(storage.items.has("malorean.side-panels")).toBe(false);
  });

  it("retrouve les panneaux cachés au lancement suivant", () => {
    const { panelsHidden, sidePanelsButton } = setup(
      fakeWindow(),
      memoryStorage({ "malorean.side-panels": "hidden" }),
    );
    expect(panelsHidden()).toBe(true);
    expect(sidePanelsButton.getAttribute("aria-pressed")).toBe("false");
  });
});
