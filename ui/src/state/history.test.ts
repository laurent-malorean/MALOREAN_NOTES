import { describe, expect, it } from "vitest";
import { VERSION_DELAY_MS } from "./history";

describe("historique des versions", () => {
  it("une version est gardée après 5 minutes de frappe", () => {
    expect(VERSION_DELAY_MS).toBe(300_000);
  });
});
