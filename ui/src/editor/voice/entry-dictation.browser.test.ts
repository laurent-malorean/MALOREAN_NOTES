import { describe, expect, it } from "vitest";
import { createEntryDictation, DICTATING_CLASS } from "./entry-dictation";

/** Une zone de saisie dans le document, liée à une dictée ; le curseur en `at`. */
function mount(content = "", at = content.length) {
  const field = document.createElement("textarea");
  field.value = content;
  document.body.replaceChildren(field);
  field.focus();
  field.setSelectionRange(at, at);
  const dictation = createEntryDictation();
  dictation.bind(field);
  return { field, dictation };
}

/** Une frappe de l'utilisateur au curseur : le texte, puis l'événement que le navigateur envoie. */
function type(field: HTMLTextAreaElement, text: string) {
  field.setRangeText(text, field.selectionStart, field.selectionEnd, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("saisie vocale dans la zone de saisie : le texte provisoire", () => {
  it("s'écrit dans le champ à la suite du curseur, qui garde le focus, et est remplacé en entier", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout");
    expect(field.value).toBe("Bonjour tout");
    dictation.provisional("tout le monde");
    expect(field.value).toBe("Bonjour tout le monde");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(field.value.length);
  });

  it("s'efface du champ s'il devient vide", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout");
    dictation.provisional("");
    expect(field.value).toBe("Bonjour");
  });

  it("n'est écrit que pendant l'écoute", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.provisional("tout");
    expect(field.value).toBe("Bonjour");
    expect(dictation.listening()).toBe(false);
  });

  it("remplace la sélection, comme une frappe", () => {
    const { field, dictation } = mount("un X ici", 3);
    field.setSelectionRange(3, 4);
    dictation.begin();
    dictation.provisional("mot");
    expect(field.value).toBe("un mot ici");
  });

  it("le champ prend la classe de l'écoute, qu'il perd à la fin", () => {
    const { field, dictation } = mount("");
    dictation.begin();
    expect(field.classList.contains(DICTATING_CLASS)).toBe(true);
    dictation.end();
    expect(field.classList.contains(DICTATING_CLASS)).toBe(false);
  });
});

describe("saisie vocale dans la zone de saisie : le texte fixé", () => {
  it("devient le texte du champ, le curseur à sa suite ; un blanc sépare deux phrases, aucun en trop", () => {
    const first = mount("");
    first.dictation.begin();
    first.dictation.provisional("Première phrase");
    first.dictation.fixed("Première phrase.");
    first.dictation.fixed("Seconde phrase.");
    expect(first.field.value).toBe("Première phrase. Seconde phrase.");
    expect(first.field.selectionStart).toBe(32);
    const afterSpace = mount("Salut ");
    afterSpace.dictation.begin();
    afterSpace.dictation.fixed("tout le monde");
    expect(afterSpace.field.value).toBe("Salut tout le monde");
    const lineStart = mount("Titre\n");
    lineStart.dictation.begin();
    lineStart.dictation.fixed("Début.");
    expect(lineStart.field.value).toBe("Titre\nDébut.");
  });

  it("ne laisse aucun texte provisoire derrière lui", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout le");
    dictation.fixed("tout le monde.");
    dictation.provisional("on");
    dictation.provisional("");
    expect(field.value).toBe("Bonjour tout le monde.");
  });

  it("ne fait rien d'un texte fixé vide, sauf retirer le texte provisoire", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout");
    dictation.fixed("");
    expect(field.value).toBe("Bonjour");
    dictation.fixed("");
    expect(field.value).toBe("Bonjour");
  });

  it("n'ajoute jamais d'entrée de lui-même : aucun événement de validation n'est envoyé", () => {
    const { field, dictation } = mount("");
    const seen: string[] = [];
    field.addEventListener("keydown", () => seen.push("keydown"));
    field.addEventListener("submit", () => seen.push("submit"));
    dictation.begin();
    dictation.fixed("Une observation.\nSuite.");
    dictation.end();
    expect(seen).toEqual([]);
    expect(field.value).toBe("Une observation.\nSuite.");
  });
});

describe("saisie vocale dans la zone de saisie : l'arrêt", () => {
  it("fixe le texte provisoire tel quel, jamais perdu", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout le monde");
    dictation.end();
    expect(field.value).toBe("Bonjour tout le monde");
    expect(dictation.listening()).toBe(false);
  });

  it("l'abandon (« drop ») retire le texte provisoire", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout");
    dictation.drop();
    expect(field.value).toBe("Bonjour");
    expect(dictation.listening()).toBe(false);
    expect(field.classList.contains(DICTATING_CLASS)).toBe(false);
  });

  it("ne fait rien sans écoute", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.end();
    dictation.fixed("x");
    expect(field.value).toBe("Bonjour");
  });
});

describe("saisie vocale dans la zone de saisie : l'utilisateur écrit pendant l'écoute", () => {
  it("une frappe fixe le texte provisoire où il est, l'écoute continue à la suite, sans répéter le début de la phrase", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout le");
    type(field, "!");
    expect(field.value).toBe("Bonjour tout le!");
    expect(dictation.listening()).toBe(true);
    dictation.provisional("tout le monde");
    expect(field.value).toBe("Bonjour tout le! monde");
    dictation.fixed("tout le monde.");
    expect(field.value).toBe("Bonjour tout le! monde.");
  });

  it("si le moteur corrige le début qui a été fixé, son texte est écrit en entier", () => {
    const { field, dictation } = mount("");
    dictation.begin();
    dictation.provisional("tous le");
    type(field, "?");
    dictation.provisional("tout le monde");
    expect(field.value).toBe("tous le? tout le monde");
  });

  it("déplacer le curseur fixe le texte provisoire, l'écoute continue à la nouvelle place", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout");
    field.setSelectionRange(0, 0);
    field.dispatchEvent(new Event("mouseup"));
    dictation.provisional("tout le monde");
    expect(field.value).toBe("le mondeBonjour tout");
  });

  it("le curseur qui reste contre le texte provisoire ne le fixe pas", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    dictation.provisional("tout");
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta", code: "MetaRight" }));
    dictation.provisional("tout le");
    expect(field.value).toBe("Bonjour tout le");
  });

  it("le champ vidé (entrée ajoutée) : le texte déjà écrit n'y est plus, la dictée continue dans un champ vide", () => {
    const { field, dictation } = mount("");
    dictation.begin();
    dictation.provisional("tout le monde");
    field.value = "";
    dictation.cleared();
    dictation.provisional("tout le monde et");
    expect(field.value).toBe("et");
    dictation.fixed("tout le monde et les autres.");
    expect(field.value).toBe("et les autres.");
  });
});

describe("saisie vocale dans la zone de saisie : disponibilité", () => {
  it("n'est disponible que tant que la zone de saisie est liée et montrée", () => {
    const { field, dictation } = mount("");
    expect(dictation.available()).toBe(true);
    field.remove();
    expect(dictation.available()).toBe(false);
    document.body.append(field);
    expect(dictation.available()).toBe(true);
    dictation.unbind();
    expect(dictation.available()).toBe(false);
  });

  it("n'est pas disponible avant d'avoir une zone de saisie", () => {
    expect(createEntryDictation().available()).toBe(false);
  });

  it("une zone de saisie qui disparaît en pleine écoute arrête l'écoute", () => {
    const { dictation } = mount("");
    dictation.begin();
    dictation.unbind();
    expect(dictation.listening()).toBe(false);
  });

  it("lier une autre zone de saisie remplace la précédente", () => {
    const { field, dictation } = mount("a");
    const other = document.createElement("textarea");
    document.body.append(other);
    dictation.bind(other);
    other.focus();
    dictation.begin();
    dictation.fixed("b");
    expect(other.value).toBe("b");
    expect(field.value).toBe("a");
  });
});

describe("saisie vocale dans la zone de saisie : hors focus", () => {
  it("écrit quand même dans le champ si le focus est allé ailleurs (le bouton « Ajouter l'entrée »)", () => {
    const { field, dictation } = mount("Bonjour");
    dictation.begin();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    dictation.provisional("tout");
    expect(field.value).toBe("Bonjour tout");
    dictation.fixed("tout le monde");
    expect(field.value).toBe("Bonjour tout le monde");
    expect(document.activeElement).toBe(elsewhere);
  });
});
