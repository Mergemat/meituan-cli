import { Cdp, Tab } from "./cdp";
import { launchChrome } from "./chrome";

export const H5 = "https://h5.waimai.meituan.com";

// The site only serves its full ordering flow to a phone. Same identity Playwright's "iPhone 13" used,
// so sessions saved by earlier versions stay consistent.
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";

export interface Browser {
  close: () => Promise<void>;
  tab: Tab;
}

/** A Chrome tab dressed as an iPhone in Shanghai. */
export async function openBrowser(headless: boolean): Promise<Browser> {
  const chrome = await launchChrome(headless);
  try {
    const cdp = await Cdp.connect(chrome.url);
    const tab = await Tab.open(cdp);
    await tab.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 3,
      height: 664,
      mobile: true,
      width: 390,
    });
    await tab.send("Emulation.setUserAgentOverride", {
      acceptLanguage: "zh-CN,zh;q=0.9",
      platform: "iPhone",
      userAgent: IPHONE_UA,
    });
    await tab.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await tab.send("Emulation.setTimezoneOverride", {
      timezoneId: "Asia/Shanghai",
    });
    await tab.send("Emulation.setLocaleOverride", { locale: "zh-CN" });
    await tab.send("Network.enable");
    await tab.send("Page.enable");
    return {
      async close() {
        cdp.close();
        await chrome.close();
      },
      tab,
    };
  } catch (e) {
    await chrome.close();
    throw e;
  }
}
