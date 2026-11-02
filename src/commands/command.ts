import type { Ctx } from "../meituan/context";

export interface Args {
  opts: Record<string, string | true>;
  pos: string[];
}

export interface Output {
  /** Full data for --json. */
  data?: unknown;
  /** Terse text for agents. */
  text: string;
}

export interface Command {
  /** Extra lines for `meituan-cli help <command>`. */
  detail?: string;
  name: string;
  /** Opens Meituan with the delivery address resolved. Only called by commands that need it. */
  run: (args: Args, open: () => Promise<Ctx>) => Promise<Output>;
  summary: string;
  usage: string;
}
