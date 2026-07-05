
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQS } from "../constants";

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mt-20 lg:mt-32">
      <div className="flex items-center gap-6 mb-10 lg:mb-16">
        <div className="h-[2px] bg-brand-yellow w-12 lg:w-20"></div>
        <h2 className="f-heading font-black text-white uppercase tracking-tighter italic">
          Frequently Asked
        </h2>
      </div>

      <div className="space-y-4">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className={`rounded-lg overflow-hidden transition-all duration-300 border ${
                faq.isCourse
                  ? 'bg-[#e6ccb3] border-[#e6ccb3] hover:border-black/20'
                  : 'bg-[#34393a] border-white/5 hover:border-brand-yellow/20'
              }`}
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full px-6 py-5 lg:px-8 lg:py-7 flex items-center justify-between text-left group"
              >
                <span className={`f-body font-bold transition-colors ${
                  faq.isCourse
                    ? 'text-[#1a1d1e] group-hover:text-[#1a1d1e]/70'
                    : 'text-white group-hover:text-brand-yellow'
                }`}>
                  {faq.question}
                </span>
                <ChevronDown
                  size={24}
                  className={`transition-transform duration-500 shrink-0 ml-4 ${
                    faq.isCourse
                      ? isOpen ? 'rotate-180 text-[#1a1d1e]/60' : 'text-[#1a1d1e]/50'
                      : isOpen ? 'rotate-180 text-brand-yellow' : 'text-brand-gray'
                  }`}
                />
              </button>

              <div
                className={`transition-all duration-500 ease-in-out overflow-hidden ${
                  isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className={`px-6 pb-6 lg:px-8 lg:pb-8 pt-4 border-t ${
                  faq.isCourse ? 'border-black/15' : 'border-white/5'
                }`}>
                  <p className={`f-body leading-relaxed max-w-4xl ${
                    faq.isCourse ? 'text-[#1a1d1e]/80' : 'text-brand-muted'
                  }`}>
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
