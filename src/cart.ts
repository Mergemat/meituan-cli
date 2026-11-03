import { appOnly } from "./cache";
import { AppOnlyError } from "./errors";
import { findItem, parseSpec, resolveLine } from "./items";
import { previewOrder } from "./meituan/checkout";
import type { Ctx } from "./meituan/context";
import { allItems, knownItems, menu } from "./meituan/menu";
import type { RawPreview } from "./meituan/raw";
import { withSkuOptions } from "./meituan/skus";
import { withRequired } from "./required";
import type { Item, Line, Menu, Quote } from "./types";

const PRICE = /[\d.]+/u;

export interface Pick {
  item: Item;
  line: Line;
}

export interface PricedCart {
  /** Dishes only the Meituan app can order, at menu price. */
  app: Pick[];
  /** Checkout for everything the site can order, required items included. Absent when nothing is. */
  exact?: { lines: Line[]; preview: RawPreview; quote: Quote };
  menu: Menu;
  picks: Pick[];
  /** Exact when `app` is empty; otherwise the exact part plus app-only dishes at menu price. */
  total: number;
}

const linePrice = ({ item, line }: Pick) =>
  (item.skus.find((k) => k.id === line.skuId)?.price ?? item.price) *
  line.count;

const round = (n: number) => Math.round(n * 100) / 100;

async function checkout(ctx: Ctx, m: Menu, lines: Line[], cutlery?: number) {
  const full = withRequired(m, lines, cutlery);
  const r = await previewOrder(ctx, m.shop, full);
  return { ...r, lines: full };
}

const inRequired = (m: Menu, p: Pick) =>
  m.categories.some(
    (c) => c.name === m.required && c.items.some((i) => i.spu === p.item.spu)
  );

/** Enough of a dish to clear the shop's minimum order, so that rule never hides the one being probed. */
function probeLine(m: Menu, { item, line }: Pick): Line {
  const minOrder = Number(m.minOrder.match(PRICE)?.[0] ?? 0);
  const price = Math.max(item.price, 0.1);
  return { ...line, count: Math.max(line.count, Math.ceil(minOrder / price)) };
}

/** Meituan names no dish when it refuses; quote each alone to find the app-only ones, then remember them. */
async function learnAppOnly(
  ctx: Ctx,
  m: Menu,
  picks: Pick[],
  cutlery?: number
) {
  const found: number[] = [];
  // The shop's required item goes along with every probe, or the probe fails for the wrong reason.
  const required = picks.filter((p) => inRequired(m, p));
  const dishes = picks.filter((p) => !inRequired(m, p));
  if (dishes.length === 1 && dishes[0]) {
    found.push(dishes[0].item.spu);
  } else {
    for (const p of dishes) {
      const lines = [probeLine(m, p), ...required.map((r) => r.line)];
      // biome-ignore lint/performance/noAwaitInLoops: one probe at a time, to stay gentle with Meituan
      await checkout(ctx, m, lines, cutlery).catch((e) => {
        if (e instanceof AppOnlyError) {
          found.push(p.item.spu);
        }
      });
    }
  }
  appOnly.add(m.shop, found);
  return found.length > 0;
}

/**
 * Prices a cart. Dishes the site can order get Meituan's real checkout; app-only dishes (known, or
 * discovered now) are added at menu price, so they stay comparable even though only the app can order them.
 */
export async function priceCart(
  ctx: Ctx,
  shop: string,
  specs: string[],
  cutlery: number | undefined
): Promise<PricedCart> {
  const m = await menu(ctx, shop);
  const items = knownItems(m);
  const listed = new Set(allItems(m).map((i) => i.spu));
  const picks = await Promise.all(
    specs.map(async (s) => {
      const spec = parseSpec(s);
      const known = findItem(items, spec.sku).item;
      // A complete menu lists everything the site can order, so a dish only search knows needs the app.
      const needsApp = known.appOnly || !(m.unlisted || listed.has(known.spu));
      const item = await withSkuOptions(ctx, shop, {
        ...known,
        appOnly: needsApp,
      });
      return { item, line: resolveLine([item], spec) };
    })
  );
  const split = () => {
    const learned = appOnly.get(shop);
    const needsApp = (p: Pick) => p.item.appOnly || learned.has(p.item.spu);
    const app = picks.filter(needsApp);
    const site = picks.filter((p) => !needsApp(p));
    // The shop's required item alone is no order: it goes to the app with the dishes.
    if (app.length && site.every((p) => inRequired(m, p))) {
      return { app: picks, site: [] };
    }
    return { app, site };
  };
  const price = async (): Promise<PricedCart> => {
    const { app, site } = split();
    const exact = site.length
      ? await checkout(
          ctx,
          m,
          site.map((p) => p.line),
          cutlery
        )
      : undefined;
    const fee = Number(m.deliveryFee.match(PRICE)?.[0] ?? 0);
    const appTotal = app.reduce((sum, p) => sum + linePrice(p), 0);
    return {
      app,
      exact,
      menu: m,
      picks,
      total: round((exact?.quote.total ?? fee) + appTotal),
    };
  };
  try {
    return await price();
  } catch (e) {
    // First refusal for an app-only dish: find it, remember it, and price the rest once more.
    if (
      e instanceof AppOnlyError &&
      (await learnAppOnly(ctx, m, split().site, cutlery))
    ) {
      return price();
    }
    throw e;
  }
}
