import type { ShopHit } from "../types";
import type { Ctx } from "./context";
import type { RawShop } from "./raw";

const parse = (s: string): Partial<RawShop> => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

/** Shops near the delivery address that match a keyword, with their matching items. */
export async function search(
  { site, address }: Ctx,
  keyword: string
): Promise<ShopHit[]> {
  // Field set copied from the site's own request; the endpoint rejects calls missing any of them.
  const d = await site.call<{
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
    page_index: 0,
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
  return (d.module_list ?? [])
    .filter((m) => m.module_id === "poi_mode")
    .map((m) => toHit(parse(m.string_data)))
    .filter((h) => h.shop);
}

function toHit(p: Partial<RawShop>): ShopHit {
  const items = (p.product_list ?? []).map((i) => ({
    name: i.product_name ?? i.name ?? "",
    pic: i.picture ?? i.pic_url ?? "",
    price: i.price ?? i.product_price ?? 0,
  }));
  return {
    deliveryFee: p.shipping_fee_tip ?? "",
    distance: p.distance ?? "",
    eta: p.delivery_time_tip ?? "",
    items: items.filter(
      (i, k) => items.findIndex((j) => j.name === i.name) === k
    ),
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
