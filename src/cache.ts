import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths, writeAtomic } from "./config";
import type { Menu } from "./types";

const MENU_TTL_MS = 10 * 60_000;
const IMAGE_EXT = /\.(?<ext>png|jpe?g|webp|gif)(?:\?|$)/iu;
const HTTP = /^http:/u;

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

/** Downloads a picture once and returns its local path, so agents can open it. Empty string if unavailable. */
export async function image(url: string, name: string): Promise<string> {
  if (!url) {
    return "";
  }
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
