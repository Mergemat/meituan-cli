import { existsSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { paths } from "../config";
import { UserError } from "../errors";
import { H5, hasToken, launch, PHONE, persist } from "./launch";

const API = "https://i.waimai.meituan.com/";
const MEDIA = /\.(?:png|jpe?g|webp|gif|woff2?|ttf|mp4)(?:\?|$)/u;
// Analytics hosts sometimes hang and stall the page; nothing we need comes from them.
const TRACKERS =
  /lx\.meituan\.net|catfront\.dianping\.com|logan|dreport|wreport|owl|res\.wx\.qq\.com/u;

/** Meituan's request-signing script, loaded by every app page. */
interface H5guardApi {
  getfp: () => string;
  sign: (req: {
    data: string;
    type: string;
    url: string;
  }) => Promise<{ headers?: Record<string, string> }>;
}

interface Envelope {
  code?: number | string;
  data?: unknown;
  msg?: string;
}

export interface Location {
  lat: number;
  lng: number;
}

/**
 * A headless copy of Meituan's mobile site. API calls run inside the page so the site's own H5guard
 * script signs them (the mtgsig header); reproducing that signature outside a browser is not practical.
 */
export class Site {
  location?: Location;
  private readonly browser: Browser;
  private readonly ctx: BrowserContext;
  private readonly page: Page;
  private readonly uuid: string;

  private constructor(
    browser: Browser,
    ctx: BrowserContext,
    page: Page,
    uuid: string
  ) {
    this.browser = browser;
    this.ctx = ctx;
    this.page = page;
    this.uuid = uuid;
  }

  static async open(): Promise<Site> {
    if (!existsSync(paths.session)) {
      throw new UserError(
        "Not logged in. The user must run: meituan-cli login"
      );
    }
    const browser = await launch(true);
    const ctx = await browser.newContext({
      ...PHONE,
      storageState: paths.session,
    });
    await ctx.route(MEDIA, (r) => r.abort());
    await ctx.route(TRACKERS, (r) => r.abort());
    const page = await ctx.newPage();
    // Any app route loads H5guard; the bare /login page does not.
    const boot = async () => {
      await page.goto(`${H5}/waimai/mindex/mine`, {
        timeout: 20_000,
        waitUntil: "commit",
      });
      await page.waitForFunction(
        () => (globalThis as unknown as { H5guard?: H5guardApi }).H5guard?.sign,
        null,
        { timeout: 20_000 }
      );
    };
    await boot()
      .catch(boot)
      .catch((e: Error) => {
        throw new UserError(
          `Could not reach Meituan (${e.message.split("\n")[0]}). Check the network and retry.`
        );
      });
    if (!(await hasToken(ctx))) {
      throw new UserError(
        "Session expired. The user must run: meituan-cli login"
      );
    }
    const cookies = await ctx.cookies(H5);
    const uuid =
      cookies.find((c) => c.name === "iuuid")?.value ??
      cookies.find((c) => c.name === "uuid")?.value ??
      "";
    return new Site(browser, ctx, page, uuid);
  }

  /** Signed POST to an i.waimai.meituan.com path (or a full Meituan URL). Returns the envelope's data or throws its message. */
  async call<T>(path: string, form: Record<string, unknown> = {}): Promise<T> {
    const loc = this.location
      ? {
          wm_actual_latitude: this.location.lat,
          wm_actual_longitude: this.location.lng,
          wm_latitude: this.location.lat,
          wm_longitude: this.location.lng,
        }
      : {};
    const fields = {
      optimus_code: 10,
      optimus_risk_level: 71,
      ...form,
      ...loc,
      openh5_uuid: this.uuid,
      uuid: this.uuid,
      wmUserIdDeregistration: 0,
      wmUuidDeregistration: 0,
    };
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      body[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    }
    const res: Envelope = await this.page.evaluate(signedPost, {
      body,
      url: path.startsWith("https://") ? path : API + path,
    });
    if (Number(res.code) !== 0) {
      throw new UserError(
        `Meituan rejected ${path}: ${res.msg ?? JSON.stringify(res).slice(0, 300)}`
      );
    }
    return res.data as T;
  }

  /** Saves refreshed cookies so the session keeps living, then shuts the browser. */
  async close() {
    await persist(this.ctx).catch(() => undefined);
    await this.browser.close().catch(() => undefined);
  }
}

/** Runs inside the page, where H5guard lives. Must be self-contained: it is serialized into the browser. */
async function signedPost({
  body,
  url,
}: {
  body: Record<string, string>;
  url: string;
}): Promise<Envelope> {
  const guard = (globalThis as unknown as { H5guard: H5guardApi }).H5guard;
  const form = new URLSearchParams(body);
  form.set("_token", guard.getfp());
  const u = new URL(url);
  u.searchParams.set("_", String(Date.now()));
  u.searchParams.set("yodaReady", "h5");
  u.searchParams.set("csecplatform", "4");
  u.searchParams.set("csecversion", "4.2.4");
  const signed = await guard.sign({
    data: form.toString(),
    type: "POST",
    url: u.toString(),
  });
  const r = await fetch(u, {
    body: form,
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(signed.headers ?? {}),
    },
    method: "POST",
  });
  const text = await r.text();
  try {
    return JSON.parse(text) as Envelope;
  } catch {
    return { code: -1, msg: `HTTP ${r.status}: ${text.slice(0, 200)}` };
  }
}
