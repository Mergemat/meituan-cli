import { UserError } from "../errors";
import { renderShops } from "../format";
import { search as searchShops } from "../meituan/search";
import type { Command } from "./command";

export const search: Command = {
  detail:
    "Keywords are Chinese dish or shop names (奶茶, 牛肉饭, 轻食, 沙拉). Results follow Meituan's ranking, 20 per search.",
  name: "search",
  async run({ pos }, open) {
    const keyword = pos.join(" ");
    if (!keyword) {
      throw new UserError("usage: meituan-cli search <keyword>");
    }
    const hits = await searchShops(await open(), keyword);
    return { data: hits, text: renderShops(hits) };
  },
  summary:
    "shops delivering to you. Line: <shop> name ★score eta distance 起送 配送 | matching items with prices",
  usage: "search <keyword>",
};
