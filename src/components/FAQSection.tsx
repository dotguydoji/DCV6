
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQS } from "../constants";
import { useScrollReveal } from '../lib/useScrollReveal';

// Must match the answer panel's `duration-500` transition below - keeps an
// item's "active" (dark/elevated) styling for exactly as long as its answer
// is actually still visible while collapsing, instead of the wrapper
// snapping back to closed styling/z-index the instant the collapse starts.
const ANSWER_TRANSITION_MS = 500;

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // The item (if any) currently mid fade-out - kept separate from
  // `openIndex` so its card can keep looking "open" for the full transition
  // instead of the closed styling/z-index snapping in immediately while the
  // answer is still visibly shrinking/fading over it.
  const [closingIndex, setClosingIndex] = useState<number | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealRef = useScrollReveal<HTMLElement>();

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleToggle = (index: number) => {
    const previousOpenIndex = openIndex;

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setOpenIndex(previousOpenIndex === index ? null : index);

    // Whatever was open before this click - itself if we just closed it, or
    // a different item if switching straight to another question - is now
    // fading out and needs to hold its "active" look until that finishes.
    if (previousOpenIndex !== null) {
      setClosingIndex(previousOpenIndex);
      closeTimeoutRef.current = setTimeout(() => {
        setClosingIndex(null);
        closeTimeoutRef.current = null;
      }, ANSWER_TRANSITION_MS);
    }
  };

  return (
    <section ref={revealRef} className="reveal mt-20 lg:mt-32">
      <div className="flex items-center gap-6 mb-10 lg:mb-16">
        <div className="h-[2px] bg-text-primary w-12 lg:w-20"></div>
        <h2 className="f-heading font-normal text-text-primary uppercase tracking-tighter">
          Frequently Asked
        </h2>
      </div>

      <div className="reveal-stagger space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-stretch">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          // Covers both "currently expanded" and "currently fading closed" -
          // driving the wrapper/button/chevron styling off this (instead of
          // isOpen alone) keeps the card looking/stacking as "open" for the
          // full 500ms collapse, so it never snaps back to closed z-index
          // (which let it render behind the item below mid-fade) or closed
          // colors (which showed as a mismatched border/bump against the
          // still-visible dark answer panel) while the answer is animating.
          const isActive = isOpen || closingIndex === index;
          return (
            <div
              key={index}
              className={`relative rounded-sm border transition-colors duration-300 card-elevated ${
                isActive ? 'z-20 bg-surface-inverted border-surface-inverted' : 'z-0 bg-surface-secondary border-border-hairline hover:border-border-strong'
              }`}
            >
              <button
                onClick={() => handleToggle(index)}
                className="w-full h-full px-6 py-5 lg:px-8 lg:py-7 flex items-center justify-between gap-4 text-left group"
              >
                <span
                  className={`f-body font-medium transition-colors duration-300 ${
                    isActive ? 'text-text-inverted' : 'text-text-primary group-hover:text-text-primary/70'
                  }`}
                >
                  {faq.question}
                </span>
                <ChevronDown
                  size={24}
                  strokeWidth={1.5}
                  className={`transition-transform duration-500 shrink-0 ${
                    isActive ? 'rotate-180 text-text-inverted' : 'text-text-secondary'
                  }`}
                />
              </button>

              {/* Absolutely positioned so the expanded answer overlaps the row
                  below instead of pushing it down - the grid's row height is
                  driven only by the in-flow button above, never by this.
                  `-inset-x-px` (not left-0/right-0) so this panel's own
                  border lands exactly on the wrapper's border line instead of
                  1px inside it - `left`/`right` on an absolutely positioned
                  element are measured from the containing block's *padding*
                  edge (inside its border), so left-0/right-0 here left this
                  answer panel narrower than the question above it by a
                  border-width on each side, reading as a small bump/step. */}
              <div
                className={`absolute -inset-x-px top-full overflow-hidden rounded-b-sm border-x border-b transition-all duration-500 ease-in-out shadow-xl ${
                  isOpen
                    ? 'max-h-96 opacity-100 bg-surface-inverted border-surface-inverted'
                    : 'max-h-0 opacity-0 border-transparent pointer-events-none'
                }`}
              >
                <div className="px-6 pb-6 lg:px-8 lg:pb-8 pt-4 border-t border-text-inverted/10">
                  <p className="f-body leading-relaxed max-w-4xl text-text-inverted/70">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
