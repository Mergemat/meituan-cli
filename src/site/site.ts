import { UserError } from "../errors";
import { type Browser, H5, openBrowser } from "./launch";
import {
  hasSession,
  restoreSession,
  saveSession,
  sessionCookie,
} from "./session-file";

const API = "https://i.waimai.meituan.com/";
const BOOT_TIMEOUT_MS = 20_000;
// Pictures and fonts are dead weight, and analytics hosts sometimes hang and stall the page.
const BLOCKED = [
  "*.png*",
  "*.jpg*",
  "*.jpeg*",
  "*.webp*",
  "*.gif*",
  "*.woff*",
  "*.ttf*",
  "*.mp4*",
  "*lx.meituan.net*",
  "*catfront.dianping.com*",
  "*logan*",
  "*dreport*",
  "*wreport*",
  "*owl*",
  "*res.wx.qq.com*",
];

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

/** Runs in the page: resolves once H5guard has loaded. There is no load event for it to await. */
function guardReady(timeoutMs: number) {
  return new Promise<boolean>((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if ((globalThis as unknown as { H5guard?: H5guardApi }).H5guard?.sign) {
        resolve(true);
      } else if (Date.now() - started > timeoutMs) {
        reject(new Error("H5guard did not load"));
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

/**
 * A headless copy of Meituan's mobile site. API calls run inside the page so the site's own H5guard
 * script signs them (the mtgsig header); reproducing that signature outside a browser is not practical.
 */
export class Site {
  location?: Location;
  private readonly browser: Browser;
  private readonly uuid: string;

  private constructor(browser: Browser, uuid: string) {
    this.browser = browser;
    this.uuid = uuid;
  }

  static async open(): Promise<Site> {
    if (!hasSession()) {
      throw new UserError(
        "Not logged in. The user must run: meituan-cli login"
      );
    }
    const browser = await openBrowser(true);
    try {
      const { tab } = browser;
      await tab.send("Network.setBlockedURLs", { urls: BLOCKED });
      await restoreSession(tab);
      // Any app route loads H5guard; the bare /login page does not.
      const boot = async () => {
        await tab.navigate(`${H5}/waimai/mindex/mine`);
        await tab.evaluate(guardReady, BOOT_TIMEOUT_MS);
      };
      await boot()
        .catch(boot)
        .catch((e: Error) => {
          throw new UserError(
            `Could not reach Meituan (${e.message.split("\n")[0]}). Check the network and retry.`
          );
        });
      if (!(await sessionCookie(tab, H5, "token"))) {
        throw new UserError(
          "Session expired. The user must run: meituan-cli login"
        );
      }
      const uuid =
        (await sessionCookie(tab, H5, "iuuid")) ??
        (await sessionCookie(tab, H5, "uuid")) ??
        "";
      return new Site(browser, uuid);
    } catch (e) {
      await browser.close();
      throw e;
    }
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
    const res: Envelope = await this.browser.tab.evaluate(signedPost, {
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
    await saveSession(this.browser.tab).catch(() => undefined);
    await this.browser.close();
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
