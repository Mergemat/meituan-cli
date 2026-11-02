import { priceCart } from "../cart";
import { chooseCutlery } from "../cutlery";
import { UserError } from "../errors";
import { describePick, renderQuote } from "../format";
import { appLink, submitOrder } from "../meituan/checkout";
import type { Args, Command } from "./command";

const text = (v: string | true | undefined) =>
  typeof v === "string" ? v : undefined;

export const order: Command = {
  detail: [
    "Cutlery: --cutlery=N (0 = none), or the saved meituan-cli config cutlery. Without either it refuses: ask the user.",
    "If a dish can only be ordered in the Meituan app, nothing is placed: you get the app link and the list to add there.",
    "This creates a real order: only run it when the user asked for one.",
  ].join("\n"),
  name: "order",
  async run({ pos, opts }: Args, open) {
    const [shop, ...specs] = pos;
    if (!(shop && specs.length)) {
      throw new UserError(
        "usage: meituan-cli order <shop> <item>... --confirm=<total>"
      );
    }
    const cutlery = chooseCutlery(text(opts.cutlery));
    const ctx = await open();
    const cart = await priceCart(ctx, shop, specs, cutlery);
    if (cart.app.length || !cart.exact) {
      // One order per shop: if any dish needs the app, the whole order happens there.
      throw new UserError(
        `Not placed: ${cart.app.map((p) => p.item.name).join(", ")} can only be ordered in the Meituan app. Give the user this link and list. Open ${appLink(shop)} and add: ${cart.picks.map(describePick).join("; ")}. They choose the add-ons and pay in the app.`
      );
    }
    const { quote, preview, lines } = cart.exact;
    // The caller echoes the quoted total, so a price that moved since the quote blocks the order.
    const confirm = text(opts.confirm);
    if (confirm === undefined) {
      throw new UserError(
        `Refusing to order without --confirm=<total>. Current total: ${quote.total}`
      );
    }
    if (Number(confirm) !== quote.total) {
      throw new UserError(
        `Total is now ${quote.total}, not ${confirm}. Check it with meituan-cli quote first.`
      );
    }
    const id = await submitOrder(ctx, shop, lines, preview, {
      cutlery,
      note: text(opts.note) ?? "",
    });
    return {
      data: { orderId: id, quote },
      text: `Ordered ${id}, not paid yet.\n${renderQuote(quote)}\nmeituan-cli pay ${id} gives the link for the user's phone. Unpaid orders expire.`,
    };
  },
  summary:
    "place the order. <total> must equal the quote's 总计, so a price change blocks it. Not paid until the user pays",
  usage: "order <shop> <item>... --confirm=<total> [--cutlery=N] [--note=text]",
};
