import { describe, expect, it } from "vitest";
import { columnsStarted } from "../state/columns";
import { followColumns } from "./follow-columns";

describe("ce qui suit un changement des colonnes", () => {
  it("chacun est prévenu, dans l'ordre, avec l'état des colonnes", () => {
    const log: string[] = [];
    const saying = (name: string) => ({
      showTypewriter: () => log.push(`${name} machine`),
      save: (columns: unknown) => log.push(`${name} ${columns === columnsStarted}`),
      visited: (columns: unknown) => log.push(`${name} ${columns === columnsStarted}`),
      follow: (columns?: unknown) => log.push(`${name} ${columns === columnsStarted}`),
    });
    followColumns(columnsStarted, {
      writing: saying("écriture"),
      layoutMemory: saying("disposition"),
      recent: saying("récentes"),
      menu: saying("menu"),
      formatBar: saying("barre"),
      claude: saying("claude"),
      voice: saying("saisie vocale"),
    });
    expect(log).toEqual([
      "écriture machine",
      "disposition true",
      "récentes true",
      "menu true",
      "barre true",
      "claude false",
      "saisie vocale true",
    ]);
  });
});
