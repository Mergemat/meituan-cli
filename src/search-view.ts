// Search results for agents looking for something to eat or buy. Restaurants are told apart by their
// own dishes, so they stay one line per shop. Store goods are the same product wherever they are sold,
// so stores are flattened into one line per product, each product once, at its cheapest store.

import { squash, yuan } from "./format";
import type { ShopHit } from "./types";

const BRANCH = /[（(][^）)]*[）)]\s*$/u;
const LATIN_WORD = /[a-z0-9]+/gu;

/** A chain's name without its branch: 盒马鲜生代购（PAC购物中心） → 盒马鲜生代购. */
const chain = (name: string) => name.replace(BRANCH, "").trim();

const shopInfo = (h: ShopHit) =>
  [
    h.open ? "" : `[${h.status || "closed"}]`,
    h.eta,
    h.distance,
    squash(h.minOrder),
    squash(h.deliveryFee),
  ]
    .filter(Boolean)
    .join(" ");

/** One line per restaurant chain (its best-ranked branch), with every dish search matched there. */
function restaurants(hits: ShopHit[]) {
  const best = new Map<string, { branches: number; hit: ShopHit }>();
  for (const h of hits) {
    const seen = best.get(chain(h.name));
    if (seen) {
      seen.branches += 1;
    } else {
      best.set(chain(h.name), { branches: 0, hit: h });
    }
  }
  return [...best.values()].map(({ branches, hit: h }) =>
    [
      h.shop,
      h.name,
      `★${h.score}`,
      shopInfo(h),
      branches ? `(+${branches} branches)` : "",
      "|",
      h.items.map((i) => `${i.sku} ${i.name} ${yuan(i.price)}`).join("; "),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

const price = (i: ShopHit["items"][number]) =>
  i.was ? `${yuan(i.price)} (deal, regular ${yuan(i.was)})` : yuan(i.price);

/**
 * One self-contained line per product, at the cheapest store selling it: an agent can grep the output
 * (| grep -v 燕麦) instead of parsing JSON, and quote straight from the line.
 */
function products(hits: ShopHit[]) {
  const best = new Map<
    string,
    { hit: ShopHit; item: ShopHit["items"][number]; stores: Set<string> }
  >();
  for (const h of hits) {
    for (const i of h.items) {
      const key = squash(i.name);
      const seen = best.get(key);
      if (!seen) {
        best.set(key, { hit: h, item: i, stores: new Set([h.shop]) });
        continue;
      }
      seen.stores.add(h.shop);
      if (i.price < seen.item.price) {
        seen.hit = h;
        seen.item = i;
      }
    }
  }
  return [...best.values()].map(({ hit: h, item: i, stores }) =>
    [
      i.sku,
      price(i),
      i.name,
      "@",
      h.shop,
      h.name,
      shopInfo(h),
      stores.size > 1 ? `(cheapest of ${stores.size} stores)` : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/** Pieces of a keyword a matching name must contain: Chinese character pairs, whole Latin words. */
function pieces(keyword: string): string[] {
  const k = squash(keyword).toLowerCase();
  const words = k.match(LATIN_WORD) ?? [];
  const han = k.replace(LATIN_WORD, " ");
  const pairs: string[] = [];
  for (const run of han.split(" ").filter(Boolean)) {
    if (run.length === 1) {
      pairs.push(run);
    }
    for (let i = 0; i + 1 < run.length; i += 1) {
      pairs.push(run.slice(i, i + 2));
    }
  }
  return [...words, ...pairs];
}

/**
 * Whether a product name answers any of the keywords. Meituan pads a store's matches with its other
 * goods (a search for 迈胜 brings back cushions and dog food), and nothing in the data tells them apart.
 */
export function relevant(name: string, keywords: string[]): boolean {
  const n = squash(name).toLowerCase();
  return keywords.some((k) => pieces(k).some((p) => n.includes(p)));
}

export interface SearchView {
  /** Lines of results, to judge whether another page is worth reading. */
  size: number;
  text: string;
}

export function searchView(hits: ShopHit[]): SearchView {
  const r = restaurants(hits.filter((h) => h.kind === "restaurant"));
  const p = products(hits.filter((h) => h.kind === "store"));
  const text = [
    r.length &&
      "## Restaurants: <shop> name ★ eta distance 起送 配送 | <sku> dish ¥price; ...",
    ...r,
    p.length &&
      "## Store products, one per line at the cheapest store: <sku> ¥price name @ <shop> store eta distance 起送 配送",
    ...p,
  ].filter((l): l is string => typeof l === "string");
  return { size: r.length + p.length, text: text.join("\n") || "No results." };
}
