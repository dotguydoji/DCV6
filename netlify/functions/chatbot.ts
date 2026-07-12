import type { Handler } from '@netlify/functions';
import { getFirestore } from 'firebase-admin/firestore';
import { checkRateLimit, checkRateLimitByIdentifier } from './lib/rateLimit';
import { getFirebaseApp } from './lib/firebase';
import { tryConsumeDailyBudget } from './lib/chatbotUsage';
import { sanitizeModelReply, sanitizeUserMessage } from './lib/sanitize';
import { isValidChatbotSessionId } from './lib/validation';
import { CHATBOT_KNOWLEDGE_BASE } from './lib/chatbotKnowledgeBase.generated';
import { CHATBOT_PRODUCT_INDEX } from './lib/chatbotProductIndex.generated';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
// The "-latest" alias auto-resolves to whichever Flash-Lite version is
// currently GA (Google gives 2 weeks' notice by email before swapping what
// it points to) - avoids ever hardcoding a specific dated model id that
// later gets deprecated/renamed out from under this function.
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Chosen to comfortably cover real questions (including wordier Taglish
// phrasing) while still blocking wall-of-text paste-spam / oversized prompt-
// injection payloads. See documentation/website-chatbot-knowledge-base.md
// for the reasoning this was tuned against.
const MAX_MESSAGE_LENGTH = 350;

// Per-session (anonymous client-generated token, not tied to any real
// identity) - the primary, most targeted layer: throttles only the one
// browser session that's actually spamming, nobody else.
const SESSION_RATE_LIMIT_MAX = 20;
const SESSION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Per-IP backstop - looser than the session limit on purpose (shared
// networks/NAT are common), only meant to catch someone rotating many fake
// session tokens from one IP.
const IP_RATE_LIMIT_MAX = 60;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Hard site-wide daily ceiling (Section: chatbotUsage.ts) - kept safely
// under Flash-Lite's free-tier 1,000 requests/day quota, so a
// traffic spike can never push this over into paid usage.
const DAILY_BUDGET_MAX = 850;

// Repeated identical questions (double-clicks, impatient re-sends, or
// someone spamming the same message) are answered from this cache instead
// of calling Gemini again - saves quota and money for zero UX cost.
interface CachedReply {
  reply: string;
  productIds: string[];
  expiresAt: number;
}
const duplicateCache = new Map<string, CachedReply>();
const DUPLICATE_CACHE_TTL_MS = 5 * 60 * 1000;

// Lets the model point the reply at specific catalog items (so the frontend
// can offer "jump to it" chips, same idea as picking a search result) -
// constrained to only real, currently-available product ids via both the
// schema enum below AND this explicit re-check after the call, so a
// hallucinated id can never reach the client even if the model's
// structured-output guarantee ever slipped. A list rather than a single id
// so a category/topic question ("do you have anything for Claude?") or a
// beginner/career question ("I'm a BSIT beginner") can surface every
// genuinely relevant item, not just one - see Section 5 of the knowledge
// base for when to use one vs. several.
const MAX_RECOMMENDED_PRODUCTS = 4;
const VALID_PRODUCT_IDS = new Set(CHATBOT_PRODUCT_INDEX.map((p) => p.id));
const PRODUCT_ID_REFERENCE = CHATBOT_PRODUCT_INDEX.map((p) => `${p.id} :: ${p.title} (${p.category})`).join('\n');
const PRODUCT_MATCHING_INSTRUCTIONS = `

---
"productIds" lets you attach clickable "view this" suggestions to your reply - set it to a list of exact ids from the catalog below (never invent an id that isn't in this list, never more than ${MAX_RECOMMENDED_PRODUCTS}):
- Reply is about/confirms ONE specific item → that item's id alone.
- Visitor asks whether you carry something in a topic/category ("do you have PDFs for Claude?", "may notes ba kayo about Python?", "anything for web dev?") → don't just say yes, list the actual matching items' ids so they can jump straight to them.
- Visitor describes themselves as a beginner in a field, or asks a related educational/career question ("I'm a BSIT beginner", "papasok akong freshman sa IT", "what should I study for CS?") → include the id(s) of the single most directly relevant study guide/level for that (e.g. an IT/BSIT beginner → the BSIT Advanced Study Guide's id; a CS beginner → the BSCS Advanced Study Guide's id; a total-beginner-in-language-X question → that language's Beginner level id), following Section 5's recommendation rules.
- Reply is general, off-catalog, declines/redirects, or you aren't confident which item(s) it refers to → empty list.

Catalog (id :: title (category)):
${PRODUCT_ID_REFERENCE}`;

// Only the site's own pages should ever be able to call this function - a
// script or another site calling it directly would bypass the session-token
// layer above entirely (it can just fabricate a fresh token every request),
// so this is what makes that layer actually mean something. Configurable via
// env var so a future custom domain doesn't require a code change.
// `||` (not `??`) deliberately - an env var accidentally set to an empty
// string in the Netlify dashboard is still a defined value (not
// null/undefined), so `??` would silently resolve to an empty allow-list
// and lock every real visitor out with a 403, with no obvious cause. Any
// falsy value here should fall back to the safe default just the same as
// the variable being unset entirely.
const ALLOWED_ORIGINS = (process.env.CHATBOT_ALLOWED_ORIGINS || 'https://dojicreates.com,https://www.dojicreates.com')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedOrigin = (headers: Record<string, string | undefined>): boolean => {
  const origin = headers['origin'];
  const referer = headers['referer'];

  if (origin) {
    return ALLOWED_ORIGINS.some((allowed) => origin === allowed);
  }
  if (referer) {
    // A string-prefix check here (referer.startsWith(allowed)) would be
    // bypassable by an attacker-controlled domain like
    // "https://dojicreates.com.evil.net" - it legitimately starts with
    // "https://dojicreates.com" as a substring even though it's a
    // completely different origin. Parsing the URL and comparing the
    // extracted origin exactly closes that off.
    try {
      const refererOrigin = new URL(referer).origin;
      return ALLOWED_ORIGINS.some((allowed) => refererOrigin === allowed);
    } catch {
      return false;
    }
  }
  // Neither header present - a real browser call from our own site almost
  // always sends at least one of these; a raw script call typically sends
  // neither. Reject rather than assume.
  return false;
};

const jsonResponse = (statusCode: number, body: Record<string, unknown>, extraHeaders?: Record<string, string>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extraHeaders },
  body: JSON.stringify(body)
});

const errorResponse = (statusCode: number, error: string) => jsonResponse(statusCode, { error });

const replyResponse = (reply: string, productIds: string[] = []) => jsonResponse(200, { reply, productIds });

const tooManyMessagesResponse = (retryAfterSeconds: number) =>
  jsonResponse(
    429,
    { error: 'Too many messages. Please wait a moment before sending another.' },
    { 'Retry-After': String(retryAfterSeconds) }
  );

const FALLBACK_BUSY_REPLY =
  "I'm getting a lot of questions right now! Please try again in a bit, or reach out to us over Messenger in the meantime.";

const FALLBACK_ERROR_REPLY =
  "Sorry, something went wrong on my end. Please try again, or reach out to us over Messenger if it keeps happening.";

// Interval-gated the same way lib/rateLimit.ts sweeps its own buckets - a
// full scan of this Map on every single incoming message (the hottest path
// in this function) is wasted work; entries are already skipped as expired
// at lookup time (see the `cached.expiresAt > now` check below), so this
// only needs to run occasionally to bound memory, not on every call.
const DUPLICATE_CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastDuplicateCacheCleanup = Date.now();

const cleanupDuplicateCache = (now: number): void => {
  if (now - lastDuplicateCacheCleanup < DUPLICATE_CACHE_CLEANUP_INTERVAL_MS) return;
  lastDuplicateCacheCleanup = now;

  for (const [key, entry] of duplicateCache) {
    if (entry.expiresAt <= now) {
      duplicateCache.delete(key);
    }
  }
};

interface GeminiChatResult {
  reply: string;
  productIds: string[];
}

const callGemini = async (userMessage: string): Promise<GeminiChatResult> => {
  // Header auth (Google's own current recommended usage) rather than a
  // ?key= query param - also keeps the key out of URLs entirely (query
  // strings are more likely to end up in access logs, browser history,
  // Referer headers, etc.).
  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: CHATBOT_KNOWLEDGE_BASE + PRODUCT_MATCHING_INSTRUCTIONS }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }]
        }
      ],
      generationConfig: {
        // A little more headroom than the reply cap alone, to cover the
        // JSON wrapper (`{"reply":"...","productIds":["...", ...]}`, up to
        // MAX_RECOMMENDED_PRODUCTS entries) without truncating the actual
        // reply content.
        maxOutputTokens: 450,
        temperature: 0.3,
        responseMimeType: 'application/json',
        // Constrains "productIds" to a list (at most MAX_RECOMMENDED_PRODUCTS
        // long) drawn only from real catalog ids - the model structurally
        // can't return an id we don't recognize, on top of the explicit
        // re-check below.
        responseSchema: {
          type: 'OBJECT',
          properties: {
            reply: { type: 'STRING' },
            productIds: {
              type: 'ARRAY',
              items: { type: 'STRING', enum: Array.from(VALID_PRODUCT_IDS) },
              maxItems: MAX_RECOMMENDED_PRODUCTS
            }
          },
          required: ['reply']
        }
      }
    })
  });

  if (!response.ok) {
    // The status code alone isn't enough to debug a 400 (malformed request)
    // vs a 403 (bad key) vs anything else - Gemini's response body has the
    // actual reason. Never sent to the client (only ever logged), but
    // without this there was nothing to diagnose from at all.
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini returned no text');
  }

  let parsed: { reply?: unknown; productIds?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    // The model didn't honor the JSON schema for some reason (rare, but
    // structured output isn't a 100% guarantee) - fall back to treating
    // the raw text as the reply itself rather than erroring the whole
    // request out over a missing product match.
    return { reply: text.trim(), productIds: [] };
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : text.trim();
  // Belt-and-suspenders re-validation even though the schema enum + maxItems
  // already constrain this - re-checked here (membership + a hard cap +
  // de-duped) in case the model's structured-output guarantee ever slips,
  // same reasoning as the old single-id check this replaced.
  const rawProductIds = Array.isArray(parsed.productIds) ? parsed.productIds : [];
  const productIds = Array.from(
    new Set(rawProductIds.filter((id): id is string => typeof id === 'string' && VALID_PRODUCT_IDS.has(id)))
  ).slice(0, MAX_RECOMMENDED_PRODUCTS);

  return { reply, productIds };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  if (!isAllowedOrigin(event.headers)) {
    return errorResponse(403, 'Forbidden');
  }

  let message: unknown;
  let sessionId: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    message = parsed.message;
    sessionId = parsed.sessionId;
  } catch {
    return errorResponse(400, 'Invalid request body');
  }

  if (!isValidChatbotSessionId(sessionId)) {
    return errorResponse(400, 'Invalid session');
  }

  // Rate limits run before message validation, on purpose - a session/IP
  // sending nothing but invalid payloads (empty, oversized, malformed) still
  // consumes a slot here. Without this, someone could send unlimited
  // trivially-rejected requests all day for free: each one is cheap to
  // reject, but "cheap per request, unlimited requests" is still an open
  // spam/cost vector against Netlify's own function-invocation quota, even
  // though it can never touch the Gemini budget (that check happens later,
  // gated behind these same limits).
  const sessionLimit = checkRateLimitByIdentifier(
    'chatbot-session',
    sessionId,
    SESSION_RATE_LIMIT_MAX,
    SESSION_RATE_LIMIT_WINDOW_MS
  );
  if (sessionLimit.limited) {
    return tooManyMessagesResponse(sessionLimit.retryAfterSeconds);
  }

  const ipLimit = checkRateLimit(event.headers, 'chatbot-ip', IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW_MS);
  if (ipLimit.limited) {
    return tooManyMessagesResponse(ipLimit.retryAfterSeconds);
  }

  if (typeof message !== 'string') {
    return errorResponse(400, 'Missing message');
  }

  // Sanitize before anything else touches the message - caching and Gemini
  // both see the cleaned version. See lib/sanitize.ts for what this strips
  // and why (invisible-Unicode injection smuggling, control characters,
  // excess whitespace) and, just as importantly, what it deliberately does
  // NOT do (no keyword/phrase blocklisting).
  const trimmedMessage = sanitizeUserMessage(message);

  if (trimmedMessage.length === 0) {
    return errorResponse(400, 'Empty message');
  }

  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(400, `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  const now = Date.now();
  cleanupDuplicateCache(now);

  const normalizedMessage = trimmedMessage.toLowerCase();
  const cacheKey = `${sessionId}::${normalizedMessage}`;
  const cached = duplicateCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return replyResponse(cached.reply, cached.productIds);
  }

  try {
    const app = getFirebaseApp();
    const db = getFirestore(app);

    const budget = await tryConsumeDailyBudget(db, DAILY_BUDGET_MAX);
    if (!budget.allowed) {
      // The one signal that the site-wide daily ceiling actually fired -
      // without this there'd be zero visibility into whether/how often this
      // ever happens (it degrades gracefully for visitors, but that also
      // means it would otherwise go completely unnoticed).
      console.warn(`chatbot daily budget exhausted: ${budget.count}/${DAILY_BUDGET_MAX}`);
      return replyResponse(FALLBACK_BUSY_REPLY);
    }

    const geminiResult = await callGemini(trimmedMessage);
    const reply = sanitizeModelReply(geminiResult.reply);
    const productIds = geminiResult.productIds;

    duplicateCache.set(cacheKey, { reply, productIds, expiresAt: now + DUPLICATE_CACHE_TTL_MS });

    return replyResponse(reply, productIds);
  } catch (err) {
    // Never leak internals to the client (the friendly fallback below is
    // all it ever sees) - but swallowing the real error entirely left
    // nothing to debug from anywhere, including our own function logs. This
    // still never exposes anything to the visitor; it only shows up in
    // Netlify's function logs (or the local `netlify dev` terminal).
    console.error('chatbot function error:', err);
    return replyResponse(FALLBACK_ERROR_REPLY);
  }
};
