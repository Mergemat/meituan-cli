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
 * A full find-compare-order session is 40-60 requests. Bursts of hundreds within minutes got endpoints
 * blocked for over a day, so the per-minute cap does the protecting; the hourly one only stops a runaway
 * loop, and leaves room for a few agents working at once.
 */
export const RULES: Rules = {
  gapMs: 200,
  windows: [
    { limit: 40, ms: 60_000 },
    { limit: 1000, ms: 3_600_000 },
  ],
};

/**
 * Endpoints Meituan guards more tightly than the rest. Search was blocked (HTTP 403) after 37 searches
 * in under 3 minutes, well inside the overall limits.
 */
export const ENDPOINT_RULES: Record<string, Rules> = {
  "openh5/search/globalpage": {
    gapMs: 0,
    windows: [
      { limit: 8, ms: 60_000 },
      { limit: 100, ms: 3_600_000 },
    ],
  },
};

/** How long Meituan's "blocked" (HTTP 403/429) keeps an endpoint off limits before trying it again. */
export const COOLDOWN_MS = 30 * 60_000;
// An agent waiting a minute costs less than one that fails, reads the error and retries.
const DEFAULT_MAX_WAIT_MS = 60_000;
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
  /** Request times for endpoints with rules of their own. */
  endpoints?: Record<string, number[]>;
  times: number[];
}

/** The earliest time at or after `now` that fits both the overall rules and an endpoint's own. */
export function jointSlot(
  times: number[],
  own: number[],
  now: number,
  rules: Rules,
  ownRules?: Rules
): number {
  const overall = nextSlot(times, now, rules);
  const both = ownRules ? nextSlot(own, overall, ownRules) : overall;
  return both === overall
    ? overall
    : jointSlot(times, own, both, rules, ownRules);
}

const recent = (times: number[], now: number, rules: Rules) =>
  times.filter((t) => t > now - Math.max(...rules.windows.map((w) => w.ms)));

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
    const ownRules = ENDPOINT_RULES[endpoint];
    const times = recent(state.times, now, rules);
    const own = ownRules
      ? recent(state.endpoints?.[endpoint] ?? [], now, ownRules)
      : [];
    const at = jointSlot(times, own, now, rules, ownRules);
    if (at - now > maxWait) {
      const why =
        ownRules && at > nextSlot(times, now, rules)
          ? ` (${endpoint} allows ${ownRules.windows[0]?.limit} a minute: reuse results you already have)`
          : "";
      throw new UserError(
        `Pausing to stay under Meituan's rate limits${why}; retry after ${clock(at)}.`
      );
    }
    const endpoints = ownRules
      ? { ...state.endpoints, [endpoint]: [...own, at] }
      : state.endpoints;
    writeAtomic(
      paths.rate,
      JSON.stringify({ ...state, endpoints, times: [...times, at] })
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
    own: Object.entries(ENDPOINT_RULES).map(([endpoint, r]) => ({
      endpoint,
      windows: r.windows.map((w) => ({
        limit: w.limit,
        minutes: w.ms / 60_000,
        used: (state.endpoints?.[endpoint] ?? []).filter(
          (t) => t > now - w.ms && t <= now
        ).length,
      })),
    })),
    windows: rules.windows.map((w) => ({
      limit: w.limit,
      minutes: w.ms / 60_000,
      used: state.times.filter((t) => t > now - w.ms && t <= now).length,
    })),
  };
}
