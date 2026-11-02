import type { Command } from "./commands/command";
import { commands } from "./commands/index";

const COLUMN = 28;

const row = (c: Command) =>
  c.usage.length < COLUMN - 1
    ? `  ${c.usage.padEnd(COLUMN)}${c.summary}`
    : `  ${c.usage}\n  ${" ".repeat(COLUMN)}${c.summary}`;

export const help = (
  version: string
) => `meituan-cli ${version} — order Meituan takeout (美团外卖) from the terminal.

Flow: search → menu → item (look closer) → quote → order. Prices and fees only come from quote.
Ids: <shop> from search, <sku> from menu.

${commands.map(row).join("\n")}

  --json on any command prints the full data instead of text.
  meituan-cli help <command> for details.`;

export const commandHelp = (c: Command) =>
  [`meituan-cli ${c.usage}`, c.summary, c.detail].filter(Boolean).join("\n");
