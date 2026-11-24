// Aide des tests : la valeur attendue, ou un échec clair si elle manque (à la place d'une assertion `!`).
export function defined<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("valeur attendue, trouvée absente");
  return value;
}
