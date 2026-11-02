import { menuCache } from "../cache";
import { followsSku, shortNames, skuLabels } from "../items";
import type { Site } from "../site/site";
import type { Item, Menu } from "../types";
import type { Ctx } from "./context";
import type { RawFood, RawSpu, RawTag } from "./raw";

/**
 * The WeChat mini-program's menu: the whole menu in one call, minus dishes that need add-ons only the
 * Meituan app can choose. That makes it the list of what the site can actually order.
 */
const ORDERABLE_MENU = "https://wx.waimai.meituan.com/weapp/v1/poi/food";
const CATEGORY_CONCURRENCY = 3;

/** A shop's menu: everything orderable here, plus app-only dishes marked as such. Cached briefly unless `fresh`. */
export async function menu(
  { site }: Ctx,
  shop: string,
  { fresh = false } = {}
): Promise<Menu> {
  const cached = fresh ? undefined : menuCache.get(shop);
  if (cached) {
    return cached;
  }
  const orderable = await site.call<RawFood>(ORDERABLE_MENU, {
    geoType: 2,
    link_identifier_info: "",
    optimusCode: 10,
    partner: 4,
    platform: 13,
    poi_id_str: shop,
    product_spu_id: -1,
    riskLevel: 71,
    source: "",
    wm_appversion: "8.0.0",
    wm_ctype: "wxapp",
    wm_order_channel: "wxapp",
    wm_poi_id: -100,
  });
  const tags = orderable.food_spu_tags ?? [];
  const required = orderable.required_tag_info?.has_required_tag
    ? tags.find((t) => t.tag === orderable.required_tag_info?.required_tag_id)
        ?.name
    : undefined;
  const seen = new Set<number>();
  const categories = toCategories(tags, seen, required, false);
  // Whatever the site menu has beyond the orderable one needs the app. Best effort: when only part of
  // it loads, the menu is still complete for ordering, it just names fewer app-only dishes.
  const full = await siteMenu(site, shop);
  for (const c of toCategories(full.tags, seen, undefined, true)) {
    const same = categories.find((x) => x.name === c.name);
    if (same) {
      same.items.push(...c.items);
    } else {
      categories.push(c);
    }
  }
  const info = orderable.poi_info;
  const result: Menu = {
    appOnlyChecked: full.complete,
    categories,
    deliveryFee: info?.shipping_fee_tip ?? "",
    eta: info?.delivery_time_tip ?? "",
    minOrder: info?.min_price_tip ?? "",
    name: info?.name ?? "",
    required,
    shop,
  };
  menuCache.put(result);
  return result;
}

/**
 * Items repeat across categories (热销 lists best sellers again); keep the first copy, except in the
 * required category, which must stay complete to be choosable.
 */
function toCategories(
  tags: RawTag[],
  seen: Set<number>,
  required: string | undefined,
  appOnly: boolean
) {
  return tags
    .map((t) => ({
      items: (t.spus ?? [])
        .filter(
          (s) =>
            s.skus?.length &&
            (t.name === required || (!seen.has(s.id) && seen.add(s.id)))
        )
        .map((s) => toItem(s, t.name, appOnly)),
      name: t.name,
    }))
    .filter((c) => c.items.length);
}

/**
 * The mobile site's menu. Only the first page arrives filled; the rest load one category at a time,
 * an endpoint Meituan blocks (HTTP 403) after bursts. Keeps whatever loaded and says whether that is all of it.
 */
async function siteMenu(
  site: Site,
  shop: string
): Promise<{ complete: boolean; tags: RawTag[] }> {
  const d = await site
    .call<RawFood>("openapi/v1/poi/food", {
      geoType: 2,
      optimusCode: 10,
      partner: 4,
      platform: 3,
      poi_id_str: shop,
      product_spu_id: -1,
      riskLevel: 71,
      wm_appversion: "4.0.0",
      wm_ctype: "openapi",
      wm_order_channel: "wx_public",
      wm_poi_id: -100,
    })
    .catch(() => undefined);
  const tags = d?.food_spu_tags ?? [];
  const complete = await inBatches(
    tags.filter((t) => !t.spus?.length),
    CATEGORY_CONCURRENCY,
    async (t) => {
      t.spus = await categoryItems(site, shop, t);
    }
  ).then(
    () => Boolean(d),
    () => false
  );
  return { complete, tags };
}

async function categoryItems(
  site: Site,
  shop: string,
  tag: RawTag
): Promise<RawSpu[]> {
  const r = await site.call<{ product_spu_list?: RawSpu[] }>(
    "openh5/v2/poi/menuproducts",
    {
      link_identifier_info: "",
      optimusCode: 10,
      partner: 4,
      platform: 3,
      poi_id_str: shop,
      riskLevel: 71,
      sort_type: 1,
      spu_tag_id: tag.tag,
      support_new_page_v3: true,
      tag_type: 1,
      wm_poi_id: -100,
    }
  );
  return r.product_spu_list ?? [];
}

/** Runs `work` over `items`, at most `size` at a time: bursts of parallel calls trip Meituan's firewall. */
async function inBatches<T>(
  items: T[],
  size: number,
  work: (item: T) => Promise<void>
) {
  for (let i = 0; i < items.length; i += size) {
    // biome-ignore lint/performance/noAwaitInLoops: batches are sequential on purpose
    await Promise.all(items.slice(i, i + size).map(work));
  }
}

function toItem(s: RawSpu, category: string, appOnly: boolean): Item {
  const raw = s.skus ?? [];
  const specs = raw.map((k) => k.spec ?? "");
  const labels = skuLabels(specs);
  const skus = raw.map((k, i) => ({
    id: k.id,
    label: labels[i] ?? "",
    min: Math.max(1, k.min_order_count ?? 1),
    price: k.price,
    spec: specs[i] ?? "",
  }));
  return {
    appOnly,
    category,
    desc: (s.description ?? "").trim(),
    groups: (s.attrs ?? []).map((a) => {
      const shorts = shortNames(a.values.map((v) => v.value));
      const values = a.values.map((v, i) => ({
        id: v.id,
        name: v.value,
        short: shorts[i] ?? v.value,
      }));
      return { bySku: followsSku(values, specs), name: a.name, values };
    }),
    likes: s.praise_num ?? 0,
    name: s.name,
    pic: s.picture ?? "",
    price: s.min_price,
    skus,
    sold: s.month_saled_content ?? "",
    soldOut: s.status !== 0,
    spu: s.id,
  };
}

export const allItems = (m: Menu): Item[] =>
  m.categories.flatMap((c) => c.items);
