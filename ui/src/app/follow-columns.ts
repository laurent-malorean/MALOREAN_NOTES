// Ce qui suit un changement des colonnes : l'éditeur machine à écrire, la disposition retenue, les notes
// récentes, le menu, la barre de mise en forme et la colonne Claude Code.
import type { Columns } from "../state/columns";

export interface ColumnFollowers {
  readonly writing: { showTypewriter(): void };
  readonly layoutMemory: { save(columns: Columns): void };
  readonly recent: { visited(columns: Columns): void };
  readonly menu: { follow(columns: Columns): void };
  readonly formatBar: { follow(columns: Columns): void };
  readonly claude: { follow(): void };
}

/** Les colonnes ont changé : chacun prend l'état `now`. */
export function followColumns(now: Columns, followers: ColumnFollowers): void {
  followers.writing.showTypewriter();
  followers.layoutMemory.save(now);
  followers.recent.visited(now);
  followers.menu.follow(now);
  followers.formatBar.follow(now);
  followers.claude.follow();
}
