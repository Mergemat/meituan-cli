import type { Item, ShopHit } from "../types";
import type { Ctx } from "./context";
import type { RawShop } from "./raw";

const STORE = 2;
const WHITESPACE = /\s+/gu;

const parse = (s: string): Partial<RawShop> => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

/** One page (20 shops) near the delivery address matching a keyword, with their matching items. */
export async function search(
  { site, address }: Ctx,
  keyword: string,
  page = 0
): Promise<{ hits: ShopHit[]; more: boolean }> {
  // Field set copied from the site's own request; the endpoint rejects calls missing any of them.
  const d = await site.call<{
    has_next_page?: boolean;
    module_list?: { module_id: string; string_data: string }[];
  }>("openh5/search/globalpage", {
    activity_filter_codes: "",
    app_model: 0,
    category_type: 0,
    dcContinerInstanceInfo: "",
    entrance_id: 0,
    gaoda_id: 0,
    is_fix_keyword: false,
    keyword,
    latitude: "",
    longitude: "",
    origin_guide_query: "",
    page_index: page,
    page_size: 20,
    personalized: 1,
    product_card_page_index: 0,
    product_tag_id: "",
    query_type: 0,
    rank_list_id: "",
    ref_list_id: "",
    req_time: Date.now(),
    search_cursor: 0,
    search_global_id: Math.floor(Math.random() * 1e8),
    search_latitude: address.lat,
    search_longitude: address.lng,
    search_page_type: 0,
    search_source: 0,
    show_mode: 100,
    slider_select_data: "",
    sort_type: 0,
    sub_category_type: 0,
    utm_campaign: "AwaimaiBwaimai",
    utm_medium: "openapi",
    utm_source: 8,
    utm_term: 40_000,
    weien_id: 0,
    wm_appversion: "4.0.0",
    wm_channel: 8,
    wm_ctype: "openapi",
    wm_did: "",
    wm_dtype: "openapi",
    wm_dversion: "4.0.0",
    wm_order_channel: "default",
    wm_visitid: "",
    word_source: "",
  });
  const hits = (d.module_list ?? [])
    .filter((m) => m.module_id === "poi_mode")
    .map((m) => toHit(parse(m.string_data)))
    .filter((h) => h.shop);
  return { hits, more: Boolean(d.has_next_page) };
}

function toHit(p: Partial<RawShop>): ShopHit {
  const items = (p.product_list ?? [])
    .filter((i) => i.product_sku_id)
    .map((i) => ({
      // Shops put line breaks in product names; output is one line per shop.
      name: (i.product_name ?? i.name ?? "").replace(WHITESPACE, " ").trim(),
      pic: i.picture ?? i.pic_url ?? "",
      price: i.price ?? i.product_price ?? 0,
      sku: i.product_sku_id ?? 0,
      spu: i.product_spu_id ?? 0,
      was:
        i.original_price && i.original_price > (i.price ?? 0)
          ? i.original_price
          : undefined,
    }));
  return {
    deliveryFee: p.shipping_fee_tip ?? "",
    distance: p.distance ?? "",
    eta: p.delivery_time_tip ?? "",
    items: items.filter(
      (i, k) => items.findIndex((j) => j.name === i.name) === k
    ),
    kind: p.biz_type === STORE ? "store" : "restaurant",
    minOrder: p.min_price_tip ?? "",
    name: p.name ?? "",
    open: p.status === 1,
    perPerson: p.average_price_tip ?? "",
    pic: p.pic_url ?? "",
    sales: p.month_sales_tip ?? "",
    score: p.wm_poi_score ?? 0,
    shop: p.poi_id_str ?? "",
    status: p.status_desc || undefined,
  };
}

/** A search hit as a menu item: no options or description, which grocery products rarely have anyway. */
export const foundItem = (i: ShopHit["items"][number]): Item => ({
  appOnly: false,
  category: "search",
  desc: "",
  groups: [],
  likes: 0,
  name: i.name,
  pic: i.pic,
  price: i.price,
  skus: [{ id: i.sku, label: "", min: 1, price: i.price, spec: "" }],
  sold: "",
  soldOut: false,
  spu: i.spu,
});
