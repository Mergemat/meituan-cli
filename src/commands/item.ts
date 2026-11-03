import { shopGroups } from "../args";
import { image } from "../cache";
import { renderItem } from "../format";
import { findItem } from "../items";
import { knownItems, menu } from "../meituan/menu";
import { withSkuOptions } from "../meituan/skus";
import { contactSheets, type SheetEntry } from "../sheet";
import type { Command } from "./command";

const USAGE = "item <shop> <sku>... [<shop> <sku>...]";

export const item: Command = {
  detail: [
    "Items from several shops in one call: item <shopA> <sku> <sku> <shopB> <sku>.",
    "Photos often carry what the text leaves out (protein, kcal, portion, nutrition labels). With two or more items you also get one photo sheet: every photo labelled with its sku and price, six to an image. Open it instead of the single photos.",
  ].join("\n"),
  name: "item",
  async run({ pos }, open) {
    const groups = shopGroups(pos, USAGE);
    const ctx = await open();
    const entries: SheetEntry[] = [];
    const blocks: string[] = [];
    for (const { shop, items: skus } of groups) {
      // biome-ignore lint/performance/noAwaitInLoops: one shop's menu at a time, to stay gentle with Meituan
      const m = await menu(ctx, shop);
      const known = knownItems(m);
      const found = await Promise.all(
        skus.map((s) => withSkuOptions(ctx, shop, findItem(known, s).item))
      );
      const pics = await Promise.all(
        found.map((i) => image(i.pic, String(i.spu)))
      );
      if (groups.length > 1) {
        blocks.push(`## ${shop} ${m.name}`);
      }
      found.forEach((i, k) => {
        entries.push({ item: i, pic: pics[k] ?? "", shop });
        blocks.push(renderItem(i, pics[k] ?? ""));
      });
    }
    const sheets =
      entries.length > 1 ? await contactSheets(ctx.site, entries) : [];
    return {
      data: { items: entries, sheets },
      text: [
        ...blocks,
        ...sheets.map((s) => `photo sheet (labelled by sku): ${s}`),
      ].join("\n"),
    };
  },
  summary:
    "full detail for items from one or more shops: description, options, photos, and one labelled photo sheet",
  usage: USAGE,
};
