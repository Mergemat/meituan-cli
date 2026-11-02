#!/usr/bin/env bun
import pkg from "../package.json";
import { parseArgs } from "./args";
import { findCommand } from "./commands/index";
import { UserError } from "./errors";
import { commandHelp, help } from "./help";
import { logCall } from "./history";
import { type Ctx, openCtx } from "./meituan/context";
import { Site } from "./site/site";

interface Result {
  code: number;
  text: string;
}

const HELP = new Set(["help", "--help", "-h"]);

async function run(argv: string[]): Promise<Result> {
  const [name = "help", ...rest] = argv;
  const args = parseArgs(rest);
  if (HELP.has(name)) {
    const topic = findCommand(args.pos[0] ?? "");
    return { code: 0, text: topic ? commandHelp(topic) : help(pkg.version) };
  }
  if (name === "--version" || name === "version") {
    return { code: 0, text: pkg.version };
  }
  const command = findCommand(name);
  if (!command) {
    return {
      code: 1,
      text: `Unknown command "${name}".\n\n${help(pkg.version)}`,
    };
  }
  if (args.opts.help) {
    return { code: 0, text: commandHelp(command) };
  }

  let site: Site | undefined;
  let ctx: Ctx | undefined;
  const open = async () => {
    site ??= await Site.open();
    ctx ??= await openCtx(site);
    return ctx;
  };
  try {
    const out = await command.run(args, open);
    const json = args.opts.json && out.data !== undefined;
    return { code: 0, text: json ? JSON.stringify(out.data) : out.text };
  } catch (e) {
    if (e instanceof UserError) {
      return { code: 1, text: e.message };
    }
    return {
      code: 2,
      text: `Internal error: ${(e as Error).message.split("\n")[0]}`,
    };
  } finally {
    await site?.close();
  }
}

const started = Date.now();
const cliArgs = process.argv.slice(2);
const { code, text } = await run(cliArgs);
if (code === 0) {
  console.log(text);
} else {
  console.error(text);
}
logCall({
  args: cliArgs,
  ms: Date.now() - started,
  ok: code === 0,
  out: text,
  t: started,
});
process.exit(code);
