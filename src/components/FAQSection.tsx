
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQS } from "../constants";
import { useScrollReveal } from '../lib/useScrollReveal';

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const revealRef = useScrollReveal<HTMLElement>();

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
          return (
            <div
              key={index}
              className={`relative rounded-sm border transition-colors duration-300 card-elevated ${
                isOpen ? 'z-20 bg-surface-inverted border-surface-inverted' : 'z-0 bg-surface-secondary border-border-hairline hover:border-border-strong'
              }`}
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full h-full px-6 py-5 lg:px-8 lg:py-7 flex items-center justify-between gap-4 text-left group"
              >
                <span
                  className={`f-body font-medium transition-colors duration-300 ${
                    isOpen ? 'text-text-inverted' : 'text-text-primary group-hover:text-text-primary/70'
                  }`}
                >
                  {faq.question}
                </span>
                <ChevronDown
                  size={24}
                  strokeWidth={1.5}
                  className={`transition-transform duration-500 shrink-0 ${
                    isOpen ? 'rotate-180 text-text-inverted' : 'text-text-secondary'
                  }`}
                />
              </button>

              {/* Absolutely positioned so the expanded answer overlaps the row
                  below instead of pushing it down - the grid's row height is
                  driven only by the in-flow button above, never by this. */}
              <div
                className={`absolute left-0 right-0 top-full overflow-hidden rounded-b-sm border-x border-b transition-all duration-500 ease-in-out shadow-xl ${
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
