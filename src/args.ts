import type { Args } from "./commands/command";

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
