import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths, writeAtomic } from "./config";
import type { Item, Menu, ShopHit } from "./types";

const MENU_TTL_MS = 10 * 60_000;
const FOUND_TTL_MS = 24 * 3_600_000;
const SEARCH_TTL_MS = 10 * 60_000;
const UNSAFE_FILENAME = /[^\p{L}\p{N}_-]/gu;
const IMAGE_EXT = /\.(?<ext>png|jpe?g|webp|gif)(?:\?|$)/iu;
const HTTP = /^http:/u;
const CDN_SUFFIX = /(?<=\.(?:jpe?g|png))(?:\.webp|@[^/]*)+$/iu;

/** Menus back sku lookups for item/quote/order. Prices always come fresh from checkout, so a short-lived cache is safe. */
export const menuCache = {
  get(shop: string): Menu | undefined {
    const p = join(paths.menus, `${shop}.json`);
    if (!existsSync(p)) {
      return;
    }
    const { at, menu } = JSON.parse(readFileSync(p, "utf8")) as {
      at: number;
      menu: Menu;
    };
    return Date.now() - at < MENU_TTL_MS ? menu : undefined;
  },
  put(menu: Menu) {
    writeAtomic(
      join(paths.menus, `${menu.shop}.json`),
      JSON.stringify({ at: Date.now(), menu })
    );
  },
};

const readFound = (shop: string): { at: number; items: Item[] } => {
  const p = join(paths.found, `${shop}.json`);
  return existsSync(p)
    ? JSON.parse(readFileSync(p, "utf8"))
    : { at: 0, items: [] };
};

/**
 * Items seen in search results. A grocery store's menu can miss most of its products, but search
 * names them with their skus, and checkout takes a sku alone. Prices come fresh from checkout, so a day is fine.
 */
export const found = {
  add(shop: string, items: Item[]) {
    const old = readFound(shop);
    const fresh = Date.now() - old.at < FOUND_TTL_MS ? old.items : [];
    const ids = new Set(items.map((i) => i.spu));
    writeAtomic(
      join(paths.found, `${shop}.json`),
      JSON.stringify({
        at: Date.now(),
        items: [...fresh.filter((i) => !ids.has(i.spu)), ...items],
      })
    );
  },
  get(shop: string): Item[] {
    const f = readFound(shop);
    return Date.now() - f.at < FOUND_TTL_MS ? f.items : [];
  },
};

interface SearchPage {
  hits: ShopHit[];
  more: boolean;
}

const searchFile = (key: string) =>
  join(paths.searches, `${key.replace(UNSAFE_FILENAME, "_")}.json`);

/**
 * Search pages for a few minutes. Agents repeat searches (once as text, once with --json), and Meituan
 * blocks search sooner than anything else, so a repeat should cost nothing.
 */
export const searchCache = {
  get(key: string): SearchPage | undefined {
    const p = searchFile(key);
    if (!existsSync(p)) {
      return;
    }
    const { at, page } = JSON.parse(readFileSync(p, "utf8")) as {
      at: number;
      page: SearchPage;
    };
    return Date.now() - at < SEARCH_TTL_MS ? page : undefined;
  },
  put(key: string, page: SearchPage) {
    writeAtomic(searchFile(key), JSON.stringify({ at: Date.now(), page }));
  },
};

/** Downloads a picture once and returns its local path, so agents can open it. Empty string if unavailable. */
export async function image(raw: string, name: string): Promise<string> {
  if (!raw) {
    return "";
  }
  // Meituan's image server sizes and converts by suffix ("x.jpg.webp", "x.png@150w_150h_1e_1c");
  // without one it serves the original, which is sharp enough to read a label.
  const url = raw.replace(CDN_SUFFIX, "");
  const ext = url.match(IMAGE_EXT)?.groups?.ext ?? "jpg";
  const p = join(paths.images, `${name}.${ext}`);
  if (existsSync(p)) {
    return p;
  }
  const res = await fetch(url.replace(HTTP, "https:")).catch(() => undefined);
  if (!res?.ok) {
    return "";
  }
  writeAtomic(p, new Uint8Array(await res.arrayBuffer()));
  return p;
}

const readAppOnly = (): Record<string, number[]> =>
  existsSync(paths.appOnly)
    ? JSON.parse(readFileSync(paths.appOnly, "utf8"))
    : {};

/**
 * Dishes Meituan refused because they need add-ons only its app can choose. Its menu data does not flag
 * them, so they are learned at checkout and remembered, letting menus mark them before anyone picks one.
 */
export const appOnly = {
  add(shop: string, spus: number[]) {
    const all = readAppOnly();
    all[shop] = [...new Set([...(all[shop] ?? []), ...spus])];
    writeAtomic(paths.appOnly, JSON.stringify(all));
  },
  get: (shop: string) => new Set(readAppOnly()[shop] ?? []),
};
