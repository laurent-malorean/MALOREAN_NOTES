import { beforeEach, describe, expect, it } from "vitest";
import { showFullNameWhenTruncated } from "./truncated-name";

/** Un nom sur une ligne, coupé par « … » s'il dépasse `width` pixels. */
function name(text: string, width: string) {
  const element = document.createElement("span");
  Object.assign(element.style, {
    display: "block",
    width,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  });
  element.textContent = text;
  document.body.append(element);
  showFullNameWhenTruncated(element);
  return element;
}

const hover = (element: HTMLElement) => element.dispatchEvent(new PointerEvent("pointerenter"));

beforeEach(() => document.body.replaceChildren());

describe("nom coupé", () => {
  it("au survol, un nom coupé montre son nom complet", () => {
    const element = name("comptabilité et impôts de l'année", "40px");
    expect(element.title).toBe("");
    hover(element);
    expect(element.title).toBe("comptabilité et impôts de l'année");
  });

  it("un nom entier ne montre rien de plus", () => {
    const element = name("Rome", "400px");
    hover(element);
    expect(element.hasAttribute("title")).toBe(false);
  });

  it("le panneau élargi, le nom n'est plus coupé : plus rien au survol", () => {
    const element = name("comptabilité", "40px");
    hover(element);
    element.style.width = "400px";
    hover(element);
    expect(element.hasAttribute("title")).toBe(false);
  });
});
