import { afterEach, describe, expect, it, vi } from "vitest";
import { createMessages, MAX_TOASTS, STATUS_DURATION_MS } from "./messages";

function mount() {
  const status = document.createElement("div");
  document.body.replaceChildren(status);
  const messages = createMessages(status, (error) => `traduit : ${(error as Error).message}`);
  return { status, messages };
}

const toasts = (status: HTMLElement) => [...status.querySelectorAll<HTMLElement>(".toast")];
const texts = (status: HTMLElement) => toasts(status).map((toast) => toast.textContent);

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("messages", () => {
  it("montre un message cinq secondes, puis le retire", () => {
    vi.useFakeTimers();
    const { status, messages } = mount();
    messages.show("Bonjour");
    expect(texts(status)).toEqual(["Bonjour"]);
    vi.advanceTimersByTime(STATUS_DURATION_MS - 1);
    expect(texts(status)).toEqual(["Bonjour"]);
    vi.advanceTimersByTime(1);
    expect(texts(status)).toEqual([]);
    expect(STATUS_DURATION_MS).toBe(5000);
  });

  it("donne à chaque type de message sa couleur : succès, information, avertissement, erreur", () => {
    const { status, messages } = mount();
    messages.show("Fait aussi", "success");
    messages.show("À savoir", "info");
    messages.show("Attention", "warning");
    messages.error(new Error("disque plein"));
    const kinds = toasts(status).map((toast) => [...toast.classList].filter((c) => c !== "toast"));
    expect(kinds).toEqual([["toast-error"], ["toast-warning"], ["toast-info"], ["toast-success"]]);
    expect(MAX_TOASTS).toBe(4);
  });

  it("un message sans type est un succès", () => {
    const { status, messages } = mount();
    messages.show("Fait");
    expect(toasts(status)[0]?.className).toBe("toast toast-success");
  });

  it("a un texte et une croix qui ne soumet rien", () => {
    const { status, messages } = mount();
    messages.show("Fait");
    expect(status.querySelector(".toast-text")?.textContent).toBe("Fait");
    expect(status.querySelector<HTMLButtonElement>(".toast-close")?.type).toBe("button");
  });

  it("dit une erreur avec les mots de l'utilisateur, annoncée comme une alerte", () => {
    const { status, messages } = mount();
    messages.error(new Error("disque plein"));
    expect(texts(status)).toEqual(["traduit : disque plein"]);
    expect(toasts(status)[0]?.getAttribute("role")).toBe("alert");
    messages.show("Fait");
    expect(toasts(status)[0]?.getAttribute("role")).toBeNull();
  });

  it("empile les messages, le plus récent en haut, quatre au plus", () => {
    const { status, messages } = mount();
    for (const word of ["un", "deux", "trois", "quatre", "cinq"]) messages.show(word);
    expect(texts(status)).toEqual(["cinq", "quatre", "trois", "deux"]);
  });

  it("garde à chaque message son propre minuteur : le suivant n'est pas coupé par le précédent", () => {
    vi.useFakeTimers();
    const { status, messages } = mount();
    messages.show("un");
    vi.advanceTimersByTime(3000);
    messages.show("deux");
    vi.advanceTimersByTime(2000);
    expect(texts(status)).toEqual(["deux"]);
    vi.advanceTimersByTime(2999);
    expect(texts(status)).toEqual(["deux"]);
    vi.advanceTimersByTime(1);
    expect(texts(status)).toEqual([]);
  });

  it("se ferme d'un clic sur sa croix", () => {
    const { status, messages } = mount();
    messages.show("un");
    messages.show("deux");
    const close = toasts(status)[0]?.querySelector<HTMLButtonElement>(".toast-close");
    expect(close?.getAttribute("aria-label")).toBe("Fermer");
    close?.click();
    expect(texts(status)).toEqual(["un"]);
  });

  it("offre un bouton d'action : un clic le lance et retire le message", async () => {
    const { status, messages } = mount();
    const undo = vi.fn(() => Promise.resolve());
    messages.show("Retiré des favoris", "success", { label: "Annuler", run: undo });
    const action = status.querySelector<HTMLButtonElement>(".toast-action");
    expect(action?.textContent).toBe("Annuler");
    expect(action?.type).toBe("button");
    expect(texts(status)).toEqual(["Retiré des favorisAnnuler"]);
    action?.click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(texts(status)).toEqual([]);
  });

  it("montre l'erreur d'une action refusée, et n'a pas de bouton sans action", async () => {
    const { status, messages } = mount();
    messages.show("Fait");
    expect(status.querySelector(".toast-action")).toBeNull();
    status.replaceChildren();
    messages.show("Retiré", "success", {
      label: "Annuler",
      run: () => Promise.reject(new Error("note disparue")),
    });
    status.querySelector<HTMLButtonElement>(".toast-action")?.click();
    await vi.waitFor(() => expect(texts(status)).toEqual(["traduit : note disparue"]));
  });

  it("une action lancée sans être attendue montre son erreur", async () => {
    const { status, messages } = mount();
    messages.run(Promise.resolve("fait"));
    await Promise.resolve();
    expect(texts(status)).toEqual([]);
    messages.run(Promise.reject(new Error("refusé")));
    await vi.waitFor(() => expect(texts(status)).toEqual(["traduit : refusé"]));
  });
});
