import { shopGroups } from "../args";
import { type PricedCart, priceCart } from "../cart";
import { state } from "../config";
import { cutleryNote } from "../cutlery";
import { UserError } from "../errors";
import { renderCart } from "../format";
import type { Command } from "./command";

const USAGE = "quote <shop> <item>... [<shop> <item>...]";

const nextStep = (shop: string, items: string[], cart: PricedCart) =>
  cart.app.length
    ? "If this is the order, the user finishes it in the Meituan app: meituan-cli order gives the link and list."
    : `To order: meituan-cli order ${shop} ${items.join(" ")} --confirm=${cart.total}`;

export const quote: Command = {
  detail: [
    "Example: meituan-cli quote <shop> 32067247198:大杯,少冰,半糖x2 49708934602",
    "Options go by name as the menu shows them, one per group.",
    "Several shops in one call, to compare: quote <shopA> <item>... <shopB> <item>... Each shop is its own order.",
    "Items the shop requires in every order are added for you when they are cutlery; otherwise you are told which to add.",
    "Dishes only the Meituan app can order are priced at menu price and marked [app]; the total is then an estimate.",
  ].join("\n"),
  name: "quote",
  async run({ pos }, open) {
    const groups = shopGroups(pos, USAGE);
    const ctx = await open();
    const { cutlery } = state.read();
    const carts: PricedCart[] = [];
    const blocks: string[] = [];
    let asks = false;
    for (const { shop, items } of groups) {
      // One shop failing (below its minimum, out of stock) should not hide the others' prices.
      // biome-ignore lint/performance/noAwaitInLoops: one checkout at a time, to stay gentle with Meituan
      const cart = await priceCart(ctx, shop, items, cutlery).catch((e) => {
        if (groups.length > 1 && e instanceof UserError) {
          blocks.push(`${shop}: ${e.message}`);
          return;
        }
        throw e;
      });
      if (cart) {
        carts.push(cart);
        asks ||= cart.app.length > 0 || Boolean(cart.exact?.quote.asksCutlery);
        blocks.push(`${renderCart(cart)}\n${nextStep(shop, items, cart)}`);
      }
    }
    return {
      data: carts.length === 1 ? carts[0] : carts,
      text: [blocks.join("\n\n"), asks && cutleryNote()]
        .filter(Boolean)
        .join("\n"),
    };
  },
  summary:
    "real checkout price (fees, discounts, total, arrival) for one or more shops. item = <sku>[:<option>,...][x<count>]",
  usage: USAGE,
};
