import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { paths } from "./config";

export interface Call {
  args: string[];
  ms: number;
  ok: boolean;
  out: string;
  t: number;
}

/** Local history of every call: what ran and what it printed. Read by scripts/measure.ts. Off with MEITUAN_CLI_NOLOG=1. */
export function logCall(call: Call) {
  if (process.env.MEITUAN_CLI_NOLOG || !existsSync(paths.config)) {
    return;
  }
  appendFileSync(paths.log, `${JSON.stringify(call)}\n`);
}

export function readCalls(since = 0): Call[] {
  if (!existsSync(paths.log)) {
    return [];
  }
  return readFileSync(paths.log, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Call)
    .filter((c) => c.t >= since);
}
