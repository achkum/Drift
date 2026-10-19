# Google sync (Data Portability API)

Drift can pull YouTube watch/search history, Google Search history and YouTube subscriptions
straight from Google, instead of the user downloading a Takeout zip and uploading it. This uses
Google's **Data Portability API**, which exists because of the EU Digital Markets Act (DMA).

Facts below were checked against Google's docs in October 2026. Links are at the end.

## How it works

```
browser                          Drift server (stateless)              Google
───────                          ────────────────────────              ──────
connectGoogle() ───────────────▶ GET /api/google/auth/start ─────────▶ consent screen
                                 (state + PKCE cookie, 10 min)          user picks scopes and
                                                                        once / 30 days / 180 days
              ◀── /connect?google=connected ◀── GET /api/google/auth/callback ◀── code
                                 exchanges code, stores the refresh
                                 token ENCRYPTED in an httpOnly cookie
syncGoogle()  ─────────────────▶ POST /api/google/export ────────────▶ portabilityArchive:initiate
              ─── poll ────────▶ GET /api/google/export/[jobId] ─────▶ archiveJobs/*/portabilityArchiveState
              ◀── signed Cloud Storage URLs
              ─── download ────▶ storage.googleapis.com (direct), or
                                 GET /api/google/download?url= (streaming pass-through, see CORS)
              unzip, re-shape to Takeout paths, importFiles() → IndexedDB (this device only)
```

* The server has **no database**. The refresh token lives only in the user's browser, in the
  `drift_google` cookie (httpOnly, `Path=/api/google`, `SameSite=Lax`, `Secure` in production),
  sealed with AES-256-GCM using `DRIFT_TOKEN_KEY`. Without the key the cookie is useless; with
  the key but without the cookie the server knows nothing.
* History is parsed, analysed and stored in the browser, like a manual upload.
* **Privacy caveat (download proxy):** Google's archive URLs are on `storage.googleapis.com`, in
  a bucket Drift does not control. If that bucket does not send CORS headers for Drift's origin,
  the browser cannot read the download, and the client falls back to `/api/google/download`,
  which streams the archive through the Drift server. Bytes then **pass through the server in
  transit**: streamed, never written to disk, never buffered whole, never logged. The privacy page
  should say this. Only allow-listed hosts (`storage.googleapis.com`, `*.storage.googleapis.com`,
  https, default port, no redirects) are fetched, and only for browsers with a Google connection.
  We could not test real signed URLs without a verified app; assume the proxy is needed
  (Cloud Storage only sends CORS headers when the bucket owner configures them).

## Routes

| Route | Does |
|---|---|
| `GET /api/google/auth/start` | Redirects to Google consent (authorization code + PKCE S256, `access_type=offline`, `prompt=consent`, the 3 scopes). |
| `GET /api/google/auth/callback` | Validates state (constant time) and PKCE, exchanges the code, calls `accessType:check`, sets cookies, redirects to `/connect?google=connected` or `/connect?google=error&reason=<not_configured\|access_denied\|invalid_state\|exchange_failed\|no_refresh_token\|no_scopes>`. |
| `GET /api/google/status` | `{ configured, connected, mock?, accessType?, expiresAt?, resources?, connectedAt?, lastExportAt? }`. `?live=1` re-runs `accessType:check`. |
| `POST /api/google/export` | Body `{ since?: ISO }`. Starts the export, returns `{ jobId, accessType, resources, startTime?, warnings }`. |
| `GET /api/google/export/[jobId]` | `{ state: IN_PROGRESS\|COMPLETE\|FAILED\|CANCELLED, urls, startTime?, exportTime?, jobs, warnings }`. |
| `GET /api/google/download?url=` | Streaming pass-through for signed archive URLs (allow-listed). |
| `POST /api/google/disconnect` | `authorization:reset` at Google, clears cookies. `{ connected: false, revoked }`. |
| `GET /api/google/mock-archive/[jobId]` | Mock mode only: the generated archive. |

Errors are always `{ error, message, retryAfter? }` with `error` one of `not_configured` (503),
`not_connected` (401), `reauth_required` (401, cookies cleared), `already_exported` (429, Google's
24 h / one-time limit), `rate_limited` (429), `permission_denied` (403), `invalid_request` (400),
`forbidden` (403, cross-site request), `not_found`, `upstream_error`.

POST routes and the download proxy refuse requests whose `Sec-Fetch-Site` is cross-site or whose
`Origin` / `Referer` is another origin.

**Incremental sync.** Google's time filter (`startTime`/`endTime`) works only for My Activity and
Chrome history resources, and mixing filtered and unfiltered resources in one request is
`INVALID_ARGUMENT`. So with `since`, the server starts two jobs: My Activity (YouTube + Search)
from `since`, and `youtube.subscriptions` in full (small). The two ids are bundled into one
`jobId` (`a~b`). If only the subscriptions job hits the 24 h limit it is skipped with a warning.
The client uses the previous job's `exportTime` minus 10 minutes as the next `since`
(Google's recommendation is to use `export_time` as the next `start_time`; events dedupe).

## Client API (`src/lib/connectors/google`)

```ts
import { getGoogleStatus, connectGoogle, disconnectGoogle, syncGoogle, shouldAutoSync,
         getGoogleSyncInfo, GoogleSyncError } from '@/lib/connectors/google';

getGoogleStatus(opts?: { live?: boolean }): Promise<GoogleStatus>
connectGoogle(): void                                   // navigates to /api/google/auth/start
disconnectGoogle(): Promise<{ revoked: boolean }>       // also forgets local sync state
syncGoogle(onProgress?: (p: ImportProgress) => void,
           opts?: { full?: boolean; signal?: AbortSignal; pollMs?: number; maxPollMs?: number; maxWaitMs?: number })
  : Promise<ImportRecord[]>                             // rejects with GoogleSyncError { code, retryAfter? }
shouldAutoSync(status?: GoogleStatus, now?: number): Promise<boolean>
getGoogleSyncInfo(): { lastSyncAt?: string; nextSince?: string; pending?: { jobId; startedAt; since? } }
```

* Progress: `stage: 'reading'` while starting, waiting ("Google is preparing your export") and
  downloading (`fraction` per part), then the pipeline's own `unzipping … done` stages.
* A started export is remembered in localStorage (`drift.google.sync`) and **resumed** after a
  reload, so reloading never burns the 24 h quota. `opts.full` ignores it and starts over.
* Polling starts at 3 s and backs off ×1.6 to 60 s (Google suggests checking every 5–60 min for
  big archives). After `maxWaitMs` (default 3 h) it rejects; the job stays pending for next time.
* The `/connect` page should read `?google=connected|error&reason=` after the redirect.

## Google Cloud setup

1. **Project.** In the Google Cloud console, create a project (or pick one) and note its ID.
   Google's setup page also asks you to attach a billing account.
2. **Enable the API.** APIs & Services → Library → "Data Portability API" → Enable, or
   `gcloud services enable dataportability.googleapis.com`.
3. **OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access):
   * User type **External**. App name, support email, logo, app home page, **privacy policy** and
     terms URLs on a domain you own (verify the domain in Search Console).
   * Data access → Add scopes (paste them):
     * `https://www.googleapis.com/auth/dataportability.myactivity.youtube`
     * `https://www.googleapis.com/auth/dataportability.myactivity.search`
     * `https://www.googleapis.com/auth/dataportability.youtube.subscriptions`
   * While in **Testing**, add test users (Google caps testing apps at 100 test users), and note:
     time-based access tokens from a Testing app last **7 days** whatever the user picks.
4. **Credentials.** Create OAuth client ID → **Web application**.
   * Authorized redirect URIs: `http://localhost:3000/api/google/auth/callback` (dev) and
     `https://<your-domain>/api/google/auth/callback` (prod). Must match exactly.
   * No JavaScript origins are needed (the browser never talks to Google's OAuth directly).
   * Copy the client ID and secret into the env vars below.
5. **Env vars** (`.env.local`, see `.env.example`):
   * `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   * `DRIFT_TOKEN_KEY`: 32 random bytes, `openssl rand -hex 32` (or
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Rotating it
     disconnects everyone (their cookies can no longer be read).
   * Optional: `DRIFT_APP_URL` (public origin, used for redirects and the same-origin check when
     behind a proxy), `GOOGLE_REDIRECT_URI` (override the derived callback URL).
   * If the client id/secret/key are missing, every route answers `{ configured: false }` / 503
     and the UI should hide Google sync.

## Verification, limits and availability

* **Verification is required before real users.** Data Portability apps go through Google's OAuth
  app verification: identity, privacy policy, a description of how the data is used, and a demo
  video of the consent flow. Google also checks the use case against the
  [Data Portability API policy](https://developers.google.com/data-portability/policy) (the consent
  request must be a clear call to action and explain the purpose of the export). Apps that request
  **restricted** scopes also need a **security assessment** (CASA, done by a third-party assessor,
  paid by the developer). Re-verification is **annual** and after changes to the approved app.
  Budget several weeks (brand verification takes days; the scope review and a security assessment
  typically take weeks). Until verified, use Testing mode with test users.
* **Access types.** On the consent screen the user picks **once**, **30 days** or **180 days**.
  * One-time: one export per resource. Another `initiate` fails with `RESOURCE_EXHAUSTED`
    ("…call ResetAuthorization and re-obtain consent…"). Drift maps it to `already_exported`;
    the user must disconnect and connect again. Google says to initiate within 24 h of consent.
  * Time-based: an export **every 24 hours** per resource until consent ends
    (`refresh_token_expires_in` = 2592000 s or 15552000 s; Drift shows it as `expiresAt`). A
    repeat within 24 h fails with HTTP 429 `RESOURCE_EXHAUSTED`, reason
    `RESOURCE_EXHAUSTED_TIME_BASED` (one doc page says `FAILED_PRECONDITION`; both are handled).
    Users can renew up to 90 days before expiry.
* **Archives.** Jobs take minutes to hours (up to 7 days). Signed URLs expire after **6 hours**;
  data stays available for **14 days**. A failed job can be retried up to 3 times
  (`portabilityArchive:retry`, not used by Drift yet; the client simply starts again).
  `authorization:reset` revokes all scopes and access to earlier archives; Google also calls it
  itself 14 days after the first initiate.
* **Who can use it.** Google's overview says to check the list of supported countries (a Google
  Account Help page linked from the [overview](https://developers.google.com/data-portability/user-guide/overview))
  before relying on it; the API was launched for users in the **EEA** under the DMA, so expect users
  elsewhere to get `permission_denied` (or no Data Portability consent at all). The API does
  **not support accounts of users under 18**, so teen profiles must keep using manual Takeout.
* **Archive layout.** Google documents the record format (My Activity JSON: `header`, `title`,
  `titleUrl`, `subtitles`, `time`, `products`, `details`, `activityControls`; subscriptions CSV
  with Channel ID / URL / Title) but **not the paths inside the zip**. Google's own quickstart
  only looks for zip entries containing `My Activity`. `src/lib/connectors/google/adapter.ts`
  therefore finds files by path hints and content and re-files them as
  `Takeout/My Activity/{YouTube,Search}/MyActivity.json` and
  `Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv`, which the existing
  YouTube parser reads. Check the adapter against the first real archive.

## Mock mode (no credentials)

```bash
DRIFT_GOOGLE_MOCK=1 npm run dev
```

* `/api/google/auth/start` skips Google and goes straight to the callback (state is still checked).
  Status reports `{ connected: true, mock: true, accessType: 'time-based' }`.
* `POST /api/google/export` returns a `mock_…` job id that completes after ~4 s; its URL points at
  `/api/google/mock-archive/<jobId>`, a zip generated on the fly: ~180 days (or since `since`) of
  synthetic YouTube watches, YouTube searches, ads ("From Google Ads"), Google searches and
  subscriptions, in the My Activity JSON format, under `Portability/My Activity/...`. The mix
  drifts from running/cooking/coding (subscribed) towards news/football/gaming over time.
* No Google request is ever made in mock mode. `DRIFT_TOKEN_KEY` is optional (a fixed dev key is
  used; mock tokens are not secrets).

curl walk-through (bash):

```bash
J=/tmp/drift-cookies
curl -s -c $J -b $J -L -o /dev/null -w '%{url_effective}\n' http://localhost:3000/api/google/auth/start
curl -s -b $J http://localhost:3000/api/google/status
JOB=$(curl -s -c $J -b $J -X POST -H 'content-type: application/json' -d '{}' http://localhost:3000/api/google/export | jq -r .jobId)
sleep 5; curl -s -b $J http://localhost:3000/api/google/export/$JOB
URL=$(curl -s -b $J http://localhost:3000/api/google/export/$JOB | jq -r '.urls[0]')
curl -s -b $J -o archive.zip "http://localhost:3000/api/google/download?url=$(jq -rn --arg u "$URL" '$u|@uri')"
curl -s -c $J -b $J -X POST http://localhost:3000/api/google/disconnect
```

## Sources

* REST reference: https://developers.google.com/data-portability/reference/rest
  (`portabilityArchive.initiate`, `archiveJobs.getPortabilityArchiveState`, `authorization.reset`,
  `accessType.check`)
* Methods (URL expiry, retries, reset): https://developers.google.com/data-portability/user-guide/methods
* Time-based access: https://developers.google.com/data-portability/user-guide/time-based
* Time filters: https://developers.google.com/data-portability/user-guide/time-filter
* My Activity schema: https://developers.google.com/data-portability/schema-reference/my_activity
* YouTube schema: https://developers.google.com/data-portability/schema-reference/youtube
* Overview (verification, under-18, availability): https://developers.google.com/data-portability/user-guide/overview
* Setup: https://developers.google.com/data-portability/user-guide/setup
* Policy: https://developers.google.com/data-portability/policy
