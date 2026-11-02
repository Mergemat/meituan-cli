import { UserError } from "../errors";
import { renderOrders } from "../format";
import { cancelOrder, listOrders, payLink } from "../meituan/orders";
import type { Command } from "./command";

export const orders: Command = {
  name: "orders",
  async run(_, open) {
    const list = await listOrders(await open());
    return { data: list, text: renderOrders(list) };
  },
  summary: "recent orders: <orderId> time status total shop | items",
  usage: "orders",
};

export const pay: Command = {
  name: "pay",
  async run({ pos }, open) {
    const [id] = pos;
    if (!id) {
      throw new UserError("usage: meituan-cli pay <orderId>");
    }
    const url = await payLink(await open(), id);
    return {
      data: { url },
      text: `${url}\nGive this link to the user to open on their phone. Do not pay yourself.`,
    };
  },
  summary:
    "payment link for an unpaid order. The user opens it on their phone; never pay on their behalf",
  usage: "pay <orderId>",
};

export const cancel: Command = {
  name: "cancel",
  async run({ pos, opts }, open) {
    const [id] = pos;
    if (!id) {
      throw new UserError("usage: meituan-cli cancel <orderId> --confirm");
    }
    if (!opts.confirm) {
      throw new UserError("Refusing to cancel without --confirm.");
    }
    await cancelOrder(await open(), id);
    return { text: `Cancelled ${id}.` };
  },
  summary: "cancel an order",
  usage: "cancel <orderId> --confirm",
};
