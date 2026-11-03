import { found, searchCache } from "../cache";
import { state } from "../config";
import { UserError } from "../errors";
import type { Ctx } from "../meituan/context";
import { foundItem, search as searchShops } from "../meituan/search";
import { relevant, searchView } from "../search-view";
import type { ShopHit } from "../types";
import type { Args, Command } from "./command";

/** Result lines worth comparing. One page can collapse to a few lines (57 branches of one chain), so more pages may follow. */
const ENOUGH_LINES = 20;
const MAX_PAGES = 3;
const FEW_LINES = 4;
const MAX_KEYWORDS = 5;
const KEYWORD_SEPARATOR = /[,，]/u;
const USAGE = "search <keyword>[,<keyword>...] [--stores|--restaurants]";

function wantedKind(opts: Args["opts"]) {
  if (opts.stores) {
    return "store";
  }
  return opts.restaurants ? "restaurant" : undefined;
}

export const search: Command = {
  detail: [
    "Keywords are Chinese dish, product or shop names (奶茶, 牛肉饭, 蛋白饮, 沙拉). Results follow Meituan's ranking.",
    "Restaurants: one line per shop with its matching dishes. Store products (supermarkets, convenience stores): one line per product at its cheapest store, so the text can be filtered with grep (| grep -v 燕麦) instead of parsing --json.",
    "A deal price shows its regular price too: deals are often limited to one per order, so quote before comparing.",
    "Every <sku> shown works in item, quote and order with its <shop>. To see more of one store: meituan-cli menu <shop> <word>.",
    "--stores or --restaurants shows one kind only.",
    "Several keywords in one call, comma-separated (乳清蛋白饮,液体蛋白,高蛋白饮料): results are merged and each product shown once. Prefer this to separate searches; repeating a search within 10 minutes costs nothing.",
  ].join("\n"),
  name: "search",
  async run({ pos, opts }, open) {
    const keywords = pos
      .join(" ")
      .split(KEYWORD_SEPARATOR)
      .map((k) => k.trim())
      .filter(Boolean);
    if (!keywords.length) {
      throw new UserError(`usage: meituan-cli ${USAGE}`);
    }
    if (keywords.length > MAX_KEYWORDS) {
      throw new UserError(
        `At most ${MAX_KEYWORDS} keywords per search (Meituan blocks search when it is hammered).`
      );
    }
    let ctx: Ctx | undefined;
    // Keyed by address too: results depend on where the user is.
    const where = state.read().addressId ?? "default";
    const page = async (keyword: string, n: number) => {
      const key = `${where}-${keyword}-${n}`;
      const cached = searchCache.get(key);
      if (cached) {
        return cached;
      }
      ctx ??= await open();
      const fresh = await searchShops(ctx, keyword, n);
      searchCache.put(key, fresh);
      return fresh;
    };
    const kind = wantedKind(opts);
    const ofKind = (list: ShopHit[]) =>
      kind ? list.filter((h) => h.kind === kind) : list;
    const byShop = new Map<string, ShopHit>();
    const add = (hits: ShopHit[]) => {
      for (const h of hits) {
        const seen = byShop.get(h.shop);
        if (seen) {
          const skus = new Set(seen.items.map((i) => i.sku));
          seen.items.push(...h.items.filter((i) => !skus.has(i.sku)));
        } else {
          byShop.set(h.shop, { ...h, items: [...h.items] });
        }
      }
    };
    // Several keywords already widen the net, so each gets one page; a single keyword may page on.
    const pages = keywords.length > 1 ? 1 : MAX_PAGES;
    for (const keyword of keywords) {
      for (let n = 0; n < pages; n += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: pages are only fetched while the results are thin
        const { hits, more } = await page(keyword, n);
        add(hits);
        if (
          !more ||
          searchView(ofKind([...byShop.values()])).size >= ENOUGH_LINES
        ) {
          break;
        }
      }
    }
    const all = [...byShop.values()];
    for (const h of all) {
      found.add(h.shop, h.items.map(foundItem));
    }
    let padding = 0;
    for (const h of all.filter((s) => s.kind === "store")) {
      const before = h.items.length;
      h.items = h.items.filter((i) => relevant(i.name, keywords));
      padding += before - h.items.length;
    }
    const shown = ofKind(all).filter(
      (h) => h.items.length || h.kind === "restaurant"
    );
    const view = searchView(shown);
    return {
      data: shown,
      text: [
        view.text,
        padding > 0 &&
          `(${padding} unrelated products Meituan added to store results were left out)`,
        view.size < FEW_LINES && "(few matches; a broader word finds more)",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
  summary:
    "restaurants (with matching dishes) and store products near you, each with ids to quote",
  usage: USAGE,
};
