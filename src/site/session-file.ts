import { existsSync, readFileSync } from "node:fs";
import { paths, writeAtomic } from "../config";
import type { Tab } from "./cdp";

/** Same shape as Playwright's storageState, so sessions saved by earlier versions keep working. */
interface Cookie {
  domain: string;
  expires: number;
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite?: string;
  secure: boolean;
  value: string;
}

interface SessionFile {
  cookies: Cookie[];
  origins: {
    localStorage: { name: string; value: string }[];
    origin: string;
  }[];
}

export const hasSession = () => existsSync(paths.session);

const read = (): SessionFile =>
  existsSync(paths.session)
    ? JSON.parse(readFileSync(paths.session, "utf8"))
    : { cookies: [], origins: [] };

/** Runs in the page before its own scripts: puts saved localStorage back (H5guard keeps its device id there). */
function seedStorage({
  items,
  origin,
}: {
  items: { name: string; value: string }[];
  origin: string;
}) {
  if (location.origin !== origin) {
    return;
  }
  for (const { name, value } of items) {
    if (localStorage.getItem(name) === null) {
      localStorage.setItem(name, value);
    }
  }
}

export async function restoreSession(tab: Tab) {
  const saved = read();
  await tab.send("Network.setCookies", {
    cookies: saved.cookies.map((c) => ({
      ...c,
      expires: c.expires > 0 ? c.expires : undefined,
    })),
  });
  await Promise.all(
    saved.origins.map((o) =>
      tab.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(${seedStorage.toString()})(${JSON.stringify({ items: o.localStorage, origin: o.origin })})`,
      })
    )
  );
}

/** Saves the tab's cookies and the current page's localStorage, keeping what was saved for other origins. */
export async function saveSession(tab: Tab) {
  const { cookies } = await tab.send<{ cookies: Cookie[] }>(
    "Network.getAllCookies"
  );
  const page = await tab.evaluate(
    () => ({
      items: Object.entries(localStorage).map(([name, value]) => ({
        name,
        value,
      })),
      origin: location.origin,
    }),
    null
  );
  const origins = read().origins.filter((o) => o.origin !== page.origin);
  if (page.origin.startsWith("http")) {
    origins.push({ localStorage: page.items, origin: page.origin });
  }
  writeAtomic(paths.session, JSON.stringify({ cookies, origins }));
}

export async function sessionCookie(tab: Tab, url: string, name: string) {
  const { cookies } = await tab.send<{ cookies: Cookie[] }>(
    "Network.getCookies",
    { urls: [url] }
  );
  return cookies.find((c) => c.name === name)?.value;
}
