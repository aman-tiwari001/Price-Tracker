/**
 * The one place that talks HTTP to a quick-commerce platform.
 *
 * Why two clients rather than one: these platforms sit behind different bot defences, and each
 * defence rejects a different client. Measured on 2026-09-15 against every target, with identical
 * headers and a full browser-minted session:
 *
 *   Blinkit (Cloudflare)      impit ✅ 200   cycletls ✅ 200
 *   BigBasket (Akamai)        impit ✅ 200   cycletls ✅ 200
 *   Swiggy (AWS WAF)          impit ❌ 403   cycletls ✅ 200
 *   Zepto (AWS WAF gateway)   impit ❌ 429   cycletls ❌ 429   (needs a real browser — see zepto.ts)
 *
 * Cloudflare rejects a client whose TLS handshake does not look like Chrome's, which is why no
 * amount of header tuning fixed it and why an impersonating client was required at all.
 */
import initCycleTLS, { CycleTLSClient } from 'cycletls';
import { Impit } from 'impit';
import { ImpersonationTransport, PlatformId } from '../platforms/types';

/**
 * Chrome 134 on Windows. Kept in one place because the User-Agent string and the TLS fingerprint
 * must describe the same browser — a mismatch is itself a bot signal.
 */
export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

/**
 * Firefox 133 on Windows, paired with impit's Firefox profile.
 *
 * Sending Chrome's User-Agent over Firefox's TLS handshake is a louder bot signal than either alone,
 * so the string and the profile are chosen together by `readUserAgentForTransport`.
 */
export const FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

/** Chrome 134 TLS ClientHello fingerprint, in JA3 notation, for the CycleTLS transport. */
const CHROME_JA3_FINGERPRINT =
  '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0';

const DEFAULT_TIMEOUT_MS = 15000;

export type { ImpersonationTransport } from '../platforms/types';

export interface ImpersonatedRequest {
  url: string;
  method?: 'GET' | 'POST';
  headerMap?: Record<string, string>;
  /** Already-serialised request body. Adapters stringify their own JSON so nothing is guessed here. */
  body?: string;
  timeoutMs?: number;
  /** Which platform this call belongs to, so a per-platform proxy can be applied. */
  platformId?: PlatformId;
}

export interface ImpersonatedResponse {
  httpStatus: number;
  bodyText: string;
  elapsedMilliseconds: number;
  /**
   * Cookies the server asked us to store, one raw `Set-Cookie` value per entry.
   *
   * Exposed because some platforms hand out their whole session this way: BigBasket's homepage
   * returns the service-area and CSRF cookies its listing endpoint then requires, which is what lets
   * us mint a fresh jar instead of pasting a captured one into the source.
   */
  setCookieList: string[];
}

/** `Set-Cookie` arrives as a list, or as one comma-joined string; both shapes appear in the wild. */
const readSetCookieList = (responseHeaders: any): string[] => {
  if (!responseHeaders) return [];
  const rawSetCookie =
    typeof responseHeaders.getSetCookie === 'function'
      ? responseHeaders.getSetCookie()
      : (responseHeaders['set-cookie'] ??
        responseHeaders['Set-Cookie'] ??
        responseHeaders.get?.('set-cookie'));
  if (Array.isArray(rawSetCookie)) return rawSetCookie.map(String);
  if (typeof rawSetCookie === 'string') return rawSetCookie.split(/,(?=[^;]+=)/);
  return [];
};

/** Turns raw `Set-Cookie` values into a `name=value; name=value` header, dropping the attributes. */
export const buildCookieHeaderFromSetCookieList = (
  setCookieList: string[],
  extraCookieMap: Record<string, string> = {},
): string => {
  const cookieJar: Record<string, string> = {};
  setCookieList.forEach((rawCookie) => {
    const [nameValuePair] = String(rawCookie).split(';');
    const separatorIndex = nameValuePair.indexOf('=');
    if (separatorIndex > 0) {
      cookieJar[nameValuePair.slice(0, separatorIndex).trim()] = nameValuePair
        .slice(separatorIndex + 1)
        .trim();
    }
  });
  Object.assign(cookieJar, extraCookieMap);
  return Object.entries(cookieJar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
};

/** Headers every platform expects from a real Indian Chrome user; adapters add their own on top. */
export const buildBrowserBaseHeaderMap = (origin: string): Record<string, string> => ({
  accept: '*/*',
  'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
  'user-agent': CHROME_USER_AGENT,
  origin,
  'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
});

/**
 * Optional per-platform proxy, read from the environment.
 *
 * This is the ONLY mechanism that answers an IP-level block. BigBasket's Akamai now returns
 * "Access Denied" to a real headless Chrome from this machine's IP — no TLS fingerprint, library
 * swap or browser fixes that, because the verdict is reached on the source address before any
 * fingerprint is examined. Unset means a direct connection, exactly as before.
 *
 *   PRICE_TRACKER_PROXY_URL                  — applies to every platform
 *   PRICE_TRACKER_BIGBASKET_PROXY_URL        — overrides it for BigBasket alone
 *
 * *Transferable shape:* separate WHERE a request comes from from WHAT it looks like; they fail
 * independently and need independent remedies.
 */
const readProxyUrlForPlatform = (platformId: PlatformId | undefined): string | undefined => {
  const perPlatformKey = platformId
    ? `PRICE_TRACKER_${platformId.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_PROXY_URL`
    : null;
  return (
    (perPlatformKey ? process.env[perPlatformKey] : undefined) ??
    process.env.PRICE_TRACKER_PROXY_URL ??
    undefined
  );
};

/**
 * One Impit client per (browser profile, proxy) pair, built once and reused.
 *
 * Firefox is a first-class profile, not a curiosity: when Cloudflare learned impit's Chrome
 * fingerprint, the Firefox profile still returned HTTP 200 with 12 products from the same IP in the
 * same minute. A different real browser is a different real fingerprint.
 */
const impitClientByCacheKey = new Map<string, Impit>();

const getImpitClient = (
  browserProfile: 'chrome' | 'firefox',
  proxyUrl: string | undefined,
): Impit => {
  const cacheKey = `${browserProfile}|${proxyUrl ?? 'direct'}`;
  const existingClient = impitClientByCacheKey.get(cacheKey);
  if (existingClient) return existingClient;
  const createdClient = new Impit({
    browser: browserProfile,
    ...(proxyUrl ? { proxyUrl } : {}),
  });
  impitClientByCacheKey.set(cacheKey, createdClient);
  return createdClient;
};

/**
 * CycleTLS runs a Go child process, so it is started once and shared. Started lazily because most
 * requests use impit and a process should not be spawned for a server that never touches Swiggy.
 */
let cycleTlsClientPromise: Promise<CycleTLSClient> | null = null;

const getCycleTlsClient = async (): Promise<CycleTLSClient> => {
  if (!cycleTlsClientPromise) {
    cycleTlsClientPromise = initCycleTLS();
  }
  return cycleTlsClientPromise;
};

/** Stops the CycleTLS child process. Call on server shutdown so Node can exit cleanly. */
export const shutdownImpersonationClients = async (): Promise<void> => {
  if (!cycleTlsClientPromise) return;
  const client = await cycleTlsClientPromise;
  cycleTlsClientPromise = null;
  await client.exit();
};

const fetchViaImpit = async (
  request: ImpersonatedRequest,
  browserProfile: 'chrome' | 'firefox',
): Promise<ImpersonatedResponse> => {
  const impitClient = getImpitClient(browserProfile, readProxyUrlForPlatform(request.platformId));
  const startedAt = Date.now();
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await impitClient.fetch(request.url, {
      method: request.method ?? 'GET',
      headers: request.headerMap ?? {},
      body: request.body,
      signal: abortController.signal,
    });
    const bodyText = await response.text();
    return {
      httpStatus: response.status,
      bodyText,
      elapsedMilliseconds: Date.now() - startedAt,
      setCookieList: readSetCookieList(response.headers),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const fetchViaCycleTls = async (request: ImpersonatedRequest): Promise<ImpersonatedResponse> => {
  const startedAt = Date.now();
  const client = await getCycleTlsClient();
  const proxyUrl = readProxyUrlForPlatform(request.platformId);
  const response = await client(
    request.url,
    {
      ja3: CHROME_JA3_FINGERPRINT,
      userAgent: CHROME_USER_AGENT,
      headers: request.headerMap ?? {},
      body: request.body,
      timeout: Math.ceil((request.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000),
      ...(proxyUrl ? { proxy: proxyUrl } : {}),
    },
    (request.method ?? 'GET').toLowerCase() as 'get' | 'post',
  );
  // CycleTLS parses JSON responses for us and exposes the raw text separately; normalise to text
  // so every adapter parses exactly once, in its own code, and sees the same contract.
  const bodyText =
    typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
  return {
    httpStatus: response.status,
    bodyText,
    elapsedMilliseconds: Date.now() - startedAt,
    setCookieList: readSetCookieList(response.headers),
  };
};

/**
 * Issues one HTTP request while impersonating Chrome.
 *
 * `transport` is a per-platform decision recorded in that platform's adapter, not a guess — see the
 * measured table at the top of this file.
 */
export const fetchAsImpersonatedBrowser = async (
  transport: ImpersonationTransport,
  request: ImpersonatedRequest,
): Promise<ImpersonatedResponse> => {
  if (transport === 'cycletls') return fetchViaCycleTls(request);
  return fetchViaImpit(request, transport === 'impitFirefox' ? 'firefox' : 'chrome');
};

/** The User-Agent that matches a given transport; a mismatched pair is itself a bot signal. */
export const readUserAgentForTransport = (transport: ImpersonationTransport): string =>
  transport === 'impitFirefox' ? FIREFOX_USER_AGENT : CHROME_USER_AGENT;
