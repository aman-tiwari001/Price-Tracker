# Price Tracker — revival, audit and scale-up

One consolidated document: design + implementation + running handover. A fresh session should be
able to continue from this file alone.

- **Repo**: `D:\Personal\Price Tracker` (`github.com/aman-tiwari001/Price-Tracker`, branch `main`, head `1334be9`)
- **Started**: 2026-09-14
- **Status**: Milestone 1 (audit + live API test) complete. Milestone 2 (brainstorming) not started.
- **Doc location note**: the standing rule puts maintenance docs at
  `D:/SureBright/docs/<repo>/…`. This is a personal repo, so the doc lives with the code it
  describes instead of inside the employer repo. Say the word and it moves.

---

## 1. Mental model in one paragraph

`Price Tracker` (app name `huppor-app`) is a real-time quick-commerce price comparison app. An Expo
React Native Android client asks the device for GPS coordinates, sends `q`, `lat`, `lng` and
`address` to one Express endpoint — `GET /api/app/search` — and that endpoint fans out to four
grocery platforms at once, normalises each platform's response into a common `IProduct` shape, and
returns four parallel product lists that the client renders as four side-by-side columns. Nothing is
persisted: there is no price history, no product catalogue, no scheduled crawl. Every search is a
live fan-out, cached in Redis for one hour. MongoDB exists only for an unused email/password auth
flow.

---

## 2. Execution flow, in execution order

Entry point: `frontend/app/search/index.tsx` → `handleSearch()`.

| # | File · function | What moves | Where state lands |
|---|---|---|---|
| 1 | `frontend/utils/getUserLocation.ts` · `getUserLocation()` | Expo GPS fix + `reverseGeocodeAsync` | in-memory only |
| 2 | `frontend/api/index.ts` · `searchProduct()` | `GET {serverUrl}/api/app/search?q&lat&lng&address` | — |
| 3 | `backend/src/routes/app.routes.ts` | routes `/search` → `searchProduct` | — |
| 4 | `backend/src/controllers/app.controller.ts` · `searchProduct()` | validates via `isValidLatLng`, checks Redis, fans out | Redis |
| 5a | `backend/src/adapters/blinkit.ts` · `fetchFromBlinkit()` | `GET blinkit.com/v1/layout/search` via plain `fetch` | — |
| 5b | `backend/src/adapters/zepto.ts` · `fetchFromZepto()` | Puppeteer: set address on `zeptonow.com`, scrape `/search` HTML | writes `scraped_pages/zepto.html` |
| 5c | `backend/src/adapters/bbnow.ts` · `fetchFromBBNow()` | `GET bigbasket.com/listing-svc/v2/products`, location in `_bb_lat_long` cookie | — |
| 5d | `backend/src/adapters/swiggy.ts` · `fetchFromSwiggyInstamart()` | Puppeteer loads Instamart page, then in-page `POST /api/instamart/search` | — |
| 6 | `backend/src/services/*Extractor.ts` | each raw response → `{ productList, totalProducts }` of `IProduct` | — |
| 7 | `app.controller.ts` (again) | `geoadd locations`, `SET search:<q> EX 3600` | Redis |
| 8 | `frontend/app/search/index.tsx` | four columns, each sliced to `productsLimit` = min non-zero count | React state |

All four adapters run under one `Promise.all` at `app.controller.ts:52-57`.

---

## 3. Milestone 1 — live API test, 2026-09-14

Method: reconstructed the gitignored `backend/.env`, compiled with `npx tsc`, then drove the repo's
**real** adapters and extractors from a scratchpad harness, and separately ran the full server
against Redis + MongoDB in Docker and called the endpoint with `curl`.

### 3.1 Verdict

| Platform | Live status | Evidence | Root cause |
|---|---|---|---|
| **BB Now (BigBasket)** | ✅ **Working** | HTTP 200, 20 products in 300 ms | — |
| **Blinkit** | ❌ Broken | Cloudflare HTTP 403 → `response.json()` throws → adapter returns `null` | wrong HTTP verb + stale query params + bot block |
| **Zepto** | ❌ Broken | throws `No element found for selector: [data-testid="user-address"]` at 3.5 s | missing User-Agent, then stale inner selectors |
| **Swiggy Instamart** | ❌ Broken | in-page `POST /api/instamart/search` → HTTP 403, empty body | AWS WAF bot challenge |
| **`GET /api/app/search`** | ❌ **HTTP 500 in 4.1 s** | `{"success":false,"message":"Failed to fetch data"}` | Zepto's throw rejects the whole `Promise.all` |

### 3.2 The endpoint flow, written three times

**Broken flow (today).** `searchProduct` fires all four adapters inside `Promise.all`. `fetchFromBlinkit`
and `fetchFromSwiggyInstamart` each catch their own error and resolve to `null`, so they degrade
quietly. `fetchFromZepto` has **no try/catch at all**; its `page.click('[data-testid="user-address"]')`
throws, `Promise.all` rejects on that first rejection, the outer `catch` in `searchProduct` runs, and
the client gets HTTP 500 — discarding BigBasket's perfectly good 20 products that had already arrived.

**The exact hop that failed.** `backend/src/adapters/zepto.ts:44` — `await page.click('[data-testid="user-address"]')`.
Two layers deep:

1. `page.setUserAgent(...)` is **commented out** at `zepto.ts:33-35`, so Chromium advertises its
   default `HeadlessChrome/…` User-Agent. A/B test, one variable changed:

   | case | UA sent | nav result | `[data-testid="user-address"]` |
   |---|---|---|---|
   | repo as-is | `HeadlessChrome` (default) | `chrome-error://chromewebdata/` | absent |
   | UA line restored | real Chrome 134 | `https://www.zepto.com/` | present |

2. Even with the UA restored, two more selectors are stale: `[data-testid="location-confirm-btn"]`
   no longer exists (15 s timeout, then throw), and **every** inner card selector is gone. The
   committed snapshot `backend/scraped_pages/zepto.html` has 22 each of `product-card-name`,
   `product-card-price`, `product-card-quantity`, `product-card-image`; today's live card has only
   `data-testid="product-card"` on the `<a>` wrapper and hashed class names (`B4vNQ`, `c2ahfT`)
   inside. `extractZeptoProducts` therefore returns 12 products with every field empty.

**Fixed flow (not yet implemented).** Each adapter owns its own failure; the controller switches
`Promise.all` → `Promise.allSettled` so one dead platform costs one column, not the whole response;
Zepto sets a real UA, drops the removed confirm-button step, and reads the card by structure rather
than by `data-testid`.

### 3.3 Per-platform detail

**BigBasket — works, and honours location.** Same query, three cities, `_bb_sa_ids` / `_bb_visaddr`
cookies held constant so only `_bb_lat_long` varied:

| location | products | first three |
|---|---|---|
| Delhi (Rohini) 28.7354,77.1175 | 20 | Taaza Homogenised Toned Milk 1 L ₹77 · Moti Toned Milk 450 ml ₹33 · Fit Life Low Fat 400 ml ₹30 |
| Bengaluru 12.9716,77.5946 | 20 | Full Cream Milk 500 ml ₹37 · Cow Milk 500 ml ₹44 · A2 Buffalo Milk 500 ml ₹60 |
| Mumbai 19.0760,72.8777 | 20 | Taaza Milk 500 ml ₹30 · Cow Milk 500 ml ₹30 · Cow Milk 500 ml ₹30 |

Caveat: the request still carries a **hardcoded March-2025 session cookie blob** in
`backend/src/adapters/bbnow.ts:9` (`csurftoken`, `_bb_vid`, `_bb_aid`, `_bb_sa_ids=14673`). It works
today; it is an unowned dependency that can expire at any time.

Accuracy gap: `bbnowExtractor.ts` reads `product.availability?.short_eta`, which BigBasket **no
longer returns** — today's `availability` is `{avail_status, display_mrp, display_sp, not_for_sale,
button, show_express}`. Every BigBasket product therefore has `eta: undefined`, and the client falls
back to the literal string `'Earliest'`.

**Blinkit — two separate breaks.** Cloudflare (`Server: cloudflare`, `__cf_bm` cookie) returns 403 to
any non-browser client, so the plain `fetch` in `blinkit.ts` never gets JSON. Inside a real browser
the search page loads fine (HTTP 200), which proves it is a client-fingerprint block, not an IP ban.
But the repo's request shape is also wrong: sniffing the live page shows the endpoint is now
`POST https://blinkit.com/v1/layout/search?q=milk&search_type=type_to_search`, whereas `blinkit.ts`
sends `GET …?start=0&size=20&q=`. Location now travels in cookies `gr_1_lat`, `gr_1_lon`,
`gr_1_locality`, `gr_1_landmark`, not only the `lat`/`lon` headers.

**Swiggy Instamart — WAF.** `https://www.swiggy.com/instamart/search` answers HTTP 202 with
`x-amzn-waf-action: challenge` and an empty body; page title is empty, the app never boots. The
in-page `POST /api/instamart/search` then returns HTTP 403 with a zero-length body, so `res.json()`
throws `Unexpected end of JSON input`.

### 3.4 Correctness bugs found by reading, confirmed by running

**Redis cache is location-blind — a Mumbai user can be served Delhi prices.** `app.controller.ts:41-53`:

```js
const isLocationCache = await redis.geosearch('locations', 'FROMLONLAT', lng, lat, 'BYRADIUS', 5000, 'm');
const cachedData = await redis.get(`search:${queryString}`);
if (isLocationCache && cachedData) return cached;   // <-- guard is a no-op
```

`ioredis.geosearch()` resolves to `[]` when nothing matches, and `[]` is **truthy** in JavaScript, so
`isLocationCache` is always true and the condition collapses to `if (cachedData)`. Verified against a
live Redis: seeded member `milk` at Delhi, queried from Mumbai 1 400 km away, got `[]` → truthy. The
cache key `search:milk` carries no location at all, and `geoadd('locations', lng, lat, queryString)`
uses the *query* as the geo member name, so "milk" is one point that the newest searcher overwrites.
Not biting today only because the 500 happens before any cache write.

**Puppeteer browsers leak on every failed search.** `fetchFromZepto` throws before `browser.close()`,
and `fetchFromSwiggyInstamart`'s `catch` never closes either. Measured: 19 Chromium processes from
`~/.cache/puppeteer/chrome/win64-134.0.6998.35` still alive after three search attempts.

**`npm run build` fails.** `npx tsc` exits 2 on
`src/utils/clubSimilarProducts.ts:79` — `productLink` is not on `IProduct` (which has `webLink` /
`appLink`; only the *frontend* `types/index.ts` has `productLink`). `noEmitOnError` is unset so
`dist/` is still written and `npm start` works, but `backend/dockerfile` runs `RUN npm run build`, so
**the Docker image cannot build**.

**The comparison never happens.** `clubSimilarProducts()` — the function that merges the same product
across platforms using `jaccardIndex` at a 0.7 threshold — is **never imported by anything**. Same for
`jaccardIndex`, `extractZeptoProducts2`, and the `auth` middleware (no route uses it). The app shows
four independent lists, not a per-product price comparison.

**Other repo-level gaps** (read, not run): `compose.yaml` has no Redis service although
`src/config/redis.ts` hardcodes `localhost:6379`; it maps `8080:8080` while the server listens on
`PORT` (default 5000); it builds `./frontend/Dockerfile`, which does not exist.
`frontend/utils/constant.ts` pins `serverUrl: 'http://192.168.1.4:5000'`, a LAN IP. The
`(auth)/login.tsx` and `(auth)/otp.tsx` screens are placeholder stubs and no screen calls the
backend's `/api/auth/register` or `/api/auth/login`. Frontend filter code at
`app/search/index.tsx:120-124` has its category and brand predicates commented out — only max-price
filters.

### 3.5 What was NOT checked

- The Expo Android client was never built or run; all frontend findings are read-only.
- `POST /api/auth/register` and `/api/auth/login` were never called.
- No load, concurrency, or rate-limit testing against any platform.
- Only `milk` and `amul butter` were queried, from Delhi / Bengaluru / Mumbai coordinates.
- Nothing was measured about how these platforms treat sustained automated traffic.

### 3.6 Files created during the audit

- `backend/.env` — reconstructed, gitignored, not committed.
- Scratchpad harnesses (outside the repo):
  `probeAllPlatforms.mjs`, `diagnoseBrowserPlatforms.mjs`, `testZeptoUserAgent.mjs`,
  `testZeptoFullFlowFixed.mjs`, `inspectZeptoCard.mjs`, `sniffBlinkitEndpoints.mjs`,
  `compareBBLocations.mjs`.

No repo source file was modified in Milestone 1.

---

## 4. Decision log

### D1 — Test the adapters out-of-process before booting the server
**Decided**: drive `backend/dist/adapters/*` from a standalone harness first, only then run the full
Express server.
**Why**: `connectDB()` calls `process.exit(1)` on a MongoDB failure, so a missing database hides every
adapter result behind a dead process; the harness isolates one platform per run.
**Alternative rejected**: boot the server first and read `morgan` logs — one 500 tells you the endpoint
failed but not which of four adapters caused it.
**Trade-off**: the harness imports from `dist/`, so it tests compiled output, not `src` directly.
**Would change if**: the project adds a real test runner.

### D2 — Reconstruct `.env` rather than ask for the original
**Decided**: rebuild `backend/.env` from the code's own usage and verify each URL by probing it.
**Why**: the original is gitignored and absent from the clone; without `BB_NOW_API_URL` the adapter
requests `"?type=ps&slug=milk"` against an empty base and nothing can be tested.
**Alternative rejected**: waiting for the original file — it may not exist anymore, and a verified URL
is worth more than a remembered one.
**Trade-off**: `MONGODB_URI` and `JWT_SECRET` are local throwaway values.
**Would change if**: the original `.env` turns up with credentials that matter.

### D3 — Reuse the running `sb_redis` container instead of starting a second Redis
**Decided**: point the app at the existing `sb_redis` on port 6379.
**Why**: port 6379 was already bound, and `src/config/redis.ts` hardcodes `localhost:6379` with no env
override, so a second Redis on another port would have required editing repo source.
**Alternative rejected**: editing `redis.ts` to read a port from env — a code change during a
read-only audit.
**Trade-off**: test keys landed in a shared Redis. Checked first that `locations` and `search:*` did
not exist, and deleted what the test created; verified both gone afterwards.
**Would change if**: audit work ever needs to write more than two throwaway keys.

---

## 5. Live vs scheduled, stored vs not

- **Live**: every search fans out to all four platforms at request time. There is no crawler, no
  cron, no queue.
- **Stored**: only `search:<query>` (JSON, 1 h TTL) and the `locations` geo set in Redis. MongoDB
  holds `User` and `Role` documents for an auth flow that no screen uses.
- **Deliberately not stored**: price history, product identity across platforms, per-store
  availability, user carts (`frontend/store/cartStore.ts` is in-memory Zustand, lost on app restart).

---

## 6. Open questions for Milestone 2 (brainstorming)

1. Legal/ToS posture for automated access, now that three of four platforms actively block bots.
2. Whether to keep browser automation per request, or move to a pool / scheduled crawl.
3. Whether cross-platform product matching (the dead `clubSimilarProducts`) becomes the core feature.
4. Adding Amazon Now and Flipkart Minutes.
5. Whether the app stays read-only comparison or drives deep links into each platform's cart.

---

## 7. Milestone 2 — platform access research, 2026-09-15

Method: drove a real Chrome (Puppeteer) to each storefront with a spoofed GPS fix, recorded every
XHR/fetch with full request headers and response bodies (`captureNetwork.mjs`), then ran targeted
A/B probes to find the minimum a request needs to succeed.

### 7.1 What is actually blocking us, per platform

| Platform | Edge protection | Plain-Node HTTP | Verdict |
|---|---|---|---|
| BigBasket | Akamai (telemetry only, not enforced on listing) | ✅ HTTP 200 | direct HTTP works |
| Blinkit | **Cloudflare Bot Management** | ❌ 403 even with browser cookies | needs a real browser |
| Zepto | **AWS WAF** on `www` *and separately* on `bff-gateway` | ❌ 202 challenge | needs a real browser |
| Swiggy Instamart | **AWS WAF** on `www` | ❌ 202 challenge | needs a real browser |

**The key distinction, proven by experiment.** AWS WAF issues an `aws-waf-token` cookie once its JS
challenge is solved; that cookie **is** reusable from plain Node — `GET https://www.zepto.com/`
returned HTTP 200 / 818 KB from `fetch` carrying a browser-harvested token. Cloudflare is different:
carrying `__cf_bm` and friends from a warm browser into plain Node still returned **403**, because
Cloudflare fingerprints the TLS ClientHello and HTTP/2 SETTINGS frames, which Node cannot forge.
Published guidance agrees that TLS-only impersonation is no longer sufficient on its own.

*Layer beneath:* a cookie rides at the HTTP layer, but a TLS fingerprint is established during the
handshake **before** any HTTP byte is sent — so no header or cookie can repair it.
*Transferable shape:* **authenticate-the-transport vs authenticate-the-request** — when a defence
binds to the connection, credentials harvested from another connection do not transfer.

### 7.2 The real contract for each platform (captured, not guessed)

**BigBasket** — `GET https://www.bigbasket.com/listing-svc/v2/products?type=ps&slug=<q>&page=1&bucket_id=37`,
location carried in the `_bb_lat_long` cookie (base64 of `lat|lng`). Returns
`tabs[0].product_info.products[]`. Works from plain Node today.

**Blinkit** — `POST https://blinkit.com/v1/layout/search?q=<q>&search_type=type_to_search`
(the old code sent `GET …?start=0&size=20&q=`, which now 404s). Headers `lat` / `lon`; location also
settable via cookies `gr_1_lat` / `gr_1_lon` / `gr_1_locality` / `gr_1_landmark`. Response is
`response.snippets[]` filtered to `widget_type === "product_card_snippet_type_2"`.
**`auth_key` is NOT required** — probed with and without, identical HTTP 200 and 12 products.
ETA comes from a separate `GET /v1/consumerweb/eta` (returned `eta_in_minutes: 8`).

**Zepto** — `POST https://bff-gateway.zepto.com/user-search-service/api/v3/search`, body
`{query, pageNumber, mode:"SHOW_ALL_RESULTS"}`, needs `store_id` resolved from
`GET /lms/api/v2/get_page?latitude=&longitude=`. Sends a client-computed `request-signature`.
**`bff-gateway.zepto.com` holds its own WAF challenge** — an in-page `fetch` to it from a warm
`www.zepto.com` page still returned 202, so the only proven route is to let Zepto's own app issue the
call and intercept the response (`page.on('response')`), which yielded 169 KB of real search JSON.

**Swiggy Instamart** — `POST https://www.swiggy.com/api/instamart/search/v2?offset=0&…` (the old code
used `/api/instamart/search`), body
`{facets:[],sortAttribute:"",query,search_results_offset:"0",page_type:"INSTAMART_SEARCH_PAGE",is_pre_search_tag:false}`.
Sends a computed `matcher` header — **probed without it: HTTP 200, 450 KB.** Not enforced. So a
same-origin in-page replay works.

### 7.3 Fields each platform exposes

Blinkit's `product_card_snippet_type_2.data` carries `name`, `variant` (pack size), `mrp`,
`normal_price`, `offer_tag`, `inventory`, `is_sold_out` / `product_state`, `rating` (value + count),
`brand_name`, `image` / `media_container`, `eta_tag`, `product_id`, `merchant_id`, and a deeplink.
Sponsored results are mixed in and carry `overlay_badges` with an ad image — they must be flagged or
dropped, otherwise a search for "milk" leads with a chips ad (observed).

### 7.4 The two new platforms are materially harder

- **Flipkart Minutes** — no working web storefront. `flipkart.com/minutes` renders
  "Oops! Something broke…"; `/hyperlocal/minutes` is 404; the only URL that shows prices is ordinary
  Flipkart search, which is **not** Minutes' 10-minute inventory. Flipkart's web app talks to
  `POST https://2.rome.api.flipkart.com/4/page/fetch`. Minutes appears to be app-first, so honest
  options are reversing the Android app's API or driving the generic Flipkart page API with the right
  `pageUri` — neither proven yet.
- **Amazon Now** — `amazon.in/s?k=<q>&i=nowstore` loads and the `nowstore` slug is real
  (`get-rendered-toaster?storeName=nowstore` observed), but returned no priced products because the
  session's delivery pincode was not a serviceable Amazon Now area. Needs the Amazon "glow" pincode
  flow and a pincode inside its limited launch cities. Amazon also runs AWS WAF.

Both are **pincode-scoped**, not lat/lng-scoped — a structural difference from the first four that the
location model has to accommodate.

### 7.5 Legal / ToS position — stated once

All six platforms' terms of use prohibit automated access. Price comparison over public listings is a
long-established product category and this reads data a logged-out visitor can already see, but the
exposure is real: access can be revoked at any time, and none of this is a contract. Nothing here
touches accounts, carts, checkout, or personal data. Design consequence: treat every platform as
**untrusted and revocable** — per-platform health, partial results, and graceful degradation are
architectural requirements, not polish.

### 7.6 Transport decision — measured, not assumed (2026-09-15)

Decision taken with the user: **no browser on the request path**; use a Chrome-impersonating HTTP
client, and mint any needed session credentials in a rare background browser run.

Two impersonation clients were tested against every blocked host, carrying identical headers and a
complete browser-minted session:

| Platform | Edge | `impit` | `cycletls` | real Chrome | Chosen transport |
|---|---|---|---|---|---|
| Blinkit | Cloudflare | ✅ 200, 12 products, 297 ms | ✅ 200 | ✅ | **impit**, no session needed |
| BigBasket | Akamai (passive) | ✅ 200, 20 products, 300 ms | ✅ 200 | ✅ | **impit**, `_bb_lat_long` cookie |
| Swiggy Instamart | AWS WAF | ❌ 403 | ✅ **200, 32 products, 550 ms** | ✅ | **cycletls** + minted session |
| Zepto | AWS WAF on `bff-gateway` | ❌ 429 | ❌ 429 | ✅ **200** | **browser** (only thing that works) |

**Zepto is the one genuine exception.** A browser returned HTTP 200 from `bff-gateway.zepto.com` at
the same moment, from the same IP, that both libraries got 429 — so this is not IP throttling and not
a missing header; that host rejects both impersonation stacks at the connection level. Five CycleTLS
variants were tried (two JA3 strings, forced HTTP/1.1, no JA3 at all, and the store-resolver endpoint
instead of search) — all 429.

*Layer beneath:* 429 arriving in ~27 ms with an empty body is an edge verdict, not an application
one — the request never reached Zepto's service.
*Transferable shape:* **one probe cannot separate "we are rate-limited" from "we are recognised"** —
you need a known-good client running against the same host at the same moment to tell them apart.

### 7.7 Schema drift found while mapping fields

Swiggy's product schema is now **camelCase** (`displayName`, `quantityDescription`,
`price.offerPrice.units`, `inventory.inStock`, `rating.value`); the repo's `swiggyExtractor.ts` reads
snake_case (`display_name`, `offer_price`, `in_stock`). Prices arrive in protobuf money form
`{currencyCode, units, nanos}` where `units` is a string. That alone would have produced empty cards
even if the request had succeeded.

### 7.8 Flipkart Minutes and Amazon Now — blocked, with reasons

- **Flipkart Minutes**: `POST https://1.rome.api.flipkart.com/api/4/page/fetch` with body
  `{"pageUri":"/search?q=<q>&marketplace=HYPERLOCAL&otracker=search"}` is the right call, confirmed
  live. But without a delivery address every response is a constant 2 978-byte redirect to
  `/hyperlocal-preview-page`. Clicking "Use my current location" did not resolve an address, and the
  address sheet reads "Login to see your saved addresses" — **Flipkart Minutes needs an
  authenticated account with a saved address in a serviceable area.**
- **Amazon Now**: the pincode flow works — `POST /portal-migration/hz/glow/address-change` returned
  `{"isValidAddress":1,"isAddressUpdated":1}` and the page then read "Delivering to Bengaluru 560034".
  But `amazon.in/s?k=milk&i=nowstore` resolved the department to **Amazon Fresh** and returned zero
  product cards. The URL supplied (`node=8557209031`) is the legacy Prime Now marketing page.

Neither is shipped working this round; both get an adapter that reports `unavailable` with the reason
rather than silently returning nothing.

---

## 8. Milestone 3 — rebuilt backend, 5 of 6 platforms live (2026-09-15)

### 8.1 Verified result

`npx ts-node -r dotenv/config src/scripts/verifyPlatformSearch.ts 122003 28.4419 77.0658 milk "Sector 45, Gurugram"`

| Platform | Transport | Products | Time | Notes |
|---|---|---|---|---|
| Blinkit | impit (HTTP) | 12 | 0.56 s | store ETA 18 min |
| BB Now | impit (HTTP) | 20 | 0.57 s | ETA from `ui-svc/v2/header` |
| Swiggy Instamart | CycleTLS (HTTP) + browser-minted session | 32 | 0.77 s | |
| Amazon Now | impit (HTTP) | 24 | 1.5 s | pincode-scoped |
| Zepto | headless browser | 9 | 10.7 s | only stack that gets past its gateway |
| Flipkart Minutes | — | — | — | disabled: needs a signed-in account |

**97 products, 0 unusable rows, ~20 s cold** (no cache — Redis was down for this run, and the code
degraded to live fetches exactly as designed).

Cross-platform sanity: Amul Taaza Homogenised Toned Milk 1 L reads ₹77 on both Blinkit and Zepto.

### 8.2 Bugs found and fixed while testing

| Symptom | Root cause | Fix |
|---|---|---|
| Whole endpoint HTTP 500 | `Promise.all` + `fetchFromZepto` had no try/catch | `Promise.allSettled` + per-adapter guard in `productSearchService.ts` |
| Mumbai user served Delhi prices | cache key was `search:<query>`; the `geosearch` guard was dead because `[]` is truthy | location is part of the key in `searchCacheService.ts` |
| Swiggy HTTP 202 despite a valid session | shared browser context returned **all** cookies, so Zepto's `aws-waf-token` was sent to Swiggy alongside Swiggy's own | `readBrowserCookies(page, targetUrl)` scopes to the domain |
| Zepto returned Bengaluru brands for a Gurugram request | two causes: listener armed before the address was applied, so it read the pre-address response; and the shared cookie jar carried the previous search's store | arm the listener after the address step; give every search its own `browser.createBrowserContext()` |
| Amazon showed "90% off" nonsense | `.a-text-price` is used for BOTH the struck-through MRP and the per-unit rate, so a ₹77 carton reported MRP ₹7.70 | read only `span[data-a-strike="true"]`, plus a shared guard that rejects an MRP below the selling price |
| Every BigBasket product had no ETA | `availability.short_eta` no longer exists — absent from the entire 303 KB payload | fetch `ui-svc/v2/header` in parallel, read `"eta": "21 mins"` |
| Amazon empty results blamed on serviceability | Akamai `bm-verify` interstitial was counted as "no products" | detect the interstitial, retry twice, then report `blocked` not `notServiceable` |
| `npm run build` failed (so Docker could not build) | `productLink` missing on `IProduct` in `clubSimilarProducts.ts` | added the field; `npx tsc` now exits 0 |
| 19 orphaned Chromium processes | `browser.close()` only on the success path | `withBrowserPage` closes page and context in `finally` |

*Transferable shape for the Zepto and Swiggy bugs:* **shared mutable state defeats per-request
correctness** — one browser serving many searches is a cache with no key, so isolate per request or
key it explicitly.

### 8.3 Decision log additions

**D4 — two HTTP clients instead of one.** Decided: impit for Blinkit/BigBasket/Amazon, CycleTLS for
Swiggy. Why: measured, not preferred — impit gets HTTP 403 from Swiggy's CloudFront while CycleTLS
gets 200 with 32 products. Alternative rejected: standardising on one client, which would have cost
either Swiggy or nothing gained. Trade-off: two dependencies and two code paths in
`httpImpersonationClient.ts`. Would change if: one client starts working everywhere.

**D5 — Zepto uses a browser on the request path.** Decided: navigate Zepto's own search page and
intercept its response. Why: a browser got HTTP 200 from `bff-gateway.zepto.com` in the same minute
that impit and CycleTLS both got 429 from the same IP, across five fingerprint variants — so this is
recognition, not throttling. Alternative rejected: reproducing Zepto's `request-signature`, which is
computed by their JavaScript and would break on every deploy. Trade-off: Zepto costs ~10 s and holds
a Chrome context. Would change if: an impersonation stack starts passing that host.

**D6 — matching deferred, four lists shipped.** Decided per the user: normalise all platforms into
one product shape now, cluster later. Recorded so the next session does not re-open it.

---

## 9. Milestone 4 — product clubbing + all 5 platforms green (2026-09-15, morning IST)

### 9.1 Clubbing: where it runs and how

**Backend**, in `src/services/productMatchingService.ts`, called by `productSearchService` after the
fan-out and returned as `matchedProductGroupList` alongside the per-platform lists. Backend because
it needs unit conversion, brand handling and token weighting that do not belong in a React Native
bundle, because it must be cacheable and testable, and because a future web client gets it free.

Governing principle: **prefer under-merging to over-merging.** Two rows for one product is an
annoyance; one row claiming Amul Gold costs ₹31 because it merged with Amul Taaza is a lie.

Pipeline: normalise (brand, quantity in a base unit, pack count, descriptor tokens) → block on
`(unitClass, quantityInBaseUnit, packCount)` → score (brand hard gate, IDF-weighted token overlap,
price sanity) → union-find cluster capped at one product per platform → emit canonical name, image
and one offer row per platform with the cheapest flagged.

### 9.2 Live result, pincode 122003 / "Sector 45, Gurugram", query "milk"

| Platform | Products | Time |
|---|---|---|
| Blinkit | 12 | 0.43 s |
| BB Now | 20 | 1.98 s |
| Swiggy Instamart | 32 | 23.9 s (includes a cold browser session mint) |
| Amazon Now | 24 | 3.8 s |
| Zepto | 30 | 8.1 s |

**118 products, 0 unusable rows, 17 clubbed groups, ~24 s cold.** Examples:

- Amul Cow Fresh Milk 500 ml — ₹31 on all four platforms (confidence 0.95)
- Amul Taaza Toned Fresh Milk **Pouch** 1 L — Swiggy ₹56, BB ₹59, Zepto ₹59 (save ₹3)
- Amul Taaza Homogenised Toned Milk **Tetra Pack** 1 ltr — ₹77 on Blinkit, BB, Zepto

That last pair is the point: the pouch and the tetra pack are the same brand and the same 1 L, and
they are correctly kept **apart**.

### 9.3 Three bugs fixed in this milestone

**Zepto timed out in the fan-out but worked alone.** Zepto alone: 8.3 s. With Swiggy also running:
timeout past 45 s. Root cause: Swiggy's browser session mint drove a second Chromium page at the
same moment, and page loads are CPU-bound, so the two starved each other — the one waiting on a
network response it cannot influence lost. Fixed with a one-at-a-time queue
(`runExclusivelyOnBrowser` in `headlessBrowserPool.ts`). *Transferable shape:* past the saturation
point, serialising is faster than sharing — extra concurrency converts throughput into timeouts.

**Swiggy reported 632 ms while actually costing ~24 s.** `searchOnePlatform` minted the session
before calling the adapter, and the adapter timed only its own search call, so the expensive part
was invisible — which made a starved sibling look like the problem. Now timed from the start of the
whole platform attempt.

**Clubbing over-merged a pouch with a tetra pack.** Swiggy's "Amul Taaza Milk 1 Ltr" at ₹56 was
being grouped with the ₹77 tetra packs and shown as "save ₹21". The names overlap on
{amul, taaza, milk} but Swiggy's lacks "homogenised"/"toned". Fixed by coupling two signals: a price
gap above 25 % now requires a name score of at least 0.8 (`WEAK_MATCH_MAXIMUM_PRICE_RATIO`). A
strong name can carry a big gap (a real deal); a weak name cannot.

### 9.4 Also added

- `PRICE_TRACKER_ENABLED_PLATFORM_ID_LIST` env var narrows which platforms run, so one can be
  switched off in production without a deploy, and one can be isolated while debugging.
- `warmUpHeadlessBrowser()` at server boot, keeping the Chromium launch out of the first request.
- `src/scripts/verifyProductMatching.ts` — 19 assertions over real captured product names, no
  network and no test framework; run it with `npx ts-node src/scripts/verifyProductMatching.ts`.
- `tsconfig.json` now sets `"types": ["node"]`, which it needed all along.

### 9.5 Known gaps at this point

- Redis was unavailable for every run above (Docker not running), so the cache path is exercised
  only as a fallback; **the cache-hit path is written but not yet verified end to end**.
- Swiggy's ~24 s is entirely the cold session mint. With Redis up it mints about twice a week per
  location and the platform answers in well under a second.

---

## 10. Milestone 5 — re-verification after a month of drift (2026-10-20)

Everything below is measured today, not carried over. **Platform access decayed badly in a month**,
which is the single most important fact about this project.

### 10.1 What broke, and why

| Platform | Was (2026-09-15) | Now | Root cause |
|---|---|---|---|
| Blinkit | OK via impit | **403 → fixed** | impit's Chrome TLS profile is now recognised by Cloudflare. Same minute, same IP, same headers: impit-chrome 403, impit-firefox 200 (12 products), CycleTLS 200 (12 products). The User-Agent was NOT the cause — 403 at Chrome 134, 140, 143 and 146 alike. Fixed by switching `BLINKIT_TRANSPORT` to `cycletls`. |
| BB Now | OK via impit | **403, unfixed** | Akamai now returns "Access Denied" to a REAL browser from this IP too, and a browser-minted cookie jar replayed over CycleTLS is still 403. This is an IP-level block, not a fingerprint problem — almost certainly earned by last month's test volume. |
| Amazon Now | OK (24 products) | **0 products** | Returns a page with no product grid at 122003 and 110001. Not an interstitial (that path is detected separately). Cause not yet established. |
| Swiggy Instamart | OK | intermittent | `sessionExpired` on some runs; the browser mint is the fragile part. |
| Zepto | OK | **OK** | 28-33 products, ~8 s. |
| Flipkart Minutes | OK | intermittent | `blocked` on some runs. |

*Transferable shape:* **a fingerprint is a depreciating asset.** The transport is now a per-platform
setting (`BLINKIT_TRANSPORT`), so recovery is a one-line change rather than a rewrite — and the
measured table above is how to choose the new value.

### 10.2 Bugs found and fixed today

| Symptom | Root cause | Fix |
|---|---|---|
| Amazon Now reported "no products for 122003" when asked about 110001 | the SESSION cache key held only the coordinate cell, not the pincode — two pincodes in one ~1.1 km cell shared a session | pincode added to `buildSessionRedisKey` |
| React "two children with the same key" and rows duplicating/omitting | Zepto returns the same variant id twice in one response | `dropDuplicateProducts` in the shared fan-out, so all six platforms are covered once |
| Platform status strip sliced in half on a 375×812 phone | a horizontal `ScrollView` in a column flex parent collapses without `flexGrow: 0`; the results list overlapped it | wrapped in a `flexGrow: 0` `View` |
| Location line truncated to "(default — location permission denie…" | the fallback note shared one `numberOfLines={1}` row with the address | note moved to its own line |
| Out-of-stock items looked identical to in-stock ones | stock was rendered per-offer only, never at group level, and not at all in the by-platform tiles | group-level "Out of stock on all N platforms" + per-platform list, and an "OUT OF STOCK" label plus dimming on tiles |
| A mint storm on Amazon Now | `blocked`/`rateLimited` invalidated the session, the retry re-ran the bootstrap, which re-tripped the bot check | only `sessionExpired` invalidates now |

### 10.3 Measured answers

- **Response time**: cold 54-60 s (three platforms mint browser sessions, serialised); **warm 0.34-0.74 s**.
- **Caching**: yes, two tiers. Search results **5 minutes** (`SEARCH_CACHE_TTL_SECONDS`), platform
  sessions **12 hours** (`PLATFORM_SESSION_TTL_SECONDS`). Redis when available, process-local map as
  a fallback so one server keeps working without it.
- **Clubbing accuracy**: audited over the live result — 0 groups with two offers from the same
  platform, 0 groups with an unresolved quantity, lowest confidence 0.72.
- **Field completeness** across 75 live products: name 100 %, pack size 100 %, selling price 100 %,
  image 100 %, brand 100 %, stock flag 100 %, product link 100 %, MRP 95 %, rating 85 %,
  **delivery ETA 13 %** ← the real gap. Only Flipkart Minutes ships a per-product ETA; Blinkit and
  BB Now expose a store-level ETA on separate endpoints that currently fail with the platform.

### 10.4 Not built, deliberately

Checkout-time charges — taxes, delivery fee, handling fee, surcharges, rain fee, small-order fee —
are **not** modelled. Only Flipkart Minutes exposes one today (`pricing.deliveryCharge`), and it is
`StoreLevelCharges` on the response but otherwise empty. Comparing product prices while hiding a
₹30 handling fee would be a worse lie than not comparing at all, so this needs its own pass once
platform access is stable.

---

## 11. Milestone 6 — self-adaptive access + location guarantee (2026-10-20)

The brief: platforms should mostly all work, whatever DOES return must be accurate for the shopper's
location, and the implementation must not need frequent hand-fixing.

### 11.1 Transport ladder with memory — the anti-decay mechanism

Each adapter now declares `transportLadder`, an ordered list of HTTP clients.
`productSearchService.attemptOnePlatformTransport` starts with whichever one worked last (remembered
in `platformTransportHealthStore`, Redis-backed, 7-day TTL), walks down the ladder on a
transport-shaped failure, and writes the winner back via `recordTransportSuccess`. The next search
starts on the winner.

What this replaces: when Cloudflare learned `impit`'s Chrome fingerprint, `blinkit.ts` returned HTTP
403 on every request until a human read logs and edited a constant. Now it costs one failed attempt,
once.

Only transport-shaped failures walk the ladder — `TRANSPORT_RETRYABLE_FAILURE_LIST` is
`['blocked', 'rateLimited', 'unexpectedResponse']`. `notServiceable` and `requiresAuthentication` do
not, because the platform has answered and a different client would be told the same thing three
times.

Verified live via `GET /api/app/health` after one search:

```
Blinkit      ladder=cycletls,impitFirefox,impit  lastWorking=cycletls  failures={"cycletls":0}
Swiggy       ladder=cycletls,impitFirefox,impit  lastWorking=cycletls  failures={"cycletls":0}
BB Now       ladder=impit,impitFirefox,cycletls  lastWorking=-         failures={impit:1,firefox:1,cycletls:1}
Amazon Now   ladder=impit,impitFirefox,cycletls  lastWorking=-         failures={"impit":1}
Zepto        ladder=headlessBrowser              lastWorking=-         failures={}
```

*Transferable shape:* **remember the last thing that worked.** Where a dependency's behaviour drifts
and the right choice is discoverable by trying, persisting the discovery turns a recurring outage
into a one-request hiccup.

### 11.2 Location guarantee — accuracy outranks coverage

New `locationVerificationService.checkIfResolvedLocationMatches`, gated per adapter by
`checkIfLocationNeedsVerification`. Platforms that read coordinates off every request (`blinkit.ts`,
`bigBasket.ts`) are verified by construction, so the flag is false. Platforms that bind a store to a
SESSION (`zepto.ts`, `swiggyInstamart.ts`, `amazonNow.ts`, `flipkartMinutes.ts`) set it true and must
state the delivery point they resolved in `resolvedLocationLabel`, which is then checked:

- coordinates → haversine distance, `MAXIMUM_PLAUSIBLE_STORE_DISTANCE_KM = 25` (spans a metro's
  serving area, catches another city by three orders of magnitude)
- pincode → exact match; a *different* stated pincode is conclusive rejection
- place names → distinguishing-token overlap, with `CITY_ALIAS_GROUP_LIST` (Bangalore = Bengaluru,
  Gurgaon = Gurugram), after dropping `NON_DISTINGUISHING_TOKEN_SET` words like "India", "Sector",
  "Block" that distinguish nothing

A platform that cannot prove its area is reported `failureReason: 'locationUnverified'`, its products
cleared, and it is **excluded from `buildMatchedProductGroupList`**. 11 assertions in
`src/scripts/verifyLocationVerification.ts`, including the original bug ("a Bengaluru store for a
Gurugram request is REJECTED") — all passing.

Verified live: Zepto reported `Block A - Block A, Gurugram, Haryana` → verified; Swiggy reported
`28.4419,77.0658` → verified.

*Transferable shape:* verify at the granularity the error actually occurs at. A wrong store is wrong
by city, never by street, so city agreement is the signal — checking finer produces false alarms.

### 11.3 Proxy plumbing — the only answer to an IP block

`PRICE_TRACKER_PROXY_URL`, overridable per platform (`PRICE_TRACKER_BIGBASKET_PROXY_URL`), read by
`httpImpersonationClient.readProxyUrlForPlatform` and wired into both impit and CycleTLS.
**Shipped unconfigured**: unset means a direct connection, exactly as before. BigBasket's Akamai
denies this IP even to a real headless Chrome, so no fingerprint work recovers it — only a different
exit address will.

*Transferable shape:* separate WHERE a request comes from from WHAT it looks like; they fail
independently and need independent remedies.

### 11.4 Bugs this work exposed and fixed

| Symptom | Root cause | Fix |
|---|---|---|
| Flipkart HTTP 406 on every ladder step | `flipkartMinutes.ts` REPLAYS captured Chrome headers, so a Firefox User-Agent is a guaranteed self-contradiction | `transportLadder` restricted to Chrome-profile transports, `['impit', 'cycletls']` |
| every row badged CHEAPEST when prices tie | `checkIfCheapest` marks all joint-cheapest offers, which is true and useless | `shouldShowCheapestBadge` in `ProductComparisonCard.tsx` — badge only when cheapest < dearest |
| `"India"` passed location verification | an empty resolved token set was treated as "nothing to compare, accept" | empty RESOLVED set now rejects; empty REQUESTED set still accepts |
| six adapters each had to restate three fields they cannot know | one result type served two different layers | split `PlatformAdapterResult` from `PlatformSearchResult` in `platforms/types.ts` |
| Zepto listed the same variant twice | the search response repeats a product across its own result shelves | `dropDuplicateProducts` in `productSearchService.ts` |

### 11.5 Logos

Probed every platform's own icon URL on 2026-10-20. **Only Amazon and Flipkart serve an image to a
plain request** — Blinkit 403, Zepto 202, Swiggy 404, BigBasket 404, because their bot defences cover
static assets too, so a phone fetching those URLs would render HTML. New
`frontend/components/PlatformLogo.tsx`: bundled asset → `remoteLogoUrl` where it actually works →
coloured name chip, with a runtime `onError` fallback (`hasImageFailed`) for when a once-working URL
stops working. Used by `ProductComparisonCard.tsx`, the by-platform view in `app/search/index.tsx`
and `app/(tabs)/cart.tsx`, so the fallback is identical everywhere instead of re-implemented three
times.

### 11.6 Measured state today

| Platform | Transport the ladder chose | Result |
|---|---|---|
| Blinkit | cycletls (remembered) | OK, 12 items |
| Zepto | headless browser | OK, 25 items, location verified |
| Swiggy Instamart | cycletls (remembered) | verified, 0 items this run |
| Flipkart Minutes | impit | intermittent |
| BB Now | all three tried | IP-blocked, needs a proxy |
| Amazon Now | impit | returns no product grid |

Cold 53-55 s, **warm 0.7 s**. 11 clubbed comparisons at Gurugram 122003. Mobile viewport 375x812
verified in-browser.

### 11.7 Decision log additions

**D7 — proxy support shipped but left unconfigured.**
Decision: wire proxy support through both impersonation clients, default it to unset.
Why: BigBasket's Akamai refuses this IP even to a real headless Chrome, so the block is on the
address, not the fingerprint; no amount of client work can fix it, and leaving no hook would mean
re-plumbing later under pressure.
Alternative rejected: buy and hardcode a residential proxy now — that spends money on an unverified
assumption and puts a credential in the repo.
Trade-off accepted: BB Now stays down until someone sets `PRICE_TRACKER_BIGBASKET_PROXY_URL`.
What would change it: a measurement showing Akamai blocks the fingerprint rather than the IP.

**D8 — a platform that cannot prove its location is dropped, not shown.**
Decision: `locationUnverified` platforms are excluded from the comparison entirely.
Why: the failure mode is a plausible-looking price from the wrong city, which is worse than a missing
column — a shopper cannot detect it, and acting on it means a wasted trip or a wrong basket.
Alternative rejected: show them with a warning badge — warnings are ignored, and the whole value of
the app is that the compared numbers are comparable.
Trade-off accepted: fewer columns on some searches.
What would change it: a platform that reports its store reliably enough that the gate never fires
falsely.

---

## 12. Milestone 7 — honest failures, Flipkart recovered, Amazon Now retired (2026-10-20)

Milestone 6 made access self-adaptive. This milestone is about the three platforms that were still
not reliable, and about a class of bug that the location gate exposed: **adapters stating things
about the shopper's address that the evidence did not support.**

### 12.1 Flipkart Minutes — recovered at both cities

Broken flow: `flipkartMinutes.ts` drives a headless browser through Flipkart's address picker, then
captures one `page/fetch` search request and REPLAYS its body and headers over impit/CycleTLS. The
search returned products, but `productSearchService` dropped the platform with
`locationUnverified` because `resolvedLocationLabel` was never set — the mint read the bound address
only inside its FAILURE branch, so the success path had nothing to report.

The hop that failed, and the wrong turn I took: I assumed the bound location lived in a
`locationContext` block in the captured body, and made the capture require it. That was wrong and
made things worse — every mint then failed outright. The mint trail I added
(`address suggestion clicked`, `map-sheet Confirm clicked`, `page/fetch requests seen`) settled it
in one run:

```
address suggestion clicked: true, map-sheet Confirm clicked: true,
page/fetch requests seen: 6, of which search: 2, none carrying locationContext
page read: "... Harvest Gold Zero Maida Atta Bread 6 mins Rs65 Rs63"
```

The address HAD bound — the page was rendering Minutes stock with a 6-minute ETA — while the search
body carried only `pageUri`, `pageContext`, `requestContext`. **The bound address rides in the
cookie jar, not the request body.**

Fixed flow: the capture guard is reverted; the resolved location is taken from the autocomplete row
Flipkart itself offered for the typed pincode, carried through the session as
`BOUND_LOCATION_LABEL_KEY`, and returned as `resolvedLocationLabel`. That row is Flipkart's own
resolution of the pincode rather than a restatement of what we asked for, which is the distinction
the gate exists to test. The fixed-9-second sleep after the search submit also became a poll for the
capture, with one re-submit under a different term, because re-submitting the same term is a no-op
to the client-side router.

Result: Flipkart Minutes returned 10 products and passed the gate at Bengaluru 560001 AND at
Gurugram 122003. It still 406s intermittently — the replayed `flipkart_secure` header behaves like a
short-lived token — but it now fails cleanly and never contaminates the comparison.

### 12.2 Amazon Now — disabled, with the measurement that justifies it

Amazon Now reported `notServiceable` at every pincode. `src/scripts/probeAmazonNowSearch.ts` and
`probeAmazonNowSlug.ts` settled why, with the delivery pincode accepted (`"successful":1`) in both
cities:

```
/s?k=milk&i=nowstore        HTTP 200    0 results    328 KB
/s?k=milk                   HTTP 200   52 results   1.26 MB
/s?k=milk&i=now             HTTP 200   52 results   <- ignored, identical to unfiltered
/s?k=milk&i=amazonnow       HTTP 200   52 results   <- ignored
/s?k=milk&i=instant         HTTP 200   52 results   <- ignored
/s?k=milk&i=quickcommerce   HTTP 200   52 results   <- ignored
/now, /amazonnow            HTTP 200    0 results   legacy "Download Prime Now app" page
```

Amazon ignores an unrecognised `i=` value, so every alternative slug silently serves the ordinary
marketplace catalogue — multi-day listings that would price in next to a 10-minute basket and be
wrong in a way the location gate cannot catch, because the pincode matches either way. Reporting
confirms Amazon Now is reached through the Amazon app, with no web storefront.
`checkIfEnabled: false`, with the table above in the source.

*Transferable shape:* when a filter can be silently ignored, a result that LOOKS right is the
dangerous outcome — compare against the unfiltered baseline to prove the filter did anything.

### 12.3 The false-reason class of bug

`notServiceable` renders as "Not delivering to this location" — a statement about the SHOPPER'S
ADDRESS. Three adapters made that claim on evidence that was about our own reach:

| Where | Claimed non-serviceability when | Now |
|---|---|---|
| `amazonNow.ts` | the search grid was empty, at every pincode in India | adapter disabled |
| `bigBasket.ts:215` | the search endpoint answered HTTP 404 | `unexpectedResponse` — Akamai answers a block with 404 as readily as 403 |
| `flipkartMinutes.ts` | a bound, successful response listed no products | success with an empty list → "No matching products at this store" |

*Transferable shape:* **a failure reason is a claim, and it needs evidence of the same kind.** "We
could not reach it" and "it does not serve you" are different facts; only the platform can establish
the second.

### 12.4 Zero products is now visually distinct from broken

A platform that answered successfully with nothing rendered as a GREEN chip reading "0", which reads
as a broken column. `app/search/index.tsx` now gives it a third, neutral state —
`checkIfEmptyResult` → grey chip reading "No matches", and "No matching products at this store" on
the by-platform tile. Swiggy Instamart hits this case intermittently on common queries.

### 12.5 Cart persistence — attempted, reverted, left as a known gap

Measured in the mobile viewport: a browser refresh turned a three-item list into "Your list is
empty", because `cartStore.ts` is in-memory. `zustand/middleware`'s `persist` over `AsyncStorage`
was tried and **backed out**: Expo Router renders every route once in Node to produce static HTML,
AsyncStorage's web build is CommonJS, and the whole app served `require is not defined in ES module
scope` instead of the cart. Deferring the resolve into a function did not help either — Metro
bundles a `require()` call wherever it sits.

The gap and the real fix are recorded in the source: a platform-split module
(`cartStorage.web.ts` / `cartStorage.native.ts`) so the web bundle never references AsyncStorage.
Shipping a broken app to gain persistence nobody asked for was the wrong trade.

### 12.6 Measured state, through the running server

| Platform | Gurugram 122003 | Bengaluru 560001 | Transport chosen |
|---|---|---|---|
| Blinkit | 12, verified | 12, verified | cycletls |
| Swiggy Instamart | 32, verified | 32, verified | cycletls |
| Zepto | 24, verified | 28, verified | headless browser |
| Flipkart Minutes | intermittent (10 when it lands) | intermittent (10 when it lands) | impit → cycletls |
| BB Now | blocked | blocked | all tried |

Every platform that returned products passed the location gate at both cities. Zepto resolved
`Shantala Nagar - Mahatma Gandhi Road, Shantala Nagar, Bangalore, Karnataka` against a request for
"MG Road, Bengaluru" and verified through the Bangalore/Bengaluru alias. Cold ~45 s, warm **0.7 s**.
Mobile viewport 375x812 verified end to end: search → comparison cards → by-platform view → cart,
with per-platform baskets and "Cheapest basket: Zepto at ₹25.00".

### 12.7 Decision log additions

**D9 — Amazon Now disabled rather than pointed at a slug that returns results.**
Decision: `checkIfEnabled: false`.
Why: every alternative `i=` value is ignored by Amazon and returns the ordinary marketplace
catalogue, so "fixing" it would inject multi-day-delivery listings into a quick-commerce comparison
— wrong in a way neither the location gate nor the shopper can detect.
Alternative rejected: use `i=grocery` (29 results) or `i=pantry` (48) — those are Amazon Fresh and
Pantry, different services with different delivery promises.
Trade-off accepted: five platforms instead of six.
What would change it: a reachable Amazon Now endpoint, which today means the app's own API.

**D10 — a failure reason must be evidence of the same kind as the claim.**
Decision: only report `notServiceable` when the platform states non-serviceability; HTTP 404 and an
empty product list do not qualify.
Why: "Not delivering to this location" sends the shopper to check their own address when the real
cause is on our side, and it hid a genuine block behind a plausible-sounding excuse.
Alternative rejected: keep the mapping and soften the UI wording — that hides the problem from us as
well as from the shopper.
Trade-off accepted: some genuine non-serviceability will now read as "No matches".
What would change it: a platform response that actually carries a serviceability flag.

**D11 — cart persistence reverted rather than shipped behind a workaround.**
Decision: back out `persist`, document the platform-split fix in the source.
Why: the web bundle served an error page for the entire app; a list that resets is a smaller harm
than an app that does not load, and persistence was not requested.
Alternative rejected: web-only persistence via `localStorage`, which leaves the actual target —
the phone — unpersisted, so it buys nothing where it matters.
Trade-off accepted: the list is lost on refresh or restart.
What would change it: `cartStorage.web.ts` / `cartStorage.native.ts`, roughly 20 lines.

---

## 13. Milestone 8 — Flipkart cracked, BB Now and Amazon Now settled by measurement (2026-10-25)

Target: stop guessing about the three platforms that were not working, and get most platforms
working in most cities. Result: **4 of 5 platforms return location-verified products in Gurugram,
Bengaluru and New Delhi.**

### 13.1 What the research actually showed

The premise "similar apps have solved this" did not survive checking. The closest open-source
projects — `rohanthakur0410-art/quick-commerce-price-comparator` (Django, 5+ platforms) and
`mrityunjayGit07/QuickPriceCompare` (Spring Boot, the same five platforms we target) — use
**simulated demo adapters**, not live data; the latter's README states a real-time version would
need an authorised API. No official BigBasket developer or partner API exists; the only API claim is
an affiliate network's unverified "Super Affiliates get API access".

*Transferable shape:* when a problem looks solved by others, check whether their solution is real
before copying its shape — a README that compares five platforms is not evidence that five platforms
are reachable.

### 13.2 Flipkart Minutes — cracked, three designs deep

**Broken flow.** `flipkartMinutes.ts` bound a delivery address in a browser, captured ONE search
`page/fetch` request, and replayed its body and headers over impit/CycleTLS.

**The hop that failed.** The capture is not reproducible. Two failures minutes apart on 2026-10-25
replayed DIFFERENT header sets — `flipkart_secure,x-user-agent,referer,accept-language,user-agent,
content-type`, and the same list WITHOUT `flipkart_secure`. Flipkart's gateway answers HTTP 406 when
it dislikes the set, and because 406 mapped to `blocked` rather than `sessionExpired`, a bad
template stayed cached for the session TTL and poisoned every later search for that location. That
is why CLI runs (fresh process, fresh session) succeeded while the long-running server did not.

**Fixed flow.** The browser does the search too, as `zepto.ts` already did: open the Minutes
storefront → bind the address → submit through the site's own search box → read the `page/fetch`
RESPONSE. Reading `response.json()` INSIDE the listener is the detail that makes this work; the
file's own older comment records an earlier attempt failing because it read the body after the
navigation finished, when Puppeteer can no longer load it.

**A design that was tried and reverted.** Caching the bound address as a cookie jar and restoring it
per search — intended to keep the ~25 s address flow off the per-search path. Restoring the jar into
a fresh browser context does NOT re-bind the store: every search then failed with the search box
missing, and it cost two serialised browser turns to discover that. Reverted to one browser turn
that binds and searches together.

Measured after the fix, query "bread": Gurugram 10 items / 22.3 s, Bengaluru 10 / 22.2 s, New Delhi
0 / 59.2 s — all location-verified, resolving to `122003 Bhagwan Mahaveer Marg Kanhai Sector 45
Gurugram Haryana India`, `Bengaluru Karnataka 560001 India` and `New Delhi Delhi 110001 India`.

### 13.3 BB Now — IP-blocked, proven inside a real browser

`probeBigBasketBrowser.ts` loads `bigbasket.com/ps/?q=milk` in Chromium. The page shell loads
(HTTP 200, categories render) and then **BigBasket's own JavaScript calling its own listing API is
refused three times**:

```
HTTP 403  https://www.bigbasket.com/listing-svc/v2/products?type=ps&slug=milk&page=1&bucket_id=18
```

That separates the two diagnoses conclusively: a fingerprint block would let a real browser through.
This is the IP. `bigBasket.ts` already calls exactly that endpoint, so the adapter is correct and
only the exit address is wrong — `PRICE_TRACKER_BIGBASKET_PROXY_URL` is the single lever.

*Transferable shape:* to tell "they dislike our client" from "they dislike our address", watch the
site's own code make the call — if its own request fails, nothing about our client is the cause.

### 13.4 Amazon Now — no web surface, proven the same way

`probeAmazonNowBrowser.ts` sets a Bengaluru 560001 delivery address through Amazon's own glow
endpoint from inside the page (`"successful":1`), reloads, and scans for quick-commerce entry
points. Result: **zero** matching links and **zero** matching requests. Combined with the slug table
in §12.2, Amazon Now stays disabled.

### 13.5 The browser became the bottleneck, and the limit was stale

Making Flipkart browser-driven created a second per-search browser user alongside Zepto, plus
Swiggy's session mint. Two separate ceilings then fired, and they needed different fixes:

| Symptom | Real cause | Fix |
|---|---|---|
| Zepto failed at 45 s having done no work | `headlessBrowserPool.runExclusivelyOnBrowser` allowed ONE flow, so Zepto sat behind Flipkart's ~67 s | concurrency raised to 2 |
| Zepto still failed at exactly 45.7 s | `SEARCH_RESPONSE_WAIT_MS = 40000` — Zepto's OWN internal wait, not the fan-out ceiling | raised to 75 s |
| Swiggy failed instantly with HTTP 202 | AWS WAF re-issued its challenge; the fan-out invalidated the dead session but did not retry, so the shopper paid for the discovery | one same-request retry after a session refresh |

*Transferable shape:* a concurrency limit is only correct relative to the deadline it protects —
when the deadline moves, re-derive the limit instead of inheriting it. And when a timeout fires,
confirm WHICH timeout: raising the outer ceiling did nothing for Zepto because the inner one was the
one expiring.

### 13.6 Measured state — three cities, two queries

Query "bread", all platforms location-verified:

| Platform | Gurugram 122003 | Bengaluru 560001 | New Delhi 110001 |
|---|---|---|---|
| Blinkit | 12 | 12 | 12 |
| Swiggy Instamart | 32 | 0 (no matches) | 0 (no matches) |
| Zepto | 27 | 25 | 26 |
| Flipkart Minutes | 10 | 10 | 0 (no matches) |
| BB Now | blocked | blocked | blocked |
| | **4/5, 22.3 s** | **4/5, 22.2 s** | **4/5, 59.2 s** |

### 13.7 Pricing really is per-location

The strongest evidence is not price deltas but WHICH BRANDS APPEAR. Regional dairies show up only
in their own regions, which a default-store fallback could not produce:

| Row | Gurugram | Bengaluru | New Delhi |
|---|---|---|---|
| `blinkit/nandini` (Karnataka state dairy) | — | ₹24 | — |
| `flipkartMinutes/nandini` | — | ₹24 | — |
| `zepto/nandini` | — | ₹15 | — |
| `zepto/mother dairy` (Delhi NCR dairy) | ₹28 | — | ₹30 |
| `blinkit/amul` (national) | ₹25 | ₹26 | ₹25 |

`src/scripts/verifyLocationMatrix.ts` re-runs this whole table.

### 13.8 Decision log additions

**D12 — Flipkart binds and searches in ONE browser turn, not two.**
Decision: no cached session; each search opens the storefront, binds the address and reads results.
Why: restoring a cached cookie jar into a fresh browser context does not re-bind the store, so the
"fast path" failed 100% of the time while costing two serialised browser turns.
Alternative rejected: keep the cookie cache and re-mint on failure — that is the failing path plus
a retry, i.e. strictly slower than binding once.
Trade-off accepted: ~22 s per cold Flipkart search instead of a hoped-for ~12 s.
What would change it: finding what else Flipkart binds the store with (localStorage is the next
candidate), which would make the jar restorable.

**D13 — browser concurrency raised from 1 to 2.**
Decision: `MAXIMUM_CONCURRENT_BROWSER_FLOWS = 2`.
Why: with two per-search browser adapters, a queue of one meant the second one spent its entire
budget waiting; Zepto failed having done no work at all.
Alternative rejected: keep serialising and raise ceilings further — queue time is unbounded in the
number of browser adapters, so that only postpones the same failure.
Trade-off accepted: two flows do slow each other (the 2026-09-15 measurement still holds); the
ceilings are now large enough to absorb it.
What would change it: a third browser adapter, or evidence of memory pressure from two Chromium
contexts.

**D14 — a dead session is retried once inside the same search.**
Decision: on `sessionExpired`, invalidate AND re-run that platform once with a fresh session.
Why: invalidating alone only helps the NEXT search, so the shopper who discovers the dead session is
the one who sees an empty column; Swiggy failed in 0.1 s on a WAF-expired session.
Alternative rejected: invalidate only — measurably leaves one failed search per expiry per location.
Trade-off accepted: one extra mint on the search that discovers the expiry.
What would change it: nothing short of sessions that do not expire; the retry is bounded to one to
avoid the mint storm `amazonNow.ts` once caused.
