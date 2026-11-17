import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countText, describeCounts, readableText } from "./counts";

const count = (markdown: string) => countText(readableText(markdown));

describe("texte tel qu'on le lit", () => {
  it("retire l'en-tête YAML et les marques Markdown", () => {
    expect(readableText("---\npinned: true\n---\n# Titre\n**gras** et *italique*")).toBe(
      "Titre\ngras et italique",
    );
  });

  it("garde un faux en-tête qui ne se ferme pas dans les 10 000 premiers caractères", () => {
    const long = `---\n${"a".repeat(10_000)}\n---\nfin`;
    expect(readableText(long)).toContain("fin");
    expect(readableText(long).startsWith("\na")).toBe(true);
  });

  it("retire les puces, numéros, cases, chevrons et séparateurs", () => {
    expect(readableText("- un\n2. deux\n- [x] fait\n> cité\n---")).toBe("un\ndeux\nfait\ncité\n");
  });

  it("ne garde d'un lien ou d'une image que son texte", () => {
    expect(readableText("[le site](https://a.fr) ![un chat](c.png)")).toBe("le site un chat");
  });

  it("retire le barré, le code et les délimiteurs de blocs de code", () => {
    expect(readableText("~~non~~ `code`\n```js\nlet a;\n```")).toBe("non code\n\nlet a;\n");
  });

  it("retire chaque sorte de marque, quelle que soit sa forme", () => {
    const cases: [string, string][] = [
      ["## Sous-titre", "Sous-titre"],
      ["#  deux espaces", "deux espaces"],
      ["  > cité", "cité"],
      [">collé", "collé"],
      ["> > doublement cité", "doublement cité"],
      ["10. dix", "dix"],
      ["-  deux espaces", "deux espaces"],
      ["- [ ]  tâche", "tâche"],
      ["  ```js", ""],
      ["~~~", ""],
      ["  ---", ""],
      ["***", ""],
      ["___", ""],
    ];
    for (const [markdown, read] of cases) expect(readableText(markdown), markdown).toBe(read);
  });

  it("garde ce qui ressemble à une marque sans en être une", () => {
    const cases: [string, string][] = [
      ["un ``` deux", "un  deux"],
      ["`code` puis texte", "code puis texte"],
      ["a ---", "a ---"],
      ["---abc", "---abc"],
    ];
    for (const [markdown, read] of cases) expect(readableText(markdown), markdown).toBe(read);
  });

  it("ne voit un titre, une puce ou un chevron qu'en début de ligne", () => {
    expect(readableText("C# - a > b")).toBe("C# - a > b");
  });
});

describe("mots et caractères", () => {
  it("compte les mots et les caractères, espaces comprises", () => {
    expect(countText("Une bonne idée")).toEqual({ words: 3, characters: 14 });
  });

  it("compte « l'été » et « porte-monnaie » pour un mot chacun", () => {
    expect(countText("l'été porte-monnaie").words).toBe(2);
  });

  it("ne compte pas la ponctuation seule comme un mot", () => {
    expect(countText("Oui — non ! « bien »").words).toBe(3);
  });

  it("compte un accent avec sa lettre, et pas les retours à la ligne", () => {
    expect(countText("été\nla").characters).toBe(5);
    expect(countText("a\r\nb").characters).toBe(2);
  });

  it("ne compte rien dans une note vide ou faite d'espaces", () => {
    expect(countText("")).toEqual({ words: 0, characters: 0 });
    expect(countText("  \n ").words).toBe(0);
  });

  it("compte la note telle qu'on la lit, sans sa syntaxe", () => {
    expect(count("# Titre\n- **un** mot")).toEqual({ words: 3, characters: 11 });
  });

  it("ajouter un mot ajoute exactement un mot", () => {
    const word = fc.stringMatching(/^[a-zéèàç]{1,8}$/);
    fc.assert(
      fc.property(fc.array(word), word, (words, extra) => {
        const before = countText(words.join(" ")).words;
        expect(countText([...words, extra].join(" ")).words).toBe(before + 1);
      }),
    );
  });

  it("le nombre de caractères ne dépend pas des retours à la ligne", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(countText(text.replaceAll("\n", "")).characters).toBe(countText(text).characters);
      }),
    );
  });
});

describe("description des comptes", () => {
  it("donne les mots, les caractères et les pages, en français", () => {
    expect(describeCounts({ words: 1234, characters: 5678 }, 1500)).toBe(
      "1\u202f234 mots · 5\u202f678 caractères · 4 pages",
    );
  });

  it("met « page », « mot » et « caractère » au singulier en dessous de 2", () => {
    expect(describeCounts({ words: 0, characters: 0 }, 1500)).toBe("0 mot · 0 caractère · 0 page");
    expect(describeCounts({ words: 1, characters: 1 }, 1500)).toBe("1 mot · 1 caractère · 1 page");
    expect(describeCounts({ words: 2, characters: 1500 }, 1500)).toBe(
      "2 mots · 1\u202f500 caractères · 1 page",
    );
  });

  it("compte les pages commencées, en nombre entier, par tranche du nombre de caractères réglé", () => {
    const pages = (characters: number, perPage = 1500) =>
      describeCounts({ words: 0, characters }, perPage).split(" · ")[2];
    expect(pages(0)).toBe("0 page");
    expect(pages(47)).toBe("1 page");
    expect(pages(1500)).toBe("1 page");
    expect(pages(1501)).toBe("2 pages");
    expect(pages(1600)).toBe("2 pages");
    expect(pages(3000)).toBe("2 pages");
    expect(pages(3001)).toBe("3 pages");
    expect(pages(3000, 1000)).toBe("3 pages");
  });
});
