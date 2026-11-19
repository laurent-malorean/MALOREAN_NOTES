// Assistant d'écriture simulé pour les parcours : il « corrige » toujours de la même façon,
// reformule et résume par une phrase fixe ; `assistant=unavailable` dans l'adresse le rend
// indisponible, comme sur un Mac sans Apple Intelligence.
import type { AssistantStatus, DifferenceItem, ProposalItem } from "../src/bridge";

type Handler = (args: Record<string, unknown>) => unknown;

/** La partie de la doublure qui tient l'assistant d'écriture. */
export interface FakeWriting {
  /** Ce que l'assistant dit de lui-même. */
  assistant: AssistantStatus;
  /** Chaque demande reçue : l'action, puis la sélection. */
  rewritings: [string, string][];
}

export const UNAVAILABLE =
  "Apple Intelligence n'est pas activé : Réglages Système, « Apple Intelligence et Siri »";

export function fakeWritingState(params: URLSearchParams): FakeWriting {
  return {
    assistant:
      params.get("assistant") === "unavailable"
        ? { kind: "unavailable", reason: UNAVAILABLE }
        : { kind: "available" },
    rewritings: [],
  };
}

const CORRECTIONS: Record<string, string> = {
  fote: "faute",
  sont: "sont",
  enregistrer: "enregistrées",
};

function proposed(action: string, selection: string): string {
  if (action === "rephrase") return "Autrement dit, tout est rangé.";
  if (action === "summarize") return "En bref : rangé.";
  return selection.replace(/\p{L}+/gu, (word) => CORRECTIONS[word] ?? word);
}

/** Mot à mot quand les deux textes ont autant de mots, sinon tout remplacé : assez pour les parcours. */
function differences(old: string, proposal: string): DifferenceItem[] {
  const before = old.split(/(\s+)/);
  const after = proposal.split(/(\s+)/);
  if (before.length !== after.length)
    return [
      { kind: "removed", text: old },
      { kind: "added", text: proposal },
    ];
  return before.flatMap((word, index): DifferenceItem[] => {
    const next = after[index] ?? "";
    return word === next
      ? [{ kind: "same", text: word }]
      : [
          { kind: "removed", text: word },
          { kind: "added", text: next },
        ];
  });
}

export function fakeWriting(state: FakeWriting): Record<string, Handler> {
  return {
    assistant_status: () => state.assistant,
    propose_rewriting: ({ action, selection }): ProposalItem => {
      if (state.assistant.kind === "unavailable") throw { message: state.assistant.reason };
      state.rewritings.push([action as string, selection as string]);
      const text = proposed(action as string, selection as string);
      return { text, differences: differences(selection as string, text) };
    },
  };
}
