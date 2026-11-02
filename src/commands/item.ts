import { image } from "../cache";
import { UserError } from "../errors";
import { renderItem } from "../format";
import { findItem } from "../items";
import { allItems, menu } from "../meituan/menu";
import type { Command } from "./command";

export const item: Command = {
  detail:
    "Photos often carry what the text leaves out (portion, nutrition labels, kcal). Open the pic path to see it.",
  name: "item",
  async run({ pos }, open) {
    const [shop, ...skus] = pos;
    if (!(shop && skus.length)) {
      throw new UserError("usage: meituan-cli item <shop> <sku>...");
    }
    const items = allItems(await menu(await open(), shop));
    const found = skus.map((s) => findItem(items, s).item);
    const pics = await Promise.all(
      found.map((i) => image(i.pic, String(i.spu)))
    );
    return {
      data: found.map((i, k) => ({ ...i, picPath: pics[k] })),
      text: found.map((i, k) => renderItem(i, pics[k] ?? "")).join("\n\n"),
    };
  },
  summary:
    "full detail for one or more items: description, options, and a local path to the photo",
  usage: "item <shop> <sku>...",
};
