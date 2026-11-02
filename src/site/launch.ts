import {
  type Browser,
  type BrowserContext,
  chromium,
  devices,
} from "playwright-core";
import { paths, writeAtomic } from "../config";
import { UserError } from "../errors";

export const H5 = "https://h5.waimai.meituan.com";

// The site only serves its full ordering flow to a phone-shaped browser.
export const PHONE = {
  ...devices["iPhone 13"],
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
};

export async function launch(headless: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ headless });
  } catch {
    // No Playwright-managed Chromium: fall back to an installed Google Chrome.
    return await chromium.launch({ channel: "chrome", headless }).catch(() => {
      throw new UserError(
        "No browser found. Install Google Chrome, or run: bunx playwright install chromium"
      );
    });
  }
}

export const hasToken = async (ctx: BrowserContext) =>
  (await ctx.cookies(H5)).some((c) => c.name === "token" && c.value);

export async function persist(ctx: BrowserContext) {
  writeAtomic(paths.session, JSON.stringify(await ctx.storageState()));
}
