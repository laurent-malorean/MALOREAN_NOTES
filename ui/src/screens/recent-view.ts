// Récentes à l'écran : l'entrée de la liste des dossiers qui montre les notes récentes.

/** Ce que l'utilisateur peut demander depuis l'entrée Récentes. */
export interface RecentActions {
  /** Montre les notes récentes dans la liste des notes. */
  readonly showRecent: () => void;
}

/** L'entrée Récentes, en évidence quand la liste montre les notes récentes ; un clic les demande. */
export function renderRecentEntry(
  button: HTMLButtonElement,
  shown: boolean,
  show: () => void,
): void {
  button.classList.toggle("selected", shown);
  button.onclick = show;
}
