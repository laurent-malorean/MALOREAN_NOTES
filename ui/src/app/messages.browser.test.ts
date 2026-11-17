import { afterEach, describe, expect, it, vi } from "vitest";
import { createMessages, STATUS_DURATION_MS } from "./messages";

function mount() {
  const status = document.createElement("div");
  const messages = createMessages(status, (error) => `traduit : ${(error as Error).message}`);
  return { status, messages };
}

afterEach(() => vi.useRealTimers());

describe("messages", () => {
  it("montre un message quelques secondes", () => {
    vi.useFakeTimers();
    const { status, messages } = mount();
    messages.show("Bonjour");
    expect(status.textContent).toBe("Bonjour");
    expect(status.classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(STATUS_DURATION_MS - 1);
    expect(status.classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(status.classList.contains("visible")).toBe(false);
    expect(STATUS_DURATION_MS).toBe(4000);
  });

  it("dit une erreur avec les mots de l'utilisateur", () => {
    const { status, messages } = mount();
    messages.error(new Error("disque plein"));
    expect(status.textContent).toBe("traduit : disque plein");
  });

  it("une action lancée sans être attendue montre son erreur", async () => {
    const { status, messages } = mount();
    messages.run(Promise.resolve("fait"));
    await Promise.resolve();
    expect(status.textContent).toBe("");
    messages.run(Promise.reject(new Error("refusé")));
    await vi.waitFor(() => expect(status.textContent).toBe("traduit : refusé"));
  });
});
