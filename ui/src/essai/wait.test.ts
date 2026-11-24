import { describe, expect, it } from "vitest";
import { until } from "./wait";

describe("essai : attendre un état de la fenêtre", () => {
  it("rend la valeur dès qu'elle existe, même après plusieurs essais", async () => {
    let tries = 0;
    const value = await until("un nombre", () => (++tries >= 3 ? 42 : null));
    expect(value).toBe(42);
    expect(tries).toBe(3);
  });

  it("accepte une attente asynchrone et une valeur fausse mais présente", async () => {
    expect(await until("zéro", async () => 0)).toBe(0);
    expect(await until("faux", () => false)).toBe(false);
    expect(await until("vide", () => "")).toBe("");
  });

  it("échoue au délai en disant ce qu'on attendait", async () => {
    await expect(until("la fenêtre de recherche", () => undefined, 120)).rejects.toThrow(
      "délai dépassé (120 ms) : la fenêtre de recherche",
    );
  });
});
