// Les points de branchement de la fenêtre d'une action (fiche 0063) : les listes et les fiches du
// CRM demandent à la fenêtre de l'ouvrir ou d'en créer une ; sans fenêtre branchée, elles ne font rien.

export interface ActionHooks {
  /** Ouvre la fenêtre de l'action `reference` du CRM `crm` (§ 8). */
  readonly onOpenAction: (reference: string, crm: string) => void;
  /** Ouvre la fenêtre d'une nouvelle action du CRM `crm`, la personne `person` déjà donnée (§ 9.2). */
  readonly onNewAction: (person: string, crm: string) => void;
}

/** Aucune fenêtre branchée : un clic ne fait rien. */
export const NO_HOOKS: ActionHooks = {
  onOpenAction: () => undefined,
  onNewAction: () => undefined,
};
