
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

      <div className="reveal-stagger space-y-4">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className="rounded-sm overflow-hidden transition-all duration-300 border bg-surface-secondary border-border-hairline hover:border-border-strong card-elevated"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full px-6 py-5 lg:px-8 lg:py-7 flex items-center justify-between text-left group"
              >
                <span className="f-body font-medium transition-colors text-text-primary group-hover:text-text-primary/70">
                  {faq.question}
                </span>
                <ChevronDown
                  size={24}
                  strokeWidth={1.5}
                  className={`transition-transform duration-500 shrink-0 ml-4 ${
                    isOpen ? 'rotate-180 text-text-primary' : 'text-text-secondary'
                  }`}
                />
              </button>

              <div
                className={`transition-all duration-500 ease-in-out overflow-hidden ${
                  isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-6 pb-6 lg:px-8 lg:pb-8 pt-4 border-t border-border-hairline">
                  <p className="f-body leading-relaxed max-w-4xl text-text-secondary">
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
