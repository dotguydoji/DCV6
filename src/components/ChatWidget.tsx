import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { getOrCreateChatSessionId } from '../lib/chatbotSession';

const MAX_MESSAGE_LENGTH = 350;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
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
  <div className="self-start bg-gray-900 border border-gray-700 rounded-sm px-4 py-3.5 flex items-center gap-1.5">
    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
 * Colors deliberately stay outside the site's usual brand-yellow/#1a1d1e
 * palette - black, orange, white, and gray only, per design direction, so
 * the widget reads as its own distinct surface rather than blending into
 * the storefront theme.
 */
export const ChatWidget: React.FC = () => {
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

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: replyText }]);
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
        className="fixed bottom-24 right-6 z-[199] bg-orange-500 text-black p-4 rounded-full shadow-2xl hover:bg-orange-400 transition-all duration-300 active:scale-95"
      >
        {isOpen ? <X size={28} strokeWidth={2.5} /> : <Bot size={28} strokeWidth={2.5} />}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Chat with DC Library Assistant"
          className="fixed bottom-[168px] right-6 z-[198] w-[calc(100vw-3rem)] max-w-sm h-[70vh] max-h-[560px] flex flex-col rounded-sm border border-gray-700 bg-black shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800 bg-black">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-orange-500" />
              <span className="f-body font-bold text-white">DC Library Assistant</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-black">
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{ animation: 'chatMessagePopIn 0.25s ease-out' }}
                className={`max-w-[85%] rounded-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'self-end bg-orange-500 text-black'
                    : 'self-start bg-gray-900 text-white border border-gray-700'
                }`}
              >
                {msg.text}
              </div>
            ))}

            {(isSending || isGreetingTyping) && <TypingIndicator />}

            {noticeText && (
              <div className="self-center text-xs text-gray-400 text-center px-2">{noticeText}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-800 bg-black p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                rows={1}
                aria-label="Type your message"
                className="flex-1 resize-none bg-gray-900 border border-gray-700 rounded-sm px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-orange-500 transition-colors max-h-24"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputValue.trim() || isOverLimit || isSending}
                aria-label="Send message"
                className="flex items-center justify-center w-10 h-10 shrink-0 rounded-sm bg-orange-500 text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-400 transition-all"
              >
                <Send size={18} />
              </button>
            </div>
            <div className={`mt-1.5 text-[11px] flex items-center justify-between ${isOverLimit ? 'text-orange-500' : 'text-gray-500'}`}>
              <span>AI-powered - anonymous session only, no personal data stored.</span>
              <span className="shrink-0 ml-2">{trimmedLength}/{MAX_MESSAGE_LENGTH}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
