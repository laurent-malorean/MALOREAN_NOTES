/** Relie le champ de recherche : chaque frappe donne tout le texte ; Échap le vide. */
export function connectSearchField(field: HTMLInputElement, onType: (query: string) => void): void {
  field.addEventListener("input", () => onType(field.value));
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    field.value = "";
    onType("");
  });
}
