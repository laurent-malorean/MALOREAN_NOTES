import { describe, expect, it } from "vitest";
import { contentTypeLabel } from "./content-type";

describe("type de contenu", () => {
  it("une page se nomme « Page »", () => {
    expect(contentTypeLabel("page")).toBe("Page");
  });
});
