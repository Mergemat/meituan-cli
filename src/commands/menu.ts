import { appOnly, found } from "../cache";
import { UserError } from "../errors";
import { renderMenu } from "../format";
import { allItems, menu as loadMenu, searchInShop } from "../meituan/menu";
import type { Command } from "./command";

export const menu: Command = {
  detail: [
    "Each item has one <sku>; its option groups (size and combo parts included) are chosen when ordering, e.g. <sku>:大杯,少冰. Groups you skip take their first value; size and combo parts default to the listed sku.",
    "Big grocery stores send only part of their range; for them [word] runs the store's own search, so it still finds everything.",
  ].join("\n"),
  name: "menu",
  async run({ pos }, open) {
    const [shop, ...words] = pos;
    if (!shop) {
      throw new UserError("usage: meituan-cli menu <shop> [word]");
    }
    const ctx = await open();
    const m = await loadMenu(ctx, shop, { fresh: true });
    const word = words.join(" ");
    if (!(word && m.unlisted)) {
      return { data: m, text: renderMenu(m, word, appOnly.get(shop)) };
    }
    // The menu's own matches first, then what only the store's search knows.
    const listed = allItems(m).filter(
      (i) => i.name.includes(word) || i.desc.includes(word)
    );
    const { items, total } = await searchInShop(ctx, shop, word);
    found.add(shop, items);
    const known = new Set(listed.map((i) => i.spu));
    const all = [...listed, ...items.filter((i) => !known.has(i.spu))];
    const view = {
      ...m,
      appOnlyChecked: true,
      categories: [{ items: all, name: `matches for ${word}` }],
      unlisted: 0,
    };
    const notes = [
      !all.length && `Nothing in this store matches "${word}".`,
      total > items.length &&
        `(the store has ${total} matches; a narrower word finds the rest)`,
    ].filter(Boolean);
    return {
      data: view,
      text: [
        all.length ? renderMenu(view) : renderMenu(view).split("\n")[0],
        ...notes,
      ].join("\n"),
    };
  },
  summary:
    "a shop's menu: item — <sku> ¥price — option groups. [word] filters by name or description",
  usage: "menu <shop> [word]",
};
