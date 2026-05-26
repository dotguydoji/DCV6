
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
        {FAQS.map((faq, index) => (
          <div 
            key={index}
            className="border border-white/5 rounded-lg bg-[#333333] overflow-hidden transition-all duration-300 hover:border-brand-yellow/20"
          >
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-6 py-5 lg:px-8 lg:py-7 flex items-center justify-between text-left group"
            >
              <span className="f-body font-bold text-white group-hover:text-brand-yellow transition-colors">
                {faq.question}
              </span>
              <ChevronDown 
                size={24} 
                className={`text-brand-gray transition-transform duration-500 ${openIndex === index ? 'rotate-180 text-brand-yellow' : ''}`}
              />
            </button>
            
            <div 
              className={`transition-all duration-500 ease-in-out overflow-hidden ${
                openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-6 lg:px-8 lg:pb-8 border-t border-white/5 pt-4">
                <p className="f-body text-brand-gray/80 leading-relaxed max-w-4xl">
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
