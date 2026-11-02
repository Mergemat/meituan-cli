import { priceCart } from "../cart";
import { state } from "../config";
import { cutleryNote } from "../cutlery";
import { UserError } from "../errors";
import { renderCart } from "../format";
import type { Command } from "./command";

export const quote: Command = {
  detail: [
    "Example: meituan-cli quote <shop> 32067247198:大杯,少冰,半糖x2 49708934602",
    "Options go by name as the menu shows them, one per group. All items must come from the same shop.",
    "Items the shop requires in every order are added for you when they are cutlery; otherwise you are told which to add.",
    "Dishes only the Meituan app can order are priced at menu price and marked [app]; the total is then an estimate.",
  ].join("\n"),
  name: "quote",
  async run({ pos }, open) {
    const [shop, ...specs] = pos;
    if (!(shop && specs.length)) {
      throw new UserError("usage: meituan-cli quote <shop> <item>...");
    }
    const cart = await priceCart(
      await open(),
      shop,
      specs,
      state.read().cutlery
    );
    const next = cart.app.length
      ? "If this is the order, the user finishes it in the Meituan app: meituan-cli order gives the link and list."
      : `To order: meituan-cli order ${shop} ${specs.join(" ")} --confirm=${cart.total}`;
    return {
      data: cart,
      text: `${renderCart(cart)}\n${cutleryNote()}\n${next}`,
    };
  },
  summary:
    "real checkout price (fees, discounts, total, arrival). item = <sku>[:<option>,...][x<count>]",
  usage: "quote <shop> <item>...",
};
