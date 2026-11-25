// CRM simulés pour les parcours (fiche 0060) : le fichier du CRM et ses fiches, comme Rust les
// écrit. Les vraies règles (ordre, retard, filtres, gestes sur le texte) sont testées côté Rust.
type Handler = (args: Record<string, string>) => unknown;

interface FakeNotes {
  notes: Record<string, { content: string; modified: number }>;
}

export interface CrmHelpers {
  freeName(folder: string, wanted: string): string;
  slug(title: string): string;
  tick(): number;
}

export function fakeCrms(state: FakeNotes, helpers: CrmHelpers): Record<string, Handler> {
  return {
    create_crm: ({ folder = "", title = "" }) => {
      const path = helpers.freeName(folder, helpers.slug(title));
      state.notes[path] = {
        content: `---\ntype: crm\n---\n# ${title.trim()}\n`,
        modified: helpers.tick(),
      };
      return { path };
    },
  };
}
