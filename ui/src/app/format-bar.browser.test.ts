import { describe, expect, it } from "vitest";
import { columnsStarted, noteOpened } from "../state/columns";
import type { CommandId } from "../state/commands";
import { connectFormatBar } from "./format-bar";

function setup() {
  const bar = document.createElement("div");
  const ran: string[] = [];
  const actions = new Proxy({} as Record<CommandId, () => void>, {
    get: (_, id: string) => () => ran.push(id),
  });
  const formatBar = connectFormatBar(bar, actions);
  const button = (name: string) =>
    bar.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) as HTMLButtonElement;
  return { formatBar, ran, button };
}

describe("barre de mise en forme branchée", () => {
  it("chaque bouton lance la même commande que la palette et le menu Format", () => {
    const { formatBar, ran, button } = setup();
    formatBar.follow(noteOpened(columnsStarted, "a.md"));
    button("Gras").click();
    button("Insérer la date du jour").click();
    button("Copier en texte mis en forme").click();
    expect(ran).toEqual(["bold", "insert-date", "copy-note"]);
  });

  it("suit les colonnes : grisée sans note dans la colonne active", () => {
    const { formatBar, button } = setup();
    expect(button("Lien").disabled).toBe(true);
    formatBar.follow(noteOpened(columnsStarted, "a.md"));
    expect(button("Lien").disabled).toBe(false);
    formatBar.follow(columnsStarted);
    expect(button("Lien").disabled).toBe(true);
  });
});
