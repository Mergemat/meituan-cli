import { type State, state } from "../config";
import { parseCutlery } from "../cutlery";
import { UserError } from "../errors";
import { usage } from "../ratelimit";
import type { Command } from "./command";

const UNSET = "unset";

/** Settings a user can save. Each knows how to read its value from the command line. */
const settings: Record<string, (v: string) => Partial<State>> = {
  cutlery: (v) => ({ cutlery: parseCutlery(v) }),
};

function show(s: State) {
  const { blocked, own, windows } = usage();
  const per = (ws: typeof windows) =>
    ws
      .map(
        (w) =>
          `${w.used}/${w.limit} per ${w.minutes === 60 ? "hour" : "minute"}`
      )
      .join(", ");
  return [
    ...Object.keys(settings).map(
      (k) => `${k}: ${s[k as keyof State] ?? "not set"}`
    ),
    `requests: ${per(windows)}`,
    ...own.map((o) => `  of which ${o.endpoint}: ${per(o.windows)}`),
    ...blocked.map((b) => `blocked by Meituan: ${b.endpoint} until ${b.until}`),
  ].join("\n");
}

export const config: Command = {
  detail: `Settings: ${Object.keys(settings).join(", ")}. "meituan-cli config cutlery 0" means no cutlery on every order; "meituan-cli config cutlery ${UNSET}" asks again each time.`,
  name: "config",
  run({ pos }) {
    const [key, value] = pos;
    if (!key) {
      return Promise.resolve({ data: state.read(), text: show(state.read()) });
    }
    const parse = settings[key];
    if (!parse) {
      throw new UserError(
        `Unknown setting "${key}". Settings: ${Object.keys(settings).join(", ")}`
      );
    }
    if (value === undefined) {
      throw new UserError(`usage: meituan-cli config ${key} <value|${UNSET}>`);
    }
    const next = { ...state.read() };
    if (value === UNSET) {
      delete next[key as keyof State];
    } else {
      Object.assign(next, parse(value));
    }
    state.write(next);
    return Promise.resolve({ data: next, text: show(next) });
  },
  summary:
    "saved preferences (cutlery). meituan-cli config <key> <value|unset>",
  usage: "config [key] [value]",
};
