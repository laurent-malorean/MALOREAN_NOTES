// Les commandes des listes et des fiches du CRM, simulées pour les tests d'écran (fiche 0063) : chacune
// note son appel puis réussit.
import type { CrmItem } from "../src/bridge";
import type { ListsBackend } from "../src/screens/crm-lists-ui";
import type { FicheBackend } from "../src/screens/crm-fiche-ui";
import { createFicheView, type FicheView } from "../src/screens/crm-fiche-view";
import { action, company, crm, person, project } from "./crm-fixture";

/** Un appel au pont : son nom puis ses arguments. */
export type Gesture = (name: string, ...args: unknown[]) => Promise<void>;

/** Ce que les listes et les fiches demandent à Rust, simulé. */
export function moreBackend(gesture: Gesture): ListsBackend & FicheBackend {
  return {
    createCrmPerson: async (crm, name, company) => {
      await gesture("createCrmPerson", crm, name, company);
      return "nouvelle-personne";
    },
    createCrmCompany: async (crm, name) => {
      await gesture("createCrmCompany", crm, name);
      return "nouvelle-entreprise";
    },
    createCrmProject: async (crm, name) => {
      await gesture("createCrmProject", crm, name);
      return "nouveau-projet";
    },
    changeCrmProject: async (crm, project, change) => {
      await gesture("changeCrmProject", crm, project, change);
      return null;
    },
    deleteCrmProject: async (crm, project) => {
      await gesture("deleteCrmProject", crm, project);
      return null;
    },
    changeCrmPerson: async (crm, person, change) => {
      await gesture("changeCrmPerson", crm, person, change);
      return null;
    },
    deleteCrmPerson: async (crm, person) => {
      await gesture("deleteCrmPerson", crm, person);
      return null;
    },
    changeCrmCompany: async (crm, company, change) => {
      await gesture("changeCrmCompany", crm, company, change);
      return null;
    },
    deleteCrmCompany: async (crm, company) => {
      await gesture("deleteCrmCompany", crm, company);
      return null;
    },
    crmEmailIsKnown: async (crm, email, except) => {
      await gesture("crmEmailIsKnown", crm, email, except);
      return email === "connu@acme.fr";
    },
  };
}

const TALLY = (open: number, late = 0, today = 0) => ({ open, late, today });

/** Un CRM pour les listes : deux entreprises, trois personnes (dont une dans NODATA), deux projets, quatre actions. */
export function listsSample(): CrmItem {
  const acme = {
    ...company("acme", "Acme"),
    people: ["jean-dupont", "paul-martin"],
    tally: TALLY(3, 1, 1),
  };
  const jean = {
    ...person("jean-dupont", "Jean Dupont", "acme"),
    ...{ role: "Responsable maintenance", email: "jean@acme.fr", phone: "06 12 34 56 78" },
    ...{ openActions: ["devis", "appel"], closedActions: ["fini"], tally: TALLY(2, 1, 1) },
    career: [{ company: "acme", from: "2026-03-01", to: null }],
  };
  const paul = {
    ...person("paul-martin", "Paul Martin", "acme"),
    ...{ openActions: ["relance"], tally: TALLY(1) },
  };
  const marie = {
    ...person("marie-durand", "Marie Durand"),
    ...{ openActions: ["appel"], tally: TALLY(1, 0, 1) },
  };
  const actions = [
    action("devis", {
      ...{ title: "Demande de devis", date: "2026-11-22", urgency: { kind: "late", days: 3 } },
      ...{ project: "refonte", people: [{ person: "jean-dupont", company: "acme" }] },
    }),
    action("appel", {
      ...{
        title: "Appeler Jean",
        status: "Progress",
        date: "2026-11-25",
        urgency: { kind: "today" },
      },
      people: [
        { person: "jean-dupont", company: "acme" },
        { person: "marie-durand", company: null },
      ],
    }),
    action("relance", {
      ...{ title: "Relancer Paul", status: "WaitingFor", date: "2026-11-27" },
      people: [{ person: "paul-martin", company: "acme" }],
    }),
    action("fini", {
      ...{ title: "Contrat signé", status: "Done", open: false, date: "2026-11-20" },
      people: [{ person: "jean-dupont", company: "acme" }],
    }),
  ];
  return crm({
    ...{ actions, companies: [acme, company("globex", "Globex")] },
    people: [jean, marie, paul],
    nodata: { people: ["marie-durand"], tally: TALLY(1, 0, 1) },
    projects: [
      {
        ...project("refonte", "Refonte du site", "bleu"),
        openActions: ["devis"],
        tally: TALLY(1, 1),
      },
      project("salon", "Salon", "rouge"),
    ],
  });
}

/** Une fiche montée dans une page de test : les appels au pont, les fiches ouvertes, la fenêtre d'une action. */
export interface MountedFiche {
  view: FicheView;
  host: HTMLElement;
  calls: [string, ...unknown[]][];
  errors: unknown[];
  questions: string[];
  opened: string[];
  hooked: [string, ...unknown[]][];
  disk: { crm: CrmItem };
  fail: { next: string | null };
  answer: { value: boolean };
}

export async function mountFiche(
  kind: "company" | "person",
  name: string,
  crmData: CrmItem = listsSample(),
): Promise<MountedFiche> {
  const host = document.createElement("div");
  host.className = "column";
  host.style.cssText =
    "width:1000px;height:700px;position:relative;display:flex;flex-direction:column";
  document.body.replaceChildren(host);
  const calls: MountedFiche["calls"] = [];
  const m = {
    ...{ host, calls, errors: [], questions: [], opened: [], hooked: [] },
    ...{ disk: { crm: crmData }, fail: { next: null }, answer: { value: true } },
    view: undefined as never,
  } as MountedFiche;
  const gesture: Gesture = async (call, ...args) => {
    calls.push([call, ...args]);
    const { next } = m.fail;
    m.fail.next = null;
    if (next !== null) throw { message: next };
  };
  const backend = {
    ...moreBackend(gesture),
    readCrm: async (...args: unknown[]) => {
      calls.push(["readCrm", ...args]);
      return structuredClone(m.disk.crm);
    },
  };
  m.view = createFicheView({
    ...{ backend: backend as never, target: { kind, crm: "clients.md", name } },
    ...{
      confirm: async (q) => (m.questions.push(q), m.answer.value),
      error: (e) => m.errors.push(e),
    },
    openNote: (path) => void m.opened.push(path),
    hooks: {
      onOpenAction: (reference, crm) => void m.hooked.push(["onOpenAction", reference, crm]),
      onNewAction: (person, crm) => void m.hooked.push(["onNewAction", person, crm]),
    },
  });
  host.append(m.view.element);
  await m.view.reload();
  return m;
}
