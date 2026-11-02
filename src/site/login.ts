import { H5, openBrowser } from "./launch";
import { saveSession, sessionCookie } from "./session-file";

const LOGIN_PAGE = /^https:\/\/h5\.waimai\.meituan\.com\/login/u;

/**
 * Opens a visible window on Meituan's login page. The site sends the user back to the page they came
 * from once they are in, so leaving /login marks the end of the flow; closing the window cancels it.
 */
export async function login(): Promise<boolean> {
  const browser = await openBrowser(false);
  const { tab } = browser;
  try {
    let sawLogin = false;
    const loggedIn = new Promise<void>((resolve) => {
      tab.onNavigate((url) => {
        if (LOGIN_PAGE.test(url)) {
          sawLogin = true;
        } else if (sawLogin && url.startsWith(H5)) {
          resolve();
        }
      });
    });
    await tab.navigate(`${H5}/waimai/mindex/mine`);
    await Promise.race([loggedIn, tab.closed()]);
    const ok = Boolean(await sessionCookie(tab, H5, "token").catch(() => ""));
    if (ok) {
      await saveSession(tab);
    }
    return ok;
  } finally {
    await browser.close();
  }
}
