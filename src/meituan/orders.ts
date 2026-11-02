import type { Order } from "../types";
import type { Ctx } from "./context";
import type { RawOrder } from "./raw";

export async function listOrders({ site }: Ctx): Promise<Order[]> {
  const { orderList = [] } = await site.call<{ orderList?: RawOrder[] }>(
    "openh5/order/list",
    { page_index: 0, page_size: 10 }
  );
  return orderList.map((o) => ({
    id: o.mtOrderViewId,
    items: (o.productList ?? []).map(
      (i) => `${i.productName}x${i.productCount}`
    ),
    shop: o.shopName ?? "",
    status: o.orderStatusStr ?? "",
    time: o.orderTime ?? "",
    total: Number(o.totalPrice),
  }));
}

/** Meituan's cashier page for an unpaid order. Meant for the user's phone. */
export async function payLink({ site }: Ctx, orderId: string): Promise<string> {
  const r = await site.call<{ pay_url: string }>("openh5/pay/genpay", {
    fingerprint: 2,
    page_code: 2,
    wm_order_id_view_str: orderId,
  });
  return r.pay_url;
}

export async function cancelOrder({ site }: Ctx, orderId: string) {
  await site.call("openh5/order/after/v3/cancel", { order_view_id: orderId });
}
