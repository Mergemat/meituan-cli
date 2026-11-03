// A contact sheet: several product photos in one labelled image. Facts such as protein grams or
// portion sizes are often only printed on the photo, and one image is far cheaper for an agent to
// look at than one per product.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paths, writeAtomic } from "./config";
import { yuan } from "./format";
import type { Site } from "./site/site";
import type { Item } from "./types";

/** Six tiles keep each photo large enough to read the print on a label. */
const PER_SHEET = 6;
const TILE = 360;
const COLUMNS = 3;
const MIME: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface SheetEntry {
  item: Item;
  pic: string;
  shop: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/gu, (c) => `&#${c.charCodeAt(0)};`);

function dataUri(path: string) {
  const ext = path.split(".").at(-1) ?? "jpg";
  return `data:${MIME[ext] ?? "image/jpeg"};base64,${readFileSync(path).toString("base64")}`;
}

const tile = ({ item, pic }: SheetEntry) => `<figure>
  ${pic ? `<img src="${dataUri(pic)}">` : "<div class=none>no photo</div>"}
  <figcaption><b>${item.skus[0]?.id ?? ""}</b> ${yuan(item.price)}<br>${escapeHtml(item.name)}</figcaption>
</figure>`;

const page = (entries: SheetEntry[]) => `<!doctype html><meta charset=utf-8>
<style>
  body { margin: 0; background: #fff; font: 15px/1.3 -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  main { display: grid; grid-template-columns: repeat(${COLUMNS}, ${TILE}px); gap: 8px; padding: 8px; }
  figure { margin: 0; }
  img, .none { width: ${TILE}px; height: ${TILE}px; object-fit: contain; background: #f4f4f4; display: block; }
  .none { display: grid; place-items: center; color: #888; }
  figcaption { height: 3.9em; overflow: hidden; padding-top: 4px; }
</style><main>${entries.map(tile).join("")}</main>`;

/** Renders the photos into sheets of six and returns their paths, in the order of `entries`. */
export async function contactSheets(
  site: Site,
  entries: SheetEntry[]
): Promise<string[]> {
  const sheets: string[] = [];
  for (let i = 0; i < entries.length; i += PER_SHEET) {
    const chunk = entries.slice(i, i + PER_SHEET);
    const name = createHash("sha1")
      .update(chunk.map((e) => `${e.shop}:${e.item.spu}`).join(","))
      .digest("hex")
      .slice(0, 12);
    const path = join(paths.images, `sheet-${name}.jpg`);
    // biome-ignore lint/performance/noAwaitInLoops: one browser tab renders one sheet at a time
    writeAtomic(path, await site.render(page(chunk), COLUMNS * (TILE + 8) + 8));
    sheets.push(path);
  }
  return sheets;
}
