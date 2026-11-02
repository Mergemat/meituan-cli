import { type SkuAttrGroup, withSkuAttrs } from "../items";
import type { Item } from "../types";
import type { Ctx } from "./context";

/**
 * Asks the options popup's endpoint which sku carries which option value. Only needed for dishes with
 * several skus; menus' sku specs cannot be trusted to name them. Falls back to the menu's own reading.
 */
export async function withSkuOptions(
  { site }: Ctx,
  shop: string,
  item: Item
): Promise<Item> {
  if (item.skus.length < 2 || !item.groups.length) {
    return item;
  }
  const r = await site
    .call<{ spu_attrs?: SkuAttrGroup[] }>("openh5/v2/poi/food/multispu", {
      poi_id_str: shop,
      poiId: -100,
      skuIds: item.skus.map((k) => k.id),
      spuAttrs: item.groups.map((g) => ({
        name: g.name,
        values: g.values.map((v) => ({
          id: v.id,
          mutex_attrs: null,
          value: v.name,
        })),
      })),
      spuId: item.spu,
    })
    .catch(() => undefined);
  return r?.spu_attrs ? withSkuAttrs(item, r.spu_attrs) : item;
}
