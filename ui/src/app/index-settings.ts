// Réglages de l'index de mots, côté application : l'état que Rust en donne, sa barre et sa reconstruction.
import type * as Bridge from "../bridge";
import type { IndexOverviewItem } from "../bridge/generated/IndexOverviewItem";
import { indexSettingsGroup, renderIndexSettings } from "../screens/index-settings";
import { indexBarView, indexStatusLines } from "../state/index-status";
import type { Messages } from "./messages";

export interface IndexSettingsDeps extends Pick<Messages, "run"> {
  readonly backend: Pick<typeof Bridge, "indexOverview">;
}

/** Le temps entre deux lectures de l'état pendant une reconstruction, en millisecondes. */
const FOLLOW_MS = 500;

/**
 * La partie « Index » de l'écran de réglages, dessinée aussitôt puis remplie de l'état lu ;
 * `rebuild` reconstruit l'index : l'état est relu pendant, pour que la barre avance, et après.
 */
export function indexSettings(
  deps: IndexSettingsDeps,
  rebuild: () => Promise<void>,
): HTMLElement[] {
  const frame = indexSettingsGroup();
  let latest = 0;
  const draw = (overview: IndexOverviewItem | null) =>
    renderIndexSettings(
      frame,
      overview && indexStatusLines(overview),
      again,
      overview && indexBarView(overview),
    );
  // Une lecture lente, rendue après une plus récente, ne redessine pas un état périmé.
  const read = async () => {
    const mine = ++latest;
    const overview = await deps.backend.indexOverview();
    if (mine === latest) draw(overview);
  };
  const following = async () => {
    const timer = setInterval(() => deps.run(read()), FOLLOW_MS);
    try {
      await rebuild();
    } finally {
      clearInterval(timer);
      await read();
    }
  };
  const again = () => deps.run(following());
  draw(null);
  deps.run(read());
  return [frame];
}
