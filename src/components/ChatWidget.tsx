import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, FileText, Send, X } from 'lucide-react';
import { getOrCreateChatSessionId } from '../lib/chatbotSession';
import { getProductById } from '../constants';
import { Product } from '../types';

const MAX_MESSAGE_LENGTH = 350;

// Matches the breakpoint the site's own nav already uses to decide
// "mobile vs desktop" (Navbar's search box goes from a full-screen sheet to
// an inline dropdown at the same width) - reused here so "close the chat
// first on mobile" kicks in at the same point the rest of the UI already
// treats as the mobile/desktop line.
const MOBILE_BREAKPOINT_QUERY = '(max-width: 1023px)';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Only ever real, currently-available catalog ids (validated server-side) - never trusted further than "look up a real product or get ignored." Plural: a topic/category question ("do you have PDFs for Claude?") or a beginner/career question can surface several relevant items, not just one. */
  productIds?: string[];
}

interface ChatWidgetProps {
  /** Same handler the search bar uses (App.tsx's handleSearchSelect) - highlights the product and scrolls its category into view. */
  onProductSelect?: (product: Product) => void;
}

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  text: 'Uy! Ako yung AI assistant ng DC Library. Ano ang maitutulong ko - tanong mo lang tungkol sa notes namin, presyo, o paano gamitin yung site!'
};

// How long the simulated "typing" beat shows before the greeting message
// itself appears - purely cosmetic (see the useEffect below), not a real
// network delay.
const GREETING_TYPING_DELAY_MS = 700;

const TypingIndicator: React.FC = () => (
  <div className="self-start bg-surface border border-border-hairline rounded-sm px-4 py-3.5 flex items-center gap-1.5">
    <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

/**
 * Every message is rendered as a plain text node (never dangerouslySetInnerHTML,
 * never a markdown renderer) - both to match the "plain conversational text"
 * response style in the knowledge base, and so nothing a visitor (or a
 * successful prompt injection) types or gets replied with can ever execute
 * as HTML/script. React already escapes text children by default; this
 * component just never opts out of that.
 *
 * Uses the same neo-minimalist theme tokens (surface/text/border) as the
 * rest of the site, so it themes correctly with the light/dark toggle -
 * this used to be a deliberately separate orange/black/gray palette, but
 * now joins the unified design system.
 */
export const ChatWidget: React.FC<ChatWidgetProps> = ({ onProductSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  // Starts empty rather than pre-seeded with the greeting - the greeting is
  // appended (see the effect below) the first time the widget opens, so it
  // mounts fresh and plays the pop-in animation like a real just-arrived
  // message instead of just sitting there already visible.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGreetingTyping, setIsGreetingTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasGreetedRef = useRef(false);
  // Admin recording mode (App.tsx) conditionally unmounts this component -
  // without this guard, a reply arriving after that toggle would call
  // setState on an unmounted component.
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Re-asserted true on every effect run, not just declared in the
    // useRef initializer - React StrictMode's dev-only double-invoke
    // (mount -> cleanup -> mount again) runs this cleanup once before the
    // "real" mount settles, which would otherwise leave this stuck at
    // false for the component's entire actual mounted lifetime with
    // nothing ever setting it back to true.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGreetingTyping, isOpen]);

  useEffect(() => {
    if (!isOpen || hasGreetedRef.current) return;

    // The "already greeted" flag is only set once the timer actually fires,
    // not when it's merely scheduled - React StrictMode's dev-only double-
    // invoke (mount -> cleanup -> mount again) cancels the first timer via
    // the cleanup below; setting the flag up front here would have made
    // that cancelled attempt count as "done" and the second (real) mount
    // would then skip scheduling a new one entirely, so the greeting would
    // never actually appear.
    setIsGreetingTyping(true);
    const timer = setTimeout(() => {
      if (!isMountedRef.current) return;
      hasGreetedRef.current = true;
      setIsGreetingTyping(false);
      setMessages((prev) => [...prev, GREETING]);
    }, GREETING_TYPING_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;

    // Enter (handleKeyDown) reaches this directly, bypassing the Send
    // button's own `disabled` state - without this check here too, a
    // pasted over-limit message would silently do nothing on Enter with no
    // feedback at all.
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setNoticeText(`That's a bit long - please keep it under ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }

    const sessionId = getOrCreateChatSessionId();
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: trimmed };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setNoticeText(null);
    setIsSending(true);

    try {
      const response = await fetch('/.netlify/functions/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId })
      });

      if (!isMountedRef.current) return;

      if (response.status === 429) {
        setNoticeText("You're sending messages a bit fast - please wait a moment before trying again.");
        return;
      }

      if (!response.ok) {
        setNoticeText('Something went wrong sending that. Please try again in a moment.');
        return;
      }

      const data = await response.json();
      if (!isMountedRef.current) return;

      const replyText: string = typeof data.reply === 'string' ? data.reply : 'Sorry, I had trouble replying to that.';
      const productIds: string[] = Array.isArray(data.productIds)
        ? data.productIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: replyText, productIds }]);
    } catch {
      if (isMountedRef.current) {
        setNoticeText('Something went wrong sending that. Please try again in a moment.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  }, [inputValue, isSending]);

  // Same idea as clicking a search result: highlight + jump to it. On
  // mobile the chat sheet covers most of the screen, so there's nowhere
  // for "jump to it" to be visible unless the sheet closes first - on
  // desktop the storefront is already visible behind/beside the chat, so
  // it stays open and the jump happens immediately.
  const handleProductChipClick = useCallback(
    (product: Product) => {
      const isMobile = window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
      if (isMobile) {
        setIsOpen(false);
      }
      onProductSelect?.(product);
    },
    [onProductSelect]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  // Based on the trimmed length so this matches exactly what handleSend
  // itself checks - otherwise padding-only whitespace could show as "over
  // limit" here (button disabled, counter red) while Enter still sends
  // successfully, or vice versa.
  const trimmedLength = inputValue.trim().length;
  const isOverLimit = trimmedLength > MAX_MESSAGE_LENGTH;

  return (
    <>
      {/* Scoped to this component only - not a global stylesheet change.
          Applied inline (not a Tailwind class) to each message bubble below,
          so a freshly-mounted bubble (any new message, including the
          greeting once it's appended) plays this once on arrival. */}
      <style>{`
        @keyframes chatMessagePopIn {
          0% { opacity: 0; transform: scale(0.85) translateY(6px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Circular, same size/shape as the cart FAB (p-4, rounded-full,
          shadow-2xl, active:scale-95) - stacked directly above it in the
          same right-edge column. An AI-themed icon (Bot), not the site logo. */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        className="fixed bottom-24 right-6 z-[199] bg-surface-inverted text-text-inverted p-4 rounded-full shadow-lg hover:opacity-90 transition-all duration-300 active:scale-95"
      >
        {isOpen ? <X size={28} strokeWidth={1.5} /> : <Bot size={28} strokeWidth={1.5} />}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Chat with DC Library Assistant"
          className="fixed bottom-[168px] right-6 z-[198] w-[calc(100vw-3rem)] max-w-sm h-[70vh] max-h-[560px] flex flex-col rounded-sm border border-border-hairline bg-surface-secondary shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-hairline bg-surface">
            <div className="flex items-center gap-2">
              <Bot size={18} strokeWidth={1.5} className="text-text-primary" />
              <span className="f-body font-bold text-text-primary">DC Library Assistant</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-surface-secondary">
            {messages.map((msg) => {
              // getProductById never throws (falls back to a placeholder for
              // an unrecognized id - see constants.ts) but the server already
              // guarantees every id here is real, so this is just a lookup.
              const matchedProducts = (msg.productIds ?? [])
                .map((id) => getProductById(id))
                .filter((p): p is Product => Boolean(p));
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1.5 max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  <div
                    style={{ animation: 'chatMessagePopIn 0.25s ease-out' }}
                    className={`rounded-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                      msg.role === 'user'
                        ? 'bg-surface-inverted text-text-inverted'
                        : 'bg-surface text-text-primary border border-border-hairline'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {matchedProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductChipClick(product)}
                      style={{ animation: 'chatMessagePopIn 0.25s ease-out' }}
                      className="flex items-center gap-2 text-left text-xs font-medium px-3 py-2.5 rounded-sm border border-border-hairline bg-surface-secondary hover:border-border-strong hover:bg-surface transition-colors max-w-full"
                    >
                      <FileText size={14} strokeWidth={1.5} className="shrink-0 text-text-secondary" />
                      <span className="truncate text-text-primary">View: {product.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}

            {(isSending || isGreetingTyping) && <TypingIndicator />}

            {noticeText && (
              <div className="self-center text-xs text-text-secondary text-center px-2">{noticeText}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border-hairline bg-surface p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                rows={1}
                aria-label="Type your message"
                className="flex-1 resize-none bg-surface-secondary border border-border-hairline rounded-sm px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-border-strong transition-colors max-h-24"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputValue.trim() || isOverLimit || isSending}
                aria-label="Send message"
                className="flex items-center justify-center w-10 h-10 shrink-0 rounded-sm bg-surface-inverted text-text-inverted disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all"
              >
                <Send size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className={`mt-1.5 text-[11px] flex items-center justify-between ${isOverLimit ? 'text-red-400' : 'text-text-secondary'}`}>
              <span>AI-powered - anonymous session only, no personal data stored.</span>
              <span className="shrink-0 ml-2">{trimmedLength}/{MAX_MESSAGE_LENGTH}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
