import { describe, expect, it } from "vitest";
import { imageAddress } from "./image-address";

const asset = (path: string) => `asset://${path}`;
const resolve = (src: string) => imageAddress(src, "/Users/moi/Notes", asset);

describe("adresse d'une image", () => {
  it("cherche une image relative dans l'espace de travail", () => {
    expect(resolve("voyage.assets/mer.png")).toBe("asset:///Users/moi/Notes/voyage.assets/mer.png");
  });

  it("décode les caractères encodés du chemin", () => {
    expect(resolve("photo%20d%27%C3%A9t%C3%A9.jpg")).toBe(
      "asset:///Users/moi/Notes/photo d'été.jpg",
    );
  });

  it("garde un chemin mal encodé tel quel", () => {
    expect(resolve("100%.png")).toBe("asset:///Users/moi/Notes/100%.png");
  });

  it("accepte un chemin absolu", () => {
    expect(resolve("/Users/moi/Images/a.png")).toBe("asset:///Users/moi/Images/a.png");
  });

  it("laisse une adresse web ou intégrée telle quelle", () => {
    expect(resolve("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(resolve("HTTP://example.com/a.png")).toBe("HTTP://example.com/a.png");
    expect(resolve("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("refuse les autres protocoles", () => {
    expect(resolve("javascript:alert(1)")).toBe("");
    expect(resolve("file:///etc/a.png")).toBe("");
  });

  it("ne voit un protocole qu'au début de l'adresse", () => {
    expect(resolve("réunion https:10.png")).toBe("asset:///Users/moi/Notes/réunion https:10.png");
  });

  it("tient compte des chevrons qui entourent toute l'adresse, et seulement eux", () => {
    expect(resolve("<a b.png>")).toBe("asset:///Users/moi/Notes/a b.png");
    expect(resolve("<a.png>b")).toBe("asset:///Users/moi/Notes/<a.png>b");
    expect(resolve("b<a.png>")).toBe("asset:///Users/moi/Notes/b<a.png>");
  });
});
