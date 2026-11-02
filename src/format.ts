// Text renderers. Output is read by agents, so every token should carry information:
// one line per thing, ids first, no decoration, no pictures unless asked.

import type { Pick, PricedCart } from "./cart";
import { describeGroups } from "./items";
import { allItems } from "./meituan/menu";
import type { Address, Item, Menu, Order, Quote, ShopHit } from "./types";

export const yuan = (n: number) => `¥${Math.round(n * 100) / 100}`;
const SPACE = /\s/gu;
const NEWLINES = /\s*\n\s*/gu;
/** Matching items shown per shop in search; the menu has the rest. */
const SEARCH_ITEMS = 3;
const SAME_OPTIONS = "same options as above";
const squash = (s: string) => s.replace(SPACE, "");

export const renderAddresses = (list: Address[], active?: number) =>
  list
    .map((a) => `${a.id === active ? "*" : " "} ${a.id} ${a.place} ${a.room}`)
    .join("\n");

export const renderShops = (hits: ShopHit[]) =>
  hits.length
    ? hits
        .map((p) =>
          [
            p.shop,
            p.name,
            p.open ? "" : `[${p.status || "closed"}]`,
            `★${p.score}`,
            p.eta,
            p.distance,
            squash(p.minOrder),
            squash(p.deliveryFee),
            "|",
            p.items
              .slice(0, SEARCH_ITEMS)
              .map((i) => `${i.name}${yuan(i.price)}`)
              .join(" "),
          ]
            .filter(Boolean)
            .join(" ")
        )
        .join("\n")
    : "No results.";

/** One id per item: the cheapest sku. Options pick the rest, so combos need not be listed. */
function menuEntry(i: Item) {
  const prices = i.skus.map((k) => k.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const cheapest = i.skus.find((k) => k.price === low) ?? i.skus[0];
  const range = low === high ? yuan(low) : `${yuan(low)}-${high}`;
  const min = cheapest && cheapest.min > 1 ? ` (min ${cheapest.min})` : "";
  return `${cheapest?.id} ${range}${min}`;
}

/** One category's lines. Items in a category usually share option groups; spell them out once. */
function categoryLines(name: string, items: Item[], appOnly: Set<number>) {
  const lines = [`## ${name}`];
  let previous = "";
  for (const i of items) {
    const opts = describeGroups(i.groups);
    const shown = opts && opts === previous ? SAME_OPTIONS : opts;
    previous = opts;
    const app = i.appOnly || appOnly.has(i.spu) ? " [app]" : "";
    lines.push(
      `${i.name}${app} — ${menuEntry(i)}${shown ? ` — ${shown}` : ""}`
    );
  }
  return lines;
}

export function renderMenu(m: Menu, filter = "", appOnly = new Set<number>()) {
  const lines = [
    `${m.name} ${squash(m.minOrder)} ${squash(m.deliveryFee)} ${m.eta}`,
  ];
  if (m.required) {
    lines.push(`Every order must include one item from "${m.required}".`);
  }
  const matches = (i: Item) =>
    !filter || i.name.includes(filter) || i.desc.includes(filter);
  let soldOut = 0;
  for (const c of m.categories) {
    const matching = c.items.filter(matches);
    const items = matching.filter((i) => !i.soldOut);
    soldOut += matching.length - items.length;
    if (items.length) {
      lines.push(...categoryLines(c.name, items, appOnly));
    }
  }
  const notes = [
    allItems(m).some((i) => i.appOnly || appOnly.has(i.spu)) &&
      "[app] = only orderable in the Meituan app (needs add-ons the site cannot choose)",
    !m.appOnlyChecked &&
      "(could not check for app-only dishes right now; everything listed can be ordered)",
    soldOut && `(${soldOut} sold-out items hidden)`,
    lines.length === 1 &&
      (filter ? `Nothing matches "${filter}".` : "Empty menu."),
  ];
  return [
    ...lines,
    ...notes.filter((n): n is string => typeof n === "string"),
  ].join("\n");
}

export const renderItem = (i: Item, pic: string) =>
  [
    `${i.name} [${i.category}]${i.soldOut ? " [售罄]" : ""} ${i.sold} 赞${i.likes}`,
    `sku: ${menuEntry(i)}`,
    describeGroups(i.groups) && `options: ${describeGroups(i.groups)}`,
    i.desc && `desc: ${i.desc.replace(NEWLINES, " / ")}`,
    pic && `pic: ${pic}`,
  ]
    .filter(Boolean)
    .join("\n");

export function renderQuote(q: Quote) {
  return [
    `${q.name} → ${q.deliverTo}`,
    ...q.lines.map(
      (l) => `${l.count}× ${l.name} ${l.options} ${yuan(l.price)}`
    ),
    `包装${yuan(q.packaging)} 配送${yuan(q.delivery)} 总计${yuan(q.total)}${q.discount ? ` (already ${yuan(q.discount)} off)` : ""} · ${q.eta}`,
    ...q.warnings.map((w) => `! ${w}`),
  ].join("\n");
}

export const renderOrders = (list: Order[]) =>
  list
    .map(
      (o) =>
        `${o.id} ${o.time} ${o.status} ${yuan(o.total)} ${o.shop} | ${o.items.join(" ")}`
    )
    .join("\n") || "No orders.";

/** A cart line as the user would rebuild it in the app: name, chosen options, count. */
export function describePick({ item, line }: Pick) {
  const chosen = item.groups
    .filter((g) => g.values.length > 1)
    .map((g) => g.values.find((v) => line.attr_ids.includes(v.id))?.short)
    .filter(Boolean);
  return `${item.name}${chosen.length ? ` (${chosen.join(", ")})` : ""} x${line.count}`;
}

export function renderCart(cart: PricedCart) {
  const lines = cart.exact ? [renderQuote(cart.exact.quote)] : [cart.menu.name];
  if (!cart.app.length) {
    return lines.join("\n");
  }
  for (const p of cart.app) {
    const price =
      (p.item.skus.find((k) => k.id === p.line.skuId)?.price ?? p.item.price) *
      p.line.count;
    lines.push(`${describePick(p)} ${yuan(price)} [app: menu price]`);
  }
  lines.push(
    `≈ 总计${yuan(cart.total)} estimate: ${cart.app.length} dish(es) can only be ordered in the Meituan app, so fees and discounts for them are not exact`
  );
  return lines.join("\n");
}
