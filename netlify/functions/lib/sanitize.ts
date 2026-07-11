/**
 * Server-side input/output hardening for the chatbot.
 *
 * What this deliberately does NOT do: keyword/phrase blocklisting for
 * things like "ignore previous instructions" or "system prompt". That
 * approach is explicitly discouraged by current guidance (OWASP's LLM Top
 * 10, LLM01: Prompt Injection) - it's trivially bypassed by rephrasing and
 * produces false positives on legitimate questions (e.g. "how do I skip/
 * ignore the beginner level"). The real defenses against prompt injection
 * here are structural, not textual:
 *   1. Instruction-level resistance baked into the knowledge base itself
 *      (see "Jailbreak / Bypass Resistance" in
 *      documentation/website-chatbot-knowledge-base.md).
 *   2. The model has no tools/actions to call and no ability to do anything
 *      beyond return text - there's nothing consequential for an injected
 *      instruction to actually achieve.
 *   3. Output is only ever rendered as an inert text node in React (never
 *      dangerouslySetInnerHTML, never eval'd/executed) - so even a
 *      "successful" injection that gets the model to output something like
 *      a fake HTML tag or script is just displayed as harmless text.
 *
 * What this module DOES do: strip characters that have no legitimate use in
 * a customer question but are real techniques for smuggling hidden
 * instructions past a human/log review (invisible Unicode) or for messing
 * with rate-limit/cache bucketing and UI rendering (control chars,
 * confusable Unicode, excessive whitespace).
 */

// Zero-width spaces/joiners, bidi override/formatting marks, invisible math
// operators, word joiner, BOM, soft hyphen - all real techniques for hiding
// text from a human skimming logs while an LLM still parses it. Written as
// explicit \u escapes (never as literal invisible characters in source) so
// this is auditable rather than an invisible landmine in the file itself.
const INVISIBLE_CHARS_PATTERN = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2061-\u2064\uFEFF]/gu;

// C0 control characters other than tab (\t, \x09), newline (\n, \x0A), and
// carriage return (\x0D) - those three are harmless and occasionally
// legitimate in a multi-line question; nothing else in this range is.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const EXCESS_NEWLINES_PATTERN = /\n{4,}/g;
const EXCESS_SPACES_PATTERN = / {3,}/g;

/**
 * Applied to the visitor's message before it touches rate limiting,
 * caching, or the model itself.
 */
// Shared by both sanitizers below - canonicalizes Unicode (closes off
// confusable/homoglyph tricks) and strips the invisible/control characters
// neither a real user message nor a real model reply ever legitimately
// needs.
const stripUnsafeChars = (raw: string): string =>
  raw.normalize('NFKC').replace(INVISIBLE_CHARS_PATTERN, '').replace(CONTROL_CHARS_PATTERN, '');

export const sanitizeUserMessage = (raw: string): string => {
  return stripUnsafeChars(raw)
    .replace(/\r\n?/g, '\n')
    .replace(EXCESS_NEWLINES_PATTERN, '\n\n\n')
    .replace(EXCESS_SPACES_PATTERN, '  ')
    .trim();
};

// Defense-in-depth cap on the model's own output, independent of
// maxOutputTokens - guards against ever displaying/caching an abnormally
// large response regardless of why one came back.
const MAX_REPLY_LENGTH = 2000;

// The widget renders replies as plain text (no markdown renderer), so any
// markdown/emphasis syntax the model still emits despite the system
// prompt's "plain conversational text" instruction would show up literally
// as stray asterisks/backticks/hashes rather than rendering as formatting.
// Stripped here as a guarantee, independent of whether the model actually
// follows that instruction on any given reply. Em/en dashes are normalized
// to a plain hyphen rather than removed outright, matching the hyphen-based
// style already used throughout the knowledge base itself.
const EM_EN_DASH_PATTERN = /[–—]/g;
const BOLD_MARKER_PATTERN = /\*\*/g;
const ITALIC_ASTERISK_PATTERN = /\*/g;
const BOLD_UNDERSCORE_PATTERN = /__/g;
const BACKTICK_PATTERN = /`/g;
const MARKDOWN_HEADER_PATTERN = /^#{1,6}\s+/gm;

const stripMarkdownFormatting = (text: string): string =>
  text
    .replace(EM_EN_DASH_PATTERN, '-')
    .replace(BACKTICK_PATTERN, '')
    .replace(BOLD_MARKER_PATTERN, '')
    .replace(ITALIC_ASTERISK_PATTERN, '')
    .replace(BOLD_UNDERSCORE_PATTERN, '')
    .replace(MARKDOWN_HEADER_PATTERN, '');

/**
 * Applied to the model's reply before it's cached or sent to the client.
 */
export const sanitizeModelReply = (raw: string): string => {
  const cleaned = stripMarkdownFormatting(stripUnsafeChars(raw)).trim();

  return cleaned.length > MAX_REPLY_LENGTH ? `${cleaned.slice(0, MAX_REPLY_LENGTH)}…` : cleaned;
};
