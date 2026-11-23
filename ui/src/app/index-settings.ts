// Réglages de l'index de mots, côté application : l'état que Rust en donne, et sa reconstruction.
import type * as Bridge from "../bridge";
import { indexSettingsGroup, renderIndexSettings } from "../screens/index-settings";
import { indexStatusLines } from "../state/index-status";
import type { Messages } from "./messages";

export interface IndexSettingsDeps extends Pick<Messages, "run"> {
  readonly backend: Pick<typeof Bridge, "indexOverview">;
}

/**
 * La partie « Index » de l'écran de réglages, dessinée aussitôt puis remplie de l'état lu ;
 * `rebuild` reconstruit l'index, et l'état est relu après.
 */
export function indexSettings(
  deps: IndexSettingsDeps,
  rebuild: () => Promise<void>,
): HTMLElement[] {
  const frame = indexSettingsGroup();
  const draw = (lines: string[] | null) => renderIndexSettings(frame, lines, again);
  const read = async () => draw(indexStatusLines(await deps.backend.indexOverview()));
  const again = () => deps.run(rebuild().then(read));
  draw(null);
  deps.run(read());
  return [frame];
}
