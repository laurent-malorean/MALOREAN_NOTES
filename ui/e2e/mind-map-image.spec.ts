import { expect, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Image de la carte (carte de l'utilisateur : 3 niveaux, détails, couleurs) : chaque nœud affiché est dessiné dans l'image, et le cadre contient toute la carte.

const MAP =
  "---\ntype: carte-mentale\nracines: [{x: 27.9, y: 10.4}]\n---\n# toto\n\n- ffggfh\n  - test\n  - test 2\n    > - gdfd\n    > - fdgdds. Gdgfdgfgf\n    > - [ffdfd](http://www.fr)\n    - fffds\n    - dsdqsds\n      - ffsfddfs <!-- couleur: jaune -->\n  - dsfsd\n    - Fezfe\n  - Efzfefzefezef\n    > - fez fez\n    > 1. Fffe\n    > 1. fezfe\n  - sfsqffsqsqfsqfsqfsqsfqfsq <!-- couleur: rouge -->\n    - ffsdfdfds\n      - dffdsfd\n      - dffddfsdfsfdsfdsfddfsfds dfs fds. dfs fds\n        > - sfdfdsfdfsqd\n";

/** Dans la page : relit l'image et compte, pour chaque nœud, les points de sa zone qui diffèrent du fond. */
async function measure(p: string) {
  const nodes = [...document.querySelectorAll<HTMLElement>(".mind-map-node[data-path]")].map(
    (n) => ({
      text: (n.textContent ?? "").slice(0, 12),
      x: n.offsetLeft,
      y: n.offsetTop,
      w: n.offsetWidth,
      h: n.offsetHeight,
    }),
  );
  const bytes = window.backend.exportedImages[p] ?? new Uint8Array();
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context?.drawImage(bitmap, 0, 0);
  const data = context?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? [];
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const at = (px: number, py: number) => {
    const i = (py * bitmap.width + px) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
  };
  const ground = at(0, 0);
  // Un nœud est dessiné si sa zone (hors liens) porte autre chose que le fond : sa bordure.
  const drawn = nodes.map((n) => {
    const left = Math.round((n.x - minX + 40) * 2);
    const top = Math.round((n.y - minY + 40) * 2);
    let other = 0;
    for (let dy = 0; dy < n.h * 2; dy += 2) {
      for (let dx = 0; dx < n.w * 2; dx += 2) {
        const c = at(left + dx, top + dy);
        if (c.some((v, k) => Math.abs(v - (ground[k] ?? 0)) > 6)) other++;
      }
    }
    return { text: n.text, other };
  });
  const right = Math.max(...nodes.map((n) => n.x + n.w)) - minX + 80;
  const bottom = Math.max(...nodes.map((n) => n.y + n.h)) - minY + 80;
  return { width: bitmap.width / 2, height: bitmap.height / 2, right, bottom, drawn };
}

test("l'image montre chaque nœud, dans un cadre qui contient toute la carte", async ({ page }) => {
  const params = new URLSearchParams({
    notes: JSON.stringify({
      "courses.md": { content: "# Courses\n- lait", modified: 20 },
      "toto.md": { content: MAP, modified: 10 },
    }),
    remembered: "1",
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
  await page.locator(".note-item", { hasText: "toto" }).click();
  await expect(page.locator(".mind-map-node:not(.mind-map-probe)").first()).toBeVisible();
  await page.getByRole("button", { name: "Exporter en image" }).click();
  const path = "/Users/moi/Notes/toto.png";
  await expect
    .poll(() => page.evaluate((p) => window.backend.exportedImages[p]?.length ?? 0, path))
    .toBeGreaterThan(1000);
  const report = await page.evaluate(measure, path);
  expect(Math.abs(report.width - report.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(report.height - report.bottom)).toBeLessThanOrEqual(1);
  expect(report.drawn.length).toBe(13);
  expect(report.drawn.filter((node) => node.other < 20)).toEqual([]);
});
