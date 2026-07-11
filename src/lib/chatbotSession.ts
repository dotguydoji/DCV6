const SESSION_ID_STORAGE_KEY = 'chatbot-session-id';

// Mirrors CHATBOT_SESSION_ID_PATTERN in netlify/functions/lib/validation.ts
// (kept as a separate literal, not a shared import, since client and
// function code are different bundles/runtimes) - matches whatever
// crypto.randomUUID() produces.
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

/**
 * A random, anonymous per-browser identifier - not tied to any real
 * identity, never sent anywhere except our own chat function, used only to
 * apply a reasonable per-session rate limit (see chatbot.ts). Not a
 * security/identity mechanism - clearing site data resets it, which is fine,
 * since the goal is deterring casual spam, not airtight enforcement.
 */
export const getOrCreateChatSessionId = (): string => {
  try {
    const existing = localStorage.getItem(SESSION_ID_STORAGE_KEY);
    // Validated against the same shape the server requires - without this,
    // a corrupted/manually-edited/future-format stored value would get sent
    // on every request, always fail server-side validation, and never
    // self-heal (localStorage.getItem would keep returning that same bad
    // value forever). Regenerating on a mismatch fixes this automatically.
    if (existing && SESSION_ID_PATTERN.test(existing)) return existing;

    const created = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage unavailable (private browsing, etc.) - fall back to an
    // in-memory-only id for this page load rather than crashing; it just
    // won't persist across reloads, which only affects rate-limit bucketing.
    return crypto.randomUUID();
  }
};
