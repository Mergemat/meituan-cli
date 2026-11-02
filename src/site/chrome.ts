import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { UserError } from "../errors";

const DEVTOOLS_URL = /DevTools listening on (?<url>ws:\/\/\S+)/u;
const PLAYWRIGHT_CHROMIUM = /^chromium-(?<rev>\d+)$/u;
const START_TIMEOUT_MS = 20_000;

const SYSTEM_BROWSERS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ],
};

/** Executables inside Playwright's browser cache (`bunx playwright install chromium`), newest first. */
function playwrightChromium(): string[] {
  const root =
    platform() === "darwin"
      ? join(homedir(), "Library", "Caches", "ms-playwright")
      : join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) {
    return [];
  }
  const revision = (d: string) =>
    Number(d.match(PLAYWRIGHT_CHROMIUM)?.groups?.rev ?? 0);
  return readdirSync(root)
    .filter((d) => PLAYWRIGHT_CHROMIUM.test(d))
    .sort((a, b) => revision(b) - revision(a))
    .flatMap((d) => [
      join(
        root,
        d,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      ),
      join(
        root,
        d,
        "chrome-mac-x64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      ),
      join(
        root,
        d,
        "chrome-mac",
        "Chromium.app",
        "Contents",
        "MacOS",
        "Chromium"
      ),
      join(root, d, "chrome-linux64", "chrome"),
      join(root, d, "chrome-linux", "chrome"),
    ]);
}

export function findBrowser(): string {
  const found = [
    process.env.MEITUAN_CLI_BROWSER,
    ...(SYSTEM_BROWSERS[platform()] ?? []),
    ...playwrightChromium(),
  ].find((p) => p && existsSync(p));
  if (!found) {
    throw new UserError(
      "No Chrome or Chromium found. Install Google Chrome, run: bunx playwright install chromium, or set MEITUAN_CLI_BROWSER=/path/to/chrome"
    );
  }
  return found;
}

export interface Chrome {
  close: () => Promise<void>;
  /** The browser-level DevTools WebSocket. */
  url: string;
}

const exited = (proc: ChildProcess) =>
  new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
    } else {
      proc.once("exit", () => resolve());
    }
  });

/** Starts a throwaway Chrome profile and waits for it to announce its DevTools endpoint. */
export async function launchChrome(headless: boolean): Promise<Chrome> {
  const profile = mkdtempSync(join(tmpdir(), "meituan-cli-"));
  const proc = spawn(
    findBrowser(),
    [
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--mute-audio",
      ...(headless
        ? ["--headless=new", "--hide-scrollbars"]
        : ["--window-size=430,932"]),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  // Chrome outlives a killed parent; take it down (and its profile) however this process ends.
  const cleanup = () => {
    proc.kill();
    rmSync(profile, { force: true, recursive: true });
  };
  process.once("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => process.exit(130));
  }
  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new UserError("The browser did not start in time.")),
      START_TIMEOUT_MS
    );
    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const found = output.match(DEVTOOLS_URL)?.groups?.url;
      if (found) {
        clearTimeout(timer);
        resolve(found);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new UserError(`The browser quit while starting (exit ${code}).`));
    });
  });
  return {
    async close() {
      process.off("exit", cleanup);
      proc.kill();
      await exited(proc);
      rmSync(profile, { force: true, recursive: true });
    },
    url,
  };
}
