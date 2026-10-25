/**
 * Owns the single headless Chrome this server is allowed to run.
 *
 * The product decision was "no browser on the request path". Two things still need one:
 *
 *   1. Session minting (Swiggy). AWS WAF hands out an `aws-waf-token` only after its JavaScript
 *      proof-of-work runs, and Swiggy server-SIGNS its location cookies. Neither can be forged.
 *      The observed token lifetime is ~3 days, so this runs roughly twice a week per location, and
 *      every actual product request then goes over plain HTTP.
 *
 *   2. Zepto search. Measured 2026-09-15: `bff-gateway.zepto.com` answered a real browser HTTP 200
 *      while impit and CycleTLS both got HTTP 429 from the same IP in the same minute. That host
 *      rejects both impersonation stacks at the connection level, so Zepto is the one platform
 *      whose requests must go through a page. It is isolated here so swapping it back to HTTP later
 *      touches one file.
 *
 * The browser is launched lazily, shared by everything, and closed when idle so a server that is
 * only serving Blinkit and BigBasket never starts Chrome at all.
 */
import puppeteer, { Browser, BrowserContext, Page } from 'puppeteer';
import { CHROME_USER_AGENT } from './httpImpersonationClient';

const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;

let browserPromise: Promise<Browser> | null = null;
let idleShutdownTimer: NodeJS.Timeout | null = null;
let activePageCount = 0;

const launchBrowser = (): Promise<Browser> =>
  puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // Chrome advertises automation by default; sites read it, so turn the signal off.
      '--disable-blink-features=AutomationControlled',
      '--lang=en-IN,en',
    ],
  });

const getBrowser = async (): Promise<Browser> => {
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  const browser = await browserPromise;
  // A crashed Chrome leaves a disconnected handle behind; relaunch rather than fail every request.
  if (!browser.connected) {
    browserPromise = launchBrowser();
    return browserPromise;
  }
  return browser;
};

const scheduleIdleShutdown = (): void => {
  if (activePageCount > 0 || idleShutdownTimer) return;
  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    void closeHeadlessBrowser();
  }, IDLE_SHUTDOWN_MS);
};

export interface BrowserPageOptions {
  /** Origin to pre-grant geolocation permission to, so the site's "detect my location" works. */
  permissionOrigin: string;
  latitude: number;
  longitude: number;
}

/**
 * Runs `usePage` against a fresh, location-aware page and always closes that page afterwards.
 *
 * The callback shape matters: the old `zepto.ts` called `browser.close()` only on the success path,
 * so every failed search leaked a whole Chromium process tree (19 orphaned processes were measured
 * after three requests). A `finally` here makes that class of leak impossible.
 */
/**
 * Serialises browser work.
 *
 * Measured 2026-09-15: the Zepto adapter finishes in 8.3 s when it is the only browser user, but
 * times out past 45 s when Swiggy's session mint drives a second page at the same time. Chromium
 * page loads are CPU-bound, so two concurrent flows do not run twice as fast — they starve each
 * other, and the one waiting on a network response it cannot influence is the one that loses.
 *
 * A queue of one makes them take turns: total wall clock is the sum rather than the max, but both
 * succeed. With Redis up, Swiggy's mint happens about twice a week per location, so in steady state
 * this queue holds only Zepto and costs nothing.
 *
 * *Transferable shape:* when a shared resource is saturated, serialising is faster than sharing —
 * concurrency past the saturation point converts throughput into timeouts.
 */
/**
 * Two at a time, not one.
 *
 * The queue of one above was right when Zepto was the only per-search browser user and its ceiling
 * was 45 s. Since `flipkartMinutes.ts` became browser-driven on 2026-10-25 there are two per-search
 * users plus Swiggy's session mint, and a queue of one meant Flipkart held the browser for ~67 s
 * while Zepto sat waiting and expired — measured at Gurugram and Bengaluru, where Zepto failed at
 * 45 s having done no work at all.
 *
 * Two concurrent flows do still slow each other down; that part of the original measurement holds.
 * What changed is the budget: the ceilings are now 95-150 s, so a flow running at half speed
 * finishes comfortably, while the queue time it no longer pays was unbounded.
 *
 * *Transferable shape:* a concurrency limit is only correct relative to the deadline it protects —
 * when the deadline moves, re-derive the limit instead of inheriting it.
 */
const MAXIMUM_CONCURRENT_BROWSER_FLOWS = 2;
let activeBrowserFlowCount = 0;
const waitingBrowserFlowResolverList: (() => void)[] = [];

const acquireBrowserSlot = async (): Promise<void> => {
  if (activeBrowserFlowCount < MAXIMUM_CONCURRENT_BROWSER_FLOWS) {
    activeBrowserFlowCount += 1;
    return;
  }
  // The slot is handed over directly by `releaseBrowserSlot`, so the count already covers us.
  await new Promise<void>((resolve) => waitingBrowserFlowResolverList.push(resolve));
};

const releaseBrowserSlot = (): void => {
  const nextWaitingResolver = waitingBrowserFlowResolverList.shift();
  if (nextWaitingResolver) nextWaitingResolver();
  else activeBrowserFlowCount -= 1;
};

const runExclusivelyOnBrowser = async <TResult>(work: () => Promise<TResult>): Promise<TResult> => {
  await acquireBrowserSlot();
  try {
    return await work();
  } finally {
    // Released in `finally` so a thrown turn cannot strand a slot and wedge every later one.
    releaseBrowserSlot();
  }
};

export const withBrowserPage = async <TResult>(
  options: BrowserPageOptions,
  usePage: (page: Page) => Promise<TResult>,
): Promise<TResult> => runExclusivelyOnBrowser(() => openPageAndRun(options, usePage));

const openPageAndRun = async <TResult>(
  options: BrowserPageOptions,
  usePage: (page: Page) => Promise<TResult>,
): Promise<TResult> => {
  const browser = await getBrowser();
  activePageCount += 1;
  let page: Page | null = null;
  let browserContext: BrowserContext | null = null;
  try {
    /**
     * Each call gets its OWN cookie jar.
     *
     * Sharing the default context leaked location state between searches: Zepto stores the chosen
     * delivery point in cookies, so a second search inherited the first one's store and kept
     * returning Bengaluru stock for a Gurugram request even though the address picker had been
     * driven correctly. An isolated context makes every search start from a clean session, the way
     * a new visitor would.
     */
    browserContext = await browser.createBrowserContext();
    await browserContext.overridePermissions(options.permissionOrigin, ['geolocation']);
    page = await browserContext.newPage();
    await page.setUserAgent(CHROME_USER_AGENT);
    await page.setViewport({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8' });
    await page.setGeolocation({
      latitude: options.latitude,
      longitude: options.longitude,
      accuracy: 20,
    });
    return await usePage(page);
  } finally {
    if (page) await page.close().catch(() => undefined);
    // Closing the context discards its cookies, which is what keeps searches isolated.
    if (browserContext) await browserContext.close().catch(() => undefined);
    activePageCount -= 1;
    scheduleIdleShutdown();
  }
};

/**
 * Reads the cookies that belong to `targetUrl`, as a ready-to-send `Cookie` header plus a lookup.
 *
 * Scoping to the URL is not a nicety. One browser is shared by every platform, so reading the whole
 * context's jar mixes sites together — and because Zepto and Swiggy BOTH set a cookie literally
 * named `aws-waf-token`, an unscoped read produced a header containing two of them and Swiggy's WAF
 * answered HTTP 202. `page.cookies(url)` applies the browser's own domain and path matching, which
 * is exactly the rule a real request would use.
 */
export const readBrowserCookies = async (
  page: Page,
  targetUrl: string,
): Promise<{ cookieHeader: string; cookieByName: Record<string, string> }> => {
  const cookieList = await page.cookies(targetUrl);
  return {
    cookieHeader: cookieList.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
    cookieByName: Object.fromEntries(cookieList.map((cookie) => [cookie.name, cookie.value])),
  };
};

/**
 * Launches Chrome ahead of the first search.
 *
 * Measured 2026-09-15: the Zepto adapter alone completes in 8.7 s, but inside the five-platform
 * fan-out it hit a 30 s timeout. The difference is contention at the worst possible moment — the
 * Chromium cold start competes with four HTTP adapters, a CycleTLS Go process and ~1.3 MB of HTML
 * parsing. Paying the launch at boot moves that cost out of the request path entirely.
 */
export const warmUpHeadlessBrowser = async (): Promise<void> => {
  try {
    await getBrowser();
  } catch (error) {
    // A failed warm-up is not fatal: the first search will simply pay for the launch itself.
    console.error(
      'Headless browser warm-up failed:',
      error instanceof Error ? error.message : error,
    );
  }
};

/** Shuts Chrome down. Called on idle and on server shutdown. */
export const closeHeadlessBrowser = async (): Promise<void> => {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending.catch(() => null);
  if (browser) await browser.close().catch(() => undefined);
};
