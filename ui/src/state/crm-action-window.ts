// La fenêtre d'une action, sans écran (fiche 0062, spécification § 8) : les champs qu'elle montre,
// ce que devient un champ à chaque geste, le brouillon d'une action en cours de création, les e-mails
// à copier, l'avancement d'une liste à cocher, les adresses d'un commentaire. Les règles de fond
// (retard, nom unique, écriture) sont celles de Rust ; ici, seulement ce qu'il faut pour afficher.
import type { CrmActionChangeItem, CrmActionDraftItem, CrmActionItem, CrmItem } from "../bridge";
import type { ActionPersonItem } from "../bridge/generated/ActionPersonItem";
import type { ChecklistItem } from "../bridge/generated/ChecklistItem";
import type { CommentItem } from "../bridge/generated/CommentItem";

/** Les sept canaux, dans l'ordre des menus, tels qu'ils s'écrivent dans le fichier et à l'écran. */
export const CHANNELS = [
  "appel",
  "e-mail",
  "rendez-vous",
  "courrier",
  "salon",
  "réseau social",
  "autre",
] as const;

/** Ce qui sépare les e-mails copiés. */
export const PEOPLE_SEPARATOR = ", ";

/** Ce que la fenêtre montre d'une action : un champ par contrôle, la date `""` sans date. */
export interface ActionFields {
  readonly title: string;
  readonly status: string;
  readonly date: string;
  readonly channel: string | null;
  readonly project: string | null;
  readonly color: string | null;
  readonly tags: readonly string[];
  readonly linkedNotes: readonly string[];
  /** Les personnes, chacune avec son entreprise du moment où on l'a donnée à l'action. */
  readonly people: readonly ActionPersonItem[];
  readonly description: string;
}

/** Ce que l'ouverture d'une nouvelle action remplit d'avance. */
export interface Prefill {
  readonly title?: string;
  readonly status?: string | null;
  readonly date?: string | null;
  /** La référence d'une personne. */
  readonly person?: string;
}

const known = (crm: CrmItem, reference: string) => crm.people.some((p) => p.name === reference);

/** Les champs de l'action `action` ; une personne dont la fiche n'existe plus est laissée de côté (§ 4.1). */
export function fieldsOf(action: CrmActionItem, crm: CrmItem): ActionFields {
  return {
    ...{ title: action.title, status: action.status, date: action.date ?? "" },
    ...{ channel: action.channel, project: action.project, color: action.color },
    ...{ tags: action.tags, linkedNotes: action.linkedNotes, description: action.description },
    people: action.people.filter(({ person }) => known(crm, person)),
  };
}

/** L'entreprise du moment d'une personne du CRM. */
const companyOf = (crm: CrmItem, reference: string): string | null =>
  crm.people.find((p) => p.name === reference)?.company ?? null;

/** Les champs d'une nouvelle action : aujourd'hui et « TODO » sauf indication, la personne donnée si elle existe. */
export function blankFields(prefill: Prefill, crm: CrmItem): ActionFields {
  const person = prefill.person ?? "";
  return {
    ...{ title: prefill.title ?? "", status: prefill.status ?? "TODO" },
    ...{ date: prefill.date ?? crm.today, channel: null, project: null, color: null },
    ...{ tags: [], linkedNotes: [], description: "" },
    people: known(crm, person) ? [{ person, company: companyOf(crm, person) }] : [],
  };
}

/** Les champs de texte, de date et de choix d'une action après le geste ; `null` si le geste en change d'autres. */
function applyValue(fields: ActionFields, change: CrmActionChangeItem): ActionFields | null {
  if (change.kind === "title") return { ...fields, title: change.title };
  if (change.kind === "status") return { ...fields, status: change.status };
  if (change.kind === "date") return { ...fields, date: change.date };
  if (change.kind === "channel") return { ...fields, channel: change.channel };
  if (change.kind === "project") return { ...fields, project: change.project };
  if (change.kind === "color") return { ...fields, color: change.color };
  if (change.kind === "body" && change.change.kind === "description")
    return { ...fields, description: change.change.text };
  return null;
}

/** Les listes (étiquettes, notes liées, personnes) après le geste ; `null` si le geste en change d'autres. */
function applyList(
  fields: ActionFields,
  change: CrmActionChangeItem,
  crm: CrmItem,
): ActionFields | null {
  if (change.kind === "tags") return { ...fields, tags: change.tags };
  if (change.kind === "linkedNotes") return { ...fields, linkedNotes: change.notes };
  if (change.kind === "addPerson") return addedPerson(fields, change.person, crm);
  if (change.kind === "removePerson")
    return { ...fields, people: fields.people.filter((p) => p.person !== change.person) };
  return null;
}

/** Les champs après le geste `change` : ce que Rust écrirait, pour un brouillon qui n'a pas de fichier. Un geste sur une liste à cocher ou un commentaire ne change aucun champ. */
export function applyChange(
  fields: ActionFields,
  change: CrmActionChangeItem,
  crm: CrmItem,
): ActionFields {
  return applyValue(fields, change) ?? applyList(fields, change, crm) ?? fields;
}

function addedPerson(fields: ActionFields, person: string, crm: CrmItem): ActionFields {
  if (!known(crm, person) || fields.people.some((p) => p.person === person)) return fields;
  return { ...fields, people: [...fields.people, { person, company: companyOf(crm, person) }] };
}

/** Le brouillon envoyé à Rust : une date vide laisse Rust prendre aujourd'hui. */
export function draftOf(fields: ActionFields): CrmActionDraftItem {
  return {
    ...{ title: fields.title.trim(), status: fields.status },
    ...{ date: fields.date === "" ? null : fields.date },
    ...{ people: fields.people.map((p) => p.person), channel: fields.channel },
    ...{ project: fields.project, color: fields.color, tags: [...fields.tags] },
    ...{ linkedNotes: [...fields.linkedNotes], description: fields.description },
  };
}

/** Les e-mails des personnes qui en ont, séparés par « , » ; rien si aucune n'en a. */
export function emailsToCopy(people: readonly ActionPersonItem[], crm: CrmItem): string {
  return people
    .flatMap(({ person }) => {
      const email = crm.people.find((p) => p.name === person)?.email;
      return email === null || email === undefined || email === "" ? [] : [email];
    })
    .join(PEOPLE_SEPARATOR);
}

/** Le pourcentage d'éléments cochés d'une liste, arrondi ; zéro sans élément. */
export function progress(list: ChecklistItem): number {
  return list.items.length === 0 ? 0 : Math.round((list.done / list.items.length) * 100);
}

/** La question avant de supprimer une checklist : son nom et, s'il y en a, le nombre de ses éléments. */
export function removeChecklistQuestion(list: ChecklistItem): string {
  const count = list.items.length;
  const items = count === 0 ? "" : ` et ${String(count)} élément${count > 1 ? "s" : ""}`;
  return `Supprimer la checklist « ${list.name} »${items} ?`;
}

/** Le nombre de caractères d'un commentaire rappelé dans la question de suppression. */
const EXCERPT_LENGTH = 60;

/** La question avant de supprimer un commentaire : son moment et un extrait de son texte (sur une ligne, tronqué par « … »). */
export function removeCommentQuestion(comment: CommentItem): string {
  const text = comment.text.replace(/\s+/g, " ").trim();
  const excerpt =
    text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
  return `Supprimer le commentaire du ${comment.at} : « ${excerpt} » ?`;
}

/** Les commentaires du plus récent au plus ancien, chacun avec sa place dans l'ordre écrit (c'est elle que Rust attend). */
export function newestFirst(
  comments: readonly CommentItem[],
): { index: number; comment: CommentItem }[] {
  return comments.map((comment, index) => ({ index, comment })).reverse();
}

/** Un morceau d'un commentaire : du texte, ou une adresse internet avec le texte qui la montre. */
export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly url: string };

/** [texte](adresse), <adresse> ou adresse seule ; seules les adresses http et https. */
const ADDRESS =
  /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>]+)/g;
/** La ponctuation qui suit une adresse seule sans en faire partie. */
const TRAILING = /[.,;:!?)]+$/;

/** Un commentaire en morceaux : le texte, et chaque adresse reconnue en lien cliquable. */
export function segmentsOf(text: string): Segment[] {
  const segments: Segment[] = [];
  let from = 0;
  const pushText = (to: number) => {
    if (to > from) segments.push({ kind: "text", text: text.slice(from, to) });
  };
  for (const match of text.matchAll(ADDRESS)) {
    const [whole, label, labelled, angled, bare] = match;
    pushText(match.index);
    if (label !== undefined) {
      segments.push({ kind: "link", text: label, url: labelled as string });
      from = match.index + whole.length;
    } else if (angled !== undefined) {
      segments.push({ kind: "link", text: angled, url: angled });
      from = match.index + whole.length;
    } else {
      const url = (bare as string).replace(TRAILING, "");
      segments.push({ kind: "link", text: url, url });
      from = match.index + url.length;
    }
  }
  pushText(text.length);
  return segments;
}
