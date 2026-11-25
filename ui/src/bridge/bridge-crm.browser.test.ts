import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as bridge from "./index";

interface Call {
  readonly command: string;
  readonly args: unknown;
}

function recordCalls(answer: unknown = null): Call[] {
  const calls: Call[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return answer;
  });
  return calls;
}

afterEach(() => clearMocks());

describe("pont vers Rust : le CRM (fiche 0058)", () => {
  const filters = { search: "", person: null, company: null, projects: [], tags: [] };

  it("crée et lit un CRM avec les noms d'arguments de Rust", async () => {
    const calls = recordCalls(null);
    await bridge.createCrm("Clients", "Prospects");
    await bridge.readCrm("clients.md", filters, "2026-11-24");
    await bridge.readCrm("clients.md", filters, null);
    await bridge.crmEmailIsKnown("clients.md", "a@b.fr", "jean");
    expect(calls).toEqual([
      { command: "create_crm", args: { folder: "Clients", title: "Prospects" } },
      { command: "read_crm", args: { path: "clients.md", filters, weekDay: "2026-11-24" } },
      { command: "read_crm", args: { path: "clients.md", filters, weekDay: null } },
      {
        command: "crm_email_is_known",
        args: { crm: "clients.md", email: "a@b.fr", except: "jean" },
      },
    ]);
  });

  it("crée, change, déplace et supprime une action", async () => {
    const calls = recordCalls(null);
    const draft = {
      ...{ title: "Devis", status: null, date: null, people: [], channel: null },
      ...{ project: null, color: null, tags: [], linkedNotes: [], description: "" },
    };
    await bridge.createCrmAction("c.md", draft);
    await bridge.changeCrmAction("c.md", "a", { kind: "date", date: "2026-11-25" });
    await bridge.moveCrmAction("c.md", "a", "Done", { kind: "unplaced" });
    await bridge.deleteCrmAction("c.md", "a");
    expect(calls).toEqual([
      { command: "create_crm_action", args: { crm: "c.md", draft } },
      {
        command: "change_crm_action",
        args: { crm: "c.md", action: "a", change: { kind: "date", date: "2026-11-25" } },
      },
      {
        command: "move_crm_action",
        args: { crm: "c.md", action: "a", status: "Done", placement: { kind: "unplaced" } },
      },
      { command: "delete_crm_action", args: { crm: "c.md", action: "a" } },
    ]);
  });

  it("crée, change et supprime une personne, une entreprise, un projet", async () => {
    const calls = recordCalls(null);
    await bridge.createCrmPerson("c.md", "Jean", null);
    await bridge.changeCrmPerson("c.md", "jean", { kind: "rename", name: "Jean Dupont" });
    await bridge.deleteCrmPerson("c.md", "jean");
    await bridge.createCrmCompany("c.md", "Acme");
    await bridge.changeCrmCompany("c.md", "acme", { kind: "field", field: "site", value: "" });
    await bridge.deleteCrmCompany("c.md", "acme");
    await bridge.createCrmProject("c.md", "Refonte");
    await bridge.changeCrmProject("c.md", "refonte", { kind: "color", color: "bleu" });
    await bridge.deleteCrmProject("c.md", "refonte");
    expect(calls.map((call) => call.command)).toEqual([
      ...["create_crm_person", "change_crm_person", "delete_crm_person"],
      ...["create_crm_company", "change_crm_company", "delete_crm_company"],
      ...["create_crm_project", "change_crm_project", "delete_crm_project"],
    ]);
    expect(calls[0]?.args).toEqual({ crm: "c.md", name: "Jean", company: null });
    expect(calls[1]?.args).toEqual({
      crm: "c.md",
      person: "jean",
      change: { kind: "rename", name: "Jean Dupont" },
    });
    expect(calls[4]?.args).toEqual({
      crm: "c.md",
      company: "acme",
      change: { kind: "field", field: "site", value: "" },
    });
    expect(calls[7]?.args).toEqual({
      crm: "c.md",
      project: "refonte",
      change: { kind: "color", color: "bleu" },
    });
    expect(calls[8]?.args).toEqual({ crm: "c.md", project: "refonte" });
  });

  it("change les étapes et rend celles que Rust garde", async () => {
    const calls = recordCalls(["Progress", "Devis"]);
    const stages = await bridge.changeCrmStages("c.md", { kind: "add", name: "Devis" });
    expect(stages).toEqual(["Progress", "Devis"]);
    expect(calls).toEqual([
      {
        command: "change_crm_stages",
        args: { crm: "c.md", change: { kind: "add", name: "Devis" } },
      },
    ]);
  });
});
