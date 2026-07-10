# Caching Implementation Instructions

Read this in full before touching any code. This is deferred work — **do not implement until the owner explicitly says to start**, and when you do, implement it as ONE coherent pass, not piecemeal, so you don't end up with two caching layers disagreeing with each other.

This document was written after a full security review of a caching plan the owner proposed (see the "before" analysis in session history if you need the original reasoning). Several of that plan's recommendations were already implemented, some were architecturally moot, and one (long-lived HTTP caching of the actual PDF bytes) was a genuine access-control risk. This document is the corrected, safe version — follow it as written, not the original raw plan.

## Non-negotiable rules (apply to every section below)

1. **Never cache the authorization decision server-side.** `get-pdf.ts` and `get-my-library.ts` must keep re-verifying the Google ID token and re-reading the buyer's Firestore whitelist fresh on every single call, with zero exceptions. No in-memory cache inside the function, no module-level cache that survives across warm Netlify Function invocations, nothing. This is the one read standing between "admin revokes access" and "still has access" — it must never be short-circuited.
2. **Never mark anything gated by buyer identity as `Cache-Control: public`.** Only `private` (browser-local only) or `no-store`. `public` permits shared/CDN caches to serve one buyer's authorized response to a completely different, unauthenticated requester who happens to hit the same URL. This applies to PDF bytes, signed URLs, `get-my-library` responses, and admin responses — anything that isn't identical for every visitor regardless of who they are.
3. **Never extend the R2 signed URL's expiry to make HTTP caching "work better."** It stays short (5 minutes, as it is today — `SIGNED_URL_TTL_SECONDS` in `get-pdf.ts`). A longer signed URL turns any leaked/logged/shared link into standing access that bypasses re-authorization for as long as it's valid. Caching lifetime and signed-URL lifetime are two separate knobs — don't couple them.
4. **One client-side response-cache layer, not two.** `src/lib/requestCache.ts` already exists and does this correctly (see below). Do not add React Query, SWR, or any other cache-on-top-of-fetch library — that would be a second layer duplicating and potentially disagreeing with the first. If a case genuinely needs deduplication/background-revalidation behavior that `requestCache.ts` doesn't have, extend `requestCache.ts` itself rather than importing a new library.
5. **Any cache holding buyer-identifying data (email, owned-product list) must be purged on sign-out.** Currently it isn't (see fix list below). Without this, a second person signing into the same browser tab could — in principle, via devtools inspection, not through the app UI itself — see traces of the previous buyer's email and owned products until the tab closes.
6. **Revocation is TTL-bounded, not instant, and that's the accepted tradeoff.** There is no push channel (no websockets/SSE) in this architecture. "Admin revokes access → buyer's cached library list updates" happens on the *next* cache expiry or the *next* real PDF-open attempt (which always re-checks Firestore live), not the instant the admin clicks remove. Keep TTLs short enough that this window stays acceptable (see per-section numbers below) — do not extend TTLs "for better cache hit rates" without re-confirming this tradeoff is still fine with the owner.

## Current state audit — what exists today

| Mechanism | Location | Status | Verdict |
|---|---|---|---|
| Short-lived response cache (my-library + pdf signed-URL) | `src/lib/requestCache.ts` | Built correctly (sessionStorage, per-email key, TTL-based) but **disabled** — `CACHE_ENABLED = false`, left off intentionally during active development | Keep this as the one and only client response-cache layer. Re-enable when implementing (Step 1 below). |
| ID token persistence | `src/lib/googleIdentity.ts` (`getCachedIdToken`/`setCachedIdToken`) | Correct as-is | Not a response cache, don't touch. Already scoped to localStorage with expiry check, already cleared on sign-out via `clearCachedIdToken`. |
| PDF product catalog (title/price/description/thumbnail) | `src/constants.ts`, bundled at build time | Already effectively "cached forever" — zero runtime Firestore/R2 queries for this data | No action needed. This is not a caching problem; there was never a live query here to begin with. |
| Admin Files list | `admin/netlify/functions/admin-list-files.ts` | No caching — live `ListObjectsV2Command` against R2 on every load | Candidate for a short client-side cache (admin-only, low risk — see Section 4). |
| Admin Buyers list | `admin/netlify/functions/admin-list-buyers.ts` | No caching — reads the **entire** `buyers` Firestore collection on every load | Candidate for a short client-side cache; also flag to the owner as a future pagination candidate once the buyer count grows large enough that a full-collection read gets expensive. |
| Main site PWA / service worker | `vite.config.ts` (VitePWA block) | Correct as-is — precaches only the static app shell, explicit `NetworkOnly` for `/.netlify/functions/*`, `navigateFallbackDenylist` excludes `/view/` and `/my-library` | Do not loosen this. Any new caching work must preserve these exclusions exactly. |
| Admin panel PWA / service worker | `admin/vite.config.ts` | Same correct pattern as main site | Same — do not loosen. |
| PDF byte delivery | `netlify/functions/get-pdf.ts` → R2 signed URL | No HTTP caching today; fresh signed URL every call | See Section 1 — this is the one place the original plan's "highest priority" recommendation was actually dangerous as written. Implement the corrected version below, not the original. |

**Fix required before/while implementing:** `requestCache.ts` needs a sign-out purge added (Rule 5) — see Step 1.

## Implementation, by layer

### 1. PDF file delivery (was item #1 — corrected version)

Do **not** implement long-lived (7-day) HTTP caching of PDF bytes. Instead:

- Keep `SIGNED_URL_TTL_SECONDS` at 5 minutes in `get-pdf.ts` — unchanged.
- In `src/components/PdfGatePage.tsx`, the signed-URL *fetch response* (the `{ url }` from `get-pdf.ts`) is already cached client-side via `requestCache.ts` with a TTL of 4.5 minutes (`PDF_URL_CACHE_TTL_MS`), scoped per `email:productId`. This is the correct pattern — it avoids re-hitting the function on a quick reload/revisit without ever exceeding the signed URL's own validity window. When re-enabling `requestCache.ts` (Step 1), this starts working again automatically. No change needed here beyond re-enabling the cache flag.
- Do not add `Cache-Control` headers to the R2 object response itself beyond what R2 already sets by default, and do not build a stable proxy URL (e.g. `/pdf/<productId>`) for the purpose of enabling long browser HTTP caching — that reintroduces the revocation-bypass problem described in Rule 3/Rule 6. If the owner later wants to revisit this tradeoff explicitly (accepting that revoked buyers may keep already-cached PDFs), that's a deliberate product decision to make with them at that time, not a default to implement.

### 2. PDF metadata caching (was item #2)

No implementation needed. The public catalog (`src/constants.ts`) is already static and bundled at build time — there is no runtime query to cache.

For the admin-only Files list (`admin-list-files.ts`), add a short client-side cache in the admin panel (`admin/src/lib/api.ts` / `FilesPanel.tsx`) using the same `requestCache.ts`-style pattern (copy the pattern, don't share the module across the two separate Vite apps unless one is already importing from the other):
- TTL: 60-120 seconds. This is just to stop redundant R2 `ListObjectsV2Command` calls on quick tab-switching within the admin panel, not a long-term cache — the owner actively uploads/deletes files and needs to see changes reflect quickly.
- Still requires `verifyAdmin` on every actual mutating action (upload/delete) — the cache only ever serves the *list view*, never bypasses the auth check on an action.
- Invalidate (clear this specific cache key) immediately after a successful upload or delete in the same session, in addition to the TTL — same pattern as `onRefresh()` already triggers a re-fetch today.

Same treatment optionally for `admin-list-buyers.ts` if the owner notices the Buyers tab feels slow — same TTL range, same invalidate-on-mutation rule (grant/remove/delete already call `onRefresh()`).

### 3. User Library caching (was item #3)

Already built. To activate:
- Flip `CACHE_ENABLED` to `true` in `src/lib/requestCache.ts`.
- Keep the existing TTLs as designed: 15 minutes for `my-library:${email}` (`LIBRARY_CACHE_TTL_MS` in `MyLibraryPage.tsx`), 4.5 minutes for the PDF signed-URL cache. Do not extend these without re-confirming the revocation-window tradeoff (Rule 6) with the owner first.
- **Add the missing sign-out purge (Rule 5):** in `signOutOfGoogle()` (`src/lib/googleIdentity.ts`), also clear any `sessionStorage` keys under the `request-cache:` prefix used by `requestCache.ts`. Simplest approach: add a small `clearAllCachedResponses()` export to `requestCache.ts` that iterates `sessionStorage` keys with that prefix and removes them, then call it from `signOutOfGoogle()`.
- Never cache another user's library under a key that isn't scoped by their own verified email — this is already how it works (`getIdTokenEmail(idToken)` scopes every key), don't change the keying scheme.

### 4. Firestore query optimization (was item #4)

- Do not add caching inside any Netlify Function for the buyer-authorization read (Rule 1).
- `admin-list-buyers.ts` reading the full collection on every call is acceptable at current scale; if/when it becomes slow, prefer adding Firestore pagination (`.limit()`/cursor) over caching the full result, since the admin needs to see additions/removals promptly and a stale full-collection cache is more likely to confuse the owner than help them.
- No real-time listeners exist today (`onSnapshot`, etc.) — don't add any as part of this work; it's out of scope and would be a bigger architectural change than "add caching."

### 5. Server/API response caching (was item #5)

- Do not add a blanket cache rule over `/.netlify/functions/*`. Any caching here must be an explicit per-function allowlist, matching the existing `NetworkOnly` pattern already used in both `vite.config.ts` PWA configs — extend that same explicit-exclusion mindset to any new CDN/edge-level cache rule, don't invert it to an explicit-inclusion-only-for-safe-ones default (too easy for a future change to add a new sensitive function and forget to exclude it).
- Functions that are always safe to leave uncached (they already do no caching and shouldn't start): `get-pdf`, `get-my-library`, `admin-update-buyer`, `admin-delete-file`, `admin-get-upload-url` — all of these are per-user, mutating, or directly gate access.

### 6. CDN caching for static assets (was item #6)

Already effectively correct via Vite's content-hashed filenames (`index-[hash].js`, etc.) — hashed filenames mean long cache lifetimes are already safe (a content change produces a new filename, so there's no staleness risk). No changes needed. If Netlify's default static-asset headers ever need to be made explicit, a `netlify.toml` headers block for `/assets/*` with `Cache-Control: public, max-age=31536000, immutable` is safe specifically *because* of the content hashing — do not apply that same long/immutable caching to anything without a content hash in its filename (e.g. `index.html` itself must stay short-cached or revalidated, since that's what references the hashed filenames).

### 7. Frontend application caching (was item #7)

Do not add React Query, SWR, or similar. Use `requestCache.ts` exclusively (Rule 4). If a future feature genuinely needs request deduplication (two components requesting the same data simultaneously) or background revalidation that `requestCache.ts` doesn't currently do, extend that module — don't introduce a second caching paradigm alongside it.

### 8. Cache invalidation strategy (was item #8)

- On sign-out: purge `requestCache.ts` entries (Section 3) and the existing `clearCachedIdToken()` (already happens).
- On admin grant/revoke/delete/upload: the admin panel already calls `onRefresh()` after every mutation, which re-fetches live — no caching was added to the admin's own view of its own actions, so this already self-invalidates correctly. If Section 2's admin-side caching is added, make sure the same `onRefresh()` call also clears that specific cache key, not just re-fetches into a cache that still has the stale value with time left on its TTL.
- For the buyer's own experience: there is no way to push an instant update to a signed-in buyer's browser when an admin revokes them mid-session (Rule 6). Don't attempt to build one as part of this work — it's a materially bigger feature (would need websockets/SSE/polling) and wasn't asked for.

### 9. Monitoring (was item #9)

Optional, lowest priority. If added:
- Never log full ID tokens, raw signed URLs (the query string is a bearer credential for its 5-minute lifetime), or full email addresses in any third-party analytics/monitoring pipeline.
- A simple in-memory counter (cache hit vs. miss) surfaced only in local/dev console logging is sufficient for this project's scale — do not add a third-party monitoring service as part of this work unless the owner explicitly asks for one separately.

## Implementation checklist (do in this order)

1. Add `clearAllCachedResponses()` to `src/lib/requestCache.ts`, call it from `signOutOfGoogle()` in `src/lib/googleIdentity.ts`.
2. Flip `CACHE_ENABLED = true` in `src/lib/requestCache.ts`. Remove the "TEMPORARILY DISABLED" comment block, since it'll no longer be true.
3. (Optional, only if the owner asks for it explicitly) Add the short-lived admin-side list caches described in Section 2, with invalidate-on-mutation wired through the existing `onRefresh()` calls.
4. Do **not** touch `get-pdf.ts`'s signed URL TTL, R2 object headers, or add any proxy endpoint.
5. Do **not** add any new dependency (React Query, SWR, etc.).
6. Run `npx tsc --noEmit -p tsconfig.json` and `npm run build` in both the root project and `admin/`.
7. Manually verify, in order:
   - Sign in as a buyer, open a PDF, reload the page within a minute — confirm no duplicate `get-pdf` network call fires (cache hit).
   - Sign out, sign in as a *different* Google account on the same browser tab — confirm the library shows the new account's PDFs only, with zero flash of the previous account's titles.
   - As admin, revoke a buyer's access to something they have open in another tab, then have that buyer try to open a *different, new* PDF — confirm they're denied (live Firestore check still runs regardless of any client cache).
   - As admin, upload/delete a file or grant/remove a buyer — confirm the admin's own view updates immediately, not after a stale cache TTL.
