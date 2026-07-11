import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
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
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Admin recording mode (App.tsx) conditionally unmounts this component -
  // without this guard, a reply arriving after that toggle would call
  // setState on an unmounted component.
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

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
      {/* Logo only - no border, no background circle - stacked directly
          above the cart FAB (same right-edge column, bottom-24 sits just
          above the cart's bottom-6 + its own height). */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        className="fixed bottom-24 right-6 z-[199] w-14 h-14 flex items-center justify-center active:scale-95 transition-transform duration-200"
      >
        <img src="/favicon.svg" alt="" className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]" />
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
              <img src="/favicon.svg" alt="" className="w-5 h-5 object-contain" />
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
                className={`max-w-[85%] rounded-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'self-end bg-orange-500 text-black'
                    : 'self-start bg-gray-900 text-white border border-gray-700'
                }`}
              >
                {msg.text}
              </div>
            ))}

            {isSending && (
              <div className="self-start bg-gray-900 text-gray-400 border border-gray-700 rounded-sm px-3.5 py-2.5 text-sm">
                Typing…
              </div>
            )}

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
