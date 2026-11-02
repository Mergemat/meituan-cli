import { H5, hasToken, launch, PHONE, persist } from "./launch";

const LOGIN_PAGE = /\/login/u;

/**
 * Opens a visible window on Meituan's login page. The site sends the user back to the page they
 * came from once they are in, so leaving /login marks the end of the flow.
 */
export async function login(): Promise<boolean> {
  const browser = await launch(false);
  try {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`${H5}/waimai/mindex/mine`);
    await page.waitForURL(LOGIN_PAGE, { timeout: 30_000 });
    const closed = page.waitForEvent("close", { timeout: 0 });
    const left = page.waitForURL((u) => !LOGIN_PAGE.test(u.pathname), {
      timeout: 0,
    });
    await Promise.race([closed, left]).catch(() => undefined);
    const ok = await hasToken(ctx).catch(() => false);
    if (ok) {
      await persist(ctx);
    }
    return ok;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
