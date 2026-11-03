import type { Args } from "./commands/command";
import { UserError } from "./errors";

const FLAG = /^--(?<key>[\w-]+)(?:=(?<value>.*))?$/su;

/** `--key=value` and bare `--flag` become options; everything else is positional. */
export function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const opts: Args["opts"] = {};
  for (const a of argv) {
    const flag = a.match(FLAG)?.groups;
    if (flag?.key) {
      opts[flag.key] = flag.value ?? true;
    } else {
      pos.push(a);
    }
  }
  return { opts, pos };
}

/** An item spec: a sku, then options after ":" or a count after "x". Shop ids never look like this. */
const ITEM_SPEC = /^\d+(?::|x\d+$|$)/u;

/**
 * `<shop> <item>... [<shop> <item>...]`: items from several shops in one command, each group led by
 * its shop id, so comparing stores takes one call instead of one per store.
 */
export function shopGroups(
  pos: string[],
  usage: string
): { items: string[]; shop: string }[] {
  const groups: { items: string[]; shop: string }[] = [];
  for (const p of pos) {
    const last = groups.at(-1);
    if (!ITEM_SPEC.test(p)) {
      groups.push({ items: [], shop: p });
    } else if (last) {
      last.items.push(p);
    } else {
      throw new UserError(`usage: meituan-cli ${usage}`);
    }
  }
  if (!groups.length || groups.some((g) => !g.items.length)) {
    throw new UserError(`usage: meituan-cli ${usage}`);
  }
  return groups;
}
