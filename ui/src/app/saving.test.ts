import { describe, expect, it } from "vitest";
import { fakeColumns } from "../../test-support/app-fixture";
import { columnsStarted, noteOpened } from "../state/columns";
import { savingEvents } from "./saving";

function setup() {
  const columns = fakeColumns(noteOpened(noteOpened(columnsStarted, "a.md"), "b.md"));
  const log: string[] = [];
  const events = savingEvents({
    columns: columns.open,
    messages: {
      show: (message) => log.push(`message ${message}`),
      error: (error) => log.push(`erreur ${(error as Error).message}`),
      run: (action) => void action.then(() => log.push("fait")),
    },
    library: {
      refreshFolders: async () => void log.push("dossiers"),
      refreshList: async () => void log.push("liste"),
      refreshTags: async () => void log.push("étiquettes"),
    },
    recent: { moved: (rename) => void log.push(`récentes ${rename("a.md")} ${rename("b.md")}`) },
  });
  const tabs = () => columns.columns().list[0]?.tabs.map((tab) => `${tab.note} ${tab.title}`);
  return { events, log, tabs };
}

describe("enregistrement : ce que les notes partagées annoncent", () => {
  it("une note enregistrée sous un autre nom garde ses onglets, à son nouveau titre, et sa place dans les notes récentes ; la liste est relue", () => {
    const { events, log, tabs } = setup();
    events.saved("a.md", {
      path: "neuf.md",
      title: "Neuf",
      fingerprint: "1",
      conflictCopy: null,
      tagsChanged: false,
    });
    expect(tabs()).toEqual(["neuf.md Neuf", "b.md null"]);
    expect(log).toEqual(["récentes neuf.md b.md", "liste"]);
  });

  it("une copie de conflit est annoncée, avec les dossiers relus", () => {
    const { events, log } = setup();
    events.saved("b.md", {
      path: "b.md",
      title: "B",
      fingerprint: "1",
      conflictCopy: "b (conflit).md",
      tagsChanged: false,
    });
    expect(log).toEqual([
      "message Cette note a aussi changé hors de l'application : l'autre version est gardée dans « b (conflit).md ».",
      "dossiers",
      "liste",
    ]);
  });

  it("une note dont les étiquettes ont changé fait relire la liste des étiquettes", () => {
    const { events, log } = setup();
    events.saved("b.md", {
      path: "b.md",
      title: "B",
      fingerprint: "1",
      conflictCopy: null,
      tagsChanged: true,
    });
    expect(log).toEqual(["étiquettes", "liste"]);
  });

  it("avec une copie de conflit, les dossiers relus suffisent : ils relisent les étiquettes", () => {
    const { events, log } = setup();
    events.saved("b.md", {
      path: "b.md",
      title: "B",
      fingerprint: "1",
      conflictCopy: "b (conflit).md",
      tagsChanged: true,
    });
    expect(log.slice(1)).toEqual(["dossiers", "liste"]);
  });

  it("une note lue donne son titre à ses onglets", async () => {
    const { events, log, tabs } = setup();
    events.titled("b.md", "Bé");
    expect(tabs()).toEqual(["a.md null", "b.md Bé"]);
    await Promise.resolve();
    expect(log).toEqual(["fait"]);
  });

  it("une note supprimée ailleurs, ou une erreur, est annoncée", () => {
    const { events, log } = setup();
    events.deleted();
    events.error(new Error("disque plein"));
    expect(log).toEqual([
      "message Cette note a été supprimée hors de l'application : son texte reste ici, et elle sera recréée à la prochaine modification.",
      "erreur disque plein",
    ]);
  });
});
