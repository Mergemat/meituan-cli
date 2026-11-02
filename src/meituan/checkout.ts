import { AppOnlyError, UserError } from "../errors";
import { shortName } from "../items";
import type { Address, Line, Quote } from "../types";
import type { Ctx } from "./context";
import type { RawPreview } from "./raw";

/** Meituan's code for "no cutlery". The CLI calls it 0. */
const NO_CUTLERY = 99;

const recipient = (a: Address) => ({
  addr_id: a.id,
  addr_latitude: a.lat,
  addr_longitude: a.lng,
  house_number: a.room,
  recipient_address: a.place,
  recipient_name: a.name,
  recipient_phone: a.phone,
});

/** A checkout preview: what the order would cost right now. `preview` is needed to submit it. */
export async function previewOrder(
  { site, address }: Ctx,
  shop: string,
  lines: Line[]
): Promise<{ preview: RawPreview; quote: Quote }> {
  const now = Math.floor(Date.now() / 1000);
  // Field set copied from the site's checkout page.
  const preview = await site
    .call<RawPreview>("openh5/order/v2/preview", {
      data: {
        accepted_sku_item_map: {},
        additional_bargain_list: [],
        ap_params: [],
        business_type: 0,
        callback_info: {},
        cart_id: "",
        expected_arrival_time: 0,
        ext_param: { sqt_scene: "", sqtToken: "" },
        foodlist: lines,
        gift_insurance: 0,
        info: {
          channel: 1001,
          cType: "andriod",
          ctime: now,
          logType: "S",
          time: now,
        },
        init: true,
        insurance_selected: false,
        lat: address.lat,
        lng: address.lng,
        nb_app: "wap",
        pay_sdk_version: "1.1.8",
        payment_type: 0,
        poi_id_str: shop,
        preview_order_callback_info: "{}",
        privacy_selected: 1,
        ...recipient(address),
        recipient_gender: address.gender,
        selected_coupons: null,
        wm_open_id: "",
        wm_order_pay_type: 2,
        wm_poi_id: "-100",
        wx_pay_params: { orderPayChannel: 1 },
      },
    })
    .catch((e) => explainRejection(e, shop));
  return { preview, quote: toQuote(preview, shop, address) };
}

const APP_ONLY_ADDON = /必选小料/u;
const REQUIRED_CATEGORY = /需要选择\[(?<category>[^\]]+)\]/u;

/** Opens the shop in the Meituan app; the scheme comes from Meituan's own search results. */
export const appLink = (shop: string) =>
  `meituanwaimai://waimai.meituan.com/menu?restaurant_id=-100&poi_id_str=${shop}`;

/** Turns Meituan's terse checkout refusals into a next step. */
function explainRejection(e: unknown, shop: string): never {
  if (!(e instanceof UserError)) {
    throw e;
  }
  if (APP_ONLY_ADDON.test(e.message)) {
    // The dish carries an add-on group (小料) that only the Meituan app can fill; the mobile site cannot order it.
    throw new AppOnlyError(
      `${e.message} A dish here needs add-ons that only the Meituan app can choose. Finish in the app: ${appLink(shop)}`
    );
  }
  const category = e.message.match(REQUIRED_CATEGORY)?.groups?.category;
  if (category) {
    throw new UserError(
      `${e.message} The shop requires one item from "${category}" in every order: see meituan-cli menu ${shop} and add one.`
    );
  }
  throw e;
}

function toQuote(p: RawPreview, shop: string, a: Address): Quote {
  const reminders = [
    ...(p.remind_infos ?? []),
    ...(p.no_product_reminds ?? []),
  ];
  return {
    deliverTo: `${a.place} ${a.room}`,
    delivery: Number(p.real_shipping_fee) || 0,
    discount: Number(p.sub_total_price_discount) || 0,
    eta: p.expected_arrival_info?.select_view_time ?? "",
    lines: (p.foodlist ?? []).map((f) => ({
      count: f.count,
      name: f.name,
      options: (f.attrs ?? []).map((x) => shortName(x.value)).join(" "),
      pic: f.picture ?? "",
      price: f.sub_total_price,
    })),
    name: p.poi_name ?? "",
    packaging: Number(p.box_total_price) || 0,
    shop,
    total: Number(p.total),
    warnings: [
      ...reminders.map((r) => r.text ?? r.content ?? ""),
      p.order_preview_tip?.text ?? "",
      p.tip ?? "",
    ].filter(Boolean),
  };
}

export interface SubmitOptions {
  cutlery: number;
  note: string;
}

/** Places the order the preview describes. Mirrors the fields the site's checkout page sends. Returns the order id. */
export async function submitOrder(
  { site, address }: Ctx,
  shop: string,
  lines: Line[],
  preview: RawPreview,
  { cutlery, note }: SubmitOptions
): Promise<string> {
  const order = {
    accepted_sku_item_map: {},
    additional_bargain_list: [],
    ap_params: [],
    business_type: 0,
    callback_info: preview.callback_info ?? {},
    caution: note,
    coupon_view_id: "",
    diners_count: cutlery === 0 ? NO_CUTLERY : cutlery,
    expected_arrival_time: 0,
    ext_param: { sqtToken: "" },
    foodlist: lines,
    gift_insurance: 0,
    goods_coupon_view_id: "",
    has_food_safety_insurance: 0,
    insurance_selected: false,
    invoice_title: "",
    payment_type: preview.default_pay_type ?? 2,
    poi_id_str: shop,
    preview_order_callback_info:
      preview.callback_info?.preview_order_callback_info ?? "",
    privacy_selected: 1,
    ...recipient(address),
    recipient_gender: address.gender === 1 ? "先生" : "女士",
    selected_coupons: null,
    taxpayer_id_number: "",
    token: preview.token,
    wm_order_pay_type: 2,
    wm_poi_id: "-100",
  };
  // The site sends the order twice: as a JSON `data` field and flattened alongside it.
  const r = await site.call<{ orderId?: string | number }>(
    "openh5/order/v2/submit",
    { data: order, ...order }
  );
  if (!r?.orderId) {
    throw new UserError(`Order not placed: ${JSON.stringify(r).slice(0, 300)}`);
  }
  return String(r.orderId);
}
