# Household mode (MVP 4)

Each person in a household has their own device and their own Drift, and decides what to share with each other member. Analysis still runs only on the device. A household member receives a **summary** that this device builds, encrypts and signs. The server relays ciphertext and cannot read it.

Code: `src/lib/household/` (client, crypto, privacy boundary, alerts), `src/lib/household/server/` (mailbox), `src/app/api/household/[...path]/route.ts` (mount).

## Product rules and where they are enforced

| Rule | Enforced by |
|---|---|
| Nothing is shared by default, per person and per category | `defaultShareSettings()` is all off; `publishSummaries` skips members with no categories and deletes old copies |
| Summaries only, never messages, individual videos or searches | `buildSharedSummary` (allow-list). Tested with canary titles/URLs/search text |
| Sensitive topics are off unless turned on | `buildSharedSummary` drops sensitive topics from trends, sources, interests and digest lines unless `sensitive` is on |
| Teens 13–17 agree before joining | `joinWithInvite(..., 'teen', { consent: true })` is required. The invite role has to match |
| Teens see everything the parent sees | `previewWhatTheySee(parentId)` returns the exact object `publishSummaries` encrypts for the parent (same builder, same settings, same alerts) |
| Safety alerts go to the teen first | Alerts are detected on the teen's device and shown there right away. They are added to a summary only after 48 h, and only if the teen shares `alerts` and has not dismissed the alert |
| The member sees every question asked about them | `logQuestion` must run before an answer is shown. It sends an encrypted note, and `listQuestionsAboutMe` lists the notes |
| The server never reads shared content | End-to-end encryption, and the invite secret is kept in the URL fragment (see below) |

## Threat model

**Protects against:**
- A curious or compromised server or database dump. It sees no names, roles, settings, topics or numbers.
- Network attackers. Everything is signed and encrypted at the application layer, and TLS also applies.
- **Server-injected members.** The server could add a key to a household. Clients only trust the owner key they pinned from the invite fingerprint, plus members carrying an **owner admission**. The owner's device signs an admission only after it checks a join proof (an HMAC keyed by the invite token, which the server never sees).
- Owner key substitution at join. The joiner checks `SHA-256(owner keys)` against the fingerprint in the link and against the sealed welcome. If they differ, it leaves again.
- Tampering, re-addressing, and forging an envelope as another member. AES-GCM with the header as AAD, plus an ECDSA signature by the sender over the header and ciphertext.
- Replaying requests. Each request is signed with a timestamp and a nonce. The server rejects clock skew over 5 min and nonces it has already seen.
- Rolling back to an older summary. Clients ignore a summary whose signed `createdAt` is older than the cached one.
- Revocation. Turning a category off replaces the server copy right away. Turning everything off deletes it, and recipients' caches follow on their next fetch.

**Does not protect against (accepted for the MVP):**
- **Metadata.** The server sees household membership (member ids), who sends to whom and when, blob sizes, and the IPs and times of requests.
- **A recipient who keeps what they saw.** Revoking stops future updates. It cannot erase what the other device already decrypted, which is also cached there for offline use.
- **A modified client that skips `logQuestion`.** Answers about a member are computed on the asker's device from the summary that member shared. The question log depends on an honest client. A stronger design would answer on the member's device.
- **A compromised device.** The keys are non-extractable but usable by code running in the origin, for example after XSS.
- **Denial of service by the server.** It can drop or withhold blobs.
- **No forward secrecy for the recipient key.** Senders use a fresh ephemeral ECDH key per envelope, but recipients use a static key, so a stolen recipient key decrypts old envelopes that were stored. There is no key rotation yet.

## What the server stores (and nothing else)

| Table | Columns |
|---|---|
| households | id (random), owner member id, created_at |
| members | member id, household id, ECDH + ECDSA public keys, joined_at, is_owner, invite token hash, join proof (HMAC), owner admission (signature) |
| invites | SHA-256 of the token, household id, created_by, created_at, expires_at, `welcome` (AES-GCM under a token-derived key; holds household name, owner name and keys, role), redeemed_by |
| shares | sender, recipient, kind (`summary` / `profile`), envelope JSON (ciphertext), created_at. One row per (sender, recipient, kind), replaced on each publish |
| notes | id, sender, recipient, envelope JSON (encrypted question), created_at |

The server **cannot see** display names, household name, roles, share settings, topics, percentages, channel names, advertisers, alerts or question text.

Storage: `node:sqlite` (built into Node ≥ 22.13, no native deps) at `$DRIFT_DATA_DIR/household.sqlite`. The default directory is `.data/`. **`.data/` must be git-ignored** (it is not yet in `.gitignore`, so add `/.data/`). Set `DRIFT_HOUSEHOLD_STORE=memory` for an in-memory store. Nonces and rate-limit buckets are in process memory, so this assumes a single server instance.

## Data retention

- Summaries and profiles: only the latest copy per sender → recipient. It is deleted on revoke, leave, removal or household deletion.
- Question notes: deleted as soon as the recipient's device fetches them (they are then kept only on that device). Notes that are never fetched are pruned after **90 days**, and a mailbox holds at most 500.
- Invites: single use. Unredeemed invites are pruned after they expire (**7 days**). Redeemed invite rows stay until the household is deleted (they hold only a hash and the sealed welcome).
- Leaving (`DELETE /members/me`) deletes the member row and every share and note from or to them. When the owner deletes the household, everything in it is deleted.
- `deleteHouseholdData()` also deletes the local `drift-household` IndexedDB, including the device keys.

## Crypto

All crypto is WebCrypto and needs no dependencies. It runs in browsers, workers and Node.

- **Identity**: an ECDH P-256 key pair (decrypt) and an ECDSA P-256 key pair (sign), generated with `extractable: false` and stored as `CryptoKey` objects in IndexedDB `drift-household`. `memberId = base64url(SHA-256("drift-member-v1" ‖ ecdhRaw ‖ ecdsaRaw))`. The UI shows `shortFingerprint` (`XXXX-XXXX-XXXX`) for comparing by eye.
- **Envelope** (summary, profile, question): ephemeral ECDH with the recipient's static key → HKDF-SHA-256 (random 16-byte salt, info `drift-household/v1/<kind>/<from>/<to>`) → AES-256-GCM (random 96-bit IV, AAD = canonical JSON header `{v,kind,from,to,createdAt,epk,salt,iv}`). The sender signs canonical `{header, ct}` with ECDSA-SHA-256. The recipient checks the addressing, then the signature against the sender's **trusted** key, then decrypts.
- **Requests**: ECDSA over `DRIFT-REQ-v1\nMETHOD\npath+query\ntimestamp\nnonce\nbase64url(SHA-256(body))`, sent in the headers `x-drift-member`, `x-drift-ts`, `x-drift-nonce` and `x-drift-sig`. For first contact (create household, redeem invite) the public keys travel in the body, and the server checks that they hash to the member id.
- **Invite**: a 32-byte random token. The link is `/join#<token>.<ownerMemberId>`, and fragments are never sent to servers. The server stores `SHA-256("drift-invite-v1" ‖ token)`. Two keys are derived from the token with HKDF: an AES-GCM *welcome* key and an HMAC *join-proof* key. The joiner sends `HMAC(tokenHash ‖ memberId ‖ keys)`. The owner's device checks it, then signs the admission `ECDSA_owner({householdId, memberId, keys})`.

## Sharing categories and the summary

`ShareCategory = 'trends' | 'sources' | 'ads' | 'questions' | 'sensitive' | 'alerts'` (the current UI's `ai` maps to `questions` and `sens` to `sensitive`, and `alerts` is new).

`buildSharedSummary(insights, categories, { alerts, now })` copies fields one by one:
- `trends`: months, monthly shares (sensitive topics merged into "Other" so totals stay 100), rising/falling, range, totals, and digest lines that pass a filter. The filter drops lines with quotes, URLs, "searched for", item titles, hidden topics, or channel names when `sources` is off.
- `sources`: chosen/served %, per-platform chosen %, and the top 8 topics with served %, item count, and up to 5 channel names with counts.
- `ads`: the top 20 advertisers with counts, the ad item count, and each platform's assigned interests (sensitive ones dropped).
- `questions`: sets `allowQuestions: true`.
- `alerts`: own alerts older than 48 h that were not dismissed.
- **Never included**: `recentItems`, `turningPoints` (free text), `headline`, titles, URLs, search queries, `platforms`, raw events.

The summary deliberately leaks one thing: when sensitive topics are hidden, the size of "Other" still includes them. Enabling `alerts` shares the alert's topic (for example dieting) even when `sensitive` is off. That is the point of an alert, and the teen chooses it.

## Safety alerts

`detectSafetyAlerts(insights)` runs on the member's own device and watches only `dieting` (in the taxonomy today). It also watches `eating_disorder`, `self_harm` and `gambling`, which take effect if those topics are added later. Politics is deliberately excluded. An alert fires only if all of these hold:
1. The latest month's share is ≥ **12 %** (about 1 in 8 videos).
2. The topic rose ≥ **10 points** from its lowest point in the previous **3 months**, so it is sharp and not slow.
3. The topic has ≥ **20 items** (when known), and there are at least 2 months of data.

Wording: "…This is an estimate from what you watched, not a diagnosis." Alerts keep their first-detection time. A still-open alert for the same topic is updated in place, not repeated. `dismissSafetyAlert` ("This doesn't look right") hides the alert and keeps it from ever being shared. `publishSummaries` returns `nextAlertReleaseAt`, so the app should call it on start and at least daily.

## Teen consent (Sweden)

In Sweden, children from 13 can consent to information society services, including social media (Dataskyddslagen 2018:218, ch. 2 § 4, using GDPR art. 8). The data belongs to the teen, so Drift lets the **teen** decide:
- Joining as a teen requires an explicit `consent: true` from the teen's own device, after the consent screen. The parent cannot set the teen's choices.
- The teen chooses each category, and all of them are off unless chosen. Sensitive topics stay off unless the teen turns them on in Settings.
- The teen can see exactly what the parent sees (`previewWhatTheySee`) and every question the parent asks (`listQuestionsAboutMe`). The teen can change settings or leave at any time.
- Alerts are shown to the teen first. They reach the parent after 48 h, only if the teen allows it.
- There is no age verification in this MVP. Role is chosen by the inviter and confirmed by the joiner.

## Client API (`@/lib/household`)

Everything below is SSR-safe: importing it does nothing. `getMe()` returns `null` without IndexedDB, and the other functions throw `HouseholdError('unavailable')`. Errors are `HouseholdError { code, message, status? }`, and `code` is stable (for example `offline`, `consent_required`, `owner_mismatch`, `role_mismatch`, `invite_expired`, `invite_used`, `invite_not_found`, `questions_not_allowed`, `owner_only`, `household_full`, `rate_limited`).

```ts
getMe(): Promise<Me | null>                       // creates device keys on first call
setDisplayName(name: string): Promise<void>
createHousehold(name: string, displayName?: string): Promise<Me>
createInvite(role: 'adult' | 'teen', opts?: { label?: string; origin?: string }): Promise<CreatedInvite>
    // → { id, role, expiresAt, fragment, url: `${origin}/join#…`, qrPayload }
cancelInvite(inviteId: string): Promise<void>
joinWithInvite(linkOrFragment: string, displayName: string, role: 'adult' | 'teen',
               opts?: { consent?: boolean; share?: Partial<Record<ShareCategory, boolean>> }): Promise<Me>
    // teens: consent: true required; `share` = what the joiner shares with the inviter
listMembers(): Promise<HouseholdMember[]>         // me + members (active | pending) + owner's open invites ('invited')
    // on the owner's device this also confirms pending joins (admission)
getShareSettings(memberId: string): Promise<ShareSettings>
setShareSettings(memberId: string, patch: Partial<Record<ShareCategory, boolean>>, insights?: Insights | null): Promise<ShareSettings>
    // applies immediately: re-publishes to that member, or deletes the server copy
publishSummaries(insights?: Insights | null): Promise<{ published: string[]; removed: string[]; unchanged: string[]; nextAlertReleaseAt: string | null }>
    // default Insights = latest from @/lib/store; uploads only what changed
fetchMemberSummaries(): Promise<ReceivedSummary[]> // verified + decrypted; cached for offline
previewWhatTheySee(memberId: string, insights?: Insights | null): Promise<SharedSummary | null>  // null = nothing shared
listQuestionsAboutMe(): Promise<QuestionNote[]>    // newest first
logQuestion(memberId: string, question: string, categories: ShareCategory[]): Promise<void>
    // call before showing an answer; throws questions_not_allowed
getSafetyAlerts(insights?: Insights | null): Promise<SafetyAlertView[]>  // own (about: 'me') + released alerts of others
dismissSafetyAlert(alertId: string): Promise<void>
removeMember(memberId: string): Promise<void>      // owner only
leaveHousehold(): Promise<void>                    // the owner deletes the household for everyone
deleteHouseholdData(): Promise<{ serverDeleted: boolean }>  // leave + wipe local DB and keys
configureHousehold(opts: HouseholdClientOptions): void       // custom base URL / fetch (tests)
createHouseholdClient(opts): HouseholdClient                  // independent instance (multi-device tests)
```

Pure helpers: `buildSharedSummary`, `detectSafetyAlerts`, `shareableAlerts`, `parseInviteFragment`, plus the constants `SAFETY_THRESHOLDS`, `ALERT_SHARE_DELAY_MS` and `INVITE_TTL_MS`. Types: see `src/lib/household/types.ts`.

### UI wiring notes
- **Household tab**: use `listMembers()`. For each member, `fetchMemberSummaries()` provides the Trends, Sources and Ads panels. A missing section means the "hasn't shared this" lock card. "Compare" uses `trends.monthly`.
- **Sharing screen**: `getShareSettings` / `setShareSettings`. "Preview what Sam sees" is `previewWhatTheySee(samId)`.
- **Invite screen**: `createInvite(role)` provides `url` for "Share invite link" and `qrPayload` for the QR code. The `/join` route (UI) reads `location.hash` and calls `joinWithInvite`. For teens, show the consent screen first.
- **Teen consent screen**: add an "alerts" switch. "Save my choices" calls `joinWithInvite(hash, name, 'teen', { consent: true, share })`.
- **Alert screen**: `getSafetyAlerts()`. Show "Maya was told first, N days ago" from `toldMemberAt`. "This doesn't look right" calls `dismissSafetyAlert`.
- **Questions about you**: `listQuestionsAboutMe()`. In Ask Drift about a member, call `logQuestion` before answering.
- Call `publishSummaries()` after each import and on app start.

## Mailbox API (`/api/household/*`, all signed)

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/households` | new device (keys in body) | create household |
| DELETE | `/households/me` | owner | delete household and everything in it |
| POST | `/invites` | owner | `{tokenHash, expiresAt ≤ 7 d, welcome}` |
| DELETE | `/invites/:tokenHash` | owner | cancel |
| POST | `/invites/redeem` | new device (keys in body) | `{tokenHash, keys, joinProof}` → `{householdId, owner keys, welcome}` |
| GET | `/members` | member | members, keys and admissions (join proofs go to the owner only) |
| POST | `/members/:id/admit` | owner | `{admission}` (signature checked) |
| DELETE | `/members/:id` / `/members/me` | owner / self | remove / leave |
| PUT, DELETE | `/shares/:kind/:recipient` | sender | replace / delete a summary or profile envelope |
| GET | `/shares?kind=` | recipient | envelopes addressed to me |
| POST | `/notes/:recipient` | member | append a question envelope |
| GET | `/notes`, DELETE `/notes/:id` | recipient | read / acknowledge |

Limits: 6 members per household, 10 open invites, 300 KB bodies, a token bucket per member (120 burst, 2/s), and ±5 min clock skew.

## Known gaps

- No key rotation, multi-device per person, or account recovery. A lost device means a lost identity, so the person rejoins with a new invite.
- Replay nonces and rate limits are kept in memory per process. Registration endpoints have no per-IP limit.
- Ad "tactics" (fake urgency and similar) are not in `Insights`, so they are not shared yet.
- The digest filter is keyword-based. If the digest generator changes, revisit `filterDigest`.
- Members other than the owner see a new member as `pending` until the owner's device has run `listMembers()` or `publishSummaries()` once.
