import { describe, expect, it } from "vitest";
import { contentTypeLabel } from "./content-type";

describe("type de contenu", () => {
  it("une note se nomme « Note »", () => {
    expect(contentTypeLabel("note")).toBe("Note");
  });
});
