#!/usr/bin/env bun
// How much of Meituan can meituan-cli actually order? Searches a spread of food types, counts app-only
// dishes per menu, then quotes orderable dishes one by one (checkout preview; nothing is ordered).
// It spends the shared request budget, so expect it to take over an hour.
//   bun scripts/scan.ts [out.json]
import { writeFileSync } from "node:fs";
import { priceCart } from "../src/cart";
import { type Ctx, openCtx } from "../src/meituan/context";
import { allItems, menu } from "../src/meituan/menu";
import { search } from "../src/meituan/search";
import { cutleryItem } from "../src/required";
import { Site } from "../src/site/site";
import type { Item, Menu } from "../src/types";

const KEYWORDS = [
  "轻食",
  "沙拉",
  "健康餐",
  "牛肉饭",
  "鸡胸肉",
  "拉面",
  "麻辣烫",
  "汉堡",
  "盖浇饭",
  "饺子",
  "寿司",
  "奶茶",
  "咖啡",
  "炒饭",
  "米线",
];
const SHOPS_PER_KEYWORD = 2;
const DISHES_PER_SHOP = 6;
const MAX_COUNT = 30;
const PRICE = /[\d.]+/u;
const REASON = /[。.!！]/u;
const PREFIX = /^Meituan rejected [^:]+: /u;

interface Shop {
  /** Dishes found to need the Meituan app. A lower bound when only part of the menu could be checked. */
  appOnly: number;
  complete: boolean;
  dishes: number;
  name: string;
}

interface Row {
  dish: string;
  error?: string;
  ok: boolean;
  shop: string;
}

/** Half the picks have option groups, since those are the dishes most likely to need extra choices. */
function pickDishes(m: Menu): Item[] {
  const items = allItems(m).filter(
    (i) => !(i.soldOut || i.appOnly) && i.price > 0 && i.category !== m.required
  );
  const rich = items.filter((i) => i.groups.some((g) => g.values.length > 1));
  const half = DISHES_PER_SHOP / 2;
  const picks = [
    ...rich.slice(0, half),
    ...items.filter((i) => !rich.includes(i)).slice(0, half),
  ];
  return [...picks, ...items.filter((i) => !picks.includes(i))].slice(
    0,
    DISHES_PER_SHOP
  );
}

/** What an agent does after reading the "requires one item from X" message: take the first one. Cutlery is automatic. */
function requiredPick(m: Menu): string[] {
  const category = m.categories.find((c) => c.name === m.required);
  if (!category || cutleryItem(category.items, 0)) {
    return [];
  }
  const first = category.items.find((i) => !i.soldOut)?.skus[0];
  return first ? [String(first.id)] : [];
}

async function quoteAlone(ctx: Ctx, m: Menu, dish: Item): Promise<Row> {
  const [sku] = dish.skus;
  const row = { dish: dish.name, ok: false, shop: m.name };
  if (!sku) {
    return { ...row, error: "no sku" };
  }
  // Enough of the dish to clear the shop's minimum order, so that rule never masks another.
  const minOrder = Number(m.minOrder.match(PRICE)?.[0] ?? 0);
  const count = Math.min(
    MAX_COUNT,
    Math.max(sku.min, Math.ceil(minOrder / Math.max(sku.price, 0.1)))
  );
  try {
    // The same path `meituan-cli quote` takes, so the scan measures what agents get.
    await priceCart(ctx, m.shop, [`${sku.id}x${count}`, ...requiredPick(m)], 0);
    return { ...row, ok: true };
  } catch (e) {
    return { ...row, error: (e as Error).message };
  }
}

async function findShops(ctx: Ctx): Promise<string[]> {
  const shops = new Set<string>();
  for (const keyword of KEYWORDS) {
    // biome-ignore lint/performance/noAwaitInLoops: one request at a time, to stay gentle with Meituan
    const { hits } = await search(ctx, keyword).catch(() => ({
      hits: [],
    }));
    for (const h of hits
      .filter((x) => x.open && !shops.has(x.shop))
      .slice(0, SHOPS_PER_KEYWORD)) {
      shops.add(h.shop);
    }
  }
  return [...shops];
}

/** The scan lives inside the same request budget as everything else, so it waits its turn instead of failing. */
process.env.MEITUAN_CLI_MAX_WAIT_MS = String(2 * 3_600_000);

async function scan(): Promise<{ rows: Row[]; shops: Shop[] }> {
  const site = await Site.open();
  const ctx = await openCtx(site);
  const rows: Row[] = [];
  const shops: Shop[] = [];
  for (const shop of await findShops(ctx)) {
    // biome-ignore lint/performance/noAwaitInLoops: one shop at a time, inside the shared request budget
    const m = await menu(ctx, shop, { fresh: true }).catch(() => undefined);
    if (m) {
      const all = allItems(m);
      shops.push({
        appOnly: all.filter((i) => i.appOnly).length,
        complete: m.appOnlyChecked,
        dishes: all.length,
        name: m.name,
      });
    }
    for (const dish of m ? pickDishes(m) : []) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time, to stay gentle with Meituan
      rows.push(await quoteAlone(ctx, m as Menu, dish));
    }
  }
  await site.close();
  return { rows, shops };
}

const { rows, shops } = await scan();
const [, , out] = process.argv;
if (out) {
  writeFileSync(out, JSON.stringify({ rows, shops }, null, 1));
}
const failed = rows.filter((r) => !r.ok);
const reasons = new Map<string, number>();
for (const r of failed) {
  const reason = (r.error ?? "").replace(PREFIX, "").split(REASON)[0] ?? "";
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
}
const appDishes = shops.reduce((n, s) => n + s.appOnly, 0);
const menuDishes = shops.reduce((n, s) => n + s.dishes, 0);
const partial = shops.filter((s) => !s.complete).length;
console.log(
  `app-only: ${appDishes} of ${menuDishes} dishes (${Math.round((100 * appDishes) / Math.max(menuDishes, 1))}%) in ${shops.filter((s) => s.appOnly).length} of ${shops.length} shops${partial ? `; a lower bound: ${partial} menus were only partly checkable` : ""}`
);
console.log(
  `orderable dishes quoted: ${rows.length} in ${new Set(rows.map((r) => r.shop)).size} shops, ${rows.length - failed.length} ok, ${failed.length} refused`
);
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${reason}`);
}
