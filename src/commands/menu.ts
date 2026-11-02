import { appOnly } from "../cache";
import { UserError } from "../errors";
import { renderMenu } from "../format";
import { menu as loadMenu } from "../meituan/menu";
import type { Command } from "./command";

export const menu: Command = {
  detail:
    "Each item has one <sku>; its option groups (size and combo parts included) are chosen when ordering, e.g. <sku>:大杯,少冰. Groups you skip take their first value; size and combo parts default to the listed sku.",
  name: "menu",
  async run({ pos }, open) {
    const [shop, ...words] = pos;
    if (!shop) {
      throw new UserError("usage: meituan-cli menu <shop> [word]");
    }
    const m = await loadMenu(await open(), shop, { fresh: true });
    return { data: m, text: renderMenu(m, words.join(" "), appOnly.get(shop)) };
  },
  summary:
    "a shop's menu: item — <sku> ¥price — option groups. [word] filters by name or description",
  usage: "menu <shop> [word]",
};
