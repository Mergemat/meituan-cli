// One request budget for every meituan-cli process on this machine. Agents run commands in parallel, so
// the budget lives in a file: each request reserves a future time slot under a short lock, then waits for it.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { paths, writeAtomic } from "./config";
import { UserError } from "./errors";

export interface Window {
  limit: number;
  ms: number;
}

export interface Rules {
  /** Fewest milliseconds between two requests. */
  gapMs: number;
  windows: Window[];
}

/**
 * Roughly what a person browsing the app sends, with headroom: a full find-compare-order session is
 * 40-60 requests. Bursts of hundreds got endpoints blocked for over a day.
 */
export const RULES: Rules = {
  gapMs: 200,
  windows: [
    { limit: 40, ms: 60_000 },
    { limit: 400, ms: 3_600_000 },
  ],
};

/** How long Meituan's "blocked" (HTTP 403/429) keeps an endpoint off limits before trying it again. */
export const COOLDOWN_MS = 30 * 60_000;
const DEFAULT_MAX_WAIT_MS = 20_000;
const LOCK_STALE_MS = 5000;
const LOCK_RETRY_MS = 15;

/** The earliest time at or after `now` a new request fits every rule, given past and reserved request times. */
/** When a window has room again at or after `slot`: once enough of its oldest requests have aged out. */
function windowFreeAt(sorted: number[], slot: number, w: Window): number {
  const inWindow = sorted.filter((t) => t > slot - w.ms && t <= slot);
  return inWindow.length < w.limit
    ? slot
    : (inWindow.at(-w.limit) ?? slot) + w.ms;
}

/** Moving forward for one window can fill another; settle when no window moves the slot. */
function settle(sorted: number[], slot: number, rules: Rules): number {
  const next = Math.max(
    slot,
    ...rules.windows.map((w) => windowFreeAt(sorted, slot, w))
  );
  return next === slot ? slot : settle(sorted, next, rules);
}

export function nextSlot(times: number[], now: number, rules: Rules): number {
  const sorted = [...times].sort((a, b) => a - b);
  const afterGap = (sorted.at(-1) ?? Number.NEGATIVE_INFINITY) + rules.gapMs;
  return settle(sorted, Math.max(now, afterGap), rules);
}

interface State {
  /** Endpoint → time it may be called again. */
  cooldowns: Record<string, number>;
  times: number[];
}

const read = (): State => {
  try {
    return JSON.parse(readFileSync(paths.rate, "utf8"));
  } catch {
    return { cooldowns: {}, times: [] };
  }
};

/** Runs `fn` while holding the rate file's lock: a directory, because creating one is atomic. */
async function locked<T>(fn: () => T): Promise<T> {
  mkdirSync(paths.cache, { recursive: true });
  for (;;) {
    try {
      mkdirSync(paths.rateLock);
      break;
    } catch {
      // A process that died while holding the lock leaves it behind.
      if (
        existsSync(paths.rateLock) &&
        Date.now() - statSync(paths.rateLock).mtimeMs > LOCK_STALE_MS
      ) {
        rmSync(paths.rateLock, { force: true, recursive: true });
      }
      // biome-ignore lint/performance/noAwaitInLoops: waiting for another process to release the lock
      await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(paths.rateLock, { force: true, recursive: true });
  }
}

const clock = (t: number) => new Date(t).toTimeString().slice(0, 5);

/** Waits for this request's turn. Refuses at once when the wait would be long or Meituan is blocking the endpoint. */
export async function acquire(endpoint: string, rules = RULES) {
  const maxWait = Number(
    process.env.MEITUAN_CLI_MAX_WAIT_MS ?? DEFAULT_MAX_WAIT_MS
  );
  const slot = await locked(() => {
    const now = Date.now();
    const state = read();
    const blockedUntil = state.cooldowns[endpoint] ?? 0;
    if (blockedUntil > now) {
      throw new UserError(
        `Meituan is blocking ${endpoint} for a while; retry after ${clock(blockedUntil)}.`
      );
    }
    const longest = Math.max(...rules.windows.map((w) => w.ms));
    const times = state.times.filter((t) => t > now - longest);
    const at = nextSlot(times, now, rules);
    if (at - now > maxWait) {
      throw new UserError(
        `Pausing to stay under Meituan's rate limits; retry after ${clock(at)}.`
      );
    }
    writeAtomic(
      paths.rate,
      JSON.stringify({ ...state, times: [...times, at] })
    );
    return at;
  });
  await sleep(Math.max(0, slot - Date.now()));
}

/** Records that Meituan refused an endpoint as blocked, so nothing calls it again until the cooldown ends. */
export async function coolDown(endpoint: string) {
  await locked(() => {
    const state = read();
    state.cooldowns[endpoint] = Date.now() + COOLDOWN_MS;
    writeAtomic(paths.rate, JSON.stringify(state));
  });
}

/** Requests used against each window, and endpoints Meituan is currently blocking. */
export function usage(rules = RULES, now = Date.now()) {
  const state = read();
  return {
    blocked: Object.entries(state.cooldowns)
      .filter(([, until]) => until > now)
      .map(([endpoint, until]) => ({ endpoint, until: clock(until) })),
    windows: rules.windows.map((w) => ({
      limit: w.limit,
      minutes: w.ms / 60_000,
      used: state.times.filter((t) => t > now - w.ms && t <= now).length,
    })),
  };
}
