#!/usr/bin/env bun
// Measures what meituan-cli costs an agent, in o200k tokens (the GPT-4o/5 tokenizer).
//   bun scripts/measure.ts bench          fixed scenario: tokens per command
//   bun scripts/measure.ts log <sinceMs>  score a run from meituan-cli's call history
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { encode } from "gpt-tokenizer";
import { readCalls } from "../src/history";

const SHOP = "Ov9cVIkLSxReiMkgBgeQyQI";
const SCENARIO = [
  ["help"],
  ["addr"],
  ["search", "奶茶"],
  ["menu", SHOP],
  ["menu", SHOP, "伯牙"],
  ["item", SHOP, "32067247198"],
  ["quote", SHOP, "32067247198:少冰,半糖"],
  ["orders"],
];

const tokens = (s: string) => encode(s).length;
const pad = (v: unknown, n = 6) => String(v).padStart(n);

function bench() {
  const cli = join(import.meta.dir, "../src/cli.ts");
  let total = 0;
  for (const args of SCENARIO) {
    const p = spawnSync("bun", [cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, MEITUAN_CLI_NOLOG: "1" },
    });
    const n = tokens(p.stdout + p.stderr);
    total += n;
    console.log(
      `${pad(n)}  ${args.join(" ")}${p.status ? `  (exit ${p.status})` : ""}`
    );
  }
  console.log(`${pad(total)}  TOTAL`);
}

function score(since: number) {
  const calls = readCalls(since);
  const byCommand = new Map<string, { n: number; tokens: number }>();
  let total = 0;
  for (const c of calls) {
    const n = tokens(c.out);
    total += n;
    const name = c.args[0] ?? "help";
    const prev = byCommand.get(name) ?? { n: 0, tokens: 0 };
    byCommand.set(name, { n: prev.n + 1, tokens: prev.tokens + n });
    const status = c.ok ? "ok  " : "FAIL";
    console.log(
      `${pad(n)}  ${status} ${pad((c.ms / 1000).toFixed(1), 5)}s  meituan-cli ${c.args.join(" ").slice(0, 110)}`
    );
  }
  const failed = calls.filter((c) => !c.ok).length;
  const seconds = calls.reduce((sum, c) => sum + c.ms, 0) / 1000;
  const pics = calls
    .filter((c) => c.args[0] === "item")
    .reduce((sum, c) => sum + (c.out.match(/^pic: /gmu)?.length ?? 0), 0);
  console.log(
    `\nby command: ${[...byCommand].map(([k, v]) => `${k} ${v.n}× ${v.tokens}t`).join(", ")}`
  );
  console.log(
    `total: ${calls.length} meituan-cli calls (${failed} failed), ${total} output tokens, ${pics} photos offered, ${seconds.toFixed(0)}s inside meituan-cli`
  );
}

const [mode, arg] = process.argv.slice(2);
if (mode === "bench") {
  bench();
} else if (mode === "log") {
  score(Number(arg ?? 0));
} else {
  console.error("usage: bun scripts/measure.ts bench | log <sinceMs>");
  process.exit(1);
}
