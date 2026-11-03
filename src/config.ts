import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG =
  process.env.MEITUAN_CLI_HOME ?? join(homedir(), ".config", "meituan-cli");
const CACHE = join(homedir(), ".cache", "meituan-cli");

export const paths = {
  /** Dishes Meituan refused as app-only, by shop. */
  appOnly: join(CACHE, "app-only.json"),
  cache: CACHE,
  config: CONFIG,
  /** Items search turned up, by shop: how products missing from a partial menu stay orderable. */
  found: join(CACHE, "found"),
  images: join(CACHE, "img"),
  log: join(CONFIG, "calls.jsonl"),
  menus: join(CACHE, "menu"),
  /** Shared request budget and Meituan's blocks, for every process on this machine. */
  rate: join(CACHE, "rate.json"),
  rateLock: join(CACHE, "rate.lock"),
  /** Search result pages, briefly, so repeating a search costs no request. */
  searches: join(CACHE, "search"),
  /** Cookies + localStorage. A file rather than a browser profile, so parallel runs never fight over a lock. */
  session: join(CONFIG, "session.json"),
  state: join(CONFIG, "state.json"),
};

export interface State {
  addressId?: number;
  /** Sets of cutlery for every order; 0 means none. Unset means ask each time. */
  cutlery?: number;
}

export const state = {
  read: (): State =>
    existsSync(paths.state)
      ? JSON.parse(readFileSync(paths.state, "utf8"))
      : {},
  write: (s: State) => writeAtomic(paths.state, JSON.stringify(s)),
};

export function writeAtomic(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}

export function forget() {
  for (const p of [paths.session, paths.state]) {
    rmSync(p, { force: true });
  }
  rmSync(CACHE, { force: true, recursive: true });
}
