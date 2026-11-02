import { UserError } from "./errors";
import { parseSpec, resolveLine } from "./items";
import type { Item, Line, Menu } from "./types";

const CUTLERY_CATEGORY = /餐具|utensil|cutlery/iu;
const NO_CUTLERY = /无需|不需要|不要|环保|免餐具|no\s/iu;
const WANTS_CUTLERY = /需要|要餐具|一餐一具|套|份/u;

const yuan = (n: number) => `¥${Math.round(n * 100) / 100}`;

const listing = (items: Item[]) =>
  items
    .filter((i) => !i.soldOut)
    .map((i) => `${i.skus[0]?.id} ${i.name} ${yuan(i.price)}`)
    .join(" / ");

/** The item in a cutlery category that matches the decision: 0 sets → the "no cutlery" item. */
export function cutleryItem(items: Item[], sets: number): Item | undefined {
  const open = items.filter((i) => !i.soldOut);
  if (sets === 0) {
    return open.find((i) => NO_CUTLERY.test(i.name));
  }
  return (
    open.find((i) => !NO_CUTLERY.test(i.name) && WANTS_CUTLERY.test(i.name)) ??
    open.find((i) => !NO_CUTLERY.test(i.name))
  );
}

/**
 * Some shops refuse any order without one item from a named category (dips, soup, cutlery).
 * Cutlery follows the user's cutlery decision; anything else is the caller's choice, so we say exactly what to pick.
 * `cutlery` undefined means not decided yet: the "no cutlery" item stands in so a quote can still be priced.
 */
export function withRequired(
  menu: Menu,
  lines: Line[],
  cutlery: number | undefined
): Line[] {
  const category = menu.categories.find((c) => c.name === menu.required);
  if (!(menu.required && category)) {
    return lines;
  }
  const skus = new Set(category.items.flatMap((i) => i.skus.map((k) => k.id)));
  if (lines.some((l) => skus.has(l.skuId))) {
    return lines;
  }
  if (CUTLERY_CATEGORY.test(category.name)) {
    const pick = cutleryItem(category.items, cutlery ?? 0);
    const sku = pick?.skus[0];
    if (pick && sku) {
      return [...lines, resolveLine([pick], parseSpec(String(sku.id)))];
    }
  }
  throw new UserError(
    `${menu.name} requires one item from "${category.name}" in every order. Add one of: ${listing(category.items)}`
  );
}
