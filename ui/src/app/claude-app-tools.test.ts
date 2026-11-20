import { beforeEach, describe, expect, it } from "vitest";
import type { Columns } from "../state/columns";
import { connectAppTools } from "./claude-app-tools";

let log: string[];
let shows: (path: string) => void;
let asks: (request: number) => void;
let selected: string;

/** Une seule colonne, qui montre la note `path`, ou aucune. */
const showing = (path: string | null): Columns => ({
  list: [
    {
      id: 0,
      tabs: path === null ? [] : [{ id: 1, note: path, title: null }],
      activeTab: path === null ? null : 1,
      width: 1,
    },
  ],
  active: 0,
  nextId: 2,
});

function connect(
  columns: Columns,
  withEditor = true,
  answer: Promise<null> = Promise.resolve(null),
) {
  connectAppTools({
    backend: {
      onClaudeShowsNote: async (handler) => ((shows = handler), () => {}),
      onClaudeAsksView: async (handler) => ((asks = handler), () => {}),
      answerView: (request, note, selection) => (
        log.push(`répondre ${request} ${note ?? "aucune"} «${selection}»`),
        answer
      ),
    },
    columns: {
      current: () => columns,
      ...(withEditor ? { activePane: () => ({ editor: { selectedText: () => selected } }) } : {}),
    },
    openNote: (path) => log.push(`ouvrir ${path}`),
    error: (error) => log.push(`erreur ${String(error)}`),
  });
}

beforeEach(() => {
  log = [];
  selected = "";
});

describe("outils de l'application qui touchent à l'interface", () => {
  it("une note montrée par Claude s'ouvre dans la colonne active", () => {
    connect(showing(null));
    shows("Travail/a.md");
    expect(log).toEqual(["ouvrir Travail/a.md"]);
  });

  it("la note de la colonne active et sa sélection sont rendues à la demande", () => {
    selected = "du pain";
    connect(showing("Travail/a.md"));
    asks(3);
    selected = "";
    asks(4);
    expect(log).toEqual(["répondre 3 Travail/a.md «du pain»", "répondre 4 Travail/a.md «»"]);
  });

  it("sans note ouverte, ni note ni sélection ; sans éditeur, pas de sélection", () => {
    selected = "ailleurs";
    connect(showing(null));
    asks(1);
    connect(showing("a.md"), false);
    asks(2);
    expect(log).toEqual(["répondre 1 aucune «»", "répondre 2 a.md «»"]);
  });

  it("une réponse qui n'arrive pas à Rust est signalée", async () => {
    connect(showing(null), true, Promise.reject(new Error("coupé")));
    asks(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(log.at(-1)).toBe("erreur Error: coupé");
  });
});
